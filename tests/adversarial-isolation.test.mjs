import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MissionControlStore } from "../src/missionControlStore.mjs";
import { MissionControlFinance } from "../src/financialGovernance.mjs";
import { MissionControlOperationsCompletion, buildLenderPackage, projectHealth } from "../src/operationsCompletion.mjs";
import { receiveClosedAcquisition } from "../src/missionControlIntake.mjs";

// ADVERSARIAL FAMILY B — isolation (§7): every entity created in tenant A
// (or in project P1) is invisible AND unusable from tenant B (or P2).

const PM = "pm-1";
const BOSS = "boss-1";
const TENANT_B = "tenant-b";

function payload(id) {
  return {
    contractVersion: "1.0", sourceSystem: "pipeline", targetSystem: "mission-control",
    opportunityId: id, opportunityCode: `OCG-${id}`, propertyId: `property-${id}`, address: "200 Isolation Ave",
    closedAt: "2026-09-25T16:00:00Z",
    acquisition: { purchasePrice: 150000, earnestMoney: 1000, strategyType: "cash_purchase", offerId: "offer-1", offerVersionId: "version-1" },
    underwriting: { sourceSystem: "deal-scout", sourceUnderwritingId: "victor-1", arv: 260000, rehab: 48000, mao: 160000, confidence: 0.9, limitations: null },
    renovationSeed: { budgetBaseline: 48000, scopeStatus: "needs_field_validation", projectStatus: "intake_ready" }
  };
}

function openDb(t) {
  const dir = mkdtempSync(join(tmpdir(), "mc-adv-b-"));
  const path = join(dir, "mission-control.db");
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return new MissionControlStore(path);
}

/** Drive a project to in_progress (bid 48000 committed, progress 50%). */
function driveToInProgress(store, { handoffId, tenantId }) {
  const repo = tenantId ? store.intakeRepository(tenantId) : store.intakeRepository();
  const { project } = receiveClosedAcquisition({ handoffId, payload: payload(handoffId), repository: repo });
  const opt = tenantId ? { tenantId } : {};
  const wf = store.restoreWorkflow(project.id, opt);
  wf.validateScope({ items: [{ title: "Roof replacement", category: "exterior", estimatedCost: 12000 }] });
  wf.approveBudget({ amount: 50000, contingencyPct: 10, rationale: "Baselines verified" });
  const bid = wf.addBid({ contractor: "Acme Builders", amount: 48000, days: 45 });
  wf.selectBid({ bidId: bid.id, rationale: "Best coverage" });
  wf.scheduleWork({ startAt: "2026-10-01T08:00:00Z", targetCompleteAt: "2026-11-15T17:00:00Z" });
  wf.startWork({ startedAt: "2026-10-01T08:05:00Z" });
  store.persistWorkflow(wf, opt);
  const operations = store.restoreOperations(wf, opt);
  operations.recordProgress({ percentComplete: 50, evidenceRefs: ["evidence://progress-50"] });
  store.persistOperations(operations, opt);
  return project;
}

/** Full entity stack on one project; returns every id a foreign actor might covet. */
function buildStack(store, finance, ops, { projectId, tenantId, tag }) {
  const t = tenantId ? { tenantId } : {};
  const T = tenantId || store.defaultTenantId;
  const invoice = finance.submitInvoice({ ...t, projectId, actor: PM, contractor: "Acme Builders", externalNumber: `INV-${tag}`, lineItems: [{ description: "Roofing", amount: 15000 }], evidenceRefs: [`evidence://inv-${tag}`] });
  finance.reviewInvoice({ ...t, projectId, actor: BOSS, invoiceId: invoice.id, decision: "approved", rationale: "Verified" });
  const { draw } = finance.requestDraw({ ...t, projectId, actor: PM, amount: 10000, percentComplete: 50, evidenceRefs: ["evidence://progress-50"], invoiceIds: [invoice.id], reason: "Progress" });
  finance.decideDraw({ ...t, projectId, actor: BOSS, drawId: draw.id, decision: "approved", rationale: "Verified" });
  const { payment } = finance.recordPayment({ ...t, projectId, actor: PM, drawId: draw.id, amount: 4000, paymentRef: `ACH-${tag}` });
  finance.recordReconciliation({ ...t, projectId, actor: PM, paymentId: payment.id, bankRecord: { amount: 4000, reference: `stmt-${tag}` } });
  const inspection = ops.scheduleInspection({ ...t, projectId, actor: PM, type: "framing", scheduledFor: "2026-10-12T09:00:00Z", inspectorRef: "Inspector (as recorded)" });
  const failed = ops.recordInspectionOutcome({ ...t, projectId, actor: PM, inspectionId: inspection.id, outcome: "failed", evidenceRef: "evidence://fail", correctionItems: ["Add fire blocking"] });
  const permit = ops.recordPermit({ ...t, projectId, actor: PM, jurisdiction: "City of Wichita", permitNumber: `P-${tag}`, type: "building", status: "issued", evidenceRef: "evidence://permit" });
  const material = ops.recordMaterial({ ...t, projectId, actor: PM, description: "Shingles", quantity: 10, unit: "square", unitCost: 250 });
  const task = ops.createTask({ ...t, projectId, actor: PM, title: `Task ${tag}`, startsOn: "2026-10-06", dueOn: "2026-10-20" });
  const contractor = ops.registerContractor({ tenantId: T, actor: PM, name: `Acme ${tag}`, trades: ["roofing"] });
  ops.recordCompliance({ tenantId: T, actor: PM, contractorId: contractor.id, kind: "license", ref: "evidence://license", expiresOn: "2027-01-01" });
  return { invoice, draw, payment, inspection: failed, correctionId: failed.corrections[0].id, permit, material, task, contractor };
}

function setupRoles(finance, tenantId) {
  const t = tenantId || undefined;
  finance.setActorRole({ ...(t ? { tenantId: t } : {}), actorId: PM, role: "operator" });
  finance.setActorRole({ ...(t ? { tenantId: t } : {}), actorId: BOSS, role: "approver" });
}

test("B1: cross-tenant — tenant A's full entity stack is invisible and unusable from tenant B", (t) => {
  const store = openDb(t);
  const finance = new MissionControlFinance(store);
  const ops = new MissionControlOperationsCompletion(store);
  setupRoles(finance);
  setupRoles(finance, TENANT_B);
  const projectA = driveToInProgress(store, { handoffId: "handoff-b-a" });
  const projectB = driveToInProgress(store, { handoffId: "handoff-b-b", tenantId: TENANT_B });
  const A = buildStack(store, finance, ops, { projectId: projectA.id, tag: "A" });
  const B = { tenantId: TENANT_B, projectId: projectB.id };

  // --- reads: nothing resolves across the boundary ---
  assert.equal(store.getProject(projectA.id, TENANT_B), null);
  assert.equal(store.listProjects(TENANT_B).some(p => p.id === projectA.id), false);
  assert.equal(store.findProjectBySourceHandoffId("handoff-b-a", TENANT_B), null);
  assert.equal(store.loadWorkflowState(projectA.id, TENANT_B), null);
  assert.equal(store.loadOperationsState(projectA.id, TENANT_B), null);
  assert.equal(finance.getInvoice(A.invoice.id, TENANT_B), null);
  assert.equal(finance.getDraw(A.draw.id, TENANT_B), null);
  assert.equal(finance.getPayment(A.payment.id, TENANT_B), null);
  assert.deepEqual(finance.listInvoices(projectA.id, TENANT_B), []);
  assert.deepEqual(finance.listDraws(projectA.id, TENANT_B), []);
  assert.deepEqual(finance.listPayments(projectA.id, TENANT_B), []);
  assert.deepEqual(finance.listReconciliations(projectA.id, TENANT_B), []);
  assert.deepEqual(finance.listDecisions(A.draw.id, TENANT_B), []);
  assert.deepEqual(finance.listAllocations(A.draw.id, TENANT_B), []);
  assert.deepEqual(finance.listAudit(projectA.id, TENANT_B), []);
  assert.equal(finance.getDrawFinancials(A.draw.id, TENANT_B), null);
  assert.throws(() => finance.getProjectFinancials(projectA.id, TENANT_B), /project_not_found/);
  assert.equal(ops.getInspection(A.inspection.id, TENANT_B), null);
  assert.deepEqual(ops.listInspections(projectA.id, TENANT_B), []);
  assert.equal(ops.getPermit(A.permit.id, TENANT_B), null);
  assert.deepEqual(ops.listPermits(projectA.id, TENANT_B), []);
  assert.equal(ops.getMaterial(A.material.id, TENANT_B), null);
  assert.deepEqual(ops.listMaterials(projectA.id, TENANT_B), []);
  assert.equal(ops.getTask(A.task.id, TENANT_B), null);
  assert.deepEqual(ops.listTasks(projectA.id, TENANT_B), []);
  assert.equal(ops.getContractor(A.contractor.id, TENANT_B), null);
  assert.equal(ops.listContractors(TENANT_B).some(c => c.id === A.contractor.id), false);
  assert.throws(() => projectHealth(store, TENANT_B, projectA.id), /project_not_found/);

  // --- writes into A's project from B: the project itself does not exist for B ---
  assert.throws(() => finance.submitInvoice({ ...B, projectId: projectA.id, actor: PM, contractor: "Acme Builders", externalNumber: "INV-X", lineItems: [{ description: "W", amount: 1 }], evidenceRefs: ["evidence://x"] }), /project_not_found/);
  assert.throws(() => ops.scheduleInspection({ ...B, projectId: projectA.id, actor: PM, type: "final", scheduledFor: "2026-10-13T09:00:00Z", inspectorRef: "X" }), /project_not_found/);
  assert.throws(() => ops.recordPermit({ ...B, projectId: projectA.id, actor: PM, jurisdiction: "X", permitNumber: "P-X", type: "building" }), /project_not_found/);
  assert.throws(() => ops.recordMaterial({ ...B, projectId: projectA.id, actor: PM, description: "X", quantity: 1, unit: "ea" }), /project_not_found/);
  assert.throws(() => ops.createTask({ ...B, projectId: projectA.id, actor: PM, title: "X", startsOn: "2026-10-06", dueOn: "2026-10-07" }), /project_not_found/);
  assert.throws(() => ops.assertInspectionsClear(projectA.id, TENANT_B), /project_not_found/);
  assert.throws(() => ops.materialsSummary(projectA.id, TENANT_B), /project_not_found/);
  assert.throws(() => ops.scheduleHealth(projectA.id, "2026-10-10", TENANT_B), /project_not_found/);

  // --- writes from B's own project referencing A's entity ids: not-found codes ---
  assert.throws(() => finance.reviewInvoice({ ...B, actor: BOSS, invoiceId: A.invoice.id, decision: "rejected", rationale: "hostile" }), /invoice_not_found/);
  assert.throws(() => finance.requestDraw({ ...B, actor: PM, amount: 100, percentComplete: 50, evidenceRefs: ["evidence://p"], invoiceIds: [A.invoice.id], reason: "hostile" }), /invoice_not_found/);
  assert.throws(() => finance.decideDraw({ ...B, actor: BOSS, drawId: A.draw.id, decision: "rejected", rationale: "hostile" }), /draw_not_found/);
  assert.throws(() => finance.recordPayment({ ...B, actor: PM, drawId: A.draw.id, amount: 100, paymentRef: "ACH-HOSTILE" }), /draw_not_found/);
  assert.throws(() => finance.recordReconciliation({ ...B, actor: PM, paymentId: A.payment.id, bankRecord: { amount: 1 } }), /payment_not_found/);
  assert.throws(() => finance.reverseDecision({ ...B, actor: BOSS, decisionId: finance.listDecisions(A.draw.id)[0].id, rationale: "hostile" }), /decision_not_found/);
  assert.throws(() => buildLenderPackage(store, TENANT_B, projectA.id, A.draw.id), /project_not_found/);
  assert.throws(() => buildLenderPackage(store, TENANT_B, projectB.id, A.draw.id), /draw_not_found/);
  assert.throws(() => ops.recordInspectionOutcome({ ...B, actor: PM, inspectionId: A.inspection.id, outcome: "passed", evidenceRef: "evidence://x" }), /inspection_not_found/);
  assert.throws(() => ops.completeCorrectionItem({ ...B, actor: PM, correctionId: A.correctionId, evidenceRef: "evidence://x" }), /correction_not_found/);
  assert.throws(() => ops.transitionPermitStatus({ ...B, actor: PM, permitId: A.permit.id, status: "closed" }), /permit_not_found/);
  assert.throws(() => ops.transitionMaterial({ ...B, actor: PM, materialId: A.material.id, status: "ordered" }), /material_not_found/);
  assert.throws(() => ops.setTaskStatus({ ...B, actor: PM, taskId: A.task.id, status: "done" }), /task_not_found/);
  assert.throws(() => ops.updateTaskDependencies({ ...B, actor: PM, taskId: A.task.id, dependsOn: [] }), /task_not_found/);
  assert.throws(() => ops.createTask({ ...B, actor: PM, title: "Depends on A's task", startsOn: "2026-10-06", dueOn: "2026-10-07", dependsOn: [A.task.id] }), /task_dependency_not_found/);
  assert.throws(() => ops.recordCompliance({ tenantId: TENANT_B, actor: PM, contractorId: A.contractor.id, kind: "license", ref: "evidence://x" }), /contractor_not_found/);

  // --- the contractor namespace is per-tenant: the same name is free in B ---
  const contractorB = ops.registerContractor({ tenantId: TENANT_B, actor: PM, name: "Acme A", trades: ["roofing"] });
  assert.notEqual(contractorB.id, A.contractor.id);

  // --- A's state is untouched by every hostile attempt, and its audit chain still verifies ---
  assert.deepEqual(finance.getProjectFinancials(projectA.id), { projectId: projectA.id, approved: 10000, allocated: 10000, paid: 4000, reconciled: 4000 });
  assert.equal(finance.verifyAuditChain(projectA.id), true);
  assert.equal(ops.getInspection(A.inspection.id).status, "corrections_required");
  store.close();
});

test("B2: cross-project — a second project in the SAME tenant cannot reach the first project's entities", (t) => {
  const store = openDb(t);
  const finance = new MissionControlFinance(store);
  const ops = new MissionControlOperationsCompletion(store);
  setupRoles(finance);
  const p1 = driveToInProgress(store, { handoffId: "handoff-b-p1" });
  const p2 = driveToInProgress(store, { handoffId: "handoff-b-p2" });
  const S = buildStack(store, finance, ops, { projectId: p1.id, tag: "P1" });
  const X = { projectId: p2.id }; // hostile calls are aimed at p2 but reference p1's ids

  assert.throws(() => finance.reviewInvoice({ ...X, actor: BOSS, invoiceId: S.invoice.id, decision: "rejected", rationale: "hostile" }), /invoice_not_found/);
  assert.throws(() => finance.requestDraw({ ...X, actor: PM, amount: 100, percentComplete: 50, evidenceRefs: ["evidence://p"], invoiceIds: [S.invoice.id], reason: "hostile" }), /invoice_project_mismatch/);
  assert.throws(() => finance.decideDraw({ ...X, actor: BOSS, drawId: S.draw.id, decision: "rejected", rationale: "hostile" }), /draw_not_found/);
  assert.throws(() => finance.recordPayment({ ...X, actor: PM, drawId: S.draw.id, amount: 100, paymentRef: "ACH-HOSTILE-2" }), /draw_not_found/);
  assert.throws(() => finance.recordReconciliation({ ...X, actor: PM, paymentId: S.payment.id, bankRecord: { amount: 1 } }), /payment_not_found/);
  assert.throws(() => buildLenderPackage(store, store.defaultTenantId, p2.id, S.draw.id), /draw_not_found/);
  assert.throws(() => ops.recordInspectionOutcome({ ...X, actor: PM, inspectionId: S.inspection.id, outcome: "passed", evidenceRef: "evidence://x" }), /inspection_not_found/);
  assert.throws(() => ops.completeCorrectionItem({ ...X, actor: PM, correctionId: S.correctionId, evidenceRef: "evidence://x" }), /correction_not_found/);
  assert.throws(() => ops.transitionPermitStatus({ ...X, actor: PM, permitId: S.permit.id, status: "closed" }), /permit_not_found/);
  assert.throws(() => ops.transitionMaterial({ ...X, actor: PM, materialId: S.material.id, status: "ordered" }), /material_not_found/);
  assert.throws(() => ops.setTaskStatus({ ...X, actor: PM, taskId: S.task.id, status: "done" }), /task_not_found/);
  assert.throws(() => ops.createTask({ ...X, actor: PM, title: "Depends on P1 task", startsOn: "2026-10-06", dueOn: "2026-10-07", dependsOn: [S.task.id] }), /task_dependency_not_found/);
  assert.throws(() => ops.scheduleInspection({ ...X, actor: PM, type: "reinspection", scheduledFor: "2026-10-14T09:00:00Z", inspectorRef: "X", supersedesId: S.inspection.id }), /inspection_not_found/);

  // p2's own books stay at zero while p1's are untouched
  assert.deepEqual(finance.getProjectFinancials(p2.id), { projectId: p2.id, approved: 0, allocated: 0, paid: 0, reconciled: 0 });
  assert.deepEqual(finance.getProjectFinancials(p1.id), { projectId: p1.id, approved: 10000, allocated: 10000, paid: 4000, reconciled: 4000 });
  assert.equal(finance.listInvoices(p2.id).length, 0);
  assert.equal(finance.verifyAuditChain(p1.id), true);
  store.close();
});
