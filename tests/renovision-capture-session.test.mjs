import test from "node:test";
import assert from "node:assert/strict";
import {webcrypto} from "node:crypto";
import {captureAndPersistFrame} from "../lib/renovision/capture-session.mjs";
import {createMemoryEvidenceStorage} from "../lib/renovision/memory-evidence-storage.mjs";
const base=()=>{
 let opened=0,stopped=0;
 const stream={getTracks:()=>[{stop:()=>stopped++}]};
 const mediaDevices={getUserMedia:async()=>{opened++;return stream;}};
 const video={videoWidth:320,videoHeight:240,srcObject:null,play:async()=>{}};
 const canvas={getContext:()=>({drawImage(){}}),toBlob:cb=>cb(new Blob(["image-bytes"],{type:"image/png"}))};
 const storage=createMemoryEvidenceStorage({authorize:async ({actorId})=>actorId==="owner"});
 return {args:{mediaDevices,consent:true,video,canvas,cryptoApi:webcrypto,storage,actorId:"owner",propertyId:"p",roomId:"r",captureId:"c"},stats:()=>({opened,stopped,attached:video.srcObject})};
};
test("consented capture persists verified bytes and stops camera",async()=>{
 const b=base();const r=await captureAndPersistFrame(b.args);
 assert.equal(r.ok,true);assert.equal(r.fieldVerified,false);assert.match(r.digest,/^sha256:/);
 assert.deepEqual(b.stats(),{opened:1,stopped:1,attached:null});
});
test("without consent camera is never opened",async()=>{
 const b=base();const r=await captureAndPersistFrame({...b.args,consent:false});
 assert.equal(r.ok,false);assert.equal(r.stage,"consent");assert.equal(b.stats().opened,0);
});
test("missing video input blocks camera opening",async()=>{
 const b=base();const r=await captureAndPersistFrame({...b.args,video:null});
 assert.equal(r.stage,"input");assert.equal(b.stats().opened,0);
});
test("frame not ready stops camera",async()=>{
 const b=base();b.args.video.videoWidth=0;const r=await captureAndPersistFrame(b.args);
 assert.equal(r.stage,"frame");assert.equal(b.stats().stopped,1);
});
test("storage refusal stops camera",async()=>{
 const b=base();const r=await captureAndPersistFrame({...b.args,actorId:"intruder"});
 assert.equal(r.stage,"storage");assert.equal(b.stats().stopped,1);
});
test("play failure stops camera",async()=>{
 const b=base();b.args.video.play=async()=>{throw Error("blocked")};
 const r=await captureAndPersistFrame(b.args);assert.equal(r.ok,false);assert.equal(b.stats().stopped,1);
});

test("invalid capture identifiers never request camera access",async()=>{
 const b=base();const r=await captureAndPersistFrame({...b.args,roomId:"../other"});
 assert.equal(r.stage,"input");assert.equal(b.stats().opened,0);
});
test("missing storage never requests camera access",async()=>{
 const b=base();const r=await captureAndPersistFrame({...b.args,storage:null});
 assert.equal(r.stage,"input");assert.equal(b.stats().opened,0);
});
test("invalid retention never requests camera access",async()=>{
 const b=base();const r=await captureAndPersistFrame({...b.args,retentionDays:366});
 assert.equal(r.stage,"input");assert.equal(b.stats().opened,0);
});
