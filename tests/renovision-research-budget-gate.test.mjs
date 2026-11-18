import test from "node:test";
import assert from "node:assert/strict";
import {evaluateResearchTrialBudget} from "../lib/renovision/research-budget-gate.mjs";
const req={studyId:"study",provider:"test",estimatedUsd:0.1};
test("free internal calculation permitted within limit",()=>assert.equal(evaluateResearchTrialBudget(req).allowed,true));
test("paid trial requires explicit approval",()=>{
 const r=evaluateResearchTrialBudget({...req,requiresPaidCall:true});assert.equal(r.allowed,false);assert.equal(r.requiresApproval,true);
});
test("approved paid trial within budget allowed by policy only",()=>{
 const r=evaluateResearchTrialBudget({...req,requiresPaidCall:true,founderApproved:true});assert.equal(r.allowed,true);assert.equal(r.charged,false);
});
test("budget overrun rejected despite approval",()=>assert.equal(evaluateResearchTrialBudget({...req,estimatedUsd:1,requiresPaidCall:true,founderApproved:true}).allowed,false));
test("missing provider rejected",()=>assert.equal(evaluateResearchTrialBudget({...req,provider:""}).allowed,false));
test("invalid negative estimate rejected",()=>assert.equal(evaluateResearchTrialBudget({...req,estimatedUsd:-1}).allowed,false));
