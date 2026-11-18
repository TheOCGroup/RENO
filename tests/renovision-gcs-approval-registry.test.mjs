import test from "node:test";
import assert from "node:assert/strict";
import {createGcsApprovalRegistry} from "../lib/renovision/gcs-approval-registry.mjs";
import {authorizeSpatialChange} from "../lib/renovision/approval-gate.mjs";

/** Mock GCS with real generation-precondition semantics, shared by every
 * registry instance in a test so cross-instance behavior is exercised
 * against one bucket, exactly as Cloud Run instances share one bucket. */
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
    const item = objects.get(name);
    if (!item) return {ok: false, status: 404};
    if (u.searchParams.get("alt") === "media") return {ok: true, status: 200, json: async () => item.record};
    return {ok: true, status: 200, json: async () => ({generation: String(item.generation)})};
  };
  return {objects, fetchImpl};
}
const registryFor = (fetchImpl) => createGcsApprovalRegistry({bucket: "test-bucket", getAccessToken: async () => "test", fetchImpl});
const past = (ms) => new Date(Date.now() - ms).toISOString();
const future = (ms) => new Date(Date.now() + ms).toISOString();
const record = (over = {}) => ({
  approvalRef: "approval-1", tenantId: "tenant-a", propertyId: "property-1", roomId: "room-1",
  featureId: "floor-main", scopeItemId: "scope-floor-1", status: "approved",
  approvedBy: "founder-1", approvedAt: past(60_000), allowedActorIds: ["operator-1"], ...over
});
const actor = {id: "operator-1", tenantId: "tenant-a", authenticated: true};
const change = {propertyId: "property-1", roomId: "room-1", featureId: "floor-main", approvedScopeItemId: "scope-floor-1", approvalRef: "approval-1"};

test("registration resolves across registry instances sharing one bucket", async () => {
  const {fetchImpl} = mockGcs();
  const a = registryFor(fetchImpl), b = registryFor(fetchImpl);
  await a.register(record());
  const resolved = await b.resolveApproval({approvalRef: "approval-1", tenantId: "tenant-a", propertyId: "property-1"});
  assert.equal(resolved.approvedBy, "founder-1");
  assert.equal(resolved.featureId, "floor-main");
  assert.equal(b.storageClass, "durable-gcs");
});

test("duplicate registration is a conflict — same instance, second instance, and simultaneous writers", async () => {
  const {fetchImpl} = mockGcs();
  const a = registryFor(fetchImpl), b = registryFor(fetchImpl);
  await a.register(record());
  await assert.rejects(() => a.register(record()), (e) => e.code === "APPROVAL_REF_CONFLICT");
  await assert.rejects(() => b.register(record({approvedBy: "founder-2"})), (e) => e.code === "APPROVAL_REF_CONFLICT");
  // The original record is untouched by the failed overwrites.
  const resolved = await b.resolveApproval({approvalRef: "approval-1", tenantId: "tenant-a", propertyId: "property-1"});
  assert.equal(resolved.approvedBy, "founder-1");
});

test("simultaneous registrations from two instances produce exactly one winner", async () => {
  const objects = new Map();
  let uploads = 0, release;
  const bothReady = new Promise((resolve) => { release = resolve; });
  const fetchImpl = async (url, options = {}) => {
    const u = new URL(url);
    const name = u.searchParams.get("name") ?? decodeURIComponent(u.pathname.split("/o/")[1] ?? "");
    if (u.pathname.includes("/upload/")) {
      uploads++;
      if (uploads === 2) release();
      await bothReady;
      const existing = objects.get(name);
      if (u.searchParams.get("ifGenerationMatch") !== String(existing?.generation ?? 0)) return {ok: false, status: 412};
      objects.set(name, {generation: (existing?.generation ?? 0) + 1, record: JSON.parse(options.body)});
      return {ok: true, status: 200};
    }
    const item = objects.get(name);
    if (!item) return {ok: false, status: 404};
    if (u.searchParams.get("alt") === "media") return {ok: true, status: 200, json: async () => item.record};
    return {ok: true, status: 200, json: async () => ({generation: String(item.generation)})};
  };
  const a = registryFor(fetchImpl), b = registryFor(fetchImpl);
  const results = await Promise.allSettled([a.register(record()), b.register(record())]);
  assert.equal(results.filter((x) => x.status === "fulfilled").length, 1);
  const rejected = results.filter((x) => x.status === "rejected");
  assert.equal(rejected.length, 1);
  assert.equal(rejected[0].reason.code, "APPROVAL_REF_CONFLICT");
});

test("approval references are namespaced per tenant: no cross-tenant read, squat, or revoke", async () => {
  const {fetchImpl} = mockGcs();
  const a = registryFor(fetchImpl);
  await a.register(record());
  // Same ref under another tenant is an independent record, not a conflict
  // and not a window into tenant-a's approval.
  await a.register(record({tenantId: "tenant-b", approvedBy: "founder-9"}));
  const forB = await a.resolveApproval({approvalRef: "approval-1", tenantId: "tenant-b", propertyId: "property-1"});
  assert.equal(forB.approvedBy, "founder-9");
  const forA = await a.resolveApproval({approvalRef: "approval-1", tenantId: "tenant-a", propertyId: "property-1"});
  assert.equal(forA.approvedBy, "founder-1");
  // Revoking tenant-b's record leaves tenant-a's approval fully active.
  await a.revoke({approvalRef: "approval-1", tenantId: "tenant-b", revokedBy: "founder-9"});
  const stillActive = await a.resolveApproval({approvalRef: "approval-1", tenantId: "tenant-a", propertyId: "property-1"});
  assert.equal(stillActive.status, "approved");
  assert.equal(stillActive.revoked, undefined);
  // Property scope is enforced at resolution.
  assert.equal(await a.resolveApproval({approvalRef: "approval-1", tenantId: "tenant-a", propertyId: "property-2"}), null);
});

test("tampered stored envelopes resolve to null instead of trusting storage", async () => {
  const {objects, fetchImpl} = mockGcs();
  const a = registryFor(fetchImpl);
  await a.register(record());
  const [name, item] = [...objects.entries()][0];
  objects.set(name, {...item, record: {...item.record, record: {...item.record.record, tenantId: "tenant-evil"}}});
  assert.equal(await a.resolveApproval({approvalRef: "approval-1", tenantId: "tenant-a", propertyId: "property-1"}), null);
});

test("revocation is durable, audited, idempotent, and blocks the approval gate", async () => {
  const {fetchImpl} = mockGcs();
  const a = registryFor(fetchImpl), b = registryFor(fetchImpl);
  await a.register(record());
  const before = await authorizeSpatialChange({change, actor, resolveApproval: b.resolveApproval});
  assert.equal(before.authorized, true);
  const revoked = await b.revoke({approvalRef: "approval-1", tenantId: "tenant-a", revokedBy: "founder-1", reason: "scope withdrawn"});
  assert.equal(revoked.status, "revoked");
  assert.equal(revoked.revoked, true);
  assert.equal(revoked.revokedBy, "founder-1");
  const after = await authorizeSpatialChange({change, actor, resolveApproval: a.resolveApproval});
  assert.equal(after.authorized, false);
  assert.ok(after.errors.includes("active approval required"));
  const again = await a.revoke({approvalRef: "approval-1", tenantId: "tenant-a", revokedBy: "founder-1"});
  assert.equal(again.revoked, true);
  assert.equal(await a.revoke({approvalRef: "missing", tenantId: "tenant-a", revokedBy: "founder-1"}), null);
  const trail = await a.auditTrail({approvalRef: "approval-1", tenantId: "tenant-a"});
  assert.deepEqual(trail.map((e) => e.action), ["registered", "revoked"]);
  assert.equal(trail[1].by, "founder-1");
  assert.equal(trail[1].reason, "scope withdrawn");
});

test("a racing revocation loses with a typed conflict and changes nothing", async () => {
  const {fetchImpl} = mockGcs();
  const a = registryFor(fetchImpl);
  await a.register(record());
  const competingFetch = async (url, options = {}) => {
    const u = new URL(url);
    if (u.pathname.includes("/upload/")) return {ok: false, status: 412};
    return fetchImpl(url, options);
  };
  const racing = registryFor(competingFetch);
  await assert.rejects(() => racing.revoke({approvalRef: "approval-1", tenantId: "tenant-a", revokedBy: "founder-1"}), (e) => e.code === "APPROVAL_WRITE_CONFLICT");
  const resolved = await a.resolveApproval({approvalRef: "approval-1", tenantId: "tenant-a", propertyId: "property-1"});
  assert.equal(resolved.status, "approved");
});

test("the gate rejects forged, expired, and actor-undelegated approvals resolved from the durable registry", async () => {
  const {fetchImpl} = mockGcs();
  const a = registryFor(fetchImpl);
  const forged = await authorizeSpatialChange({change, actor, resolveApproval: a.resolveApproval});
  assert.equal(forged.authorized, false);
  assert.ok(forged.errors.includes("active approval required"));
  await a.register(record({approvalRef: "expired-1", expiresAt: past(1_000)}));
  const expired = await authorizeSpatialChange({change: {...change, approvalRef: "expired-1"}, actor, resolveApproval: a.resolveApproval});
  assert.equal(expired.authorized, false);
  assert.ok(expired.errors.some((e) => e.includes("expired")));
  await a.register(record({approvalRef: "delegated-1", allowedActorIds: ["someone-else"]}));
  const undelegated = await authorizeSpatialChange({change: {...change, approvalRef: "delegated-1"}, actor, resolveApproval: a.resolveApproval});
  assert.equal(undelegated.authorized, false);
  assert.ok(undelegated.errors.includes("actor not approved for change"));
  await a.register(record({approvalRef: "valid-1", expiresAt: future(3_600_000)}));
  const valid = await authorizeSpatialChange({change: {...change, approvalRef: "valid-1"}, actor, resolveApproval: a.resolveApproval});
  assert.equal(valid.authorized, true);
});

test("malformed approval records are rejected at registration", async () => {
  const {fetchImpl} = mockGcs();
  const a = registryFor(fetchImpl);
  const bad = [
    record({featureId: ""}), record({scopeItemId: undefined}), record({status: "pending"}),
    record({approvedAt: "not-a-date"}), record({expiresAt: "tomorrow"}),
    record({approvalRef: "../escape"}), record({allowedActorIds: "operator-1"}), record({tenantId: " "})
  ];
  for (const candidate of bad) {
    await assert.rejects(() => a.register(candidate), (e) => e.code === "APPROVAL_RECORD_INVALID");
  }
  assert.equal(await a.resolveApproval({approvalRef: "approval-1", tenantId: "tenant-a", propertyId: "property-1"}), null);
});
