import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp, rm, writeFile, readFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {createHash, webcrypto} from "node:crypto";
import {createDurableEvidenceStorage} from "../lib/renovision/durable-evidence-storage.mjs";
import {createGcsEvidenceStorage} from "../lib/renovision/gcs-evidence-storage.mjs";
import {persistFrameEvidence} from "../lib/renovision/evidence-repository.mjs";
import {createBackup, verifyBackup, restoreBackup} from "../lib/renovision/backup.mjs";
const directory = async (t, label) => { const dir = await mkdtemp(join(tmpdir(), label)); t.after(() => rm(dir, {recursive: true, force: true})); return dir; };
const captureFor = (bytes, digest) => ({ok: true, blob: new Blob([bytes], {type: "image/png"}), artifact: {kind: "photo", digest, byteLength: bytes.length, propertyId: "property-1", roomId: "room-1", captureId: "capture-1", tenantId: "tenant-a"}});
test("concurrent evidence puts are all durable with distinct refs and intact bytes", async (t) => {
 const dir = await directory(t, "renovision-conc-");
 const storage = createDurableEvidenceStorage({rootDir: dir, authorize: async () => true});
 const jobs = [];
 for (let i = 0; i < 12; i++) {
   const bytes = new TextEncoder().encode("frame-" + i);
   const digest = "sha256:" + createHash("sha256").update(bytes).digest("hex");
   jobs.push(persistFrameEvidence(captureFor(bytes, digest), {storage, cryptoApi: webcrypto, actorId: "operator-1", retentionDays: 30}));
 }
 const receipts = await Promise.all(jobs);
 assert.ok(receipts.every((r) => r.stored));
 assert.equal(new Set(receipts.map((r) => r.storageRef)).size, 12);
 for (const receipt of receipts) {
   const got = await storage.get({storageRef: receipt.storageRef, actorId: "operator-1"});
   assert.equal(got.sha256, receipt.sha256);
 }
});
test("duplicate evidence submissions are stored as separate objects with equal digests", async (t) => {
 const dir = await directory(t, "renovision-dup-");
 const storage = createDurableEvidenceStorage({rootDir: dir, authorize: async () => true});
 const bytes = new TextEncoder().encode("same-frame");
 const digest = "sha256:" + createHash("sha256").update(bytes).digest("hex");
 const a = await persistFrameEvidence(captureFor(bytes, digest), {storage, cryptoApi: webcrypto, actorId: "operator-1", retentionDays: 30});
 const b = await persistFrameEvidence(captureFor(bytes, digest), {storage, cryptoApi: webcrypto, actorId: "operator-1", retentionDays: 30});
 assert.notEqual(a.storageRef, b.storageRef);
 assert.equal(a.sha256, b.sha256);
});
test("filesystem purge removes expired evidence and keeps live evidence", async (t) => {
 const dir = await directory(t, "renovision-purge-");
 let tick = Date.now();
 const storage = createDurableEvidenceStorage({rootDir: dir, authorize: async () => true, clock: () => tick});
 const blob = new Blob([new Uint8Array([1, 2, 3])], {type: "image/png"});
 const old = await storage.put({blob, artifact: {propertyId: "property-1", roomId: "room-1"}, actorId: "operator-1", retentionDays: 1});
 tick += 48 * 60 * 60 * 1000;
 const fresh = await storage.put({blob, artifact: {propertyId: "property-1", roomId: "room-1"}, actorId: "operator-1", retentionDays: 30});
 assert.equal(await storage.purgeExpired(), 1);
 await assert.rejects(() => storage.get({storageRef: old.storageRef, actorId: "operator-1"}), /not found/);
 assert.ok(await storage.get({storageRef: fresh.storageRef, actorId: "operator-1"}));
});
test("GCS purge deletes only expired objects", async () => {
 const calls = [];
 const storage = createGcsEvidenceStorage({bucket: "bkt", getAccessToken: async () => "tok", authorize: async () => true, clock: () => 2_000_000_000_000, fetchImpl: async (url, init) => {
   calls.push({url, method: init.method});
   if (init.method === "GET") return {ok: true, json: async () => ({items: [{name: "reno/evidence/old.bin", metadata: {expiresAt: "1000"}}, {name: "reno/evidence/new.bin", metadata: {expiresAt: "9000000000000"}}]})};
   return {ok: true, json: async () => ({})};
 }});
 assert.equal(await storage.purgeExpired(), 1);
 const deletes = calls.filter((c) => c.method === "DELETE");
 assert.equal(deletes.length, 1);
 assert.ok(deletes[0].url.includes("old.bin"));
});
test("backup verifies round-trip and restoration refuses tampered or non-empty targets", async (t) => {
 const dir = await directory(t, "renovision-backup-");
 const dataDir = join(dir, "data"), backupDir = join(dir, "backup"), restoreDir = join(dir, "restore");
 const storage = createDurableEvidenceStorage({rootDir: join(dataDir, "evidence"), authorize: async () => true});
 const blob = new Blob([new Uint8Array([9, 9, 9])], {type: "image/png"});
 const receipt = await storage.put({blob, artifact: {propertyId: "property-1", roomId: "room-1"}, actorId: "operator-1", retentionDays: 30});
 const created = await createBackup({sourceDir: dataDir, destDir: backupDir});
 assert.ok(created.fileCount >= 2);
 assert.equal((await verifyBackup({backupDir})).valid, true);
 const restored = await restoreBackup({backupDir, destDir: restoreDir});
 assert.equal(restored.restored, true);
 const restoredStorage = createDurableEvidenceStorage({rootDir: join(restoreDir, "evidence"), authorize: async () => true});
 assert.ok(await restoredStorage.get({storageRef: receipt.storageRef, actorId: "operator-1"}));
 await assert.rejects(() => restoreBackup({backupDir, destDir: restoreDir}), /not empty/);
 const names = JSON.parse(await readFile(join(backupDir, "backup-manifest.json"), "utf8"));
 const victim = join(backupDir, names.files[0].path);
 await writeFile(victim, "tampered");
 assert.equal((await verifyBackup({backupDir})).valid, false);
});
