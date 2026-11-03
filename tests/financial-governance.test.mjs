import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MissionControlStore } from "../src/missionControlStore.mjs";
import { MissionControlFinance } from "../src/financialGovernance.mjs";
import { receiveClosedAcquisition } from "../src/missionControlIntake.mjs";

// Actors: pm submits/requests (operator), boss approves (approver),
// admin also approves (admin), clerk has no approval power (operator).
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
  const dir = mkdtempSync(join(tmpdir(), "mc-fin-"));
  const path = join(dir, "mission-control.db");
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return { path, open: () => new MissionControlStore(path) };
}

/**
 * Project driven to in_progress and persisted:
 * budget 50000 + 10% contingency (authority 55000), Acme bid 48000
 * selected (committed 48000), work started, progress at 50%.
 * Earned-value headroom for draws: 48000 * 50% * (1 - 10%) = 21600.
 */
function setupProject(store, { handoffId = "handoff-fin", tenantId } = {}) {
  const repo = tenantId ? store.intakeRepository(tenantId) : store.intakeRepository();
  const { project } = receiveClosedAcquisition({ handoffId, payload: payload(handoffId), repository: repo });
  const workflow = tenantId ? store.restoreWorkflow(project.id, { tenantId }) : store.restoreWorkflow(project.id);
  workflow.validateScope({ items: [
    { title: "Roof replacement", category: "exterior", estimatedCost: 12000 },
    { title: "Kitchen remodel", category: "interior", estimatedCost: 30000 },
  ] });
  workflow.approveBudget({ amount: 50000, contingencyPct: 10, rationale: "Baselines verified" });
  const bid = workflow.addBid({ contractor: "Acme Builders", amount: 48000, days: 45 });
  workflow.selectBid({ bidId: bid.id, rationale: "Best coverage within authority" });
  workflow.scheduleWork({ startAt: "2026-10-01T08:00:00Z", targetCompleteAt: "2026-11-15T17:00:00Z" });
  workflow.startWork({ startedAt: "2026-10-01T08:05:00Z" });
  store.persistWorkflow(workflow, tenantId ? { tenantId } : {});
  const operations = store.restoreOperations(workflow, tenantId ? { tenantId } : {});
  operations.recordProgress({ percentComplete: 50, evidenceRefs: ["evidence://progress-50"], note: "Roof done, kitchen framed" });
  store.persistOperations(operations, tenantId ? { tenantId } : {});
  return { project, workflow, scopeItems: workflow.scopeItems };
}

function setupFinance(store, tenantId) {
  const finance = new MissionControlFinance(store);
  const t = tenantId || store.defaultTenantId;
  finance.setActorRole({ tenantId: t, actorId: PM, role: "operator" });
  finance.setActorRole({ tenantId: t, actorId: BOSS, role: "approver" });
  finance.setActorRole({ tenantId: t, actorId: ADMIN, role: "admin" });
  finance.setActorRole({ tenantId: t, actorId: CLERK, role: "operator" });
  return finance;
}

function submitAndApproveInvoice(finance, { projectId, tenantId, number = "INV-100", total = 12000, items = null, contractor = "Acme Builders" }) {
  const invoice = finance.submitInvoice({
    tenantId, projectId, actor: PM, contractor, externalNumber: number,
    lineItems: items || [{ description: "Roofing labor and materials", amount: total }],
    evidenceRefs: [`evidence://invoice-${number}`],
  });
  finance.reviewInvoice({ tenantId, projectId, actor: BOSS, invoiceId: invoice.id, decision: "approved", rationale: "Verified against scope" });
  return finance.getInvoice(invoice.id, tenantId);
}

test("happy path: invoice -> review -> draw -> independent approval -> allocation -> partial payments -> reconciliation", (t) => {
  const { open } = openDb(t);
  const store = open();
  const { project, scopeItems } = setupProject(store);
  const finance = setupFinance(store);
  const roof = scopeItems.find(item => item.title === "Roof replacement");

  // invoice A: line items tied to scope, total from the items
  const invoiceA = finance.submitInvoice({
    projectId: project.id, actor: PM, contractor: "Acme Builders", externalNumber: "INV-100",
    lineItems: [
      { scopeItemId: roof.id, description: "Roof replacement", amount: 9000 },
      { description: "Roofing materials overage", amount: 3000 },
    ],
    total: 12000, evidenceRefs: ["evidence://inv-100-scan"],
  });
  assert.equal(invoiceA.status, "submitted");
  assert.equal(invoiceA.total, 12000);
  finance.reviewInvoice({ projectId: project.id, actor: BOSS, invoiceId: invoiceA.id, decision: "under_review" });
  assert.equal(finance.getInvoice(invoiceA.id).status, "under_review");
  const approvedA = finance.reviewInvoice({ projectId: project.id, actor: BOSS, invoiceId: invoiceA.id, decision: "approved", rationale: "Matches scope and photos" });
  assert.equal(approvedA.status, "approved");
  assert.equal(approvedA.reviewedBy, BOSS);

  const invoiceB = submitAndApproveInvoice(finance, { projectId: project.id, number: "INV-101", total: 10000 });

  // governed draw, referencing both approved invoices + progress evidence
  const { draw, duplicate } = finance.requestDraw({
    projectId: project.id, actor: PM, amount: 20000, percentComplete: 50,
    evidenceRefs: ["evidence://progress-50"], invoiceIds: [invoiceA.id, invoiceB.id],
    reason: "Roof complete, kitchen framed", idempotencyKey: "draw-req-1",
  });
  assert.equal(duplicate, false);
  assert.equal(draw.status, "pending");

  // independent approval allocates across invoices in reference order
  const { decision, allocations } = finance.decideDraw({ projectId: project.id, actor: BOSS, drawId: draw.id, decision: "approved", rationale: "Evidence verified" });
  assert.equal(decision.decision, "approved");
  assert.deepEqual(allocations, [
    { invoiceId: invoiceA.id, amount: 12000 },
    { invoiceId: invoiceB.id, amount: 8000 },
  ]);

  // the domain document carries the same draw, approved — one draw, not two
  const opsState = store.loadOperationsState(project.id);
  const domainDraw = opsState.state.drawRequests.find(d => d.id === draw.id);
  assert.equal(domainDraw.status, "approved");
  assert.equal(domainDraw.approvedAmount, 20000);

  // distinct states: approved / allocated / paid / reconciled never conflated
  assert.deepEqual(finance.getProjectFinancials(project.id), { projectId: project.id, approved: 20000, allocated: 20000, paid: 0, reconciled: 0 });

  const { payment: pay1 } = finance.recordPayment({ projectId: project.id, actor: CLERK, drawId: draw.id, amount: 12000, paymentRef: "ACH-1001", method: "ach", idempotencyKey: "pay-1" });
  finance.recordPayment({ projectId: project.id, actor: CLERK, drawId: draw.id, amount: 5000, paymentRef: "ACH-1002", method: "ach" });
  assert.deepEqual(finance.getDrawFinancials(draw.id), { drawId: draw.id, approved: 20000, allocated: 20000, paid: 17000, reconciled: 0, outstanding: 3000 });

  const recon = finance.recordReconciliation({ projectId: project.id, actor: CLERK, paymentId: pay1.id, bankRecord: { amount: 12000, reference: "stmt-line-88", date: "2026-10-20" } });
  assert.equal(recon.state, "reconciled");
  assert.equal(recon.source, "caller_reported");
  assert.equal(recon.bankVerified, false);
  assert.deepEqual(finance.getProjectFinancials(project.id), { projectId: project.id, approved: 20000, allocated: 20000, paid: 17000, reconciled: 12000 });

  // audit chain verifies, and every financial event is in the events stream
  assert.equal(finance.verifyAuditChain(project.id), true);
  const auditTypes = finance.listAudit(project.id).map(row => row.event_type);
  assert.deepEqual(auditTypes, ["invoice_submitted", "invoice_reviewed", "invoice_reviewed", "invoice_submitted", "invoice_reviewed", "draw_requested", "draw_decided", "draw_allocated", "payment_recorded", "payment_recorded", "reconciliation_recorded"]);
  const streamTypes = store.db.prepare("SELECT type FROM events WHERE project_id = ? AND stream = 'operations' ORDER BY seq").all(project.id).map(row => row.type);
  for (const type of ["invoice_submitted", "invoice_reviewed", "draw_requested", "draw_decided", "draw_allocated", "payment_recorded", "reconciliation_recorded"]) {
    assert.ok(streamTypes.includes(type), `events stream missing ${type}`);
  }
  store.close();
});

test("invoice review: the submitter can never review their own invoice", (t) => {
  const { open } = openDb(t);
  const store = open();
  const { project } = setupProject(store);
  const finance = setupFinance(store);
  const invoice = finance.submitInvoice({ projectId: project.id, actor: PM, contractor: "Acme Builders", externalNumber: "INV-200", lineItems: [{ description: "Work", amount: 1000 }], evidenceRefs: ["evidence://inv-200"] });
  assert.throws(() => finance.reviewInvoice({ projectId: project.id, actor: PM, invoiceId: invoice.id, decision: "approved" }), /self_review_forbidden/);
  assert.throws(() => finance.reviewInvoice({ projectId: project.id, actor: PM, invoiceId: invoice.id, decision: "under_review" }), /self_review_forbidden/);
  assert.equal(finance.getInvoice(invoice.id).status, "submitted");
  store.close();
});

test("invoices: duplicate number rejected; rejection + resubmission creates a linked new version, history untouched", (t) => {
  const { open } = openDb(t);
  const store = open();
  const { project } = setupProject(store);
  const finance = setupFinance(store);
  const v1 = finance.submitInvoice({ projectId: project.id, actor: PM, contractor: "Acme Builders", externalNumber: "INV-300", lineItems: [{ description: "Work", amount: 4000 }], evidenceRefs: ["evidence://inv-300"] });
  assert.throws(() => finance.submitInvoice({ projectId: project.id, actor: PM, contractor: "Acme Builders", externalNumber: "INV-300", lineItems: [{ description: "Work", amount: 4000 }], evidenceRefs: ["evidence://inv-300b"] }), /duplicate_invoice_number/);
  // resubmission is only possible from a rejected invoice
  assert.throws(() => finance.submitInvoice({ projectId: project.id, actor: PM, contractor: "Acme Builders", externalNumber: "INV-300", lineItems: [{ description: "Work", amount: 4000 }], evidenceRefs: ["evidence://inv-300c"], resubmissionOf: v1.id }), /resubmission_requires_rejected/);
  // rejection requires a rationale
  assert.throws(() => finance.reviewInvoice({ projectId: project.id, actor: BOSS, invoiceId: v1.id, decision: "rejected" }), /review_rationale_required/);
  finance.reviewInvoice({ projectId: project.id, actor: BOSS, invoiceId: v1.id, decision: "rejected", rationale: "Missing permit reference" });
  const v2 = finance.submitInvoice({ projectId: project.id, actor: PM, contractor: "Acme Builders", externalNumber: "INV-300", lineItems: [{ description: "Work incl. permit ref", amount: 4200 }], evidenceRefs: ["evidence://inv-300-v2"], resubmissionOf: v1.id });
  assert.equal(v2.version, 2);
  assert.equal(v2.priorInvoiceId, v1.id);
  assert.equal(v2.status, "submitted");
  // the rejected original is preserved verbatim
  const original = finance.getInvoice(v1.id);
  assert.equal(original.status, "rejected");
  assert.equal(original.total, 4000);
  assert.equal(original.version, 1);
  // a second resubmission of the same rejected invoice is a duplicate
  assert.throws(() => finance.submitInvoice({ projectId: project.id, actor: PM, contractor: "Acme Builders", externalNumber: "INV-300", lineItems: [{ description: "Work", amount: 4200 }], evidenceRefs: ["evidence://inv-300-v3"], resubmissionOf: v1.id }), /duplicate_invoice_number/);
  store.close();
});

test("invoices: line-item sum mismatch, missing evidence, and unknown scope items fail closed", (t) => {
  const { open } = openDb(t);
  const store = open();
  const { project } = setupProject(store);
  const finance = setupFinance(store);
  assert.throws(() => finance.submitInvoice({ projectId: project.id, actor: PM, contractor: "Acme Builders", externalNumber: "INV-400", lineItems: [{ description: "Work", amount: 1000 }], total: 1001, evidenceRefs: ["evidence://x"] }), /line_item_sum_mismatch/);
  assert.throws(() => finance.submitInvoice({ projectId: project.id, actor: PM, contractor: "Acme Builders", externalNumber: "INV-401", lineItems: [{ description: "Work", amount: 1000 }], evidenceRefs: [] }), /invoice_evidence_required/);
  assert.throws(() => finance.submitInvoice({ projectId: project.id, actor: PM, contractor: "Acme Builders", externalNumber: "INV-402", lineItems: [{ scopeItemId: "no-such-item", description: "Work", amount: 1000 }], evidenceRefs: ["evidence://x"] }), /scope_item_not_found/);
  assert.equal(finance.listInvoices(project.id).length, 0);
  store.close();
});

test("draws: unapproved invoices and other projects' invoices are refused", (t) => {
  const { open } = openDb(t);
  const store = open();
  const a = setupProject(store, { handoffId: "handoff-a" });
  const b = setupProject(store, { handoffId: "handoff-b" });
  const finance = setupFinance(store);
  const pending = finance.submitInvoice({ projectId: a.project.id, actor: PM, contractor: "Acme Builders", externalNumber: "INV-500", lineItems: [{ description: "Work", amount: 5000 }], evidenceRefs: ["evidence://inv-500"] });
  assert.throws(() => finance.requestDraw({ projectId: a.project.id, actor: PM, amount: 5000, percentComplete: 50, evidenceRefs: ["evidence://p"], invoiceIds: [pending.id], reason: "Progress" }), /invoice_not_approved/);
  const foreign = submitAndApproveInvoice(finance, { projectId: b.project.id, number: "INV-501", total: 5000 });
  assert.throws(() => finance.requestDraw({ projectId: a.project.id, actor: PM, amount: 5000, percentComplete: 50, evidenceRefs: ["evidence://p"], invoiceIds: [foreign.id], reason: "Progress" }), /invoice_project_mismatch/);
  assert.equal(finance.listDraws(a.project.id).length, 0);
  store.close();
});

test("draws: the domain earned-value cap still governs (no governance bypass)", (t) => {
  const { open } = openDb(t);
  const store = open();
  const { project } = setupProject(store);
  const finance = setupFinance(store);
  const invoice = submitAndApproveInvoice(finance, { projectId: project.id, number: "INV-600", total: 40000 });
  // headroom at 50% with 10% retainage is 21600 — 30000 must fail in the domain
  assert.throws(() => finance.requestDraw({ projectId: project.id, actor: PM, amount: 30000, percentComplete: 50, evidenceRefs: ["evidence://p"], invoiceIds: [invoice.id], reason: "Progress" }), /draw_exceeds_verified_progress/);
  assert.equal(finance.listDraws(project.id).length, 0);
  store.close();
});

test("decisions: self-approval is forbidden even for an approver; non-approvers cannot decide", (t) => {
  const { open } = openDb(t);
  const store = open();
  const { project } = setupProject(store);
  const finance = setupFinance(store);
  const invoice = submitAndApproveInvoice(finance, { projectId: project.id, number: "INV-700", total: 12000 });
  // BOSS (an approver) requests this draw, so BOSS cannot decide it
  const { draw } = finance.requestDraw({ projectId: project.id, actor: BOSS, amount: 10000, percentComplete: 50, evidenceRefs: ["evidence://p"], invoiceIds: [invoice.id], reason: "Progress" });
  assert.throws(() => finance.decideDraw({ projectId: project.id, actor: BOSS, drawId: draw.id, decision: "approved", rationale: "ok" }), /self_approval_forbidden/);
  // an operator who is not the requester still lacks the approver role
  assert.throws(() => finance.decideDraw({ projectId: project.id, actor: CLERK, drawId: draw.id, decision: "approved", rationale: "ok" }), /approver_role_required/);
  // an actor with no configured role has no approval power either
  assert.throws(() => finance.decideDraw({ projectId: project.id, actor: "ghost", drawId: draw.id, decision: "approved", rationale: "ok" }), /approver_role_required/);
  // an admin who is not the requester can decide
  const { decision } = finance.decideDraw({ projectId: project.id, actor: ADMIN, drawId: draw.id, decision: "approved", rationale: "Verified" });
  assert.equal(decision.decision, "approved");
  // decisions are one-shot (re-decided by the admin who already decided:
  // the requester's own re-attempt is stopped earlier, by self-approval)
  assert.throws(() => finance.decideDraw({ projectId: project.id, actor: ADMIN, drawId: draw.id, decision: "rejected", rationale: "changed mind" }), /draw_already_decided/);
  store.close();
});

test("allocation: an approval larger than the referenced invoices' headroom is refused atomically", (t) => {
  const { open } = openDb(t);
  const store = open();
  const { project } = setupProject(store);
  const finance = setupFinance(store);
  const invoice = submitAndApproveInvoice(finance, { projectId: project.id, number: "INV-800", total: 15000 });
  const { draw } = finance.requestDraw({ projectId: project.id, actor: PM, amount: 20000, percentComplete: 50, evidenceRefs: ["evidence://p"], invoiceIds: [invoice.id], reason: "Progress" });
  assert.throws(() => finance.decideDraw({ projectId: project.id, actor: BOSS, drawId: draw.id, decision: "approved", rationale: "ok" }), /allocation_exceeds_invoice/);
  // nothing was written: draw still pending, no decision, no allocation
  assert.equal(finance.getDraw(draw.id).status, "pending");
  assert.equal(finance.listDecisions(draw.id).length, 0);
  assert.equal(finance.listAllocations(draw.id).length, 0);
  // approving within the invoice total succeeds
  finance.decideDraw({ projectId: project.id, actor: BOSS, drawId: draw.id, decision: "approved", approvedAmount: 15000, rationale: "Capped at invoiced work" });
  assert.deepEqual(finance.getProjectFinancials(project.id), { projectId: project.id, approved: 15000, allocated: 15000, paid: 0, reconciled: 0 });
  store.close();
});

test("allocation: cumulative allocation above budget authority is refused even when the domain cap allows", (t) => {
  const { open } = openDb(t);
  const store = open();
  const { project, workflow } = setupProject(store);
  const finance = setupFinance(store);
  // Record a budget correction directly in the workflow document:
  // authority drops to 20000 while the committed bid stays 48000, so the
  // domain earned-value cap (43200) would allow what authority forbids.
  const loaded = store.loadWorkflowState(project.id);
  loaded.state.project.approvedBudget = 20000;
  loaded.state.project.contingencyPct = 0;
  store.saveWorkflowState(project.id, loaded.state, loaded.version);
  assert.equal(workflow.project.id, project.id);
  const invoice = submitAndApproveInvoice(finance, { projectId: project.id, number: "INV-900", total: 40000 });
  // at 100% the domain cap allows 48000 * 1.0 * (1 - 10%) = 43200 >= 30000,
  // so only the authority guard (20000) can refuse this approval
  const { draw } = finance.requestDraw({ projectId: project.id, actor: PM, amount: 30000, percentComplete: 100, evidenceRefs: ["evidence://p"], invoiceIds: [invoice.id], reason: "Progress" });
  assert.throws(() => finance.decideDraw({ projectId: project.id, actor: BOSS, drawId: draw.id, decision: "approved", rationale: "ok" }), /allocation_exceeds_authority/);
  assert.equal(finance.getDraw(draw.id).status, "pending");
  assert.equal(finance.getProjectFinancials(project.id).allocated, 0);
  store.close();
});

test("payments: duplicate references and overpayment are refused; partial payments accumulate", (t) => {
  const { open } = openDb(t);
  const store = open();
  const { project } = setupProject(store);
  const finance = setupFinance(store);
  const invoice = submitAndApproveInvoice(finance, { projectId: project.id, number: "INV-1000", total: 12000 });
  const { draw } = finance.requestDraw({ projectId: project.id, actor: PM, amount: 10000, percentComplete: 50, evidenceRefs: ["evidence://p"], invoiceIds: [invoice.id], reason: "Progress" });
  // cannot pay a pending draw
  assert.throws(() => finance.recordPayment({ projectId: project.id, actor: CLERK, drawId: draw.id, amount: 100, paymentRef: "ACH-1" }), /draw_not_approved/);
  finance.decideDraw({ projectId: project.id, actor: BOSS, drawId: draw.id, decision: "approved", rationale: "Verified" });
  finance.recordPayment({ projectId: project.id, actor: CLERK, drawId: draw.id, amount: 4000, paymentRef: "ACH-1" });
  assert.throws(() => finance.recordPayment({ projectId: project.id, actor: CLERK, drawId: draw.id, amount: 100, paymentRef: "ACH-1" }), /duplicate_payment_ref/);
  assert.throws(() => finance.recordPayment({ projectId: project.id, actor: CLERK, drawId: draw.id, amount: 6001, paymentRef: "ACH-2" }), /payment_exceeds_approved/);
  finance.recordPayment({ projectId: project.id, actor: CLERK, drawId: draw.id, amount: 6000, paymentRef: "ACH-2" });
  assert.equal(finance.getDrawFinancials(draw.id).paid, 10000);
  assert.equal(finance.getDrawFinancials(draw.id).outstanding, 0);
  store.close();
});

test("idempotency: draw and payment replays return the original record and create nothing", (t) => {
  const { open } = openDb(t);
  const store = open();
  const { project } = setupProject(store);
  const finance = setupFinance(store);
  const invoice = submitAndApproveInvoice(finance, { projectId: project.id, number: "INV-1100", total: 12000 });
  const first = finance.requestDraw({ projectId: project.id, actor: PM, amount: 10000, percentComplete: 50, evidenceRefs: ["evidence://p"], invoiceIds: [invoice.id], reason: "Progress", idempotencyKey: "draw-key-1" });
  const replay = finance.requestDraw({ projectId: project.id, actor: PM, amount: 10000, percentComplete: 50, evidenceRefs: ["evidence://p"], invoiceIds: [invoice.id], reason: "Progress", idempotencyKey: "draw-key-1" });
  assert.equal(first.duplicate, false);
  assert.equal(replay.duplicate, true);
  assert.equal(replay.draw.id, first.draw.id);
  assert.equal(finance.listDraws(project.id).length, 1);
  assert.equal(store.loadOperationsState(project.id).state.drawRequests.length, 1);
  finance.decideDraw({ projectId: project.id, actor: BOSS, drawId: first.draw.id, decision: "approved", rationale: "Verified" });
  const payFirst = finance.recordPayment({ projectId: project.id, actor: CLERK, drawId: first.draw.id, amount: 5000, paymentRef: "ACH-9", idempotencyKey: "pay-key-1" });
  const payReplay = finance.recordPayment({ projectId: project.id, actor: CLERK, drawId: first.draw.id, amount: 5000, paymentRef: "ACH-9", idempotencyKey: "pay-key-1" });
  assert.equal(payFirst.duplicate, false);
  assert.equal(payReplay.duplicate, true);
  assert.equal(payReplay.payment.id, payFirst.payment.id);
  assert.equal(finance.listPayments(project.id).length, 1);
  assert.equal(finance.getProjectFinancials(project.id).paid, 5000);
  store.close();
});

test("reconciliation: caller records are never bank-verified; mismatches keep both amounts", (t) => {
  const { open } = openDb(t);
  const store = open();
  const { project } = setupProject(store);
  const finance = setupFinance(store);
  const invoice = submitAndApproveInvoice(finance, { projectId: project.id, number: "INV-1200", total: 12000 });
  const { draw } = finance.requestDraw({ projectId: project.id, actor: PM, amount: 10000, percentComplete: 50, evidenceRefs: ["evidence://p"], invoiceIds: [invoice.id], reason: "Progress" });
  finance.decideDraw({ projectId: project.id, actor: BOSS, drawId: draw.id, decision: "approved", rationale: "Verified" });
  const { payment } = finance.recordPayment({ projectId: project.id, actor: CLERK, drawId: draw.id, amount: 10000, paymentRef: "ACH-77" });
  const mismatch = finance.recordReconciliation({ projectId: project.id, actor: CLERK, paymentId: payment.id, bankRecord: { amount: 9950, reference: "stmt-line-9", note: "caller says bank shows 9950" } });
  assert.equal(mismatch.state, "mismatch");
  assert.equal(mismatch.callerAmount, 9950);
  assert.equal(mismatch.paymentAmount, 10000);
  assert.equal(mismatch.bankVerified, false);
  assert.equal(mismatch.source, "caller_reported");
  // the stored caller record is verbatim, and the payment itself is unchanged
  const stored = finance.listReconciliations(project.id)[0];
  assert.deepEqual(stored.callerRecord, { amount: 9950, reference: "stmt-line-9", note: "caller says bank shows 9950" });
  assert.equal(finance.getPayment(payment.id).amount, 10000);
  // a mismatch does not count as reconciled money
  assert.equal(finance.getProjectFinancials(project.id).reconciled, 0);
  // the schema itself refuses any bank_verified = 1 row, from any writer
  assert.throws(() => store.db.prepare("INSERT INTO reconciliations (id, tenant_id, project_id, payment_id, caller_record_json, caller_amount, payment_amount, state, source, bank_verified, recorded_by, created_at) VALUES ('x', ?, ?, ?, '{}', 1, 1, 'reconciled', 'caller_reported', 1, 'mallory', 'now')").run(store.defaultTenantId, project.id, payment.id), /CHECK constraint failed/);
  store.close();
});

test("audit chain: tampering with a row or deleting one breaks verification", (t) => {
  const { open } = openDb(t);
  const store = open();
  const { project } = setupProject(store);
  const finance = setupFinance(store);
  const invoice = submitAndApproveInvoice(finance, { projectId: project.id, number: "INV-1300", total: 12000 });
  const { draw } = finance.requestDraw({ projectId: project.id, actor: PM, amount: 10000, percentComplete: 50, evidenceRefs: ["evidence://p"], invoiceIds: [invoice.id], reason: "Progress" });
  finance.decideDraw({ projectId: project.id, actor: BOSS, drawId: draw.id, decision: "approved", rationale: "Verified" });
  assert.equal(finance.verifyAuditChain(project.id), true);
  // mutate a payload behind the API's back: chain must fail
  store.db.prepare("UPDATE financial_audit SET payload_json = ? WHERE project_id = ? AND seq = 2").run('{"eventType":"invoice_submitted","actor":"mallory"}', project.id);
  assert.equal(finance.verifyAuditChain(project.id), false);
  store.close();

  // deletion of a middle row breaks the sequence + linkage (the chain
  // here has 5 rows: invoice x2 events, draw_requested, draw_decided,
  // draw_allocated — seq 2 is genuinely in the middle)
  const second = openDb(t);
  const store2 = second.open();
  const fixture2 = setupProject(store2);
  const finance2 = setupFinance(store2);
  const invoice2 = submitAndApproveInvoice(finance2, { projectId: fixture2.project.id, number: "INV-1301", total: 12000 });
  const { draw: draw2 } = finance2.requestDraw({ projectId: fixture2.project.id, actor: PM, amount: 10000, percentComplete: 50, evidenceRefs: ["evidence://p"], invoiceIds: [invoice2.id], reason: "Progress" });
  finance2.decideDraw({ projectId: fixture2.project.id, actor: BOSS, drawId: draw2.id, decision: "approved", rationale: "Verified" });
  assert.equal(finance2.listAudit(fixture2.project.id).length, 5);
  assert.equal(finance2.verifyAuditChain(fixture2.project.id), true);
  store2.db.prepare("DELETE FROM financial_audit WHERE project_id = ? AND seq = 2").run(fixture2.project.id);
  assert.equal(finance2.verifyAuditChain(fixture2.project.id), false);
  store2.close();
});

test("decisions are append-only; reversal is a compensating record that nets allocations to zero", (t) => {
  const { open } = openDb(t);
  const store = open();
  const { project } = setupProject(store);
  const finance = setupFinance(store);
  const invoice = submitAndApproveInvoice(finance, { projectId: project.id, number: "INV-1400", total: 12000 });
  const { draw } = finance.requestDraw({ projectId: project.id, actor: PM, amount: 10000, percentComplete: 50, evidenceRefs: ["evidence://p"], invoiceIds: [invoice.id], reason: "Progress" });
  const { decision } = finance.decideDraw({ projectId: project.id, actor: BOSS, drawId: draw.id, decision: "approved", rationale: "Verified" });
  // the decision ledger refuses edits and deletes at the schema level
  assert.throws(() => store.db.prepare("UPDATE draw_decisions SET decision = 'rejected' WHERE id = ?").run(decision.id), /draw_decisions_append_only/);
  assert.throws(() => store.db.prepare("DELETE FROM draw_decisions WHERE id = ?").run(decision.id), /draw_decisions_append_only/);
  // reversal by a different approver
  const { decision: reversal } = finance.reverseDecision({ projectId: project.id, actor: ADMIN, decisionId: decision.id, rationale: "Evidence was misfiled" });
  assert.equal(reversal.decision, "reversal");
  assert.equal(reversal.reversesDecisionId, decision.id);
  assert.equal(finance.getDraw(draw.id).status, "reversed");
  assert.deepEqual(finance.getProjectFinancials(project.id), { projectId: project.id, approved: 0, allocated: 0, paid: 0, reconciled: 0 });
  assert.equal(finance.listDecisions(draw.id).length, 2);
  assert.equal(finance.listAllocations(draw.id).length, 2); // original + compensating negative
  assert.equal(finance.verifyAuditChain(project.id), true);
  // a reversed draw takes no payments, and the decision cannot be reversed twice
  assert.throws(() => finance.recordPayment({ projectId: project.id, actor: CLERK, drawId: draw.id, amount: 100, paymentRef: "ACH-late" }), /draw_not_approved/);
  assert.throws(() => finance.reverseDecision({ projectId: project.id, actor: ADMIN, decisionId: decision.id, rationale: "again" }), /decision_not_reversible/);
  store.close();
});

test("reversal is refused once money has been recorded against the draw", (t) => {
  const { open } = openDb(t);
  const store = open();
  const { project } = setupProject(store);
  const finance = setupFinance(store);
  const invoice = submitAndApproveInvoice(finance, { projectId: project.id, number: "INV-1500", total: 12000 });
  const { draw } = finance.requestDraw({ projectId: project.id, actor: PM, amount: 10000, percentComplete: 50, evidenceRefs: ["evidence://p"], invoiceIds: [invoice.id], reason: "Progress" });
  const { decision } = finance.decideDraw({ projectId: project.id, actor: BOSS, drawId: draw.id, decision: "approved", rationale: "Verified" });
  finance.recordPayment({ projectId: project.id, actor: CLERK, drawId: draw.id, amount: 1000, paymentRef: "ACH-55" });
  assert.throws(() => finance.reverseDecision({ projectId: project.id, actor: ADMIN, decisionId: decision.id, rationale: "undo" }), /decision_has_payments/);
  assert.equal(finance.getDraw(draw.id).status, "approved");
  store.close();
});

test("restart recovery: the full sequence resumes after close/reopen at the payment step", (t) => {
  const { path, open } = openDb(t);
  let store = open();
  const { project } = setupProject(store);
  let finance = setupFinance(store);
  const invoice = submitAndApproveInvoice(finance, { projectId: project.id, number: "INV-1600", total: 15000 });
  const { draw } = finance.requestDraw({ projectId: project.id, actor: PM, amount: 14000, percentComplete: 50, evidenceRefs: ["evidence://p"], invoiceIds: [invoice.id], reason: "Progress", idempotencyKey: "restart-draw" });
  finance.decideDraw({ projectId: project.id, actor: BOSS, drawId: draw.id, decision: "approved", rationale: "Verified" });
  const auditLength = finance.listAudit(project.id).length;
  store.close();

  // reopen: every governed record is intact, the chain verifies, and
  // the sequence continues exactly where it stopped (the payment step)
  store = open();
  finance = new MissionControlFinance(store);
  assert.equal(store.schemaVersion(), 4);
  assert.equal(finance.getInvoice(invoice.id).status, "approved");
  assert.equal(finance.getDraw(draw.id).status, "approved");
  assert.equal(finance.listAudit(project.id).length, auditLength);
  assert.equal(finance.verifyAuditChain(project.id), true);
  const replay = finance.requestDraw({ projectId: project.id, actor: PM, amount: 14000, percentComplete: 50, evidenceRefs: ["evidence://p"], invoiceIds: [invoice.id], reason: "Progress", idempotencyKey: "restart-draw" });
  assert.equal(replay.duplicate, true);
  const { payment } = finance.recordPayment({ projectId: project.id, actor: CLERK, drawId: draw.id, amount: 14000, paymentRef: "ACH-restart" });
  finance.recordReconciliation({ projectId: project.id, actor: CLERK, paymentId: payment.id, bankRecord: { amount: 14000, reference: "stmt-restart" } });
  assert.deepEqual(finance.getProjectFinancials(project.id), { projectId: project.id, approved: 14000, allocated: 14000, paid: 14000, reconciled: 14000 });
  assert.equal(finance.verifyAuditChain(project.id), true);
  store.close();
});

test("tenant isolation: roles, invoices, draws, and financials never cross tenants", (t) => {
  const { open } = openDb(t);
  const store = open();
  const TENANT_B = "tenant-b";
  const a = setupProject(store, { handoffId: "handoff-ta" });
  const b = setupProject(store, { handoffId: "handoff-tb", tenantId: TENANT_B });
  const finance = setupFinance(store); // roles configured for the default tenant only
  finance.setActorRole({ tenantId: TENANT_B, actorId: PM, role: "operator" });
  const invoiceA = submitAndApproveInvoice(finance, { projectId: a.project.id, number: "INV-1700", total: 12000 });
  // tenant B cannot see or use tenant A's project or invoice
  assert.throws(() => finance.submitInvoice({ tenantId: TENANT_B, projectId: a.project.id, actor: PM, contractor: "Acme Builders", externalNumber: "INV-1701", lineItems: [{ description: "Work", amount: 100 }], evidenceRefs: ["evidence://x"] }), /project_not_found/);
  assert.equal(finance.getInvoice(invoiceA.id, TENANT_B), null);
  const { draw } = finance.requestDraw({ projectId: a.project.id, actor: PM, amount: 10000, percentComplete: 50, evidenceRefs: ["evidence://p"], invoiceIds: [invoiceA.id], reason: "Progress" });
  // BOSS is an approver in the default tenant but has no role in tenant B;
  // and tenant B cannot even resolve tenant A's draw
  assert.equal(finance.getDraw(draw.id, TENANT_B), null);
  assert.throws(() => finance.decideDraw({ tenantId: TENANT_B, projectId: b.project.id, actor: BOSS, drawId: draw.id, decision: "approved", rationale: "ok" }), /draw_not_found/);
  assert.deepEqual(finance.getProjectFinancials(b.project.id, TENANT_B), { projectId: b.project.id, approved: 0, allocated: 0, paid: 0, reconciled: 0 });
  store.close();
});
