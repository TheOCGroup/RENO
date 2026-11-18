import test from "node:test";
import assert from "node:assert/strict";
import {probeBrowserCapture,requestCameraStream,stopCameraStream} from "../lib/renovision/browser-camera.mjs";
test("probe does not open camera or claim native depth",async()=>{
 let calls=0;const mediaDevices={getUserMedia:async()=>{calls++;}};
 const r=await probeBrowserCapture({mediaDevices,permissions:{query:async()=>({state:"prompt"})}});
 assert.equal(calls,0);assert.equal(r.cameraPermission,"prompt");assert.equal(r.depthSupported,false);assert.equal(r.sensorAccuracyVerified,false);
});
test("unsupported permission query stays unknown",async()=>{
 const r=await probeBrowserCapture({permissions:{query:async()=>{throw Error("unsupported");}}});
 assert.equal(r.cameraPermission,"unknown");
});
test("no explicit consent refuses camera",async()=>{
 let calls=0;const r=await requestCameraStream({getUserMedia:async()=>{calls++;}},false);
 assert.equal(r.ok,false);assert.equal(calls,0);
});
test("camera request uses environment preference and no audio",async()=>{
 let options;const stream={getTracks:()=>[]};
 const r=await requestCameraStream({getUserMedia:async o=>{options=o;return stream;}},true);
 assert.equal(r.ok,true);assert.equal(r.stream,stream);assert.equal(options.audio,false);assert.equal(options.video.facingMode.ideal,"environment");
});
test("camera permission denial fails without raw exception leak",async()=>{
 const r=await requestCameraStream({getUserMedia:async()=>{const e=Error("private");e.name="NotAllowedError";throw e;}},true);
 assert.deepEqual(r,{ok:false,reason:"NotAllowedError"});
});
test("camera tracks are stopped",()=>{
 let stopped=0;assert.equal(stopCameraStream({getTracks:()=>[{stop:()=>stopped++},{stop:()=>stopped++}]}),true);
 assert.equal(stopped,2);assert.equal(stopCameraStream(null),false);
});
