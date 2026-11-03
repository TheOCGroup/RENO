import { createHash, randomUUID } from "node:crypto";
import { MissionControlFinance } from "./financialGovernance.mjs";

/**
 * Mission Control operations completion (U2) — the capabilities the
 * prior audit found ABSENT or PARTIAL, layered over MissionControlStore
 * as relational tables (schema v4) in the store's own discipline:
 * tenant_id on every row and a tenant filter on every query,
 * transactions around multi-writes, mutations recorded into the
 * store's append-only events stream in the same transaction, and
 * version columns with optimistic-lock checks on the mutable entities.
 *
 * This layer COMPOSES the existing domain and governance; it edits and
 * reimplements neither. Budget summaries and risk findings come from
 * restored RenovationWorkflow / RenovationOperations instances; draw,
 * invoice, payment and reconciliation figures come from
 * MissionControlFinance (U1b). The domain classes are never modified —
 * the inspection completion gate, for example, is enforced here as a
 * pre-check in front of the domain's punch -> complete transition.
 *
 * Truthful statuses throughout: jurisdictions, inspectors, permits and
 * contacts are recorded strings, never verified facts. A permit with
 * no evidence ref is labeled `unverified` in every read model. There
 * is no external lookup, no disbursement, and no bank verification
 * anywhere in this module.
 */

const isoNow = () => new Date().toISOString();

/** Reporting convention for projectHealth: days an approved draw may
 *  remain unpaid before it is surfaced as beyond terms. A rule defined
 *  from the draw's own data — not a lender fact. */
export const DRAW_PAYMENT_TERMS_DAYS = 14;

export const INSPECTION_STATUSES = Object.freeze(["scheduled", "passed", "corrections_required", "corrections_complete", "cancelled"]);
export const PERMIT_STATUSES = Object.freeze(["recorded", "applied", "issued", "expired", "closed", "unknown"]);
export const MATERIAL_STATUSES = Object.freeze(["planned", "ordered", "received", "returned"]);
export const TASK_STATUSES = Object.freeze(["open", "in_progress", "done", "blocked"]);

const MATERIAL_TRANSITIONS = Object.freeze({
  planned: Object.freeze(["ordered", "returned"]),
  ordered: Object.freeze(["received", "returned"]),
  received: Object.freeze(["returned"]),
  returned: Object.freeze([]),
});

function cents(value) {
  const result = Number(value);
  if (!Number.isFinite(result)) throw new Error("invalid_amount");
  return Math.round(result * 100) / 100;
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

function requireText(value, code) {
  if (!String(value || "").trim()) throw new Error(code);
  return String(value).trim();
}

function requireActor(actor) {
  return requireText(actor, "actor_id_required");
}

/** Validate a recorded date/datetime string; the string is stored as
 *  recorded (never reformatted into a fact it is not). */
function requireDate(value, code = "invalid_date") {
  if (value == null || Number.isNaN(new Date(value).getTime())) throw new Error(code);
  return String(value);
}

function optionalDate(value) {
  if (value == null) return null;
  return requireDate(value);
}

function dateKey(value) {
  return String(value).slice(0, 10);
}

/** Compliance status derivation: no recorded expiry -> unknown (never
 *  assumed valid); expiry before the as-of date -> expired; otherwise
 *  valid (a document expiring ON the as-of date is still valid). */
export function deriveComplianceStatus(expiresOn, asOf = isoNow()) {
  if (!expiresOn) return "unknown";
  return dateKey(expiresOn) < dateKey(asOf) ? "expired" : "valid";
}

export class MissionControlOperationsCompletion {
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

  /** Append to the store's append-only events stream, same discipline
   *  as U1b: COUNT-based seq inside the caller's transaction. */
  #streamEvent(tenantId, projectId, { type, actor = null, detail = null }) {
    const row = this.#db.prepare("SELECT COUNT(*) AS c FROM events WHERE project_id = ? AND stream = 'operations'").get(projectId);
    this.#db.prepare("INSERT INTO events (tenant_id, project_id, stream, seq, id, type, actor, detail_json, occurred_at) VALUES (?, ?, 'operations', ?, ?, ?, ?, ?, ?)")
      .run(tenantId, projectId, row.c + 1, randomUUID(), type, actor, detail === null ? null : JSON.stringify(detail), isoNow());
  }

  // --- inspections ---------------------------------------------------------

  #inspectionFromRow(row) {
    if (!row) return null;
    const corrections = this.#db.prepare("SELECT * FROM inspection_corrections WHERE inspection_id = ? AND tenant_id = ? ORDER BY created_at, rowid").all(row.id, row.tenant_id)
      .map(c => ({
        id: c.id, inspectionId: c.inspection_id, description: c.description, status: c.status,
        evidenceRef: c.evidence_ref, completedBy: c.completed_by, completedAt: c.completed_at, createdAt: c.created_at,
      }));
    return {
      id: row.id, tenantId: row.tenant_id, projectId: row.project_id, type: row.type,
      scheduledFor: row.scheduled_for, inspectorRef: row.inspector_ref, status: row.status,
      outcome: row.outcome, outcomeEvidenceRef: row.outcome_evidence_ref,
      outcomeRecordedBy: row.outcome_recorded_by, outcomeAt: row.outcome_at,
      supersedesId: row.supersedes_id, version: row.version, createdBy: row.created_by,
      createdAt: row.created_at, updatedAt: row.updated_at, corrections,
    };
  }

  #inspectionRow(inspectionId, tenantId, projectId) {
    const row = this.#db.prepare("SELECT * FROM inspections WHERE id = ? AND tenant_id = ?").get(inspectionId, tenantId);
    if (!row || (projectId != null && row.project_id !== projectId)) throw new Error("inspection_not_found");
    return row;
  }

  /**
   * Schedule an inspection. `inspectorRef` is the inspector's identity
   * AS RECORDED by the caller — it is stored verbatim and never
   * presented as verified. A re-inspection is scheduled with
   * `supersedesId` and is only accepted once the superseded
   * inspection's correction cycle is complete.
   */
  scheduleInspection({ tenantId = this.#store.defaultTenantId, projectId, actor, type, scheduledFor, inspectorRef, supersedesId = null }) {
    this.#requireProject(projectId, tenantId);
    requireActor(actor);
    const cleanType = requireText(type, "inspection_type_required");
    const cleanInspector = requireText(inspectorRef, "inspector_ref_required");
    const when = requireDate(scheduledFor);
    if (supersedesId != null) {
      const prior = this.#inspectionRow(supersedesId, tenantId, projectId);
      if (prior.status !== "corrections_complete") throw new Error("reinspection_not_ready");
    }
    const inspection = {
      id: randomUUID(), tenantId, projectId, type: cleanType, scheduledFor: when,
      inspectorRef: cleanInspector, status: "scheduled", outcome: null,
      outcomeEvidenceRef: null, outcomeRecordedBy: null, outcomeAt: null,
      supersedesId, version: 1, createdBy: actor, createdAt: isoNow(), updatedAt: isoNow(),
    };
    this.#tx(() => {
      this.#db.prepare("INSERT INTO inspections (id, tenant_id, project_id, type, scheduled_for, inspector_ref, status, outcome, outcome_evidence_ref, outcome_recorded_by, outcome_at, supersedes_id, version, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'scheduled', NULL, NULL, NULL, NULL, ?, 1, ?, ?, ?)")
        .run(inspection.id, tenantId, projectId, cleanType, when, cleanInspector, supersedesId, actor, inspection.createdAt, inspection.updatedAt);
      this.#streamEvent(tenantId, projectId, { type: "inspection_scheduled", actor, detail: { entityType: "inspection", entityId: inspection.id, inspectionType: cleanType, supersedesId } });
    });
    return this.getInspection(inspection.id, tenantId);
  }

  /**
   * Record the outcome of a scheduled inspection. `passed` requires an
   * evidence ref. `failed` requires a non-empty list of correction
   * items and moves the inspection to `corrections_required`.
   */
  recordInspectionOutcome({ tenantId = this.#store.defaultTenantId, projectId, actor, inspectionId, outcome, evidenceRef = null, correctionItems = null, expectedVersion = null }) {
    this.#requireProject(projectId, tenantId);
    requireActor(actor);
    const row = this.#inspectionRow(inspectionId, tenantId, projectId);
    if (row.status !== "scheduled") throw new Error("inspection_not_scheduled");
    if (expectedVersion != null && expectedVersion !== row.version) throw new Error("version_conflict");
    if (!["passed", "failed"].includes(outcome)) throw new Error("invalid_inspection_outcome");
    let items = [];
    if (outcome === "passed") {
      if (!String(evidenceRef || "").trim()) throw new Error("inspection_evidence_required");
    } else {
      items = (Array.isArray(correctionItems) ? correctionItems : []).map(item => String(item || "").trim()).filter(Boolean);
      if (items.length === 0) throw new Error("correction_items_required");
    }
    const now = isoNow();
    this.#tx(() => {
      const status = outcome === "passed" ? "passed" : "corrections_required";
      this.#db.prepare("UPDATE inspections SET status = ?, outcome = ?, outcome_evidence_ref = ?, outcome_recorded_by = ?, outcome_at = ?, version = version + 1, updated_at = ? WHERE id = ? AND tenant_id = ?")
        .run(status, outcome, evidenceRef ? String(evidenceRef) : null, actor, now, now, inspectionId, tenantId);
      for (const description of items) {
        this.#db.prepare("INSERT INTO inspection_corrections (id, tenant_id, project_id, inspection_id, description, status, created_at) VALUES (?, ?, ?, ?, ?, 'open', ?)")
          .run(randomUUID(), tenantId, projectId, inspectionId, description, now);
      }
      this.#streamEvent(tenantId, projectId, { type: "inspection_outcome_recorded", actor, detail: { entityType: "inspection", entityId: inspectionId, outcome, correctionCount: items.length } });
    });
    return this.getInspection(inspectionId, tenantId);
  }

  /**
   * Complete one correction item, with evidence. When the last open
   * item completes, the inspection leaves `corrections_required` for
   * `corrections_complete` — its failed outcome stays on the record.
   */
  completeCorrectionItem({ tenantId = this.#store.defaultTenantId, projectId, actor, correctionId, evidenceRef }) {
    this.#requireProject(projectId, tenantId);
    requireActor(actor);
    const correction = this.#db.prepare("SELECT * FROM inspection_corrections WHERE id = ? AND tenant_id = ? AND project_id = ?").get(correctionId, tenantId, projectId);
    if (!correction) throw new Error("correction_not_found");
    if (correction.status === "complete") throw new Error("correction_already_complete");
    if (!String(evidenceRef || "").trim()) throw new Error("correction_evidence_required");
    const now = isoNow();
    let remainingOpen = 0;
    this.#tx(() => {
      this.#db.prepare("UPDATE inspection_corrections SET status = 'complete', evidence_ref = ?, completed_by = ?, completed_at = ? WHERE id = ? AND tenant_id = ?")
        .run(String(evidenceRef), actor, now, correctionId, tenantId);
      const open = this.#db.prepare("SELECT COUNT(*) AS c FROM inspection_corrections WHERE inspection_id = ? AND status = 'open'").get(correction.inspection_id);
      remainingOpen = open.c;
      if (remainingOpen === 0) {
        this.#db.prepare("UPDATE inspections SET status = 'corrections_complete', version = version + 1, updated_at = ? WHERE id = ? AND tenant_id = ? AND status = 'corrections_required'")
          .run(now, correction.inspection_id, tenantId);
      }
      this.#streamEvent(tenantId, projectId, { type: "inspection_correction_completed", actor, detail: { entityType: "inspection", entityId: correction.inspection_id, correctionId, remainingOpen } });
    });
    return this.getInspection(correction.inspection_id, tenantId);
  }

  cancelInspection({ tenantId = this.#store.defaultTenantId, projectId, actor, inspectionId, expectedVersion = null }) {
    this.#requireProject(projectId, tenantId);
    requireActor(actor);
    const row = this.#inspectionRow(inspectionId, tenantId, projectId);
    if (row.status !== "scheduled") throw new Error("inspection_not_cancellable");
    if (expectedVersion != null && expectedVersion !== row.version) throw new Error("version_conflict");
    this.#tx(() => {
      this.#db.prepare("UPDATE inspections SET status = 'cancelled', version = version + 1, updated_at = ? WHERE id = ? AND tenant_id = ?").run(isoNow(), inspectionId, tenantId);
      this.#streamEvent(tenantId, projectId, { type: "inspection_cancelled", actor, detail: { entityType: "inspection", entityId: inspectionId } });
    });
    return this.getInspection(inspectionId, tenantId);
  }

  getInspection(inspectionId, tenantId = this.#store.defaultTenantId) {
    const row = this.#db.prepare("SELECT * FROM inspections WHERE id = ? AND tenant_id = ?").get(inspectionId, tenantId);
    return this.#inspectionFromRow(row);
  }

  listInspections(projectId, tenantId = this.#store.defaultTenantId) {
    return this.#db.prepare("SELECT * FROM inspections WHERE project_id = ? AND tenant_id = ? ORDER BY created_at, id").all(projectId, tenantId)
      .map(row => this.#inspectionFromRow(row));
  }

  /**
   * The completion gate: a project may not complete while any
   * inspection is in `corrections_required`. Returns true when clear.
   */
  assertInspectionsClear(projectId, tenantId = this.#store.defaultTenantId) {
    this.#requireProject(projectId, tenantId);
    const row = this.#db.prepare("SELECT COUNT(*) AS c FROM inspections WHERE project_id = ? AND tenant_id = ? AND status = 'corrections_required'").get(projectId, tenantId);
    if (row.c > 0) throw new Error("inspections_not_clear");
    return true;
  }

  /**
   * The operations completion service: the domain's punch -> complete
   * transition, pre-checked against the inspection gate in this layer.
   * The domain class itself is not edited; its own rules (punch-list
   * stage, all punch items terminal, completion evidence) still apply.
   */
  completeProject({ tenantId = this.#store.defaultTenantId, projectId, actor, finalSpend, completionEvidenceRef }) {
    this.#requireProject(projectId, tenantId);
    this.assertInspectionsClear(projectId, tenantId);
    const workflow = this.#store.restoreWorkflow(projectId, { tenantId });
    if (!workflow) throw new Error("project_not_found");
    workflow.completeProject({ actor, finalSpend, completionEvidenceRef });
    this.#store.persistWorkflow(workflow, { tenantId });
    return workflow.snapshot();
  }

  // --- permits (recorded facts only — nothing here verifies anything) -----

  #permitFromRow(row) {
    if (!row) return null;
    return {
      id: row.id, tenantId: row.tenant_id, projectId: row.project_id,
      jurisdiction: row.jurisdiction, permitNumber: row.permit_number, type: row.type,
      status: row.status, issuedOn: row.issued_on, expiresOn: row.expires_on,
      evidenceRef: row.evidence_ref,
      // No external lookup exists: a permit without attached evidence
      // is unverified, and is labeled so in every read model.
      verification: row.evidence_ref ? "evidence_recorded" : "unverified",
      version: row.version, createdBy: row.created_by, createdAt: row.created_at, updatedAt: row.updated_at,
    };
  }

  recordPermit({ tenantId = this.#store.defaultTenantId, projectId, actor, jurisdiction, permitNumber, type, status = "recorded", issuedOn = null, expiresOn = null, evidenceRef = null }) {
    this.#requireProject(projectId, tenantId);
    requireActor(actor);
    const cleanJurisdiction = requireText(jurisdiction, "permit_jurisdiction_required");
    const cleanNumber = requireText(permitNumber, "permit_number_required");
    const cleanType = requireText(type, "permit_type_required");
    if (!PERMIT_STATUSES.includes(status)) throw new Error("invalid_permit_status");
    const permit = {
      id: randomUUID(), tenantId, projectId, jurisdiction: cleanJurisdiction,
      permitNumber: cleanNumber, type: cleanType, status,
      issuedOn: optionalDate(issuedOn), expiresOn: optionalDate(expiresOn),
      evidenceRef: evidenceRef ? String(evidenceRef) : null,
      version: 1, createdBy: actor, createdAt: isoNow(), updatedAt: isoNow(),
    };
    this.#tx(() => {
      this.#db.prepare("INSERT INTO permits (id, tenant_id, project_id, jurisdiction, permit_number, type, status, issued_on, expires_on, evidence_ref, version, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)")
        .run(permit.id, tenantId, projectId, cleanJurisdiction, cleanNumber, cleanType, status, permit.issuedOn, permit.expiresOn, permit.evidenceRef, actor, permit.createdAt, permit.updatedAt);
      this.#streamEvent(tenantId, projectId, { type: "permit_recorded", actor, detail: { entityType: "permit", entityId: permit.id, permitNumber: cleanNumber, status } });
    });
    return this.getPermit(permit.id, tenantId);
  }

  /** Status transitions are recorded facts: actor + timestamp land in
   *  the events stream with the from/to statuses. */
  transitionPermitStatus({ tenantId = this.#store.defaultTenantId, projectId, actor, permitId, status, evidenceRef }) {
    this.#requireProject(projectId, tenantId);
    requireActor(actor);
    if (!PERMIT_STATUSES.includes(status)) throw new Error("invalid_permit_status");
    const row = this.#db.prepare("SELECT * FROM permits WHERE id = ? AND tenant_id = ? AND project_id = ?").get(permitId, tenantId, projectId);
    if (!row) throw new Error("permit_not_found");
    this.#tx(() => {
      if (evidenceRef !== undefined) {
        this.#db.prepare("UPDATE permits SET status = ?, evidence_ref = ?, version = version + 1, updated_at = ? WHERE id = ? AND tenant_id = ?")
          .run(status, evidenceRef ? String(evidenceRef) : null, isoNow(), permitId, tenantId);
      } else {
        this.#db.prepare("UPDATE permits SET status = ?, version = version + 1, updated_at = ? WHERE id = ? AND tenant_id = ?")
          .run(status, isoNow(), permitId, tenantId);
      }
      this.#streamEvent(tenantId, projectId, { type: "permit_status_changed", actor, detail: { entityType: "permit", entityId: permitId, fromStatus: row.status, toStatus: status } });
    });
    return this.getPermit(permitId, tenantId);
  }

  getPermit(permitId, tenantId = this.#store.defaultTenantId) {
    return this.#permitFromRow(this.#db.prepare("SELECT * FROM permits WHERE id = ? AND tenant_id = ?").get(permitId, tenantId));
  }

  listPermits(projectId, tenantId = this.#store.defaultTenantId) {
    return this.#db.prepare("SELECT * FROM permits WHERE project_id = ? AND tenant_id = ? ORDER BY created_at, id").all(projectId, tenantId).map(row => this.#permitFromRow(row));
  }

  // --- materials -------------------------------------------------------------

  #materialFromRow(row) {
    if (!row) return null;
    return {
      id: row.id, tenantId: row.tenant_id, projectId: row.project_id,
      scopeItemId: row.scope_item_id, description: row.description,
      quantity: row.quantity, unit: row.unit, unitCost: row.unit_cost,
      status: row.status, evidenceRef: row.evidence_ref,
      createdBy: row.created_by, createdAt: row.created_at, updatedAt: row.updated_at,
    };
  }

  recordMaterial({ tenantId = this.#store.defaultTenantId, projectId, actor, scopeItemId = null, description, quantity, unit, unitCost = null, status = "planned", evidenceRef = null }) {
    this.#requireProject(projectId, tenantId);
    requireActor(actor);
    const cleanDescription = requireText(description, "material_description_required");
    const cleanUnit = requireText(unit, "material_unit_required");
    const qty = Number(quantity);
    if (!Number.isFinite(qty) || !(qty > 0)) throw new Error("invalid_quantity");
    let cost = null;
    if (unitCost != null) {
      if (!Number.isFinite(Number(unitCost)) || Number(unitCost) < 0) throw new Error("invalid_unit_cost");
      cost = cents(unitCost);
    }
    if (!MATERIAL_STATUSES.includes(status)) throw new Error("invalid_material_status");
    if (status === "received" && !String(evidenceRef || "").trim()) throw new Error("material_evidence_required");
    if (scopeItemId != null) {
      const workflowState = this.#store.loadWorkflowState(projectId, tenantId);
      const scopeIds = new Set((workflowState?.state.scopeItems || []).map(item => item.id));
      if (!scopeIds.has(scopeItemId)) throw new Error("scope_item_not_found");
    }
    const material = {
      id: randomUUID(), tenantId, projectId, scopeItemId, description: cleanDescription,
      quantity: qty, unit: cleanUnit, unitCost: cost, status,
      evidenceRef: evidenceRef ? String(evidenceRef) : null,
      createdBy: actor, createdAt: isoNow(), updatedAt: isoNow(),
    };
    this.#tx(() => {
      this.#db.prepare("INSERT INTO materials (id, tenant_id, project_id, scope_item_id, description, quantity, unit, unit_cost, status, evidence_ref, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .run(material.id, tenantId, projectId, scopeItemId, cleanDescription, qty, cleanUnit, cost, status, material.evidenceRef, actor, material.createdAt, material.updatedAt);
      this.#streamEvent(tenantId, projectId, { type: "material_recorded", actor, detail: { entityType: "material", entityId: material.id, status } });
    });
    return this.getMaterial(material.id, tenantId);
  }

  transitionMaterial({ tenantId = this.#store.defaultTenantId, projectId, actor, materialId, status, evidenceRef = null }) {
    this.#requireProject(projectId, tenantId);
    requireActor(actor);
    const row = this.#db.prepare("SELECT * FROM materials WHERE id = ? AND tenant_id = ? AND project_id = ?").get(materialId, tenantId, projectId);
    if (!row) throw new Error("material_not_found");
    if (!MATERIAL_STATUSES.includes(status) || !MATERIAL_TRANSITIONS[row.status].includes(status)) throw new Error("invalid_material_transition");
    const evidence = evidenceRef ? String(evidenceRef) : row.evidence_ref;
    if (status === "received" && !evidence) throw new Error("material_evidence_required");
    this.#tx(() => {
      this.#db.prepare("UPDATE materials SET status = ?, evidence_ref = ?, updated_at = ? WHERE id = ? AND tenant_id = ?")
        .run(status, evidence, isoNow(), materialId, tenantId);
      this.#streamEvent(tenantId, projectId, { type: "material_status_changed", actor, detail: { entityType: "material", entityId: materialId, fromStatus: row.status, toStatus: status } });
    });
    return this.getMaterial(materialId, tenantId);
  }

  getMaterial(materialId, tenantId = this.#store.defaultTenantId) {
    return this.#materialFromRow(this.#db.prepare("SELECT * FROM materials WHERE id = ? AND tenant_id = ?").get(materialId, tenantId));
  }

  listMaterials(projectId, tenantId = this.#store.defaultTenantId) {
    return this.#db.prepare("SELECT * FROM materials WHERE project_id = ? AND tenant_id = ? ORDER BY created_at, id").all(projectId, tenantId).map(row => this.#materialFromRow(row));
  }

  /**
   * Materials rollup. Priced total = sum of quantity x unitCost over
   * lines that carry a cost and are not returned. Lines without a cost
   * are excluded from the total and counted as `unpriced` — never
   * silently zero-filled; returned lines are counted separately.
   */
  materialsSummary(projectId, tenantId = this.#store.defaultTenantId) {
    this.#requireProject(projectId, tenantId);
    const lines = this.listMaterials(projectId, tenantId);
    let pricedTotal = 0;
    let unpricedCount = 0;
    let returnedCount = 0;
    for (const line of lines) {
      if (line.status === "returned") { returnedCount++; continue; }
      if (line.unitCost == null) { unpricedCount++; continue; }
      pricedTotal += line.quantity * line.unitCost;
    }
    return { projectId, pricedTotal: cents(pricedTotal), unpricedCount, returnedCount, lineCount: lines.length };
  }

  // --- schedule tasks with dependencies --------------------------------------

  #taskFromRow(row) {
    if (!row) return null;
    return {
      id: row.id, tenantId: row.tenant_id, projectId: row.project_id, title: row.title,
      stage: row.stage, startsOn: row.starts_on, dueOn: row.due_on,
      dependsOn: JSON.parse(row.depends_on_json), status: row.status, version: row.version,
      completedAt: row.completed_at, createdBy: row.created_by,
      createdAt: row.created_at, updatedAt: row.updated_at,
    };
  }

  #taskRow(taskId, tenantId, projectId) {
    const row = this.#db.prepare("SELECT * FROM schedule_tasks WHERE id = ? AND tenant_id = ?").get(taskId, tenantId);
    if (!row || (projectId != null && row.project_id !== projectId)) throw new Error("task_not_found");
    return row;
  }

  #validateDependencies(projectId, tenantId, dependsOn) {
    const deps = [...new Set(Array.isArray(dependsOn) ? dependsOn.filter(Boolean) : [])];
    for (const depId of deps) {
      const dep = this.#db.prepare("SELECT id FROM schedule_tasks WHERE id = ? AND tenant_id = ? AND project_id = ?").get(depId, tenantId, projectId);
      if (!dep) throw new Error("task_dependency_not_found");
    }
    return deps;
  }

  /** Reject any dependency assignment that closes a cycle: following
   *  dependsOn edges from the proposed dependencies must never reach
   *  the task itself. */
  #assertAcyclic(projectId, tenantId, taskId, dependsOn) {
    const byId = new Map(this.listTasks(projectId, tenantId).map(task => [task.id, task]));
    const visited = new Set();
    const stack = [...dependsOn];
    while (stack.length) {
      const current = stack.pop();
      if (current === taskId) throw new Error("dependency_cycle");
      if (visited.has(current)) continue;
      visited.add(current);
      const task = byId.get(current);
      if (task) stack.push(...task.dependsOn);
    }
  }

  createTask({ tenantId = this.#store.defaultTenantId, projectId, actor, title, stage = null, startsOn, dueOn, dependsOn = [] }) {
    this.#requireProject(projectId, tenantId);
    requireActor(actor);
    const cleanTitle = requireText(title, "task_title_required");
    const start = requireDate(startsOn);
    const due = requireDate(dueOn);
    if (new Date(due).getTime() < new Date(start).getTime()) throw new Error("invalid_task_window");
    const deps = this.#validateDependencies(projectId, tenantId, dependsOn);
    const task = {
      id: randomUUID(), tenantId, projectId, title: cleanTitle, stage,
      startsOn: start, dueOn: due, dependsOn: deps, status: "open", version: 1,
      completedAt: null, createdBy: actor, createdAt: isoNow(), updatedAt: isoNow(),
    };
    this.#tx(() => {
      this.#db.prepare("INSERT INTO schedule_tasks (id, tenant_id, project_id, title, stage, starts_on, due_on, depends_on_json, status, version, completed_at, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', 1, NULL, ?, ?, ?)")
        .run(task.id, tenantId, projectId, cleanTitle, stage, start, due, JSON.stringify(deps), actor, task.createdAt, task.updatedAt);
      this.#streamEvent(tenantId, projectId, { type: "task_created", actor, detail: { entityType: "task", entityId: task.id, dependsOn: deps } });
    });
    return this.getTask(task.id, tenantId);
  }

  updateTaskDependencies({ tenantId = this.#store.defaultTenantId, projectId, actor, taskId, dependsOn, expectedVersion = null }) {
    this.#requireProject(projectId, tenantId);
    requireActor(actor);
    const row = this.#taskRow(taskId, tenantId, projectId);
    if (expectedVersion != null && expectedVersion !== row.version) throw new Error("version_conflict");
    const deps = this.#validateDependencies(projectId, tenantId, dependsOn);
    this.#assertAcyclic(projectId, tenantId, taskId, deps);
    this.#tx(() => {
      this.#db.prepare("UPDATE schedule_tasks SET depends_on_json = ?, version = version + 1, updated_at = ? WHERE id = ? AND tenant_id = ?")
        .run(JSON.stringify(deps), isoNow(), taskId, tenantId);
      this.#streamEvent(tenantId, projectId, { type: "task_dependencies_updated", actor, detail: { entityType: "task", entityId: taskId, dependsOn: deps } });
    });
    return this.getTask(taskId, tenantId);
  }

  /** A task cannot be done while any dependency is not done. */
  setTaskStatus({ tenantId = this.#store.defaultTenantId, projectId, actor, taskId, status, expectedVersion = null }) {
    this.#requireProject(projectId, tenantId);
    requireActor(actor);
    const row = this.#taskRow(taskId, tenantId, projectId);
    if (!TASK_STATUSES.includes(status)) throw new Error("invalid_task_status");
    if (expectedVersion != null && expectedVersion !== row.version) throw new Error("version_conflict");
    const task = this.#taskFromRow(row);
    if (status === "done") {
      for (const depId of task.dependsOn) {
        const dep = this.#db.prepare("SELECT status FROM schedule_tasks WHERE id = ? AND tenant_id = ?").get(depId, tenantId);
        if (!dep || dep.status !== "done") throw new Error("dependency_incomplete");
      }
    }
    const now = isoNow();
    this.#tx(() => {
      this.#db.prepare("UPDATE schedule_tasks SET status = ?, completed_at = ?, version = version + 1, updated_at = ? WHERE id = ? AND tenant_id = ?")
        .run(status, status === "done" ? now : null, now, taskId, tenantId);
      this.#streamEvent(tenantId, projectId, { type: "task_status_changed", actor, detail: { entityType: "task", entityId: taskId, fromStatus: task.status, toStatus: status } });
    });
    return this.getTask(taskId, tenantId);
  }

  getTask(taskId, tenantId = this.#store.defaultTenantId) {
    const row = this.#db.prepare("SELECT * FROM schedule_tasks WHERE id = ? AND tenant_id = ?").get(taskId, tenantId);
    return this.#taskFromRow(row);
  }

  listTasks(projectId, tenantId = this.#store.defaultTenantId) {
    return this.#db.prepare("SELECT * FROM schedule_tasks WHERE project_id = ? AND tenant_id = ? ORDER BY created_at, id").all(projectId, tenantId).map(row => this.#taskFromRow(row));
  }

  /**
   * Schedule health for a project at a point in time. `overdue` lists
   * not-done tasks past their due date; `blocked` lists tasks carrying
   * status `blocked` plus not-done tasks with an incomplete dependency
   * (the blocking dependency ids are named); `criticalChainLength` is
   * the longest dependency path in tasks, following dependsOn edges
   * through not-done tasks only (a done dependency ends the chain).
   */
  scheduleHealth(projectId, asOf = isoNow(), tenantId = this.#store.defaultTenantId) {
    this.#requireProject(projectId, tenantId);
    const asOfIso = requireDate(asOf);
    const asOfMs = new Date(asOfIso).getTime();
    const tasks = this.listTasks(projectId, tenantId);
    const byId = new Map(tasks.map(task => [task.id, task]));
    const open = tasks.filter(task => task.status !== "done");
    const overdue = open
      .filter(task => new Date(task.dueOn).getTime() < asOfMs)
      .map(task => ({ id: task.id, title: task.title, dueOn: task.dueOn, status: task.status }));
    const blocked = [];
    for (const task of open) {
      const incompleteDependencies = task.dependsOn.filter(depId => byId.get(depId)?.status !== "done");
      if (task.status === "blocked" || incompleteDependencies.length > 0) {
        blocked.push({ id: task.id, title: task.title, status: task.status, incompleteDependencies });
      }
    }
    const memo = new Map();
    const chainLength = (task, seen) => {
      if (memo.has(task.id)) return memo.get(task.id);
      if (seen.has(task.id)) return 0; // defensive; cycles are rejected at write time
      seen.add(task.id);
      let best = 0;
      for (const depId of task.dependsOn) {
        const dep = byId.get(depId);
        if (dep && dep.status !== "done") best = Math.max(best, chainLength(dep, seen));
      }
      seen.delete(task.id);
      const length = best + 1;
      memo.set(task.id, length);
      return length;
    };
    const criticalChainLength = open.reduce((max, task) => Math.max(max, chainLength(task, new Set())), 0);
    return {
      projectId, asOf: asOfIso, overdue, blocked, criticalChainLength,
      openCount: open.length, doneCount: tasks.length - open.length,
    };
  }

  // --- contractor directory (tenant-scoped reference data) -------------------

  #contractorFromRow(row, asOf) {
    if (!row) return null;
    const compliance = this.#db.prepare("SELECT * FROM contractor_compliance WHERE contractor_id = ? AND tenant_id = ? ORDER BY created_at, rowid").all(row.id, row.tenant_id)
      .map(doc => ({
        id: doc.id, contractorId: doc.contractor_id, kind: doc.kind, ref: doc.ref,
        expiresOn: doc.expires_on, status: deriveComplianceStatus(doc.expires_on, asOf),
        recordedBy: doc.recorded_by, createdAt: doc.created_at,
      }));
    return {
      id: row.id, tenantId: row.tenant_id, name: row.name,
      trades: JSON.parse(row.trades_json),
      contact: row.contact_json === null ? null : JSON.parse(row.contact_json),
      scorecardName: row.scorecard_name, compliance,
      createdBy: row.created_by, createdAt: row.created_at, updatedAt: row.updated_at,
    };
  }

  /**
   * Register a contractor in the tenant's directory. Contact details
   * and compliance refs are recorded as supplied — never verified.
   * `scorecardName` is the name RenovationOperations scorecards are
   * recorded under, so reads can join the two without altering the
   * scorecard code. (Directory rows are tenant-level reference data;
   * unlike project mutations they are not written to a project's
   * events stream — the rows themselves carry recorded_by/created_at.)
   */
  registerContractor({ tenantId = this.#store.defaultTenantId, actor, name, trades = [], contact = null, scorecardName = null }) {
    requireActor(actor);
    const cleanName = requireText(name, "contractor_name_required");
    this.#store.ensureTenant(tenantId);
    const contractor = {
      id: randomUUID(), tenantId, name: cleanName,
      trades: Array.isArray(trades) ? trades.filter(Boolean) : [],
      contact: contact ?? null, scorecardName: scorecardName ? String(scorecardName) : cleanName,
      createdBy: actor, createdAt: isoNow(), updatedAt: isoNow(),
    };
    try {
      this.#db.prepare("INSERT INTO contractors (id, tenant_id, name, trades_json, contact_json, scorecard_name, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .run(contractor.id, tenantId, cleanName, JSON.stringify(contractor.trades), contact === null ? null : JSON.stringify(contact), contractor.scorecardName, actor, contractor.createdAt, contractor.updatedAt);
    } catch (error) {
      if (/UNIQUE constraint failed/.test(error.message)) throw new Error("duplicate_contractor");
      throw error;
    }
    return this.getContractor(contractor.id, tenantId);
  }

  recordCompliance({ tenantId = this.#store.defaultTenantId, actor, contractorId, kind, ref, expiresOn = null }) {
    requireActor(actor);
    const contractor = this.#db.prepare("SELECT id FROM contractors WHERE id = ? AND tenant_id = ?").get(contractorId, tenantId);
    if (!contractor) throw new Error("contractor_not_found");
    const cleanKind = requireText(kind, "compliance_kind_required");
    const cleanRef = requireText(ref, "compliance_ref_required");
    const doc = {
      id: randomUUID(), tenantId, contractorId, kind: cleanKind, ref: cleanRef,
      expiresOn: optionalDate(expiresOn), recordedBy: actor, createdAt: isoNow(),
    };
    this.#db.prepare("INSERT INTO contractor_compliance (id, tenant_id, contractor_id, kind, ref, expires_on, recorded_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .run(doc.id, tenantId, contractorId, cleanKind, cleanRef, doc.expiresOn, actor, doc.createdAt);
    return this.getContractor(contractorId, tenantId);
  }

  getContractor(contractorId, tenantId = this.#store.defaultTenantId, asOf = isoNow()) {
    const row = this.#db.prepare("SELECT * FROM contractors WHERE id = ? AND tenant_id = ?").get(contractorId, tenantId);
    return this.#contractorFromRow(row, asOf);
  }

  listContractors(tenantId = this.#store.defaultTenantId, asOf = isoNow()) {
    return this.#db.prepare("SELECT * FROM contractors WHERE tenant_id = ? ORDER BY created_at, id").all(tenantId).map(row => this.#contractorFromRow(row, asOf));
  }
}

// --- operational intelligence -------------------------------------------------

const SEVERITY_RANK = Object.freeze({ critical: 4, high: 3, medium: 2, low: 1 });

/** Fixed action strings for the deterministic nextAction rule: the
 *  action of the highest-ranked finding (severity desc, kind asc). */
const NEXT_ACTION_BY_KIND = Object.freeze({
  budget_authority_exceeded: "Freeze new commitments — committed cost exceeds the approved budget authority.",
  budget_over_approved: "Resolve the budget overrun before approving new commitments.",
  contractor_compliance_expired: "Renew the expired contractor compliance documents.",
  inspections_corrections_required: "Complete the outstanding inspection correction items.",
  tasks_overdue: "Clear the overdue schedule tasks.",
  schedule_overdue: "Re-plan the remaining work — the target completion date has passed.",
  schedule_progress_gap: "Recover the schedule slippage with the contractor.",
  contractor_performance: "Review weak contractor performance and remediate.",
  completion_deadline_near: "Expedite the remaining work — the completion deadline is near.",
  pending_change_orders: "Decide the pending change orders.",
  pending_draws: "Decide the pending draw requests.",
  draws_approved_unpaid: "Record payment for the approved draws past their payment terms.",
  permits_unverified: "Attach evidence for the unverified permits, or record their status as unknown.",
  tasks_blocked: "Unblock the blocked schedule tasks.",
  allocated_not_paid: "Record payments against the allocated-but-unpaid amounts.",
  approved_invoices_undrawn: "Draw against the approved invoices that no draw references.",
  contractor_compliance_unknown: "Record expiry dates for the contractor compliance documents.",
});

/**
 * Aggregated project health. The domain risk report is CONSUMED from a
 * restored RenovationOperations instance — never reimplemented — and
 * joined with the U2 operations state (inspections, tasks, permits,
 * contractor compliance) and the U1b financial state (undrawn approved
 * invoices, approved draws unpaid beyond DRAW_PAYMENT_TERMS_DAYS,
 * allocated-not-paid exposure). Findings are severity-ranked; the
 * nextAction is the fixed string mapped from the top finding.
 */
export function projectHealth(store, tenantId, projectId, asOf = isoNow()) {
  if (!store?.db) throw new Error("mission_control_store_required");
  const tenant = tenantId || store.defaultTenantId;
  const project = store.getProject(projectId, tenant);
  if (!project) throw new Error("project_not_found");
  const asOfIso = requireDate(asOf);
  const ops = new MissionControlOperationsCompletion(store);
  const finance = new MissionControlFinance(store);

  const workflow = store.restoreWorkflow(projectId, { tenantId: tenant });
  const operations = store.restoreOperations(workflow, { tenantId: tenant });
  const domain = operations.riskReport(asOfIso);

  const findings = [];
  for (const risk of domain.risks) findings.push({ source: "domain_risk_report", ...risk });

  const inspectionsBlocked = ops.listInspections(projectId, tenant).filter(i => i.status === "corrections_required");
  if (inspectionsBlocked.length) findings.push({
    source: "operations", kind: "inspections_corrections_required", severity: "high", count: inspectionsBlocked.length,
    detail: `${inspectionsBlocked.length} inspection${inspectionsBlocked.length === 1 ? " is" : "s are"} in corrections_required; project completion is blocked.`,
  });

  const schedule = ops.scheduleHealth(projectId, asOfIso, tenant);
  if (schedule.overdue.length) findings.push({
    source: "operations", kind: "tasks_overdue", severity: "high", count: schedule.overdue.length,
    detail: `${schedule.overdue.length} schedule task${schedule.overdue.length === 1 ? " is" : "s are"} past due.`,
  });
  if (schedule.blocked.length) findings.push({
    source: "operations", kind: "tasks_blocked", severity: "medium", count: schedule.blocked.length,
    detail: `${schedule.blocked.length} schedule task${schedule.blocked.length === 1 ? " is" : "s are"} blocked.`,
  });

  const unverifiedPermits = ops.listPermits(projectId, tenant).filter(p => p.verification === "unverified");
  if (unverifiedPermits.length) findings.push({
    source: "operations", kind: "permits_unverified", severity: "medium", count: unverifiedPermits.length,
    detail: `${unverifiedPermits.length} permit${unverifiedPermits.length === 1 ? " has" : "s have"} no evidence attached and ${unverifiedPermits.length === 1 ? "is" : "are"} labeled unverified.`,
  });

  const draws = finance.listDraws(projectId, tenant);
  const drawnInvoiceIds = new Set(draws.flatMap(draw => draw.invoiceIds));
  const undrawn = finance.listInvoices(projectId, tenant).filter(inv => finance.isGovernedApprovedInvoice(inv, tenant) && !drawnInvoiceIds.has(inv.id));
  if (undrawn.length) findings.push({
    source: "financial", kind: "approved_invoices_undrawn", severity: "low", count: undrawn.length,
    detail: `${undrawn.length} approved invoice${undrawn.length === 1 ? " is" : "s are"} not referenced by any draw.`,
  });

  const asOfMs = new Date(asOfIso).getTime();
  let unpaidCount = 0;
  let unpaidAmount = 0;
  for (const draw of draws) {
    if (draw.status !== "approved") continue;
    const approval = finance.listDecisions(draw.id, tenant).filter(d => d.decision === "approved").at(-1);
    if (!approval) continue;
    const ageDays = (asOfMs - new Date(approval.createdAt).getTime()) / 86400000;
    if (ageDays <= DRAW_PAYMENT_TERMS_DAYS) continue;
    const fin = finance.getDrawFinancials(draw.id, tenant);
    if (fin.paid < fin.approved) { unpaidCount++; unpaidAmount += fin.approved - fin.paid; }
  }
  if (unpaidCount) findings.push({
    source: "financial", kind: "draws_approved_unpaid", severity: "medium", count: unpaidCount, amount: cents(unpaidAmount),
    detail: `${unpaidCount} approved draw${unpaidCount === 1 ? " is" : "s are"} unpaid beyond the ${DRAW_PAYMENT_TERMS_DAYS}-day reporting term.`,
  });

  let expiredDocs = 0;
  let unknownDocs = 0;
  for (const contractor of ops.listContractors(tenant, asOfIso)) {
    for (const doc of contractor.compliance) {
      if (doc.status === "expired") expiredDocs++;
      else if (doc.status === "unknown") unknownDocs++;
    }
  }
  if (expiredDocs) findings.push({
    source: "operations", kind: "contractor_compliance_expired", severity: "high", count: expiredDocs,
    detail: `${expiredDocs} contractor compliance document${expiredDocs === 1 ? " is" : "s are"} expired.`,
  });
  if (unknownDocs) findings.push({
    source: "operations", kind: "contractor_compliance_unknown", severity: "low", count: unknownDocs,
    detail: `${unknownDocs} contractor compliance document${unknownDocs === 1 ? " has" : "s have"} no recorded expiry; status is unknown, not assumed valid.`,
  });

  const projectFinancials = finance.getProjectFinancials(projectId, tenant);
  const allocatedNotPaid = cents(projectFinancials.allocated - projectFinancials.paid);
  if (allocatedNotPaid > 0) findings.push({
    source: "financial", kind: "allocated_not_paid", severity: "low", amount: allocatedNotPaid,
    detail: `$${allocatedNotPaid} is allocated against approved draws but not yet recorded as paid.`,
  });

  findings.sort((a, b) => (SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]) || (a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0));
  const counts = { findings: findings.length, critical: 0, high: 0, medium: 0, low: 0 };
  for (const finding of findings) counts[finding.severity]++;
  const top = findings[0];
  return {
    projectId, tenantId: tenant, asOf: asOfIso,
    domainRiskLevel: domain.riskLevel,
    riskLevel: top ? top.severity : "clear",
    findings, counts,
    nextAction: top ? (NEXT_ACTION_BY_KIND[top.kind] || `Review finding: ${top.kind}.`) : "No action required — no findings.",
    schedule: { overdueCount: schedule.overdue.length, blockedCount: schedule.blocked.length, criticalChainLength: schedule.criticalChainLength },
    financials: projectFinancials,
  };
}

// --- lender draw package --------------------------------------------------------

/**
 * Assemble one draw into a self-contained, tamper-evident lender
 * package. Pure read: building a package writes nothing. The package
 * states `bankVerified: false` at the top level and on every
 * reconciliation entry; caller-supplied bank figures are labeled
 * caller-reported wherever they appear, exactly as U1b recorded them.
 * Figures are as recorded in Mission Control — this package is not a
 * bank statement and represents nothing as bank-verified.
 */
export function buildLenderPackage(store, tenantId, projectId, drawId) {
  if (!store?.db) throw new Error("mission_control_store_required");
  const tenant = tenantId || store.defaultTenantId;
  const project = store.getProject(projectId, tenant);
  if (!project) throw new Error("project_not_found");
  const finance = new MissionControlFinance(store);
  const draw = finance.getDraw(drawId, tenant);
  if (!draw || draw.projectId !== projectId) throw new Error("draw_not_found");

  const workflow = store.restoreWorkflow(projectId, { tenantId: tenant });
  const operations = store.restoreOperations(workflow, { tenantId: tenant });
  const budget = workflow.budgetSummary();
  const decisions = finance.listDecisions(drawId, tenant);
  const allocations = finance.listAllocations(drawId, tenant);
  const invoices = draw.invoiceIds.map(id => finance.getInvoice(id, tenant)).filter(Boolean);
  // Package figures are governed (U5R, finding M-1): only
  // audit-corroborated payments and reconciliations are packaged —
  // rows written by direct ledger registration are excluded here
  // exactly as they are from the financial sums, and are surfaced
  // by finance.orphanedFinancialRows().
  const payments = finance.listPayments(projectId, tenant).filter(payment => payment.drawId === drawId && finance.isGovernedPayment(payment, tenant));
  const paymentIds = new Set(payments.map(payment => payment.id));
  const reconciliations = finance.listReconciliations(projectId, tenant)
    .filter(record => paymentIds.has(record.paymentId) && finance.isGovernedReconciliation(record, tenant))
    .map(record => ({ ...record, callerReported: true, bankVerified: false }));
  const progressEvidenceRefs = [...new Set([
    ...operations.progressUpdates.flatMap(update => update.evidenceRefs || []),
    ...(draw.evidenceRefs || []),
  ])];

  const body = {
    packageType: "mission-control-lender-draw-package",
    contractVersion: "1.0",
    sourceSystem: "mission-control",
    generatedAt: isoNow(),
    bankVerified: false,
    labels: {
      bankRecords: "caller_reported",
      notice: "Caller-supplied bank records are stored verbatim and labeled caller_reported; no figure in this package is independently bank-verified.",
    },
    project: {
      id: project.id,
      address: project.address ?? null,
      propertyId: project.propertyId ?? null,
      sourceOpportunityId: project.sourceOpportunityId ?? null,
      sourceHandoffId: project.sourceHandoffId ?? null,
      acquisitionPrice: project.acquisitionPrice ?? null,
      arvBaseline: project.arvBaseline ?? null,
      stage: workflow.project.stage,
    },
    budget,
    draw,
    decisions,
    allocations,
    invoices: {
      records: invoices,
      count: invoices.length,
      approvedTotal: cents(invoices.filter(inv => finance.isGovernedApprovedInvoice(inv, tenant)).reduce((sum, inv) => sum + inv.total, 0)),
    },
    payments: { records: payments, totalPaid: cents(payments.reduce((sum, payment) => sum + payment.amount, 0)) },
    drawFinancials: finance.getDrawFinancials(drawId, tenant),
    projectFinancials: finance.getProjectFinancials(projectId, tenant),
    reconciliations,
    progressEvidenceRefs,
  };
  return { ...body, packageDigest: sha256(canonicalStringify(body)) };
}

/** Recompute the package digest over the body as presented (every
 *  field except `packageDigest` itself) and compare. Any mutation of
 *  any packaged figure — or a missing digest — returns false. */
export function verifyLenderPackage(pkg) {
  if (!pkg || typeof pkg !== "object" || Array.isArray(pkg)) return false;
  if (typeof pkg.packageDigest !== "string" || !pkg.packageDigest) return false;
  const { packageDigest, ...body } = pkg;
  return sha256(canonicalStringify(body)) === packageDigest;
}
