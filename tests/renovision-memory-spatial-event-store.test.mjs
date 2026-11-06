import test from "node:test";
import assert from "node:assert/strict";
import {createMemorySpatialEventStore} from "../lib/renovision/memory-spatial-event-store.mjs";
import {commitSpatialEvent} from "../lib/renovision/transactional-change-log.mjs";
const actor={authenticated:true,id:"owner",tenantId:"tenant1"};
const event={eventId:"e1",propertyId:"p1",roomId:"r1",featureId:"wall",actorId:"owner",occurredAt:"2026-10-24T00:00:00Z",reason:"renovation",fromState:"EXISTING",toState:"PROPOSED",scopeItemId:"scope",approvalRef:"a1"};
const approval={status:"approved",tenantId:"tenant1",propertyId:"p1",roomId:"r1",featureId:"wall",scopeItemId:"scope",approvalRef:"a1",approvedAt:"2026-10-24T00:00:00Z",approvedBy:"reviewer"};
const req=store=>({store,actor,event,expectedRevision:0,resolveApproval:async()=>approval});
test("test store integrates with approved atomic append",async()=>{
 const store=createMemorySpatialEventStore({authorize:async ({actor})=>actor?.id==="owner"});
 assert.equal((await commitSpatialEvent(req(store))).committed,true);
 const state=await store.readFeatureEvents({tenantId:"tenant1",propertyId:"p1",roomId:"r1",featureId:"wall",actor});
 assert.equal(state.revision,1);assert.equal(state.events[0].eventId,"e1");
});
test("test store rejects stale writer revision",async()=>{
 const store=createMemorySpatialEventStore({authorize:async()=>true});
 await commitSpatialEvent(req(store));
 const receipt=await store.compareAndAppend({tenantId:"tenant1",propertyId:"p1",roomId:"r1",featureId:"wall",actor,expectedRevision:0,event});
 assert.equal(receipt.committed,false);
});
test("test store denies unauthorized access",async()=>{
 const store=createMemorySpatialEventStore({authorize:async ({actor})=>actor?.id==="owner"});
 await assert.rejects(store.readFeatureEvents({tenantId:"tenant1",propertyId:"p1",roomId:"r1",featureId:"wall",actor:{id:"outsider"}}));
});
test("tenant-scoped storage does not leak another tenant state",async()=>{
 const store=createMemorySpatialEventStore({authorize:async()=>true});
 await commitSpatialEvent(req(store));
 const other=await store.readFeatureEvents({tenantId:"tenant2",propertyId:"p1",roomId:"r1",featureId:"wall",actor});
 assert.equal(other.revision,0);assert.equal(other.events.length,0);
});

test("same feature name in another room remains isolated",async()=>{
 const store=createMemorySpatialEventStore({authorize:async()=>true});
 await commitSpatialEvent(req(store));
 const other=await store.readFeatureEvents({tenantId:"tenant1",propertyId:"p1",roomId:"r2",featureId:"wall",actor});
 assert.equal(other.revision,0);assert.equal(other.events.length,0);
});

test("nested input event cannot mutate committed fixture history",async()=>{
 const store=createMemorySpatialEventStore({authorize:async()=>true});
 const payload={...event,metadata:{geometry:{width:4}}};
 const receipt=await store.compareAndAppend({tenantId:"tenant1",propertyId:"p1",roomId:"r1",featureId:"wall",actor,expectedRevision:0,event:payload});
 assert.equal(receipt.committed,true);payload.metadata.geometry.width=999;
 const state=await store.readFeatureEvents({tenantId:"tenant1",propertyId:"p1",roomId:"r1",featureId:"wall",actor});
 assert.equal(state.events[0].metadata.geometry.width,4);
});
test("nested returned event cannot mutate fixture history",async()=>{
 const store=createMemorySpatialEventStore({authorize:async()=>true});
 await store.compareAndAppend({tenantId:"tenant1",propertyId:"p1",roomId:"r1",featureId:"wall",actor,expectedRevision:0,event:{...event,metadata:{width:4}}});
 const scope={tenantId:"tenant1",propertyId:"p1",roomId:"r1",featureId:"wall",actor};
 const first=await store.readFeatureEvents(scope);first.events[0].metadata.width=999;
 const second=await store.readFeatureEvents(scope);assert.equal(second.events[0].metadata.width,4);
});
