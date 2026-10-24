import test from "node:test";
import assert from "node:assert/strict";
import {commitSpatialEvent} from "../lib/renovision/transactional-change-log.mjs";
const actor={authenticated:true,id:"operator",tenantId:"tenant"};
const event={eventId:"e1",propertyId:"p1",roomId:"r1",featureId:"wall",actorId:"operator",occurredAt:"2026-10-24T00:00:00Z",reason:"approved",fromState:"EXISTING",toState:"PROPOSED",scopeItemId:"scope",approvalRef:"approval"};
const approval={status:"approved",tenantId:"tenant",propertyId:"p1",roomId:"r1",featureId:"wall",scopeItemId:"scope",approvalRef:"approval",approvedAt:"2026-10-24T00:00:00Z",approvedBy:"reviewer"};
const makeStore=()=>{let revision=0,events=[];return {readFeatureEvents:async()=>({revision,events:[...events]}),compareAndAppend:async ({expectedRevision,event})=>{if(revision!==expectedRevision)return {committed:false};events.push(event);revision++;return {committed:true,revision};}};};
const req=(store=makeStore())=>({store,actor,event,resolveApproval:async()=>approval,expectedRevision:0});
test("commits approved event atomically",async()=>{const r=await commitSpatialEvent(req());assert.equal(r.committed,true);assert.equal(r.revision,1);});
test("missing transactional adapter fails closed",async()=>assert.equal((await commitSpatialEvent({...req(),store:{}})).committed,false));
test("invalid revision fails closed",async()=>assert.equal((await commitSpatialEvent({...req(),expectedRevision:-1})).committed,false));
test("stale snapshot revision rejected",async()=>{const store=makeStore();await commitSpatialEvent(req(store));assert.equal((await commitSpatialEvent(req(store))).committed,false);});
test("compare and append conflict rejected",async()=>{const store={readFeatureEvents:async()=>({revision:0,events:[]}),compareAndAppend:async()=>({committed:false})};assert.equal((await commitSpatialEvent(req(store))).committed,false);});
test("unapproved event never reaches append",async()=>{let calls=0;const store={readFeatureEvents:async()=>({revision:0,events:[]}),compareAndAppend:async()=>{calls++;return {committed:true,revision:1};}};const r=await commitSpatialEvent({...req(store),resolveApproval:async()=>({...approval,status:"pending"})});assert.equal(r.committed,false);assert.equal(calls,0);});
test("unexpected storage exception fails closed",async()=>{const store={readFeatureEvents:async()=>{throw Error("offline")},compareAndAppend:async()=>{}};assert.equal((await commitSpatialEvent(req(store))).committed,false);});

test("mixed-room snapshot rejected before approval resolver",async()=>{
 let called=false;const store={readFeatureEvents:async()=>({revision:1,events:[{...event,roomId:"other"}]}),compareAndAppend:async()=>{called=true;}};
 const r=await commitSpatialEvent({...req(store),expectedRevision:1});
 assert.equal(r.committed,false);assert.equal(called,false);
});
test("snapshot revision and event count mismatch rejected",async()=>{
 let called=false;const store={readFeatureEvents:async()=>({revision:2,events:[]}),compareAndAppend:async()=>{called=true;}};
 const r=await commitSpatialEvent({...req(store),expectedRevision:2});
 assert.equal(r.committed,false);assert.equal(called,false);
});
test("mixed-property snapshot rejected",async()=>{
 const store={readFeatureEvents:async()=>({revision:1,events:[{...event,propertyId:"other"}]}),compareAndAppend:async()=>({committed:true,revision:2})};
 assert.equal((await commitSpatialEvent({...req(store),expectedRevision:1})).committed,false);
});

test("duplicate event IDs in snapshot rejected",async()=>{
 const history=[{...event,eventId:"prior",toState:"PROPOSED"},{...event,eventId:"prior",fromState:"PROPOSED",toState:"ALTERNATE"}];
 const store={readFeatureEvents:async()=>({revision:2,events:history}),compareAndAppend:async()=>({committed:true,revision:3})};
 assert.equal((await commitSpatialEvent({...req(store),expectedRevision:2})).committed,false);
});
test("missing event ID in snapshot rejected",async()=>{
 const store={readFeatureEvents:async()=>({revision:1,events:[{...event,eventId:null}]}),compareAndAppend:async()=>({committed:true,revision:2})};
 assert.equal((await commitSpatialEvent({...req(store),expectedRevision:1})).committed,false);
});

test("anonymous transaction never reads feature history",async()=>{
 let reads=0;const store={readFeatureEvents:async()=>{reads++;return {revision:0,events:[]}},compareAndAppend:async()=>({committed:true,revision:1})};
 const r=await commitSpatialEvent({...req(store),actor:{id:"operator",tenantId:"tenant",authenticated:false}});
 assert.equal(r.committed,false);assert.equal(reads,0);
});
test("missing actor identity never reads feature history",async()=>{
 let reads=0;const store={readFeatureEvents:async()=>{reads++;return {revision:0,events:[]}},compareAndAppend:async()=>({committed:true,revision:1})};
 const r=await commitSpatialEvent({...req(store),actor:{tenantId:"tenant",authenticated:true}});
 assert.equal(r.committed,false);assert.equal(reads,0);
});

test("rejects historical feature state discontinuity before approval",async()=>{
 let approvals=0;
 const history=[{...event,eventId:"prior1",toState:"PROPOSED"},{...event,eventId:"prior2",fromState:"EXISTING",toState:"ALTERNATE"}];
 const store={readFeatureEvents:async()=>({revision:2,events:history}),compareAndAppend:async()=>{throw Error("must not append")}};
 const r=await commitSpatialEvent({...req(store),expectedRevision:2,resolveApproval:async()=>{approvals++;return approval}});
 assert.equal(r.committed,false);assert.equal(approvals,0);
});
test("rejects historical timestamps out of order",async()=>{
 const history=[{...event,eventId:"prior1",toState:"PROPOSED",occurredAt:"2026-10-24T02:00:00Z"},{...event,eventId:"prior2",fromState:"PROPOSED",toState:"ALTERNATE",occurredAt:"2026-10-24T01:00:00Z"}];
 const store={readFeatureEvents:async()=>({revision:2,events:history}),compareAndAppend:async()=>{throw Error("must not append")}};
 assert.equal((await commitSpatialEvent({...req(store),expectedRevision:2})).committed,false);
});

test("rejects historical entries without audit actor",async()=>{const store={readFeatureEvents:async()=>({revision:1,events:[{...event,eventId:"prior",actorId:""}]}),compareAndAppend:async()=>({committed:true,revision:2})};assert.equal((await commitSpatialEvent({...req(store),expectedRevision:1})).committed,false);});
