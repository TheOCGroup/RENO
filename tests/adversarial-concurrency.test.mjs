import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MissionControlStore } from "../src/missionControlStore.mjs";
import { MissionControlFinance } from "../src/financialGovernance.mjs";
import { receiveClosedAcquisition } from "../src/missionControlIntake.mjs";

// ADVERSARIAL FAMILY D — concurrency + duplicates (§7).
// Honesty note: node:sqlite is synchronous, so in-process "concurrency"
// means two INDEPENDENT store connections to one DB file with calls
// interleaved at every step boundary — exactly the interleavings a race
// could exploit — plus cross-connection optimistic-lock contention.

const PM = "pm-1";
const BOSS = "boss-1";

function payload(id) {
  return {
    contractVersion: "1.0", sourceSystem: "pipeline", targetSystem: "mission-control",
    opportunityId: id, opportunityCode: `OCG-${id}`, propertyId: `property-${id}`, address: "400 Race Way",
    closedAt: "2026-09-25T16:00:00Z",
    acquisition: { purchasePrice: 150000, earnestMoney: 1000, strategyType: "cash_purchase", offerId: "offer-1", offerVersionId: "version-1" },
    underwriting: { sourceSystem: "deal-scout", sourceUnderwritingId: "victor-1", arv: 260000, rehab: 48000, mao: 160000, confidence: 0.9, limitations: null },
    renovationSeed: { budgetBaseline: 48000, scopeStatus: "needs_field_validation", projectStatus: "intake_ready" }
  };
}

function tempDb(t) {
  const dir = mkdtempSync(join(tmpdir(), "mc-adv-d-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return join(dir, "mission-control.db");
}

function driveToInProgress(store, handoffId, { budget = 50000, contingency = 10, progress = 50 } = {}) {
  const { project } = receiveClosedAcquisition({ handoffId, payload: payload(handoffId), repository: store.intakeRepository() });
  const wf = store.restoreWorkflow(project.id);
  wf.validateScope({ items: [{ title: "Roof replacement", category: "exterior", estimatedCost: 12000 }] });
  wf.approveBudget({ amount: budget, contingencyPct: contingency, rationale: "Baselines verified" });
  const bid = wf.addBid({ contractor: "Acme Builders", amount: 48000, days: 45 });
  wf.selectBid({ bidId: bid.id, rationale: "Best coverage" });
  wf.scheduleWork({ startAt: "2026-10-01T08:00:00Z", targetCompleteAt: "2026-11-15T17:00:00Z" });
  wf.startWork({ startedAt: "2026-10-01T08:05:00Z" });
  store.persistWorkflow(wf);
  const operations = store.restoreOperations(wf);
  operations.recordProgress({ percentComplete: progress, evidenceRefs: [`evidence://progress-${progress}`] });
  store.persistOperations(operations);
  return project;
}

function setupFinance(store) {
  const finance = new MissionControlFinance(store);
  finance.setActorRole({ actorId: PM, role: "operator" });
  finance.setActorRole({ actorId: BOSS, role: "approver" });
  return finance;
}

function approvedInvoice(finance, projectId, number, total) {
  const invoice = finance.submitInvoice({ projectId, actor: PM, contractor: "Acme Builders", externalNumber: number, lineItems: [{ description: "Work", amount: total }], evidenceRefs: [`evidence://${number}`] });
  finance.reviewInvoice({ projectId, actor: BOSS, invoiceId: invoice.id, decision: "approved", rationale: "Verified" });
  return finance.getInvoice(invoice.id);
}

test("D1: two connections race a draw decision — exactly one wins, allocations land exactly once", (t) => {
  const path = tempDb(t);
  const s1 = new MissionControlStore(path);
  const project = driveToInProgress(s1, "handoff-d1");
  const f1 = setupFinance(s1);
  const invoice = approvedInvoice(f1, project.id, "INV-D1", 20000);
  const { draw } = f1.requestDraw({ projectId: project.id, actor: PM, amount: 10000, percentComplete: 50, evidenceRefs: ["evidence://progress-50"], invoiceIds: [invoice.id], reason: "Progress" });

  const s2 = new MissionControlStore(path);
  const f2 = new MissionControlFinance(s2);
  // both connections observe the draw as pending before either decides
  assert.equal(f1.getDraw(draw.id).status, "pending");
  assert.equal(f2.getDraw(draw.id).status, "pending");
  f1.decideDraw({ projectId: project.id, actor: BOSS, drawId: draw.id, decision: "approved", rationale: "first connection" });
  // the loser's decision is refused and writes nothing
  assert.throws(() => f2.decideDraw({ projectId: project.id, actor: BOSS, drawId: draw.id, decision: "approved", rationale: "second connection" }), /draw_already_decided/);
  assert.equal(f1.listDecisions(draw.id).length, 1);
  assert.equal(f2.listDecisions(draw.id).length, 1);
  assert.deepEqual(f1.getProjectFinancials(project.id), { projectId: project.id, approved: 10000, allocated: 10000, paid: 0, reconciled: 0 });
  s1.close(); s2.close();
});

test("D2: overlapping draw reservations are real — the second approval fails on authority and writes nothing", (t) => {
  const path = tempDb(t);
  const store = new MissionControlStore(path);
  // authority = budget 50000 x (1 + 0%) = 50000; committed 48000 at 100%
  // with 0% retainage gives a domain cap of 48000 — so each 30000 draw
  // passes the domain alone, and only the cumulative authority check
  // (30000 + 30000 > 50000) can stop the pair.
  const project = driveToInProgress(store, "handoff-d2", { budget: 50000, contingency: 0, progress: 100 });
  const finance = setupFinance(store);
  const invA = approvedInvoice(finance, project.id, "INV-D2A", 30000);
  const invB = approvedInvoice(finance, project.id, "INV-D2B", 30000);
  const d1 = finance.requestDraw({ projectId: project.id, actor: PM, amount: 30000, percentComplete: 100, retainagePct: 0, evidenceRefs: ["evidence://progress-100"], invoiceIds: [invA.id], reason: "Phase 1" }).draw;
  const d2 = finance.requestDraw({ projectId: project.id, actor: PM, amount: 30000, percentComplete: 100, retainagePct: 0, evidenceRefs: ["evidence://progress-100"], invoiceIds: [invB.id], reason: "Phase 2" }).draw;
  finance.decideDraw({ projectId: project.id, actor: BOSS, drawId: d1.id, decision: "approved", rationale: "Verified" });
  assert.equal(finance.getProjectFinancials(project.id).allocated, 30000);
  assert.throws(() => finance.decideDraw({ projectId: project.id, actor: BOSS, drawId: d2.id, decision: "approved", rationale: "Verified" }), /allocation_exceeds_authority/);
  // atomic refusal: draw still pending, no decision row, no allocation, financials unchanged
  assert.equal(finance.getDraw(d2.id).status, "pending");
  assert.equal(finance.listDecisions(d2.id).length, 0);
  assert.equal(finance.listAllocations(d2.id).length, 0);
  assert.equal(finance.getProjectFinancials(project.id).allocated, 30000);
  store.close();

  // control: in a fresh project, the SAME second draw approves cleanly on
  // its own — it was the cumulative reservation that refused it.
  const store2 = new MissionControlStore(tempDb(t));
  const project2 = driveToInProgress(store2, "handoff-d2-control", { budget: 50000, contingency: 0, progress: 100 });
  const finance2 = setupFinance(store2);
  const invC = approvedInvoice(finance2, project2.id, "INV-D2C", 30000);
  const solo = finance2.requestDraw({ projectId: project2.id, actor: PM, amount: 30000, percentComplete: 100, retainagePct: 0, evidenceRefs: ["evidence://progress-100"], invoiceIds: [invC.id], reason: "Phase 2 alone" }).draw;
  finance2.decideDraw({ projectId: project2.id, actor: BOSS, drawId: solo.id, decision: "approved", rationale: "Verified" });
  assert.equal(finance2.getProjectFinancials(project2.id).allocated, 30000);
  store2.close();
});

test("D3: idempotency under interleaved replay — the same key x5 across two connections creates exactly one record", (t) => {
  const path = tempDb(t);
  const s1 = new MissionControlStore(path);
  const project = driveToInProgress(s1, "handoff-d3");
  const f1 = setupFinance(s1);
  const invoice = approvedInvoice(f1, project.id, "INV-D3", 20000);
  const s2 = new MissionControlStore(path);
  const f2 = new MissionControlFinance(s2);
  const finances = [f1, f2, f1, f2, f1];

  const drawArgs = { projectId: project.id, actor: PM, amount: 10000, percentComplete: 50, evidenceRefs: ["evidence://progress-50"], invoiceIds: [invoice.id], reason: "Progress", idempotencyKey: "storm-draw-key" };
  const drawResults = finances.map(f => f.requestDraw(drawArgs));
  assert.equal(drawResults[0].duplicate, false);
  for (const replay of drawResults.slice(1)) {
    assert.equal(replay.duplicate, true);
    assert.equal(replay.draw.id, drawResults[0].draw.id);
  }
  assert.equal(f1.listDraws(project.id).length, 1);
  assert.equal(s1.loadOperationsState(project.id).state.drawRequests.length, 1);

  f1.decideDraw({ projectId: project.id, actor: BOSS, drawId: drawResults[0].draw.id, decision: "approved", rationale: "Verified" });
  const payArgs = { projectId: project.id, actor: PM, drawId: drawResults[0].draw.id, amount: 5000, paymentRef: "ACH-D3", idempotencyKey: "storm-pay-key" };
  const payResults = finances.map(f => f.recordPayment(payArgs));
  assert.equal(payResults[0].duplicate, false);
  for (const replay of payResults.slice(1)) {
    assert.equal(replay.duplicate, true);
    assert.equal(replay.payment.id, payResults[0].payment.id);
  }
  assert.equal(f1.listPayments(project.id).length, 1);
  assert.equal(f1.getProjectFinancials(project.id).paid, 5000);
  s1.close(); s2.close();
});

test("D4: version-conflict storm across two connections — final version equals the number of successful saves, state is the last winner's", (t) => {
  const path = tempDb(t);
  const s1 = new MissionControlStore(path);
  const { project } = receiveClosedAcquisition({ handoffId: "handoff-d4", payload: payload("opp-d4"), repository: s1.intakeRepository() });
  const s2 = new MissionControlStore(path);
  const stores = [s1, s2];
  const initial = s1.workflowVersion(project.id);
  assert.equal(initial, 1); // created by intake
  let successes = 0;
  let lastWinnerTag = null;
  for (let round = 0; round < 10; round++) {
    const version = s1.workflowVersion(project.id);
    // both connections load the same version and both try to save over it
    const attempts = stores.map((store, i) => {
      const loaded = store.loadWorkflowState(project.id);
      loaded.state.project.address = `winner-round-${round}-conn-${i}`;
      return { store, loaded };
    });
    let roundWins = 0;
    for (const { store, loaded } of attempts) {
      try {
        store.saveWorkflowState(project.id, loaded.state, version);
        roundWins++;
        successes++;
        lastWinnerTag = loaded.state.project.address;
      } catch (error) {
        assert.equal(error.message, "version_conflict");
      }
    }
    assert.equal(roundWins, 1, `round ${round}: exactly one writer may win`);
  }
  assert.equal(successes, 10);
  assert.equal(s1.workflowVersion(project.id), initial + successes);
  assert.equal(s2.workflowVersion(project.id), initial + successes);
  assert.equal(s1.getProject(project.id).address, lastWinnerTag);
  assert.equal(s2.getProject(project.id).address, lastWinnerTag);
  s1.close(); s2.close();
});
