import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {generateKeyPairSync, createSign} from "node:crypto";
import {createRenovisionServer, createMemoryApprovalRegistry} from "../src/renovisionServer.mjs";
import {createDurableEvidenceStorage} from "../lib/renovision/durable-evidence-storage.mjs";
import {createDurableSpatialEventStore} from "../lib/renovision/durable-spatial-event-store.mjs";
import {createFileProjectStore} from "../lib/renovision/project-store.mjs";
import {createTokenAuthenticator} from "../lib/renovision/identity.mjs";
import {authorizeAction} from "../lib/renovision/access-control.mjs";
import {verifyExportPackage} from "../lib/renovision/export-package.mjs";
const {publicKey, privateKey} = generateKeyPairSync("rsa", {modulusLength: 2048});
const jwks = {keys: [{...publicKey.export({format: "jwk"}), kid: "key-1", alg: "RS256", use: "sig"}]};
const ISSUER = "https://issuer.example.com", AUDIENCE = "renovision-api";
const nowSec = Math.floor(Date.now() / 1000);
const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString("base64url");
function sign(claims) {
 const input = b64({alg: "RS256", kid: "key-1", typ: "JWT"}) + "." + b64(claims);
 const signer = createSign("RSA-SHA256"); signer.update(input); signer.end();
 return input + "." + signer.sign(privateKey).toString("base64url");
}
const tokenFor = (extra = {}) => sign({sub: "operator-1", iss: ISSUER, aud: AUDIENCE, iat: nowSec - 30, exp: nowSec + 3600, jti: "jti-" + Math.random(), tenant_id: "tenant-a", roles: ["operator"], property_ids: ["property-1"], ...extra});
async function boot(t, dir) {
 const registry = new Map();
 const authenticator = createTokenAuthenticator({jwksUrl: "https://issuer.example.com/jwks", fetchImpl: async () => ({ok: true, json: async () => jwks}), audience: AUDIENCE, issuer: ISSUER, onActor: (a) => registry.set(a.id, a)});
 const authorize = async ({actorId, tenantId, propertyId, roomId}) => { const a = registry.get(actorId); return Boolean(a) && authorizeAction(a, {action: "project:read", tenantId, propertyId, roomId}).allowed; };
 const server = createRenovisionServer({
   authenticate: authenticator.authenticate,
   resolveApproval: createMemoryApprovalRegistry(),
   evidenceStorage: createDurableEvidenceStorage({rootDir: join(dir, "evidence"), authorize}),
   eventStore: createDurableSpatialEventStore({rootDir: join(dir, "events"), authorize: async (scope) => authorize({actorId: scope?.actor?.id, tenantId: scope?.tenantId, propertyId: scope?.propertyId, roomId: scope?.roomId})}),
   projectStore: createFileProjectStore({rootDir: join(dir, "projects")}),
   identityMode: "token"
 });
 await new Promise((r) => server.listen(0, "127.0.0.1", r));
 t.after(() => server.close());
 return {base: "http://127.0.0.1:" + server.address().port, authenticator};
}
const call = async (base, method, path, {token, body, headers = {}} = {}) => {
 const res = await fetch(base + path, {method, headers: {"content-type": "application/json", ...(token ? {authorization: "Bearer " + token} : {}), ...headers}, body: body ? JSON.stringify(body) : undefined});
 return {status: res.status, body: await res.json().catch(() => ({}))};
};
test("token-authenticated operator can create and read a project; spoofed headers change nothing", async (t) => {
 const dir = await mkdtemp(join(tmpdir(), "renovision-sec-"));
 t.after(() => rm(dir, {recursive: true, force: true}));
 const {base} = await boot(t, dir);
 const token = tokenFor();
 let r = await call(base, "POST", "/api/renovision/projects", {token, body: {projectId: "sec-1", propertyId: "property-1", roomId: "room-1"}, headers: {"x-tenant-id": "tenant-b", "x-actor-id": "attacker"}});
 assert.equal(r.status, 201);
 assert.equal(r.body.project.tenantId, "tenant-a");
 r = await call(base, "GET", "/api/renovision/projects/sec-1", {token, headers: {"x-tenant-id": "tenant-b"}});
 assert.equal(r.status, 200);
});
test("missing, expired and cross-tenant tokens are rejected", async (t) => {
 const dir = await mkdtemp(join(tmpdir(), "renovision-sec-"));
 t.after(() => rm(dir, {recursive: true, force: true}));
 const {base} = await boot(t, dir);
 await call(base, "POST", "/api/renovision/projects", {token: tokenFor(), body: {projectId: "sec-2", propertyId: "property-1", roomId: "room-1"}});
 assert.equal((await call(base, "GET", "/api/renovision/projects/sec-2", {})).status, 401);
 assert.equal((await call(base, "GET", "/api/renovision/projects/sec-2", {token: tokenFor({exp: nowSec - 60})})).status, 401);
 assert.equal((await call(base, "GET", "/api/renovision/projects/sec-2", {token: tokenFor({tenant_id: "tenant-b", sub: "intruder"})})).status, 404);
 assert.equal((await call(base, "GET", "/api/renovision/projects/sec-2", {token: tokenFor({property_ids: ["property-2"]})})).status, 403);
});
test("role boundaries: viewer cannot write, operator cannot register approvals, approver can", async (t) => {
 const dir = await mkdtemp(join(tmpdir(), "renovision-sec-"));
 t.after(() => rm(dir, {recursive: true, force: true}));
 const {base} = await boot(t, dir);
 const operator = tokenFor();
 const viewer = tokenFor({sub: "viewer-1", roles: ["viewer"]});
 const approver = tokenFor({sub: "approver-1", roles: ["approver"]});
 await call(base, "POST", "/api/renovision/projects", {token: operator, body: {projectId: "sec-3", propertyId: "property-1", roomId: "room-1"}});
 assert.equal((await call(base, "GET", "/api/renovision/projects/sec-3", {token: viewer})).status, 200);
 assert.equal((await call(base, "POST", "/api/renovision/projects/sec-3/capture-plan", {token: viewer, body: {deviceProfile: {platform: "web", cameraPermission: true, depthSupported: false, roomPlanSupported: false, manualMeasurementAvailable: true}}})).status, 403);
 const approval = {approvalRef: "ap-1", propertyId: "property-1", roomId: "room-1", featureId: "floor-main", scopeItemId: "s1", status: "approved", approvedBy: "founder", approvedAt: "2026-10-20T09:00:00Z", allowedActorIds: ["operator-1"]};
 assert.equal((await call(base, "POST", "/api/renovision/approvals", {token: operator, body: approval})).status, 403);
 assert.equal((await call(base, "POST", "/api/renovision/approvals", {token: approver, body: approval})).status, 201);
});
test("projects survive a full server restart and the session can resume", async (t) => {
 const dir = await mkdtemp(join(tmpdir(), "renovision-sec-"));
 t.after(() => rm(dir, {recursive: true, force: true}));
 const token = tokenFor();
 const first = await boot(t, dir);
 let r = await call(first.base, "POST", "/api/renovision/projects", {token, body: {projectId: "sec-4", propertyId: "property-1", roomId: "room-1"}});
 assert.equal(r.status, 201);
 r = await call(first.base, "POST", "/api/renovision/projects/sec-4/capture-plan", {token, body: {deviceProfile: {platform: "ios", cameraPermission: true, depthSupported: true, roomPlanSupported: true, manualMeasurementAvailable: true}}});
 assert.equal(r.status, 200);
 // Simulate restart: a brand-new server over the same durable directories.
 const second = await boot(t, dir);
 r = await call(second.base, "GET", "/api/renovision/projects/sec-4", {token});
 assert.equal(r.status, 200);
 assert.equal(r.body.project.stage, "capture_planned");
 assert.equal(r.body.project.capturePlan.mode, "roomplan_lidar");
 assert.ok(r.body.project.audit.length >= 1);
});
test("export returns a verifiable digest-bound package", async (t) => {
 const dir = await mkdtemp(join(tmpdir(), "renovision-sec-"));
 t.after(() => rm(dir, {recursive: true, force: true}));
 const {base} = await boot(t, dir);
 const token = tokenFor();
 await call(base, "POST", "/api/renovision/projects", {token, body: {projectId: "sec-5", propertyId: "property-1", roomId: "room-1"}});
 const r = await call(base, "GET", "/api/renovision/projects/sec-5/export", {token});
 assert.equal(r.status, 200);
 const check = verifyExportPackage(r.body.export);
 assert.equal(check.valid, true);
 assert.equal(r.body.export.certified, false);
 const viewer = tokenFor({sub: "viewer-1", roles: ["viewer"]});
 assert.equal((await call(base, "GET", "/api/renovision/projects/sec-5/export", {token: viewer})).status, 403);
});
test("revoked tokens stop working immediately", async (t) => {
 const dir = await mkdtemp(join(tmpdir(), "renovision-sec-"));
 t.after(() => rm(dir, {recursive: true, force: true}));
 const {base, authenticator} = await boot(t, dir);
 const token = tokenFor({jti: "revoke-me"});
 await call(base, "POST", "/api/renovision/projects", {token, body: {projectId: "sec-6", propertyId: "property-1", roomId: "room-1"}});
 assert.equal((await call(base, "GET", "/api/renovision/projects/sec-6", {token})).status, 200);
 authenticator.revokeToken("revoke-me");
 assert.equal((await call(base, "GET", "/api/renovision/projects/sec-6", {token})).status, 401);
});
