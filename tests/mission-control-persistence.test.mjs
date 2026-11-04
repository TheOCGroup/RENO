import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MissionControlStore } from "../src/missionControlStore.mjs";
import { receiveClosedAcquisition } from "../src/missionControlIntake.mjs";
import { RenovationWorkflow } from "../src/renovationWorkflow.mjs";

function payload() {
  return {
    contractVersion: "1.0",
    sourceSystem: "pipeline",
    targetSystem: "mission-control",
    opportunityId: "opp-777",
    opportunityCode: "OCG-777",
    propertyId: "property-777",
    address: "777 Persistence Ave",
    closedAt: "2026-09-25T16:00:00Z",
    acquisition: { purchasePrice: 150000, earnestMoney: 1000, strategyType: "cash_purchase", offerId: "offer-7", offerVersionId: "version-7" },
    underwriting: { sourceSystem: "deal-scout", sourceUnderwritingId: "victor-7", arv: 260000, rehab: 48000, mao: 160000, confidence: 0.9, limitations: null },
    renovationSeed: { budgetBaseline: 48000, scopeStatus: "needs_field_validation", projectStatus: "intake_ready" }
  };
}

function openDb(t) {
  const dir = mkdtempSync(join(tmpdir(), "mc-persist-"));
  const path = join(dir, "mission-control.db");
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return { path, open: () => new MissionControlStore(path) };
}

function seedProject(store, handoffId = "handoff-rt") {
  const { project } = receiveClosedAcquisition({ handoffId, payload: payload(), repository: store.intakeRepository() });
  return project;
}

function driveToInProgress(workflow) {
  workflow.validateScope({ items: [
    { title: "Roof replacement", category: "exterior", estimatedCost: 12000 },
    { title: "Kitchen remodel", category: "interior", estimatedCost: 30000 },
  ] });
  workflow.approveBudget({ amount: 50000, contingencyPct: 10, rationale: "Baselines verified" });
  const bid = workflow.addBid({ contractor: "Acme Builders", amount: 48000, days: 45 });
  workflow.addBid({ contractor: "Beta Construction", amount: 52000, days: 60 });
  workflow.selectBid({ bidId: bid.id, rationale: "Best coverage within authority" });
  workflow.scheduleWork({ startAt: "2026-10-01T08:00:00Z", targetCompleteAt: "2026-11-15T17:00:00Z" });
  workflow.startWork({ startedAt: "2026-10-01T08:05:00Z" });
}

test("full lifecycle resumes identically across three close/reopen restores", (t) => {
  const { open } = openDb(t);

  // --- leg 1: intake -> scope -> budget, persist, restore point 1
  let store = open();
  const project = seedProject(store);
  let workflow = store.restoreWorkflow(project.id);
  workflow.validateScope({ items: [
    { title: "Roof replacement", category: "exterior", estimatedCost: 12000 },
    { title: "Kitchen remodel", category: "interior", estimatedCost: 30000 },
  ] });
  workflow.approveBudget({ amount: 50000, contingencyPct: 10, rationale: "Baselines verified" });
  store.persistWorkflow(workflow);
  const snapshot1 = workflow.snapshot();
  store.close();

  store = open();
  workflow = store.restoreWorkflow(project.id);
  assert.deepEqual(workflow.snapshot(), snapshot1);
  assert.equal(workflow.project.stage, "bid_collection");

  // --- leg 2: bids -> schedule -> start -> change order -> progress -> draw, restore point 2
  const bid = workflow.addBid({ contractor: "Acme Builders", amount: 48000, days: 45 });
  workflow.addBid({ contractor: "Beta Construction", amount: 52000, days: 60 });
  workflow.selectBid({ bidId: bid.id, rationale: "Best coverage within authority" });
  workflow.scheduleWork({ startAt: "2026-10-01T08:00:00Z", targetCompleteAt: "2026-11-15T17:00:00Z" });
  workflow.startWork({ startedAt: "2026-10-01T08:05:00Z" });
  const changeOrder = workflow.requestChangeOrder({ title: "Panel upgrade", amount: 2000, reason: "Code requirement", evidenceRef: "evidence://panel-photo" });
  workflow.decideChangeOrder({ changeOrderId: changeOrder.id, decision: "approved", rationale: "Required for inspection" });
  store.persistWorkflow(workflow);

  let operations = store.restoreOperations(workflow);
  operations.recordProgress({ percentComplete: 50, evidenceRefs: ["evidence://progress-50"], note: "Roof done, kitchen framed" });
  const draw = operations.requestDraw({ amount: 20000, percentComplete: 50, evidenceRefs: ["evidence://progress-50"], invoiceRefs: ["invoice://acme-001"], reason: "Roof complete" });
  operations.scoreContractor({ contractor: "Acme Builders", quality: 5, schedule: 4, communication: 4, documentation: 5, safety: 5 });
  store.persistOperations(operations);

  const snapshot2 = workflow.snapshot();
  const opsState2 = {
    progressUpdates: structuredClone(operations.progressUpdates),
    drawRequests: structuredClone(operations.drawRequests),
    contractorScorecards: structuredClone(operations.contractorScorecards),
    events: structuredClone(operations.events),
  };
  store.close();

  store = open();
  workflow = store.restoreWorkflow(project.id);
  operations = store.restoreOperations(workflow);
  assert.deepEqual(workflow.snapshot(), snapshot2);
  assert.deepEqual(operations.progressUpdates, opsState2.progressUpdates);
  assert.deepEqual(operations.drawRequests, opsState2.drawRequests);
  assert.deepEqual(operations.contractorScorecards, opsState2.contractorScorecards);
  assert.deepEqual(operations.events, opsState2.events);
  assert.equal(operations.drawRequests[0].status, "pending");
  assert.equal(operations.progressUpdates.at(-1).percentComplete, 50);

  // --- leg 3: continue on the restored instances -> draw decision -> punch -> complete -> exit
  operations.decideDraw({ drawId: draw.id, decision: "approved", approvedAmount: 20000, rationale: "Verified against progress evidence" });
  store.persistOperations(operations);
  workflow.enterPunchList({ items: [{ title: "Paint touch-up" }, { title: "Final clean" }] });
  for (const item of workflow.punchItems) workflow.completePunchItem({ punchItemId: item.id, evidenceRef: "evidence://punch-photo" });
  workflow.completeProject({ finalSpend: 49500, completionEvidenceRef: "evidence://completion-walkthrough" });
  workflow.markExitReady({ decision: "sell", rationale: "Committee approved disposition" });
  store.persistWorkflow(workflow);
  const snapshot3 = workflow.snapshot();
  const opsEvents3 = structuredClone(operations.events);
  store.close();

  // --- restore point 3: everything identical after a cold restart
  store = open();
  workflow = store.restoreWorkflow(project.id);
  operations = store.restoreOperations(workflow);
  assert.deepEqual(workflow.snapshot(), snapshot3);
  assert.deepEqual(operations.events, opsEvents3);
  assert.equal(workflow.project.stage, "exit_ready");
  assert.ok(store.workflowVersion(project.id) > 3, "version advanced across persists");

  const exitPkg = operations.exitPackage();
  assert.equal(exitPkg.projectId, project.id);
  assert.equal(exitPkg.exitDecision, "sell");
  assert.equal(exitPkg.approvedBudget, 50000);
  assert.equal(exitPkg.committedCost, 50000);
  assert.equal(exitPkg.finalSpend, 49500);
  assert.equal(exitPkg.approvedDraws, 20000);
  assert.equal(exitPkg.contractorScorecards.length, 1);
  store.close();
});

test("restart at the earliest point: a workflow restored right after intake can run the whole lifecycle", (t) => {
  const { open } = openDb(t);
  let store = open();
  const project = seedProject(store, "handoff-early");
  store.close();

  store = open();
  const workflow = store.restoreWorkflow(project.id);
  assert.equal(workflow.project.stage, "intake");
  driveToInProgress(workflow);
  assert.equal(workflow.project.stage, "in_progress");
  store.persistWorkflow(workflow);
  const midSnapshot = workflow.snapshot();
  store.close();

  store = open();
  const resumed = store.restoreWorkflow(project.id);
  assert.deepEqual(resumed.snapshot(), midSnapshot);
  resumed.enterPunchList({ items: [{ title: "Final clean" }] });
  resumed.completePunchItem({ punchItemId: resumed.punchItems[0].id, evidenceRef: "evidence://done" });
  resumed.completeProject({ finalSpend: 47000, completionEvidenceRef: "evidence://walkthrough" });
  resumed.markExitReady({ decision: "hold", rationale: "Rental hold analysis" });
  store.persistWorkflow(resumed);
  store.close();

  store = open();
  const final = store.restoreWorkflow(project.id);
  assert.equal(final.project.stage, "exit_ready");
  assert.equal(final.project.exitDecision, "hold");
  assert.equal(final.project.finalSpend, 47000);
  store.close();
});

test("events survive restarts verbatim and in order, for both streams", (t) => {
  const { open } = openDb(t);
  let store = open();
  const project = seedProject(store, "handoff-events");
  const workflow = store.restoreWorkflow(project.id);
  driveToInProgress(workflow);
  store.persistWorkflow(workflow);
  const operations = store.restoreOperations(workflow);
  operations.recordProgress({ percentComplete: 25, evidenceRefs: ["evidence://p25"] });
  store.persistOperations(operations);

  const workflowTypes = workflow.events.map(e => e.type);
  const opsTypes = operations.events.map(e => e.type);
  const eventRows = store.db.prepare("SELECT COUNT(*) AS c FROM events WHERE project_id = ?").get(project.id);
  assert.equal(eventRows.c, workflowTypes.length + opsTypes.length);
  store.close();

  store = open();
  const restoredWorkflow = store.restoreWorkflow(project.id);
  const restoredOps = store.restoreOperations(restoredWorkflow);
  assert.deepEqual(restoredWorkflow.events.map(e => e.type), ["scope_validated", "budget_approved", "bid_received", "bid_received", "bid_selected", "work_scheduled", "work_started"]);
  assert.deepEqual(restoredWorkflow.events.map(e => e.type), workflowTypes);
  assert.deepEqual(restoredOps.events.map(e => e.type), opsTypes);
  assert.deepEqual(restoredWorkflow.events, workflow.events.map(e => ({ ...e })));
  store.close();
});

test("persistWorkflow creates the project row for a workflow built directly from a seed", (t) => {
  const { open } = openDb(t);
  const store = open();
  const seed = {
    id: "11111111-2222-3333-4444-555555555555",
    sourceSystem: "pipeline",
    sourceHandoffId: "handoff-direct",
    sourceOpportunityId: "opp-direct",
    scopeStatus: "field_scope_required",
    budgetStatus: "preliminary_baseline",
    projectStatus: "intake",
    rehabBudgetBaseline: 10000,
    createdAt: "2026-09-25T16:00:00Z",
  };
  const workflow = new RenovationWorkflow(seed);
  workflow.validateScope({ items: [{ title: "Roof", estimatedCost: 9000 }] });
  const version = store.persistWorkflow(workflow);
  assert.ok(version >= 1);
  assert.equal(store.getProject(seed.id).sourceHandoffId, "handoff-direct");
  assert.equal(store.findProjectBySourceHandoffId("handoff-direct").id, seed.id);

  const restored = store.restoreWorkflow(seed.id);
  assert.deepEqual(restored.snapshot(), workflow.snapshot());
  store.close();
});
