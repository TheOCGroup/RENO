import test from "node:test";
import assert from "node:assert/strict";
import {webcrypto} from "node:crypto";
import {captureFrameEvidence,verifyEvidenceBytes} from "../lib/renovision/frame-evidence.mjs";
const bytes=new Uint8Array([137,80,78,71,13,10,26,10,1]);
const blob=new Blob([bytes],{type:"image/png"});
const canvas=()=>({width:0,height:0,getContext:()=>({drawImage:()=>{}}),toBlob:cb=>cb(blob)});
const args=()=>({video:{videoWidth:640,videoHeight:480},canvas:canvas(),cryptoApi:webcrypto,now:()=> "2026-10-22T00:00:00Z",captureId:"c1",propertyId:"p1",roomId:"r1"});
test("captures PNG bytes and emits SHA-256 provenance without persisting",async()=>{
 const r=await captureFrameEvidence(args());assert.equal(r.ok,true);assert.equal(r.verified,false);
 assert.equal(r.storageStatus,"not_persisted");assert.equal(r.artifact.width,640);
 assert.match(r.artifact.digest,/^sha256:[a-f0-9]{64}$/);
 assert.equal(await verifyEvidenceBytes(r.blob,r.artifact.digest,webcrypto),true);
});
test("tampered evidence fails digest verification",async()=>{
 const r=await captureFrameEvidence(args());
 assert.equal(await verifyEvidenceBytes(new Blob([new Uint8Array([1,2,3])]),r.artifact.digest,webcrypto),false);
});
test("missing video dimensions fail closed",async()=>{
 const r=await captureFrameEvidence({...args(),video:{videoWidth:0,videoHeight:480}});
 assert.equal(r.ok,false);
});
test("missing digest API fails closed",async()=>{
 const r=await captureFrameEvidence({...args(),cryptoApi:{}});
 assert.equal(r.ok,false);
});
test("encoding failure fails closed",async()=>{
 const r=await captureFrameEvidence({...args(),canvas:{...canvas(),toBlob:cb=>cb(null)}});
 assert.equal(r.ok,false);
});
test("missing capture identifiers fail closed",async()=>{
 const r=await captureFrameEvidence({...args(),propertyId:""});
 assert.equal(r.ok,false);
});

test("oversized frame dimensions are rejected before drawing",async()=>{
 let drawn=false;
 const a=args();a.video.videoWidth=8000;a.video.videoHeight=8000;
 a.canvas.getContext=()=>({drawImage:()=>{drawn=true;}});
 const r=await captureFrameEvidence(a);assert.equal(r.ok,false);assert.equal(drawn,false);
});
test("oversized encoded image is rejected before hashing",async()=>{
 const a=args();a.canvas.toBlob=cb=>cb({size:20_000_001,arrayBuffer:async()=>{throw Error("should not read");}});
 const r=await captureFrameEvidence(a);assert.equal(r.ok,false);
});
test("oversized stored image fails integrity verification",async()=>{
 const r=await verifyEvidenceBytes({size:20_000_001,arrayBuffer:async()=>{throw Error("should not read");}},"sha256:"+"a".repeat(64),webcrypto);
 assert.equal(r,false);
});
