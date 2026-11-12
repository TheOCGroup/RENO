import test from "node:test";
import assert from "node:assert/strict";
import {webcrypto} from "node:crypto";
import {captureFrameEvidence} from "../lib/renovision/frame-evidence.mjs";
import {persistFrameEvidence,readFrameEvidence} from "../lib/renovision/evidence-repository.mjs";
const blob=new Blob([new Uint8Array([137,80,78,71,13,10,26,10,1])],{type:"image/png"});
const capture=()=>captureFrameEvidence({video:{videoWidth:16,videoHeight:16},canvas:{getContext:()=>({drawImage(){}}),toBlob:cb=>cb(blob)},cryptoApi:webcrypto,captureId:"c1",propertyId:"p1",roomId:"r1"});
test("storage adapter receives digest-verified bytes and retention",async()=>{
 const c=await capture();let stored;
 const storage={put:async input=>{stored=input;return {accepted:true,storageRef:"private-object-1"};}};
 const r=await persistFrameEvidence(c,{storage,cryptoApi:webcrypto,actorId:"operator",retentionDays:30});
 assert.equal(r.stored,true);assert.equal(r.verified,false);assert.equal(stored.retentionDays,30);
});
test("tampered bytes are not persisted",async()=>{
 const c=await capture();c.blob=new Blob([new Uint8Array([0])]);let called=false;
 const r=await persistFrameEvidence(c,{storage:{put:async()=>{called=true;}},cryptoApi:webcrypto,actorId:"operator"});
 assert.equal(r.stored,false);assert.equal(called,false);
});
test("missing actor and invalid retention fail closed",async()=>{
 const c=await capture();const storage={put:async()=>({accepted:true,storageRef:"x"})};
 assert.equal((await persistFrameEvidence(c,{storage,cryptoApi:webcrypto,actorId:""})).stored,false);
 assert.equal((await persistFrameEvidence(c,{storage,cryptoApi:webcrypto,actorId:"a",retentionDays:1000})).stored,false);
});
test("storage acknowledgement required",async()=>{
 const c=await capture();const r=await persistFrameEvidence(c,{storage:{put:async()=>({accepted:false})},cryptoApi:webcrypto,actorId:"operator"});
 assert.equal(r.stored,false);
});
test("read verifies stored evidence bytes",async()=>{
 const c=await capture();const r=await readFrameEvidence({storage:{get:async()=>blob},storageRef:"private-object-1",expectedDigest:c.artifact.digest,cryptoApi:webcrypto,actorId:"operator"});
 assert.equal(r.ok,true);assert.equal(r.verified,false);
});
test("read rejects tampered stored evidence",async()=>{
 const c=await capture();const r=await readFrameEvidence({storage:{get:async()=>new Blob(["tampered"])},storageRef:"private-object-1",expectedDigest:c.artifact.digest,cryptoApi:webcrypto,actorId:"operator"});
 assert.equal(r.ok,false);
});

test("declared frame length mismatch rejects before storage",async()=>{
 const c=await capture();c.artifact.byteLength+=1;let called=false;
 const r=await persistFrameEvidence(c,{storage:{put:async()=>{called=true;}},cryptoApi:webcrypto,actorId:"operator"});
 assert.equal(r.stored,false);assert.equal(called,false);
});
test("oversized frame rejected before hashing or storage",async()=>{
 const c=await capture();c.blob={size:20_000_001,arrayBuffer:async()=>{throw Error("should not read")}};c.artifact.byteLength=20_000_001;
 const r=await persistFrameEvidence(c,{storage:{put:async()=>{throw Error("should not write")}},cryptoApi:webcrypto,actorId:"operator"});
 assert.equal(r.stored,false);
});
test("hash provider failure returns controlled rejection",async()=>{
 const c=await capture();
 const r=await persistFrameEvidence(c,{storage:{put:async()=>{throw Error("should not write")}},cryptoApi:{subtle:{digest:async()=>{throw Error("offline")}}},actorId:"operator"});
 assert.equal(r.stored,false);
});
test("oversized read blob rejected before hashing",async()=>{
 const c=await capture();
 const r=await readFrameEvidence({storage:{get:async()=>({size:20_000_001,arrayBuffer:async()=>{throw Error("should not read")}})},storageRef:"private-object-1",expectedDigest:c.artifact.digest,cryptoApi:webcrypto,actorId:"operator"});
 assert.equal(r.ok,false);
});
