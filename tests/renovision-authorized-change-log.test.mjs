import test from "node:test";
import assert from "node:assert/strict";
import {appendAuthorizedSpatialEvent} from "../lib/renovision/authorized-change-log.mjs";
const actor={authenticated:true,id:"operator1",tenantId:"tenant1"};
const event={eventId:"e1",propertyId:"p1",roomId:"r1",featureId:"wall1",actorId:"operator1",occurredAt:"2026-10-24T00:00:00Z",reason:"approved renovation",fromState:"EXISTING",toState:"PROPOSED",scopeItemId:"s1",approvalRef:"a1"};
const approval={status:"approved",tenantId:"tenant1",propertyId:"p1",roomId:"r1",featureId:"wall1",scopeItemId:"s1",approvalRef:"a1",approvedAt:"2026-10-24T00:00:00Z",approvedBy:"reviewer"};
const request=(changes={})=>({events:[],event,actor,resolveApproval:async()=>approval,...changes});
test("approved event appends",async()=>{const r=await appendAuthorizedSpatialEvent(request());assert.equal(r.ok,true);assert.equal(r.events.length,1);});
test("unapproved event rejected",async()=>assert.equal((await appendAuthorizedSpatialEvent(request({resolveApproval:async()=>({...approval,status:"pending"})}))).ok,false));
test("event actor cannot impersonate authenticated actor",async()=>assert.equal((await appendAuthorizedSpatialEvent(request({event:{...event,actorId:"other"}}))).ok,false));
test("stale feature state rejected",async()=>{
 const first=await appendAuthorizedSpatialEvent(request());
 const stale=await appendAuthorizedSpatialEvent(request({events:first.events,event:{...event,eventId:"e2"}}));
 assert.equal(stale.ok,false);
});
test("valid sequential state transition accepted",async()=>{
 const first=await appendAuthorizedSpatialEvent(request());
 const second=await appendAuthorizedSpatialEvent(request({events:first.events,expectedLastEventId:"e1",event:{...event,eventId:"e2",fromState:"PROPOSED",toState:"AS_BUILT"}}));
 assert.equal(second.ok,true);
});

test("version conflict rejects a stale concurrent writer",async()=>{
 const first=await appendAuthorizedSpatialEvent(request());
 const second=await appendAuthorizedSpatialEvent(request({events:first.events,expectedLastEventId:"old",event:{...event,eventId:"e2",fromState:"PROPOSED",toState:"AS_BUILT"}}));
 assert.equal(second.ok,false);
});
