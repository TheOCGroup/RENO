import { randomUUID } from "node:crypto";

const STAGES = Object.freeze([
  "intake",
  "scope_validation",
  "budget_approval",
  "bid_collection",
  "scheduled",
  "in_progress",
  "punch_list",
  "complete",
  "exit_ready",
]);

const TERMINAL_WORK_STATUSES = new Set(["complete", "waived"]);

export class RenovationWorkflow {
  constructor(project) {
    if (!project?.id) throw new Error("project_required");
    this.project = structuredClone(project);
    this.project.stage = normalizeStage(project.stage || project.projectStatus || "intake");
    this.project.scopeStatus = project.scopeStatus || "field_scope_required";
    this.project.budgetStatus = project.budgetStatus || "preliminary_baseline";
    this.project.approvedBudget = project.approvedBudget ?? null;
    this.project.selectedBidId = project.selectedBidId ?? null;
    this.project.schedule = project.schedule || null;
    this.project.exitDecision = project.exitDecision || null;
    this.scopeItems = [];
    this.bids = [];
    this.changeOrders = [];
    this.punchItems = [];
    this.events = [];
  }

  snapshot() {
    return structuredClone({
      project: this.project,
      scopeItems: this.scopeItems,
      bids: this.bids,
      changeOrders: this.changeOrders,
      punchItems: this.punchItems,
      events: this.events,
      budget: this.budgetSummary(),
    });
  }

  validateScope({ actor = "operator", items, notes = null }) {
    this.#requireStage("intake", "scope_validation");
    if (!Array.isArray(items) || items.length === 0) throw new Error("scope_items_required");
    for (const item of items) {
      if (!String(item?.title || "").trim()) throw new Error("scope_item_title_required");
      const estimatedCost = number(item.estimatedCost);
      if (estimatedCost < 0) throw new Error("invalid_scope_cost");
      this.scopeItems.push({
        id: randomUUID(),
        title: item.title.trim(),
        category: item.category || "other",
        estimatedCost,
        required: item.required !== false,
        status: "validated",
      });
    }
    this.project.scopeStatus = "validated";
    this.project.stage = "budget_approval";
    this.#event("scope_validated", actor, { notes, itemCount: this.scopeItems.length });
    return this.snapshot();
  }

  approveBudget({ actor = "operator", amount, contingencyPct = 10, rationale }) {
    this.#requireStage("budget_approval");
    if (this.project.scopeStatus !== "validated") throw new Error("validated_scope_required");
    if (!String(rationale || "").trim()) throw new Error("budget_rationale_required");
    const approvedBudget = number(amount);
    if (!(approvedBudget > 0)) throw new Error("approved_budget_required");
    const contingency = Math.max(0, number(contingencyPct));
    this.project.approvedBudget = approvedBudget;
    this.project.contingencyPct = contingency;
    this.project.budgetStatus = "approved";
    this.project.stage = "bid_collection";
    this.#event("budget_approved", actor, { approvedBudget, contingencyPct: contingency, rationale });
    return this.snapshot();
  }

  addBid({ actor = "operator", contractor, amount, days, scopeCoveragePct = 100, notes = null }) {
    this.#requireStage("bid_collection");
    if (!String(contractor || "").trim()) throw new Error("contractor_required");
    const bidAmount = number(amount);
    if (!(bidAmount > 0)) throw new Error("bid_amount_required");
    const durationDays = Math.max(1, Math.trunc(number(days)));
    const coverage = Math.min(100, Math.max(0, number(scopeCoveragePct)));
    const bid = { id: randomUUID(), contractor: contractor.trim(), amount: bidAmount, days: durationDays, scopeCoveragePct: coverage, notes, status: "received" };
    this.bids.push(bid);
    this.#event("bid_received", actor, { bidId: bid.id, contractor: bid.contractor, amount: bid.amount });
    return structuredClone(bid);
  }

  selectBid({ actor = "operator", bidId, rationale }) {
    this.#requireStage("bid_collection");
    if (!String(rationale || "").trim()) throw new Error("bid_selection_rationale_required");
    const bid = this.bids.find(x => x.id === bidId);
    if (!bid) throw new Error("bid_not_found");
    if (bid.scopeCoveragePct < 90) throw new Error("bid_scope_coverage_insufficient");
    const ceiling = this.project.approvedBudget * (1 + (this.project.contingencyPct || 0) / 100);
    if (bid.amount > ceiling) throw new Error("bid_exceeds_budget_authority");
    for (const candidate of this.bids) candidate.status = candidate.id === bidId ? "selected" : "not_selected";
    this.project.selectedBidId = bid.id;
    this.project.stage = "scheduled";
    this.#event("bid_selected", actor, { bidId, contractor: bid.contractor, rationale });
    return structuredClone(bid);
  }

  scheduleWork({ actor = "operator", startAt, targetCompleteAt }) {
    this.#requireStage("scheduled");
    if (!this.project.selectedBidId) throw new Error("selected_bid_required");
    const start = asIso(startAt, "start_at_required");
    const finish = asIso(targetCompleteAt, "target_complete_at_required");
    if (new Date(finish) <= new Date(start)) throw new Error("invalid_schedule_window");
    this.project.schedule = { startAt: start, targetCompleteAt: finish };
    this.#event("work_scheduled", actor, this.project.schedule);
    return this.snapshot();
  }

  startWork({ actor = "operator", startedAt = new Date().toISOString() }) {
    this.#requireStage("scheduled");
    if (!this.project.schedule) throw new Error("work_schedule_required");
    this.project.stage = "in_progress";
    this.project.startedAt = asIso(startedAt, "started_at_required");
    this.#event("work_started", actor, { startedAt: this.project.startedAt });
    return this.snapshot();
  }

  requestChangeOrder({ actor = "operator", title, amount, reason, evidenceRef }) {
    this.#requireStage("in_progress");
    if (!String(title || "").trim()) throw new Error("change_order_title_required");
    if (!String(reason || "").trim()) throw new Error("change_order_reason_required");
    if (!String(evidenceRef || "").trim()) throw new Error("change_order_evidence_required");
    const value = number(amount);
    if (value === 0) throw new Error("change_order_amount_required");
    const order = { id: randomUUID(), title: title.trim(), amount: value, reason: reason.trim(), evidenceRef, status: "pending", requestedBy: actor };
    this.changeOrders.push(order);
    this.#event("change_order_requested", actor, { changeOrderId: order.id, amount: value });
    return structuredClone(order);
  }

  decideChangeOrder({ actor = "operator", changeOrderId, decision, rationale }) {
    this.#requireStage("in_progress");
    if (!String(rationale || "").trim()) throw new Error("change_order_rationale_required");
    if (!["approved", "rejected"].includes(decision)) throw new Error("invalid_change_order_decision");
    const order = this.changeOrders.find(x => x.id === changeOrderId);
    if (!order) throw new Error("change_order_not_found");
    if (order.status !== "pending") throw new Error("change_order_already_decided");
    if (decision === "approved") {
      const after = this.budgetSummary().committed + order.amount;
      const authority = this.project.approvedBudget * (1 + (this.project.contingencyPct || 0) / 100);
      if (after > authority) throw new Error("change_order_exceeds_budget_authority");
    }
    order.status = decision;
    order.decidedBy = actor;
    order.rationale = rationale;
    this.#event("change_order_decided", actor, { changeOrderId, decision, rationale });
    return structuredClone(order);
  }

  enterPunchList({ actor = "operator", items }) {
    this.#requireStage("in_progress");
    const pendingChanges = this.changeOrders.filter(x => x.status === "pending");
    if (pendingChanges.length) throw new Error("pending_change_orders_block_punch_list");
    if (!Array.isArray(items) || items.length === 0) throw new Error("punch_items_required");
    this.punchItems = items.map(item => ({ id: randomUUID(), title: String(item.title || "").trim(), status: "open", evidenceRef: null })).map(item => {
      if (!item.title) throw new Error("punch_item_title_required");
      return item;
    });
    this.project.stage = "punch_list";
    this.#event("punch_list_opened", actor, { itemCount: this.punchItems.length });
    return this.snapshot();
  }

  completePunchItem({ actor = "operator", punchItemId, evidenceRef }) {
    this.#requireStage("punch_list");
    if (!String(evidenceRef || "").trim()) throw new Error("punch_evidence_required");
    const item = this.punchItems.find(x => x.id === punchItemId);
    if (!item) throw new Error("punch_item_not_found");
    item.status = "complete";
    item.evidenceRef = evidenceRef;
    this.#event("punch_item_completed", actor, { punchItemId, evidenceRef });
    return structuredClone(item);
  }

  completeProject({ actor = "operator", finalSpend, completionEvidenceRef }) {
    this.#requireStage("punch_list");
    if (this.punchItems.some(x => !TERMINAL_WORK_STATUSES.has(x.status))) throw new Error("punch_list_incomplete");
    if (!String(completionEvidenceRef || "").trim()) throw new Error("completion_evidence_required");
    const spend = number(finalSpend);
    if (!(spend >= 0)) throw new Error("invalid_final_spend");
    this.project.finalSpend = spend;
    this.project.completionEvidenceRef = completionEvidenceRef;
    this.project.stage = "complete";
    this.project.completedAt = new Date().toISOString();
    this.#event("renovation_completed", actor, { finalSpend: spend, completionEvidenceRef });
    return this.snapshot();
  }

  markExitReady({ actor = "operator", decision, rationale }) {
    this.#requireStage("complete");
    if (!["sell", "hold", "refinance", "rent_ready"].includes(decision)) throw new Error("invalid_exit_decision");
    if (!String(rationale || "").trim()) throw new Error("exit_rationale_required");
    this.project.exitDecision = decision;
    this.project.stage = "exit_ready";
    this.#event("exit_ready", actor, { decision, rationale });
    return this.snapshot();
  }

  budgetSummary() {
    const selected = this.bids.find(x => x.id === this.project.selectedBidId);
    const approvedChanges = this.changeOrders.filter(x => x.status === "approved").reduce((sum, x) => sum + x.amount, 0);
    const committed = (selected?.amount || 0) + approvedChanges;
    const approvedBudget = number(this.project.approvedBudget);
    const contingencyAuthority = approvedBudget * (1 + (this.project.contingencyPct || 0) / 100);
    return {
      baseline: number(this.project.rehabBudgetBaseline),
      approvedBudget,
      contingencyPct: this.project.contingencyPct || 0,
      contingencyAuthority,
      selectedBid: selected?.amount || 0,
      approvedChangeOrders: approvedChanges,
      committed,
      remainingAuthority: contingencyAuthority - committed,
      finalSpend: this.project.finalSpend ?? null,
    };
  }

  #requireStage(...allowed) {
    if (!allowed.includes(this.project.stage)) throw new Error(`stage_${allowed.join("_or_")}_required`);
  }

  #event(type, actor, detail = {}) {
    this.events.push({ id: randomUUID(), type, actor, detail: structuredClone(detail), occurredAt: new Date().toISOString() });
  }
}

function normalizeStage(stage) {
  if (stage === "intake_ready") return "intake";
  if (!STAGES.includes(stage)) throw new Error("invalid_project_stage");
  return stage;
}

function number(value) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) throw new Error("invalid_number");
  return n;
}

function asIso(value, error) {
  if (!value) throw new Error(error);
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new Error(error);
  return d.toISOString();
}
