import { randomUUID } from "node:crypto";

const REQUIRED = ["contractVersion", "sourceSystem", "targetSystem", "opportunityId", "closedAt", "acquisition", "underwriting", "renovationSeed"];

// Field types published in contracts/pipeline-acquisition-handoff.schema.json.
// The receiver is the contract's enforcement point (U4R, defect U4-2):
// a field the schema types as number must arrive as a finite JSON
// number — a string like "150000" is refused — and a string-typed field
// must arrive as a string; null is accepted exactly where the schema's
// type list includes it. The two fields the schema bounds with
// "minimum": 0 are refused when negative (same refusal code; the
// boundary speaks one type-conformance code). Fields that are absent
// keep the pre-existing behavior — the canonical receiver fixture omits
// offerId / offerVersionId / earnestMoney and stays valid; presence
// inside a section remains the emit-side contract. Well-typed values
// are never altered: the provenance of a plausible figure stays
// PIPELINE/VICTOR's governed domain, only its type is enforced here.
const HANDOFF_SECTIONS = ["acquisition", "underwriting", "renovationSeed"];
const HANDOFF_FIELD_TYPES = [
  ["opportunityCode", ["string", "null"]],
  ["propertyId", ["string", "null"]],
  ["address", ["string", "null"]],
  ["closedAt", ["string"]],
  ["acquisition.purchasePrice", ["number", "null"]],
  ["acquisition.earnestMoney", ["number", "null"]],
  ["acquisition.strategyType", ["string", "null"]],
  ["acquisition.offerId", ["string", "null"]],
  ["acquisition.offerVersionId", ["string", "null"]],
  ["underwriting.sourceSystem", ["string", "null"]],
  ["underwriting.sourceUnderwritingId", ["string", "null"]],
  ["underwriting.arv", ["number", "null"]],
  ["underwriting.rehab", ["number", "null"]],
  ["underwriting.mao", ["number", "null"]],
  ["underwriting.confidence", ["number", "string", "null"]],
  ["underwriting.limitations", ["string", "null"]],
  ["renovationSeed.budgetBaseline", ["number", "null"]],
];
const HANDOFF_NON_NEGATIVE = new Set(["acquisition.purchasePrice", "acquisition.earnestMoney"]);

function validateHandoffFieldTypes(payload) {
  for (const section of HANDOFF_SECTIONS) {
    const value = payload[section];
    if (value !== undefined && (value === null || typeof value !== "object" || Array.isArray(value))) throw new Error("invalid_field_type");
  }
  for (const [path, types] of HANDOFF_FIELD_TYPES) {
    const dot = path.indexOf(".");
    const value = dot === -1 ? payload[path] : payload[path.slice(0, dot)]?.[path.slice(dot + 1)];
    if (value === undefined) continue;
    if (value === null) {
      if (!types.includes("null")) throw new Error("invalid_field_type");
      continue;
    }
    if (!types.includes(typeof value)) throw new Error("invalid_field_type");
    if (typeof value === "number" && !Number.isFinite(value)) throw new Error("invalid_field_type");
    if (typeof value === "number" && HANDOFF_NON_NEGATIVE.has(path) && value < 0) throw new Error("invalid_field_type");
  }
}

export function validateAcquisitionHandoff(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("invalid_handoff_payload");
  for (const key of REQUIRED) if (!(key in payload)) throw new Error(`missing_${key}`);
  if (payload.contractVersion !== "1.0") throw new Error("unsupported_handoff_contract");
  if (payload.sourceSystem !== "pipeline") throw new Error("invalid_handoff_source");
  if (payload.targetSystem !== "mission-control") throw new Error("invalid_handoff_target");
  if (!String(payload.opportunityId || "").trim()) throw new Error("missing_opportunityId");
  if (payload.renovationSeed?.scopeStatus !== "needs_field_validation") throw new Error("field_scope_validation_required");
  if (payload.renovationSeed?.projectStatus !== "intake_ready") throw new Error("invalid_project_seed_status");
  validateHandoffFieldTypes(payload);
  return payload;
}

export function buildProjectSeed({ handoffId, payload }) {
  validateAcquisitionHandoff(payload);
  if (!String(handoffId || "").trim()) throw new Error("missing_handoffId");
  return {
    id: randomUUID(),
    sourceSystem: "pipeline",
    sourceHandoffId: handoffId,
    sourceOpportunityId: payload.opportunityId,
    sourceOpportunityCode: payload.opportunityCode || null,
    propertyId: payload.propertyId || null,
    address: payload.address || null,
    acquisitionPrice: payload.acquisition?.purchasePrice ?? null,
    acquisitionStrategy: payload.acquisition?.strategyType ?? null,
    arvBaseline: payload.underwriting?.arv ?? null,
    rehabBudgetBaseline: payload.renovationSeed?.budgetBaseline ?? payload.underwriting?.rehab ?? null,
    underwritingMao: payload.underwriting?.mao ?? null,
    underwritingConfidence: payload.underwriting?.confidence ?? null,
    underwritingSource: payload.underwriting?.sourceSystem || null,
    underwritingSourceId: payload.underwriting?.sourceUnderwritingId || null,
    scopeStatus: "field_scope_required",
    budgetStatus: "preliminary_baseline",
    projectStatus: "intake",
    closedAt: payload.closedAt,
    createdAt: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
  };
}

/**
 * Receiver boundary used by the eventual HTTP/API adapter.
 * Repository contract:
 *   findBySourceHandoffId(id) -> project|null
 *   insert(project) -> persisted project
 */
export function receiveClosedAcquisition({ handoffId, payload, repository }) {
  validateAcquisitionHandoff(payload);
  if (!repository?.findBySourceHandoffId || !repository?.insert) throw new Error("mission_control_repository_required");
  const existing = repository.findBySourceHandoffId(handoffId);
  if (existing) return { project: existing, duplicate: true, acknowledgment: acknowledgment(existing) };
  const project = repository.insert(buildProjectSeed({ handoffId, payload }));
  return { project, duplicate: false, acknowledgment: acknowledgment(project) };
}

function acknowledgment(project) {
  return {
    eventType: "acknowledged",
    externalRef: project.id,
    detail: "Mission Control created the renovation intake project; field scope validation is still required."
  };
}
