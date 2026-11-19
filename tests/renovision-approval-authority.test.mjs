import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {createHash} from "node:crypto";
import {spawn} from "node:child_process";
import {fileURLToPath} from "node:url";
import {resolve, dirname} from "node:path";
import {createRenovisionServer, createMemoryApprovalRegistry} from "../src/renovisionServer.mjs";
import {createGcsApprovalRegistry} from "../lib/renovision/gcs-approval-registry.mjs";
import {createGcsProjectStore} from "../lib/renovision/gcs-project-store.mjs";
import {createDurableEvidenceStorage} from "../lib/renovision/durable-evidence-storage.mjs";
import {createDurableSpatialEventStore} from "../lib/renovision/durable-spatial-event-store.mjs";
import {RENOVISION_APP_HTML} from "../src/renovisionUi.mjs";

/** One mock GCS bucket shared by two independent server instances, standing
 * in for two Cloud Run instances sharing the production bucket. */
function mockGcs() {
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
    if (u.pathname.endsWith("/o")) {
      const prefix = u.searchParams.get("prefix") ?? "";
      return {ok: true, status: 200, json: async () => ({items: [...objects.keys()].filter((n) => n.startsWith(prefix)).map((n) => ({name: n}))})};
    }
    const item = objects.get(name);
    if (!item) return {ok: false, status: 404};
    if (u.searchParams.get("alt") === "media") return {ok: true, status: 200, json: async () => item.record};
    return {ok: true, status: 200, json: async () => ({generation: String(item.generation)})};
  };
  return {objects, fetchImpl};
}
const ROLES = {"founder-1": ["approver"], "operator-1": ["operator"]};
async function bootPair(t) {
  const dir = await mkdtemp(join(tmpdir(), "renovision-authority-"));
  t.after(() => rm(dir, {recursive: true, force: true}));
  const {fetchImpl} = mockGcs();
  const getAccessToken = async () => "test";
  const authenticate = async (req) => {
    const id = req.headers["x-actor-id"], tenantId = req.headers["x-tenant-id"];
    if (!id || !tenantId || !ROLES[id]) return null;
    return {id, tenantId, authenticated: true, roles: ROLES[id], propertyIds: ["*"], roomIds: []};
  };
  const eventStore = createDurableSpatialEventStore({rootDir: join(dir, "events"), authorize: async () => true});
  const bases = [];
  for (let i = 0; i < 2; i++) {
    const server = createRenovisionServer({
      authenticate,
      resolveApproval: createGcsApprovalRegistry({bucket: "test-bucket", getAccessToken, fetchImpl}),
      evidenceStorage: createDurableEvidenceStorage({rootDir: join(dir, "evidence-" + i), authorize: async () => true}),
      eventStore,
      projectStore: createGcsProjectStore({bucket: "test-bucket", getAccessToken, fetchImpl})
    });
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    t.after(() => server.close());
    bases.push("http://127.0.0.1:" + server.address().port);
  }
  return bases;
}
const call = async (base, actorId, tenantId, method, path, body) => {
  const res = await fetch(base + path, {method, headers: {"x-actor-id": actorId, "x-tenant-id": tenantId, "content-type": "application/json"}, body: body ? JSON.stringify(body) : undefined});
  return {status: res.status, body: await res.json().catch(() => ({}))};
};

test("durable approval authority: register on one instance, propose on another, revoke stops further use", async (t) => {
  const [a, b] = await bootPair(t);
  const op = (base, method, path, body) => call(base, "operator-1", "tenant-a", method, path, body);
  const ap = (base, method, path, body) => call(base, "founder-1", "tenant-a", method, path, body);
  let r = await op(a, "POST", "/api/renovision/projects", {projectId: "reno-auth-1", propertyId: "property-1", roomId: "room-1"});
  assert.equal(r.status, 201);
  const bytes = new TextEncoder().encode("authority capture bytes");
  r = await op(a, "POST", "/api/renovision/projects/reno-auth-1/evidence", {contentBase64: Buffer.from(bytes).toString("base64"), mimeType: "image/png", captureId: "capture-1"});
  assert.equal(r.status, 201);
  const receipt = r.body.receipt;
  const manifest = {tenantId: "tenant-a", propertyId: "property-1", roomId: "room-1", captureId: "capture-1", operatorId: "operator-1", deviceModel: "laser-x", coordinateFrame: "local", capturedAt: "2026-10-26T10:00:00Z", platform: "web", calibrationStatus: "calibrated", coverageGaps: [], artifacts: [{id: receipt.storageRef, kind: "photo", digest: receipt.digest, byteLength: receipt.byteLength}]};
  r = await op(a, "POST", "/api/renovision/projects/reno-auth-1/captures", {manifest, qualityInput: {blurScore: 0.1, depthCoverageFraction: 0.5, deviceClass: "browser"}});
  assert.equal(r.status, 200);
  r = await op(a, "POST", "/api/renovision/projects/reno-auth-1/capture-review", {decision: "accept"});
  assert.equal(r.status, 200);
  const mk = (featureId, value) => ({propertyId: "property-1", roomId: "room-1", measurementId: "meas-" + featureId, featureId, captureId: "capture-1", deviceModel: "laser-x", platform: "web", timestamp: "2026-10-26T10:00:00Z", coordinateFrame: "local", evidenceRef: receipt.digest, semanticType: "wall", method: "manual_laser", value, unit: "m", uncertainty: 0.02, calibrationStatus: "calibrated", verificationStatus: "verified", verifiedBy: "verifier-1", verifiedAt: "2026-10-26T11:00:00Z", geometryState: "EXISTING", fieldMeasured: true});
  for (const [f, v] of [["width", 3.6], ["depth", 4.2], ["height", 2.7], ["door_width", 0.9], ["door_offset", 0.5], ["window_width", 1.2], ["window_offset", 1], ["obstruction_offset", 2]]) {
    r = await op(a, "POST", "/api/renovision/projects/reno-auth-1/measurements", {record: mk(f, v)});
    assert.equal(r.status, 201, f);
  }
  r = await op(a, "POST", "/api/renovision/projects/reno-auth-1/lock", {});
  assert.equal(r.status, 200);
  // Operators cannot create approval authority.
  r = await op(a, "POST", "/api/renovision/approvals", {approvalRef: "approval-1", propertyId: "property-1", roomId: "room-1", featureId: "floor-main", scopeItemId: "scope-floor-1", status: "approved", allowedActorIds: ["operator-1"]});
  assert.equal(r.status, 403);
  // Approver registers on instance A…
  r = await ap(a, "POST", "/api/renovision/approvals", {approvalRef: "approval-1", propertyId: "property-1", roomId: "room-1", featureId: "floor-main", scopeItemId: "scope-floor-1", status: "approved", allowedActorIds: ["operator-1"]});
  assert.equal(r.status, 201);
  assert.equal(r.body.approval.approvedBy, "founder-1");
  // …and the operator's proposal is authorized on instance B, which never
  // saw the registration request — the authority is the shared bucket.
  const change = {featureId: "floor-main", semanticType: "floor", scopeItemId: "scope-floor-1", approvalRef: "approval-1", eventId: "evt-1", reason: "approved flooring change", baseline: {featureId: "floor-main", semanticType: "floor", label: "Existing vinyl"}, proposed: {label: "White oak"}};
  r = await op(b, "POST", "/api/renovision/projects/reno-auth-1/proposals", {change});
  assert.equal(r.status, 201);
  // Operators cannot revoke either.
  r = await op(b, "POST", "/api/renovision/approvals/revoke", {approvalRef: "approval-1"});
  assert.equal(r.status, 403);
  // Approver revokes on instance B; a replayed proposal under the revoked
  // ref is then rejected on instance A.
  r = await ap(b, "POST", "/api/renovision/approvals/revoke", {approvalRef: "approval-1", reason: "scope withdrawn"});
  assert.equal(r.status, 200);
  assert.equal(r.body.approval.revoked, true);
  assert.equal(r.body.approval.status, "revoked");
  r = await op(a, "POST", "/api/renovision/projects/reno-auth-1/proposals", {change: {...change, eventId: "evt-2"}});
  assert.equal(r.status, 422);
  assert.equal(r.body.ok, false);
  // Revoking an unknown ref is a 404, and another tenant's approver cannot
  // see tenant-a's records at all.
  r = await ap(a, "POST", "/api/renovision/approvals/revoke", {approvalRef: "missing"});
  assert.equal(r.status, 404);
  r = await call(a, "founder-1", "tenant-b", "POST", "/api/renovision/approvals/revoke", {approvalRef: "approval-1"});
  assert.equal(r.status, 404);
  const health = await (await fetch(b + "/health")).json();
  assert.equal(health.approvalStorageClass, "durable-gcs");
});

test("auth-config exposes browser sign-in only when the deployment configured it", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "renovision-authcfg-"));
  t.after(() => rm(dir, {recursive: true, force: true}));
  const authenticate = async () => null;
  const evidenceStorage = createDurableEvidenceStorage({rootDir: join(dir, "evidence"), authorize: async () => true});
  const plain = createRenovisionServer({authenticate, resolveApproval: createMemoryApprovalRegistry(), evidenceStorage});
  await new Promise((r) => plain.listen(0, "127.0.0.1", r));
  t.after(() => plain.close());
  let cfg = await (await fetch("http://127.0.0.1:" + plain.address().port + "/auth-config")).json();
  assert.equal(cfg.signIn.configured, false);
  assert.equal(cfg.signIn.apiKey, null);
  const health = await (await fetch("http://127.0.0.1:" + plain.address().port + "/health")).json();
  assert.equal(health.approvalStorageClass, "in-memory");
  const configured = createRenovisionServer({authenticate, evidenceStorage, webAuthConfig: {apiKey: "public-web-key", projectId: "ocg-pipeline"}});
  await new Promise((r) => configured.listen(0, "127.0.0.1", r));
  t.after(() => configured.close());
  cfg = await (await fetch("http://127.0.0.1:" + configured.address().port + "/auth-config")).json();
  assert.equal(cfg.signIn.configured, true);
  assert.equal(cfg.signIn.apiKey, "public-web-key");
  assert.equal(cfg.signIn.projectId, "ocg-pipeline");
  assert.equal(cfg.signIn.provider, "google-identity-platform");
});

test("operator interface carries the Identity Platform sign-in flow, not just a token paste field", () => {
  assert.match(RENOVISION_APP_HTML, /id="btnSignIn"/);
  assert.match(RENOVISION_APP_HTML, /id="signInEmail"/);
  assert.match(RENOVISION_APP_HTML, /accounts:signInWithPassword/);
  assert.match(RENOVISION_APP_HTML, /securetoken\.googleapis\.com\/v1\/token/);
  assert.match(RENOVISION_APP_HTML, /\/auth-config/);
  assert.match(RENOVISION_APP_HTML, /sessionStorage/);
  assert.match(RENOVISION_APP_HTML, /id="btnRevokeApproval"/);
  assert.match(RENOVISION_APP_HTML, /createObjectURL/);
});

test("Cloud Run entry point wires the durable GCS approval authority and reports it on /health", async (t) => {
  const entry = resolve(dirname(fileURLToPath(import.meta.url)), "../src/renovisionMain.mjs");
  const {createServer: createPortProbe} = await import("node:net");
  const probe = createPortProbe();
  await new Promise(resolve => probe.listen(0, "127.0.0.1", resolve));
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  const child = spawn(process.execPath, [entry], {
    env: {...process.env, K_SERVICE: "renovision", PORT: String(port), RENOVISION_GCS_BUCKET: "test-bucket", RENOVISION_JWKS_URL: "https://example.test/jwks", RENOVISION_TOKEN_ISSUER: "https://securetoken.google.com/test-project", RENOVISION_TOKEN_AUDIENCE: "test-project", RENOVISION_WEB_API_KEY: "public-web-key", RENOVISION_DEMO_AUTH: "0"},
    stdio: ["ignore", "pipe", "pipe"]
  });
  t.after(() => child.kill("SIGKILL"));
  const base = "http://127.0.0.1:" + port;
  let health = null;
  for (let i = 0; i < 60 && !health; i++) {
    try { const res = await fetch(base + "/health"); if (res.ok) health = await res.json(); } catch { await new Promise((r) => setTimeout(r, 250)); }
  }
  assert.ok(health, "service did not become healthy");
  assert.equal(health.identityMode, "token");
  assert.equal(health.approvalStorageClass, "durable-gcs");
  assert.equal(health.projectStorageClass, "durable-gcs");
  const cfg = await (await fetch(base + "/auth-config")).json();
  assert.equal(cfg.signIn.configured, true);
  assert.equal(cfg.signIn.projectId, "test-project");
  child.kill("SIGKILL");
});
