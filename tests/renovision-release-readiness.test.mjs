import test from "node:test";
import assert from "node:assert/strict";
import {evaluateRenovisionReleaseReadiness} from "../lib/renovision/release-readiness.mjs";
const keys=["deviceCapture","privateDurableStorage","authenticatedTenantIsolation","physicalRoomBenchmark","independentQA","releaseApproval"];
test("missing evidence blocks release",()=>{const r=evaluateRenovisionReleaseReadiness();assert.equal(r.ready,false);assert.equal(r.missing.length,6);});
test("unverified passing labels do not satisfy gate",()=>{const r=evaluateRenovisionReleaseReadiness({deviceCapture:{status:"pass",evidenceRef:"ref"}});assert.equal(r.ready,false);});
test("verified evidence without reference fails",()=>{const r=evaluateRenovisionReleaseReadiness({deviceCapture:{status:"pass",independentlyVerified:true}});assert.equal(r.gates[0].passed,false);});
test("all verified references satisfy checklist but never grant production authorization",()=>{
 const evidence=Object.fromEntries(keys.map(k=>[k,{status:"pass",independentlyVerified:true,evidenceRef:"ref-"+k}]));
 const r=evaluateRenovisionReleaseReadiness(evidence);assert.equal(r.ready,true);assert.equal(r.productionAuthorized,false);
});
