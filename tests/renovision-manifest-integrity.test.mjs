import test from "node:test";
import assert from "node:assert/strict";
import {webcrypto} from "node:crypto";
import {createHash} from "node:crypto";
import {verifyManifestArtifacts} from "../lib/renovision/manifest-integrity.mjs";
const blob=new Blob(["evidence"],{type:"image/png"});
const digest="sha256:"+createHash("sha256").update("evidence").digest("hex");
const artifact={id:"a1",kind:"photo",digest,byteLength:blob.size};
const manifest={tenantId:"tenant",propertyId:"p",roomId:"r",captureId:"c",operatorId:"o",deviceModel:"device",coordinateFrame:"local",capturedAt:"2026-10-24T00:00:00Z",platform:"web",calibrationStatus:"pending",coverageGaps:[],artifacts:[artifact]};
const req=(overrides={})=>({manifest,loadArtifact:async()=>blob,cryptoApi:webcrypto,actor:{authenticated:true,id:"o",tenantId:"tenant"},...overrides});
test("all supplied evidence bytes verify against manifest",async()=>{
 const r=await verifyManifestArtifacts(req());assert.equal(r.verified,true);assert.equal(r.checked,1);assert.equal(r.fieldVerified,false);
});
test("tampered artifact rejects manifest",async()=>{
 const r=await verifyManifestArtifacts(req({loadArtifact:async()=>new Blob(["altered!"])}));
 assert.equal(r.verified,false);
});
test("missing private artifact rejects manifest",async()=>{
 const r=await verifyManifestArtifacts(req({loadArtifact:async()=>{throw Error("missing")}}));
 assert.equal(r.verified,false);
});
test("incorrect declared byte count rejects manifest",async()=>{
 const r=await verifyManifestArtifacts(req({manifest:{...manifest,artifacts:[{...artifact,byteLength:100}]}}));
 assert.equal(r.verified,false);
});
test("missing loader rejects manifest",async()=>assert.equal((await verifyManifestArtifacts(req({loadArtifact:null}))).verified,false));
test("invalid structural manifest rejected before loading",async()=>{
 let calls=0;const r=await verifyManifestArtifacts(req({manifest:{...manifest,tenantId:""},loadArtifact:async()=>{calls++;return blob;}}));
 assert.equal(r.verified,false);assert.equal(calls,0);
});

test("missing authenticated actor blocks artifact loading",async()=>{
 let calls=0;const r=await verifyManifestArtifacts(req({actor:null,loadArtifact:async()=>{calls++;return blob;}}));
 assert.equal(r.verified,false);assert.equal(calls,0);
});
test("cross-tenant actor cannot load private artifact",async()=>{
 let calls=0;const r=await verifyManifestArtifacts(req({actor:{authenticated:true,id:"o",tenantId:"other"},loadArtifact:async()=>{calls++;return blob;}}));
 assert.equal(r.verified,false);assert.equal(calls,0);
});
test("artifact loader receives tenant property room and actor scope",async()=>{
 let seen;const r=await verifyManifestArtifacts(req({loadArtifact:async scope=>{seen=scope;return blob;}}));
 assert.equal(r.verified,true);assert.equal(seen.roomId,"r");assert.equal(seen.actor.tenantId,"tenant");assert.equal(seen.artifactId,"a1");
});

test("hash provider exception fails closed instead of throwing",async()=>{
 const r=await verifyManifestArtifacts(req({cryptoApi:{subtle:{digest:async()=>{throw Error("hash unavailable");}}}}));
 assert.equal(r.verified,false);assert.equal(r.checked,0);
});
test("missing hash provider fails closed",async()=>{
 const r=await verifyManifestArtifacts(req({cryptoApi:{}}));
 assert.equal(r.verified,false);
});
