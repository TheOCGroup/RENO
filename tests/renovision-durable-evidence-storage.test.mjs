import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {createDurableEvidenceStorage} from "../lib/renovision/durable-evidence-storage.mjs";
import {persistFrameEvidence, readFrameEvidence} from "../lib/renovision/evidence-repository.mjs";
import {webcrypto, createHash} from "node:crypto";
const bytes = new TextEncoder().encode("durable room capture fixture");
const digest = "sha256:" + createHash("sha256").update(bytes).digest("hex");
const allow = async ({actorId, propertyId, roomId}) => actorId === "operator" && propertyId === "property-1" && roomId === "room-1";
async function fixture(t) {
 const dir = await mkdtemp(join(tmpdir(), "renovision-evidence-"));
 t.after(() => rm(dir, {recursive: true, force: true}));
 return {dir, storage: createDurableEvidenceStorage({rootDir: dir, authorize: allow})};
}
const artifact = {propertyId: "property-1", roomId: "room-1", captureId: "capture-1", digest};
test("durable storage round-trips evidence through the repository contract", async (t) => {
 const {storage} = await fixture(t);
 assert.equal(storage.storageClass, "durable-filesystem");
 const capture = {ok: true, blob: new Blob([bytes], {type: "image/png"}), artifact: {...artifact, kind: "photo", byteLength: bytes.length}};
 const receipt = await persistFrameEvidence(capture, {storage, cryptoApi: webcrypto, actorId: "operator", retentionDays: 7});
 assert.equal(receipt.stored, true);
 const back = await readFrameEvidence({storage, storageRef: receipt.storageRef, expectedDigest: digest, cryptoApi: webcrypto, actorId: "operator"});
 assert.equal(back.ok, true);
 assert.deepEqual(new Uint8Array(await back.blob.arrayBuffer()), bytes);
});
test("durable evidence survives a new adapter instance on the same directory", async (t) => {
 const {dir, storage} = await fixture(t);
 const receipt = await storage.put({blob: new Blob([bytes]), artifact, actorId: "operator", retentionDays: 7});
 const reopened = createDurableEvidenceStorage({rootDir: dir, authorize: allow});
 const blob = await reopened.get({storageRef: receipt.storageRef, actorId: "operator"});
 assert.deepEqual(new Uint8Array(await blob.arrayBuffer()), bytes);
});
test("unauthorized actor cannot read durable evidence", async (t) => {
 const {storage} = await fixture(t);
 const receipt = await storage.put({blob: new Blob([bytes]), artifact, actorId: "operator", retentionDays: 7});
 await assert.rejects(() => storage.get({storageRef: receipt.storageRef, actorId: "intruder"}), /access denied/);
});
test("path-like storage references are rejected", async (t) => {
 const {storage} = await fixture(t);
 await assert.rejects(() => storage.get({storageRef: "../secret", actorId: "operator"}), /not found/);
 await assert.rejects(() => storage.get({storageRef: "durable-evidence-zzzz", actorId: "operator"}), /not found/);
});
test("expired evidence is deleted and unreadable", async (t) => {
 const dir = await mkdtemp(join(tmpdir(), "renovision-evidence-"));
 t.after(() => rm(dir, {recursive: true, force: true}));
 let now = 1_000_000;
 const storage = createDurableEvidenceStorage({rootDir: dir, authorize: allow, clock: () => now});
 const receipt = await storage.put({blob: new Blob([bytes]), artifact, actorId: "operator", retentionDays: 1});
 now += 2 * 86400000;
 await assert.rejects(() => storage.get({storageRef: receipt.storageRef, actorId: "operator"}), /expired/);
});
test("write requires authorization before any bytes are stored", async (t) => {
 const {storage} = await fixture(t);
 await assert.rejects(() => storage.put({blob: new Blob([bytes]), artifact, actorId: "intruder", retentionDays: 7}), /access denied/);
});
