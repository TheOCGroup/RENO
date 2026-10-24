import test from "node:test";
import assert from "node:assert/strict";
import {appendSpatialEvent,getLatestFeatureState} from "../lib/renovision/spatial-change-log.mjs";
const event={eventId:"e1",propertyId:"p",roomId:"r",featureId:"wall1",actorId:"operator",occurredAt:"2026-10-24T00:00:00Z",reason:"renovation proposal",fromState:"EXISTING",toState:"PROPOSED",scopeItemId:"s1",approvalRef:"approval1"};
test("appends proposal without mutating prior event list",()=>{
 const before=[];const r=appendSpatialEvent(before,event);
 assert.equal(r.ok,true);assert.equal(before.length,0);assert.equal(r.events.length,1);
});
test("duplicate event identifiers rejected",()=>{
 const prior=appendSpatialEvent([],event).events;
 assert.equal(appendSpatialEvent(prior,{...event}).ok,false);
});
test("approval reference required",()=>{
 assert.equal(appendSpatialEvent([],{...event,approvalRef:""}).ok,false);
});
test("state continuity required for transitions",()=>{
 assert.equal(appendSpatialEvent([],{...event,eventId:"e2",fromState:"PROPOSED",toState:"AS_BUILT"}).ok,false);
});
test("state transitions follow prior event",()=>{
 const prior=appendSpatialEvent([],event).events;
 const r=appendSpatialEvent(prior,{...event,eventId:"e2",fromState:"PROPOSED",toState:"AS_BUILT"});
 assert.equal(r.ok,true);assert.deepEqual(getLatestFeatureState(r.events,"wall1"),{found:true,state:"AS_BUILT",eventId:"e2"});
});
test("cannot silently rewrite existing state",()=>{
 assert.equal(appendSpatialEvent([],{...event,toState:"EXISTING"}).ok,false);
});
test("unknown feature returns not found",()=>{
 assert.deepEqual(getLatestFeatureState([],"missing"),{found:false});
});
