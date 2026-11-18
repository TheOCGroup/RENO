/** Shared Google Cloud Storage concept-history records for Cloud Run.
 * Mirrors gcs-project-store.mjs: generation preconditions avoid lost
 * updates across instances, objects live under a tenant-hashed prefix
 * extended with a project hash (renovision-concepts/<tenantHash>/<projectHash>/<conceptHash>.json),
 * and every read re-validates the envelope scope plus the record's
 * integrity seal — a tampered or misplaced object loads as null and is
 * skipped by list. Creation is create-only (ifGenerationMatch=0), so a
 * duplicate concept id fails with CONCEPT_CONFLICT instead of overwriting
 * history; approval is a generation-guarded rewrite (CONCEPT_WRITE_CONFLICT
 * on a race). The HTTP layer must authenticate and authorize tenant access
 * before calling this store. No infrastructure is provisioned here. */
import {createHash} from "node:crypto";
import {validateConceptRecord, applyConceptApproval, CONCEPT_ID_PATTERN} from "./concept-history.mjs";
const API = "https://storage.googleapis.com";
const valid = (x) => typeof x === "string" && x.trim().length > 0;
export function createGcsConceptStore({bucket, getAccessToken, fetchImpl, prefix = "renovision-concepts"} = {}) {
  if (!valid(bucket) || typeof getAccessToken !== "function" || typeof fetchImpl !== "function") throw Error("GCS concept store configuration required");
  const root = prefix.replace(/^\/+|\/+$/g, "") + "/";
  const tenantRoot = (tenantId) => root + createHash("sha256").update(tenantId).digest("hex") + "/";
  const projectRoot = (tenantId, projectId) => tenantRoot(tenantId) + createHash("sha256").update(tenantId + "\n" + projectId).digest("hex") + "/";
  const name = (tenantId, projectId, conceptId) => projectRoot(tenantId, projectId) + createHash("sha256").update(tenantId + "\n" + projectId + "\n" + conceptId).digest("hex") + ".json";
  const url = (n) => API + "/storage/v1/b/" + encodeURIComponent(bucket) + "/o/" + encodeURIComponent(n);
  const headers = async () => ({authorization: "Bearer " + await getAccessToken()});
  const request = async (u, options = {}) => fetchImpl(u, {...options, headers: {...await headers(), ...options.headers}});
  const scopeOk = (tenantId, projectId, conceptId) => valid(tenantId) && CONCEPT_ID_PATTERN.test(projectId ?? "") && CONCEPT_ID_PATTERN.test(conceptId ?? "");
  const decode = (envelope, tenantId, projectId, conceptId) => {
    if (!envelope || envelope.conceptId !== conceptId || envelope.tenantId !== tenantId || envelope.projectId !== projectId) return null;
    const record = envelope.record;
    if (!record || record.tenantId !== tenantId || record.projectId !== projectId || record.conceptId !== conceptId) return null;
    return validateConceptRecord(record).valid ? record : null;
  };
  const loadEnvelope = async (tenantId, projectId, conceptId) => {
    const n = name(tenantId, projectId, conceptId);
    const meta = await request(url(n));
    if (meta.status === 404) return null;
    if (!meta.ok) throw Error("concept metadata read failed");
    const m = await meta.json();
    if (!/^\d+$/.test(String(m.generation ?? ""))) throw Error("invalid concept generation");
    const data = await request(url(n) + "?alt=media");
    if (data.status === 404) return null;
    if (!data.ok) throw Error("concept read failed");
    const record = decode(await data.json(), tenantId, projectId, conceptId);
    return record ? {record, generation: String(m.generation)} : null;
  };
  const upload = async (n, envelope, generation) => {
    const target = API + "/upload/storage/v1/b/" + encodeURIComponent(bucket) + "/o?uploadType=media&name=" + encodeURIComponent(n) + "&ifGenerationMatch=" + generation;
    return request(target, {method: "POST", headers: {"content-type": "application/json"}, body: JSON.stringify(envelope)});
  };
  const envelopeFor = (record) => ({conceptId: record.conceptId, tenantId: record.tenantId, projectId: record.projectId, savedAt: new Date().toISOString(), record: structuredClone(record)});
  const store = {
    async create(record) {
      if (!record || !scopeOk(record.tenantId, record.projectId, record.conceptId) || !validateConceptRecord(record).valid) throw Error("invalid concept record");
      const res = await upload(name(record.tenantId, record.projectId, record.conceptId), envelopeFor(record), "0");
      if (res.status === 412) { const e = new Error("concept_already_exists"); e.code = "CONCEPT_CONFLICT"; throw e; }
      if (!res.ok) throw Error("concept write failed");
      return {saved: true, conceptId: record.conceptId};
    },
    async load({tenantId, projectId, conceptId} = {}) {
      if (!scopeOk(tenantId, projectId, conceptId)) return null;
      const found = await loadEnvelope(tenantId, projectId, conceptId);
      return found ? structuredClone(found.record) : null;
    },
    async list({tenantId, projectId} = {}) {
      if (!valid(tenantId) || !CONCEPT_ID_PATTERN.test(projectId ?? "")) return [];
      const out = []; let pageToken;
      do {
        const query = new URLSearchParams({prefix: projectRoot(tenantId, projectId), fields: "nextPageToken,items(name)"});
        if (pageToken) query.set("pageToken", pageToken);
        const r = await request(API + "/storage/v1/b/" + encodeURIComponent(bucket) + "/o?" + query);
        if (!r.ok) throw Error("concept listing failed");
        const page = await r.json();
        for (const item of page.items ?? []) {
          if (!item.name?.startsWith(projectRoot(tenantId, projectId)) || !item.name.endsWith(".json")) continue;
          const obj = await request(url(item.name) + "?alt=media");
          if (!obj.ok) continue;
          const envelope = await obj.json().catch(() => null);
          const record = envelope && decode(envelope, tenantId, projectId, envelope.conceptId);
          if (record) out.push(structuredClone(record));
        }
        pageToken = page.nextPageToken;
      } while (pageToken);
      return out.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.conceptId.localeCompare(b.conceptId));
    },
    async approve({tenantId, projectId, conceptId, approvedBy, approvedAt} = {}) {
      if (!scopeOk(tenantId, projectId, conceptId)) return null;
      const found = await loadEnvelope(tenantId, projectId, conceptId);
      if (!found) return null;
      const next = applyConceptApproval(found.record, {approvedBy, approvedAt});
      if (found.record.approval?.approved === true) return structuredClone(next);
      const res = await upload(name(tenantId, projectId, conceptId), envelopeFor(next), found.generation);
      if (res.status === 412) { const e = new Error("concept_write_conflict"); e.code = "CONCEPT_WRITE_CONFLICT"; throw e; }
      if (!res.ok) throw Error("concept approval write failed");
      return structuredClone(next);
    },
    async deleteForProject({tenantId, projectId} = {}) {
      if (!valid(tenantId) || !CONCEPT_ID_PATTERN.test(projectId ?? "")) return 0;
      let removed = 0; let pageToken;
      do {
        const query = new URLSearchParams({prefix: projectRoot(tenantId, projectId), fields: "nextPageToken,items(name)"});
        if (pageToken) query.set("pageToken", pageToken);
        const r = await request(API + "/storage/v1/b/" + encodeURIComponent(bucket) + "/o?" + query);
        if (!r.ok) throw Error("concept listing failed");
        const page = await r.json();
        for (const item of page.items ?? []) {
          if (!item.name?.startsWith(projectRoot(tenantId, projectId))) continue;
          const del = await request(url(item.name), {method: "DELETE"});
          if (del.ok) removed++;
        }
        pageToken = page.nextPageToken;
      } while (pageToken);
      return removed;
    },
    async purgeExpired({tenantId, projectId, now = Date.now()} = {}) {
      // Scoped sweep only: a bucket-wide enumeration across tenants is
      // deliberately never performed (mirrors the project store, which
      // lists strictly inside one tenant prefix). Approved concepts are
      // preserved, exactly as in the filesystem/memory stores.
      if (!valid(tenantId) || !CONCEPT_ID_PATTERN.test(projectId ?? "")) return 0;
      const records = await store.list({tenantId, projectId});
      let removed = 0;
      for (const record of records) {
        if (record.approval?.approved === true) continue;
        if (record.expiresAt && Date.parse(record.expiresAt) <= now) {
          const del = await request(url(name(tenantId, projectId, record.conceptId)), {method: "DELETE"});
          if (del.ok) removed++;
        }
      }
      return removed;
    },
    get storageClass() { return "durable-gcs"; }
  };
  return store;
}
