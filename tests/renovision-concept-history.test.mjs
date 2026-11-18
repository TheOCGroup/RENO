import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp, rm, readdir, readFile, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {validateConceptRecord, buildConceptRecord, makeFixtureConceptRecord, applyConceptApproval, buildConceptComparison, isOpaqueAssetRef} from "../lib/renovision/concept-history.mjs";
import {createMemoryConceptStore, createFileConceptStore} from "../lib/renovision/concept-store.mjs";
import {createGcsConceptStore} from "../lib/renovision/gcs-concept-store.mjs";
const base = {conceptId: "concept-1", tenantId: "tenant-a", projectId: "project-1", propertyId: "property-1", roomId: "room-1", originalAssetRef: "evidence-original-1", generatedAssetRef: "evidence-generated-1", model: "gemini-2.5-flash-image", provider: "vertex", generationSettings: {prompt: "oak cabinets", styleId: "modern"}, provenance: {createdBy: "operator-1", origin: "render-photo"}, now: "2026-11-17T10:00:00.000Z"};

test("fixture concept record is valid and clearly labeled as a fixture", () => {
 const record = makeFixtureConceptRecord();
 assert.equal(validateConceptRecord(record).valid, true);
 assert.equal(record.isFixture, true);
 assert.equal(record.provider, "fixture");
 assert.equal(record.model, "fixture-deterministic-v1");
 assert.equal(record.provenance.fixture, true);
 // A real-provider record may not quietly claim to be a fixture, and vice versa.
 assert.equal(validateConceptRecord({...makeFixtureConceptRecord(), provider: "vertex"}).valid, false);
});

test("concept records reject private storage paths as asset references", () => {
 for (const bad of ["/data/renovision/evidence/secret.bin", "gs://private-bucket/object.png", "https://storage.googleapis.com/b/o.png", "C:\\secrets\\photo.png", "../escape.png", "tenant-a/project-1/photo.png"]) {
   assert.equal(isOpaqueAssetRef(bad), false, bad);
   assert.throws(() => buildConceptRecord({...base, originalAssetRef: bad}), /opaque/);
 }
 assert.equal(isOpaqueAssetRef("durable-evidence-0123456789abcdef01234567"), true);
 assert.equal(isOpaqueAssetRef("sha256:0123456789abcdef"), true);
});

test("failed and interrupted generation jobs are honest records without a generated asset", () => {
 const failed = buildConceptRecord({...base, conceptId: "concept-failed", generatedAssetRef: null, status: "failed", failureReason: "vertex_generation_failed"});
 assert.equal(validateConceptRecord(failed).valid, true);
 assert.equal(failed.completedAt, null);
 const interrupted = buildConceptRecord({...base, conceptId: "concept-interrupted", generatedAssetRef: null, status: "interrupted", failureReason: "client_disconnected"});
 assert.equal(validateConceptRecord(interrupted).valid, true);
 assert.throws(() => buildConceptRecord({...base, generatedAssetRef: null, status: "failed"}), /failure_reason/);
 assert.throws(() => buildConceptRecord({...base, status: "failed", failureReason: "boom"}), /must_be_null/);
 assert.throws(() => buildConceptRecord({...base, generatedAssetRef: null}), /generated_asset_ref_required/);
});

test("integrity seal rejects silently edited concept records", () => {
 const record = buildConceptRecord(base);
 assert.equal(validateConceptRecord(record).valid, true);
 for (const tamper of [{model: "other-model"}, {generatedAssetRef: "evidence-generated-2"}, {status: "failed"}, {approval: {approved: true, approvedBy: "mallory", approvedAt: "2026-11-17T11:00:00.000Z"}}]) {
   assert.equal(validateConceptRecord({...record, ...tamper}).valid, false, JSON.stringify(tamper));
 }
});

test("memory concept store: create is create-only, load/list are project scoped", async () => {
 const store = createMemoryConceptStore();
 const record = buildConceptRecord(base);
 await store.create(record);
 await assert.rejects(() => store.create(record), (e) => e.code === "CONCEPT_CONFLICT");
 assert.deepEqual(await store.load({tenantId: "tenant-a", projectId: "project-1", conceptId: "concept-1"}), record);
 assert.equal(await store.load({tenantId: "tenant-b", projectId: "project-1", conceptId: "concept-1"}), null);
 assert.equal(await store.load({tenantId: "tenant-a", projectId: "project-2", conceptId: "concept-1"}), null);
 assert.deepEqual((await store.list({tenantId: "tenant-a", projectId: "project-1"})).map((r) => r.conceptId), ["concept-1"]);
 assert.deepEqual(await store.list({tenantId: "tenant-b", projectId: "project-1"}), []);
 assert.equal(store.storageClass, "ephemeral-test-only");
});

test("approval is preserved and never overwritten by a later approval or generation", async () => {
 const store = createMemoryConceptStore();
 await store.create(buildConceptRecord(base));
 const approved = await store.approve({tenantId: "tenant-a", projectId: "project-1", conceptId: "concept-1", approvedBy: "operator-1", approvedAt: "2026-11-17T12:00:00.000Z"});
 assert.equal(approved.approval.approved, true);
 const again = await store.approve({tenantId: "tenant-a", projectId: "project-1", conceptId: "concept-1", approvedBy: "operator-2", approvedAt: "2026-11-17T13:00:00.000Z"});
 assert.equal(again.approval.approvedBy, "operator-1");
 assert.equal(again.approval.approvedAt, "2026-11-17T12:00:00.000Z");
 // A later generation is a new record; the approved record is untouched.
 await store.create(buildConceptRecord({...base, conceptId: "concept-2", now: "2026-11-17T14:00:00.000Z"}));
 const reopened = await store.load({tenantId: "tenant-a", projectId: "project-1", conceptId: "concept-1"});
 assert.equal(reopened.approval.approved, true);
 assert.equal((await store.load({tenantId: "tenant-a", projectId: "project-1", conceptId: "concept-2"})).approval.approved, false);
 assert.equal(applyConceptApproval(buildConceptRecord(base), {approvedBy: "op", approvedAt: "2026-11-17T12:00:00.000Z"}).approval.approved, true);
});

test("file concept store persists across instances and stays tenant/project isolated", async (t) => {
 const dir = await mkdtemp(join(tmpdir(), "renovision-concepts-"));
 t.after(() => rm(dir, {recursive: true, force: true}));
 const record = buildConceptRecord(base);
 await createFileConceptStore({rootDir: dir}).create(record);
 const reopened = createFileConceptStore({rootDir: dir});
 assert.deepEqual(await reopened.load({tenantId: "tenant-a", projectId: "project-1", conceptId: "concept-1"}), record);
 assert.equal(await reopened.load({tenantId: "tenant-b", projectId: "project-1", conceptId: "concept-1"}), null);
 assert.deepEqual(await reopened.list({tenantId: "tenant-b", projectId: "project-1"}), []);
 assert.equal(reopened.storageClass, "durable-filesystem");
 // On-disk filenames are hashes: no tenant, project or path data leaks.
 const names = await readdir(dir);
 assert.equal(names.length, 1);
 assert.match(names[0], /^[a-f0-9]{64}\.json$/);
});

test("file concept store rejects corrupted records on read and skips them in list", async (t) => {
 const dir = await mkdtemp(join(tmpdir(), "renovision-concepts-corrupt-"));
 t.after(() => rm(dir, {recursive: true, force: true}));
 const store = createFileConceptStore({rootDir: dir});
 await store.create(buildConceptRecord(base));
 await store.create(buildConceptRecord({...base, conceptId: "concept-2", now: "2026-11-17T11:00:00.000Z"}));
 const names = (await readdir(dir)).filter((n) => n.endsWith(".json"));
 assert.equal(names.length, 2);
 // Tamper with whichever file holds concept-1: rewrite its model without resealing.
 for (const name of names) {
   const envelope = JSON.parse(await readFile(join(dir, name), "utf8"));
   if (envelope.conceptId === "concept-1") { envelope.record.model = "forged-model"; await writeFile(join(dir, name), JSON.stringify(envelope)); }
 }
 assert.equal(await store.load({tenantId: "tenant-a", projectId: "project-1", conceptId: "concept-1"}), null);
 assert.deepEqual((await store.list({tenantId: "tenant-a", projectId: "project-1"})).map((r) => r.conceptId), ["concept-2"]);
});

test("retention: deleteForProject cascades and purgeExpired preserves approved concepts", async (t) => {
 const dir = await mkdtemp(join(tmpdir(), "renovision-concepts-retention-"));
 t.after(() => rm(dir, {recursive: true, force: true}));
 const store = createFileConceptStore({rootDir: dir});
 await store.create(buildConceptRecord({...base, conceptId: "expired-plain", retentionDays: 1, now: "2026-11-01T00:00:00.000Z"}));
 await store.create(buildConceptRecord({...base, conceptId: "expired-approved", retentionDays: 1, now: "2026-11-01T00:00:00.000Z"}));
 await store.create(buildConceptRecord({...base, conceptId: "kept", now: "2026-11-01T00:00:00.000Z"}));
 await store.create(buildConceptRecord({...base, conceptId: "other-project", projectId: "project-2", now: "2026-11-01T00:00:00.000Z"}));
 await store.approve({tenantId: "tenant-a", projectId: "project-1", conceptId: "expired-approved", approvedBy: "operator-1", approvedAt: "2026-11-02T00:00:00.000Z"});
 const purged = await store.purgeExpired({now: Date.parse("2026-11-17T00:00:00.000Z")});
 assert.equal(purged, 1);
 assert.deepEqual((await store.list({tenantId: "tenant-a", projectId: "project-1"})).map((r) => r.conceptId), ["expired-approved", "kept"]);
 const removed = await store.deleteForProject({tenantId: "tenant-a", projectId: "project-1"});
 assert.equal(removed, 2);
 assert.deepEqual(await store.list({tenantId: "tenant-a", projectId: "project-1"}), []);
 assert.deepEqual((await store.list({tenantId: "tenant-a", projectId: "project-2"})).map((r) => r.conceptId), ["other-project"]);
});

function gcsHarness() {
 const objects = new Map();
 const fetchImpl = async (url, options = {}) => {
   const u = new URL(url);
   const name = u.searchParams.get("name") ?? decodeURIComponent(u.pathname.split("/o/")[1] ?? "");
   if (u.pathname.includes("/upload/")) {
     const existing = objects.get(name);
     if (u.searchParams.get("ifGenerationMatch") !== String(existing?.generation ?? 0)) return {ok: false, status: 412};
     objects.set(name, {generation: (existing?.generation ?? 0) + 1, record: JSON.parse(options.body)});
     return {ok: true, status: 200};
   }
   if (options.method === "DELETE") { if (!objects.has(name)) return {ok: false, status: 404}; objects.delete(name); return {ok: true, status: 204}; }
   if (u.pathname.endsWith("/o")) {
     const prefix = u.searchParams.get("prefix") ?? "";
     return {ok: true, json: async () => ({items: [...objects.keys()].filter((n) => n.startsWith(prefix)).map((n) => ({name: n}))})};
   }
   const item = objects.get(name);
   if (!item) return {ok: false, status: 404};
   if (u.searchParams.get("alt") === "media") return {ok: true, json: async () => item.record};
   return {ok: true, json: async () => ({generation: String(item.generation)})};
 };
 return {objects, store: createGcsConceptStore({bucket: "test-bucket", getAccessToken: async () => "test", fetchImpl})};
}

test("gcs concept store: create/load/list scoped to tenant and project, create-only", async () => {
 const {store} = gcsHarness();
 const record = buildConceptRecord(base);
 await store.create(record);
 await assert.rejects(() => store.create(record), (e) => e.code === "CONCEPT_CONFLICT");
 assert.deepEqual(await store.load({tenantId: "tenant-a", projectId: "project-1", conceptId: "concept-1"}), record);
 assert.equal(await store.load({tenantId: "tenant-b", projectId: "project-1", conceptId: "concept-1"}), null);
 assert.deepEqual((await store.list({tenantId: "tenant-a", projectId: "project-1"})).map((r) => r.conceptId), ["concept-1"]);
 assert.deepEqual(await store.list({tenantId: "tenant-b", projectId: "project-1"}), []);
 assert.equal(store.storageClass, "durable-gcs");
});

test("gcs concept store: approval is generation-guarded and corrupted objects are rejected", async () => {
 const {store, objects} = gcsHarness();
 await store.create(buildConceptRecord(base));
 const approved = await store.approve({tenantId: "tenant-a", projectId: "project-1", conceptId: "concept-1", approvedBy: "operator-1", approvedAt: "2026-11-17T12:00:00.000Z"});
 assert.equal(approved.approval.approved, true);
 const again = await store.approve({tenantId: "tenant-a", projectId: "project-1", conceptId: "concept-1", approvedBy: "operator-2", approvedAt: "2026-11-17T13:00:00.000Z"});
 assert.equal(again.approval.approvedBy, "operator-1");
 assert.equal(await store.deleteForProject({tenantId: "tenant-a", projectId: "project-1"}), 1);
 await store.create(buildConceptRecord({...base, conceptId: "concept-corrupt"}));
 const [name, item] = [...objects.entries()][0];
 item.record = {...item.record, record: {...item.record.record, model: "forged"}};
 void name;
 assert.equal(await store.load({tenantId: "tenant-a", projectId: "project-1", conceptId: "concept-corrupt"}), null);
 assert.deepEqual(await store.list({tenantId: "tenant-a", projectId: "project-1"}), []);
});

test("concept comparison returns both records and field differences, scoped to one project", () => {
 const left = buildConceptRecord(base);
 const right = buildConceptRecord({...base, conceptId: "concept-2", model: "other-model", designRevision: "rev-2", now: "2026-11-17T11:00:00.000Z"});
 const comparison = buildConceptComparison(left, right);
 assert.equal(comparison.left.conceptId, "concept-1");
 assert.equal(comparison.right.conceptId, "concept-2");
 assert.deepEqual(comparison.differences.map((d) => d.field), ["model", "designRevision"]);
 assert.equal(comparison.verified, false);
 const foreign = buildConceptRecord({...base, conceptId: "concept-3", tenantId: "tenant-b"});
 assert.throws(() => buildConceptComparison(left, foreign), /scope_mismatch/);
});

test("provenance, design revision and generation settings persist verbatim", async () => {
 const store = createMemoryConceptStore();
 const record = buildConceptRecord({...base, designRevision: "2026-11-17T09:30:00.000Z", geometryDigest: "sha256:" + "a".repeat(64), provenance: {createdBy: "operator-1", origin: "render-photo", parentConceptId: "concept-0"}});
 await store.create(record);
 const loaded = await store.load({tenantId: "tenant-a", projectId: "project-1", conceptId: "concept-1"});
 assert.equal(loaded.provenance.createdBy, "operator-1");
 assert.equal(loaded.provenance.origin, "render-photo");
 assert.equal(loaded.provenance.parentConceptId, "concept-0");
 assert.equal(loaded.designRevision, "2026-11-17T09:30:00.000Z");
 assert.equal(loaded.geometryDigest, "sha256:" + "a".repeat(64));
 assert.deepEqual(loaded.generationSettings, {prompt: "oak cabinets", styleId: "modern"});
 assert.equal(loaded.createdAt, "2026-11-17T10:00:00.000Z");
 assert.equal(loaded.completedAt, "2026-11-17T10:00:00.000Z");
});
