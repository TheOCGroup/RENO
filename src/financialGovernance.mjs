import { createHash, randomUUID } from "node:crypto";

/**
 * Mission Control financial governance (U1b) — the durable draw-approval
 * lifecycle of founder directive §4, layered over MissionControlStore.
 *
 * This layer PERSISTS and CONSTRAINS the existing domain; it does not
 * re-derive it. Draw requests and decisions are executed through the
 * real RenovationOperations.requestDraw / decideDraw on store-restored
 * instances, so the earned-value / retainage cap, stage gate, evidence
 * requirements and pending-only decision rules are the domain's own.
 * Governance adds what the domain never had:
 *
 * - an invoice entity with a review lifecycle (no self-review;
 *   final approval/rejection requires an approver/admin — Phase C),
 * - per-tenant actor roles; draw approval requires an approver/admin
 *   who is not the requester (no self-approval),
 * - allocation of approved draws against approved invoices and the
 *   project's budget authority, enforced inside store transactions,
 * - append-only decision records (reversal = a compensating record),
 * - payment RECORDING only — this module can never initiate a
 *   disbursement; there is no such code path,
 * - reconciliation states kept distinct (approved / allocated / paid /
 *   reconciled), where "bank-reconciled" can only ever mean a
 *   caller-supplied bank record stored verbatim and labeled
 *   `caller_reported` with `bank_verified` permanently false,
 * - a hash-chained, tamper-evident financial audit; every financial
 *   event also lands in the store's U1a events stream in the same
 *   transaction as its audit row,
 * - idempotency keys on draw submission and payment recording.
 *
 * U4R (defect U4-1): approval is DERIVED from the append-only decision
 * ledger, never read off the mutable status column alone. A draw counts
 * as approved for payments and financial summaries only when an
 * unreversed `draw_decisions` approval corroborates it with an equal
 * amount; a status written outside the governed path confers nothing,
 * and neither does a decision row standing alone. Draw rows whose
 * status claims an approval the ledger cannot corroborate are excluded
 * from the sums and surfaced by orphanedApprovals().
 *
 * U4R2 (defect U4-1, invoice half; observation OBS-E1): the same
 * derivation binds invoices — an invoice counts as approved for draw
 * requests (and for the operations-completion reads that consume
 * approval) only when an `invoice_reviewed` audit event with decision
 * 'approved', recorded by the invoice's recorded reviewer, corroborates
 * the status column. A raw UPDATE that flips the status (or the
 * reviewer) without a governed review confers nothing. Amounts at
 * every caller-supplied money boundary (invoice line items and total,
 * draw-decision approved amount, payment amount, reconciliation
 * caller amount, and the governed draw-request amount) must be JSON
 * numbers: numeric strings are refused with `invalid_amount` instead
 * of being silently coerced by Number().
 *
 * U5R (QUINCEY findings M-1 + L-1): the corroboration discipline now
 * covers records as well as approvals. A payment counts in any read
 * sum (draw/project financials, health exposure, lender package) only
 * when a `payment_recorded` audit event corroborates it, and a
 * reconciliation counts toward reconciled sums only behind its
 * `reconciliation_recorded` event; rows written by direct ledger
 * registration move no sum and are surfaced by
 * orphanedFinancialRows(). The draw-request boundary also refuses
 * non-number exotics (booleans, arrays, objects) that the domain's
 * Number() helper would coerce into plausible figures.
 *
 * Phase C (founder design ruling 2026-11-03, directive §4): final
 * invoice approval/rejection now requires the reviewer's recorded
 * tenant role to be approver or admin — the same tenant_roles model
 * and APPROVER_ROLES set that govern draw decisions; no parallel role
 * system was created. An operator or roleless actor attempting a
 * final decision is refused with approver_role_required before any
 * write; the submitter check still runs first, so an approver who
 * submitted the invoice is refused with self_review_forbidden. The
 * intermediate under_review claim grants no final authority and is
 * open to any actor with a recorded tenant role who is not the
 * submitter. Review events now record reviewerRole in the audit
 * payload, so the trail shows the authority that was exercised;
 * isGovernedApprovedInvoice corroboration (decision + reviewer
 * identity) is unchanged, and previously approved invoices keep
 * corroborating exactly as before.
 *
 * Phase G (defect F-1, battery finding 2026-11-03): the Phase C note
 * above held only for events the service can write. A forged,
 * chain-consistent `invoice_reviewed` event whose payload attests
 * reviewerRole 'operator' also matched decision + reviewer identity,
 * laundering the role gate — the recorded role is itself the
 * disqualifying fact. isGovernedApprovedInvoice now refuses
 * corroboration whenever a present reviewerRole is not approver or
 * admin; absent (legacy) reviewerRole corroborates as before. There
 * is no governed-REJECTION derivation to mirror this onto: rejection
 * is consumed only by the submitInvoice resubmission gate on the
 * status column, which confers no funds (a resubmission must still
 * pass the full governed review), so no rejection corroboration path
 * exists or was changed.
 *
 * Tenant discipline matches the store: every row carries tenant_id and
 * every query filters by tenant + project. A cross-tenant or
 * cross-project reference resolves to not-found — never to data.
 */

const isoNow = () => new Date().toISOString();
const GENESIS_HASH = "0".repeat(64);
export const APPROVER_ROLES = Object.freeze(["approver", "admin"]);
export const ACTOR_ROLES = Object.freeze(["operator", "approver", "admin"]);

function cents(value) {
  const result = Number(value);
  if (!Number.isFinite(result)) throw new Error("invalid_amount");
  return Math.round(result * 100) / 100;
}

/**
 * Caller-supplied amount boundary (U4R2, OBS-E1): the value must be a
 * JSON number — numeric strings (and every other non-number type) are
 * refused with invalid_amount rather than coerced. NaN/Infinity are
 * numbers by type but not finite, so they are refused here too, with
 * the same code cents() has always used for them.
 */
function strictCents(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error("invalid_amount");
  return Math.round(value * 100) / 100;
}

function canonicalStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalStringify).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map(key => `${JSON.stringify(key)}:${canonicalStringify(value[key])}`).join(",")}}`;
}

function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

function refList(refs) {
  return Array.isArray(refs) ? refs.filter(Boolean) : [];
}

export class MissionControlFinance {
  #store;
  #db;

  constructor(store) {
    if (!store?.db) throw new Error("mission_control_store_required");
    this.#store = store;
    this.#db = store.db;
  }

  #tx(fn) {
    this.#db.exec("BEGIN");
    try {
      const result = fn();
      this.#db.exec("COMMIT");
      return result;
    } catch (error) {
      this.#db.exec("ROLLBACK");
      throw error;
    }
  }

  #requireProject(projectId, tenantId) {
    const project = this.#store.getProject(projectId, tenantId);
    if (!project) throw new Error("project_not_found");
    return project;
  }

  // --- audit chain + events stream (one transaction, one truth) ---------

  #auditRow(tenantId, projectId, { eventType, actor = null, entityType, entityId, detail = {} }) {
    const last = this.#db.prepare("SELECT seq, hash FROM financial_audit WHERE project_id = ? ORDER BY seq DESC LIMIT 1").get(projectId);
    const seq = (last?.seq || 0) + 1;
    const prevHash = last?.hash || GENESIS_HASH;
    const payloadJson = canonicalStringify({ eventType, actor, entityType, entityId, ...detail });
    const hash = sha256(prevHash + payloadJson);
    const id = randomUUID();
    this.#db.prepare("INSERT INTO financial_audit (tenant_id, project_id, seq, id, event_type, actor, entity_type, entity_id, payload_json, prev_hash, hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(tenantId, projectId, seq, id, eventType, actor, entityType, entityId, payloadJson, prevHash, hash, isoNow());
    return { id, seq, hash };
  }

  #streamEvent(tenantId, projectId, { type, actor = null, detail = null }) {
    const row = this.#db.prepare("SELECT COUNT(*) AS c FROM events WHERE project_id = ? AND stream = 'operations'").get(projectId);
    this.#db.prepare("INSERT INTO events (tenant_id, project_id, stream, seq, id, type, actor, detail_json, occurred_at) VALUES (?, ?, 'operations', ?, ?, ?, ?, ?, ?)")
      .run(tenantId, projectId, row.c + 1, randomUUID(), type, actor, detail === null ? null : JSON.stringify(detail), isoNow());
  }

  /** Audit row + events-stream row, atomically (governance-originated events). */
  #recordEvent(tenantId, projectId, event) {
    this.#auditRow(tenantId, projectId, event);
    this.#streamEvent(tenantId, projectId, { type: event.eventType, actor: event.actor, detail: { entityType: event.entityType, entityId: event.entityId, ...(event.detail || {}) } });
  }

  /**
   * Recompute the project's audit chain. Returns false on any mutation,
   * deletion, reordering, or broken link; true when every hash verifies.
   */
  verifyAuditChain(projectId, tenantId = this.#store.defaultTenantId) {
    const rows = this.#db.prepare("SELECT seq, payload_json, prev_hash, hash FROM financial_audit WHERE project_id = ? AND tenant_id = ? ORDER BY seq").all(projectId, tenantId);
    let expectedPrev = GENESIS_HASH;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (row.seq !== i + 1) return false;
      if (row.prev_hash !== expectedPrev) return false;
      if (sha256(row.prev_hash + row.payload_json) !== row.hash) return false;
      expectedPrev = row.hash;
    }
    return true;
  }

  listAudit(projectId, tenantId = this.#store.defaultTenantId) {
    return this.#db.prepare("SELECT seq, id, event_type, actor, entity_type, entity_id, payload_json, prev_hash, hash, created_at FROM financial_audit WHERE project_id = ? AND tenant_id = ? ORDER BY seq")
      .all(projectId, tenantId)
      .map(row => ({ ...row, payload: JSON.parse(row.payload_json) }));
  }

  // --- actor roles ---------------------------------------------------------

  setActorRole({ tenantId = this.#store.defaultTenantId, actorId, role }) {
    if (!String(actorId || "").trim()) throw new Error("actor_id_required");
    if (!ACTOR_ROLES.includes(role)) throw new Error("invalid_role");
    this.#store.ensureTenant(tenantId);
    this.#db.prepare("INSERT INTO tenant_roles (tenant_id, actor_id, role, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(tenant_id, actor_id) DO UPDATE SET role = excluded.role")
      .run(tenantId, actorId, role, isoNow());
    return { tenantId, actorId, role };
  }

  actorRole(tenantId, actorId) {
    const row = this.#db.prepare("SELECT role FROM tenant_roles WHERE tenant_id = ? AND actor_id = ?").get(tenantId, actorId);
    return row ? row.role : null;
  }

  // --- invoices ------------------------------------------------------------

  #invoiceFromRow(row) {
    if (!row) return null;
    return {
      id: row.id, tenantId: row.tenant_id, projectId: row.project_id,
      contractor: row.contractor, externalNumber: row.external_number,
      total: row.total, lineItems: JSON.parse(row.line_items_json),
      evidenceRefs: JSON.parse(row.evidence_refs_json), status: row.status,
      submittedBy: row.submitted_by, reviewedBy: row.reviewed_by,
      reviewRationale: row.review_rationale, reviewedAt: row.reviewed_at,
      version: row.version, priorInvoiceId: row.prior_invoice_id,
      createdAt: row.created_at, updatedAt: row.updated_at,
    };
  }

  getInvoice(invoiceId, tenantId = this.#store.defaultTenantId) {
    return this.#invoiceFromRow(this.#db.prepare("SELECT * FROM invoices WHERE id = ? AND tenant_id = ?").get(invoiceId, tenantId));
  }

  listInvoices(projectId, tenantId = this.#store.defaultTenantId) {
    return this.#db.prepare("SELECT * FROM invoices WHERE project_id = ? AND tenant_id = ? ORDER BY created_at, id").all(projectId, tenantId).map(row => this.#invoiceFromRow(row));
  }

  submitInvoice({ tenantId = this.#store.defaultTenantId, projectId, actor, contractor, externalNumber, lineItems, total = null, evidenceRefs, resubmissionOf = null }) {
    this.#requireProject(projectId, tenantId);
    if (!String(contractor || "").trim()) throw new Error("contractor_required");
    if (!String(externalNumber || "").trim()) throw new Error("invoice_number_required");
    if (!String(actor || "").trim()) throw new Error("actor_id_required");
    const evidence = refList(evidenceRefs);
    if (evidence.length === 0) throw new Error("invoice_evidence_required");
    if (!Array.isArray(lineItems) || lineItems.length === 0) throw new Error("line_items_required");
    const workflowState = this.#store.loadWorkflowState(projectId, tenantId);
    const scopeIds = new Set((workflowState?.state.scopeItems || []).map(item => item.id));
    const items = lineItems.map(item => {
      if (!String(item?.description || "").trim()) throw new Error("line_item_description_required");
      const amount = strictCents(item.amount);
      if (item.scopeItemId != null && !scopeIds.has(item.scopeItemId)) throw new Error("scope_item_not_found");
      return { scopeItemId: item.scopeItemId ?? null, description: item.description.trim(), amount };
    });
    const sum = cents(items.reduce((s, item) => s + item.amount, 0));
    if (!(sum > 0)) throw new Error("invoice_total_required");
    if (total != null && strictCents(total) !== sum) throw new Error("line_item_sum_mismatch");

    let version = 1;
    let priorInvoiceId = null;
    if (resubmissionOf != null) {
      const prior = this.getInvoice(resubmissionOf, tenantId);
      if (!prior || prior.projectId !== projectId) throw new Error("invoice_not_found");
      if (prior.status !== "rejected") throw new Error("resubmission_requires_rejected");
      if (prior.externalNumber !== String(externalNumber).trim()) throw new Error("resubmission_number_mismatch");
      if (prior.contractor !== String(contractor).trim()) throw new Error("resubmission_contractor_mismatch");
      const newer = this.#db.prepare("SELECT id FROM invoices WHERE prior_invoice_id = ?").get(prior.id);
      if (newer) throw new Error("duplicate_invoice_number");
      version = prior.version + 1;
      priorInvoiceId = prior.id;
    } else {
      const clash = this.#db.prepare("SELECT id FROM invoices WHERE tenant_id = ? AND project_id = ? AND contractor = ? AND external_number = ?")
        .get(tenantId, projectId, String(contractor).trim(), String(externalNumber).trim());
      if (clash) throw new Error("duplicate_invoice_number");
    }

    const invoice = {
      id: randomUUID(), tenantId, projectId,
      contractor: String(contractor).trim(), externalNumber: String(externalNumber).trim(),
      total: sum, lineItems: items, evidenceRefs: evidence, status: "submitted",
      submittedBy: actor, reviewedBy: null, reviewRationale: null, reviewedAt: null,
      version, priorInvoiceId, createdAt: isoNow(), updatedAt: isoNow(),
    };
    this.#tx(() => {
      this.#db.prepare("INSERT INTO invoices (id, tenant_id, project_id, contractor, external_number, total, line_items_json, evidence_refs_json, status, submitted_by, reviewed_by, review_rationale, reviewed_at, version, prior_invoice_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'submitted', ?, NULL, NULL, NULL, ?, ?, ?, ?)")
        .run(invoice.id, tenantId, projectId, invoice.contractor, invoice.externalNumber, invoice.total, JSON.stringify(items), JSON.stringify(evidence), actor, version, priorInvoiceId, invoice.createdAt, invoice.updatedAt);
      this.#recordEvent(tenantId, projectId, { eventType: "invoice_submitted", actor, entityType: "invoice", entityId: invoice.id, detail: { contractor: invoice.contractor, externalNumber: invoice.externalNumber, total: invoice.total, version } });
    });
    return structuredClone(invoice);
  }

  /**
   * Governed invoice approval (U4R2, defect U4-1 invoice half): the
   * invoice counts as approved only when (a) its status column says
   * 'approved' AND (b) the hash-chained financial audit holds an
   * `invoice_reviewed` event for this invoice, in this tenant +
   * project, with decision 'approved', recorded by the actor the
   * invoice row names as its reviewer. A status (or reviewer) written
   * outside reviewInvoice has no corroborating audit event and
   * confers nothing — the exact mirror of #governedApprovedAmount
   * for draws. Phase G (defect F-1) adds: when the event records a
   * reviewerRole, it must be approver/admin — a recorded non-approver
   * role disqualifies the event. Roleless (pre-Phase-C) events are
   * unaffected.
   */
  isGovernedApprovedInvoice(invoice, tenantId = this.#store.defaultTenantId) {
    if (!invoice || invoice.status !== "approved" || !invoice.reviewedBy) return false;
    const rows = this.#db.prepare("SELECT actor, payload_json FROM financial_audit WHERE tenant_id = ? AND project_id = ? AND event_type = 'invoice_reviewed' AND entity_id = ?").all(tenantId, invoice.projectId, invoice.id);
    return rows.some(row => {
      let payload;
      try { payload = JSON.parse(row.payload_json); } catch { return false; }
      if (payload.decision !== "approved" || payload.actor !== invoice.reviewedBy || row.actor !== invoice.reviewedBy) return false;
      // Phase G (defect F-1): when the corroborating event records the
      // reviewer's role, the recorded role must itself hold final-
      // approval authority — an event attesting an operator's (or any
      // non-approver's) final approval records the very fact that
      // disqualifies it, and confers nothing. Events written before
      // Phase C carry no reviewerRole; they corroborate on decision +
      // reviewer identity exactly as before (legacy approvals verify
      // unchanged — battery probe F2-3 pins that behavior).
      if (payload.reviewerRole !== undefined && !APPROVER_ROLES.includes(payload.reviewerRole)) return false;
      return true;
    });
  }

  reviewInvoice({ tenantId = this.#store.defaultTenantId, projectId, actor, invoiceId, decision, rationale = null }) {
    this.#requireProject(projectId, tenantId);
    const invoice = this.getInvoice(invoiceId, tenantId);
    if (!invoice || invoice.projectId !== projectId) throw new Error("invoice_not_found");
    if (actor === invoice.submittedBy) throw new Error("self_review_forbidden");
    if (!["under_review", "approved", "rejected"].includes(decision)) throw new Error("invalid_invoice_decision");
    // Phase C (founder ruling 2026-11-03, directive §4): the reviewer's
    // RECORDED tenant role gates the decision. Final approval/rejection
    // requires approver/admin — an operator, or an actor with no
    // recorded role, is refused with approver_role_required and nothing
    // is written. The intermediate under_review transition grants no
    // final authority (it records only that a reviewer has claimed the
    // invoice), so it is open to any actor holding a recorded tenant
    // role; a roleless actor is refused there too (fail closed). The
    // self check above runs first, mirroring decideDraw: a submitter
    // holding an approver role still cannot review their own invoice.
    const reviewerRole = this.actorRole(tenantId, actor);
    if (decision === "under_review") {
      if (!ACTOR_ROLES.includes(reviewerRole)) throw new Error("approver_role_required");
    } else if (!APPROVER_ROLES.includes(reviewerRole)) {
      throw new Error("approver_role_required");
    }
    if (invoice.status === "approved" || invoice.status === "rejected") throw new Error("invoice_already_reviewed");
    if (decision === "under_review" && invoice.status !== "submitted") throw new Error("invoice_already_reviewed");
    if (decision === "rejected" && !String(rationale || "").trim()) throw new Error("review_rationale_required");
    const now = isoNow();
    const terminal = decision === "approved" || decision === "rejected";
    this.#tx(() => {
      this.#db.prepare("UPDATE invoices SET status = ?, reviewed_by = ?, review_rationale = ?, reviewed_at = ?, updated_at = ? WHERE id = ? AND tenant_id = ?")
        .run(decision, terminal ? actor : invoice.reviewedBy, terminal ? (rationale ? String(rationale).trim() : null) : invoice.reviewRationale, terminal ? now : invoice.reviewedAt, now, invoiceId, tenantId);
      this.#recordEvent(tenantId, projectId, { eventType: "invoice_reviewed", actor, entityType: "invoice", entityId: invoiceId, detail: { decision, fromStatus: invoice.status, reviewerRole } });
    });
    return this.getInvoice(invoiceId, tenantId);
  }

  // --- governed draws ------------------------------------------------------

  #drawFromRow(row) {
    if (!row) return null;
    return {
      id: row.id, tenantId: row.tenant_id, projectId: row.project_id,
      requestedBy: row.requested_by, requestedAmount: row.requested_amount,
      approvedAmount: row.approved_amount, percentComplete: row.percent_complete,
      retainagePct: row.retainage_pct, evidenceRefs: JSON.parse(row.evidence_refs_json),
      invoiceIds: JSON.parse(row.invoice_ids_json), reason: row.reason,
      status: row.status, idempotencyKey: row.idempotency_key, createdAt: row.created_at,
    };
  }

  getDraw(drawId, tenantId = this.#store.defaultTenantId) {
    return this.#drawFromRow(this.#db.prepare("SELECT * FROM governed_draws WHERE id = ? AND tenant_id = ?").get(drawId, tenantId));
  }

  listDraws(projectId, tenantId = this.#store.defaultTenantId) {
    return this.#db.prepare("SELECT * FROM governed_draws WHERE project_id = ? AND tenant_id = ? ORDER BY created_at, id").all(projectId, tenantId).map(row => this.#drawFromRow(row));
  }

  #allocatedForInvoice(invoiceId) {
    const row = this.#db.prepare("SELECT COALESCE(SUM(amount), 0) AS total FROM draw_allocations WHERE invoice_id = ?").get(invoiceId);
    return cents(row.total);
  }

  #projectAllocated(projectId, tenantId) {
    const row = this.#db.prepare("SELECT COALESCE(SUM(amount), 0) AS total FROM draw_allocations WHERE project_id = ? AND tenant_id = ?").get(projectId, tenantId);
    return cents(row.total);
  }

  #projectPaid(projectId, tenantId) {
    // Governed sum (U5R, finding M-1): only audit-corroborated
    // payments count — see #governedPayments.
    return cents(this.#governedPayments(projectId, tenantId).reduce((sum, payment) => sum + payment.amount, 0));
  }

  /**
   * Governed draw request. The earned-value / retainage cap is applied
   * by the domain itself (restored RenovationOperations.requestDraw);
   * governance first proves every referenced invoice is APPROVED —
   * governed-approved per isGovernedApprovedInvoice, not merely
   * status-stamped — and belongs to this project + tenant.
   */
  requestDraw({ tenantId = this.#store.defaultTenantId, projectId, actor, amount, percentComplete, evidenceRefs, invoiceIds, retainagePct = 10, reason, idempotencyKey = null }) {
    this.#requireProject(projectId, tenantId);
    if (idempotencyKey != null) {
      const prior = this.#db.prepare("SELECT * FROM governed_draws WHERE tenant_id = ? AND project_id = ? AND idempotency_key = ?").get(tenantId, projectId, idempotencyKey);
      if (prior) return { draw: this.#drawFromRow(prior), duplicate: true };
    }
    // OBS-E1: a numeric-string amount is refused here instead of being
    // coerced by the domain's Number() helper. A non-numeric string
    // still falls through to the domain, whose invalid_number refusal
    // is the pinned behavior for it.
    if (typeof amount === "string" && amount.trim() !== "" && Number.isFinite(Number(amount))) throw new Error("invalid_amount");
    // L-1: booleans, arrays and other objects are refused here too —
    // the domain's Number() coercion turns them into plausible figures
    // (true → 1, [5000] → 5000). null/undefined still fall through:
    // they coerce to 0 in the domain and are refused there as
    // draw_amount_required, never to a plausible figure.
    if (typeof amount === "boolean" || (typeof amount === "object" && amount !== null)) throw new Error("invalid_amount");
    const ids = refList(invoiceIds);
    for (const invoiceId of ids) {
      const invoice = this.getInvoice(invoiceId, tenantId);
      if (!invoice) throw new Error("invoice_not_found");
      if (invoice.projectId !== projectId) throw new Error("invoice_project_mismatch");
      if (!this.isGovernedApprovedInvoice(invoice, tenantId)) throw new Error("invoice_not_approved");
    }
    const workflow = this.#store.restoreWorkflow(projectId, { tenantId });
    const operations = this.#store.restoreOperations(workflow, { tenantId });
    const domainDraw = operations.requestDraw({ actor, amount, percentComplete, evidenceRefs, invoiceRefs: ids, retainagePct, reason });
    this.#store.persistOperations(operations, { tenantId });
    const row = {
      id: domainDraw.id, tenantId, projectId, requestedBy: actor,
      requestedAmount: domainDraw.requestedAmount, approvedAmount: 0,
      percentComplete: domainDraw.percentComplete, retainagePct: domainDraw.retainagePct,
      evidenceRefs: domainDraw.evidenceRefs, invoiceIds: ids, reason: domainDraw.reason,
      status: "pending", idempotencyKey, createdAt: domainDraw.createdAt,
    };
    this.#tx(() => {
      this.#db.prepare("INSERT INTO governed_draws (id, tenant_id, project_id, requested_by, requested_amount, approved_amount, percent_complete, retainage_pct, evidence_refs_json, invoice_ids_json, reason, status, idempotency_key, created_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, 'pending', ?, ?)")
        .run(row.id, tenantId, projectId, actor, row.requestedAmount, row.percentComplete, row.retainagePct, JSON.stringify(row.evidenceRefs), JSON.stringify(ids), row.reason, idempotencyKey, row.createdAt);
      // The events-stream row for draw_requested is appended by the
      // domain persist above (same store, same stream); the audit row
      // is written here so both records of the event exist.
      this.#auditRow(tenantId, projectId, { eventType: "draw_requested", actor, entityType: "draw", entityId: row.id, detail: { requestedAmount: row.requestedAmount, percentComplete: row.percentComplete, invoiceIds: ids } });
    });
    return { draw: structuredClone(row), duplicate: false };
  }

  /**
   * Independent draw decision. Approver role required; the requester
   * can never decide their own draw. On approval the amount is
   * allocated against the referenced invoices and the project's budget
   * authority inside one transaction — allocation failures abort the
   * decision before anything is written.
   */
  decideDraw({ tenantId = this.#store.defaultTenantId, projectId, actor, drawId, decision, approvedAmount = null, rationale }) {
    this.#requireProject(projectId, tenantId);
    const draw = this.getDraw(drawId, tenantId);
    if (!draw || draw.projectId !== projectId) throw new Error("draw_not_found");
    if (actor === draw.requestedBy) throw new Error("self_approval_forbidden");
    if (!APPROVER_ROLES.includes(this.actorRole(tenantId, actor))) throw new Error("approver_role_required");
    if (!["approved", "rejected"].includes(decision)) throw new Error("invalid_draw_decision");
    if (!String(rationale || "").trim()) throw new Error("draw_rationale_required");
    if (draw.status !== "pending") throw new Error("draw_already_decided");

    let approved = 0;
    let allocations = [];
    if (decision === "approved") {
      approved = approvedAmount == null ? draw.requestedAmount : strictCents(approvedAmount);
      if (!(approved > 0) || approved > draw.requestedAmount) throw new Error("invalid_draw_approval_amount");
      // Per-invoice headroom, in reference order.
      let remaining = approved;
      for (const invoiceId of draw.invoiceIds) {
        if (remaining <= 0) break;
        const invoice = this.getInvoice(invoiceId, tenantId);
        const headroom = cents(invoice.total - this.#allocatedForInvoice(invoiceId));
        const slice = Math.min(headroom, remaining);
        if (slice > 0) { allocations.push({ invoiceId, amount: cents(slice) }); remaining = cents(remaining - slice); }
      }
      if (remaining > 0) throw new Error("allocation_exceeds_invoice");
      // Project authority: approved budget + contingency, from the workflow document.
      const workflowState = this.#store.loadWorkflowState(projectId, tenantId);
      const project = workflowState.state.project;
      const authority = cents(Number(project.approvedBudget || 0) * (1 + Number(project.contingencyPct || 0) / 100));
      if (cents(this.#projectAllocated(projectId, tenantId) + approved) > authority) throw new Error("allocation_exceeds_authority");
    }

    // The domain renders the decision (its own pending/amount rules);
    // governance then records it append-only, with its allocations.
    const workflow = this.#store.restoreWorkflow(projectId, { tenantId });
    const operations = this.#store.restoreOperations(workflow, { tenantId });
    operations.decideDraw({ actor, drawId, decision, approvedAmount: decision === "approved" ? approved : null, rationale });
    this.#store.persistOperations(operations, { tenantId });

    const decisionRow = { id: randomUUID(), tenantId, projectId, drawId, actor, decision, approvedAmount: decision === "approved" ? approved : null, rationale: String(rationale).trim(), reversesDecisionId: null, createdAt: isoNow() };
    this.#tx(() => {
      this.#db.prepare("INSERT INTO draw_decisions (id, tenant_id, project_id, draw_id, actor, decision, approved_amount, rationale, reverses_decision_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)")
        .run(decisionRow.id, tenantId, projectId, drawId, actor, decision, decisionRow.approvedAmount, decisionRow.rationale, decisionRow.createdAt);
      this.#db.prepare("UPDATE governed_draws SET status = ?, approved_amount = ? WHERE id = ? AND tenant_id = ?")
        .run(decision, decisionRow.approvedAmount || 0, drawId, tenantId);
      this.#auditRow(tenantId, projectId, { eventType: "draw_decided", actor, entityType: "draw", entityId: drawId, detail: { decision, approvedAmount: decisionRow.approvedAmount, decisionId: decisionRow.id } });
      if (decision === "approved") {
        for (const allocation of allocations) {
          this.#db.prepare("INSERT INTO draw_allocations (id, tenant_id, project_id, draw_id, decision_id, invoice_id, amount, reverses_allocation_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?)")
            .run(randomUUID(), tenantId, projectId, drawId, decisionRow.id, allocation.invoiceId, allocation.amount, decisionRow.createdAt);
        }
        this.#recordEvent(tenantId, projectId, { eventType: "draw_allocated", actor, entityType: "draw", entityId: drawId, detail: { decisionId: decisionRow.id, totalAllocated: approved, allocations } });
      }
    });
    return { decision: structuredClone(decisionRow), draw: this.getDraw(drawId, tenantId), allocations };
  }

  /**
   * Reverse a prior approval with a compensating decision record. The
   * original decision and its allocations are never edited: reversal
   * inserts a 'reversal' decision plus negative allocation rows. A
   * draw with recorded payments cannot be reversed. Note the domain
   * draw stays approved in the operations document, so the domain's
   * earned-value cap remains conservative (never more permissive).
   */
  reverseDecision({ tenantId = this.#store.defaultTenantId, projectId, actor, decisionId, rationale }) {
    this.#requireProject(projectId, tenantId);
    const original = this.#db.prepare("SELECT * FROM draw_decisions WHERE id = ? AND tenant_id = ? AND project_id = ?").get(decisionId, tenantId, projectId);
    if (!original) throw new Error("decision_not_found");
    if (original.decision !== "approved") throw new Error("decision_not_reversible");
    const already = this.#db.prepare("SELECT id FROM draw_decisions WHERE reverses_decision_id = ?").get(decisionId);
    if (already) throw new Error("decision_not_reversible");
    const draw = this.getDraw(original.draw_id, tenantId);
    if (actor === draw.requestedBy) throw new Error("self_approval_forbidden");
    if (!APPROVER_ROLES.includes(this.actorRole(tenantId, actor))) throw new Error("approver_role_required");
    if (!String(rationale || "").trim()) throw new Error("draw_rationale_required");
    const paid = this.#db.prepare("SELECT COALESCE(SUM(amount), 0) AS total FROM payments WHERE draw_id = ?").get(draw.id);
    if (cents(paid.total) > 0) throw new Error("decision_has_payments");
    const originalAllocations = this.#db.prepare("SELECT * FROM draw_allocations WHERE decision_id = ?").all(decisionId);
    const reversal = { id: randomUUID(), tenantId, projectId, drawId: draw.id, actor, decision: "reversal", approvedAmount: null, rationale: String(rationale).trim(), reversesDecisionId: decisionId, createdAt: isoNow() };
    this.#tx(() => {
      this.#db.prepare("INSERT INTO draw_decisions (id, tenant_id, project_id, draw_id, actor, decision, approved_amount, rationale, reverses_decision_id, created_at) VALUES (?, ?, ?, ?, ?, 'reversal', NULL, ?, ?, ?)")
        .run(reversal.id, tenantId, projectId, draw.id, actor, reversal.rationale, decisionId, reversal.createdAt);
      for (const allocation of originalAllocations) {
        this.#db.prepare("INSERT INTO draw_allocations (id, tenant_id, project_id, draw_id, decision_id, invoice_id, amount, reverses_allocation_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
          .run(randomUUID(), tenantId, projectId, draw.id, reversal.id, allocation.invoice_id, cents(-allocation.amount), allocation.id, reversal.createdAt);
      }
      this.#db.prepare("UPDATE governed_draws SET status = 'reversed' WHERE id = ? AND tenant_id = ?").run(draw.id, tenantId);
      this.#recordEvent(tenantId, projectId, { eventType: "decision_reversed", actor, entityType: "draw", entityId: draw.id, detail: { decisionId: reversal.id, reversesDecisionId: decisionId } });
    });
    return { decision: structuredClone(reversal), draw: this.getDraw(draw.id, tenantId) };
  }

  /**
   * The governed approved amount of a draw: its recorded approved
   * amount when (a) the row's status is 'approved' AND (b) the
   * append-only decision ledger holds an approval for this draw that
   * no reversal points at, with an approved_amount equal to the row's.
   * Otherwise 0 — a forged status, a forged decision, and a reversed
   * approval each confer nothing on their own.
   */
  #governedApprovedAmount(draw, tenantId) {
    if (!draw || draw.status !== "approved") return 0;
    const decisions = this.#db.prepare("SELECT id, decision, approved_amount, reverses_decision_id FROM draw_decisions WHERE draw_id = ? AND tenant_id = ? ORDER BY created_at, rowid").all(draw.id, tenantId);
    const reversedIds = new Set(decisions.filter(row => row.decision === "reversal" && row.reverses_decision_id).map(row => row.reverses_decision_id));
    const corroborated = decisions.some(row => row.decision === "approved" && !reversedIds.has(row.id) && cents(row.approved_amount) === cents(draw.approvedAmount));
    return corroborated ? draw.approvedAmount : 0;
  }

  /**
   * Surface the draws a project's status columns claim are approved
   * but the decision ledger cannot corroborate (manufactured
   * approvals, defect U4-1). getProjectFinancials excludes them from
   * its sums; this read exists so the exclusion is never silent. It is
   * a separate read because getProjectFinancials' shape is pinned by
   * strict deep-equality across the certification suites.
   */
  orphanedApprovals(projectId, tenantId = this.#store.defaultTenantId) {
    this.#requireProject(projectId, tenantId);
    const orphaned = this.listDraws(projectId, tenantId).filter(draw => draw.status === "approved" && this.#governedApprovedAmount(draw, tenantId) === 0);
    return { projectId, orphanedApprovedDraws: orphaned.length, drawIds: orphaned.map(draw => draw.id) };
  }

  /**
   * Governed payment (U5R, finding M-1): a payment row counts in any
   * read sum only when the hash-chained financial audit corroborates
   * it — a `payment_recorded` event for this payment, in this tenant
   * + project, whose recorded amount, draw and reference match the
   * row and whose actor is the row's recordedBy. recordPayment writes
   * exactly that event in the same transaction as the row, so the
   * governed path always corroborates itself; a payment row written
   * by direct ledger registration has no such event and moves no
   * sum. The exact mirror of isGovernedApprovedInvoice for payments.
   */
  isGovernedPayment(payment, tenantId = this.#store.defaultTenantId) {
    if (!payment) return false;
    const rows = this.#db.prepare("SELECT actor, payload_json FROM financial_audit WHERE tenant_id = ? AND project_id = ? AND event_type = 'payment_recorded' AND entity_id = ?").all(tenantId, payment.projectId, payment.id);
    return rows.some(row => {
      let payload;
      try { payload = JSON.parse(row.payload_json); } catch { return false; }
      return row.actor === payment.recordedBy && payload.actor === payment.recordedBy
        && payload.drawId === payment.drawId && payload.paymentRef === payment.paymentRef
        && cents(payload.amount) === cents(payment.amount);
    });
  }

  /**
   * Governed reconciliation (U5R, finding M-1): a reconciliation row
   * counts toward reconciled sums only when a
   * `reconciliation_recorded` audit event corroborates it — matching
   * reconciliation id, state, caller amount and payment amount,
   * recorded by the row's recordedBy, in this tenant + project.
   * recordReconciliation writes exactly that event in the same
   * transaction as the row, so the governed path always corroborates
   * itself; a row written outside it confers no reconciled figure.
   */
  isGovernedReconciliation(record, tenantId = this.#store.defaultTenantId) {
    if (!record) return false;
    const rows = this.#db.prepare("SELECT actor, payload_json FROM financial_audit WHERE tenant_id = ? AND project_id = ? AND event_type = 'reconciliation_recorded' AND entity_id = ?").all(tenantId, record.projectId, record.paymentId);
    return rows.some(row => {
      let payload;
      try { payload = JSON.parse(row.payload_json); } catch { return false; }
      return row.actor === record.recordedBy && payload.actor === record.recordedBy
        && payload.reconciliationId === record.id && payload.state === record.state
        && cents(payload.callerAmount) === cents(record.callerAmount)
        && cents(payload.paymentAmount) === cents(record.paymentAmount);
    });
  }

  /** Payments of a project that read sums may count (U5R, M-1). */
  #governedPayments(projectId, tenantId) {
    return this.listPayments(projectId, tenantId).filter(payment => this.isGovernedPayment(payment, tenantId));
  }

  /**
   * Ids of payments carrying a corroborated reconciliation in state
   * 'reconciled' (U5R, M-1): both the payment and the reconciliation
   * must be governed for the payment's amount to count as reconciled.
   */
  #governedReconciledPaymentIds(projectId, tenantId) {
    const governed = new Set(this.#governedPayments(projectId, tenantId).map(payment => payment.id));
    const ids = new Set();
    for (const record of this.listReconciliations(projectId, tenantId)) {
      if (record.state !== "reconciled" || !governed.has(record.paymentId)) continue;
      if (this.isGovernedReconciliation(record, tenantId)) ids.add(record.paymentId);
    }
    return ids;
  }

  /**
   * Surface the payment and reconciliation rows a project's sums
   * exclude because the audit chain cannot corroborate them
   * (manufactured records, finding M-1). The companion to
   * orphanedApprovals(): getDrawFinancials / getProjectFinancials
   * never count these rows, and this read exists so the exclusion is
   * never silent. A separate read for the same reason
   * orphanedApprovals is — the financial reads' shapes are pinned by
   * strict deep-equality across the certification suites.
   */
  orphanedFinancialRows(projectId, tenantId = this.#store.defaultTenantId) {
    this.#requireProject(projectId, tenantId);
    const payments = this.listPayments(projectId, tenantId).filter(payment => !this.isGovernedPayment(payment, tenantId));
    const reconciliations = this.listReconciliations(projectId, tenantId).filter(record => !this.isGovernedReconciliation(record, tenantId));
    return {
      projectId,
      orphanedPayments: payments.length,
      paymentIds: payments.map(payment => payment.id),
      orphanedReconciliations: reconciliations.length,
      reconciliationIds: reconciliations.map(record => record.id),
    };
  }

  listDecisions(drawId, tenantId = this.#store.defaultTenantId) {
    return this.#db.prepare("SELECT * FROM draw_decisions WHERE draw_id = ? AND tenant_id = ? ORDER BY created_at, rowid").all(drawId, tenantId)
      .map(row => ({ id: row.id, tenantId: row.tenant_id, projectId: row.project_id, drawId: row.draw_id, actor: row.actor, decision: row.decision, approvedAmount: row.approved_amount, rationale: row.rationale, reversesDecisionId: row.reverses_decision_id, createdAt: row.created_at }));
  }

  listAllocations(drawId, tenantId = this.#store.defaultTenantId) {
    return this.#db.prepare("SELECT * FROM draw_allocations WHERE draw_id = ? AND tenant_id = ? ORDER BY created_at, rowid").all(drawId, tenantId)
      .map(row => ({ id: row.id, drawId: row.draw_id, decisionId: row.decision_id, invoiceId: row.invoice_id, amount: row.amount, reversesAllocationId: row.reverses_allocation_id, createdAt: row.created_at }));
  }

  // --- payments (recording only — never a disbursement) --------------------

  #paymentFromRow(row) {
    if (!row) return null;
    return {
      id: row.id, tenantId: row.tenant_id, projectId: row.project_id, drawId: row.draw_id,
      amount: row.amount, paymentRef: row.payment_ref, method: row.method,
      recordedBy: row.recorded_by, paidAt: row.paid_at, idempotencyKey: row.idempotency_key,
      createdAt: row.created_at,
    };
  }

  getPayment(paymentId, tenantId = this.#store.defaultTenantId) {
    return this.#paymentFromRow(this.#db.prepare("SELECT * FROM payments WHERE id = ? AND tenant_id = ?").get(paymentId, tenantId));
  }

  listPayments(projectId, tenantId = this.#store.defaultTenantId) {
    return this.#db.prepare("SELECT * FROM payments WHERE project_id = ? AND tenant_id = ? ORDER BY created_at, id").all(projectId, tenantId).map(row => this.#paymentFromRow(row));
  }

  /**
   * Record a payment that happened outside this system. This method
   * writes a record and nothing else — no disbursement is initiated,
   * here or anywhere in this module.
   */
  recordPayment({ tenantId = this.#store.defaultTenantId, projectId, actor, drawId, amount, paymentRef, method = null, paidAt = null, idempotencyKey = null }) {
    this.#requireProject(projectId, tenantId);
    if (idempotencyKey != null) {
      const prior = this.#db.prepare("SELECT * FROM payments WHERE tenant_id = ? AND project_id = ? AND idempotency_key = ?").get(tenantId, projectId, idempotencyKey);
      if (prior) return { payment: this.#paymentFromRow(prior), duplicate: true };
    }
    if (!String(paymentRef || "").trim()) throw new Error("payment_ref_required");
    const clash = this.#db.prepare("SELECT id FROM payments WHERE tenant_id = ? AND payment_ref = ?").get(tenantId, String(paymentRef).trim());
    if (clash) throw new Error("duplicate_payment_ref");
    const draw = this.getDraw(drawId, tenantId);
    if (!draw || draw.projectId !== projectId) throw new Error("draw_not_found");
    if (this.#governedApprovedAmount(draw, tenantId) <= 0) throw new Error("draw_not_approved");
    const value = strictCents(amount);
    if (!(value > 0)) throw new Error("invalid_amount");
    const paidRow = this.#db.prepare("SELECT COALESCE(SUM(amount), 0) AS total FROM payments WHERE draw_id = ?").get(drawId);
    if (cents(cents(paidRow.total) + value) > draw.approvedAmount) throw new Error("payment_exceeds_approved");
    const payment = {
      id: randomUUID(), tenantId, projectId, drawId, amount: value,
      paymentRef: String(paymentRef).trim(), method, recordedBy: actor,
      paidAt: paidAt || isoNow(), idempotencyKey, createdAt: isoNow(),
    };
    this.#tx(() => {
      try {
        this.#db.prepare("INSERT INTO payments (id, tenant_id, project_id, draw_id, amount, payment_ref, method, recorded_by, paid_at, idempotency_key, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
          .run(payment.id, tenantId, projectId, drawId, value, payment.paymentRef, method, actor, payment.paidAt, idempotencyKey, payment.createdAt);
      } catch (error) {
        if (/UNIQUE constraint failed: payments\.tenant_id, payments\.payment_ref/.test(error.message)) throw new Error("duplicate_payment_ref");
        throw error;
      }
      this.#recordEvent(tenantId, projectId, { eventType: "payment_recorded", actor, entityType: "payment", entityId: payment.id, detail: { drawId, amount: value, paymentRef: payment.paymentRef } });
    });
    return { payment: structuredClone(payment), duplicate: false };
  }

  // --- reconciliation (caller-reported, never bank-verified) ---------------

  /**
   * Attach a caller-supplied bank record to a payment. The record is
   * stored verbatim, labeled caller_reported; bank_verified is pinned
   * false by schema and no code path in this module sets it. A caller
   * amount that disagrees with the payment is stored as a mismatch
   * with both amounts — never forced equal.
   */
  recordReconciliation({ tenantId = this.#store.defaultTenantId, projectId, actor, paymentId, bankRecord }) {
    this.#requireProject(projectId, tenantId);
    const payment = this.getPayment(paymentId, tenantId);
    if (!payment || payment.projectId !== projectId) throw new Error("payment_not_found");
    if (!bankRecord || typeof bankRecord !== "object" || Array.isArray(bankRecord)) throw new Error("invalid_bank_record");
    const callerAmount = strictCents(bankRecord.amount);
    const state = callerAmount === payment.amount ? "reconciled" : "mismatch";
    const record = {
      id: randomUUID(), tenantId, projectId, paymentId, callerRecord: structuredClone(bankRecord),
      callerAmount, paymentAmount: payment.amount, state,
      source: "caller_reported", bankVerified: false, recordedBy: actor, createdAt: isoNow(),
    };
    this.#tx(() => {
      this.#db.prepare("INSERT INTO reconciliations (id, tenant_id, project_id, payment_id, caller_record_json, caller_amount, payment_amount, state, source, bank_verified, recorded_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'caller_reported', 0, ?, ?)")
        .run(record.id, tenantId, projectId, paymentId, JSON.stringify(bankRecord), callerAmount, payment.amount, state, actor, record.createdAt);
      this.#recordEvent(tenantId, projectId, { eventType: "reconciliation_recorded", actor, entityType: "payment", entityId: paymentId, detail: { reconciliationId: record.id, state, callerAmount, paymentAmount: payment.amount, source: "caller_reported", bankVerified: false } });
    });
    return structuredClone(record);
  }

  listReconciliations(projectId, tenantId = this.#store.defaultTenantId) {
    return this.#db.prepare("SELECT * FROM reconciliations WHERE project_id = ? AND tenant_id = ? ORDER BY created_at, id").all(projectId, tenantId)
      .map(row => ({
        id: row.id, tenantId: row.tenant_id, projectId: row.project_id, paymentId: row.payment_id,
        callerRecord: JSON.parse(row.caller_record_json), callerAmount: row.caller_amount,
        paymentAmount: row.payment_amount, state: row.state, source: row.source,
        bankVerified: row.bank_verified === 1, recordedBy: row.recorded_by, createdAt: row.created_at,
      }));
  }

  // --- distinct financial states (never conflated) --------------------------

  getDrawFinancials(drawId, tenantId = this.#store.defaultTenantId) {
    const draw = this.getDraw(drawId, tenantId);
    if (!draw) return null;
    const allocated = cents(this.#db.prepare("SELECT COALESCE(SUM(amount), 0) AS total FROM draw_allocations WHERE draw_id = ?").get(drawId).total);
    // Paid and reconciled are GOVERNED sums (U5R, finding M-1): only
    // audit-corroborated payments count, and a payment counts as
    // reconciled only behind a corroborated 'reconciled'
    // reconciliation — a row written by direct ledger registration
    // moves neither sum (see orphanedFinancialRows).
    const drawPayments = this.#governedPayments(draw.projectId, tenantId).filter(payment => payment.drawId === drawId);
    const paid = cents(drawPayments.reduce((sum, payment) => sum + payment.amount, 0));
    const reconciledIds = this.#governedReconciledPaymentIds(draw.projectId, tenantId);
    const reconciled = cents(drawPayments.filter(payment => reconciledIds.has(payment.id)).reduce((sum, payment) => sum + payment.amount, 0));
    const approved = this.#governedApprovedAmount(draw, tenantId);
    return { drawId, approved, allocated, paid, reconciled, outstanding: cents(approved - paid) };
  }

  getProjectFinancials(projectId, tenantId = this.#store.defaultTenantId) {
    this.#requireProject(projectId, tenantId);
    // Approved and allocated are GOVERNED sums (U4R, defect U4-1):
    // only draws whose approval the append-only decision ledger
    // corroborates contribute, so a status column or allocation row
    // written outside the governed path cannot move money into them.
    // The count of excluded orphaned approvals is surfaced separately
    // by orphanedApprovals() — this read's shape is pinned by strict
    // deep-equality across the certification suites. Paid and
    // reconciled are governed sums too (U5R, finding M-1): only
    // audit-corroborated payments and reconciliations contribute,
    // and excluded rows are surfaced by orphanedFinancialRows().
    const governedDrawIds = new Set();
    let approvedTotal = 0;
    for (const draw of this.listDraws(projectId, tenantId)) {
      const amount = this.#governedApprovedAmount(draw, tenantId);
      if (amount > 0) { approvedTotal = cents(approvedTotal + amount); governedDrawIds.add(draw.id); }
    }
    const approved = approvedTotal;
    const allocated = governedDrawIds.size === 0
      ? 0
      : cents(this.#db.prepare(`SELECT COALESCE(SUM(amount), 0) AS total FROM draw_allocations WHERE project_id = ? AND tenant_id = ? AND draw_id IN (${[...governedDrawIds].map(() => "?").join(", ")})`).get(projectId, tenantId, ...governedDrawIds).total);
    const paid = this.#projectPaid(projectId, tenantId);
    const reconciledIds = this.#governedReconciledPaymentIds(projectId, tenantId);
    const reconciled = cents(this.#governedPayments(projectId, tenantId).filter(payment => reconciledIds.has(payment.id)).reduce((sum, payment) => sum + payment.amount, 0));
    return { projectId, approved, allocated, paid, reconciled };
  }
}
