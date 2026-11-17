/** Durable approval authority backed by Google Cloud Storage — the production
 * replacement for the process-local memory registry on Cloud Run.
 *
 * Design (mirrors gcs-project-store.mjs conventions):
 * - One object per approval, keyed under a tenant-hashed prefix by a hash of
 *   (tenantId, approvalRef). References are namespaced per tenant: the same
 *   ref in two tenants is two independent records, and no tenant can read,
 *   overwrite, or revoke another tenant's approvals through key derivation.
 * - Registration is create-only (ifGenerationMatch=0): a duplicate ref —
 *   including a simultaneous registration from another instance — fails with
 *   APPROVAL_REF_CONFLICT. Approval references are immutable once created.
 * - Revocation is the only mutation: a generation-guarded rewrite that flips
 *   the record to revoked and appends to the record's audit trail. A racing
 *   revocation fails with APPROVAL_WRITE_CONFLICT and changes nothing.
 * - Resolution revalidates the stored envelope (ref, tenant, property) before
 *   returning anything; a tampered or misplaced object resolves to null.
 * - Expiry and revocation are enforced by the approval gate at proposal time
 *   (lib/renovision/approval-gate.mjs); this registry stores them faithfully.
 * The HTTP layer authenticates the actor and authorizes scope before calling
 * this registry; the registry itself never trusts caller-supplied identity —
 * the server overwrites tenantId/approvedBy/approvedAt from the verified actor
 * before registration. No infrastructure is provisioned by this module. */
import {createHash} from "node:crypto";
const API = "https://storage.googleapis.com";
const REF = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const text = (x) => typeof x === "string" && x.trim().length > 0;
const iso = (x) => text(x) && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(x) && Number.isFinite(Date.parse(x));
const invalid = (message) => { const e = new Error(message); e.code = "APPROVAL_RECORD_INVALID"; return e; };
export function validateApprovalRecord(record) {
  if (!record || typeof record !== "object" || Array.isArray(record)) throw invalid("invalid approval record");
  if (!REF.test(record.approvalRef ?? "")) throw invalid("invalid approval record");
  for (const key of ["tenantId", "propertyId", "roomId", "featureId", "scopeItemId", "approvedBy"]) if (!text(record[key])) throw invalid("invalid approval record");
  if (record.status !== "approved") throw invalid("invalid approval record");
  if (!iso(record.approvedAt)) throw invalid("invalid approval record");
  if (record.expiresAt !== undefined && !iso(record.expiresAt)) throw invalid("invalid approval record");
  if (record.allowedActorIds !== undefined && (!Array.isArray(record.allowedActorIds) || !record.allowedActorIds.every(text))) throw invalid("invalid approval record");
  return record;
}
export function createGcsApprovalRegistry({bucket, getAccessToken, fetchImpl, prefix = "renovision-approvals"} = {}) {
  if (!text(bucket) || typeof getAccessToken !== "function" || typeof fetchImpl !== "function") throw Error("GCS approval registry configuration required");
  const root = prefix.replace(/^\/+|\/+$/g, "") + "/";
  const tenantRoot = (tenantId) => root + createHash("sha256").update(tenantId).digest("hex") + "/";
  const name = (tenantId, approvalRef) => tenantRoot(tenantId) + createHash("sha256").update(tenantId + "\n" + approvalRef).digest("hex") + ".json";
  const url = (n) => API + "/storage/v1/b/" + encodeURIComponent(bucket) + "/o/" + encodeURIComponent(n);
  const request = async (u, options = {}) => fetchImpl(u, {...options, headers: {authorization: "Bearer " + await getAccessToken(), ...options.headers}});
  const decode = (envelope, approvalRef, tenantId) => {
    if (!envelope || envelope.approvalRef !== approvalRef || envelope.tenantId !== tenantId) return null;
    const record = envelope.record;
    if (!record || record.approvalRef !== approvalRef || record.tenantId !== tenantId) return null;
    if (!Array.isArray(envelope.audit) || envelope.audit.length === 0) return null;
    return envelope;
  };
  const loadEnvelope = async (approvalRef, tenantId) => {
    const n = name(tenantId, approvalRef);
    const meta = await request(url(n));
    if (meta.status === 404) return null;
    if (!meta.ok) throw Error("approval metadata read failed");
    const m = await meta.json();
    if (!/^\d+$/.test(String(m.generation ?? ""))) throw Error("invalid approval generation");
    const data = await request(url(n) + "?alt=media&ifGenerationMatch=" + m.generation);
    if (data.status === 412 || data.status === 404) return null;
    if (!data.ok) throw Error("approval read failed");
    const envelope = decode(await data.json(), approvalRef, tenantId);
    return envelope ? {...envelope, generation: String(m.generation)} : null;
  };
  const upload = async (n, envelope, generation) => {
    const target = API + "/upload/storage/v1/b/" + encodeURIComponent(bucket) + "/o?uploadType=media&name=" + encodeURIComponent(n) + "&ifGenerationMatch=" + generation;
    return request(target, {method: "POST", headers: {"content-type": "application/json"}, body: JSON.stringify(envelope)});
  };
  return {
    async register(record) {
      const valid = validateApprovalRecord(record);
      const stored = structuredClone(valid);
      const envelope = {approvalRef: stored.approvalRef, tenantId: stored.tenantId, record: stored, audit: [{action: "registered", by: stored.approvedBy, at: stored.approvedAt}]};
      const res = await upload(name(stored.tenantId, stored.approvalRef), envelope, "0");
      if (res.status === 412) { const e = new Error("approval_ref_conflict"); e.code = "APPROVAL_REF_CONFLICT"; throw e; }
      if (!res.ok) throw Error("approval write failed");
      return structuredClone(stored);
    },
    async resolveApproval({approvalRef, tenantId, propertyId} = {}) {
      if (!REF.test(approvalRef ?? "") || !text(tenantId)) return null;
      const envelope = await loadEnvelope(approvalRef, tenantId);
      if (!envelope) return null;
      if (text(propertyId) && envelope.record.propertyId !== propertyId) return null;
      return structuredClone(envelope.record);
    },
    async revoke({approvalRef, tenantId, revokedBy, reason, at} = {}) {
      if (!REF.test(approvalRef ?? "") || !text(tenantId) || !text(revokedBy)) return null;
      const envelope = await loadEnvelope(approvalRef, tenantId);
      if (!envelope) return null;
      if (envelope.record.revoked === true) return structuredClone(envelope.record);
      const revokedAt = iso(at) ? at : new Date().toISOString();
      const record = {...envelope.record, status: "revoked", revoked: true, revokedBy, revokedAt, ...(text(reason) ? {revokeReason: reason} : {})};
      const next = {approvalRef, tenantId, record, audit: [...envelope.audit, {action: "revoked", by: revokedBy, at: revokedAt, ...(text(reason) ? {reason} : {})}]};
      const res = await upload(name(tenantId, approvalRef), next, envelope.generation);
      if (res.status === 412) { const e = new Error("approval_write_conflict"); e.code = "APPROVAL_WRITE_CONFLICT"; throw e; }
      if (!res.ok) throw Error("approval revocation failed");
      return structuredClone(record);
    },
    async auditTrail({approvalRef, tenantId} = {}) {
      if (!REF.test(approvalRef ?? "") || !text(tenantId)) return null;
      const envelope = await loadEnvelope(approvalRef, tenantId);
      return envelope ? structuredClone(envelope.audit) : null;
    },
    get storageClass() { return "durable-gcs"; }
  };
}
