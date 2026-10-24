import test from "node:test";
import assert from "node:assert/strict";
import {sanitizeCaptureMetadata} from "../lib/renovision/capture-privacy.mjs";
test("removes location, raw EXIF and tokens",()=>{
 const r=sanitizeCaptureMetadata({captureId:"c1",platform:"web",latitude:37,longitude:-97,rawExif:{GPSLatitude:37},accessToken:"private",address:"123 Test St"});
 assert.equal(r.valid,true);assert.deepEqual(r.metadata,{captureId:"c1",platform:"web"});assert.equal(r.removed.length,5);
});
test("unknown properties are not copied",()=>{
 const r=sanitizeCaptureMetadata({captureId:"c1",randomNested:{anything:true}});
 assert.deepEqual(r.metadata,{captureId:"c1"});
});
test("invalid metadata input fails closed",()=>assert.equal(sanitizeCaptureMetadata(null).valid,false));
test("allowed calibration metadata retained",()=>{
 const r=sanitizeCaptureMetadata({deviceModel:"device",calibrationStatus:"pending",coordinateFrame:"local"});
 assert.equal(r.metadata.calibrationStatus,"pending");
});
