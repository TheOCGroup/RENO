import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MissionControlStore } from "../src/missionControlStore.mjs";
import { MissionControlFinance } from "../src/financialGovernance.mjs";
import { MissionControlOperationsCompletion, projectHealth } from "../src/operationsCompletion.mjs";
import { createMissionControlServer } from "../src/missionControlServer.mjs";
import { receiveClosedAcquisition } from "../src/missionControlIntake.mjs";

// ADVERSARIAL FAMILY F — evidence + handoff integrity (§7): no financial
// or completion act without its evidence; the pipeline handoff contract
// rejects tampered payloads; exit readiness never outruns the evidence.

const PM = "pm-1";
const BOSS = "boss-1";
const HANDOFF_SECRET = "test-handoff-secret";

function payload(id) {
  return {
    contractVersion: "1.0", sourceSystem: "pipeline", targetSystem: "mission-control",
    opportunityId: id, opportunityCode: `OCG-${id}`, propertyId: `property-${id}`, address: "600 Evidence St",
    closedAt: "2026-09-25T16:00:00Z",
    acquisition: { purchasePrice: 150000, earnestMoney: 1000, strategyType: "cash_purchase", offerId: "offer-1", offerVersionId: "version-1" },
    underwriting: { sourceSystem: "deal-scout", sourceUnderwritingId: "victor-1", arv: 260000, rehab: 48000, mao: 160000, confidence: 0.9, limitations: null },
    renovationSeed: { budgetBaseline: 48000, scopeStatus: "needs_field_validation", projectStatus: "intake_ready" }
  };
}

function openDb(t) {
  const dir = mkdtempSync(join(tmpdir(), "mc-adv-f-"));
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
  return finance;
}

test("F1: no evidence, no act — draws, progress, inspections, corrections, and completion all refuse evidence-free attempts", (t) => {
  const store = openDb(t);
  const project = driveToInProgress(store, "handoff-f1");
  const finance = setupFinance(store);
  const ops = new MissionControlOperationsCompletion(store);
  const invoice = finance.submitInvoice({ projectId: project.id, actor: PM, contractor: "Acme Builders", externalNumber: "INV-F1", lineItems: [{ description: "Work", amount: 15000 }], evidenceRefs: ["evidence://inv-f1"] });
  finance.reviewInvoice({ projectId: project.id, actor: BOSS, invoiceId: invoice.id, decision: "approved", rationale: "Verified" });

  // draw without progress evidence / without invoices
  assert.throws(() => finance.requestDraw({ projectId: project.id, actor: PM, amount: 1000, percentComplete: 50, evidenceRefs: [], invoiceIds: [invoice.id], reason: "x" }), /draw_evidence_required/);
  assert.throws(() => finance.requestDraw({ projectId: project.id, actor: PM, amount: 1000, percentComplete: 50, invoiceIds: [invoice.id], reason: "x" }), /draw_evidence_required/);
  assert.throws(() => finance.requestDraw({ projectId: project.id, actor: PM, amount: 1000, percentComplete: 50, evidenceRefs: ["evidence://p"], invoiceIds: [], reason: "x" }), /draw_invoice_required/);
  // progress without evidence
  const wf = store.restoreWorkflow(project.id);
  const operations = store.restoreOperations(wf);
  assert.throws(() => operations.recordProgress({ percentComplete: 60, evidenceRefs: [] }), /progress_evidence_required/);
  // inspection: pass without evidence; fail without correction items; correction without evidence
  const inspection = ops.scheduleInspection({ projectId: project.id, actor: PM, type: "framing", scheduledFor: "2026-10-12T09:00:00Z", inspectorRef: "Inspector (as recorded)" });
  assert.throws(() => ops.recordInspectionOutcome({ projectId: project.id, actor: PM, inspectionId: inspection.id, outcome: "passed" }), /inspection_evidence_required/);
  assert.throws(() => ops.recordInspectionOutcome({ projectId: project.id, actor: PM, inspectionId: inspection.id, outcome: "failed", evidenceRef: "evidence://fail" }), /correction_items_required/);
  const failed = ops.recordInspectionOutcome({ projectId: project.id, actor: PM, inspectionId: inspection.id, outcome: "failed", evidenceRef: "evidence://fail", correctionItems: ["Add fire blocking"] });
  assert.throws(() => ops.completeCorrectionItem({ projectId: project.id, actor: PM, correctionId: failed.corrections[0].id }), /correction_evidence_required/);
  // every refused attempt left state untouched
  assert.equal(finance.listDraws(project.id).length, 0);
  assert.equal(ops.getInspection(inspection.id).status, "corrections_required");
  assert.equal(store.loadOperationsState(project.id).state.progressUpdates.length, 1);
  store.close();
});

async function startReceiver(t, store) {
  const app = createMissionControlServer({ store, operatorToken: "op-token", handoffSecret: HANDOFF_SECRET });
  await new Promise(resolve => app.server.listen(0, "127.0.0.1", resolve));
  t.after(() => app.server.close());
  return `http://127.0.0.1:${app.server.address().port}`;
}

function postHandoff(base, handoffId, body) {
  return fetch(`${base}/api/v1/integrations/pipeline/acquisition-handoff`, {
    method: "POST",
    headers: { authorization: `Bearer ${HANDOFF_SECRET}`, "content-type": "application/json" },
    body: JSON.stringify({ handoffId, payload: body }),
  });
}

test("F2: handoff tampering — every contract-identity mutation is rejected with its code; a valid replay is an idempotent duplicate", async (t) => {
  const store = openDb(t);
  const base = await startReceiver(t, store);
  const cases = [
    ["contract version bumped", p => { p.contractVersion = "2.0"; }, /unsupported_handoff_contract/],
    ["source system swapped", p => { p.sourceSystem = "deal-scout"; }, /invalid_handoff_source/],
    ["target system swapped", p => { p.targetSystem = "ocg-os"; }, /invalid_handoff_target/],
    ["scope status pre-validated", p => { p.renovationSeed.scopeStatus = "validated"; }, /field_scope_validation_required/],
    ["project status pre-completed", p => { p.renovationSeed.projectStatus = "complete"; }, /invalid_project_seed_status/],
    ["underwriting section deleted", p => { delete p.underwriting; }, /missing_underwriting/],
    ["renovation seed deleted", p => { delete p.renovationSeed; }, /missing_renovationSeed/],
    ["opportunity id blanked", p => { p.opportunityId = ""; }, /missing_opportunityId/],
    ["acquisition section deleted", p => { delete p.acquisition; }, /missing_acquisition/],
  ];
  for (const [label, mutate, pattern] of cases) {
    const tampered = payload("opp-f2");
    mutate(tampered);
    const res = await postHandoff(base, `handoff-f2-${label}`, tampered);
    assert.equal(res.status, 400, label);
    assert.match((await res.json()).error, pattern, label);
    assert.equal(store.findProjectBySourceHandoffId(`handoff-f2-${label}`), null, `${label}: nothing may be created`);
  }
  // a fabricated-but-well-formed NUMBER for ARV is accepted: provenance of
  // figures is PIPELINE/VICTOR's governed domain — no receiver can
  // adjudicate a plausible number. (Type violations are F3's subject.)
  const huge = payload("opp-f2-huge");
  huge.underwriting.arv = 999999999;
  const okRes = await postHandoff(base, "handoff-f2-huge", huge);
  assert.equal(okRes.status, 201);
  assert.equal((await okRes.json()).data.project.arvBaseline, 999999999);
  // replaying the identical handoff is a duplicate, not a second project
  const replay = await postHandoff(base, "handoff-f2-huge", huge);
  assert.equal(replay.status, 200);
  assert.equal((await replay.json()).data.duplicate, true);
  assert.equal(store.listProjects().length, 1);
  store.close();
});

// DEFECT F-1 (see UNIT-4-RECORD): the published handoff schema declares
// numeric-or-null types for the financial fields; the receiver is the
// enforcement point and does not enforce them.
test("F3 DEFECT: handoff fields violating the published schema's types (string ARV, string purchase price) must be rejected", async (t) => {
  const store = openDb(t);
  const base = await startReceiver(t, store);
  const stringArv = payload("opp-f3");
  stringArv.underwriting.arv = "nine hundred thousand";
  let res = await postHandoff(base, "handoff-f3-arv", stringArv);
  assert.equal(res.status, 400, "underwriting.arv violates the schema type [number, null] and must be refused");
  const stringPrice = payload("opp-f3b");
  stringPrice.acquisition.purchasePrice = "150000";
  res = await postHandoff(base, "handoff-f3-price", stringPrice);
  assert.equal(res.status, 400, "acquisition.purchasePrice violates the schema type [number, null] and must be refused");
  assert.equal(store.listProjects().length, 0);
  store.close();
});

test("F4: exit readiness never outruns the evidence — corrections block completion, health reports it, and the exit package is identical after a restart", (t) => {
  const store = openDb(t);
  const project = driveToInProgress(store, "handoff-f4");
  const finance = setupFinance(store);
  const ops = new MissionControlOperationsCompletion(store);
  // an approved+paid draw in the full stack, so the exit package has real finance behind it
  const invoice = finance.submitInvoice({ projectId: project.id, actor: PM, contractor: "Acme Builders", externalNumber: "INV-F4", lineItems: [{ description: "Work", amount: 15000 }], evidenceRefs: ["evidence://inv-f4"] });
  finance.reviewInvoice({ projectId: project.id, actor: BOSS, invoiceId: invoice.id, decision: "approved", rationale: "Verified" });
  const { draw } = finance.requestDraw({ projectId: project.id, actor: PM, amount: 10000, percentComplete: 50, evidenceRefs: ["evidence://progress-50"], invoiceIds: [invoice.id], reason: "Progress" });
  finance.decideDraw({ projectId: project.id, actor: BOSS, drawId: draw.id, decision: "approved", rationale: "Verified" });

  // drive to punch_list
  let wf = store.restoreWorkflow(project.id);
  wf.enterPunchList({ items: [{ title: "Final touch-up" }] });
  store.persistWorkflow(wf);
  wf = store.restoreWorkflow(project.id);
  wf.completePunchItem({ punchItemId: wf.punchItems[0].id, evidenceRef: "evidence://punch-done" });
  store.persistWorkflow(wf);

  // a failed inspection now stands between the project and completion
  const inspection = ops.scheduleInspection({ projectId: project.id, actor: PM, type: "final", scheduledFor: "2026-11-10T09:00:00Z", inspectorRef: "Inspector (as recorded)" });
  const failed = ops.recordInspectionOutcome({ projectId: project.id, actor: PM, inspectionId: inspection.id, outcome: "failed", evidenceRef: "evidence://final-fail", correctionItems: ["Repair handrail"] });
  assert.throws(() => ops.completeProject({ projectId: project.id, actor: PM, finalSpend: 49500, completionEvidenceRef: "evidence://completion" }), /inspections_not_clear/);
  assert.equal(store.restoreWorkflow(project.id).project.stage, "punch_list");
  // health reads agree: the corrections finding is present and is the next action
  const health = projectHealth(store, store.defaultTenantId, project.id, "2026-11-11T00:00:00Z");
  const finding = health.findings.find(f => f.kind === "inspections_corrections_required");
  assert.ok(finding, "health must surface the outstanding corrections");
  assert.equal(finding.severity, "high");
  assert.equal(health.nextAction, "Complete the outstanding inspection correction items.");

  // clear the corrections, re-inspect, pass — now completion is honest
  ops.completeCorrectionItem({ projectId: project.id, actor: PM, correctionId: failed.corrections[0].id, evidenceRef: "evidence://handrail-photo" });
  const reinspection = ops.scheduleInspection({ projectId: project.id, actor: PM, type: "final", scheduledFor: "2026-11-12T09:00:00Z", inspectorRef: "Inspector (as recorded)", supersedesId: inspection.id });
  ops.recordInspectionOutcome({ projectId: project.id, actor: PM, inspectionId: reinspection.id, outcome: "passed", evidenceRef: "evidence://final-pass" });
  ops.completeProject({ projectId: project.id, actor: PM, finalSpend: 49500, completionEvidenceRef: "evidence://completion" });
  wf = store.restoreWorkflow(project.id);
  wf.markExitReady({ decision: "sell", rationale: "Committee directed" });
  store.persistWorkflow(wf);

  const beforeOps = store.restoreOperations(store.restoreWorkflow(project.id));
  const beforePkg = beforeOps.exitPackage();
  store.close();

  // after a cold restart the exit package is identical (modulo its own
  // generatedAt stamp) and still backed by the same governed finance
  const reopened = new MissionControlStore(store.path);
  const afterOps = reopened.restoreOperations(reopened.restoreWorkflow(project.id));
  const afterPkg = afterOps.exitPackage();
  const { generatedAt: _g1, ...beforeRest } = beforePkg;
  const { generatedAt: _g2, ...afterRest } = afterPkg;
  assert.deepEqual(afterRest, beforeRest);
  assert.equal(afterPkg.approvedDraws, 10000);
  assert.equal(new MissionControlFinance(reopened).getProjectFinancials(project.id).approved, 10000);
  reopened.close();
});
