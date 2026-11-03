import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { MissionControlStore } from "../src/missionControlStore.mjs";
import { MissionControlFinance } from "../src/financialGovernance.mjs";
import { receiveClosedAcquisition } from "../src/missionControlIntake.mjs";
import { createMissionControlHandoffHandler } from "../src/missionControlHttpReceiver.mjs";
import { buildLenderPackage, verifyLenderPackage } from "../src/operationsCompletion.mjs";

// U5R delta tests — QUINCEY's open-scope findings M-1 (MEDIUM) and
// L-1 / L-2 (LOW) from QUINCEY-CERTIFICATION.md, probed the way he
// probed them: manufactured rows are written by raw SQL, outside
// every governed path, and must move no read sum.
//
// Fixtures mirror tests/financial-governance.test.mjs (same payload,
// same project drive to in_progress): budget 50000 + 10% contingency
// (authority 55000), Acme bid 48000 committed, progress at 50% —
// earned-value headroom 48000 * 50% * (1 - 10%) = 21600.

const PM = "pm-1";
const BOSS = "boss-1";
const ADMIN = "admin-1";
const CLERK = "clerk-1";

function payload(opportunityId = "opp-fin") {
  return {
    contractVersion: "1.0",
    sourceSystem: "pipeline",
    targetSystem: "mission-control",
    opportunityId,
    opportunityCode: `OCG-${opportunityId}`,
    propertyId: `property-${opportunityId}`,
    address: "100 Governance Way",
    closedAt: "2026-09-25T16:00:00Z",
    acquisition: { purchasePrice: 150000, earnestMoney: 1000, strategyType: "cash_purchase", offerId: "offer-1", offerVersionId: "version-1" },
    underwriting: { sourceSystem: "deal-scout", sourceUnderwritingId: "victor-1", arv: 260000, rehab: 48000, mao: 160000, confidence: 0.9, limitations: null },
    renovationSeed: { budgetBaseline: 48000, scopeStatus: "needs_field_validation", projectStatus: "intake_ready" }
  };
}

function openDb(t) {
  const dir = mkdtempSync(join(tmpdir(), "mc-u5r-"));
  const path = join(dir, "mission-control.db");
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return { path, open: () => new MissionControlStore(path) };
}

function setupProject(store, { handoffId = "handoff-u5r" } = {}) {
  const { project } = receiveClosedAcquisition({ handoffId, payload: payload(handoffId), repository: store.intakeRepository() });
  const workflow = store.restoreWorkflow(project.id);
  workflow.validateScope({ items: [
    { title: "Roof replacement", category: "exterior", estimatedCost: 12000 },
    { title: "Kitchen remodel", category: "interior", estimatedCost: 30000 },
  ] });
  workflow.approveBudget({ amount: 50000, contingencyPct: 10, rationale: "Baselines verified" });
  const bid = workflow.addBid({ contractor: "Acme Builders", amount: 48000, days: 45 });
  workflow.selectBid({ bidId: bid.id, rationale: "Best coverage within authority" });
  workflow.scheduleWork({ startAt: "2026-10-01T08:00:00Z", targetCompleteAt: "2026-11-15T17:00:00Z" });
  workflow.startWork({ startedAt: "2026-10-01T08:05:00Z" });
  store.persistWorkflow(workflow);
  const operations = store.restoreOperations(workflow);
  operations.recordProgress({ percentComplete: 50, evidenceRefs: ["evidence://progress-50"], note: "Roof done, kitchen framed" });
  store.persistOperations(operations);
  return { project };
}

function setupFinance(store) {
  const finance = new MissionControlFinance(store);
  const t = store.defaultTenantId;
  finance.setActorRole({ tenantId: t, actorId: PM, role: "operator" });
  finance.setActorRole({ tenantId: t, actorId: BOSS, role: "approver" });
  finance.setActorRole({ tenantId: t, actorId: ADMIN, role: "admin" });
  finance.setActorRole({ tenantId: t, actorId: CLERK, role: "operator" });
  return finance;
}

/** Project + governed-approved invoice (12000) + draw approved for 5000. */
function approvedDrawScenario(store) {
  const { project } = setupProject(store);
  const finance = setupFinance(store);
  const invoice = finance.submitInvoice({
    projectId: project.id, actor: PM, contractor: "Acme Builders", externalNumber: "INV-Q1",
    lineItems: [{ description: "Roofing labor and materials", amount: 12000 }],
    evidenceRefs: ["evidence://inv-q1"],
  });
  finance.reviewInvoice({ projectId: project.id, actor: BOSS, invoiceId: invoice.id, decision: "approved", rationale: "Verified against scope" });
  const { draw } = finance.requestDraw({
    projectId: project.id, actor: PM, amount: 5000, percentComplete: 50,
    evidenceRefs: ["evidence://progress-50"], invoiceIds: [invoice.id], reason: "Roof complete",
  });
  finance.decideDraw({ projectId: project.id, actor: BOSS, drawId: draw.id, decision: "approved", rationale: "Evidence verified" });
  return { project, finance, invoice, draw };
}

function forgePayment(store, { projectId, drawId, amount, ref }) {
  const id = randomUUID();
  store.db.prepare("INSERT INTO payments (id, tenant_id, project_id, draw_id, amount, payment_ref, method, recorded_by, paid_at, idempotency_key, created_at) VALUES (?, ?, ?, ?, ?, ?, 'ach', 'mallory', '2026-10-21T00:00:00Z', NULL, '2026-10-21T00:00:00Z')")
    .run(id, store.defaultTenantId, projectId, drawId, amount, ref);
  return id;
}

function forgeReconciliation(store, { projectId, paymentId, amount }) {
  const id = randomUUID();
  store.db.prepare("INSERT INTO reconciliations (id, tenant_id, project_id, payment_id, caller_record_json, caller_amount, payment_amount, state, source, bank_verified, recorded_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'reconciled', 'caller_reported', 0, 'mallory', '2026-10-21T00:00:00Z')")
    .run(id, store.defaultTenantId, projectId, paymentId, JSON.stringify({ amount, reference: "stmt-forged" }), amount, amount);
  return id;
}

test("M-1: a payment row written by direct ledger registration moves no read sum and is surfaced as orphaned", (t) => {
  const { open } = openDb(t);
  const store = open();
  const { project, finance, draw } = approvedDrawScenario(store);
  assert.equal(finance.getDrawFinancials(draw.id).approved, 5000);

  // one governed payment of 2000, then QUINCEY's probe: a raw-SQL
  // payment of 7777 against the 5000-approved draw, no audit event.
  finance.recordPayment({ projectId: project.id, actor: CLERK, drawId: draw.id, amount: 2000, paymentRef: "ACH-Q1", method: "ach" });
  const forgedId = forgePayment(store, { projectId: project.id, drawId: draw.id, amount: 7777, ref: "FORGED-1" });

  // the row exists as a record (visible, detectable) but counts nowhere
  assert.equal(finance.listPayments(project.id).length, 2);
  assert.equal(finance.isGovernedPayment(finance.getPayment(forgedId)), false);
  assert.deepEqual(finance.getDrawFinancials(draw.id), { drawId: draw.id, approved: 5000, allocated: 5000, paid: 2000, reconciled: 0, outstanding: 3000 });
  assert.deepEqual(finance.getProjectFinancials(project.id), { projectId: project.id, approved: 5000, allocated: 5000, paid: 2000, reconciled: 0 });

  // the exclusion is never silent
  const orphaned = finance.orphanedFinancialRows(project.id);
  assert.equal(orphaned.orphanedPayments, 1);
  assert.deepEqual(orphaned.paymentIds, [forgedId]);
  assert.equal(orphaned.orphanedReconciliations, 0);

  // the forgery wrote no audit event, so the chain itself still verifies
  assert.equal(finance.verifyAuditChain(project.id), true);
  store.close();
});

test("M-1: a forged 'reconciled' reconciliation moves no reconciled sum and is surfaced as orphaned", (t) => {
  const { open } = openDb(t);
  const store = open();
  const { project, finance, draw } = approvedDrawScenario(store);

  const { payment: pay1 } = finance.recordPayment({ projectId: project.id, actor: CLERK, drawId: draw.id, amount: 2000, paymentRef: "ACH-Q2A", method: "ach" });
  finance.recordReconciliation({ projectId: project.id, actor: CLERK, paymentId: pay1.id, bankRecord: { amount: 2000, reference: "stmt-line-1", date: "2026-10-20" } });
  const { payment: pay2 } = finance.recordPayment({ projectId: project.id, actor: CLERK, drawId: draw.id, amount: 1500, paymentRef: "ACH-Q2B", method: "ach" });
  assert.equal(finance.getDrawFinancials(draw.id).reconciled, 2000);

  // raw-SQL reconciliation claiming pay2 is bank-reconciled; no
  // reconciliation_recorded audit event corroborates it.
  const forgedId = forgeReconciliation(store, { projectId: project.id, paymentId: pay2.id, amount: 1500 });

  assert.equal(finance.listReconciliations(project.id).length, 2);
  assert.deepEqual(finance.getDrawFinancials(draw.id), { drawId: draw.id, approved: 5000, allocated: 5000, paid: 3500, reconciled: 2000, outstanding: 1500 });
  assert.equal(finance.getProjectFinancials(project.id).reconciled, 2000);

  const orphaned = finance.orphanedFinancialRows(project.id);
  assert.equal(orphaned.orphanedPayments, 0);
  assert.equal(orphaned.orphanedReconciliations, 1);
  assert.deepEqual(orphaned.reconciliationIds, [forgedId]);
  store.close();
});

test("M-1: lender package totals exclude forged rows", (t) => {
  const { open } = openDb(t);
  const store = open();
  const { project, finance, draw } = approvedDrawScenario(store);
  finance.recordPayment({ projectId: project.id, actor: CLERK, drawId: draw.id, amount: 2000, paymentRef: "ACH-Q3", method: "ach" });
  forgePayment(store, { projectId: project.id, drawId: draw.id, amount: 7777, ref: "FORGED-3" });

  const pkg = buildLenderPackage(store, store.defaultTenantId, project.id, draw.id);
  assert.equal(pkg.payments.totalPaid, 2000);
  assert.equal(pkg.payments.records.length, 1);
  assert.equal(pkg.payments.records[0].paymentRef, "ACH-Q3");
  assert.equal(pkg.drawFinancials.paid, 2000);
  assert.equal(pkg.projectFinancials.paid, 2000);
  assert.equal(verifyLenderPackage(pkg), true);
  store.close();
});

test("M-1: a legitimate payment still counts after restart; the forged row stays excluded", (t) => {
  const { path, open } = openDb(t);
  let store = open();
  const { project, finance, draw } = approvedDrawScenario(store);
  finance.recordPayment({ projectId: project.id, actor: CLERK, drawId: draw.id, amount: 2000, paymentRef: "ACH-Q4", method: "ach" });
  const forgedId = forgePayment(store, { projectId: project.id, drawId: draw.id, amount: 7777, ref: "FORGED-4" });
  store.close();

  store = open();
  const reopened = new MissionControlFinance(store);
  assert.equal(reopened.getDrawFinancials(draw.id).paid, 2000);
  assert.equal(reopened.getProjectFinancials(project.id).paid, 2000);
  assert.equal(reopened.verifyAuditChain(project.id), true);
  const orphaned = reopened.orphanedFinancialRows(project.id);
  assert.equal(orphaned.orphanedPayments, 1);
  assert.deepEqual(orphaned.paymentIds, [forgedId]);
  store.close();
});

test("L-1: non-number draw amounts are refused at the governance boundary; strings keep their pinned refusals", (t) => {
  const { open } = openDb(t);
  const store = open();
  const { project } = setupProject(store);
  const finance = setupFinance(store);
  const invoice = finance.submitInvoice({
    projectId: project.id, actor: PM, contractor: "Acme Builders", externalNumber: "INV-Q5",
    lineItems: [{ description: "Roofing", amount: 12000 }], evidenceRefs: ["evidence://inv-q5"],
  });
  finance.reviewInvoice({ projectId: project.id, actor: BOSS, invoiceId: invoice.id, decision: "approved", rationale: "Verified" });

  const attempt = (amount) => () => finance.requestDraw({ projectId: project.id, actor: PM, amount, percentComplete: 50, evidenceRefs: ["evidence://progress-50"], invoiceIds: [invoice.id], reason: "Boundary probe" });
  // QUINCEY's probe: boolean true coerced to a $1 draw through the
  // baseline domain's Number() helper. Now refused, like every
  // non-number exotic that coerces to a plausible figure.
  assert.throws(attempt(true), /invalid_amount/);
  assert.throws(attempt([5000]), /invalid_amount/);
  assert.throws(attempt({ valueOf: () => 5000 }), /invalid_amount/);
  // regressions: the U4R2 / E5 string pins are unchanged
  assert.throws(attempt("5000"), /invalid_amount/);
  assert.throws(attempt("abc"), /invalid_number/);
  assert.equal(finance.listDraws(project.id).length, 0);
  // positive control: a real number still requests a draw
  const { draw } = attempt(5000)();
  assert.equal(draw.status, "pending");
  assert.equal(finance.listDraws(project.id).length, 1);
  store.close();
});

// --- L-2: the handoff receiver's body reader is stream-capped ---------

const HANDOFF_PAYLOAD = { contractVersion: "1.0", sourceSystem: "pipeline", targetSystem: "mission-control", opportunityId: "opp-q6", closedAt: "2026-09-25T16:00:00Z", acquisition: { purchasePrice: 145000, strategyType: "cash_purchase" }, underwriting: { sourceSystem: "deal-scout", sourceUnderwritingId: "victor-1", arv: 235000, rehab: 30000, mao: 155000, confidence: 0.9 }, renovationSeed: { scopeStatus: "needs_field_validation", projectStatus: "intake_ready", budgetBaseline: 30000 } };

function memoryRepo() {
  const rows = new Map();
  return { findBySourceHandoffId: id => [...rows.values()].find(x => x.sourceHandoffId === id) || null, insert: p => { rows.set(p.id, p); return p; } };
}

async function startReceiver(handler) {
  const server = createServer(async (req, res) => { if (!await handler(req, res)) { res.writeHead(404); res.end(); } });
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  return { server, base: `http://127.0.0.1:${server.address().port}` };
}

function postHandoff(base, body, secret = "top-secret") {
  return fetch(`${base}/api/v1/integrations/pipeline/acquisition-handoff`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${secret}` },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

test("L-2: an over-cap handoff body is refused 413 body_too_large; a valid handoff still lands", async (t) => {
  // explicit small cap via the factory option
  const handler = createMissionControlHandoffHandler({ repository: memoryRepo(), secret: "top-secret", maxBodyBytes: 1024 });
  const { server, base } = await startReceiver(handler);
  t.after(() => server.close());

  const oversized = JSON.stringify({ handoffId: "handoff-big", payload: HANDOFF_PAYLOAD, pad: "x".repeat(4096) });
  const refused = await postHandoff(base, oversized);
  assert.equal(refused.status, 413);
  assert.equal((await refused.json()).error, "body_too_large");

  // existing behavior is otherwise identical: 201 first delivery,
  // 200 duplicate on replay
  const created = await postHandoff(base, { handoffId: "handoff-q6", payload: HANDOFF_PAYLOAD });
  assert.equal(created.status, 201);
  const replay = await postHandoff(base, { handoffId: "handoff-q6", payload: HANDOFF_PAYLOAD });
  assert.equal(replay.status, 200);
  assert.equal((await replay.json()).data.duplicate, true);

  // the default cap (1 MiB) applies with no option and no env override
  const defaultHandler = createMissionControlHandoffHandler({ repository: memoryRepo(), secret: "top-secret" });
  const second = await startReceiver(defaultHandler);
  t.after(() => second.server.close());
  const overDefault = JSON.stringify({ handoffId: "handoff-huge", payload: HANDOFF_PAYLOAD, pad: "x".repeat(1024 * 1024 + 1024) });
  const refusedDefault = await postHandoff(second.base, overDefault);
  assert.equal(refusedDefault.status, 413);
  assert.equal((await refusedDefault.json()).error, "body_too_large");
});
