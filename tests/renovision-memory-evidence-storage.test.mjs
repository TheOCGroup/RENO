import test from "node:test";
import assert from "node:assert/strict";
import {webcrypto} from "node:crypto";
import {createMemoryEvidenceStorage} from "../lib/renovision/memory-evidence-storage.mjs";
import {captureFrameEvidence} from "../lib/renovision/frame-evidence.mjs";
import {persistFrameEvidence,readFrameEvidence} from "../lib/renovision/evidence-repository.mjs";
const makeCapture=()=>captureFrameEvidence({video:{videoWidth:10,videoHeight:10},canvas:{getContext:()=>({drawImage(){}}),toBlob:cb=>cb(new Blob(["fixture"],{type:"image/png"}))},cryptoApi:webcrypto,captureId:"c1",propertyId:"p1",roomId:"r1"});
test("authorized test storage supports end-to-end integrity roundtrip",async()=>{
 const storage=createMemoryEvidenceStorage({authorize:async ({actorId})=>actorId==="owner"});
 const c=await makeCapture();
 const receipt=await persistFrameEvidence(c,{storage,cryptoApi:webcrypto,actorId:"owner"});
 assert.equal(receipt.stored,true);
 const read=await readFrameEvidence({storage,storageRef:receipt.storageRef,expectedDigest:c.artifact.digest,cryptoApi:webcrypto,actorId:"owner"});
 assert.equal(read.ok,true);assert.equal(await read.blob.text(),"fixture");
});
test("other actor cannot read private evidence",async()=>{
 const storage=createMemoryEvidenceStorage({authorize:async ({actorId})=>actorId==="owner"});
 const c=await makeCapture();const receipt=await persistFrameEvidence(c,{storage,cryptoApi:webcrypto,actorId:"owner"});
 const read=await readFrameEvidence({storage,storageRef:receipt.storageRef,expectedDigest:c.artifact.digest,cryptoApi:webcrypto,actorId:"intruder"});
 assert.equal(read.ok,false);
});
test("unauthorized actor cannot write",async()=>{
 const storage=createMemoryEvidenceStorage({authorize:async ({actorId})=>actorId==="owner"});
 const c=await makeCapture();
 assert.equal((await persistFrameEvidence(c,{storage,cryptoApi:webcrypto,actorId:"intruder"})).stored,false);
});
test("expired evidence is inaccessible and purged",async()=>{
 let t=100;const storage=createMemoryEvidenceStorage({authorize:async()=>true,clock:()=>t});
 const c=await makeCapture();const receipt=await persistFrameEvidence(c,{storage,cryptoApi:webcrypto,actorId:"owner",retentionDays:1});
 t+=86400000;
 assert.equal((await readFrameEvidence({storage,storageRef:receipt.storageRef,expectedDigest:c.artifact.digest,cryptoApi:webcrypto,actorId:"owner"})).ok,false);
 assert.equal(await storage.purgeExpired(),0);
});
test("explicit purge removes expired evidence",async()=>{
 let t=0;const storage=createMemoryEvidenceStorage({authorize:async()=>true,clock:()=>t});
 const c=await makeCapture();await persistFrameEvidence(c,{storage,cryptoApi:webcrypto,actorId:"owner",retentionDays:1});
 t=86400001;assert.equal(await storage.purgeExpired(),1);
});

test("oversized blob is rejected before byte allocation",async()=>{
 const storage=createMemoryEvidenceStorage({authorize:async()=>true});
 let read=false;const blob={size:20_000_001,arrayBuffer:async()=>{read=true;return new ArrayBuffer(0);}};
 await assert.rejects(storage.put({blob,artifact:{propertyId:"p1",roomId:"r1"},actorId:"owner",retentionDays:30}));
 assert.equal(read,false);
});
test("declared and actual blob size mismatch is rejected",async()=>{
 const storage=createMemoryEvidenceStorage({authorize:async()=>true});
 const blob={size:100,arrayBuffer:async()=>new Uint8Array([1,2]).buffer};
 await assert.rejects(storage.put({blob,artifact:{propertyId:"p1",roomId:"r1"},actorId:"owner",retentionDays:30}));
});
