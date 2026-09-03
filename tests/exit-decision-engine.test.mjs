import test from "node:test";
import assert from "node:assert/strict";
import { evaluateExit, buildExitHandoff } from "../src/exitDecisionEngine.mjs";

const exitPackage={ sourceSystem:"mission-control", sourceOpportunityId:"opp-1", propertyId:"prop-1", address:"123 Main St", exitDecision:"sell", acquisitionPrice:145000, arvBaseline:235000, finalSpend:28500, completionEvidenceRef:"album://final" };

test("exit evaluation refuses to invent a recommendation without fresh market evidence",()=>{
  const result=evaluateExit({exitPackage});
  assert.equal(result.recommendedDecision,null);
  assert.equal(result.confidence,"insufficient_data");
  assert.equal(result.requiresInvestmentCommittee,true);
  assert.ok(result.limitations.length>=3);
});

test("exit evaluation calculates sale profit and hold DSCR from supplied current inputs",()=>{
  const result=evaluateExit({ exitPackage, market:{expectedSalePrice:240000,saleCostsPct:8,monthlyRent:2200,monthlyOperatingExpenses:500}, financing:{monthlyDebtService:1300,refinanceAmount:176000} });
  assert.equal(result.metrics.totalBasis,173500);
  assert.equal(result.metrics.netSaleProceeds,220800);
  assert.equal(result.metrics.projectedSaleProfit,47300);
  assert.equal(result.metrics.monthlyNoi,1700);
  assert.equal(result.metrics.dscr,1.308);
  assert.equal(result.evidence.hasFreshSalePrice,true);
  assert.equal(result.evidence.hasFreshRent,true);
});

test("exit handoff cannot bypass Investment Committee",()=>{
  const evaluation=evaluateExit({ exitPackage, market:{expectedSalePrice:240000}, financing:{} });
  const handoff=buildExitHandoff({exitPackage,evaluation});
  assert.equal(handoff.targetSystem,"ocg-os");
  assert.equal(handoff.handoffType,"renovation_exit_ready");
  assert.equal(handoff.decisionStatus,"investment_committee_required");
  assert.throws(()=>buildExitHandoff({exitPackage,evaluation:{requiresInvestmentCommittee:false}}),/governed_exit_evaluation_required/);
});
