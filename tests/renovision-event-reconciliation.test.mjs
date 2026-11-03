import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {createRenovisionServer, createMemoryApprovalRegistry} from "../src/renovisionServer.mjs";
import {createDurableEvidenceStorage} from "../lib/renovision/durable-evidence-storage.mjs";
import {createMemorySpatialEventStore} from "../lib/renovision/memory-spatial-event-store.mjs";

/** Regression suite for the live 2026-11-03 proposal wedge: the spatial
 * event committed to the event store, the project-record save then failed
 * (HTTP 500), and every later proposal failed with a revision conflict
 * because the record's feature revision had diverged from the store. */
const ACTOR = {id: "operator-1", tenantId: "tenant-a", authenticated: true, roles: ["admin"], propertyIds: ["*"], roomIds: []};
async function boot(t, {projectStore, eventStore}) {
  const dir = await mkdtemp(join(tmpdir(), "renovision-reconcile-"));
  t.after(() => rm(dir, {recursive: true, force: true}));
  const server = createRenovisionServer({
    authenticate: async () => ACTOR,
    resolveApproval: createMemoryApprovalRegistry(),
    evidenceStorage: createDurableEvidenceStorage({rootDir: join(dir, "evidence"), authorize: async () => true}),
    eventStore,
    projectStore
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  t.after(() => server.close());
  return "http://127.0.0.1:" + server.address().port;
}
const call = async (base, method, path, body) => {
  const res = await fetch(base + path, {method, headers: {"content-type": "application/json"}, body: body ? JSON.stringify(body) : undefined});
  return {status: res.status, body: await res.json().catch(() => ({}))};
};
function mapProjectStore() {
  const records = new Map();
  const store = {
    storageClass: "map-test",
    failSaves: false,
    failAfterAttempts: Number.POSITIVE_INFINITY,
    saveAttempts: 0,
    async load(id, tenantId) { const d = records.get(tenantId + "/" + id); return d ? structuredClone(d) : null; },
    async save(id, data) {
      store.saveAttempts++;
      if (store.failSaves || store.saveAttempts > store.failAfterAttempts) throw Error("simulated transient persistence failure");
      records.set(data.tenantId + "/" + id, structuredClone(data));
    },
    stored(id, tenantId = "tenant-a") { return records.get(tenantId + "/" + id); }
  };
  return store;
}
async function lockedProject(base, pid) {
  let r = await call(base, "POST", "/api/renovision/projects", {projectId: pid, propertyId: "property-1", roomId: "room-1"});
  assert.equal(r.status, 201);
  const bytes = new TextEncoder().encode("reconcile capture bytes");
  r = await call(base, "POST", `/api/renovision/projects/${pid}/evidence`, {contentBase64: Buffer.from(bytes).toString("base64"), mimeType: "image/png", captureId: "capture-1"});
  assert.equal(r.status, 201);
  const receipt = r.body.receipt;
  const manifest = {tenantId: "tenant-a", propertyId: "property-1", roomId: "room-1", captureId: "capture-1", operatorId: "operator-1", deviceModel: "laser-x", coordinateFrame: "local", capturedAt: "2026-10-26T10:00:00Z", platform: "web", calibrationStatus: "calibrated", coverageGaps: [], artifacts: [{id: receipt.storageRef, kind: "photo", digest: receipt.digest, byteLength: receipt.byteLength}]};
  r = await call(base, "POST", `/api/renovision/projects/${pid}/captures`, {manifest, qualityInput: {blurScore: 0.1, depthCoverageFraction: 0.5, deviceClass: "browser"}});
  assert.equal(r.status, 200);
  r = await call(base, "POST", `/api/renovision/projects/${pid}/capture-review`, {decision: "accept"});
  assert.equal(r.status, 200);
  const mk = (featureId, value) => ({propertyId: "property-1", roomId: "room-1", measurementId: "meas-" + featureId, featureId, captureId: "capture-1", deviceModel: "laser-x", platform: "web", timestamp: "2026-10-26T10:00:00Z", coordinateFrame: "local", evidenceRef: receipt.digest, semanticType: "wall", method: "manual_laser", value, unit: "m", uncertainty: 0.02, calibrationStatus: "calibrated", verificationStatus: "verified", verifiedBy: "verifier-1", verifiedAt: "2026-10-26T11:00:00Z", geometryState: "EXISTING", fieldMeasured: true});
  for (const [f, v] of [["width", 3.6], ["depth", 4.2], ["height", 2.7], ["door_width", 0.9], ["door_offset", 0.5], ["window_width", 1.2], ["window_offset", 1], ["obstruction_offset", 2]]) {
    r = await call(base, "POST", `/api/renovision/projects/${pid}/measurements`, {record: mk(f, v)});
    assert.equal(r.status, 201, f);
  }
  r = await call(base, "POST", `/api/renovision/projects/${pid}/lock`, {});
  assert.equal(r.status, 200);
}
const CHANGE = {featureId: "floor-main", semanticType: "floor", scopeItemId: "scope-floor-1", approvalRef: "approval-1", eventId: "evt-1", reason: "approved flooring change", baseline: {featureId: "floor-main", semanticType: "floor", label: "Existing vinyl"}, proposed: {label: "White oak"}};

test("a proposal whose project save fails after the event commits heals on the next load instead of wedging", async (t) => {
  const projectStore = mapProjectStore();
  const eventStore = createMemorySpatialEventStore({authorize: async () => true});
  const base = await boot(t, {projectStore, eventStore});
  await lockedProject(base, "wedge-1");
  let r = await call(base, "POST", "/api/renovision/approvals", {approvalRef: "approval-1", propertyId: "property-1", roomId: "room-1", featureId: "floor-main", scopeItemId: "scope-floor-1", status: "approved", allowedActorIds: ["operator-1"]});
  assert.equal(r.status, 201);
  // The live incident: the write-ahead marker save succeeds, the event
  // commits, and every attempt of the final project save fails -> 500.
  projectStore.failAfterAttempts = projectStore.saveAttempts + 1;
  r = await call(base, "POST", "/api/renovision/projects/wedge-1/proposals", {change: CHANGE});
  assert.equal(r.status, 500);
  assert.deepEqual(r.body.errors, ["project_persistence_failed"]);
  projectStore.failAfterAttempts = Number.POSITIVE_INFINITY;
  // The event really is in the event store...
  const snap = await eventStore.readFeatureEvents({tenantId: "tenant-a", propertyId: "property-1", roomId: "room-1", featureId: "floor-main", actor: ACTOR});
  assert.equal(snap.revision, 1);
  // ...while the durable record is still pre-proposal, carrying only the
  // write-ahead marker for the affected feature.
  assert.equal(projectStore.stored("wedge-1").stage, "geometry_locked");
  assert.equal(projectStore.stored("wedge-1").featureRevisions["floor-main"] ?? 0, 0);
  assert.deepEqual(projectStore.stored("wedge-1").pendingSpatialFeatures, ["floor-main"]);
  // ...but the next load reconciles from the event store and persists the heal.
  r = await call(base, "GET", "/api/renovision/projects/wedge-1");
  assert.equal(r.status, 200);
  assert.equal(r.body.project.stage, "design_proposed");
  assert.equal(r.body.project.spatialEventCount, 1);
  const proposal = r.body.project.proposals.find((p) => p.featureId === "floor-main");
  assert.equal(proposal.recovered, true);
  assert.equal(proposal.approvalRef, "approval-1");
  assert.ok(r.body.project.audit.some((a) => a.action === "spatial_events_reconciled"));
  assert.equal(projectStore.stored("wedge-1").stage, "design_proposed");
  assert.equal(projectStore.stored("wedge-1").featureRevisions["floor-main"], 1);
  assert.deepEqual(projectStore.stored("wedge-1").pendingSpatialFeatures, []);
  // And the workflow continues: after revocation the gate — not a revision
  // conflict — answers the next proposal.
  r = await call(base, "POST", "/api/renovision/approvals/revoke", {approvalRef: "approval-1"});
  assert.equal(r.status, 200);
  r = await call(base, "POST", "/api/renovision/projects/wedge-1/proposals", {change: {...CHANGE, eventId: "evt-2"}});
  assert.equal(r.status, 422);
  assert.ok(r.body.errors.includes("active approval required"));
});

test("when even the write-ahead marker cannot persist, the proposal fails cleanly with nothing committed", async (t) => {
  const projectStore = mapProjectStore();
  const eventStore = createMemorySpatialEventStore({authorize: async () => true});
  const base = await boot(t, {projectStore, eventStore});
  await lockedProject(base, "clean-1");
  let r = await call(base, "POST", "/api/renovision/approvals", {approvalRef: "approval-1", propertyId: "property-1", roomId: "room-1", featureId: "floor-main", scopeItemId: "scope-floor-1", status: "approved", allowedActorIds: ["operator-1"]});
  assert.equal(r.status, 201);
  projectStore.failSaves = true;
  r = await call(base, "POST", "/api/renovision/projects/clean-1/proposals", {change: CHANGE});
  assert.equal(r.status, 500);
  projectStore.failSaves = false;
  const snap = await eventStore.readFeatureEvents({tenantId: "tenant-a", propertyId: "property-1", roomId: "room-1", featureId: "floor-main", actor: ACTOR});
  assert.equal(snap.revision, 0);
  // The identical proposal then succeeds — no wedge, no conflict.
  r = await call(base, "POST", "/api/renovision/projects/clean-1/proposals", {change: CHANGE});
  assert.equal(r.status, 201);
});

test("transient save failures are retried before a request fails", async (t) => {
  const projectStore = mapProjectStore();
  let failuresLeft = 2;
  const inner = projectStore.save.bind(projectStore);
  projectStore.save = async (id, data) => { if (failuresLeft-- > 0) { projectStore.saveAttempts++; throw Error("transient"); } return inner(id, data); };
  const base = await boot(t, {projectStore, eventStore: createMemorySpatialEventStore({authorize: async () => true})});
  const r = await call(base, "POST", "/api/renovision/projects", {projectId: "retry-1", propertyId: "property-1", roomId: "room-1"});
  assert.equal(r.status, 201);
  assert.equal(projectStore.saveAttempts, 3);
});

test("reconciliation is a no-op when the record and the event store agree", async (t) => {
  const projectStore = mapProjectStore();
  const base = await boot(t, {projectStore, eventStore: createMemorySpatialEventStore({authorize: async () => true})});
  await lockedProject(base, "noop-1");
  const before = projectStore.saveAttempts;
  const auditBefore = projectStore.stored("noop-1").audit.length;
  const r = await call(base, "GET", "/api/renovision/projects/noop-1");
  assert.equal(r.status, 200);
  assert.equal(projectStore.saveAttempts, before);
  assert.equal(projectStore.stored("noop-1").audit.length, auditBefore);
});

test("a divergent event history fails closed instead of being merged", async (t) => {
  const projectStore = mapProjectStore();
  const eventStore = createMemorySpatialEventStore({authorize: async () => true});
  const base = await boot(t, {projectStore, eventStore});
  await lockedProject(base, "diverge-1");
  let r = await call(base, "POST", "/api/renovision/approvals", {approvalRef: "approval-1", propertyId: "property-1", roomId: "room-1", featureId: "floor-main", scopeItemId: "scope-floor-1", status: "approved", allowedActorIds: ["operator-1"]});
  assert.equal(r.status, 201);
  r = await call(base, "POST", "/api/renovision/projects/diverge-1/proposals", {change: CHANGE});
  assert.equal(r.status, 201);
  // Tamper: replace the feature stream with a different, longer history.
  const scope = {tenantId: "tenant-a", propertyId: "property-1", roomId: "room-1", featureId: "floor-main"};
  const foreign = {eventId: "evt-foreign", propertyId: "property-1", roomId: "room-1", featureId: "floor-main", actorId: "operator-1", occurredAt: "2026-10-26T12:00:00Z", reason: "foreign", fromState: "EXISTING", toState: "PROPOSED", scopeItemId: "scope-floor-1", approvalRef: "approval-1"};
  // Reach into the fixture by committing two events under a fresh internal
  // state: the memory store has no replace API, so simulate divergence by
  // advancing the stream with an event the record never saw AND whose head
  // the record cannot prefix-match after a record rollback.
  const stored = projectStore.stored("diverge-1");
  stored.spatialEvents = [];
  stored.featureRevisions = {};
  stored.stage = "geometry_locked";
  stored.proposals = [];
  await projectStore.save("diverge-1", stored);
  // Record now claims no events while the store holds evt-1: adoption is the
  // designed recovery (record is a prefix). True divergence: give the record
  // a DIFFERENT event than the store's head.
  stored.spatialEvents = [{...foreign}];
  stored.featureRevisions = {"floor-main": 0};
  await projectStore.save("diverge-1", stored);
  r = await call(base, "GET", "/api/renovision/projects/diverge-1");
  assert.equal(r.status, 404);
});
