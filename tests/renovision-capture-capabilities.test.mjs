import test from "node:test";
import assert from "node:assert/strict";
import {planRoomCapture,validateCaptureManifest} from "../lib/renovision/capture-capabilities.mjs";
const profile={platform:"ios",cameraPermission:true,depthSupported:true,roomPlanSupported:true,manualMeasurementAvailable:true};
test("supported iOS device selects RoomPlan, not verified status",()=>{
 const r=planRoomCapture(profile);assert.equal(r.mode,"roomplan_lidar");assert.equal(r.measurementStatus,"estimated");assert.equal(r.requiresFieldVerification,true);
});
test("Android depth path uses ARCore",()=>{
 assert.equal(planRoomCapture({...profile,platform:"android",roomPlanSupported:false}).mode,"arcore_depth");
});
test("no depth uses explicitly estimated photo fallback",()=>{
 assert.equal(planRoomCapture({...profile,depthSupported:false,roomPlanSupported:false}).mode,"photo_assisted_estimate");
});
test("denied camera can use manual entry",()=>{
 assert.equal(planRoomCapture({...profile,cameraPermission:false}).mode,"manual_verified_entry");
});
test("no permission and no manual path fails closed",()=>{
 assert.equal(planRoomCapture({...profile,cameraPermission:false,manualMeasurementAvailable:false}).ready,false);
});
test("missing capability flags fail closed",()=>{
 assert.equal(planRoomCapture({platform:"ios",cameraPermission:true}).ready,false);
});
const manifest={propertyId:"p",roomId:"r",captureId:"c",deviceModel:"phone",platform:"ios",capturedAt:"2026-10-22T00:00:00Z",operatorId:"operator",coordinateFrame:"room",artifacts:[{kind:"photo",digest:"sha256:"+"a".repeat(64)}],coverageGaps:[],calibrationStatus:"uncalibrated"};
test("complete capture manifest is accepted without implying verification",()=>{
 assert.deepEqual(validateCaptureManifest(manifest),{valid:true,errors:[]});
});
test("missing artifacts or coverage gaps fail",()=>{
 assert.equal(validateCaptureManifest({...manifest,artifacts:[]}).valid,false);
 assert.equal(validateCaptureManifest({...manifest,coverageGaps:undefined}).valid,false);
});
test("non-digest capture artifacts fail",()=>{
 assert.equal(validateCaptureManifest({...manifest,artifacts:[{kind:"photo",digest:"photo.jpg"}]}).valid,false);
});
