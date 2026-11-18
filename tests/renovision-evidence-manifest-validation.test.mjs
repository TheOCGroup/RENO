import test from "node:test";
import assert from "node:assert/strict";
import {validateEvidenceManifest} from "../lib/renovision/evidence-manifest-validation.mjs";
const artifact={id:"a1",kind:"photo",digest:"sha256:"+"a".repeat(64),byteLength:100};
const manifest={tenantId:"t",propertyId:"p",roomId:"r",captureId:"c",operatorId:"o",deviceModel:"test",coordinateFrame:"local",capturedAt:"2026-10-24T00:00:00Z",platform:"web",calibrationStatus:"pending",coverageGaps:[],artifacts:[artifact]};
test("accepts structurally complete unverified manifest",()=>{const r=validateEvidenceManifest(manifest);assert.equal(r.valid,true);assert.equal(r.fieldVerified,false);});
test("rejects duplicate artifact IDs",()=>assert.equal(validateEvidenceManifest({...manifest,artifacts:[artifact,artifact]}).valid,false));
test("rejects invalid artifact digest",()=>assert.equal(validateEvidenceManifest({...manifest,artifacts:[{...artifact,digest:"not-a-hash"}]}).valid,false));
test("rejects missing tenant",()=>assert.equal(validateEvidenceManifest({...manifest,tenantId:""}).valid,false));
test("rejects invalid capture timestamp",()=>assert.equal(validateEvidenceManifest({...manifest,capturedAt:"yesterday"}).valid,false));
test("rejects unrecognized calibration state",()=>assert.equal(validateEvidenceManifest({...manifest,calibrationStatus:"certified"}).valid,false));
test("rejects zero byte evidence",()=>assert.equal(validateEvidenceManifest({...manifest,artifacts:[{...artifact,byteLength:0}]}).valid,false));

test("rejects excessive artifact count",()=>{
 const artifacts=Array.from({length:33},(_,i)=>({...artifact,id:"a"+i}));
 assert.equal(validateEvidenceManifest({...manifest,artifacts}).valid,false);
});
test("rejects per-artifact size over capture limit",()=>assert.equal(validateEvidenceManifest({...manifest,artifacts:[{...artifact,byteLength:20_000_001}]}).valid,false));
test("rejects aggregate byte budget over limit",()=>{
 const artifacts=Array.from({length:6},(_,i)=>({...artifact,id:"a"+i,byteLength:20_000_000}));
 assert.equal(validateEvidenceManifest({...manifest,artifacts}).valid,false);
});

test("rejects nontext coverage gaps",()=>assert.equal(validateEvidenceManifest({...manifest,coverageGaps:[{location:"corner"}]}).valid,false));
test("rejects excessive coverage gaps",()=>assert.equal(validateEvidenceManifest({...manifest,coverageGaps:Array(129).fill("corner")}).valid,false));
test("rejects overlong artifact identifier",()=>assert.equal(validateEvidenceManifest({...manifest,artifacts:[{...artifact,id:"x".repeat(129)}]}).valid,false));

test("rejects path traversal in room identifier",()=>assert.equal(validateEvidenceManifest({...manifest,roomId:"../other"}).valid,false));
test("rejects path separators in artifact reference",()=>assert.equal(validateEvidenceManifest({...manifest,artifacts:[{...artifact,id:"private/file"}]}).valid,false));
test("rejects oversized property identifier",()=>assert.equal(validateEvidenceManifest({...manifest,propertyId:"p".repeat(129)}).valid,false));
