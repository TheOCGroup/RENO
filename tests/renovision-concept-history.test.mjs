import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {createHash} from "node:crypto";
import {validateConceptRecord, normalizeConceptRecord, conceptHistoryView, MAX_CONCEPTS_PER_PROJECT} from "../lib/renovision/concept-history.mjs";
import {RenovisionProject} from "../lib/renovision/project-workflow.mjs";
import {createRenovisionServer, createMemoryApprovalRegistry} from "../src/renovisionServer.mjs";
import {createDurableEvidenceStorage} from "../lib/renovision/durable-evidence-storage.mjs";
import {createDurableSpatialEventStore} from "../lib/renovision/durable-spatial-event-store.mjs";
import {createFileProjectStore} from "../lib/renovision/project-store.mjs";

const sha = (buf) => "sha256:" + createHash("sha256").update(buf).digest("hex");
const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6360000000020001e221bc330000000049454e44ae426082", "hex");
const ref = (buf, mimeType = "image/png") => ({storageRef: "durable-evidence-" + "a".repeat(24), digest: sha(buf), mimeType});
const actorA = {id: "operator-1", tenantId: "tenant-a", authenticated: true};
const baseRecord = (over = {}) => ({
  conceptId: "concept-1", roomId: "room-1", createdAt: "2026-11-17T12:00:00.000Z",
  prompt: "Warm modern living room", selections: {room: "Living room", style: "Modern Organic", palette: "Warm Stone", material: "White oak", priorities: ["More light"]},
  provider: {kind: "mock", simulated: true}, disclosure: "SIMULATED concept for engineering tests.",
  verified: false, concept: ref(PNG), original: ref(PNG), revisionOf: null, ...over,
});

test("concept records: validation enforces honesty and reference integrity", () => {
  assert.equal(validateConceptRecord(baseRecord()).valid, true);
  const normalized = normalizeConceptRecord(baseRecord());
  assert.equal(normalized.verified, false);
  assert.equal(normalized.status, "concept");
  assert.equal(normalized.retentionDays, 365);
  assert.equal(validateConceptRecord(baseRecord({verified: true})).valid, false, "verified concepts are impossible");
  assert.equal(validateConceptRecord(baseRecord({disclosure: ""})).valid, false, "disclosure is mandatory");
  assert.equal(validateConceptRecord(baseRecord({concept: {storageRef: "x", digest: sha(PNG), mimeType: "image/png"}})).valid, false, "storage refs must be evidence refs");
  assert.equal(validateConceptRecord(baseRecord({concept: ref(PNG, "image/gif")})).valid, false, "unsupported mime rejected");
  assert.equal(validateConceptRecord(baseRecord({provider: {kind: "mock"}})).valid, false, "simulated flag is mandatory — unlabeled simulation is not allowed");
  assert.equal(validateConceptRecord(baseRecord({prompt: "x".repeat(2001)})).valid, false);
  assert.throws(() => normalizeConceptRecord(baseRecord({verified: true})), /concept_record_invalid/);
});

test("concept history view: revision chains get depth; order is chronological", () => {
  const a = normalizeConceptRecord(baseRecord());
  const b = normalizeConceptRecord(baseRecord({conceptId: "concept-2", createdAt: "2026-11-17T13:00:00.000Z", revisionOf: "concept-1"}));
  const c = normalizeConceptRecord(baseRecord({conceptId: "concept-3", createdAt: "2026-11-17T14:00:00.000Z", revisionOf: "concept-2"}));
  const view = conceptHistoryView([c, a, b]);
  assert.deepEqual(view.map((v) => [v.conceptId, v.revisionDepth]), [["concept-1", 0], ["concept-2", 1], ["concept-3", 2]]);
});

test("workflow: record, revise, delete, cap, and fail-closed restore", () => {
  const project = new RenovisionProject({projectId: "p1", tenantId: "tenant-a", propertyId: "property-1", roomId: "room-1", createdBy: "operator-1"});
  project.recordConcept({actor: actorA, concept: baseRecord()});
  project.recordConcept({actor: actorA, concept: baseRecord({conceptId: "concept-2", revisionOf: "concept-1"})});
  assert.equal(project.concepts.length, 2);
  assert.throws(() => project.recordConcept({actor: actorA, concept: baseRecord()}), /concept_id_conflict/);
  assert.throws(() => project.recordConcept({actor: actorA, concept: baseRecord({conceptId: "concept-9", revisionOf: "missing"})}), /concept_revision_parent_not_found/);
  assert.throws(() => project.recordConcept({actor: {id: "op-2", tenantId: "tenant-b", authenticated: true}, concept: baseRecord({conceptId: "concept-3"})}), /tenant_scope_mismatch/);
  const removed = project.deleteConcept({actor: actorA, conceptId: "concept-2"});
  assert.equal(removed.conceptId, "concept-2");
  assert.throws(() => project.deleteConcept({actor: actorA, conceptId: "concept-2"}), /concept_not_found/);
  // Restore round-trip preserves history; a corrupted record fails closed.
  const restored = RenovisionProject.restore(project.serialize());
  assert.equal(restored.concepts.length, 1);
  const corrupted = project.serialize();
  corrupted.concepts = [baseRecord({verified: true})];
  assert.throws(() => RenovisionProject.restore(corrupted), /concept_record_invalid/);
  // Cap: a full history refuses new records rather than silently dropping.
  const full = new RenovisionProject({projectId: "p2", tenantId: "tenant-a", propertyId: "property-1", roomId: "room-1", createdBy: "operator-1"});
  for (let i = 0; i < MAX_CONCEPTS_PER_PROJECT; i++) full.recordConcept({actor: actorA, concept: baseRecord({conceptId: "c-" + i})});
  assert.throws(() => full.recordConcept({actor: actorA, concept: baseRecord({conceptId: "one-too-many"})}), /concept_history_full/);
});

async function boot(t, {evidenceStorage} = {}) {
  const dir = await mkdtemp(join(tmpdir(), "renovision-concepts-"));
  t.after(() => rm(dir, {recursive: true, force: true}));
  const actorTenants = new Map();
  const authenticate = async (req) => {
    const id = req.headers["x-actor-id"], tenantId = req.headers["x-tenant-id"];
    if (!id || !tenantId) return null;
    actorTenants.set(id, tenantId);
    return {id, tenantId, authenticated: true, roles: ["admin"], propertyIds: ["*"], roomIds: []};
  };
  const authorize = async ({actorId, tenantId}) => Boolean(actorId && actorTenants.has(actorId) && (!tenantId || actorTenants.get(actorId) === tenantId));
  const storage = evidenceStorage ?? createDurableEvidenceStorage({rootDir: join(dir, "evidence"), authorize});
  const eventStore = createDurableSpatialEventStore({rootDir: join(dir, "events"), authorize: async (scope) => authorize({actorId: scope?.actor?.id, tenantId: scope?.tenantId})});
  const projectStore = createFileProjectStore({rootDir: join(dir, "projects")});
  const server = createRenovisionServer({authenticate, resolveApproval: createMemoryApprovalRegistry(), evidenceStorage: storage, eventStore, projectStore});
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  t.after(() => server.close());
  return {base: "http://127.0.0.1:" + server.address().port, dir, server};
}
const HA = {"x-actor-id": "operator-1", "x-tenant-id": "tenant-a", "content-type": "application/json"};
const HB = {"x-actor-id": "operator-2", "x-tenant-id": "tenant-b", "content-type": "application/json"};
const post = (base, path, headers, body) => fetch(base + path, {method: "POST", headers, body: JSON.stringify(body)});
const conceptBody = (over = {}) => ({
  prompt: "Warm modern living room with more light",
  selections: {room: "Living room", style: "Modern Organic", palette: "Warm Stone", material: "White oak", priorities: ["More light"]},
  provider: {kind: "mock", simulated: true}, disclosure: "SIMULATED concept for engineering tests.",
  conceptImage: {imageBase64: PNG.toString("base64"), mimeType: "image/png"},
  originalImage: {imageBase64: PNG.toString("base64"), mimeType: "image/png"}, ...over,
});

test("routes: save, list, read back, revise, delete — with tenant isolation", async (t) => {
  const {base} = await boot(t);
  await post(base, "/api/renovision/projects", HA, {projectId: "p1", propertyId: "property-1", roomId: "room-1"});
  const saved = await post(base, "/api/renovision/projects/p1/concepts", HA, conceptBody());
  assert.equal(saved.status, 201);
  const savedBody = await saved.json();
  const record = savedBody.concept;
  assert.equal(record.provider.simulated, true);
  assert.equal(record.verified, false);
  assert.match(record.concept.storageRef, /^durable-evidence-[a-f0-9]{24}$/);
  assert.equal(record.concept.digest, sha(PNG));
  // Read the concept image back byte-identically (integrity-verified read).
  const img = await fetch(base + "/api/renovision/projects/p1/concepts/" + record.conceptId + "/image/concept", {headers: HA});
  assert.equal(img.status, 200);
  assert.equal((await img.json()).imageBase64, PNG.toString("base64"));
  // Revision chain through the API.
  const revised = await post(base, "/api/renovision/projects/p1/concepts", HA, conceptBody({revisionOf: record.conceptId, prompt: "Darker wood"}));
  assert.equal(revised.status, 201);
  const list = await (await fetch(base + "/api/renovision/projects/p1/concepts", {headers: HA})).json();
  assert.equal(list.concepts.length, 2);
  assert.equal(list.concepts[1].revisionDepth, 1);
  // Cross-tenant: the project itself is invisible, so history is unreachable.
  const cross = await fetch(base + "/api/renovision/projects/p1/concepts", {headers: HB});
  assert.equal(cross.status, 404);
  const crossImg = await fetch(base + "/api/renovision/projects/p1/concepts/" + record.conceptId + "/image/concept", {headers: HB});
  assert.equal(crossImg.status, 404);
  // Delete removes the record; image reads then 404.
  const del = await post(base, "/api/renovision/projects/p1/concepts/delete", HA, {conceptId: record.conceptId});
  assert.equal(del.status, 200);
  const after = await (await fetch(base + "/api/renovision/projects/p1/concepts", {headers: HA})).json();
  assert.equal(after.concepts.length, 1);
  const gone = await fetch(base + "/api/renovision/projects/p1/concepts/" + record.conceptId + "/image/concept", {headers: HA});
  assert.equal(gone.status, 404);
});

test("routes: invalid input and storage failure never leave a record", async (t) => {
  const {base} = await boot(t);
  await post(base, "/api/renovision/projects", HA, {projectId: "p1", propertyId: "property-1", roomId: "room-1"});
  const badImage = await post(base, "/api/renovision/projects/p1/concepts", HA, conceptBody({conceptImage: {imageBase64: "aGVsbG8=", mimeType: "image/gif"}}));
  assert.equal(badImage.status, 422);
  const noDisclosure = await post(base, "/api/renovision/projects/p1/concepts", HA, conceptBody({disclosure: ""}));
  assert.equal(noDisclosure.status, 422);
  const list = await (await fetch(base + "/api/renovision/projects/p1/concepts", {headers: HA})).json();
  assert.equal(list.concepts.length, 0, "failed saves record nothing");

  const failingStorage = {
    storageClass: "failing-test-double",
    async put() { throw new Error("disk on fire"); },
    async get() { throw new Error("not found"); },
  };
  const second = await boot(t, {evidenceStorage: failingStorage});
  await post(second.base, "/api/renovision/projects", HA, {projectId: "p1", propertyId: "property-1", roomId: "room-1"});
  const failed = await post(second.base, "/api/renovision/projects/p1/concepts", HA, conceptBody());
  assert.equal(failed.status, 502);
  const list2 = await (await fetch(second.base + "/api/renovision/projects/p1/concepts", {headers: HA})).json();
  assert.equal(list2.concepts.length, 0, "storage failure leaves no dangling record");
});

test("routes: concept history survives a server restart (durable stores)", async (t) => {
  const first = await boot(t);
  await post(first.base, "/api/renovision/projects", HA, {projectId: "p1", propertyId: "property-1", roomId: "room-1"});
  const saved = await (await post(first.base, "/api/renovision/projects/p1/concepts", HA, conceptBody())).json();
  first.server.close();
  // A brand-new server over the same durable directories sees the history.
  const actorTenants = new Map();
  const authenticate = async (req) => {
    const id = req.headers["x-actor-id"], tenantId = req.headers["x-tenant-id"];
    if (!id || !tenantId) return null;
    actorTenants.set(id, tenantId);
    return {id, tenantId, authenticated: true, roles: ["admin"], propertyIds: ["*"], roomIds: []};
  };
  const authorize = async ({actorId, tenantId}) => Boolean(actorId && actorTenants.has(actorId) && (!tenantId || actorTenants.get(actorId) === tenantId));
  const server2 = createRenovisionServer({authenticate, resolveApproval: createMemoryApprovalRegistry(),
    evidenceStorage: createDurableEvidenceStorage({rootDir: join(first.dir, "evidence"), authorize}),
    eventStore: createDurableSpatialEventStore({rootDir: join(first.dir, "events"), authorize: async (scope) => authorize({actorId: scope?.actor?.id, tenantId: scope?.tenantId})}),
    projectStore: createFileProjectStore({rootDir: join(first.dir, "projects")})});
  await new Promise((r) => server2.listen(0, "127.0.0.1", r));
  t.after(() => server2.close());
  const base2 = "http://127.0.0.1:" + server2.address().port;
  const list = await (await fetch(base2 + "/api/renovision/projects/p1/concepts", {headers: HA})).json();
  assert.equal(list.concepts.length, 1);
  assert.equal(list.concepts[0].conceptId, saved.concept.conceptId);
  const img = await (await fetch(base2 + "/api/renovision/projects/p1/concepts/" + saved.concept.conceptId + "/image/original", {headers: HA})).json();
  assert.equal(img.imageBase64, PNG.toString("base64"));
});
