/** Tamper-evident audit chain for project records. Each entry commits to the
 * previous entry's hash, so silent edits, deletions or reordering of the audit
 * trail are detectable on export and on restore. This evidences tampering; it
 * does not by itself prove an entry's contents are true. */
import {createHash} from "node:crypto";
const GENESIS = "GENESIS";
const digestOf = (core) => createHash("sha256").update(JSON.stringify(core)).digest("hex");
export function appendAuditEntry(chain, {action, actorId, at, detail = {}} = {}) {
 const entries = Array.isArray(chain) ? chain : [];
 const seq = entries.length + 1;
 const prevHash = entries.length ? entries[entries.length - 1].hash : GENESIS;
 const core = {seq, prevHash, action, actorId: actorId ?? null, at, detail};
 return [...entries, {...core, hash: digestOf(core)}];
}
export function verifyAuditChain(chain) {
 if (!Array.isArray(chain)) return {valid: false, errors: ["audit chain must be an array"]};
 const errors = [];
 let prevHash = GENESIS;
 for (let i = 0; i < chain.length; i++) {
   const entry = chain[i];
   const core = {seq: entry?.seq, prevHash: entry?.prevHash, action: entry?.action, actorId: entry?.actorId ?? null, at: entry?.at, detail: entry?.detail ?? {}};
   if (entry?.seq !== i + 1) errors.push("audit sequence broken at index " + i);
   if (entry?.prevHash !== prevHash) errors.push("audit linkage broken at index " + i);
   if (entry?.hash !== digestOf(core)) errors.push("audit entry hash mismatch at index " + i);
   prevHash = entry?.hash;
 }
 return {valid: errors.length === 0, errors, entries: chain.length};
}
