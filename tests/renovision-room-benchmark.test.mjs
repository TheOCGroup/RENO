import test from "node:test";
import assert from "node:assert/strict";
import {evaluateRoomBenchmark} from "../lib/renovision/room-benchmark.mjs";
const ref=[{featureId:"width",value:4,unit:"m",uncertainty:0.01,independentlyMeasured:true},{featureId:"depth",value:300,unit:"cm",uncertainty:1,independentlyMeasured:true}];
const cand=[{featureId:"width",value:4.02,unit:"m",uncertainty:0.02},{featureId:"depth",value:9.85,unit:"ft",uncertainty:0.02}];
test("compares mixed-unit room measurements to independent reference",()=>{
 const r=evaluateRoomBenchmark({roomId:"r1",referenceMeasurements:ref,candidateMeasurements:cand});
 assert.equal(r.valid,true);assert.equal(r.referenceCount,2);assert.equal(r.withinTolerance,true);assert.equal(r.fieldCertified,false);
});
test("fails when independent reference evidence not established",()=>{
 const r=evaluateRoomBenchmark({roomId:"r1",referenceMeasurements:[{...ref[0],independentlyMeasured:false}],candidateMeasurements:[cand[0]]});
 assert.equal(r.valid,false);
});
test("rejects missing candidate features",()=>{
 const r=evaluateRoomBenchmark({roomId:"r1",referenceMeasurements:ref,candidateMeasurements:[cand[0]]});
 assert.equal(r.valid,false);
});
test("rejects duplicate candidate features",()=>{
 const r=evaluateRoomBenchmark({roomId:"r1",referenceMeasurements:[ref[0]],candidateMeasurements:[cand[0],cand[0]]});
 assert.equal(r.valid,false);
});
test("flags out-of-tolerance geometry",()=>{
 const r=evaluateRoomBenchmark({roomId:"r1",referenceMeasurements:[ref[0]],candidateMeasurements:[{...cand[0],value:4.5}]});
 assert.equal(r.valid,true);assert.equal(r.withinTolerance,false);
});
test("rejects invalid tolerance",()=>{
 const r=evaluateRoomBenchmark({roomId:"r1",referenceMeasurements:ref,candidateMeasurements:cand,toleranceMeters:-1});
 assert.equal(r.valid,false);
});
