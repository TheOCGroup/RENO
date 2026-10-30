/** Storage-independent evidence repository. Callers provide authenticated storage adapter. */
import {verifyEvidenceBytes,MAX_EVIDENCE_BYTES} from "./frame-evidence.mjs";
const digestOk = d => typeof d==="string" && /^sha256:[a-fA-F0-9]{64}$/.test(d);
const idOk = s => typeof s==="string" && s.trim().length>0 && !/[\\/]/.test(s);
export async function persistFrameEvidence(capture, {storage,cryptoApi,actorId,retentionDays=30}={}) {
 const errors=[];
 if (capture?.ok!==true || !capture?.blob || !capture?.artifact) errors.push("successful capture required");
 if (!idOk(actorId)) errors.push("authenticated actor identifier required");
 if (!Number.isInteger(retentionDays) || retentionDays<1 || retentionDays>365) errors.push("retentionDays out of bounds");
 if (typeof storage?.put!=="function") errors.push("storage adapter required");
 const a=capture?.artifact;
 for (const key of ["propertyId","roomId","captureId"]) if (!idOk(a?.[key])) errors.push(key+" invalid");
 if (!digestOk(a?.digest)) errors.push("digest invalid");
 if (!Number.isSafeInteger(capture?.blob?.size)||capture.blob.size>MAX_EVIDENCE_BYTES||capture.blob.size!==a?.byteLength) errors.push("evidence size mismatch or exceeds limit");
 if (errors.length) return {stored:false,errors};
 let matches=false;
 try {matches=await verifyEvidenceBytes(capture.blob,a.digest,cryptoApi);} catch {matches=false;}
 if (!matches) return {stored:false,errors:["evidence digest mismatch"]};
 try {
   const receipt=await storage.put({blob:capture.blob,artifact:{...a,digest:a.digest.toLowerCase()},actorId,retentionDays});
   if (!receipt || receipt.accepted!==true || !idOk(receipt.storageRef)) return {stored:false,errors:["storage did not acknowledge durable write"]};
   return {stored:true,storageRef:receipt.storageRef,digest:a.digest.toLowerCase(),retentionDays,verified:false,errors:[]};
 } catch {return {stored:false,errors:["storage write failed"]};}
}
export async function readFrameEvidence({storage,storageRef,expectedDigest,cryptoApi,actorId}={}) {
 if (!idOk(actorId) || !idOk(storageRef) || !digestOk(expectedDigest) || typeof storage?.get!=="function") return {ok:false,errors:["read authorization or reference invalid"]};
 try {
   const blob=await storage.get({storageRef,actorId});
   if (!Number.isSafeInteger(blob?.size)||blob.size>MAX_EVIDENCE_BYTES||!await verifyEvidenceBytes(blob,expectedDigest,cryptoApi)) return {ok:false,errors:["stored evidence missing or integrity mismatch"]};
   return {ok:true,blob,verified:false,errors:[]};
 } catch {return {ok:false,errors:["evidence read failed"]};}
}
