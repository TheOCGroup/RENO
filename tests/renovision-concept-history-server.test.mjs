import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp, rm, readdir, readFile, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {createRenovisionServer, createMemoryApprovalRegistry} from "../src/renovisionServer.mjs";
import {createDurableEvidenceStorage} from "../lib/renovision/durable-evidence-storage.mjs";
import {createFileProjectStore} from "../lib/renovision/project-store.mjs";
import {createFileConceptStore} from "../lib/renovision/concept-store.mjs";
const H = {"x-actor-id": "operator-1", "x-tenant-id": "tenant-a", "content-type": "application/json"};
const HB = {"x-actor-id": "operator-9", "x-tenant-id": "tenant-b", "content-type": "application/json"};
const HV = {"x-actor-id": "viewer-1", "x-tenant-id": "tenant-a", "content-type": "application/json"};
async function boot(t, dir) {
 const authenticate = async (req) => {
   const id = req.headers["x-actor-id"], tenantId = req.headers["x-tenant-id"];
   if (!id || !tenantId) return null;
   return {id, tenantId, authenticated: true, roles: [id.startsWith("viewer") ? "viewer" : "admin"], propertyIds: ["*"], roomIds: []};
 };
 const evidenceStorage = createDurableEvidenceStorage({rootDir: join(dir, "evidence"), authorize: async () => true});
 const projectStore = createFileProjectStore({rootDir: join(dir, "projects")});
 const conceptStore = createFileConceptStore({rootDir: join(dir, "concepts")});
 const server = createRenovisionServer({authenticate, resolveApproval: createMemoryApprovalRegistry(), evidenceStorage, projectStore, conceptStore});
 await new Promise((r) => server.listen(0, "127.0.0.1", r));
 t.after(() => server.close());
 return {server, base: "http://127.0.0.1:" + server.address().port, conceptStore};
}
const call = async (base, method, path, body, headers = H) => {
 const res = await fetch(base + path, {method, headers, body: body ? JSON.stringify(body) : undefined});
 return {status: res.status, body: await res.json().catch(async () => ({raw: await res.text()}))};
};
const conceptBody = {conceptId: "concept-1", originalAssetRef: "durable-evidence-aaaa", generatedAssetRef: "durable-evidence-bbbb", model: "gemini-2.5-flash-image", provider: "vertex", generationSettings: {prompt: "oak cabinets"}, provenance: {origin: "render-photo"}};
async function bootWithProject(t) {
 const dir = await mkdtemp(join(tmpdir(), "renovision-concept-http-"));
 t.after(() => rm(dir, {recursive: true, force: true}));
 const ctx = await boot(t, dir);
 const created = await call(ctx.base, "POST", "/api/renovision/projects", {projectId: "reno-concept-1", propertyId: "property-1", roomId: "room-1"});
 assert.equal(created.status, 201);
 return {...ctx, dir};
}

test("concept history end-to-end: save, browse, reopen, compare, approve (fixture-labeled render)", async (t) => {
 const {base} = await bootWithProject(t);
 // Deterministic fixture exercise: no real renderer is configured, so the
 // saved concept is a labeled fixture record, never a generated image.
 let r = await call(base, "POST", "/api/renovision/projects/reno-concept-1/concepts", {...conceptBody, isFixture: true, provider: "fixture", model: "fixture-deterministic-v1", originalAssetRef: "fixture-original-1", generatedAssetRef: "fixture-generated-1"});
 assert.equal(r.status, 201);
 assert.equal(r.body.concept.isFixture, true);
 assert.equal(r.body.concept.tenantId, "tenant-a");
 assert.equal(r.body.concept.projectId, "reno-concept-1");
 assert.equal(r.body.concept.provenance.createdBy, "operator-1");
 assert.equal(r.body.concept.status, "completed");
 r = await call(base, "POST", "/api/renovision/projects/reno-concept-1/concepts", {...conceptBody, conceptId: "concept-2", generatedAssetRef: "durable-evidence-cccc", generationSettings: {prompt: "walnut cabinets"}});
 assert.equal(r.status, 201);
 r = await call(base, "GET", "/api/renovision/projects/reno-concept-1/concepts");
 assert.equal(r.status, 200);
 assert.deepEqual(r.body.concepts.map((c) => c.conceptId), ["concept-1", "concept-2"]);
 r = await call(base, "GET", "/api/renovision/projects/reno-concept-1/concepts/concept-2");
 assert.equal(r.status, 200);
 assert.equal(r.body.concept.generationSettings.prompt, "walnut cabinets");
 r = await call(base, "POST", "/api/renovision/projects/reno-concept-1/concepts/compare", {leftConceptId: "concept-1", rightConceptId: "concept-2"});
 assert.equal(r.status, 200);
 assert.equal(r.body.comparison.left.conceptId, "concept-1");
 assert.equal(r.body.comparison.right.conceptId, "concept-2");
 assert.ok(r.body.comparison.differences.some((d) => d.field === "generatedAssetRef"));
 r = await call(base, "POST", "/api/renovision/projects/reno-concept-1/concepts/concept-1/approve", {});
 assert.equal(r.status, 200);
 assert.equal(r.body.concept.approval.approved, true);
 assert.equal(r.body.concept.approval.approvedBy, "operator-1");
 // Later generation does not disturb the approved version.
 r = await call(base, "POST", "/api/renovision/projects/reno-concept-1/concepts", {...conceptBody, conceptId: "concept-3", generatedAssetRef: "durable-evidence-dddd"});
 assert.equal(r.status, 201);
 r = await call(base, "GET", "/api/renovision/projects/reno-concept-1/concepts/concept-1");
 assert.equal(r.body.concept.approval.approved, true);
 const health = await (await fetch(base + "/health")).json();
 assert.equal(health.conceptStorageClass, "durable-filesystem");
});

test("failed and interrupted generation jobs are recorded honestly via the API", async (t) => {
 const {base} = await bootWithProject(t);
 let r = await call(base, "POST", "/api/renovision/projects/reno-concept-1/concepts", {...conceptBody, conceptId: "job-failed", generatedAssetRef: null, status: "failed", failureReason: "vertex_generation_failed"});
 assert.equal(r.status, 201);
 assert.equal(r.body.concept.status, "failed");
 assert.equal(r.body.concept.generatedAssetRef, null);
 assert.equal(r.body.concept.completedAt, null);
 r = await call(base, "POST", "/api/renovision/projects/reno-concept-1/concepts", {...conceptBody, conceptId: "job-interrupted", generatedAssetRef: null, status: "interrupted", failureReason: "client_disconnected"});
 assert.equal(r.status, 201);
 assert.equal(r.body.concept.status, "interrupted");
 r = await call(base, "POST", "/api/renovision/projects/reno-concept-1/concepts", {...conceptBody, conceptId: "job-dishonest", generatedAssetRef: null, status: "failed"});
 assert.equal(r.status, 422);
 assert.ok(r.body.errors.some((e) => e.includes("failure_reason")));
});

test("cross-tenant access to concept history is invisible: read, list, approve and write all fail", async (t) => {
 const {base} = await bootWithProject(t);
 await call(base, "POST", "/api/renovision/projects/reno-concept-1/concepts", conceptBody);
 // Tenant B cannot even see tenant A's project (existing convention: 404).
 let r = await call(base, "GET", "/api/renovision/projects/reno-concept-1/concepts", null, HB);
 assert.equal(r.status, 404);
 r = await call(base, "GET", "/api/renovision/projects/reno-concept-1/concepts/concept-1", null, HB);
 assert.equal(r.status, 404);
 r = await call(base, "POST", "/api/renovision/projects/reno-concept-1/concepts/concept-1/approve", {}, HB);
 assert.equal(r.status, 404);
 r = await call(base, "POST", "/api/renovision/projects/reno-concept-1/concepts", {...conceptBody, conceptId: "concept-intrusion"}, HB);
 assert.equal(r.status, 404);
 r = await call(base, "POST", "/api/renovision/projects/reno-concept-1/concepts/compare", {leftConceptId: "concept-1", rightConceptId: "concept-1"}, HB);
 assert.equal(r.status, 404);
 // Tenant A's record is untouched by the attempts.
 r = await call(base, "GET", "/api/renovision/projects/reno-concept-1/concepts/concept-1");
 assert.equal(r.body.concept.approval.approved, false);
});

test("viewers may browse concept history but cannot write or approve", async (t) => {
 const {base} = await bootWithProject(t);
 await call(base, "POST", "/api/renovision/projects/reno-concept-1/concepts", conceptBody);
 let r = await call(base, "GET", "/api/renovision/projects/reno-concept-1/concepts", null, HV);
 assert.equal(r.status, 200);
 assert.equal(r.body.concepts.length, 1);
 r = await call(base, "POST", "/api/renovision/projects/reno-concept-1/concepts", {...conceptBody, conceptId: "concept-viewer"}, HV);
 assert.equal(r.status, 403);
 r = await call(base, "POST", "/api/renovision/projects/reno-concept-1/concepts/concept-1/approve", {}, HV);
 assert.equal(r.status, 403);
});

test("duplicate ids conflict and private paths are refused; responses expose opaque refs only", async (t) => {
 const {base, dir} = await bootWithProject(t);
 let r = await call(base, "POST", "/api/renovision/projects/reno-concept-1/concepts", conceptBody);
 assert.equal(r.status, 201);
 assert.ok(!JSON.stringify(r.body).includes(dir), "response must not leak the storage directory");
 assert.ok(!r.body.concept.originalAssetRef.includes("/") && !r.body.concept.generatedAssetRef.includes("/"), "asset references are opaque ids, never paths");
 r = await call(base, "POST", "/api/renovision/projects/reno-concept-1/concepts", conceptBody);
 assert.equal(r.status, 409);
 assert.deepEqual(r.body.errors, ["concept_already_exists"]);
 r = await call(base, "POST", "/api/renovision/projects/reno-concept-1/concepts", {...conceptBody, conceptId: "concept-path", originalAssetRef: "/data/renovision/evidence/secret.bin"});
 assert.equal(r.status, 422);
 assert.ok(r.body.errors.some((e) => e.includes("opaque")));
 // Caller-supplied tenant/provenance identity is overwritten by the server.
 r = await call(base, "POST", "/api/renovision/projects/reno-concept-1/concepts", {...conceptBody, conceptId: "concept-spoof", tenantId: "tenant-b", provenance: {origin: "render-photo", createdBy: "mallory"}});
 assert.equal(r.status, 201);
 assert.equal(r.body.concept.tenantId, "tenant-a");
 assert.equal(r.body.concept.provenance.createdBy, "operator-1");
});

test("concept history survives a server restart on the durable stores", async (t) => {
 const dir = await mkdtemp(join(tmpdir(), "renovision-concept-restart-"));
 t.after(() => rm(dir, {recursive: true, force: true}));
 const first = await boot(t, dir);
 await call(first.base, "POST", "/api/renovision/projects", {projectId: "reno-concept-1", propertyId: "property-1", roomId: "room-1"});
 await call(first.base, "POST", "/api/renovision/projects/reno-concept-1/concepts", conceptBody);
 await new Promise((r) => first.server.close(r));
 const second = await boot(t, dir);
 const r = await call(second.base, "GET", "/api/renovision/projects/reno-concept-1/concepts/concept-1");
 assert.equal(r.status, 200);
 assert.equal(r.body.concept.conceptId, "concept-1");
});

test("a corrupted stored concept is invisible via the API (404 + excluded from list)", async (t) => {
 const {base, dir} = await bootWithProject(t);
 await call(base, "POST", "/api/renovision/projects/reno-concept-1/concepts", conceptBody);
 await call(base, "POST", "/api/renovision/projects/reno-concept-1/concepts", {...conceptBody, conceptId: "concept-2", generatedAssetRef: "durable-evidence-cccc"});
 const conceptDir = join(dir, "concepts");
 for (const name of (await readdir(conceptDir)).filter((n) => n.endsWith(".json"))) {
   const envelope = JSON.parse(await readFile(join(conceptDir, name), "utf8"));
   if (envelope.conceptId === "concept-1") { envelope.record.provider = "forged-provider"; await writeFile(join(conceptDir, name), JSON.stringify(envelope)); }
 }
 let r = await call(base, "GET", "/api/renovision/projects/reno-concept-1/concepts/concept-1");
 assert.equal(r.status, 404);
 r = await call(base, "GET", "/api/renovision/projects/reno-concept-1/concepts");
 assert.deepEqual(r.body.concepts.map((c) => c.conceptId), ["concept-2"]);
});
