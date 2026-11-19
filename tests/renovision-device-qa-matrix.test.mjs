import test from "node:test";
import assert from "node:assert/strict";
import {buildCaptureQaMatrix} from "../lib/renovision/device-qa-matrix.mjs";
test("generates 30 real-device QA cases without marking executed",()=>{
 const r=buildCaptureQaMatrix();assert.equal(r.valid,true);assert.equal(r.cases.length,30);
 assert.equal(r.cases.every(x=>x.requiresRealDevice&&!x.executed&&x.passed===null),true);
});
test("limited matrix retains stable ordering",()=>{
 const r=buildCaptureQaMatrix({maxCases:2});assert.deepEqual(r.cases.map(x=>x.condition),["normal-light","low-light"]);
});
test("zero cases rejected",()=>assert.equal(buildCaptureQaMatrix({maxCases:0}).valid,false));
test("more than full matrix rejected",()=>assert.equal(buildCaptureQaMatrix({maxCases:31}).valid,false));
