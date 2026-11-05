import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MissionControlStore } from "../src/missionControlStore.mjs";
import { MissionControlFinance } from "../src/financialGovernance.mjs";
import { createMissionControlServer } from "../src/missionControlServer.mjs";
import { receiveClosedAcquisition } from "../src/missionControlIntake.mjs";

// ADVERSARIAL FAMILY E — financial edges (§7): retainage boundary,
// exact-sum partial payments, reconciliation mismatch lifecycle,
// invalid inputs, string coercion, float integrity, extreme magnitudes.
// Where the brief says "record honestly what the code does", the probe
// result is characterized in-test and in UNIT-4-RECORD — never assumed.

const PM = "pm-1";
const BOSS = "boss-1";
const OPERATOR_TOKEN = "test-operator-token";

function payload(id) {
  return {
    contractVersion: "1.0", sourceSystem: "pipeline", targetSystem: "mission-control",
    opportunityId: id, opportunityCode: `OCG-${id}`, propertyId: `property-${id}`, address: "500 Ledger Lane",
    closedAt: "2026-09-25T16:00:00Z",
    acquisition: { purchasePrice: 150000, earnestMoney: 1000, strategyType: "cash_purchase", offerId: "offer-1", offerVersionId: "version-1" },
    underwriting: { sourceSystem: "deal-scout", sourceUnderwritingId: "victor-1", arv: 260000, rehab: 48000, mao: 160000, confidence: 0.9, limitations: null },
    renovationSeed: { budgetBaseline: 48000, scopeStatus: "needs_field_validation", projectStatus: "intake_ready" }
  };
}

function openDb(t) {
  const dir = mkdtempSync(join(tmpdir(), "mc-adv-e-"));
  const path = join(dir, "mission-control.db");
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return new MissionControlStore(path);
}

/** In-progress project: committed 48000. Draw cap at 50%/10% retainage = 21600. */
function driveToInProgress(store, handoffId) {
  const { project } = receiveClosedAcquisition({ handoffId, payload: payload(handoffId), repository: store.intakeRepository() });
  const wf = store.restoreWorkflow(project.id);
  wf.validateScope({ items: [{ title: "Roof replacement", category: "exterior", estimatedCost: 12000 }] });
  wf.approveBudget({ amount: 50000, contingencyPct: 10, rationale: "Baselines verified" });
  const bid = wf.addBid({ contractor: "Acme Builders", amount: 48000, days: 45 });
  wf.selectBid({ bidId: bid.id, rationale: "Best coverage" });
  wf.scheduleWork({ startAt: "2026-10-01T08:00:00Z", targetCompleteAt: "2026-11-15T17:00:00Z" });
  wf.startWork({ startedAt: "2026-10-01T08:05:00Z" });
  store.persistWorkflow(wf);
  const operations = store.restoreOperations(wf);
  operations.recordProgress({ percentComplete: 50, evidenceRefs: ["evidence://progress-50"] });
  store.persistOperations(operations);
  return project;
}

function setupFinance(store) {
  const finance = new MissionControlFinance(store);
  finance.setActorRole({ actorId: PM, role: "operator" });
  finance.setActorRole({ actorId: BOSS, role: "approver" });
  return finance;
}

function approvedInvoice(finance, projectId, number, items) {
  const invoice = finance.submitInvoice({ projectId, actor: PM, contractor: "Acme Builders", externalNumber: number, lineItems: items, evidenceRefs: [`evidence://${number}`] });
  finance.reviewInvoice({ projectId, actor: BOSS, invoiceId: invoice.id, decision: "approved", rationale: "Verified" });
  return finance.getInvoice(invoice.id);
}

function approvedDraw(finance, projectId, { amount, invoiceIds, pct = 50, retainagePct = 10 }) {
  const { draw } = finance.requestDraw({ projectId, actor: PM, amount, percentComplete: pct, retainagePct, evidenceRefs: ["evidence://progress-50"], invoiceIds, reason: "Progress" });
  finance.decideDraw({ projectId, actor: BOSS, drawId: draw.id, decision: "approved", rationale: "Verified" });
  return finance.getDraw(draw.id);
}

test("E1: retainage boundary — exact cap passes; the domain's one-cent tolerance is characterized, cap + 2 cents fails", (t) => {
  const store = openDb(t);
  const project = driveToInProgress(store, "handoff-e1");
  const finance = setupFinance(store);
  const invoice = approvedInvoice(finance, project.id, "INV-E1", [{ description: "Work", amount: 60000 }]);
  const ask = (amount) => finance.requestDraw({ projectId: project.id, actor: PM, amount, percentComplete: 50, evidenceRefs: ["evidence://progress-50"], invoiceIds: [invoice.id], reason: "Boundary probe" });
  // cap = 48000 * 50% * (1 - 10%) = 21600 exactly
  assert.equal(ask(21600).draw.requestedAmount, 21600);
  // the domain compares requested > available + 0.01 — a deliberate
  // one-cent tolerance in renovationOperations.requestDraw. Characterized
  // here, not hidden: 21600.01 is admitted...
  assert.equal(ask(21600.01).draw.requestedAmount, 21600.01);
  // ...and 21600.02 is refused.
  assert.throws(() => ask(21600.02), /draw_exceeds_verified_progress/);
  store.close();
});

test("E2: allocation boundary — approval exactly exhausting an invoice's headroom passes; one cent beyond it fails", (t) => {
  const store = openDb(t);
  const project = driveToInProgress(store, "handoff-e2");
  const finance = setupFinance(store);
  const invA = approvedInvoice(finance, project.id, "INV-E2A", [{ description: "Work", amount: 10000 }]);
  const drawA = approvedDraw(finance, project.id, { amount: 10000, invoiceIds: [invA.id] });
  assert.equal(finance.getDrawFinancials(drawA.id).allocated, 10000); // headroom consumed exactly
  // any further draw against the exhausted invoice fails at allocation
  const invB = approvedInvoice(finance, project.id, "INV-E2B", [{ description: "Work", amount: 5000 }]);
  const { draw: drawB } = finance.requestDraw({ projectId: project.id, actor: PM, amount: 5000, percentComplete: 50, evidenceRefs: ["evidence://progress-50"], invoiceIds: [invA.id, invB.id], reason: "Mixed" });
  // approving 5000 allocates 0 to the exhausted invoice and 5000 to invB — passes
  finance.decideDraw({ projectId: project.id, actor: BOSS, drawId: drawB.id, decision: "approved", rationale: "Verified" });
  assert.deepEqual(finance.listAllocations(drawB.id).map(a => a.amount), [5000]);
  // a draw referencing ONLY the exhausted invoice cannot be approved at all
  const { draw: drawC } = finance.requestDraw({ projectId: project.id, actor: PM, amount: 100, percentComplete: 50, evidenceRefs: ["evidence://progress-50"], invoiceIds: [invA.id], reason: "One cent too far" });
  assert.throws(() => finance.decideDraw({ projectId: project.id, actor: BOSS, drawId: drawC.id, decision: "approved", approvedAmount: 0.01, rationale: "cent" }), /allocation_exceeds_invoice/);
  store.close();
});

test("E3: partial payments summing EXACTLY to the approved amount close the draw; one cent more is refused", (t) => {
  const store = openDb(t);
  const project = driveToInProgress(store, "handoff-e3");
  const finance = setupFinance(store);
  const invoice = approvedInvoice(finance, project.id, "INV-E3", [{ description: "Work", amount: 12000 }]);
  const draw = approvedDraw(finance, project.id, { amount: 10000, invoiceIds: [invoice.id] });
  finance.recordPayment({ projectId: project.id, actor: PM, drawId: draw.id, amount: 3333.33, paymentRef: "E3-1" });
  finance.recordPayment({ projectId: project.id, actor: PM, drawId: draw.id, amount: 3333.33, paymentRef: "E3-2" });
  finance.recordPayment({ projectId: project.id, actor: PM, drawId: draw.id, amount: 3333.34, paymentRef: "E3-3" });
  const fin = finance.getDrawFinancials(draw.id);
  assert.equal(fin.paid, 10000);
  assert.equal(fin.outstanding, 0);
  assert.throws(() => finance.recordPayment({ projectId: project.id, actor: PM, drawId: draw.id, amount: 0.01, paymentRef: "E3-4" }), /payment_exceeds_approved/);
  store.close();
});

test("E4: reconciliation mismatch lifecycle — mismatch is preserved, correction is a NEW record, both stay on the books", (t) => {
  const store = openDb(t);
  const project = driveToInProgress(store, "handoff-e4");
  const finance = setupFinance(store);
  const invoice = approvedInvoice(finance, project.id, "INV-E4", [{ description: "Work", amount: 12000 }]);
  const draw = approvedDraw(finance, project.id, { amount: 10000, invoiceIds: [invoice.id] });
  const { payment } = finance.recordPayment({ projectId: project.id, actor: PM, drawId: draw.id, amount: 10000, paymentRef: "E4-1" });
  const mismatch = finance.recordReconciliation({ projectId: project.id, actor: PM, paymentId: payment.id, bankRecord: { amount: 9950, reference: "stmt-short" } });
  assert.equal(mismatch.state, "mismatch");
  assert.equal(finance.getProjectFinancials(project.id).reconciled, 0);
  // correction arrives as a second, separate caller record
  const corrected = finance.recordReconciliation({ projectId: project.id, actor: PM, paymentId: payment.id, bankRecord: { amount: 10000, reference: "stmt-corrected" } });
  assert.equal(corrected.state, "reconciled");
  const all = finance.listReconciliations(project.id);
  assert.equal(all.length, 2);
  assert.deepEqual(all.map(r => r.state), ["mismatch", "reconciled"]);
  // the original mismatch is preserved verbatim — not edited, not deleted
  assert.equal(all[0].callerAmount, 9950);
  assert.equal(all[0].paymentAmount, 10000);
  assert.deepEqual(all[0].callerRecord, { amount: 9950, reference: "stmt-short" });
  assert.equal(all.every(r => r.bankVerified === false), true);
  assert.equal(finance.getProjectFinancials(project.id).reconciled, 10000);
  store.close();
});

test("E5: invalid amounts are refused at the service layer — zero, negative, NaN, Infinity, non-numeric strings", (t) => {
  const store = openDb(t);
  const project = driveToInProgress(store, "handoff-e5");
  const finance = setupFinance(store);
  const invoice = approvedInvoice(finance, project.id, "INV-E5", [{ description: "Work", amount: 12000 }]);
  const draw = approvedDraw(finance, project.id, { amount: 5000, invoiceIds: [invoice.id] });
  for (const [label, amount] of [["zero", 0], ["negative", -100], ["NaN", NaN], ["Infinity", Infinity], ["-Infinity", -Infinity]]) {
    assert.throws(() => finance.recordPayment({ projectId: project.id, actor: PM, drawId: draw.id, amount, paymentRef: `E5-${label}` }), /invalid_amount/, `payment amount ${label}`);
  }
  assert.throws(() => finance.submitInvoice({ projectId: project.id, actor: PM, contractor: "Acme Builders", externalNumber: "INV-E5-NAN", lineItems: [{ description: "Work", amount: NaN }], evidenceRefs: ["evidence://x"] }), /invalid_amount/);
  assert.throws(() => finance.submitInvoice({ projectId: project.id, actor: PM, contractor: "Acme Builders", externalNumber: "INV-E5-ABC", lineItems: [{ description: "Work", amount: "abc" }], evidenceRefs: ["evidence://x"] }), /invalid_amount/);
  assert.throws(() => finance.submitInvoice({ projectId: project.id, actor: PM, contractor: "Acme Builders", externalNumber: "INV-E5-NEG", lineItems: [{ description: "Work", amount: -100 }], evidenceRefs: ["evidence://x"] }), /invoice_total_required/);
  assert.throws(() => finance.requestDraw({ projectId: project.id, actor: PM, amount: 0, percentComplete: 50, evidenceRefs: ["evidence://p"], invoiceIds: [invoice.id], reason: "zero" }), /draw_amount_required/);
  assert.throws(() => finance.requestDraw({ projectId: project.id, actor: PM, amount: "abc", percentComplete: 50, evidenceRefs: ["evidence://p"], invoiceIds: [invoice.id], reason: "nan" }), /invalid_number/);
  // none of the refused attempts wrote anything
  assert.equal(finance.getProjectFinancials(project.id).paid, 0);
  assert.equal(finance.listInvoices(project.id).length, 1);
  store.close();
});

test("E6: numeric strings are REJECTED, not coerced (defect OBS-E1); cent integrity is exact for 0.1-class values", (t) => {
  const store = openDb(t);
  const project = driveToInProgress(store, "handoff-e6");
  const finance = setupFinance(store);
  // AMENDMENT — re-chartered by coordinator 2026-11-03 under §4/§7.
  // Original pin: the finance layer's cents() ran Number(value), so
  // submitInvoice with line-item amount "1234.56" SUCCEEDED with
  // total === 1234.56 (numeric-string coercion, observation OBS-E1).
  // New expectation: caller-supplied amounts must be JSON numbers —
  // the same submission is refused with invalid_amount and writes
  // nothing.
  assert.throws(
    () => finance.submitInvoice({ projectId: project.id, actor: PM, contractor: "Acme Builders", externalNumber: "INV-E6-STR", lineItems: [{ description: "Work", amount: "1234.56" }], evidenceRefs: ["evidence://x"] }),
    /invalid_amount/,
  );
  assert.equal(finance.listInvoices(project.id).length, 0);

  // float integrity: 0.1-class values reconcile EXACTLY through the whole
  // chain because amounts are cent-rounded at ingestion and at read.
  const cents1 = approvedInvoice(finance, project.id, "INV-E6A", [{ description: "a", amount: 0.1 }, { description: "b", amount: 0.2 }]);
  assert.equal(cents1.total, 0.3);
  const draw = approvedDraw(finance, project.id, { amount: 0.3, invoiceIds: [cents1.id] });
  finance.recordPayment({ projectId: project.id, actor: PM, drawId: draw.id, amount: 0.1, paymentRef: "E6-1" });
  finance.recordPayment({ projectId: project.id, actor: PM, drawId: draw.id, amount: 0.2, paymentRef: "E6-2" });
  assert.deepEqual(finance.getDrawFinancials(draw.id), { drawId: draw.id, approved: 0.3, allocated: 0.3, paid: 0.3, reconciled: 0, outstanding: 0 });
  // extreme magnitude: MAX_SAFE_INTEGER is stored exactly; a +0.01 line is
  // absorbed because JS doubles cannot represent the difference at that
  // magnitude at all (the plain-JS sum is the same double) — no silent
  // corruption by the store, and no guard exists either (OBS-E2).
  const big = finance.submitInvoice({ projectId: project.id, actor: PM, contractor: "Acme Builders", externalNumber: "INV-E6-BIG", lineItems: [{ description: "Huge", amount: Number.MAX_SAFE_INTEGER }, { description: "Cent", amount: 0.01 }], evidenceRefs: ["evidence://x"] });
  assert.equal(big.total, Number.MAX_SAFE_INTEGER + 0.01); // identical doubles: the cent is unrepresentable, in JS itself
  store.close();
});

test("E7: invalid amounts over HTTP — zero/negative/missing are 400s with the service's codes; a huge JSON number hits the approval cap, not a crash", async (t) => {
  const store = openDb(t);
  const project = driveToInProgress(store, "handoff-e7");
  const finance = setupFinance(store);
  const invoice = approvedInvoice(finance, project.id, "INV-E7", [{ description: "Work", amount: 12000 }]);
  const draw = approvedDraw(finance, project.id, { amount: 5000, invoiceIds: [invoice.id] });
  const app = createMissionControlServer({ store, operatorToken: OPERATOR_TOKEN, handoffSecret: "hs" });
  await new Promise(resolve => app.server.listen(0, "127.0.0.1", resolve));
  t.after(() => app.server.close());
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const pay = (body) => fetch(`${base}/api/projects/${project.id}/draws/${draw.id}/payments`, {
    method: "POST",
    headers: { authorization: `Bearer ${OPERATOR_TOKEN}`, "content-type": "application/json", "x-actor-id": PM },
    body: JSON.stringify(body),
  });
  let res = await pay({ amount: 0, paymentRef: "E7-zero" });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error, "invalid_amount");
  res = await pay({ amount: -5, paymentRef: "E7-neg" });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error, "invalid_amount");
  res = await pay({ paymentRef: "E7-missing" });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error, "invalid_amount");
  res = await pay({ amount: 1e100, paymentRef: "E7-huge" });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error, "payment_exceeds_approved");
  // AMENDMENT — re-chartered by coordinator 2026-11-03 under §4/§7.
  // Original pin (OBS-E1 at the HTTP boundary): a numeric STRING
  // amount was accepted and coerced by the service layer — the same
  // request returned 201 and the draw's paid total became 2500.
  // New expectation: 400 invalid_amount, and nothing is recorded.
  res = await pay({ amount: "2500", paymentRef: "E7-string" });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error, "invalid_amount");
  assert.equal(finance.getDrawFinancials(draw.id).paid, 0);
  store.close();
});
