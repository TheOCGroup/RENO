import test from "node:test";
import assert from "node:assert/strict";
import {createGcsEvidenceStorage, buildGcsEvidenceObjectName} from "../lib/renovision/gcs-evidence-storage.mjs";
const bytes = new TextEncoder().encode("gcs room capture fixture");
const scope = {tenantId: "tenant-a", propertyId: "property-1", roomId: "room-1"};
const authorize = async ({actorId, tenantId}) => actorId === "operator" && tenantId === "tenant-a";
function fakeFetch(captured) {
 return async (url, init = {}) => {
   captured.push({url, init});
   if (url.includes("/upload/")) return {ok: true, json: async () => ({})};
   if (url.includes("alt=media")) return {ok: true, blob: async () => new Blob([bytes], {type: "image/png"})};
   return {ok: true, json: async () => ({metadata: {...scope, expiresAt: String(Date.now() + 86400000)}})};
 };
}
const make = (captured, overrides = {}) => createGcsEvidenceStorage({bucket: "renovision-private-evidence", getAccessToken: async () => "token-for-test", fetchImpl: fakeFetch(captured), authorize, ...overrides});
test("gcs adapter uploads with tenant scope metadata and reads back after scope check", async () => {
 const captured = [];
 const storage = make(captured);
 assert.equal(storage.storageClass, "durable-gcs");
 assert.equal(storage.configured, true);
 const receipt = await storage.put({blob: new Blob([bytes], {type: "image/png"}), artifact: {...scope, digest: "sha256:" + "a".repeat(64)}, actorId: "operator", retentionDays: 30});
 assert.equal(receipt.accepted, true);
 assert.match(receipt.storageRef, /^gcs-evidence-[a-f0-9]{24}$/);
 const upload = captured.find((c) => c.url.includes("/upload/"));
 assert.ok(upload.url.includes("renovision-private-evidence"));
 assert.equal(upload.init.headers.authorization, "Bearer token-for-test");
 const blob = await storage.get({storageRef: receipt.storageRef, actorId: "operator"});
 assert.deepEqual(new Uint8Array(await blob.arrayBuffer()), bytes);
});
test("gcs adapter fails closed when bucket or token provider is missing", async () => {
 const storage = createGcsEvidenceStorage({authorize});
 assert.equal(storage.configured, false);
 await assert.rejects(() => storage.put({blob: new Blob([bytes]), artifact: scope, actorId: "operator", retentionDays: 1}), /not configured/);
 await assert.rejects(() => storage.get({storageRef: "gcs-evidence-" + "a".repeat(24), actorId: "operator"}), /not configured/);
});
test("gcs write without tenant scope is rejected before upload", async () => {
 const captured = [];
 const storage = make(captured);
 await assert.rejects(() => storage.put({blob: new Blob([bytes]), artifact: {propertyId: "property-1", roomId: "room-1"}, actorId: "operator", retentionDays: 1}), /tenant-scoped/);
 assert.equal(captured.length, 0);
});
test("gcs read denied when the actor is not authorized for the stored tenant scope", async () => {
 const captured = [];
 const storage = make(captured);
 await assert.rejects(() => storage.get({storageRef: "gcs-evidence-" + "b".repeat(24), actorId: "intruder"}), /access denied/);
});
test("gcs object names are traversal-safe and ref-bound", () => {
 assert.equal(buildGcsEvidenceObjectName({storageRef: "../escape"}), null);
 assert.equal(buildGcsEvidenceObjectName({storageRef: "gcs-evidence-" + "c".repeat(24)}), "renovision-evidence/evidence/gcs-evidence-" + "c".repeat(24));
});
