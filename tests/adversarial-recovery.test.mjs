import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MissionControlStore } from "../src/missionControlStore.mjs";
import { MissionControlFinance } from "../src/financialGovernance.mjs";
import { MissionControlOperationsCompletion } from "../src/operationsCompletion.mjs";
import { receiveClosedAcquisition } from "../src/missionControlIntake.mjs";

// ADVERSARIAL FAMILY A — recovery (§7): kill-point recovery at every step
// boundary of the full §4 sequence, corrupt-DB handling, backup/restore.

const PM = "pm-1";
const BOSS = "boss-1";

function payload(id) {
  return {
    contractVersion: "1.0", sourceSystem: "pipeline", targetSystem: "mission-control",
    opportunityId: id, opportunityCode: `OCG-${id}`, propertyId: `property-${id}`, address: "100 Recovery Rd",
    closedAt: "2026-09-25T16:00:00Z",
    acquisition: { purchasePrice: 150000, earnestMoney: 1000, strategyType: "cash_purchase", offerId: "offer-1", offerVersionId: "version-1" },
    underwriting: { sourceSystem: "deal-scout", sourceUnderwritingId: "victor-1", arv: 260000, rehab: 48000, mao: 160000, confidence: 0.9, limitations: null },
    renovationSeed: { budgetBaseline: 48000, scopeStatus: "needs_field_validation", projectStatus: "intake_ready" }
  };
}

function tempDir(t) {
  const dir = mkdtempSync(join(tmpdir(), "mc-adv-a-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function openCtx(path) {
  const store = new MissionControlStore(path);
  const finance = new MissionControlFinance(store);
  finance.setActorRole({ actorId: PM, role: "operator" });
  finance.setActorRole({ actorId: BOSS, role: "approver" });
  return { path, store, finance, ops: new MissionControlOperationsCompletion(store), project: null, ids: {} };
}

// The 12 steps of the §4 sequence, each independently resumable.
const STEPS = [
  { name: "01-intake", run(ctx) {
    const { project } = receiveClosedAcquisition({ handoffId: "handoff-adv-a", payload: payload("opp-adv-a"), repository: ctx.store.intakeRepository() });
    ctx.project = project;
  } },
  { name: "02-validate-scope", run(ctx) {
    const wf = ctx.store.restoreWorkflow(ctx.project.id);
    wf.validateScope({ items: [
      { title: "Roof replacement", category: "exterior", estimatedCost: 12000 },
      { title: "Kitchen remodel", category: "interior", estimatedCost: 30000 },
    ] });
    ctx.store.persistWorkflow(wf);
  } },
  { name: "03-approve-budget", run(ctx) {
    const wf = ctx.store.restoreWorkflow(ctx.project.id);
    wf.approveBudget({ amount: 50000, contingencyPct: 10, rationale: "Baselines verified" });
    ctx.store.persistWorkflow(wf);
  } },
  { name: "04-select-bid", run(ctx) {
    const wf = ctx.store.restoreWorkflow(ctx.project.id);
    const bid = wf.addBid({ contractor: "Acme Builders", amount: 48000, days: 45 });
    wf.selectBid({ bidId: bid.id, rationale: "Best coverage within authority" });
    ctx.store.persistWorkflow(wf);
  } },
  { name: "05-schedule", run(ctx) {
    const wf = ctx.store.restoreWorkflow(ctx.project.id);
    wf.scheduleWork({ startAt: "2026-10-01T08:00:00Z", targetCompleteAt: "2026-11-15T17:00:00Z" });
    ctx.store.persistWorkflow(wf);
  } },
  { name: "06-start-work", run(ctx) {
    const wf = ctx.store.restoreWorkflow(ctx.project.id);
    wf.startWork({ startedAt: "2026-10-01T08:05:00Z" });
    ctx.store.persistWorkflow(wf);
  } },
  { name: "07-record-progress", run(ctx) {
    const wf = ctx.store.restoreWorkflow(ctx.project.id);
    const operations = ctx.store.restoreOperations(wf);
    operations.recordProgress({ percentComplete: 50, evidenceRefs: ["evidence://progress-50"], note: "Roof done" });
    ctx.store.persistOperations(operations);
  } },
  { name: "08-submit-invoice", run(ctx) {
    const invoice = ctx.finance.submitInvoice({ projectId: ctx.project.id, actor: PM, contractor: "Acme Builders", externalNumber: "INV-A", lineItems: [{ description: "Roofing", amount: 15000 }], evidenceRefs: ["evidence://inv-a"] });
    ctx.ids.invoiceId = invoice.id;
  } },
  { name: "09-approve-invoice", run(ctx) {
    ctx.finance.reviewInvoice({ projectId: ctx.project.id, actor: BOSS, invoiceId: ctx.ids.invoiceId, decision: "approved", rationale: "Verified" });
  } },
  { name: "10-request-draw", run(ctx) {
    const { draw } = ctx.finance.requestDraw({ projectId: ctx.project.id, actor: PM, amount: 14000, percentComplete: 50, evidenceRefs: ["evidence://progress-50"], invoiceIds: [ctx.ids.invoiceId], reason: "Roof complete", idempotencyKey: "adv-a-draw" });
    ctx.ids.drawId = draw.id;
  } },
  { name: "11-decide-draw", run(ctx) {
    ctx.finance.decideDraw({ projectId: ctx.project.id, actor: BOSS, drawId: ctx.ids.drawId, decision: "approved", rationale: "Evidence verified" });
  } },
  { name: "12-pay-and-reconcile", run(ctx) {
    const { payment } = ctx.finance.recordPayment({ projectId: ctx.project.id, actor: PM, drawId: ctx.ids.drawId, amount: 14000, paymentRef: "ACH-ADV-A", idempotencyKey: "adv-a-pay" });
    ctx.finance.recordReconciliation({ projectId: ctx.project.id, actor: PM, paymentId: payment.id, bankRecord: { amount: 14000, reference: "stmt-a" } });
  } },
];

/** Full observable state of the sequence, as persisted (same DB -> exact). */
function capture(ctx) {
  const wf = ctx.store.restoreWorkflow(ctx.project.id);
  const opsState = ctx.store.loadOperationsState(ctx.project.id);
  const fin = ctx.finance;
  return {
    workflow: wf.snapshot(),
    operations: opsState ? opsState.state : null,
    operationsVersion: opsState ? opsState.version : 0,
    financials: fin.getProjectFinancials(ctx.project.id),
    invoices: fin.listInvoices(ctx.project.id).map(i => ({ status: i.status, total: i.total, version: i.version })),
    draws: fin.listDraws(ctx.project.id).map(d => ({ status: d.status, requestedAmount: d.requestedAmount, approvedAmount: d.approvedAmount })),
    payments: fin.listPayments(ctx.project.id).map(p => ({ amount: p.amount, paymentRef: p.paymentRef })),
    reconciliations: fin.listReconciliations(ctx.project.id).map(r => ({ state: r.state, callerAmount: r.callerAmount, paymentAmount: r.paymentAmount, bankVerified: r.bankVerified })),
    auditTypes: fin.listAudit(ctx.project.id).map(r => r.event_type),
    auditOk: fin.verifyAuditChain(ctx.project.id),
  };
}

/** Id/timestamp-free projection: comparable across two independent runs. */
function projection(ctx) {
  const c = capture(ctx);
  const { projectId: _pid, ...financials } = c.financials; // random per run; identity, not state
  return {
    stage: c.workflow.project.stage,
    scopeStatus: c.workflow.project.scopeStatus,
    budgetStatus: c.workflow.project.budgetStatus,
    approvedBudget: c.workflow.project.approvedBudget,
    contingencyPct: c.workflow.project.contingencyPct,
    budget: c.workflow.budget,
    scopeCount: c.workflow.scopeItems.length,
    bidCount: c.workflow.bids.length,
    progress: c.operations ? c.operations.progressUpdates.map(p => p.percentComplete) : [],
    financials,
    invoices: c.invoices,
    draws: c.draws,
    payments: c.payments,
    reconciliations: c.reconciliations,
    auditTypes: c.auditTypes,
    auditOk: c.auditOk,
  };
}

function finishLifecycle(ctx) {
  let wf = ctx.store.restoreWorkflow(ctx.project.id);
  wf.enterPunchList({ items: [{ title: "Final touch-up" }] });
  ctx.store.persistWorkflow(wf);
  wf = ctx.store.restoreWorkflow(ctx.project.id);
  const punchId = wf.punchItems[0].id;
  wf.completePunchItem({ punchItemId: punchId, evidenceRef: "evidence://punch-done" });
  ctx.store.persistWorkflow(wf);
  ctx.ops.completeProject({ projectId: ctx.project.id, actor: PM, finalSpend: 49500, completionEvidenceRef: "evidence://completion" });
  wf = ctx.store.restoreWorkflow(ctx.project.id);
  wf.markExitReady({ decision: "sell", rationale: "Committee directed" });
  ctx.store.persistWorkflow(wf);
  const operations = ctx.store.restoreOperations(wf);
  const pkg = operations.exitPackage();
  // generatedAt / completedAt are wall-clock stamps of the run itself,
  // not sequence state — two honest runs differ there and only there.
  const { generatedAt, completedAt, ...rest } = pkg;
  return rest;
}

function runSteps(ctx, steps) { for (const step of steps) step.run(ctx); }

/** Re-point a freshly opened ctx at the project + entity ids on disk. */
function rehydrate(ctx) {
  ctx.project = ctx.store.listProjects()[0] || null;
  if (ctx.project) {
    ctx.ids.invoiceId = ctx.finance.listInvoices(ctx.project.id)[0]?.id;
    ctx.ids.drawId = ctx.finance.listDraws(ctx.project.id)[0]?.id;
  }
  return ctx;
}

test("A1: close/reopen at EVERY one of the 12 step boundaries — state is byte-identical after each reopen and the sequence completes", (t) => {
  const dir = tempDir(t);
  const path = join(dir, "walk.db");
  let ctx = openCtx(path);
  for (const step of STEPS) {
    step.run(ctx);
    const before = capture(ctx);
    const carry = { project: ctx.project, ids: ctx.ids };
    ctx.store.close();
    ctx = openCtx(path);
    ctx.project = carry.project;
    ctx.ids = carry.ids;
    const after = capture(ctx);
    assert.deepEqual(after, before, `persisted state diverged across a reopen after step ${step.name}`);
  }
  const exitPkg = finishLifecycle(ctx);
  assert.equal(exitPkg.projectId, ctx.project.id);
  assert.equal(exitPkg.approvedDraws, 14000);
  assert.equal(exitPkg.committedCost, 48000);
  assert.equal(exitPkg.finalSpend, 49500);
  ctx.store.close();
});

test("A2: a restart-at-every-step run ends indistinguishable from a no-restart control run", (t) => {
  const dir = tempDir(t);
  // control: no restarts
  const control = openCtx(join(dir, "control.db"));
  runSteps(control, STEPS);
  const controlProjection = projection(control);
  const controlExit = finishLifecycle(control);
  control.store.close();
  // walk: reopen after every step
  let walk = openCtx(join(dir, "walk.db"));
  for (const step of STEPS) {
    step.run(walk);
    const carry = { project: walk.project, ids: walk.ids };
    walk.store.close();
    walk = openCtx(join(dir, "walk.db"));
    walk.project = carry.project;
    walk.ids = carry.ids;
  }
  const walkProjection = projection(walk);
  const walkExit = finishLifecycle(walk);
  walk.store.close();
  assert.deepEqual(walkProjection, controlProjection);
  const { projectId: _w, ...walkExitState } = walkExit;
  const { projectId: _c, ...controlExitState } = controlExit;
  assert.deepEqual(walkExitState, controlExitState);
});

test("A3: a corrupt (garbage) database file fails loudly and is NOT reinitialized over the data", (t) => {
  const dir = tempDir(t);
  const path = join(dir, "garbage.db");
  const garbage = Buffer.from("this is definitely not a sqlite database file, just text padding to be long enough........");
  writeFileSync(path, garbage);
  assert.throws(() => new MissionControlStore(path), /file is not a database/);
  // the store refused: the bytes on disk are exactly what was there
  assert.ok(readFileSync(path).equals(garbage), "corrupt file must be left untouched");
});

test("A4: a truncated database file fails loudly and is left untouched; a zero-byte file is a legitimately fresh DB", (t) => {
  const dir = tempDir(t);
  const realPath = join(dir, "real.db");
  const store = new MissionControlStore(realPath);
  const { project } = receiveClosedAcquisition({ handoffId: "h-trunc", payload: payload("opp-trunc"), repository: store.intakeRepository() });
  store.close();
  const full = readFileSync(realPath);
  assert.ok(full.length > 1000);
  const truncPath = join(dir, "trunc.db");
  writeFileSync(truncPath, full.subarray(0, 100));
  assert.throws(() => new MissionControlStore(truncPath), /malformed/);
  assert.equal(readFileSync(truncPath).length, 100, "truncated file must not be overwritten or extended");

  // characterization: a zero-byte file is how SQLite represents an empty
  // database — it opens fresh and works (it held no data to lose).
  const emptyPath = join(dir, "empty.db");
  writeFileSync(emptyPath, "");
  const fresh = new MissionControlStore(emptyPath);
  assert.equal(fresh.schemaVersion(), 4);
  const seeded = receiveClosedAcquisition({ handoffId: "h-empty", payload: payload("opp-empty"), repository: fresh.intakeRepository() });
  fresh.close();
  const reopened = new MissionControlStore(emptyPath);
  assert.equal(reopened.getProject(seeded.project.id).sourceHandoffId, "h-empty");
  assert.equal(project.id.length > 0, true);
  reopened.close();
});

test("A5: backup/restore — a file copy taken mid-lifecycle restores and completes identically", (t) => {
  const dir = tempDir(t);
  const mainPath = join(dir, "main.db");
  const backupPath = join(dir, "backup.db");
  let main = openCtx(mainPath);
  runSteps(main, STEPS.slice(0, 11)); // through the draw decision
  main.store.close();
  copyFileSync(mainPath, backupPath);

  // the original continues to completion
  main = rehydrate(openCtx(mainPath));
  runSteps(main, STEPS.slice(11));
  const mainProjection = projection(main);
  const mainExit = finishLifecycle(main);
  main.store.close();

  // the restored copy sits exactly at the copy point, then completes the same way
  const restored = rehydrate(openCtx(backupPath));
  assert.deepEqual(restored.finance.getProjectFinancials(restored.project.id), { projectId: restored.project.id, approved: 14000, allocated: 14000, paid: 0, reconciled: 0 });
  assert.equal(restored.finance.verifyAuditChain(restored.project.id), true);
  runSteps(restored, STEPS.slice(11));
  assert.deepEqual(projection(restored), mainProjection);
  assert.deepEqual(finishLifecycle(restored), mainExit);
  restored.store.close();
});
