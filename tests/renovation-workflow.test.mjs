import test from "node:test";
import assert from "node:assert/strict";
import { RenovationWorkflow } from "../src/renovationWorkflow.mjs";

function seed() {
  return {
    id: "reno-1",
    sourceSystem: "pipeline",
    sourceHandoffId: "handoff-1",
    sourceOpportunityId: "opp-1",
    address: "123 Main St",
    acquisitionPrice: 145000,
    arvBaseline: 235000,
    rehabBudgetBaseline: 30000,
    scopeStatus: "field_scope_required",
    budgetStatus: "preliminary_baseline",
    projectStatus: "intake",
  };
}

function buildThroughBid() {
  const flow = new RenovationWorkflow(seed());
  flow.validateScope({ actor: "luca", items: [
    { title: "Roof repair", category: "exterior", estimatedCost: 7500 },
    { title: "Kitchen refresh", category: "interior", estimatedCost: 12000 },
    { title: "Paint", category: "interior", estimatedCost: 4500 },
  ] });
  flow.approveBudget({ actor: "owner", amount: 30000, contingencyPct: 10, rationale: "Validated field scope and contingency" });
  const bid = flow.addBid({ actor: "luca", contractor: "ABC Renovations", amount: 28500, days: 28, scopeCoveragePct: 100 });
  flow.selectBid({ actor: "owner", bidId: bid.id, rationale: "Full scope and within approved authority" });
  return flow;
}

test("field scope must be validated before budget approval", () => {
  const flow = new RenovationWorkflow(seed());
  assert.throws(() => flow.approveBudget({ amount: 30000, rationale: "test" }), /stage_budget_approval_required/);
  const snap = flow.validateScope({ items: [{ title: "Inspection repairs", estimatedCost: 1000 }] });
  assert.equal(snap.project.scopeStatus, "validated");
  assert.equal(snap.project.stage, "budget_approval");
});

test("bid selection is governed by scope coverage and budget authority", () => {
  const flow = new RenovationWorkflow(seed());
  flow.validateScope({ items: [{ title: "Full rehab", estimatedCost: 30000 }] });
  flow.approveBudget({ amount: 30000, contingencyPct: 10, rationale: "Field scope" });
  const partial = flow.addBid({ contractor: "Partial Co", amount: 20000, days: 20, scopeCoveragePct: 70 });
  assert.throws(() => flow.selectBid({ bidId: partial.id, rationale: "cheap" }), /bid_scope_coverage_insufficient/);
  const over = flow.addBid({ contractor: "Premium Co", amount: 35000, days: 20, scopeCoveragePct: 100 });
  assert.throws(() => flow.selectBid({ bidId: over.id, rationale: "full scope" }), /bid_exceeds_budget_authority/);
  const valid = flow.addBid({ contractor: "Right Co", amount: 31000, days: 24, scopeCoveragePct: 100 });
  const selected = flow.selectBid({ bidId: valid.id, rationale: "Best complete bid" });
  assert.equal(selected.status, "selected");
});

test("change orders require evidence and cannot exceed approved authority", () => {
  const flow = buildThroughBid();
  flow.scheduleWork({ startAt: "2026-09-10T13:00:00Z", targetCompleteAt: "2026-10-08T22:00:00Z" });
  flow.startWork({ startedAt: "2026-09-10T13:00:00Z" });
  assert.throws(() => flow.requestChangeOrder({ title: "Hidden plumbing", amount: 1000, reason: "Found leak" }), /change_order_evidence_required/);
  const ok = flow.requestChangeOrder({ title: "Hidden plumbing", amount: 1500, reason: "Leak behind wall", evidenceRef: "photo://plumbing" });
  const approved = flow.decideChangeOrder({ changeOrderId: ok.id, decision: "approved", rationale: "Necessary concealed condition" });
  assert.equal(approved.status, "approved");
  const tooMuch = flow.requestChangeOrder({ title: "Upgrade", amount: 5000, reason: "Owner request", evidenceRef: "scope://upgrade" });
  assert.throws(() => flow.decideChangeOrder({ changeOrderId: tooMuch.id, decision: "approved", rationale: "Requested" }), /change_order_exceeds_budget_authority/);
});

test("project cannot finish until punch list is evidenced and closes into exit readiness", () => {
  const flow = buildThroughBid();
  flow.scheduleWork({ startAt: "2026-09-10T13:00:00Z", targetCompleteAt: "2026-10-08T22:00:00Z" });
  flow.startWork({ startedAt: "2026-09-10T13:00:00Z" });
  const punch = flow.enterPunchList({ items: [{ title: "Touch up paint" }, { title: "Adjust cabinet door" }] });
  assert.equal(punch.project.stage, "punch_list");
  assert.throws(() => flow.completeProject({ finalSpend: 29000, completionEvidenceRef: "album://final" }), /punch_list_incomplete/);
  for (const item of flow.snapshot().punchItems) flow.completePunchItem({ punchItemId: item.id, evidenceRef: `photo://${item.id}` });
  const complete = flow.completeProject({ finalSpend: 29800, completionEvidenceRef: "album://final" });
  assert.equal(complete.project.stage, "complete");
  const exit = flow.markExitReady({ decision: "sell", rationale: "Renovation complete and disposition package ready" });
  assert.equal(exit.project.stage, "exit_ready");
  assert.equal(exit.project.exitDecision, "sell");
});

test("audit events preserve the governed lifecycle sequence", () => {
  const flow = buildThroughBid();
  flow.scheduleWork({ startAt: "2026-09-10T13:00:00Z", targetCompleteAt: "2026-10-08T22:00:00Z" });
  flow.startWork({ startedAt: "2026-09-10T13:00:00Z" });
  const types = flow.snapshot().events.map(x => x.type);
  assert.deepEqual(types, ["scope_validated", "budget_approved", "bid_received", "bid_selected", "work_scheduled", "work_started"]);
});
