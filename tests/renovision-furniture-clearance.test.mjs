import test from "node:test";
import assert from "node:assert/strict";
import {evaluateFurnitureClearance} from "../lib/renovision/furniture-clearance.mjs";
const room={widthMeters:4,depthMeters:3};
const a={id:"sofa",xMeters:0.5,yMeters:0.5,widthMeters:1.5,depthMeters:0.8};
test("separated furniture has no rectangle overlap",()=>{
 const r=evaluateFurnitureClearance({room,items:[a,{id:"table",xMeters:2.5,yMeters:1.5,widthMeters:0.5,depthMeters:0.5}]});
 assert.equal(r.valid,true);assert.equal(r.fitWithoutOverlap,true);assert.equal(r.verified,false);
});
test("overlapping furniture is flagged",()=>{
 const r=evaluateFurnitureClearance({room,items:[a,{id:"chair",xMeters:1,yMeters:0.6,widthMeters:1,depthMeters:1}]});
 assert.deepEqual(r.overlaps,[["sofa","chair"]]);assert.equal(r.fitWithoutOverlap,false);
});
test("items outside room rejected",()=>assert.equal(evaluateFurnitureClearance({room,items:[{...a,xMeters:3.8}]}).valid,false));
test("duplicate IDs rejected",()=>assert.equal(evaluateFurnitureClearance({room,items:[a,a]}).valid,false));
test("negative item dimensions rejected",()=>assert.equal(evaluateFurnitureClearance({room,items:[{...a,widthMeters:-1}]}).valid,false));
test("wall clearance reported but not code certified",()=>{
 const r=evaluateFurnitureClearance({room,items:[a]});
 assert.equal(r.wallClearances[0].minimumMeters,0.5);assert.equal(r.clearanceAdvisoryOnly,true);
});
