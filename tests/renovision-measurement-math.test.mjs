import test from "node:test";
import assert from "node:assert/strict";
import {normalizeLength,compareMeasurements,summarizeRoomDimensions} from "../lib/renovision/measurement-math.mjs";
test("feet convert to meters",()=>assert.ok(Math.abs(normalizeLength({value:10,unit:"ft"}).meters-3.048)<1e-12));
test("inches and centimeters agree",()=>{
 const a=normalizeLength({value:12,unit:"in"}),b=normalizeLength({value:30.48,unit:"cm"});
 assert.ok(Math.abs(a.meters-b.meters)<1e-12);
});
test("negative, zero and nonfinite lengths fail",()=>{
 for(const value of [0,-1,Infinity,NaN]) assert.equal(normalizeLength({value,unit:"m"}).valid,false);
});
test("unsupported units fail",()=>assert.equal(normalizeLength({value:2,unit:"yards"}).valid,false));
test("uncertainty comparisons identify disagreement",()=>{
 const r=compareMeasurements({value:3,unit:"m",uncertainty:0.01},{value:3.5,unit:"m",uncertainty:0.01});
 assert.equal(r.comparable,true);assert.equal(r.withinReportedUncertainty,false);
});
test("uncertainty comparisons accept close measurements",()=>{
 const r=compareMeasurements({value:300,unit:"cm",uncertainty:1},{value:3.01,unit:"m",uncertainty:0.01});
 assert.equal(r.withinReportedUncertainty,true);
});
test("rectangular room area remains explicitly unverified",()=>{
 const r=summarizeRoomDimensions({width:{value:4,unit:"m"},depth:{value:3,unit:"m"},height:{value:2.5,unit:"m"}});
 assert.equal(r.valid,true);assert.equal(r.areaSquareMeters,12);assert.equal(r.volumeCubicMeters,30);assert.equal(r.verified,false);
});
test("room summary refuses missing dimensions",()=>{
 assert.equal(summarizeRoomDimensions({width:{value:4,unit:"m"}}).valid,false);
});
