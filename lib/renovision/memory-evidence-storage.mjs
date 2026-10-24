/** Deterministic tenant-scoped, in-memory adapter for tests only. Never use for production evidence. */
export function createMemoryEvidenceStorage({authorize,clock=()=>Date.now()}={}) {
 if (typeof authorize!=="function") throw new TypeError("authorization callback required");
 const records=new Map();
 let next=0;
 return {
   async put({blob,artifact,actorId,retentionDays}) {
     if (!await authorize({action:"write",actorId,propertyId:artifact?.propertyId,roomId:artifact?.roomId})) throw Error("access denied");
     if (!blob || typeof blob.arrayBuffer!=="function" || !Number.isInteger(retentionDays) || retentionDays<1 || retentionDays>365) throw Error("invalid evidence");
     const storageRef="mem-evidence-"+(++next);
     const bytes=new Uint8Array(await blob.arrayBuffer());
     records.set(storageRef,{bytes,mimeType:blob.type,propertyId:artifact.propertyId,roomId:artifact.roomId,expiresAt:clock()+retentionDays*86400000});
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
