import test from "node:test";
import assert from "node:assert/strict";
import {assessUncertainFurnitureFit} from "../lib/renovision/uncertain-furniture-fit.mjs";
const d=(meters,uncertaintyMeters=0)=>({meters,uncertaintyMeters});
const room={width:d(3,0.1),depth:d(2,0.1)};
const object={width:d(1,0.05),depth:d(1.5,0.05)};
test("clear fit remains unverified until field measurement",()=>{const r=assessUncertainFurnitureFit({room,object});assert.equal(r.fit,true);assert.equal(r.verified,false);});
test("uncertainty can disqualify nominal fit",()=>{
 const r=assessUncertainFurnitureFit({room:{width:d(2,0.3),depth:d(2,0.3)},object:{width:d(1.8,0.1),depth:d(1.8,0.1)},clearanceMeters:0});
 assert.equal(r.fit,false);
});
test("rotation considered for rectangle footprint",()=>{
 const r=assessUncertainFurnitureFit({room:{width:d(2),depth:d(3)},object:{width:d(2.5),depth:d(1.5)},clearanceMeters:0});
 assert.equal(r.normal,false);assert.equal(r.rotated,true);
});
test("negative uncertainty rejected",()=>assert.equal(assessUncertainFurnitureFit({room,object:{...object,width:d(1,-1)}}).valid,false));
test("missing dimensions rejected",()=>assert.equal(assessUncertainFurnitureFit({room,object:{width:d(1)}}).valid,false));
test("minimum clearance can disqualify fit",()=>{
 const r=assessUncertainFurnitureFit({room:{width:d(2),depth:d(2)},object:{width:d(1.8),depth:d(1.8)},clearanceMeters:0.2});
 assert.equal(r.fit,false);
});
