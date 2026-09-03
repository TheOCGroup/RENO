import { randomUUID } from "node:crypto";

const DAY_MS = 86400000;
const isoNow = () => new Date().toISOString();

function n(value) {
  const result = Number(value ?? 0);
  if (!Number.isFinite(result)) throw new Error("invalid_number");
  return result;
}

function toIso(value, error = "invalid_date") {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new Error(error);
  return d.toISOString();
}

function daysUntil(asOf, target) {
  if (!target) return null;
  return Math.ceil((new Date(target).getTime() - new Date(asOf).getTime()) / DAY_MS);
}

export class RenovationOperations {
  constructor(workflow) {
    if (!workflow?.project?.id) throw new Error("renovation_workflow_required");
    this.workflow = workflow;
    this.progressUpdates = [];
    this.drawRequests = [];
    this.contractorScorecards = [];
    this.events = [];
  }

  recordProgress({ actor = "operator", percentComplete, asOf = isoNow(), evidenceRefs, note = null }) {
    if (this.workflow.project.stage !== "in_progress") throw new Error("project_in_progress_required");
    const pct = n(percentComplete);
    if (pct < 0 || pct > 100) throw new Error("invalid_percent_complete");
    const evidence = Array.isArray(evidenceRefs) ? evidenceRefs.filter(Boolean) : [];
    if (evidence.length === 0) throw new Error("progress_evidence_required");
    const previous = this.progressUpdates.at(-1);
    if (previous && pct < previous.percentComplete) throw new Error("progress_cannot_regress");
    const update = { id: randomUUID(), percentComplete: pct, asOf: toIso(asOf), evidenceRefs: evidence, note, actor };
    this.progressUpdates.push(update);
    this.#event("progress_recorded", actor, { percentComplete: pct, evidenceCount: evidence.length });
    return structuredClone(update);
  }

  requestDraw({ actor = "operator", amount, percentComplete, evidenceRefs, invoiceRefs, retainagePct = 10, reason }) {
    if (this.workflow.project.stage !== "in_progress") throw new Error("project_in_progress_required");
    if (!String(reason || "").trim()) throw new Error("draw_reason_required");
    const requested = n(amount);
    if (!(requested > 0)) throw new Error("draw_amount_required");
    const pct = n(percentComplete);
    if (pct < 0 || pct > 100) throw new Error("invalid_percent_complete");
    const evidence = Array.isArray(evidenceRefs) ? evidenceRefs.filter(Boolean) : [];
    const invoices = Array.isArray(invoiceRefs) ? invoiceRefs.filter(Boolean) : [];
    if (evidence.length === 0) throw new Error("draw_evidence_required");
    if (invoices.length === 0) throw new Error("draw_invoice_required");
    const committed = this.workflow.budgetSummary().committed;
    const maxEarned = committed * (pct / 100);
    const approvedPrior = this.drawRequests.filter(d => d.status === "approved").reduce((s,d) => s + d.approvedAmount, 0);
    const retainage = Math.max(0, Math.min(100, n(retainagePct)));
    const available = Math.max(0, maxEarned * (1 - retainage / 100) - approvedPrior);
    if (requested > available + 0.01) throw new Error("draw_exceeds_verified_progress");
    const draw = { id: randomUUID(), requestedAmount: requested, approvedAmount: 0, percentComplete: pct, retainagePct: retainage, evidenceRefs: evidence, invoiceRefs: invoices, reason: reason.trim(), status: "pending", requestedBy: actor, createdAt: isoNow() };
    this.drawRequests.push(draw);
    this.#event("draw_requested", actor, { drawId: draw.id, requestedAmount: requested, percentComplete: pct });
    return structuredClone(draw);
  }

  decideDraw({ actor = "operator", drawId, decision, approvedAmount = null, rationale }) {
    if (!["approved", "rejected"].includes(decision)) throw new Error("invalid_draw_decision");
    if (!String(rationale || "").trim()) throw new Error("draw_rationale_required");
    const draw = this.drawRequests.find(d => d.id === drawId);
    if (!draw) throw new Error("draw_not_found");
    if (draw.status !== "pending") throw new Error("draw_already_decided");
    if (decision === "approved") {
      const amount = approvedAmount == null ? draw.requestedAmount : n(approvedAmount);
      if (!(amount > 0) || amount > draw.requestedAmount) throw new Error("invalid_draw_approval_amount");
      draw.approvedAmount = amount;
    }
    draw.status = decision;
    draw.decidedBy = actor;
    draw.rationale = rationale.trim();
    draw.decidedAt = isoNow();
    this.#event("draw_decided", actor, { drawId, decision, approvedAmount: draw.approvedAmount });
    return structuredClone(draw);
  }

  scoreContractor({ actor = "operator", contractor, quality, schedule, communication, documentation, safety = 5, note = null }) {
    if (!String(contractor || "").trim()) throw new Error("contractor_required");
    const metrics = { quality, schedule, communication, documentation, safety };
    for (const [key,value] of Object.entries(metrics)) {
      const score = n(value);
      if (score < 1 || score > 5) throw new Error(`invalid_${key}_score`);
      metrics[key] = score;
    }
    const overall = Object.values(metrics).reduce((s,v)=>s+v,0)/Object.values(metrics).length;
    const scorecard = { id: randomUUID(), contractor: contractor.trim(), ...metrics, overall: Number(overall.toFixed(2)), note, actor, createdAt: isoNow() };
    this.contractorScorecards.push(scorecard);
    this.#event("contractor_scored", actor, { contractor: scorecard.contractor, overall: scorecard.overall });
    return structuredClone(scorecard);
  }

  riskReport(asOf = isoNow()) {
    const project = this.workflow.project;
    const budget = this.workflow.budgetSummary();
    const risks = [];
    const schedule = project.schedule;
    const progress = this.progressUpdates.at(-1);

    if (budget.committed > budget.approvedBudget) {
      const over = budget.committed - budget.approvedBudget;
      risks.push({ kind: "budget_over_approved", severity: budget.remainingAuthority < 0 ? "critical" : "high", detail: `Committed renovation cost is $${Math.round(over)} above approved budget.`, amount: over });
    }
    if (budget.remainingAuthority < 0) risks.push({ kind: "budget_authority_exceeded", severity: "critical", detail: "Committed renovation cost exceeds approved budget plus contingency authority.", amount: Math.abs(budget.remainingAuthority) });

    const pendingChanges = this.workflow.changeOrders.filter(c => c.status === "pending");
    if (pendingChanges.length) risks.push({ kind: "pending_change_orders", severity: "high", detail: `${pendingChanges.length} change order${pendingChanges.length===1?" is":"s are"} awaiting decision.` });

    const pendingDraws = this.drawRequests.filter(d => d.status === "pending");
    if (pendingDraws.length) risks.push({ kind: "pending_draws", severity: "medium", detail: `${pendingDraws.length} contractor draw request${pendingDraws.length===1?" is":"s are"} awaiting approval.` });

    if (schedule?.targetCompleteAt && project.stage === "in_progress") {
      const days = daysUntil(asOf, schedule.targetCompleteAt);
      const start = new Date(schedule.startAt).getTime(), finish = new Date(schedule.targetCompleteAt).getTime(), nowMs = new Date(asOf).getTime();
      const elapsedPct = finish > start ? Math.max(0, Math.min(100, ((nowMs-start)/(finish-start))*100)) : 100;
      const actualPct = progress?.percentComplete ?? 0;
      const slippage = elapsedPct - actualPct;
      if (days < 0) risks.push({ kind:"schedule_overdue", severity:"critical", detail:`Target completion is overdue by ${Math.abs(days)} day${Math.abs(days)===1?"":"s"}.`, daysUntilDue:days });
      else if (slippage >= 20) risks.push({ kind:"schedule_progress_gap", severity: days <= 7 ? "critical":"high", detail:`Project progress trails elapsed schedule by ${Math.round(slippage)} percentage points.`, daysUntilDue:days, progressGapPct:Number(slippage.toFixed(1)) });
      else if (days <= 7 && actualPct < 90) risks.push({ kind:"completion_deadline_near", severity:"high", detail:`Target completion is in ${days} day${days===1?"":"s"} with ${actualPct}% verified complete.`, daysUntilDue:days });
    }

    const weak = this.contractorScorecards.filter(s => s.overall < 3);
    if (weak.length) risks.push({ kind:"contractor_performance", severity:"high", detail:`${weak.length} contractor scorecard${weak.length===1?" is":"s are"} below 3.0/5.0.` });

    const priority={critical:4,high:3,medium:2,low:1};
    risks.sort((a,b)=>(priority[b.severity]||0)-(priority[a.severity]||0));
    return { projectId:project.id, asOf:toIso(asOf), riskLevel:risks[0]?.severity||"clear", criticalCount:risks.filter(r=>r.severity==="critical").length, highCount:risks.filter(r=>r.severity==="high").length, risks };
  }

  exitPackage() {
    if (this.workflow.project.stage !== "exit_ready") throw new Error("exit_ready_required");
    const budget = this.workflow.budgetSummary();
    const approvedDraws = this.drawRequests.filter(d=>d.status==="approved").reduce((s,d)=>s+d.approvedAmount,0);
    return {
      contractVersion:"1.0",
      sourceSystem:"mission-control",
      projectId:this.workflow.project.id,
      sourceOpportunityId:this.workflow.project.sourceOpportunityId || null,
      propertyId:this.workflow.project.propertyId || null,
      address:this.workflow.project.address || null,
      exitDecision:this.workflow.project.exitDecision,
      acquisitionPrice:this.workflow.project.acquisitionPrice ?? null,
      arvBaseline:this.workflow.project.arvBaseline ?? null,
      approvedBudget:budget.approvedBudget,
      committedCost:budget.committed,
      finalSpend:budget.finalSpend,
      approvedDraws,
      completionEvidenceRef:this.workflow.project.completionEvidenceRef || null,
      completedAt:this.workflow.project.completedAt || null,
      contractorScorecards:structuredClone(this.contractorScorecards),
      generatedAt:isoNow(),
    };
  }

  #event(type, actor, detail) { this.events.push({ id:randomUUID(), type, actor, detail:structuredClone(detail), occurredAt:isoNow() }); }
}
