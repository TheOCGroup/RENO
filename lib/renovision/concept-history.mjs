/** RENOVISION durable AI concept history: the record model for one generated
 * (or attempted) renovation concept belonging to exactly one project in
 * exactly one tenant.
 *
 * A concept record stores REFERENCES ONLY — opaque asset references, never
 * image bytes, never filesystem paths, never bucket/object paths and never
 * signed URLs — plus the model/provider that produced it, the generation
 * settings, provenance, an honest job status (completed / failed /
 * interrupted) and timestamps. Records are sealed with a SHA-256 integrity
 * digest over a canonical projection of the record (the same fail-closed
 * spirit as manifest-integrity.mjs / audit-chain.mjs): any silent edit to a
 * stored record invalidates the seal and the record is rejected on read.
 *
 * Approval is monotonic and preserved: a concept, once user-approved, keeps
 * that approval (approver + timestamp) forever; later generations are NEW
 * records and never mutate or clear an earlier approval.
 *
 * Fixtures: deterministic test fixtures are built only through
 * makeFixtureConceptRecord, which stamps isFixture:true and the provider /
 * model names "fixture" / "fixture-deterministic-v1" on the record itself.
 * A fixture is a contract exercise, never a generated image, and the flag
 * survives storage, listing and API responses.
 */
import {createHash} from "node:crypto";
export const CONCEPT_FORMAT = "renovision-concept/v1";
export const CONCEPT_STATUSES = Object.freeze(["completed", "failed", "interrupted"]);
export const CONCEPT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const text = (x) => typeof x === "string" && x.trim().length > 0;
const iso = (x) => text(x) && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(x) && Number.isFinite(Date.parse(x));
/** Opaque reference hygiene: an asset reference is an identifier, not a
 * location. Anything path-like (slashes, backslashes, URLs, gs://, drive
 * letters, parent traversal) is refused so a private storage path can never
 * be persisted in — or leaked through — a concept record. */
export function isOpaqueAssetRef(x) {
  if (!text(x) || x.length > 256) return false;
  if (x.includes("/") || x.includes("\\") || x.includes("://")) return false;
  if (x.startsWith(".") || x.includes("..")) return false;
  if (/^[A-Za-z]:/.test(x)) return false;
  return /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(x);
}
const canonicalCore = (r) => ({
  format: r.format, conceptId: r.conceptId, tenantId: r.tenantId, projectId: r.projectId,
  propertyId: r.propertyId, roomId: r.roomId,
  originalAssetRef: r.originalAssetRef, generatedAssetRef: r.generatedAssetRef ?? null,
  model: r.model, provider: r.provider,
  generationSettings: r.generationSettings ?? {},
  status: r.status, failureReason: r.failureReason ?? null,
  designRevision: r.designRevision ?? null, geometryDigest: r.geometryDigest ?? null,
  provenance: r.provenance, isFixture: r.isFixture === true,
  retentionDays: r.retentionDays ?? null, expiresAt: r.expiresAt ?? null,
  approval: r.approval, createdAt: r.createdAt, updatedAt: r.updatedAt, completedAt: r.completedAt ?? null
});
export function computeConceptIntegrity(record) {
  return "sha256:" + createHash("sha256").update(JSON.stringify(canonicalCore(record))).digest("hex");
}
export function sealConceptRecord(record) {
  const sealed = {...structuredClone(record), approval: record.approval ?? {approved: false, approvedBy: null, approvedAt: null}};
  sealed.integrity = computeConceptIntegrity(sealed);
  return sealed;
}
export function validateConceptRecord(record) {
  const errors = [];
  const fail = (e) => errors.push(e);
  if (!record || typeof record !== "object" || Array.isArray(record)) return {valid: false, errors: ["concept record object required"]};
  if (record.format !== CONCEPT_FORMAT) fail("concept_format_invalid");
  if (!CONCEPT_ID_PATTERN.test(record.conceptId ?? "")) fail("concept_id_invalid");
  for (const key of ["tenantId", "projectId", "propertyId", "roomId"]) if (!text(record[key])) fail(key + "_required");
  if (!isOpaqueAssetRef(record.originalAssetRef)) fail("original_asset_ref_must_be_opaque_reference");
  if (record.status !== undefined && !CONCEPT_STATUSES.includes(record.status)) fail("concept_status_invalid");
  if (record.status === "completed" && !isOpaqueAssetRef(record.generatedAssetRef)) fail("generated_asset_ref_required_for_completed_concept");
  if ((record.status === "failed" || record.status === "interrupted") && record.generatedAssetRef !== null && record.generatedAssetRef !== undefined) fail("generated_asset_ref_must_be_null_for_" + record.status + "_concept");
  if (record.status === "failed" && !text(record.failureReason)) fail("failure_reason_required_for_failed_concept");
  if (record.failureReason !== null && record.failureReason !== undefined && !text(record.failureReason)) fail("failure_reason_invalid");
  if (!text(record.model)) fail("model_required");
  if (!text(record.provider)) fail("provider_required");
  if (record.generationSettings !== undefined && (typeof record.generationSettings !== "object" || record.generationSettings === null || Array.isArray(record.generationSettings))) fail("generation_settings_object_required");
  if (record.generationSettings && JSON.stringify(record.generationSettings).length > 8192) fail("generation_settings_too_large");
  if (record.designRevision !== null && record.designRevision !== undefined && (!text(record.designRevision) || record.designRevision.length > 128)) fail("design_revision_invalid");
  if (record.geometryDigest !== null && record.geometryDigest !== undefined && !/^sha256:[a-f0-9]{64}$/.test(record.geometryDigest)) fail("geometry_digest_invalid");
  const prov = record.provenance;
  if (!prov || typeof prov !== "object" || Array.isArray(prov)) fail("provenance_required");
  else {
    if (!text(prov.createdBy)) fail("provenance_created_by_required");
    if (!text(prov.origin)) fail("provenance_origin_required");
    if (prov.parentConceptId !== null && prov.parentConceptId !== undefined && !CONCEPT_ID_PATTERN.test(prov.parentConceptId)) fail("provenance_parent_concept_id_invalid");
  }
  if (record.isFixture !== undefined && typeof record.isFixture !== "boolean") fail("is_fixture_must_be_boolean");
  if (record.isFixture === true && (record.provider !== "fixture" || prov?.fixture !== true)) fail("fixture_concept_must_be_labeled_fixture");
  if (record.retentionDays !== null && record.retentionDays !== undefined && (!Number.isInteger(record.retentionDays) || record.retentionDays < 1 || record.retentionDays > 365)) fail("retention_days_out_of_bounds");
  if (record.expiresAt !== null && record.expiresAt !== undefined && !iso(record.expiresAt)) fail("expires_at_invalid");
  if (record.retentionDays && !iso(record.expiresAt)) fail("expires_at_required_with_retention");
  const approval = record.approval;
  if (!approval || typeof approval !== "object" || Array.isArray(approval)) fail("approval_object_required");
  else if (approval.approved === true) {
    if (!text(approval.approvedBy) || !iso(approval.approvedAt)) fail("approval_provenance_invalid");
  } else if (approval.approved !== false) fail("approval_flag_invalid");
  if (!iso(record.createdAt)) fail("created_at_invalid");
  if (!iso(record.updatedAt)) fail("updated_at_invalid");
  if (record.completedAt !== null && record.completedAt !== undefined && !iso(record.completedAt)) fail("completed_at_invalid");
  if (record.status === "completed" && !iso(record.completedAt)) fail("completed_at_required_for_completed_concept");
  if (!text(record.integrity) || record.integrity !== computeConceptIntegrity(record)) fail("concept_integrity_mismatch");
  return {valid: errors.length === 0, errors};
}
/** Build + seal a concept record from server-owned scope fields plus caller
 * generation fields. Throws Error with .errors on invalid input (fail closed). */
export function buildConceptRecord({conceptId, tenantId, projectId, propertyId, roomId, originalAssetRef, generatedAssetRef = null, model, provider, generationSettings = {}, status = "completed", failureReason = null, designRevision = null, geometryDigest = null, provenance, isFixture = false, retentionDays = null, now = new Date().toISOString()} = {}) {
  const expiresAt = retentionDays ? new Date(Date.parse(now) + retentionDays * 86400000).toISOString() : null;
  const record = sealConceptRecord({
    format: CONCEPT_FORMAT, conceptId, tenantId, projectId, propertyId, roomId,
    originalAssetRef, generatedAssetRef, model, provider,
    generationSettings: structuredClone(generationSettings ?? {}),
    status, failureReason, designRevision, geometryDigest,
    provenance: {createdBy: provenance?.createdBy, origin: provenance?.origin ?? "concept-api", parentConceptId: provenance?.parentConceptId ?? null, ...(isFixture ? {fixture: true} : {})},
    isFixture: isFixture === true, retentionDays, expiresAt,
    approval: {approved: false, approvedBy: null, approvedAt: null},
    createdAt: now, updatedAt: now, completedAt: status === "completed" ? now : null
  });
  const check = validateConceptRecord(record);
  if (!check.valid) { const e = new Error(check.errors[0]); e.errors = check.errors; throw e; }
  return record;
}
/** Deterministic fixture builder — clearly labeled in the record itself.
 * Fixture asset references are synthetic opaque ids, never image data. */
export function makeFixtureConceptRecord(overrides = {}) {
  return buildConceptRecord({
    conceptId: "fixture-concept-1", tenantId: "tenant-a", projectId: "project-1", propertyId: "property-1", roomId: "room-1",
    originalAssetRef: "fixture-original-1", generatedAssetRef: "fixture-generated-1",
    model: "fixture-deterministic-v1", provider: "fixture",
    generationSettings: {fixture: true, prompt: "fixture prompt — not a real generation request"},
    status: "completed", provenance: {createdBy: "fixture", origin: "deterministic-fixture"},
    isFixture: true, now: "2026-11-17T00:00:00.000Z", ...overrides,
    provenance: {createdBy: "fixture", origin: "deterministic-fixture", ...(overrides.provenance ?? {})}
  });
}
/** Monotonic approval: an already-approved record is returned unchanged —
 * its approver and timestamp are never overwritten. Returns a resealed copy. */
export function applyConceptApproval(record, {approvedBy, approvedAt = new Date().toISOString()} = {}) {
  const check = validateConceptRecord(record);
  if (!check.valid) { const e = new Error(check.errors[0]); e.errors = check.errors; throw e; }
  if (record.approval?.approved === true) return structuredClone(record);
  if (!text(approvedBy) || !iso(approvedAt)) { const e = new Error("approval_provenance_required"); e.errors = ["approval_provenance_required"]; throw e; }
  return sealConceptRecord({...structuredClone(record), approval: {approved: true, approvedBy, approvedAt}, updatedAt: approvedAt});
}
/** Whitelisted API view: exactly the record fields, rebuilt field by field,
 * so no extra stored key (and no storage path a corrupt record might carry)
 * can ever reach an API response. */
export function toPublicConcept(record) {
  const check = validateConceptRecord(record);
  if (!check.valid) return null;
  const pub = {...canonicalCore(record), integrity: record.integrity};
  return structuredClone(pub);
}
/** Side-by-side comparison structure for two records of the same project. */
export function buildConceptComparison(left, right) {
  for (const r of [left, right]) { const c = validateConceptRecord(r); if (!c.valid) { const e = new Error(c.errors[0]); e.errors = c.errors; throw e; } }
  if (left.tenantId !== right.tenantId || left.projectId !== right.projectId) { const e = new Error("concept_comparison_scope_mismatch"); e.errors = ["concept_comparison_scope_mismatch"]; throw e; }
  const fields = ["status", "model", "provider", "originalAssetRef", "generatedAssetRef", "designRevision", "geometryDigest", "isFixture"];
  const differences = fields.filter((f) => JSON.stringify(left[f] ?? null) !== JSON.stringify(right[f] ?? null)).map((f) => ({field: f, left: left[f] ?? null, right: right[f] ?? null}));
  return {projectId: left.projectId, tenantId: left.tenantId, left: toPublicConcept(left), right: toPublicConcept(right), differences, verified: false};
}
