import test from "node:test";
import assert from "node:assert/strict";
import {assessCaptureQuality} from "../lib/renovision/capture-quality.mjs";
const base={calibrationStatus:"calibrated",coverageGaps:[],blurScore:0.1,depthCoverageFraction:0.9,deviceClass:"ios-lidar"};
test("good quality is only candidate acceptable, not verified",()=>{const r=assessCaptureQuality(base);assert.equal(r.quality,"candidate_acceptable");assert.equal(r.verified,false);});
test("pending calibration requires review",()=>assert.equal(assessCaptureQuality({...base,calibrationStatus:"pending"}).quality,"review_required"));
test("coverage gaps require review",()=>assert.equal(assessCaptureQuality({...base,coverageGaps:["corner"]}).quality,"review_required"));
test("high blur requires review",()=>assert.equal(assessCaptureQuality({...base,blurScore:0.5}).quality,"review_required"));
test("low depth coverage requires review",()=>assert.equal(assessCaptureQuality({...base,depthCoverageFraction:0.3}).quality,"review_required"));
test("missing depth metric is invalid",()=>assert.equal(assessCaptureQuality({...base,depthCoverageFraction:undefined}).valid,false));

test("malformed coverage gap is invalid rather than silently accepted",()=>assert.equal(assessCaptureQuality({...base,coverageGaps:[{location:"corner"}]}).valid,false));
test("excessive coverage gaps are rejected",()=>assert.equal(assessCaptureQuality({...base,coverageGaps:Array(129).fill("corner")}).valid,false));
test("oversized device identifier is rejected",()=>assert.equal(assessCaptureQuality({...base,deviceClass:"x".repeat(129)}).valid,false));
