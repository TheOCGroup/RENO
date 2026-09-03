import test from "node:test";
import assert from "node:assert/strict";
import { RenovationWorkflow } from "../src/renovationWorkflow.mjs";
import { RenovationOperations } from "../src/renovationOperations.mjs";

function buildInProgress() {
  const workflow = new RenovationWorkflow({ id:"reno-1", sourceOpportunityId:"opp-1", propertyId:"prop-1", address:"123 Main St", acquisitionPrice:145000, arvBaseline:235000, rehabBudgetBaseline:30000, projectStatus:"intake" });
  workflow.validateScope({ items:[{title:"Kitchen",estimatedCost:12000},{title:"Bath",estimatedCost:8000},{title:"Paint",estimatedCost:5000}] });
  workflow.approveBudget({ amount:30000, contingencyPct:10, rationale:"Validated field scope" });
  const bid=workflow.addBid({ contractor:"Acme Renovations", amount:28000, days:30, scopeCoveragePct:100 });
  workflow.selectBid({ bidId:bid.id, rationale:"Best qualified complete bid" });
  workflow.scheduleWork({ startAt:"2026-09-01T12:00:00Z", targetCompleteAt:"2026-10-01T12:00:00Z" });
  workflow.startWork({ startedAt:"2026-09-01T12:00:00Z" });
  return workflow;
}

test("draws require verified progress, invoices, evidence and retainage",()=>{
  const workflow=buildInProgress(), ops=new RenovationOperations(workflow);
  ops.recordProgress({ percentComplete:50, asOf:"2026-09-15T12:00:00Z", evidenceRefs:["photo://kitchen","photo://bath"] });
  assert.throws(()=>ops.requestDraw({amount:13000,percentComplete:50,evidenceRefs:["photo://1"],invoiceRefs:["invoice://1"],reason:"First draw"}),/draw_exceeds_verified_progress/);
  const draw=ops.requestDraw({amount:12000,percentComplete:50,evidenceRefs:["photo://1"],invoiceRefs:["invoice://1"],reason:"First draw"});
  const approved=ops.decideDraw({drawId:draw.id,decision:"approved",rationale:"Verified against completed work"});
  assert.equal(approved.approvedAmount,12000);
  assert.throws(()=>ops.decideDraw({drawId:draw.id,decision:"approved",rationale:"again"}),/draw_already_decided/);
});

test("risk report detects schedule slippage, budget pressure and weak contractor performance",()=>{
  const workflow=buildInProgress(), ops=new RenovationOperations(workflow);
  ops.recordProgress({ percentComplete:30, asOf:"2026-09-25T12:00:00Z", evidenceRefs:["photo://progress"] });
  const co=workflow.requestChangeOrder({title:"Subfloor repair",amount:4000,reason:"Hidden rot",evidenceRef:"photo://rot"});
  workflow.decideChangeOrder({changeOrderId:co.id,decision:"approved",rationale:"Required structural repair"});
  ops.scoreContractor({contractor:"Acme Renovations",quality:3,schedule:2,communication:2,documentation:2,safety:4});
  const report=ops.riskReport("2026-09-25T12:00:00Z");
  assert.equal(report.riskLevel,"high");
  assert.ok(report.risks.some(r=>r.kind==="budget_over_approved"));
  assert.ok(report.risks.some(r=>r.kind==="schedule_progress_gap"));
  assert.ok(report.risks.some(r=>r.kind==="contractor_performance"));
});

test("progress cannot regress and must carry evidence",()=>{
  const workflow=buildInProgress(), ops=new RenovationOperations(workflow);
  assert.throws(()=>ops.recordProgress({percentComplete:10,evidenceRefs:[]}),/progress_evidence_required/);
  ops.recordProgress({percentComplete:40,evidenceRefs:["photo://1"]});
  assert.throws(()=>ops.recordProgress({percentComplete:35,evidenceRefs:["photo://2"]}),/progress_cannot_regress/);
});

test("exit package is blocked until renovation is exit ready and carries cost/evidence controls",()=>{
  const workflow=buildInProgress(), ops=new RenovationOperations(workflow);
  assert.throws(()=>ops.exitPackage(),/exit_ready_required/);
  workflow.enterPunchList({items:[{title:"Touch up paint"}]});
  workflow.completePunchItem({punchItemId:workflow.punchItems[0].id,evidenceRef:"photo://punch"});
  workflow.completeProject({finalSpend:28500,completionEvidenceRef:"album://final"});
  workflow.markExitReady({decision:"sell",rationale:"Renovation complete and market-ready"});
  const pkg=ops.exitPackage();
  assert.equal(pkg.sourceSystem,"mission-control");
  assert.equal(pkg.exitDecision,"sell");
  assert.equal(pkg.finalSpend,28500);
  assert.equal(pkg.completionEvidenceRef,"album://final");
  assert.equal(pkg.sourceOpportunityId,"opp-1");
});
