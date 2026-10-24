/** Ephemeral in-memory adapter for tests only. Authorization is delegated to the supplied callback. Never use in production. */
import {MAX_EVIDENCE_BYTES} from "./frame-evidence.mjs";
export function createMemoryEvidenceStorage({authorize,clock=()=>Date.now()}={}) {
 if (typeof authorize!=="function") throw new TypeError("authorization callback required");
 const records=new Map();
 let next=0;
 return {
   async put({blob,artifact,actorId,retentionDays}) {
     if (!await authorize({action:"write",actorId,propertyId:artifact?.propertyId,roomId:artifact?.roomId})) throw Error("access denied");
     if (!blob || typeof blob.arrayBuffer!=="function" || !Number.isSafeInteger(blob.size) || blob.size<=0 || blob.size>MAX_EVIDENCE_BYTES || !Number.isInteger(retentionDays) || retentionDays<1 || retentionDays>365) throw Error("invalid evidence");
     const storageRef="mem-evidence-"+(next+1);
     const bytes=new Uint8Array(await blob.arrayBuffer());
     if(bytes.byteLength!==blob.size || bytes.byteLength>MAX_EVIDENCE_BYTES) throw Error("evidence size mismatch");
     if(!artifact||typeof artifact.propertyId!=="string"||!artifact.propertyId.trim()||typeof artifact.roomId!=="string"||!artifact.roomId.trim()) throw Error("evidence scope required");
     const expiresAt=clock()+retentionDays*86400000;
     if(!Number.isFinite(expiresAt)) throw Error("invalid retention clock");
     records.set(storageRef,{bytes,mimeType:blob.type,propertyId:artifact.propertyId,roomId:artifact.roomId,expiresAt});
     next++;
     return {accepted:true,storageRef};
   },
   async get({storageRef,actorId}) {
     const record=records.get(storageRef);
     if (!record) throw Error("not found");
     if (clock()>=record.expiresAt) {records.delete(storageRef);throw Error("expired");}
     if (!await authorize({action:"read",actorId,propertyId:record.propertyId,roomId:record.roomId})) throw Error("access denied");
     return new Blob([record.bytes],{type:record.mimeType});
   },
   async purgeExpired() {
     let removed=0;for(const [key,record] of records) if(clock()>=record.expiresAt){records.delete(key);removed++;}
     return removed;
   },
   get storageClass(){return "ephemeral-test-only";}
 };
}
