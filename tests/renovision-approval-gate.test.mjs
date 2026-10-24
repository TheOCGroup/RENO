import test from "node:test";
import assert from "node:assert/strict";
import {authorizeSpatialChange} from "../lib/renovision/approval-gate.mjs";
const actor={authenticated:true,id:"operator1",tenantId:"tenant1"};
const change={propertyId:"property1",roomId:"room1",featureId:"wall1",approvedScopeItemId:"scope1",approvalRef:"approval1"};
const approval={status:"approved",revoked:false,tenantId:"tenant1",propertyId:"property1",roomId:"room1",featureId:"wall1",scopeItemId:"scope1",approvalRef:"approval1",approvedAt:"2026-10-24T00:00:00Z",approvedBy:"reviewer1",allowedActorIds:["operator1"]};
const request=(overrides={})=>({actor,change,resolveApproval:async()=>approval,...overrides});
test("server-resolved matching approval authorizes actor",async()=>assert.equal((await authorizeSpatialChange(request())).authorized,true));
test("missing authenticated context fails closed",async()=>assert.equal((await authorizeSpatialChange(request({actor:{id:"operator1",tenantId:"tenant1"}}))).authorized,false));
test("client approval string without resolver is insufficient",async()=>assert.equal((await authorizeSpatialChange(request({resolveApproval:undefined}))).authorized,false));
test("cross-tenant approval rejected",async()=>assert.equal((await authorizeSpatialChange(request({resolveApproval:async()=>({...approval,tenantId:"tenant2"})}))).authorized,false));
test("wrong property or feature approval rejected",async()=>{
 assert.equal((await authorizeSpatialChange(request({resolveApproval:async()=>({...approval,propertyId:"other"})}))).authorized,false);
 assert.equal((await authorizeSpatialChange(request({resolveApproval:async()=>({...approval,featureId:"other"})}))).authorized,false);
});
test("revoked approval rejected",async()=>assert.equal((await authorizeSpatialChange(request({resolveApproval:async()=>({...approval,revoked:true})}))).authorized,false));
test("unauthorized actor rejected",async()=>assert.equal((await authorizeSpatialChange(request({actor:{...actor,id:"outsider"}}))).authorized,false));
test("approval lookup failures do not authorize",async()=>assert.equal((await authorizeSpatialChange(request({resolveApproval:async()=>{throw Error("offline")}}))).authorized,false));
test("missing approval audit timestamp rejected",async()=>assert.equal((await authorizeSpatialChange(request({resolveApproval:async()=>({...approval,approvedAt:"yesterday"})}))).authorized,false));

test("expired approval is rejected",async()=>{
 const r=await authorizeSpatialChange(request({resolveApproval:async()=>({...approval,expiresAt:"2026-10-24T00:00:00Z"}),now:()=>Date.parse("2026-10-25T00:00:00Z")}));
 assert.equal(r.authorized,false);
});
test("future-dated expiry is accepted by trusted clock",async()=>{
 const r=await authorizeSpatialChange(request({resolveApproval:async()=>({...approval,expiresAt:"2026-10-26T00:00:00Z"}),now:()=>Date.parse("2026-10-25T00:00:00Z")}));
 assert.equal(r.authorized,true);
});

test("future-dated approval is rejected using trusted clock",async()=>{
 const r=await authorizeSpatialChange(request({resolveApproval:async()=>({...approval,approvedAt:"2026-10-27T00:00:00Z"}),now:()=>Date.parse("2026-10-25T00:00:00Z")}));
 assert.equal(r.authorized,false);
});
test("approval at trusted current time is accepted",async()=>{
 const r=await authorizeSpatialChange(request({now:()=>Date.parse("2026-10-24T00:00:00Z")}));
 assert.equal(r.authorized,true);
});
