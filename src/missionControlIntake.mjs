import { randomUUID } from "node:crypto";

const REQUIRED = ["contractVersion", "sourceSystem", "targetSystem", "opportunityId", "closedAt", "acquisition", "underwriting", "renovationSeed"];

export function validateAcquisitionHandoff(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("invalid_handoff_payload");
  for (const key of REQUIRED) if (!(key in payload)) throw new Error(`missing_${key}`);
  if (payload.contractVersion !== "1.0") throw new Error("unsupported_handoff_contract");
  if (payload.sourceSystem !== "pipeline") throw new Error("invalid_handoff_source");
  if (payload.targetSystem !== "mission-control") throw new Error("invalid_handoff_target");
  if (!String(payload.opportunityId || "").trim()) throw new Error("missing_opportunityId");
  if (payload.renovationSeed?.scopeStatus !== "needs_field_validation") throw new Error("field_scope_validation_required");
  if (payload.renovationSeed?.projectStatus !== "intake_ready") throw new Error("invalid_project_seed_status");
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
