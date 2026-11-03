import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MissionControlStore, CURRENT_SCHEMA_VERSION, SCHEMA_MIGRATIONS, DEFAULT_TENANT_ID } from "../src/missionControlStore.mjs";
import { receiveClosedAcquisition } from "../src/missionControlIntake.mjs";

function tempStore(t, options) {
  const dir = mkdtempSync(join(tmpdir(), "mc-store-"));
  const path = join(dir, "mission-control.db");
  const store = new MissionControlStore(path, options);
  t.after(() => { try { store.close(); } catch {} rmSync(dir, { recursive: true, force: true }); });
  return { store, path, dir };
}

function payload(opportunityId = "opp-123") {
  return {
    contractVersion: "1.0",
    sourceSystem: "pipeline",
    targetSystem: "mission-control",
    opportunityId,
    opportunityCode: "OCG-123",
    propertyId: "property-123",
    address: "123 Test St",
    closedAt: "2026-09-25T16:00:00Z",
    acquisition: { purchasePrice: 145000, earnestMoney: 1000, strategyType: "cash_purchase", offerId: "offer-1", offerVersionId: "version-1" },
    underwriting: { sourceSystem: "deal-scout", sourceUnderwritingId: "victor-1", arv: 235000, rehab: 30000, mao: 155000, confidence: 0.9, limitations: null },
    renovationSeed: { budgetBaseline: 30000, scopeStatus: "needs_field_validation", projectStatus: "intake_ready" }
  };
}

test("migration runner: fresh database reaches the current schema version and reopens without re-applying", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "mc-store-"));
  const path = join(dir, "mission-control.db");
  t.after(() => rmSync(dir, { recursive: true, force: true }));

  assert.deepEqual(SCHEMA_MIGRATIONS.map(m => m.version), [1, 2, 3, 4]);
  const first = new MissionControlStore(path);
  assert.equal(first.schemaVersion(), CURRENT_SCHEMA_VERSION);
  assert.equal(CURRENT_SCHEMA_VERSION, 4);
  const seeded = receiveClosedAcquisition({ handoffId: "handoff-mig", payload: payload(), repository: first.intakeRepository() });
  first.close();

  const second = new MissionControlStore(path);
  assert.equal(second.schemaVersion(), CURRENT_SCHEMA_VERSION);
  // state written before the reopen survived and no migration re-ran over it
  assert.equal(second.getProject(seeded.project.id).sourceOpportunityId, "opp-123");
  assert.equal(second.listProjects().length, 1);
  second.close();
  assert.ok(existsSync(path));
});

test("intake repository contract: receiveClosedAcquisition persists end-to-end with duplicate detection", (t) => {
  const { store } = tempStore(t);
  const repo = store.intakeRepository();

  const first = receiveClosedAcquisition({ handoffId: "handoff-1", payload: payload(), repository: repo });
  assert.equal(first.duplicate, false);
  assert.equal(first.project.acquisitionPrice, 145000);
  assert.equal(first.project.rehabBudgetBaseline, 30000);
  assert.equal(first.acknowledgment.eventType, "acknowledged");
  assert.equal(first.acknowledgment.externalRef, first.project.id);

  const found = repo.findBySourceHandoffId("handoff-1");
  assert.equal(found.id, first.project.id);
  assert.equal(found.sourceHandoffId, "handoff-1");

  const duplicate = receiveClosedAcquisition({ handoffId: "handoff-1", payload: payload(), repository: repo });
  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.project.id, first.project.id);
  assert.equal(store.listProjects().length, 1);

  // the persisted seed is a real intake-stage workflow state at version 1
  assert.equal(store.workflowVersion(first.project.id), 1);
  const restored = store.restoreWorkflow(first.project.id);
  assert.equal(restored.project.id, first.project.id);
  assert.equal(restored.project.stage, "intake");
  assert.equal(restored.project.scopeStatus, "field_scope_required");
});

test("optimistic locking: a stale writer is rejected with version_conflict", (t) => {
  const { store } = tempStore(t);
  const { project } = receiveClosedAcquisition({ handoffId: "handoff-lock", payload: payload(), repository: store.intakeRepository() });

  const loaded = store.loadWorkflowState(project.id);
  assert.equal(loaded.version, 1);
  const state = loaded.state;
  state.scopeItems.push({ id: "scope-1", title: "Roof", category: "exterior", estimatedCost: 9000, required: true, status: "validated" });

  assert.equal(store.saveWorkflowState(project.id, state, 1), 2);
  assert.throws(() => store.saveWorkflowState(project.id, state, 1), /version_conflict/);
  assert.throws(() => store.saveWorkflowState(project.id, state, 0), /version_conflict/);
  assert.equal(store.saveWorkflowState(project.id, state, 2), 3);
  assert.equal(store.workflowVersion(project.id), 3);
  assert.equal(store.loadWorkflowState(project.id).state.scopeItems.length, 1);
});

test("two restored writers: first persist wins, second is rejected and the stored state is the winner's", (t) => {
  const { store } = tempStore(t);
  const { project } = receiveClosedAcquisition({ handoffId: "handoff-race", payload: payload(), repository: store.intakeRepository() });

  const writerA = store.restoreWorkflow(project.id);
  const writerB = store.restoreWorkflow(project.id);
  writerA.validateScope({ items: [{ title: "Kitchen", estimatedCost: 12000 }] });
  writerB.validateScope({ items: [{ title: "Bath", estimatedCost: 6000 }] });

  store.persistWorkflow(writerA);
  assert.throws(() => store.persistWorkflow(writerB), /version_conflict/);

  const winner = store.restoreWorkflow(project.id);
  assert.deepEqual(winner.scopeItems.map(i => i.title), ["Kitchen"]);
  assert.equal(winner.project.stage, "budget_approval");
});

test("an untracked instance cannot silently overwrite an existing row", (t) => {
  const { store } = tempStore(t);
  const { project } = receiveClosedAcquisition({ handoffId: "handoff-untracked", payload: payload(), repository: store.intakeRepository() });
  const tracked = store.restoreWorkflow(project.id);
  tracked.validateScope({ items: [{ title: "Roof", estimatedCost: 9000 }] });
  store.persistWorkflow(tracked);

  const fresh = store.restoreWorkflow(project.id);
  // simulate an untracked twin by restoring through a second store handle on the same file
  const other = new MissionControlStore(store.path);
  const twin = other.restoreWorkflow(project.id);
  twin.approveBudget({ amount: 50000, rationale: "twin writer" });
  // twin is tracked by `other`, so this succeeds there; the point is the first
  // store's tracked instance is now stale and must conflict
  other.persistWorkflow(twin);
  assert.throws(() => store.persistWorkflow(fresh), /version_conflict/);
  other.close();
});

test("tenant isolation: same source handoff id in two tenants creates separate projects and reads never cross", (t) => {
  const { store } = tempStore(t);
  const alpha = receiveClosedAcquisition({ handoffId: "handoff-shared", payload: payload("opp-alpha"), repository: store.intakeRepository("tenant-alpha") });
  const beta = receiveClosedAcquisition({ handoffId: "handoff-shared", payload: payload("opp-beta"), repository: store.intakeRepository("tenant-beta") });

  assert.equal(alpha.duplicate, false);
  assert.equal(beta.duplicate, false);
  assert.notEqual(alpha.project.id, beta.project.id);

  // duplicate detection is per-tenant too
  const alphaDup = receiveClosedAcquisition({ handoffId: "handoff-shared", payload: payload("opp-alpha"), repository: store.intakeRepository("tenant-alpha") });
  assert.equal(alphaDup.duplicate, true);
  assert.equal(alphaDup.project.id, alpha.project.id);

  assert.deepEqual(store.listProjects("tenant-alpha").map(p => p.id), [alpha.project.id]);
  assert.deepEqual(store.listProjects("tenant-beta").map(p => p.id), [beta.project.id]);
  assert.deepEqual(store.listProjects(DEFAULT_TENANT_ID), []);

  // cross-tenant reads return nothing, never the other tenant's rows
  assert.equal(store.getProject(beta.project.id, "tenant-alpha"), null);
  assert.equal(store.getProject(alpha.project.id, "tenant-beta"), null);
  assert.equal(store.findProjectBySourceHandoffId("handoff-shared", "tenant-alpha").id, alpha.project.id);
  assert.equal(store.restoreWorkflow(beta.project.id, { tenantId: "tenant-alpha" }), null);
  assert.equal(store.loadWorkflowState(beta.project.id, "tenant-alpha"), null);
  assert.throws(() => store.saveWorkflowState(beta.project.id, { project: beta.project }, 1, "tenant-alpha"), /project_not_found/);
});

test("events table is append-only: direct UPDATE and DELETE are refused by the schema", (t) => {
  const { store } = tempStore(t);
  const { project } = receiveClosedAcquisition({ handoffId: "handoff-events", payload: payload(), repository: store.intakeRepository() });
  const workflow = store.restoreWorkflow(project.id);
  workflow.validateScope({ items: [{ title: "Roof", estimatedCost: 9000 }] });
  store.persistWorkflow(workflow);

  const rows = store.db.prepare("SELECT COUNT(*) AS c FROM events WHERE project_id = ?").get(project.id);
  assert.equal(rows.c, 1);
  assert.throws(() => store.db.prepare("UPDATE events SET type = 'tampered' WHERE project_id = ?").run(project.id), /events_append_only/);
  assert.throws(() => store.db.prepare("DELETE FROM events WHERE project_id = ?").run(project.id), /events_append_only/);
  const after = store.db.prepare("SELECT type FROM events WHERE project_id = ?").get(project.id);
  assert.equal(after.type, "scope_validated");
});

test("a shortened event history is rejected as a rewrite, not merged", (t) => {
  const { store } = tempStore(t);
  const { project } = receiveClosedAcquisition({ handoffId: "handoff-rewrite", payload: payload(), repository: store.intakeRepository() });
  const workflow = store.restoreWorkflow(project.id);
  workflow.validateScope({ items: [{ title: "Roof", estimatedCost: 9000 }] });
  store.persistWorkflow(workflow);

  const loaded = store.loadWorkflowState(project.id);
  loaded.state.events = [];
  assert.throws(() => store.saveWorkflowState(project.id, loaded.state, loaded.version), /event_history_rewrite/);
});
