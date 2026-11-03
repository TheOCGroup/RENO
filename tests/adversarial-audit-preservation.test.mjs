import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MissionControlStore } from "../src/missionControlStore.mjs";
import { MissionControlFinance } from "../src/financialGovernance.mjs";
import { receiveClosedAcquisition } from "../src/missionControlIntake.mjs";

// ADVERSARIAL FAMILY H — audit preservation (§7): the events stream and
// the hash-chained financial audit survive restart at scale, tampering
// is detected, stream rows cannot be deleted at all, and a shortened
// in-memory history is refused by the store's rewrite guard.

const PM = "pm-1";
const BOSS = "boss-1";

function payload(id) {
  return {
    contractVersion: "1.0", sourceSystem: "pipeline", targetSystem: "mission-control",
    opportunityId: id, opportunityCode: `OCG-${id}`, propertyId: `property-${id}`, address: "800 Audit Alley",
    closedAt: "2026-09-25T16:00:00Z",
    acquisition: { purchasePrice: 150000, earnestMoney: 1000, strategyType: "cash_purchase", offerId: "offer-1", offerVersionId: "version-1" },
    underwriting: { sourceSystem: "deal-scout", sourceUnderwritingId: "victor-1", arv: 260000, rehab: 48000, mao: 160000, confidence: 0.9, limitations: null },
    renovationSeed: { budgetBaseline: 48000, scopeStatus: "needs_field_validation", projectStatus: "intake_ready" }
  };
}

function tempPath(t) {
  const dir = mkdtempSync(join(tmpdir(), "mc-adv-h-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return join(dir, "mission-control.db");
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
  return finance;
}

/** Generate two audit rows per invoice (submitted + reviewed). */
function invoiceCycle(finance, projectId, n) {
  const invoice = finance.submitInvoice({ projectId, actor: PM, contractor: "Acme Builders", externalNumber: `INV-H-${n}`, lineItems: [{ description: "Work", amount: 100 }], evidenceRefs: [`evidence://inv-h-${n}`] });
  finance.reviewInvoice({ projectId, actor: BOSS, invoiceId: invoice.id, decision: "approved", rationale: "Verified" });
  return invoice;
}

function eventCounts(store, projectId) {
  const rows = store.db.prepare("SELECT stream, COUNT(*) AS c FROM events WHERE project_id = ? GROUP BY stream").all(projectId);
  const out = { workflow: 0, operations: 0 };
  for (const row of rows) out[row.stream] = row.c;
  return out;
}

test("H1: a 100+ event audit chain verifies, survives a restart intact, and its sequences stay contiguous", (t) => {
  const path = tempPath(t);
  let store = new MissionControlStore(path);
  const project = driveToInProgress(store, "handoff-h1");
  let finance = setupFinance(store);
  for (let i = 0; i < 60; i++) invoiceCycle(finance, project.id, i);
  const auditBefore = finance.listAudit(project.id);
  assert.ok(auditBefore.length >= 100, `expected 100+ audit rows, got ${auditBefore.length}`);
  assert.deepEqual(auditBefore.map(r => r.seq), Array.from({ length: auditBefore.length }, (_, i) => i + 1), "audit seq must be contiguous from 1");
  assert.equal(finance.verifyAuditChain(project.id), true);
  const streamBefore = eventCounts(store, project.id);
  assert.ok(streamBefore.operations >= 100);
  const workflowEventsBefore = store.loadWorkflowState(project.id).state.events.length;
  const operationsEventsBefore = store.loadOperationsState(project.id).state.events.length;
  store.close();

  store = new MissionControlStore(path);
  finance = new MissionControlFinance(store);
  const auditAfter = finance.listAudit(project.id);
  assert.equal(auditAfter.length, auditBefore.length);
  assert.deepEqual(auditAfter.map(r => [r.seq, r.hash]), auditBefore.map(r => [r.seq, r.hash]), "every audit hash must survive the restart byte-identically");
  assert.equal(finance.verifyAuditChain(project.id), true);
  assert.deepEqual(eventCounts(store, project.id), streamBefore);
  assert.equal(store.loadWorkflowState(project.id).state.events.length, workflowEventsBefore);
  assert.equal(store.loadOperationsState(project.id).state.events.length, operationsEventsBefore);
  store.close();
});

test("H2: tampering at scale is detected — a mutated payload and a deleted middle row both break verification", (t) => {
  // mutation
  let path = tempPath(t);
  let store = new MissionControlStore(path);
  let project = driveToInProgress(store, "handoff-h2a");
  let finance = setupFinance(store);
  for (let i = 0; i < 30; i++) invoiceCycle(finance, project.id, i);
  assert.equal(finance.listAudit(project.id).length, 60);
  assert.equal(finance.verifyAuditChain(project.id), true);
  store.db.prepare("UPDATE financial_audit SET payload_json = ? WHERE project_id = ? AND seq = 47").run('{"eventType":"invoice_submitted","actor":"mallory","total":1}', project.id);
  assert.equal(finance.verifyAuditChain(project.id), false);
  store.close();

  // deletion of a middle row (seq 30 of 60)
  path = tempPath(t);
  store = new MissionControlStore(path);
  project = driveToInProgress(store, "handoff-h2b");
  finance = setupFinance(store);
  for (let i = 0; i < 30; i++) invoiceCycle(finance, project.id, i);
  assert.equal(finance.verifyAuditChain(project.id), true);
  store.db.prepare("DELETE FROM financial_audit WHERE project_id = ? AND seq = 30").run(project.id);
  assert.equal(finance.verifyAuditChain(project.id), false);
  store.close();
});

test("H3: the events stream refuses deletion outright, and the store's rewrite guard refuses a shortened in-memory history", (t) => {
  const path = tempPath(t);
  const store = new MissionControlStore(path);
  const project = driveToInProgress(store, "handoff-h3");
  const finance = setupFinance(store);
  // put governed finance events into the operations stream
  const invoice = invoiceCycle(finance, project.id, 900);
  const { draw } = finance.requestDraw({ projectId: project.id, actor: PM, amount: 100, percentComplete: 50, evidenceRefs: ["evidence://progress-50"], invoiceIds: [invoice.id], reason: "Progress" });
  finance.decideDraw({ projectId: project.id, actor: BOSS, drawId: draw.id, decision: "approved", rationale: "Verified" });

  // raw deletion/update of stream rows is refused by the schema triggers
  assert.throws(() => store.db.prepare("DELETE FROM events WHERE project_id = ? AND stream = 'operations' AND seq = 2").run(project.id), /events_append_only/);
  assert.throws(() => store.db.prepare("UPDATE events SET type = 'forged' WHERE project_id = ? AND stream = 'workflow' AND seq = 1").run(project.id), /events_append_only/);

  // operations stream: present a restored instance whose in-memory
  // history has been truncated (a buggy or hostile client of the store)
  const wf = store.restoreWorkflow(project.id);
  const operations = store.restoreOperations(wf);
  const storedOpsCount = store.loadOperationsState(project.id).state.events.length;
  const versionBefore = store.operationsVersion(project.id);
  operations.events.splice(0, 2);
  assert.throws(() => store.persistOperations(operations), /event_history_rewrite/);
  // the refused save rolled back completely: version and history intact
  assert.equal(store.operationsVersion(project.id), versionBefore);
  assert.equal(store.loadOperationsState(project.id).state.events.length, storedOpsCount);

  // workflow stream: same guard on the other stream
  const wf2 = store.restoreWorkflow(project.id);
  const storedWfCount = store.loadWorkflowState(project.id).state.events.length;
  const wfVersionBefore = store.workflowVersion(project.id);
  wf2.events.splice(0, 1);
  assert.throws(() => store.persistWorkflow(wf2), /event_history_rewrite/);
  assert.equal(store.workflowVersion(project.id), wfVersionBefore);
  assert.equal(store.loadWorkflowState(project.id).state.events.length, storedWfCount);
  store.close();
});

test("H4: the full stack's two records (audit chain + events stream) co-survive a restart with counts and order intact", (t) => {
  const path = tempPath(t);
  let store = new MissionControlStore(path);
  const project = driveToInProgress(store, "handoff-h4");
  let finance = setupFinance(store);
  const invoice = invoiceCycle(finance, project.id, 400);
  const { draw } = finance.requestDraw({ projectId: project.id, actor: PM, amount: 100, percentComplete: 50, evidenceRefs: ["evidence://progress-50"], invoiceIds: [invoice.id], reason: "Progress" });
  finance.decideDraw({ projectId: project.id, actor: BOSS, drawId: draw.id, decision: "approved", rationale: "Verified" });
  const { payment } = finance.recordPayment({ projectId: project.id, actor: PM, drawId: draw.id, amount: 100, paymentRef: "ACH-H4" });
  finance.recordReconciliation({ projectId: project.id, actor: PM, paymentId: payment.id, bankRecord: { amount: 100, reference: "stmt-h4" } });

  const auditTypesBefore = finance.listAudit(project.id).map(r => r.event_type);
  const streamTypesBefore = store.db.prepare("SELECT stream, type FROM events WHERE project_id = ? ORDER BY stream, seq").all(project.id).map(r => `${r.stream}:${r.type}`);
  assert.equal(finance.verifyAuditChain(project.id), true);
  store.close();

  store = new MissionControlStore(path);
  finance = new MissionControlFinance(store);
  assert.deepEqual(finance.listAudit(project.id).map(r => r.event_type), auditTypesBefore);
  assert.deepEqual(
    store.db.prepare("SELECT stream, type FROM events WHERE project_id = ? ORDER BY stream, seq").all(project.id).map(r => `${r.stream}:${r.type}`),
    streamTypesBefore,
  );
  assert.equal(finance.verifyAuditChain(project.id), true);
  // every governance event type is present in BOTH records of the truth
  for (const type of ["invoice_submitted", "invoice_reviewed", "draw_requested", "draw_decided", "draw_allocated", "payment_recorded", "reconciliation_recorded"]) {
    assert.ok(auditTypesBefore.includes(type), `audit missing ${type}`);
    assert.ok(streamTypesBefore.includes(`operations:${type}`), `stream missing ${type}`);
  }
  store.close();
});
