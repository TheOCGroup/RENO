import test from "node:test";
import assert from "node:assert/strict";
import {webcrypto,createHash} from "node:crypto";
import {createMemoryEvidenceStorage} from "../lib/renovision/memory-evidence-storage.mjs";
import {verifyManifestArtifacts} from "../lib/renovision/manifest-integrity.mjs";
const bytes=new TextEncoder().encode("private room capture fixture");
const blob=new Blob([bytes],{type:"image/png"});
const digest="sha256:"+createHash("sha256").update(bytes).digest("hex");
const actor={id:"operator",authenticated:true,tenantId:"tenant-a"};
const base={tenantId:"tenant-a",propertyId:"property-1",roomId:"room-1",captureId:"capture-1",operatorId:"operator",deviceModel:"test-device",coordinateFrame:"local",capturedAt:"2026-10-24T00:00:00Z",platform:"web",calibrationStatus:"pending",coverageGaps:[]};
async function fixture(){
 const storage=createMemoryEvidenceStorage({authorize:async({actorId,propertyId,roomId})=>actorId==="operator"&&propertyId==="property-1"&&roomId==="room-1"});
 const receipt=await storage.put({blob,artifact:{propertyId:"property-1",roomId:"room-1"},actorId:"operator",retentionDays:1});
 const manifest={...base,artifacts:[{id:receipt.storageRef,kind:"photo",digest,byteLength:blob.size}]};
 const loadArtifact=async({tenantId,propertyId,roomId,artifactId,actor})=>{
  if(tenantId!=="tenant-a"||propertyId!=="property-1"||roomId!=="room-1"||actor?.tenantId!==tenantId) throw Error("scope denied");
  return storage.get({storageRef:artifactId,actorId:actor.id});
 };
 return {storage,manifest,loadArtifact};
}
test("stored private evidence verifies through scoped manifest loader",async()=>{
 const f=await fixture();
 const r=await verifyManifestArtifacts({manifest:f.manifest,loadArtifact:f.loadArtifact,actor,cryptoApi:webcrypto});
 assert.equal(r.verified,true);assert.equal(r.checked,1);assert.equal(r.fieldVerified,false);
});
test("cross-tenant actor cannot reach private storage",async()=>{
 const f=await fixture();let called=false;
 const r=await verifyManifestArtifacts({manifest:f.manifest,actor:{...actor,tenantId:"tenant-b"},cryptoApi:webcrypto,loadArtifact:async x=>{called=true;return f.loadArtifact(x);}});
 assert.equal(r.verified,false);assert.equal(called,false);
});
test("cross-room manifest cannot retrieve original evidence",async()=>{
 const f=await fixture();
 const r=await verifyManifestArtifacts({manifest:{...f.manifest,roomId:"room-2"},actor,cryptoApi:webcrypto,loadArtifact:f.loadArtifact});
 assert.equal(r.verified,false);
});
test("modified digest cannot validate stored evidence",async()=>{
 const f=await fixture();const manifest={...f.manifest,artifacts:[{...f.manifest.artifacts[0],digest:"sha256:"+"0".repeat(64)}]};
 const r=await verifyManifestArtifacts({manifest,loadArtifact:f.loadArtifact,actor,cryptoApi:webcrypto});
 assert.equal(r.verified,false);
});
