/** Durable filesystem evidence adapter with the same contract as the in-memory test adapter.
 * Tenant/property/room isolation is enforced through the supplied authorize callback plus
 * stored scope metadata that is re-checked on every read. Suitable for local and
 * single-host durable deployments; production cloud deployments use the GCS adapter. */
import {mkdir, readFile, rename, unlink, writeFile} from "node:fs/promises";
import {join} from "node:path";
import {randomBytes} from "node:crypto";
import {MAX_EVIDENCE_BYTES} from "./frame-evidence.mjs";
const REF_PATTERN = /^durable-evidence-[a-f0-9]{24}$/;
export function createDurableEvidenceStorage({rootDir, authorize, clock = () => Date.now()} = {}) {
 if (typeof rootDir !== "string" || !rootDir.trim()) throw new TypeError("durable storage root directory required");
 if (typeof authorize !== "function") throw new TypeError("authorization callback required");
 let ready = null;
 const ensureDir = () => (ready ??= mkdir(rootDir, {recursive: true}));
 const paths = (storageRef) => ({data: join(rootDir, storageRef + ".bin"), meta: join(rootDir, storageRef + ".json")});
 const readMeta = async (storageRef) => {
   try { return JSON.parse(await readFile(paths(storageRef).meta, "utf8")); } catch { return null; }
 };
 return {
   async put({blob, artifact, actorId, retentionDays}) {
     if (!await authorize({action: "write", actorId, propertyId: artifact?.propertyId, roomId: artifact?.roomId, tenantId: artifact?.tenantId})) throw Error("access denied");
     if (!blob || typeof blob.arrayBuffer !== "function" || !Number.isSafeInteger(blob.size) || blob.size <= 0 || blob.size > MAX_EVIDENCE_BYTES || !Number.isInteger(retentionDays) || retentionDays < 1 || retentionDays > 365) throw Error("invalid evidence");
     if (!artifact || typeof artifact.propertyId !== "string" || !artifact.propertyId.trim() || typeof artifact.roomId !== "string" || !artifact.roomId.trim()) throw Error("evidence scope required");
     const bytes = new Uint8Array(await blob.arrayBuffer());
     if (bytes.byteLength !== blob.size) throw Error("evidence size mismatch");
     const expiresAt = clock() + retentionDays * 86400000;
     if (!Number.isFinite(expiresAt)) throw Error("invalid retention clock");
     await ensureDir();
     const storageRef = "durable-evidence-" + randomBytes(12).toString("hex");
     const meta = {storageRef, propertyId: artifact.propertyId, roomId: artifact.roomId, tenantId: typeof artifact.tenantId === "string" ? artifact.tenantId : null, digest: typeof artifact.digest === "string" ? artifact.digest.toLowerCase() : null, mimeType: blob.type || "application/octet-stream", byteLength: blob.size, expiresAt};
     const p = paths(storageRef);
     await writeFile(p.data + ".tmp", bytes);
     await rename(p.data + ".tmp", p.data);
     await writeFile(p.meta + ".tmp", JSON.stringify(meta));
     await rename(p.meta + ".tmp", p.meta);
     return {accepted: true, storageRef};
   },
   async get({storageRef, actorId}) {
     if (!REF_PATTERN.test(storageRef ?? "")) throw Error("not found");
     const meta = await readMeta(storageRef);
     if (!meta) throw Error("not found");
     if (clock() >= meta.expiresAt) {
       const p = paths(storageRef);
       await unlink(p.data).catch(() => {});
       await unlink(p.meta).catch(() => {});
       throw Error("expired");
     }
     if (!await authorize({action: "read", actorId, propertyId: meta.propertyId, roomId: meta.roomId, tenantId: meta.tenantId})) throw Error("access denied");
     const bytes = await readFile(paths(storageRef).data);
     if (bytes.byteLength !== meta.byteLength) throw Error("evidence size mismatch");
     return new Blob([bytes], {type: meta.mimeType});
   },
   async purgeExpired() {
     // Expiry is enforced lazily on read; this adapter exposes the same surface as the memory adapter.
     return 0;
   },
   get storageClass() { return "durable-filesystem"; }
 };
}
