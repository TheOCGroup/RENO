import test from "node:test";
import assert from "node:assert/strict";
import {webcrypto} from "node:crypto";
import {captureFrameEvidence} from "../lib/renovision/frame-evidence.mjs";
import {persistFrameEvidence} from "../lib/renovision/evidence-repository.mjs";
import {createMemoryEvidenceStorage} from "../lib/renovision/memory-evidence-storage.mjs";
import {createPersistedCaptureManifest} from "../lib/renovision/persisted-capture-manifest.mjs";
import {verifyManifestArtifacts} from "../lib/renovision/manifest-integrity.mjs";
async function fixture(){
 const blob=new Blob(["frame"],{type:"image/png"});
 const capture=await captureFrameEvidence({video:{videoWidth:20,videoHeight:20},canvas:{getContext:()=>({drawImage(){}}),toBlob:cb=>cb(blob)},cryptoApi:webcrypto,captureId:"c",propertyId:"p",roomId:"r",now:()=>"2026-10-24T00:00:00Z"});
 const storage=createMemoryEvidenceStorage({authorize:async({actorId,propertyId,roomId})=>actorId==="owner"&&propertyId==="p"&&roomId==="r"});
 const receipt=await persistFrameEvidence(capture,{storage,cryptoApi:webcrypto,actorId:"owner"});
 return {capture,receipt,storage};
}
test("frame capture through persistence, manifest and authenticated verification",async()=>{
 const f=await fixture();
 const m=createPersistedCaptureManifest({...f,tenantId:"tenant",operatorId:"owner",deviceModel:"browser-test"});
 assert.equal(m.ok,true);
 const verified=await verifyManifestArtifacts({manifest:m.manifest,actor:{id:"owner",authenticated:true,tenantId:"tenant"},cryptoApi:webcrypto,loadArtifact:async({artifactId,actor,roomId,propertyId})=>{
  assert.equal(roomId,"r");assert.equal(propertyId,"p");
  return f.storage.get({storageRef:artifactId,actorId:actor.id});
 }});
 assert.equal(verified.verified,true);assert.equal(verified.fieldVerified,false);
});
test("unpersisted frame cannot become manifest",async()=>{
 const f=await fixture();
 assert.equal(createPersistedCaptureManifest({...f,receipt:{...f.receipt,stored:false},tenantId:"tenant",operatorId:"owner",deviceModel:"browser-test"}).ok,false);
});
test("digest mismatch between frame and receipt is rejected",async()=>{
 const f=await fixture();
 assert.equal(createPersistedCaptureManifest({...f,receipt:{...f.receipt,digest:"sha256:"+"0".repeat(64)},tenantId:"tenant",operatorId:"owner",deviceModel:"browser-test"}).ok,false);
});
test("missing tenant cannot create validated manifest",async()=>{
 const f=await fixture();
 assert.equal(createPersistedCaptureManifest({...f,operatorId:"owner",deviceModel:"browser-test"}).ok,false);
});

test("captured artifact byte count must match captured blob",async()=>{
 const f=await fixture();
 const capture={...f.capture,artifact:{...f.capture.artifact,byteLength:f.capture.artifact.byteLength+1}};
 assert.equal(createPersistedCaptureManifest({...f,capture,tenantId:"tenant",operatorId:"owner",deviceModel:"browser-test"}).ok,false);
});
test("oversized storage reference cannot become manifest identifier",async()=>{
 const f=await fixture();
 const receipt={...f.receipt,storageRef:"x".repeat(129)};
 assert.equal(createPersistedCaptureManifest({...f,receipt,tenantId:"tenant",operatorId:"owner",deviceModel:"browser-test"}).ok,false);
});
