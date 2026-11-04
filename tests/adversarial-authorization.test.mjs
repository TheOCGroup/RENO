import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { connect } from "node:net";
import { MissionControlStore } from "../src/missionControlStore.mjs";
import { MissionControlFinance } from "../src/financialGovernance.mjs";
import { createMissionControlServer } from "../src/missionControlServer.mjs";
import { receiveClosedAcquisition } from "../src/missionControlIntake.mjs";

// ADVERSARIAL FAMILY C — authorization abuse (§7): role escalation at the
// service and HTTP layers, forged identity claims, token attacks, and
// approval manufactured by direct ledger writes.

const PM = "pm-1";       // operator, submits/requests
const BOSS = "boss-1";   // approver
const ADMIN = "admin-1"; // admin
const CLERK = "clerk-1"; // operator, never an approver
const OPERATOR_TOKEN = "test-operator-token";
const HANDOFF_SECRET = "test-handoff-secret";

function payload(id) {
  return {
    contractVersion: "1.0", sourceSystem: "pipeline", targetSystem: "mission-control",
    opportunityId: id, opportunityCode: `OCG-${id}`, propertyId: `property-${id}`, address: "300 Authority Blvd",
    closedAt: "2026-09-25T16:00:00Z",
    acquisition: { purchasePrice: 150000, earnestMoney: 1000, strategyType: "cash_purchase", offerId: "offer-1", offerVersionId: "version-1" },
    underwriting: { sourceSystem: "deal-scout", sourceUnderwritingId: "victor-1", arv: 260000, rehab: 48000, mao: 160000, confidence: 0.9, limitations: null },
    renovationSeed: { budgetBaseline: 48000, scopeStatus: "needs_field_validation", projectStatus: "intake_ready" }
  };
}

function openDb(t) {
  const dir = mkdtempSync(join(tmpdir(), "mc-adv-c-"));
  const path = join(dir, "mission-control.db");
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return new MissionControlStore(path);
}

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
  finance.setActorRole({ actorId: ADMIN, role: "admin" });
  finance.setActorRole({ actorId: CLERK, role: "operator" });
  return finance;
}

function pendingDraw(finance, projectId, { requester = PM, number = "INV-C", total = 15000, amount = 10000 } = {}) {
  const invoice = finance.submitInvoice({ projectId, actor: PM, contractor: "Acme Builders", externalNumber: number, lineItems: [{ description: "Roofing", amount: total }], evidenceRefs: [`evidence://${number}`] });
  finance.reviewInvoice({ projectId, actor: BOSS, invoiceId: invoice.id, decision: "approved", rationale: "Verified" });
  const { draw } = finance.requestDraw({ projectId, actor: requester, amount, percentComplete: 50, evidenceRefs: ["evidence://progress-50"], invoiceIds: [invoice.id], reason: "Progress" });
  return { invoice, draw };
}

test("C1: role escalation at the service layer — operators, roleless actors, and self-approving approvers are all refused", (t) => {
  const store = openDb(t);
  const project = driveToInProgress(store, "handoff-c1");
  const finance = setupFinance(store);
  const { draw } = pendingDraw(finance, project.id);
  // an operator who is not the requester still cannot decide
  assert.throws(() => finance.decideDraw({ projectId: project.id, actor: CLERK, drawId: draw.id, decision: "approved", rationale: "ok" }), /approver_role_required/);
  // an actor with NO configured role has no approval power
  assert.throws(() => finance.decideDraw({ projectId: project.id, actor: "ghost-actor", drawId: draw.id, decision: "approved", rationale: "ok" }), /approver_role_required/);
  // the requester cannot decide even though PM is a legitimate operator
  assert.throws(() => finance.decideDraw({ projectId: project.id, actor: PM, drawId: draw.id, decision: "approved", rationale: "ok" }), /self_approval_forbidden/);
  assert.equal(finance.getDraw(draw.id).status, "pending");
  // control: an admin who is not the requester CAN decide — the gate is role+independence, not a blanket refusal
  finance.decideDraw({ projectId: project.id, actor: ADMIN, drawId: draw.id, decision: "approved", rationale: "Verified" });
  assert.equal(finance.getDraw(draw.id).status, "approved");
  // reversal is an approver act too: an operator cannot reverse, and the
  // reversal path re-checks independence (the draw's requester is PM here,
  // so BOSS reversing is independence-clean but CLERK lacks the role)
  const { decision } = { decision: finance.listDecisions(draw.id)[0] };
  assert.throws(() => finance.reverseDecision({ projectId: project.id, actor: CLERK, decisionId: decision.id, rationale: "undo" }), /approver_role_required/);
  store.close();
});

test("C2: an approver who requested a draw cannot decide it, even holding the approver role; a second approver can", (t) => {
  const store = openDb(t);
  const project = driveToInProgress(store, "handoff-c2");
  const finance = setupFinance(store);
  const { draw } = pendingDraw(finance, project.id, { requester: BOSS, number: "INV-C2" });
  assert.throws(() => finance.decideDraw({ projectId: project.id, actor: BOSS, drawId: draw.id, decision: "approved", rationale: "mine" }), /self_approval_forbidden/);
  const { decision } = finance.decideDraw({ projectId: project.id, actor: ADMIN, drawId: draw.id, decision: "approved", rationale: "Independent review" });
  assert.equal(decision.actor, ADMIN);
  store.close();
});

// DEFECT C-1 (see UNIT-4-RECORD): the charter requires that no approval be
// manufacturable through direct ledger registration — a payment must rest
// on a governed decision record. This test asserts that charter behavior.
test("C3 DEFECT: a draw row forged directly into the ledger (status 'approved', NO decision record) must not be payable", (t) => {
  const store = openDb(t);
  const project = driveToInProgress(store, "handoff-c3");
  const finance = setupFinance(store);
  const { invoice } = pendingDraw(finance, project.id, { number: "INV-C3" });
  const forgedId = randomUUID();
  store.db.prepare("INSERT INTO governed_draws (id, tenant_id, project_id, requested_by, requested_amount, approved_amount, percent_complete, retainage_pct, evidence_refs_json, invoice_ids_json, reason, status, idempotency_key, created_at) VALUES (?, ?, ?, 'mallory', 5000, 5000, 50, 10, '[\"evidence://x\"]', ?, 'forged', 'approved', NULL, '2026-10-02T00:00:00Z')")
    .run(forgedId, store.defaultTenantId, project.id, JSON.stringify([invoice.id]));
  assert.equal(finance.listDecisions(forgedId).length, 0, "precondition: the forged draw has no decision record");
  assert.throws(
    () => finance.recordPayment({ projectId: project.id, actor: "mallory", drawId: forgedId, amount: 5000, paymentRef: "FORGED-C3" }),
    /draw_not_approved/,
    "a draw with no governed decision record must not be payable",
  );
  assert.equal(finance.getProjectFinancials(project.id).approved, 0, "a forged draw must not count as approved money");
  store.close();
});

test("C4: a forged DECISION row alone confers nothing — the draw stays unpayable until a governed decision lands", (t) => {
  const store = openDb(t);
  const project = driveToInProgress(store, "handoff-c4");
  const finance = setupFinance(store);
  const { draw } = pendingDraw(finance, project.id, { number: "INV-C4" });
  store.db.prepare("INSERT INTO draw_decisions (id, tenant_id, project_id, draw_id, actor, decision, approved_amount, rationale, reverses_decision_id, created_at) VALUES (?, ?, ?, ?, 'mallory', 'approved', 10000, 'forged decision', NULL, '2026-10-02T00:00:00Z')")
    .run(randomUUID(), store.defaultTenantId, project.id, draw.id);
  assert.throws(() => finance.recordPayment({ projectId: project.id, actor: "mallory", drawId: draw.id, amount: 100, paymentRef: "FORGED-C4" }), /draw_not_approved/);
  // the governed path still works afterwards and is the only thing that unlocks payment
  finance.decideDraw({ projectId: project.id, actor: BOSS, drawId: draw.id, decision: "approved", rationale: "Governed review" });
  const { payment } = finance.recordPayment({ projectId: project.id, actor: PM, drawId: draw.id, amount: 100, paymentRef: "REAL-C4" });
  assert.equal(payment.amount, 100);
  // characterization: the forged row remains visible in the append-only
  // ledger read (2 rows) — it pollutes the record but conferred no power.
  assert.equal(finance.listDecisions(draw.id).length, 2);
  store.close();
});

test("C5: an invoice flipped to 'approved' by a direct ledger write (no review) is NOT trusted by draw requests — approval requires the governed review record (defect U4-1, invoice half)", (t) => {
  const store = openDb(t);
  const project = driveToInProgress(store, "handoff-c5");
  const finance = setupFinance(store);
  const invoice = finance.submitInvoice({ projectId: project.id, actor: PM, contractor: "Acme Builders", externalNumber: "INV-C5", lineItems: [{ description: "Roofing", amount: 15000 }], evidenceRefs: ["evidence://inv-c5"] });
  // no reviewInvoice call: the status (and reviewer fields) are written directly
  store.db.prepare("UPDATE invoices SET status = 'approved', reviewed_by = 'mallory', reviewed_at = '2026-10-02T00:00:00Z' WHERE id = ?").run(invoice.id);
  // AMENDMENT — re-chartered by coordinator 2026-11-03 under §4/§7.
  // Original pin: governance validated the status column alone, so the
  // draw request SUCCEEDED (draw pending) even though the financial
  // audit chain holds no invoice_reviewed event for this invoice.
  // New expectation: approval is derived from the append-only record,
  // mirroring the draw side — with no corroborating invoice_reviewed
  // audit event recorded by the named reviewer, requestDraw refuses
  // with invoice_not_approved and writes no draw.
  assert.equal(finance.listAudit(project.id).some(row => row.event_type === "invoice_reviewed" && row.entity_id === invoice.id), false);
  assert.throws(
    () => finance.requestDraw({ projectId: project.id, actor: PM, amount: 5000, percentComplete: 50, evidenceRefs: ["evidence://progress-50"], invoiceIds: [invoice.id], reason: "Progress" }),
    /invoice_not_approved/,
  );
  assert.equal(finance.listDraws(project.id).length, 0);
  // positive control: an invoice approved through the governed review
  // path (reviewInvoice by BOSS, a non-submitter) still funds a draw.
  const legit = finance.submitInvoice({ projectId: project.id, actor: PM, contractor: "Acme Builders", externalNumber: "INV-C5-LEGIT", lineItems: [{ description: "Roofing", amount: 15000 }], evidenceRefs: ["evidence://inv-c5-legit"] });
  finance.reviewInvoice({ projectId: project.id, actor: BOSS, invoiceId: legit.id, decision: "approved", rationale: "Verified" });
  const { draw } = finance.requestDraw({ projectId: project.id, actor: PM, amount: 5000, percentComplete: 50, evidenceRefs: ["evidence://progress-50"], invoiceIds: [legit.id], reason: "Progress" });
  assert.equal(draw.status, "pending");
  store.close();
});

async function startApp(t, store) {
  const app = createMissionControlServer({ store, operatorToken: OPERATOR_TOKEN, handoffSecret: HANDOFF_SECRET });
  await new Promise(resolve => app.server.listen(0, "127.0.0.1", resolve));
  t.after(() => app.server.close());
  return { ...app, base: `http://127.0.0.1:${app.server.address().port}` };
}

test("C6: token attacks — missing, short, long, unicode, and near-miss tokens all get 401; each secret opens only its own door", async (t) => {
  const store = openDb(t);
  const app = await startApp(t, store);
  const badTokens = [null, "x", "a".repeat(4096), ` ${OPERATOR_TOKEN}`, OPERATOR_TOKEN.toUpperCase(), "Bearer"];
  for (const bad of badTokens) {
    const headers = bad === null ? {} : { authorization: bad === "Bearer" ? "Bearer" : `Bearer ${bad}` };
    const res = await fetch(`${app.base}/api/projects`, { headers });
    assert.equal(res.status, 401, `token ${JSON.stringify(String(bad).slice(0, 24))} must be refused`);
    assert.equal((await res.json()).error, "unauthorized");
  }
  // a non-latin1 (unicode) bearer token cannot even be expressed by fetch —
  // send it as raw bytes over a socket, the way a real client could.
  const port = app.server.address().port;
  const rawResponse = await new Promise((resolve, reject) => {
    const socket = connect(port, "127.0.0.1", () => {
      socket.write(Buffer.concat([
        Buffer.from("GET /api/projects HTTP/1.1\r\nhost: 127.0.0.1\r\nconnection: close\r\nauthorization: Bearer ", "utf8"),
        Buffer.from("🔑-unicode-token", "utf8"),
        Buffer.from("\r\n\r\n", "utf8"),
      ]));
    });
    const chunks = [];
    socket.on("data", chunk => chunks.push(chunk));
    socket.on("end", () => resolve(Buffer.concat(chunks).toString("latin1")));
    socket.on("error", reject);
  });
  assert.match(rawResponse, /^HTTP\/1\.1 401 /, "a unicode bearer token must be refused");
  // characterization (probed at the wire): a token followed by trailing
  // space/tab is INDISTINGUISHABLE from the exact token — HTTP field-value
  // parsing strips trailing optional whitespace before the application
  // sees the header (RFC 9110), so the compare stays exact over the
  // parsed value. An interior deviation (double space after "Bearer",
  // a suffix character) IS refused, as the fetch cases above prove.
  const rawTrailing = await new Promise((resolve, reject) => {
    const socket = connect(port, "127.0.0.1", () => {
      socket.write(`GET /api/projects HTTP/1.1\r\nhost: 127.0.0.1\r\nconnection: close\r\nauthorization: Bearer ${OPERATOR_TOKEN} \r\n\r\n`);
    });
    const chunks = [];
    socket.on("data", chunk => chunks.push(chunk));
    socket.on("end", () => resolve(Buffer.concat(chunks).toString("latin1")));
    socket.on("error", reject);
  });
  assert.match(rawTrailing, /^HTTP\/1\.1 200 /, "trailing OWS is normalized away by HTTP parsing itself");
  // the correct token still works (no lockout / no state corruption from the attacks)
  const ok = await fetch(`${app.base}/api/projects`, { headers: { authorization: `Bearer ${OPERATOR_TOKEN}` } });
  assert.equal(ok.status, 200);
  // cross-use: the handoff secret does not open the operator API
  const cross1 = await fetch(`${app.base}/api/projects`, { headers: { authorization: `Bearer ${HANDOFF_SECRET}` } });
  assert.equal(cross1.status, 401);
  // ...and the operator token does not open the handoff path, creating nothing
  const cross2 = await fetch(`${app.base}/api/v1/integrations/pipeline/acquisition-handoff`, {
    method: "POST", headers: { authorization: `Bearer ${OPERATOR_TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify({ handoffId: "handoff-c6", payload: payload("opp-c6") }),
  });
  assert.equal(cross2.status, 401);
  assert.equal(store.findProjectBySourceHandoffId("handoff-c6"), null);
  store.close();
});

test("C7: forged role claims over HTTP are refused; the service's own gates still decide real requests", async (t) => {
  const store = openDb(t);
  const project = driveToInProgress(store, "handoff-c7");
  const app = await startApp(t, store);
  const finance = app.finance;
  finance.setActorRole({ actorId: PM, role: "operator" });
  finance.setActorRole({ actorId: BOSS, role: "approver" });
  finance.setActorRole({ actorId: CLERK, role: "operator" });
  const { draw } = pendingDraw(finance, project.id, { number: "INV-C7" });
  const decide = (actorId, role) => fetch(`${app.base}/api/projects/${project.id}/draws/${draw.id}/decide`, {
    method: "POST",
    headers: { authorization: `Bearer ${OPERATOR_TOKEN}`, "content-type": "application/json", "x-actor-id": actorId, ...(role ? { "x-actor-role": role } : {}) },
    body: JSON.stringify({ decision: "approved", rationale: "attempt" }),
  });
  // an operator claiming to be an approver: the claim contradicts the store record
  let res = await decide(CLERK, "approver");
  assert.equal(res.status, 403);
  assert.equal((await res.json()).error, "actor_role_mismatch");
  // an actor with NO store record claiming admin
  res = await decide("ghost-actor", "admin");
  assert.equal(res.status, 403);
  assert.equal((await res.json()).error, "actor_role_mismatch");
  // the real approver overstating her role (claims admin, recorded approver)
  res = await decide(BOSS, "admin");
  assert.equal(res.status, 403);
  assert.equal((await res.json()).error, "actor_role_mismatch");
  // an honest operator claim still hits the SERVICE gate (role is real but insufficient)
  res = await decide(CLERK, "operator");
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error, "approver_role_required");
  // the requester claiming their true role still hits self-approval
  res = await decide(PM, "operator");
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error, "self_approval_forbidden");
  // the approver claiming her recorded role succeeds
  res = await decide(BOSS, "approver");
  assert.equal(res.status, 200);
  assert.equal(finance.getDraw(draw.id).status, "approved");
  store.close();
});
