import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MissionControlStore } from "../src/missionControlStore.mjs";
import { MissionControlFinance } from "../src/financialGovernance.mjs";
import {
  MissionControlOperationsCompletion, projectHealth, buildLenderPackage, verifyLenderPackage,
} from "../src/operationsCompletion.mjs";
import { receiveClosedAcquisition } from "../src/missionControlIntake.mjs";

// Actors: pm (operator), boss (approver), clerk (operator, records payments).
const PM = "pm-1";
const BOSS = "boss-1";
const CLERK = "clerk-1";
const OP = "operator-1";

function payload(opportunityId = "opp-u2") {
  return {
    contractVersion: "1.0",
    sourceSystem: "pipeline",
    targetSystem: "mission-control",
    opportunityId,
    opportunityCode: `OCG-${opportunityId}`,
    propertyId: `property-${opportunityId}`,
    address: "200 Completion Ct",
    closedAt: "2026-09-25T16:00:00Z",
    acquisition: { purchasePrice: 150000, earnestMoney: 1000, strategyType: "cash_purchase", offerId: "offer-1", offerVersionId: "version-1" },
    underwriting: { sourceSystem: "deal-scout", sourceUnderwritingId: "victor-1", arv: 260000, rehab: 48000, mao: 160000, confidence: 0.9, limitations: null },
    renovationSeed: { budgetBaseline: 48000, scopeStatus: "needs_field_validation", projectStatus: "intake_ready" }
  };
}

function openDb(t) {
  const dir = mkdtempSync(join(tmpdir(), "mc-u2-"));
  const path = join(dir, "mission-control.db");
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return { path, open: () => new MissionControlStore(path) };
}

/**
 * Project driven to in_progress and persisted: budget 50000 + 10%
 * contingency (authority 55000), Acme bid 48000 selected, work
 * started 2026-10-01 targeting 2026-11-15, progress at 50%.
 * Earned-value draw headroom: 48000 * 50% * (1 - 10%) = 21600.
 */
function setupProject(store, { handoffId = "handoff-u2", tenantId } = {}) {
  const repo = tenantId ? store.intakeRepository(tenantId) : store.intakeRepository();
  const { project } = receiveClosedAcquisition({ handoffId, payload: payload(handoffId), repository: repo });
  const opts = tenantId ? { tenantId } : {};
  const workflow = store.restoreWorkflow(project.id, opts);
  workflow.validateScope({ items: [
    { title: "Roof replacement", category: "exterior", estimatedCost: 12000 },
    { title: "Kitchen remodel", category: "interior", estimatedCost: 30000 },
  ] });
  workflow.approveBudget({ amount: 50000, contingencyPct: 10, rationale: "Baselines verified" });
  const bid = workflow.addBid({ contractor: "Acme Builders", amount: 48000, days: 45 });
  workflow.selectBid({ bidId: bid.id, rationale: "Best coverage within authority" });
  workflow.scheduleWork({ startAt: "2026-10-01T08:00:00Z", targetCompleteAt: "2026-11-15T17:00:00Z" });
  workflow.startWork({ startedAt: "2026-10-01T08:05:00Z" });
  store.persistWorkflow(workflow, opts);
  const operations = store.restoreOperations(workflow, opts);
  operations.recordProgress({ percentComplete: 50, evidenceRefs: ["evidence://progress-50"], note: "Roof done, kitchen framed" });
  store.persistOperations(operations, opts);
  return { project, scopeItems: workflow.scopeItems };
}

function setupFinance(store, tenantId) {
  const finance = new MissionControlFinance(store);
  const t = tenantId || store.defaultTenantId;
  finance.setActorRole({ tenantId: t, actorId: PM, role: "operator" });
  finance.setActorRole({ tenantId: t, actorId: BOSS, role: "approver" });
  finance.setActorRole({ tenantId: t, actorId: CLERK, role: "operator" });
  return finance;
}

function submitAndApproveInvoice(finance, { projectId, tenantId, number = "INV-100", total = 20000 }) {
  const invoice = finance.submitInvoice({
    tenantId, projectId, actor: PM, contractor: "Acme Builders", externalNumber: number,
    lineItems: [{ description: "Roofing labor and materials", amount: total }],
    evidenceRefs: [`evidence://invoice-${number}`],
  });
  finance.reviewInvoice({ tenantId, projectId, actor: BOSS, invoiceId: invoice.id, decision: "approved", rationale: "Verified against scope" });
  return finance.getInvoice(invoice.id, tenantId);
}

function throwsCode(fn, code) {
  assert.throws(fn, error => error.message === code, `expected ${code}`);
}

// --- inspections -----------------------------------------------------------

test("inspection lifecycle: fail requires corrections, corrections complete one by one, re-inspection passes", (t) => {
  const { open } = openDb(t);
  const store = open();
  const { project } = setupProject(store);
  const ops = new MissionControlOperationsCompletion(store);

  const inspection = ops.scheduleInspection({ projectId: project.id, actor: OP, type: "framing", scheduledFor: "2026-10-12", inspectorRef: "City inspector J. Alvarez (as recorded)" });
  assert.equal(inspection.status, "scheduled");
  assert.equal(inspection.outcome, null);
  assert.equal(inspection.inspectorRef, "City inspector J. Alvarez (as recorded)");

  // a fail without correction items is refused — nothing is written
  throwsCode(() => ops.recordInspectionOutcome({ projectId: project.id, actor: OP, inspectionId: inspection.id, outcome: "failed" }), "correction_items_required");
  throwsCode(() => ops.recordInspectionOutcome({ projectId: project.id, actor: OP, inspectionId: inspection.id, outcome: "failed", correctionItems: ["  "] }), "correction_items_required");
  assert.equal(ops.getInspection(inspection.id).status, "scheduled");

  // stale writer cannot record the outcome
  throwsCode(() => ops.recordInspectionOutcome({ projectId: project.id, actor: OP, inspectionId: inspection.id, outcome: "passed", evidenceRef: "evidence://x", expectedVersion: 99 }), "version_conflict");

  const failed = ops.recordInspectionOutcome({ projectId: project.id, actor: OP, inspectionId: inspection.id, outcome: "failed", correctionItems: ["Add fire blocking in stairwell", "Re-anchor ledger board"], evidenceRef: "evidence://framing-fail-report" });
  assert.equal(failed.status, "corrections_required");
  assert.equal(failed.outcome, "failed");
  assert.equal(failed.corrections.length, 2);
  assert.ok(failed.corrections.every(c => c.status === "open"));

  // the completion gate is shut while corrections are outstanding
  throwsCode(() => ops.assertInspectionsClear(project.id), "inspections_not_clear");

  // a re-inspection cannot be scheduled until the cycle completes
  throwsCode(() => ops.scheduleInspection({ projectId: project.id, actor: OP, type: "framing", scheduledFor: "2026-10-19", inspectorRef: "City inspector J. Alvarez (as recorded)", supersedesId: inspection.id }), "reinspection_not_ready");

  // corrections complete one by one, each with evidence
  const [first, second] = failed.corrections;
  throwsCode(() => ops.completeCorrectionItem({ projectId: project.id, actor: OP, correctionId: first.id }), "correction_evidence_required");
  const afterFirst = ops.completeCorrectionItem({ projectId: project.id, actor: OP, correctionId: first.id, evidenceRef: "evidence://fire-blocking-photo" });
  assert.equal(afterFirst.status, "corrections_required");
  assert.equal(afterFirst.corrections.filter(c => c.status === "complete").length, 1);
  throwsCode(() => ops.completeCorrectionItem({ projectId: project.id, actor: OP, correctionId: first.id, evidenceRef: "evidence://again" }), "correction_already_complete");
  const afterAll = ops.completeCorrectionItem({ projectId: project.id, actor: OP, correctionId: second.id, evidenceRef: "evidence://ledger-photo" });
  assert.equal(afterAll.status, "corrections_complete");
  assert.equal(afterAll.outcome, "failed"); // the failed outcome stays on the record
  assert.equal(ops.assertInspectionsClear(project.id), true);

  // re-inspection, linked to the failed one; a pass requires evidence
  const reinspection = ops.scheduleInspection({ projectId: project.id, actor: OP, type: "framing", scheduledFor: "2026-10-20", inspectorRef: "City inspector J. Alvarez (as recorded)", supersedesId: inspection.id });
  assert.equal(reinspection.supersedesId, inspection.id);
  throwsCode(() => ops.recordInspectionOutcome({ projectId: project.id, actor: OP, inspectionId: reinspection.id, outcome: "passed" }), "inspection_evidence_required");
  const passed = ops.recordInspectionOutcome({ projectId: project.id, actor: OP, inspectionId: reinspection.id, outcome: "passed", evidenceRef: "evidence://framing-pass-card" });
  assert.equal(passed.status, "passed");
  throwsCode(() => ops.recordInspectionOutcome({ projectId: project.id, actor: OP, inspectionId: reinspection.id, outcome: "passed", evidenceRef: "evidence://x" }), "inspection_not_scheduled");

  // cancellation only from scheduled
  const extra = ops.scheduleInspection({ projectId: project.id, actor: OP, type: "final", scheduledFor: "2026-11-01", inspectorRef: "County final (as recorded)" });
  assert.equal(ops.cancelInspection({ projectId: project.id, actor: OP, inspectionId: extra.id }).status, "cancelled");
  throwsCode(() => ops.cancelInspection({ projectId: project.id, actor: OP, inspectionId: reinspection.id }), "inspection_not_cancellable");

  // every mutation landed in the append-only events stream
  const types = store.db.prepare("SELECT type FROM events WHERE project_id = ? AND stream = 'operations' ORDER BY seq").all(project.id).map(r => r.type);
  for (const expected of ["inspection_scheduled", "inspection_outcome_recorded", "inspection_correction_completed", "inspection_cancelled"]) {
    assert.ok(types.includes(expected), `events stream carries ${expected}`);
  }
  store.close();
});

test("completion service: the domain punch -> complete transition is blocked only by outstanding corrections", (t) => {
  const { open } = openDb(t);
  const store = open();
  const { project } = setupProject(store);
  const ops = new MissionControlOperationsCompletion(store);

  const workflow = store.restoreWorkflow(project.id);
  workflow.enterPunchList({ items: [{ title: "Paint touch-up" }] });
  workflow.completePunchItem({ punchItemId: workflow.punchItems[0].id, evidenceRef: "evidence://punch-photo" });
  store.persistWorkflow(workflow);

  const inspection = ops.scheduleInspection({ projectId: project.id, actor: OP, type: "final", scheduledFor: "2026-10-25", inspectorRef: "County final (as recorded)" });
  ops.recordInspectionOutcome({ projectId: project.id, actor: OP, inspectionId: inspection.id, outcome: "failed", correctionItems: ["GFCI missing in kitchen"] });

  // the domain would allow completion (punch list done); this layer refuses
  throwsCode(() => ops.completeProject({ projectId: project.id, actor: OP, finalSpend: 49500, completionEvidenceRef: "evidence://walkthrough" }), "inspections_not_clear");
  assert.equal(store.restoreWorkflow(project.id).project.stage, "punch_list");

  const correction = ops.getInspection(inspection.id).corrections[0];
  ops.completeCorrectionItem({ projectId: project.id, actor: OP, correctionId: correction.id, evidenceRef: "evidence://gfci-photo" });
  const snapshot = ops.completeProject({ projectId: project.id, actor: OP, finalSpend: 49500, completionEvidenceRef: "evidence://walkthrough" });
  assert.equal(snapshot.project.stage, "complete");
  assert.equal(snapshot.project.finalSpend, 49500);
  store.close();
});

// --- permits ---------------------------------------------------------------

test("permits: recorded facts only — no evidence means labeled unverified in every read model", (t) => {
  const { open } = openDb(t);
  const store = open();
  const { project } = setupProject(store);
  const ops = new MissionControlOperationsCompletion(store);

  const permit = ops.recordPermit({ projectId: project.id, actor: OP, jurisdiction: "City of Wichita (as recorded)", permitNumber: "BLD-2026-1147", type: "building", status: "applied" });
  assert.equal(permit.verification, "unverified");
  assert.equal(ops.listPermits(project.id)[0].verification, "unverified");

  throwsCode(() => ops.recordPermit({ projectId: project.id, actor: OP, jurisdiction: "X", permitNumber: "Y", type: "building", status: "approved_by_city" }), "invalid_permit_status");
  throwsCode(() => ops.transitionPermitStatus({ projectId: project.id, actor: OP, permitId: permit.id, status: "teleported" }), "invalid_permit_status");

  const applied = ops.transitionPermitStatus({ projectId: project.id, actor: OP, permitId: permit.id, status: "issued", evidenceRef: "evidence://permit-card-scan" });
  assert.equal(applied.status, "issued");
  assert.equal(applied.verification, "evidence_recorded");

  // the transition is a recorded fact in the events stream, with actor
  const rows = store.db.prepare("SELECT type, actor, detail_json FROM events WHERE project_id = ? AND stream = 'operations' AND type = 'permit_status_changed'").all(project.id);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].actor, OP);
  assert.deepEqual(JSON.parse(rows[0].detail_json), { entityType: "permit", entityId: permit.id, fromStatus: "applied", toStatus: "issued" });
  store.close();
});

// --- materials ---------------------------------------------------------------

test("materials: lifecycle evidence rules and a rollup that counts unpriced lines instead of zero-filling them", (t) => {
  const { open } = openDb(t);
  const store = open();
  const { project, scopeItems } = setupProject(store);
  const ops = new MissionControlOperationsCompletion(store);
  const roof = scopeItems.find(item => item.title === "Roof replacement");

  const shingles = ops.recordMaterial({ projectId: project.id, actor: OP, scopeItemId: roof.id, description: "Architectural shingles", quantity: 10, unit: "square", unitCost: 25.5 });
  assert.equal(shingles.status, "planned");
  throwsCode(() => ops.recordMaterial({ projectId: project.id, actor: OP, scopeItemId: "scope-nope", description: "X", quantity: 1, unit: "ea" }), "scope_item_not_found");
  throwsCode(() => ops.recordMaterial({ projectId: project.id, actor: OP, description: "X", quantity: -1, unit: "ea" }), "invalid_quantity");

  ops.recordMaterial({ projectId: project.id, actor: OP, description: "Kitchen cabinets", quantity: 2, unit: "set", unitCost: 100 });
  ops.recordMaterial({ projectId: project.id, actor: OP, description: "Misc fasteners (cost not yet recorded)", quantity: 40, unit: "box" });
  const returned = ops.recordMaterial({ projectId: project.id, actor: OP, description: "Wrong-size vanity", quantity: 1, unit: "ea", unitCost: 300 });
  ops.transitionMaterial({ projectId: project.id, actor: OP, materialId: returned.id, status: "ordered" });
  ops.transitionMaterial({ projectId: project.id, actor: OP, materialId: returned.id, status: "returned" });

  // received requires evidence; the legal path is planned -> ordered -> received
  throwsCode(() => ops.transitionMaterial({ projectId: project.id, actor: OP, materialId: shingles.id, status: "received", evidenceRef: "evidence://delivery" }), "invalid_material_transition");
  ops.transitionMaterial({ projectId: project.id, actor: OP, materialId: shingles.id, status: "ordered" });
  throwsCode(() => ops.transitionMaterial({ projectId: project.id, actor: OP, materialId: shingles.id, status: "received" }), "material_evidence_required");
  assert.equal(ops.transitionMaterial({ projectId: project.id, actor: OP, materialId: shingles.id, status: "received", evidenceRef: "evidence://delivery-photo" }).status, "received");

  const summary = ops.materialsSummary(project.id);
  assert.deepEqual(summary, { projectId: project.id, pricedTotal: 455, unpricedCount: 1, returnedCount: 1, lineCount: 4 });
  store.close();
});

// --- schedule tasks ------------------------------------------------------------

test("tasks: dependency gate, cycle rejection at write time, and dependency bookkeeping", (t) => {
  const { open } = openDb(t);
  const store = open();
  const { project } = setupProject(store);
  const ops = new MissionControlOperationsCompletion(store);

  const a = ops.createTask({ projectId: project.id, actor: OP, title: "Rough plumbing", startsOn: "2026-10-05", dueOn: "2026-10-12" });
  const b = ops.createTask({ projectId: project.id, actor: OP, title: "Plumbing inspection prep", startsOn: "2026-10-12", dueOn: "2026-10-14", dependsOn: [a.id] });
  const c = ops.createTask({ projectId: project.id, actor: OP, title: "Drywall", startsOn: "2026-10-15", dueOn: "2026-10-22", dependsOn: [b.id] });

  throwsCode(() => ops.setTaskStatus({ projectId: project.id, actor: OP, taskId: b.id, status: "done" }), "dependency_incomplete");
  ops.setTaskStatus({ projectId: project.id, actor: OP, taskId: a.id, status: "done" });
  assert.equal(ops.setTaskStatus({ projectId: project.id, actor: OP, taskId: b.id, status: "done" }).status, "done");

  // cycles are rejected at write time: direct loop and self-loop
  throwsCode(() => ops.updateTaskDependencies({ projectId: project.id, actor: OP, taskId: a.id, dependsOn: [c.id] }), "dependency_cycle");
  throwsCode(() => ops.updateTaskDependencies({ projectId: project.id, actor: OP, taskId: a.id, dependsOn: [a.id] }), "dependency_cycle");
  throwsCode(() => ops.createTask({ projectId: project.id, actor: OP, title: "Ghost", startsOn: "2026-10-05", dueOn: "2026-10-06", dependsOn: ["task-missing"] }), "task_dependency_not_found");
  assert.deepEqual(ops.getTask(a.id).dependsOn, []); // rejected writes changed nothing

  // optimistic locking on the version column
  throwsCode(() => ops.setTaskStatus({ projectId: project.id, actor: OP, taskId: c.id, status: "in_progress", expectedVersion: 42 }), "version_conflict");
  assert.equal(ops.setTaskStatus({ projectId: project.id, actor: OP, taskId: c.id, status: "in_progress", expectedVersion: c.version }).version, c.version + 1);
  store.close();
});

test("schedule health: overdue, blocked, and the critical chain on a fixed fixture", (t) => {
  const { open } = openDb(t);
  const store = open();
  const { project } = setupProject(store);
  const ops = new MissionControlOperationsCompletion(store);
  const AS_OF = "2026-10-20T00:00:00Z";

  const t1 = ops.createTask({ projectId: project.id, actor: OP, title: "Demo", startsOn: "2026-10-01", dueOn: "2026-10-10" });
  const t2 = ops.createTask({ projectId: project.id, actor: OP, title: "Framing", startsOn: "2026-10-10", dueOn: "2026-11-01", dependsOn: [t1.id] });
  const t3 = ops.createTask({ projectId: project.id, actor: OP, title: "Permit re-check", startsOn: "2026-10-18", dueOn: "2026-12-01" });
  ops.setTaskStatus({ projectId: project.id, actor: OP, taskId: t3.id, status: "blocked" });
  const t4 = ops.createTask({ projectId: project.id, actor: OP, title: "Old task", startsOn: "2026-09-01", dueOn: "2026-10-01" });
  ops.setTaskStatus({ projectId: project.id, actor: OP, taskId: t4.id, status: "done" });

  const health = ops.scheduleHealth(project.id, AS_OF);
  assert.deepEqual(health.overdue.map(x => x.id), [t1.id]); // the done task past due is not overdue work
  const blockedById = new Map(health.blocked.map(entry => [entry.id, entry]));
  assert.equal(health.blocked.length, 2);
  assert.deepEqual(blockedById.get(t2.id), { id: t2.id, title: "Framing", status: "open", incompleteDependencies: [t1.id] });
  assert.deepEqual(blockedById.get(t3.id), { id: t3.id, title: "Permit re-check", status: "blocked", incompleteDependencies: [] });
  assert.equal(health.criticalChainLength, 2); // Framing -> Demo
  assert.equal(health.openCount, 3);
  assert.equal(health.doneCount, 1);

  // a clean four-link chain measures four tasks; finishing the root shortens it
  const other = setupProject(store, { handoffId: "handoff-chain" }).project;
  const w = ops.createTask({ projectId: other.id, actor: OP, title: "W", startsOn: "2026-10-01", dueOn: "2026-11-01" });
  const x = ops.createTask({ projectId: other.id, actor: OP, title: "X", startsOn: "2026-10-02", dueOn: "2026-11-02", dependsOn: [w.id] });
  const y = ops.createTask({ projectId: other.id, actor: OP, title: "Y", startsOn: "2026-10-03", dueOn: "2026-11-03", dependsOn: [x.id] });
  ops.createTask({ projectId: other.id, actor: OP, title: "Z", startsOn: "2026-10-04", dueOn: "2026-11-04", dependsOn: [y.id] });
  assert.equal(ops.scheduleHealth(other.id, AS_OF).criticalChainLength, 4);
  ops.setTaskStatus({ projectId: other.id, actor: OP, taskId: w.id, status: "done" });
  assert.equal(ops.scheduleHealth(other.id, AS_OF).criticalChainLength, 3);
  store.close();
});

// --- contractor directory -------------------------------------------------------

test("contractor directory: per-tenant identity, scorecard join name, and honest compliance derivation", (t) => {
  const { open } = openDb(t);
  const store = open();
  setupProject(store);
  const ops = new MissionControlOperationsCompletion(store);
  const AS_OF = "2026-10-20T00:00:00Z";

  const acme = ops.registerContractor({ actor: OP, name: "Acme Builders", trades: ["roofing", "general"], contact: { phone: "555-0100 (as recorded)" } });
  assert.equal(acme.scorecardName, "Acme Builders"); // defaults to the directory name
  assert.deepEqual(acme.compliance, []);
  throwsCode(() => ops.registerContractor({ actor: OP, name: "Acme Builders" }), "duplicate_contractor");
  throwsCode(() => ops.recordCompliance({ actor: OP, contractorId: acme.id, kind: "license", ref: "" }), "compliance_ref_required");

  ops.recordCompliance({ actor: OP, contractorId: acme.id, kind: "license", ref: "evidence://acme-license", expiresOn: "2026-01-01" });
  ops.recordCompliance({ actor: OP, contractorId: acme.id, kind: "insurance", ref: "evidence://acme-coi" });
  const withDocs = ops.recordCompliance({ actor: OP, contractorId: acme.id, kind: "w9", ref: "evidence://acme-w9", expiresOn: "2027-06-30" });
  const byKind = Object.fromEntries(withDocs.compliance.map(doc => [doc.kind, doc.status]));
  assert.deepEqual(byKind, { license: "expired", insurance: "unknown", w9: "valid" });

  // a document expiring ON the as-of date is still valid that day
  const beta = ops.registerContractor({ actor: OP, name: "Beta Construction", scorecardName: "Beta" });
  assert.equal(beta.scorecardName, "Beta");
  const betaDocs = ops.recordCompliance({ actor: OP, contractorId: beta.id, kind: "license", ref: "evidence://beta-license", expiresOn: "2026-10-20" });
  assert.equal(betaDocs.compliance[0].status, "expired"); // derived at real now, which is past the 2026-10-20 expiry
  assert.equal(ops.getContractor(beta.id, undefined, AS_OF).compliance[0].status, "valid"); // ...but valid ON its expiry date
  store.close();
});

// --- operational intelligence -----------------------------------------------------

test("projectHealth: exact finding kinds, counts, ranking, and next action on a seeded fixture", (t) => {
  const { open } = openDb(t);
  const store = open();
  const { project } = setupProject(store);
  const ops = new MissionControlOperationsCompletion(store);
  const finance = setupFinance(store);
  const AS_OF = "2026-10-20T12:00:00Z";

  // one failed inspection with an open correction (high)
  const inspection = ops.scheduleInspection({ projectId: project.id, actor: OP, type: "electrical", scheduledFor: "2026-10-15", inspectorRef: "City inspector (as recorded)" });
  ops.recordInspectionOutcome({ projectId: project.id, actor: OP, inspectionId: inspection.id, outcome: "failed", correctionItems: ["Label the panel schedule"] });
  // one overdue task (high) and one blocked task (medium)
  ops.createTask({ projectId: project.id, actor: OP, title: "Rough-in", startsOn: "2026-10-01", dueOn: "2026-10-10" });
  const blockedTask = ops.createTask({ projectId: project.id, actor: OP, title: "Tile order", startsOn: "2026-10-18", dueOn: "2026-12-01" });
  ops.setTaskStatus({ projectId: project.id, actor: OP, taskId: blockedTask.id, status: "blocked" });
  // two permits with no evidence attached (medium)
  ops.recordPermit({ projectId: project.id, actor: OP, jurisdiction: "City (as recorded)", permitNumber: "BLD-1", type: "building", status: "issued" });
  ops.recordPermit({ projectId: project.id, actor: OP, jurisdiction: "County (as recorded)", permitNumber: "ELC-2", type: "electrical", status: "applied" });
  // one approved invoice no draw references (low)
  submitAndApproveInvoice(finance, { projectId: project.id, number: "INV-900", total: 5000 });
  // one compliance document with no recorded expiry (low)
  const acme = ops.registerContractor({ actor: OP, name: "Acme Builders" });
  ops.recordCompliance({ actor: OP, contractorId: acme.id, kind: "insurance", ref: "evidence://acme-coi" });

  const health = projectHealth(store, undefined, project.id, AS_OF);
  assert.equal(health.domainRiskLevel, "clear"); // the domain report itself finds nothing on this fixture
  assert.deepEqual(health.findings.map(f => [f.kind, f.severity, f.count]), [
    ["inspections_corrections_required", "high", 1],
    ["tasks_overdue", "high", 1],
    ["permits_unverified", "medium", 2],
    ["tasks_blocked", "medium", 1],
    ["approved_invoices_undrawn", "low", 1],
    ["contractor_compliance_unknown", "low", 1],
  ]);
  assert.deepEqual(health.counts, { findings: 6, critical: 0, high: 2, medium: 2, low: 2 });
  assert.equal(health.riskLevel, "high");
  assert.equal(health.nextAction, "Complete the outstanding inspection correction items.");
  assert.deepEqual(health.schedule, { overdueCount: 1, blockedCount: 1, criticalChainLength: 1 });
  store.close();
});

test("projectHealth: an approved draw unpaid beyond the reporting term surfaces, and clears when paid", (t) => {
  const { open } = openDb(t);
  const store = open();
  const { project } = setupProject(store);
  const finance = setupFinance(store);
  const invoice = submitAndApproveInvoice(finance, { projectId: project.id, number: "INV-100", total: 20000 });
  const { draw } = finance.requestDraw({ projectId: project.id, actor: PM, amount: 20000, percentComplete: 50, evidenceRefs: ["evidence://progress-50"], invoiceIds: [invoice.id], reason: "Roof complete" });
  finance.decideDraw({ projectId: project.id, actor: BOSS, drawId: draw.id, decision: "approved", rationale: "Verified" });

  const later = new Date(Date.now() + 30 * 86400000).toISOString();
  let health = projectHealth(store, undefined, project.id, later);
  const unpaid = health.findings.find(f => f.kind === "draws_approved_unpaid");
  assert.ok(unpaid, "approved-unpaid finding present past terms");
  assert.equal(unpaid.count, 1);
  assert.equal(unpaid.amount, 20000);
  const allocated = health.findings.find(f => f.kind === "allocated_not_paid");
  assert.ok(allocated && allocated.amount === 20000);

  finance.recordPayment({ projectId: project.id, actor: CLERK, drawId: draw.id, amount: 20000, paymentRef: "ACH-terms" });
  health = projectHealth(store, undefined, project.id, later);
  assert.equal(health.findings.find(f => f.kind === "draws_approved_unpaid"), undefined);
  assert.equal(health.findings.find(f => f.kind === "allocated_not_paid"), undefined);
  store.close();
});

// --- lender draw package -----------------------------------------------------------

test("lender package: self-contained, caller-reported figures labeled, digest verifies and detects tampering", (t) => {
  const { open } = openDb(t);
  const store = open();
  const { project } = setupProject(store);
  const finance = setupFinance(store);
  const invoice = submitAndApproveInvoice(finance, { projectId: project.id, number: "INV-100", total: 20000 });
  const { draw } = finance.requestDraw({ projectId: project.id, actor: PM, amount: 20000, percentComplete: 50, evidenceRefs: ["evidence://progress-50"], invoiceIds: [invoice.id], reason: "Roof complete" });
  finance.decideDraw({ projectId: project.id, actor: BOSS, drawId: draw.id, decision: "approved", rationale: "Verified against progress evidence" });
  const { payment } = finance.recordPayment({ projectId: project.id, actor: CLERK, drawId: draw.id, amount: 12000, paymentRef: "ACH-1" });
  finance.recordReconciliation({ projectId: project.id, actor: CLERK, paymentId: payment.id, bankRecord: { amount: 12000, reference: "stmt-oct (caller supplied)" } });

  const pkg = buildLenderPackage(store, undefined, project.id, draw.id);
  assert.equal(pkg.bankVerified, false);
  assert.equal(pkg.project.id, project.id);
  assert.equal(pkg.project.address, "200 Completion Ct");
  assert.equal(pkg.budget.approvedBudget, 50000);
  assert.equal(pkg.budget.committed, 48000);
  assert.equal(pkg.draw.id, draw.id);
  assert.equal(pkg.draw.status, "approved");
  assert.equal(pkg.decisions.length, 1);
  assert.equal(pkg.decisions[0].actor, BOSS);
  assert.equal(pkg.allocations.length, 1);
  assert.equal(pkg.allocations[0].amount, 20000);
  assert.equal(pkg.invoices.count, 1);
  assert.equal(pkg.invoices.approvedTotal, 20000);
  assert.equal(pkg.payments.totalPaid, 12000);
  assert.deepEqual(pkg.drawFinancials, { drawId: draw.id, approved: 20000, allocated: 20000, paid: 12000, reconciled: 12000, outstanding: 8000 });
  assert.equal(pkg.reconciliations.length, 1);
  assert.equal(pkg.reconciliations[0].callerReported, true);
  assert.equal(pkg.reconciliations[0].bankVerified, false);
  assert.equal(pkg.reconciliations[0].source, "caller_reported");
  assert.ok(pkg.progressEvidenceRefs.includes("evidence://progress-50"));
  assert.match(pkg.packageDigest, /^[0-9a-f]{64}$/);

  // verifies as built, and after a JSON round trip (it is a portable document)
  assert.equal(verifyLenderPackage(pkg), true);
  assert.equal(verifyLenderPackage(JSON.parse(JSON.stringify(pkg))), true);

  // any tampering with any packaged figure breaks verification
  const tamperedAmount = structuredClone(pkg);
  tamperedAmount.draw.approvedAmount = 1;
  assert.equal(verifyLenderPackage(tamperedAmount), false);
  const tamperedPaid = structuredClone(pkg);
  tamperedPaid.payments.totalPaid = 20000;
  assert.equal(verifyLenderPackage(tamperedPaid), false);
  const digestStripped = structuredClone(pkg);
  delete digestStripped.packageDigest;
  assert.equal(verifyLenderPackage(digestStripped), false);
  assert.equal(verifyLenderPackage(null), false);
  assert.equal(verifyLenderPackage("not a package"), false);

  throwsCode(() => buildLenderPackage(store, undefined, project.id, "draw-missing"), "draw_not_found");
  store.close();
});

// --- tenant isolation -----------------------------------------------------------------

test("tenant isolation: every new entity is invisible and untouchable across tenants", (t) => {
  const { open } = openDb(t);
  const store = open();
  const A = "tenant-a";
  const B = "tenant-b";
  const a = setupProject(store, { handoffId: "handoff-a", tenantId: A }).project;
  const b = setupProject(store, { handoffId: "handoff-b", tenantId: B }).project;
  const ops = new MissionControlOperationsCompletion(store);

  const inspection = ops.scheduleInspection({ tenantId: A, projectId: a.id, actor: OP, type: "final", scheduledFor: "2026-11-01", inspectorRef: "Inspector (as recorded)" });
  const permit = ops.recordPermit({ tenantId: A, projectId: a.id, actor: OP, jurisdiction: "City (as recorded)", permitNumber: "A-1", type: "building" });
  const material = ops.recordMaterial({ tenantId: A, projectId: a.id, actor: OP, description: "Shingles", quantity: 5, unit: "square", unitCost: 30 });
  const task = ops.createTask({ tenantId: A, projectId: a.id, actor: OP, title: "Demo", startsOn: "2026-10-01", dueOn: "2026-10-05" });
  const contractor = ops.registerContractor({ tenantId: A, actor: OP, name: "Acme Builders" });

  // reads across the boundary see nothing
  assert.equal(ops.getInspection(inspection.id, B), null);
  assert.deepEqual(ops.listInspections(a.id, B), []);
  assert.equal(ops.getPermit(permit.id, B), null);
  assert.equal(ops.getMaterial(material.id, B), null);
  assert.equal(ops.getTask(task.id, B), null);
  assert.equal(ops.getContractor(contractor.id, B), null);

  // mutations across the boundary fail as not-found, never as data
  throwsCode(() => ops.recordInspectionOutcome({ tenantId: B, projectId: b.id, actor: OP, inspectionId: inspection.id, outcome: "passed", evidenceRef: "evidence://x" }), "inspection_not_found");
  throwsCode(() => ops.transitionPermitStatus({ tenantId: B, projectId: b.id, actor: OP, permitId: permit.id, status: "issued" }), "permit_not_found");
  throwsCode(() => ops.transitionMaterial({ tenantId: B, projectId: b.id, actor: OP, materialId: material.id, status: "ordered" }), "material_not_found");
  throwsCode(() => ops.setTaskStatus({ tenantId: B, projectId: b.id, actor: OP, taskId: task.id, status: "done" }), "task_not_found");
  throwsCode(() => ops.recordCompliance({ tenantId: B, actor: OP, contractorId: contractor.id, kind: "license", ref: "evidence://x" }), "contractor_not_found");
  throwsCode(() => ops.assertInspectionsClear(a.id, B), "project_not_found");
  throwsCode(() => ops.materialsSummary(a.id, B), "project_not_found");
  throwsCode(() => projectHealth(store, B, a.id, "2026-10-20T00:00:00Z"), "project_not_found");

  // contractor-name uniqueness is per tenant: the same name registers cleanly under B
  assert.equal(ops.registerContractor({ tenantId: B, actor: OP, name: "Acme Builders" }).tenantId, B);
  // and tenant A's records are exactly as written
  assert.equal(ops.listInspections(a.id, A).length, 1);
  assert.equal(ops.listContractors(A).length, 1);
  store.close();
});

// --- restart persistence -----------------------------------------------------------------

test("restart persistence: every U2 entity and its state survive a close/reopen verbatim", (t) => {
  const { open } = openDb(t);
  let store = open();
  const { project } = setupProject(store);
  let ops = new MissionControlOperationsCompletion(store);

  const inspection = ops.scheduleInspection({ projectId: project.id, actor: OP, type: "plumbing", scheduledFor: "2026-10-14", inspectorRef: "City inspector (as recorded)" });
  ops.recordInspectionOutcome({ projectId: project.id, actor: OP, inspectionId: inspection.id, outcome: "failed", correctionItems: ["Cap the cleanout", "Slope the drain run"] });
  const firstCorrection = ops.getInspection(inspection.id).corrections[0];
  ops.completeCorrectionItem({ projectId: project.id, actor: OP, correctionId: firstCorrection.id, evidenceRef: "evidence://cleanout-photo" });
  const permit = ops.recordPermit({ projectId: project.id, actor: OP, jurisdiction: "City (as recorded)", permitNumber: "PLB-9", type: "plumbing", status: "issued", issuedOn: "2026-10-02", evidenceRef: "evidence://permit-scan" });
  const material = ops.recordMaterial({ projectId: project.id, actor: OP, description: "PVC fittings", quantity: 12, unit: "ea", unitCost: 4.25, status: "ordered" });
  const root = ops.createTask({ projectId: project.id, actor: OP, title: "Rough plumbing", startsOn: "2026-10-05", dueOn: "2026-10-12" });
  const dependent = ops.createTask({ projectId: project.id, actor: OP, title: "Pressure test", startsOn: "2026-10-12", dueOn: "2026-10-13", dependsOn: [root.id] });
  const contractor = ops.registerContractor({ actor: OP, name: "Acme Builders", trades: ["plumbing"] });
  ops.recordCompliance({ actor: OP, contractorId: contractor.id, kind: "license", ref: "evidence://acme-license", expiresOn: "2027-01-31" });

  const before = {
    inspection: ops.getInspection(inspection.id),
    permit: ops.getPermit(permit.id),
    material: ops.getMaterial(material.id),
    tasks: ops.listTasks(project.id),
    contractor: ops.getContractor(contractor.id, undefined, "2026-10-20T00:00:00Z"),
    schemaVersion: store.schemaVersion(),
  };
  assert.equal(before.schemaVersion, 4);
  store.close();

  store = open();
  ops = new MissionControlOperationsCompletion(store);
  assert.deepEqual(ops.getInspection(inspection.id), before.inspection);
  assert.equal(ops.getInspection(inspection.id).status, "corrections_required");
  assert.deepEqual(ops.getPermit(permit.id), before.permit);
  assert.deepEqual(ops.getMaterial(material.id), before.material);
  assert.deepEqual(ops.listTasks(project.id), before.tasks);
  assert.deepEqual(ops.getTask(dependent.id).dependsOn, [root.id]);
  assert.deepEqual(ops.getContractor(contractor.id, undefined, "2026-10-20T00:00:00Z"), before.contractor);

  // the reopened state is fully workable: finish the correction cycle
  const remaining = ops.getInspection(inspection.id).corrections.find(c => c.status === "open");
  const finished = ops.completeCorrectionItem({ projectId: project.id, actor: OP, correctionId: remaining.id, evidenceRef: "evidence://slope-photo" });
  assert.equal(finished.status, "corrections_complete");
  assert.equal(ops.assertInspectionsClear(project.id), true);
  store.close();
});
