/**
 * RECONCILIATION PORTS (founder directive 2026-11-04 §4; MATRIX-A rows
 * 5.2 / 6.1 / 6.2 / 6.3, MATRIX-B PRESERVE-1 + PRESERVE-3).
 *
 * These tests were written FIRST, against the unmodified PR #4 tree,
 * where every port assertion failed (Step-0 evidence in
 * PORT-P1-RECORD.md). They encode the DESKTOP implementation's
 * verified behavior, ported into PR #4's governance layer:
 *
 *   P-6.1  a draw's claimed percentComplete may not exceed the latest
 *          RECORDED progress percent; no recorded progress → no draw.
 *   P-6.2  every draw evidence ref must be evidence actually recorded
 *          on the project's progress updates.
 *   P-6.3  at DECISION time the earned-value ceiling is re-derived
 *          from current state: two pending draws cannot both be
 *          approved past committed × pct × (1 − retainage).
 *   P-5.2  invoice duplicate detection keys on a NORMALIZED
 *          contractor identity (trim / case-fold / whitespace
 *          collapse), not the raw spelling.
 *   P-B3   a read-only, set-based reconciliation breakdown against
 *          caller-supplied bank records: matched / amount_mismatch /
 *          unmatched_bank / unmatched_ledger, every bank-side figure
 *          labeled caller_reported, bankVerified never true.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MissionControlStore } from "../src/missionControlStore.mjs";
import { MissionControlFinance } from "../src/financialGovernance.mjs";
import { createMissionControlServer } from "../src/missionControlServer.mjs";
import { receiveClosedAcquisition } from "../src/missionControlIntake.mjs";

const PM = "pm-1";
const BOSS = "boss-1";
const ADMIN = "admin-1";
const CLERK = "clerk-1";

function payload(opportunityId = "opp-port") {
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
  const dir = mkdtempSync(join(tmpdir(), "mc-port-"));
  const path = join(dir, "mission-control.db");
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return { path, open: () => new MissionControlStore(path) };
}

/**
 * Standard fixture (mirrors financial-governance.test.mjs): budget
 * 50000 + 10% contingency (authority 55000, non-binding for these
 * probes), Acme bid 48000 committed, work in progress. Earned ceiling
 * at 50% with 10% retainage: 48000 × 0.5 × 0.9 = 21600.
 * progress: 50 records 50% with evidence://progress-50; null persists
 * an operations state with NO progress ever recorded.
 */
function setupProject(store, { handoffId = "handoff-port", progress = 50 } = {}) {
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
  if (progress != null) {
    operations.recordProgress({ percentComplete: progress, evidenceRefs: ["evidence://progress-50"], note: "Roof done, kitchen framed" });
  }
  store.persistOperations(operations);
  return { project, workflow };
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

function submitAndApproveInvoice(finance, { projectId, number = "INV-PORT", total = 45000, contractor = "Acme Builders" }) {
  const invoice = finance.submitInvoice({
    projectId, actor: PM, contractor, externalNumber: number,
    lineItems: [{ description: "Roofing and kitchen work", amount: total }],
    evidenceRefs: [`evidence://invoice-${number}`],
  });
  finance.reviewInvoice({ projectId, actor: BOSS, invoiceId: invoice.id, decision: "approved", rationale: "Verified against scope" });
  return finance.getInvoice(invoice.id);
}

// --- P-6.1: draw percentage must be backed by recorded progress ------

test("P-6.1a: a draw claiming 100% against 50% recorded progress is refused", (t) => {
  const { open } = openDb(t);
  const store = open();
  const { project } = setupProject(store);
  const finance = setupFinance(store);
  const invoice = submitAndApproveInvoice(finance, { projectId: project.id });
  assert.throws(
    () => finance.requestDraw({ projectId: project.id, actor: PM, amount: 10000, percentComplete: 100, evidenceRefs: ["evidence://progress-50"], invoiceIds: [invoice.id], reason: "Claiming double the verified work" }),
    /draw_exceeds_verified_progress/,
  );
  assert.equal(finance.listDraws(project.id).length, 0);
  store.close();
});

test("P-6.1b: a draw with NO progress ever recorded is refused", (t) => {
  const { open } = openDb(t);
  const store = open();
  const { project } = setupProject(store, { progress: null });
  const finance = setupFinance(store);
  const invoice = submitAndApproveInvoice(finance, { projectId: project.id });
  assert.throws(
    () => finance.requestDraw({ projectId: project.id, actor: PM, amount: 10000, percentComplete: 50, evidenceRefs: ["evidence://progress-50"], invoiceIds: [invoice.id], reason: "No verified work exists" }),
    /draw_exceeds_verified_progress/,
  );
  assert.equal(finance.listDraws(project.id).length, 0);
  store.close();
});

// --- P-6.2: draw evidence must be recorded progress evidence ---------

test("P-6.2: a draw citing never-recorded evidence is refused; recorded evidence passes", (t) => {
  const { open } = openDb(t);
  const store = open();
  const { project } = setupProject(store);
  const finance = setupFinance(store);
  const invoice = submitAndApproveInvoice(finance, { projectId: project.id });
  assert.throws(
    () => finance.requestDraw({ projectId: project.id, actor: PM, amount: 10000, percentComplete: 50, evidenceRefs: ["evidence://never-recorded"], invoiceIds: [invoice.id], reason: "Fabricated evidence" }),
    /draw_evidence_not_recorded/,
  );
  assert.equal(finance.listDraws(project.id).length, 0);
  // positive control: the genuinely recorded progress evidence passes
  const { draw, duplicate } = finance.requestDraw({ projectId: project.id, actor: PM, amount: 10000, percentComplete: 50, evidenceRefs: ["evidence://progress-50"], invoiceIds: [invoice.id], reason: "Verified work" });
  assert.equal(duplicate, false);
  assert.equal(draw.status, "pending");
  store.close();
});

// --- P-6.3: decision-time earned-value ceiling ------------------------

test("P-6.3: two pending 15000 draws at 50% — the second approval exceeds the 21600 earned ceiling and is refused atomically", (t) => {
  const { open } = openDb(t);
  const store = open();
  const { project } = setupProject(store);
  const finance = setupFinance(store);
  // one approved invoice with headroom for both draws (45000), budget
  // authority non-binding (55000): ONLY the earned ceiling can refuse.
  const invoice = submitAndApproveInvoice(finance, { projectId: project.id, total: 45000 });
  const draw1 = finance.requestDraw({ projectId: project.id, actor: PM, amount: 15000, percentComplete: 50, evidenceRefs: ["evidence://progress-50"], invoiceIds: [invoice.id], reason: "First tranche" }).draw;
  const draw2 = finance.requestDraw({ projectId: project.id, actor: PM, amount: 15000, percentComplete: 50, evidenceRefs: ["evidence://progress-50"], invoiceIds: [invoice.id], reason: "Second tranche" }).draw;
  finance.decideDraw({ projectId: project.id, actor: BOSS, drawId: draw1.id, decision: "approved", rationale: "Verified" });
  assert.equal(finance.getProjectFinancials(project.id).approved, 15000);
  // earned ceiling = 48000 × 50% × (1 − 10%) = 21600; 15000 + 15000 =
  // 30000 > 21600 → the second approval must refuse, atomically.
  assert.throws(
    () => finance.decideDraw({ projectId: project.id, actor: BOSS, drawId: draw2.id, decision: "approved", rationale: "Verified" }),
    /draw_exceeds_verified_progress/,
  );
  assert.equal(finance.getDraw(draw2.id).status, "pending");
  assert.equal(finance.listDecisions(draw2.id).length, 0);
  assert.equal(finance.listAllocations(draw2.id).length, 0);
  assert.deepEqual(finance.getProjectFinancials(project.id), { projectId: project.id, approved: 15000, allocated: 15000, paid: 0, reconciled: 0 });
  store.close();
});

// --- P-5.2: contractor identity normalization for duplicate keys -----

test("P-5.2: invoice duplicates are detected across contractor spelling variants; the stored name stays verbatim", (t) => {
  const { open } = openDb(t);
  const store = open();
  const { project } = setupProject(store);
  const finance = setupFinance(store);
  const first = finance.submitInvoice({
    projectId: project.id, actor: PM, contractor: "Acme Builders", externalNumber: "INV-DUP",
    lineItems: [{ description: "Work", amount: 4000 }], evidenceRefs: ["evidence://inv-dup"],
  });
  assert.equal(first.contractor, "Acme Builders");
  // case variant + collapsed internal whitespace = same identity
  assert.throws(
    () => finance.submitInvoice({ projectId: project.id, actor: PM, contractor: "acme  builders", externalNumber: "INV-DUP", lineItems: [{ description: "Work", amount: 4000 }], evidenceRefs: ["evidence://inv-dup-b"] }),
    /duplicate_invoice_number/,
  );
  // case variant alone = same identity
  assert.throws(
    () => finance.submitInvoice({ projectId: project.id, actor: PM, contractor: "ACME BUILDERS", externalNumber: "INV-DUP", lineItems: [{ description: "Work", amount: 4000 }], evidenceRefs: ["evidence://inv-dup-c"] }),
    /duplicate_invoice_number/,
  );
  // controls: same identity with a NEW number is a new invoice; a
  // different contractor with the SAME number is a different namespace
  const second = finance.submitInvoice({
    projectId: project.id, actor: PM, contractor: "acme builders", externalNumber: "INV-DUP-2",
    lineItems: [{ description: "Work", amount: 1000 }], evidenceRefs: ["evidence://inv-dup-2"],
  });
  assert.equal(second.externalNumber, "INV-DUP-2");
  const third = finance.submitInvoice({
    projectId: project.id, actor: PM, contractor: "Other Builders", externalNumber: "INV-DUP",
    lineItems: [{ description: "Work", amount: 1000 }], evidenceRefs: ["evidence://inv-dup-3"],
  });
  assert.equal(third.contractor, "Other Builders");
  assert.equal(finance.listInvoices(project.id).length, 3);
  // the first invoice's stored display string is untouched
  assert.equal(finance.getInvoice(first.id).contractor, "Acme Builders");
  store.close();
});

// --- P-B3: set-based reconciliation breakdown (read-only) ------------

/** Project with three governed payments on one approved draw:
 *  A = 5000 (with a governed reconciled record), B = 3000, E = 200. */
function setupBreakdownFixture(store) {
  const { project } = setupProject(store);
  const finance = setupFinance(store);
  const invoice = submitAndApproveInvoice(finance, { projectId: project.id, number: "INV-B3", total: 15000 });
  const { draw } = finance.requestDraw({ projectId: project.id, actor: PM, amount: 15000, percentComplete: 50, evidenceRefs: ["evidence://progress-50"], invoiceIds: [invoice.id], reason: "Verified work" });
  finance.decideDraw({ projectId: project.id, actor: BOSS, drawId: draw.id, decision: "approved", rationale: "Verified" });
  const payA = finance.recordPayment({ projectId: project.id, actor: CLERK, drawId: draw.id, amount: 5000, paymentRef: "A" }).payment;
  const payB = finance.recordPayment({ projectId: project.id, actor: CLERK, drawId: draw.id, amount: 3000, paymentRef: "B" }).payment;
  const payE = finance.recordPayment({ projectId: project.id, actor: CLERK, drawId: draw.id, amount: 200, paymentRef: "E" }).payment;
  finance.recordReconciliation({ projectId: project.id, actor: CLERK, paymentId: payA.id, bankRecord: { amount: 5000, reference: "A" } });
  return { project, finance, payA, payB, payE };
}

test("P-B3: breakdown classifies matched / amount_mismatch / unmatched_bank / unmatched_ledger and never claims bank verification", (t) => {
  const { open } = openDb(t);
  const store = open();
  const { project, finance, payA, payB, payE } = setupBreakdownFixture(store);
  const bankRecords = [
    { paymentRef: "A", amount: 5000 },
    { paymentRef: "B", amount: 2999 },
    { paymentRef: "C", amount: 700 },
  ];
  const report = finance.reconciliationBreakdown(project.id, bankRecords);

  assert.equal(report.projectId, project.id);
  assert.equal(report.bankVerified, false);
  assert.equal(report.bankRecordsSource, "caller_reported");

  assert.equal(report.matched.length, 1);
  assert.equal(report.matched[0].paymentRef, "A");
  assert.equal(report.matched[0].paymentId, payA.id);
  assert.equal(report.matched[0].amount, 5000);
  assert.equal(report.matched[0].reconciled, true);
  assert.equal(report.matched[0].bankSource, "caller_reported");

  assert.equal(report.amount_mismatch.length, 1);
  assert.equal(report.amount_mismatch[0].paymentRef, "B");
  assert.equal(report.amount_mismatch[0].paymentId, payB.id);
  assert.equal(report.amount_mismatch[0].ledgerAmount, 3000);
  assert.equal(report.amount_mismatch[0].bankAmount, 2999);
  assert.equal(report.amount_mismatch[0].bankSource, "caller_reported");

  assert.equal(report.unmatched_bank.length, 1);
  assert.equal(report.unmatched_bank[0].paymentRef, "C");
  assert.equal(report.unmatched_bank[0].bankAmount, 700);
  assert.equal(report.unmatched_bank[0].bankSource, "caller_reported");

  assert.equal(report.unmatched_ledger.length, 1);
  assert.equal(report.unmatched_ledger[0].paymentRef, "E");
  assert.equal(report.unmatched_ledger[0].paymentId, payE.id);
  assert.equal(report.unmatched_ledger[0].amount, 200);

  // nothing in the serialized report may assert bank verification
  assert.ok(!/"bankVerified"\s*:\s*true/.test(JSON.stringify(report)), "breakdown must never serialize bankVerified: true");

  // read-only: an identical call returns an identical report and no
  // reconciliation or audit state moved
  const auditBefore = finance.listAudit(project.id).length;
  const reconBefore = finance.listReconciliations(project.id).length;
  const again = finance.reconciliationBreakdown(project.id, bankRecords);
  assert.deepEqual(again, report);
  assert.equal(finance.listReconciliations(project.id).length, reconBefore);
  assert.equal(finance.listAudit(project.id).length, auditBefore);
  assert.equal(finance.verifyAuditChain(project.id), true);
  store.close();
});

test("P-B3: breakdown input validation — non-array refused, duplicate bank reference refused", (t) => {
  const { open } = openDb(t);
  const store = open();
  const { project, finance } = setupBreakdownFixture(store);
  assert.throws(() => finance.reconciliationBreakdown(project.id, null), /bank_records_required/);
  assert.throws(() => finance.reconciliationBreakdown(project.id, "not-an-array"), /bank_records_required/);
  assert.throws(
    () => finance.reconciliationBreakdown(project.id, [{ paymentRef: "A", amount: 5000 }, { paymentRef: "A", amount: 5000 }]),
    /duplicate_bank_reference/,
  );
  store.close();
});

test("P-B3 route: POST /api/projects/:id/reconciliation-breakdown returns the breakdown; GET is not a route", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "mc-port-http-"));
  const store = new MissionControlStore(join(dir, "mission-control.db"));
  const app = createMissionControlServer({ store, operatorToken: "test-operator-token", handoffSecret: "test-handoff-secret" });
  await new Promise(resolve => app.server.listen(0, "127.0.0.1", resolve));
  t.after(() => { app.server.close(); store.close(); rmSync(dir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${app.server.address().port}`;

  const { project } = receiveClosedAcquisition({ handoffId: "handoff-port-http", payload: payload("opp-port-http"), repository: store.intakeRepository() });
  const workflow = store.restoreWorkflow(project.id);
  workflow.validateScope({ items: [{ title: "Roof replacement", category: "exterior", estimatedCost: 12000 }] });
  workflow.approveBudget({ amount: 50000, contingencyPct: 10, rationale: "Baselines verified" });
  const bid = workflow.addBid({ contractor: "Acme Builders", amount: 48000, days: 45 });
  workflow.selectBid({ bidId: bid.id, rationale: "Best coverage" });
  workflow.scheduleWork({ startAt: "2026-10-01T08:00:00Z", targetCompleteAt: "2026-11-15T17:00:00Z" });
  workflow.startWork({ startedAt: "2026-10-01T08:05:00Z" });
  store.persistWorkflow(workflow);
  const operations = store.restoreOperations(workflow);
  operations.recordProgress({ percentComplete: 50, evidenceRefs: ["evidence://progress-50"] });
  store.persistOperations(operations);

  const finance = app.finance;
  finance.setActorRole({ actorId: PM, role: "operator" });
  finance.setActorRole({ actorId: BOSS, role: "approver" });
  finance.setActorRole({ actorId: CLERK, role: "operator" });
  const invoice = submitAndApproveInvoice(finance, { projectId: project.id, number: "INV-HTTP-B3", total: 15000 });
  const { draw } = finance.requestDraw({ projectId: project.id, actor: PM, amount: 15000, percentComplete: 50, evidenceRefs: ["evidence://progress-50"], invoiceIds: [invoice.id], reason: "Verified work" });
  finance.decideDraw({ projectId: project.id, actor: BOSS, drawId: draw.id, decision: "approved", rationale: "Verified" });
  finance.recordPayment({ projectId: project.id, actor: CLERK, drawId: draw.id, amount: 5000, paymentRef: "A" });

  const headers = { authorization: "Bearer test-operator-token", "x-actor-id": CLERK, "content-type": "application/json" };
  const res = await fetch(`${base}/api/projects/${project.id}/reconciliation-breakdown`, {
    method: "POST", headers,
    body: JSON.stringify({ bankRecords: [{ paymentRef: "A", amount: 5000 }, { paymentRef: "Z", amount: 42 }] }),
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.data.bankVerified, false);
  assert.equal(body.data.matched.length, 1);
  assert.equal(body.data.matched[0].paymentRef, "A");
  assert.equal(body.data.matched[0].reconciled, false);
  assert.equal(body.data.unmatched_bank.length, 1);
  assert.equal(body.data.unmatched_bank[0].paymentRef, "Z");

  const get = await fetch(`${base}/api/projects/${project.id}/reconciliation-breakdown`, { headers: { authorization: "Bearer test-operator-token" } });
  assert.equal(get.status, 404);
});
