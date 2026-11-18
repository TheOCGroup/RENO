/** Durable concept-history stores, mirroring project-store.mjs exactly in
 * shape: one JSON envelope per concept, keyed by a hash of
 * (tenantId, projectId, conceptId) so concept ids form a per-tenant,
 * per-project namespace — an id taken in one tenant/project is invisible to
 * every other (no cross-tenant existence oracle). The HTTP service mediates
 * all access (authentication, tenant scope, RBAC) before touching a store;
 * stores additionally re-validate every record's scope and integrity seal
 * on read and refuse corrupted records (load -> null, list -> skipped),
 * following the project store's fail-closed load contract.
 *
 * Deletion / retention: RENOVISION has no project-delete route and projects
 * carry no expiry, so concepts are retained with their project by default.
 * deleteForProject is the cascade a project deletion (or an operator
 * retention sweep) must call, and purgeExpired removes only concepts whose
 * record carries an explicit retentionDays/expiresAt — the same 1..365 day
 * retention contract as evidence storage. Approved concepts are never
 * removed by purgeExpired: an approved version is preserved until its
 * project is deleted.
 */
import {mkdir, readFile, readdir, rename, unlink, writeFile} from "node:fs/promises";
import {join} from "node:path";
import {createHash} from "node:crypto";
import {validateConceptRecord, applyConceptApproval, CONCEPT_ID_PATTERN} from "./concept-history.mjs";
const text = (x) => typeof x === "string" && x.trim().length > 0;
const keyOf = (tenantId, projectId, conceptId) => tenantId + "\n" + projectId + "\n" + conceptId;
const validScope = (tenantId, projectId, conceptId) => text(tenantId) && CONCEPT_ID_PATTERN.test(projectId ?? "") && CONCEPT_ID_PATTERN.test(conceptId ?? "");
function checkRecord(record, tenantId, projectId, conceptId) {
  if (!record || record.tenantId !== tenantId || record.projectId !== projectId || record.conceptId !== conceptId) return null;
  return validateConceptRecord(record).valid ? structuredClone(record) : null;
}
function conflictError() { const e = new Error("concept_already_exists"); e.code = "CONCEPT_CONFLICT"; return e; }
function writeConflictError() { const e = new Error("concept_write_conflict"); e.code = "CONCEPT_WRITE_CONFLICT"; return e; }

export function createMemoryConceptStore() {
  const records = new Map();
  return {
    async create(record) {
      if (!record || !validScope(record.tenantId, record.projectId, record.conceptId) || !validateConceptRecord(record).valid) throw Error("invalid concept record");
      const key = keyOf(record.tenantId, record.projectId, record.conceptId);
      if (records.has(key)) throw conflictError();
      records.set(key, structuredClone(record));
      return {saved: true, conceptId: record.conceptId};
    },
    async load({tenantId, projectId, conceptId} = {}) {
      if (!validScope(tenantId, projectId, conceptId)) return null;
      return checkRecord(records.get(keyOf(tenantId, projectId, conceptId)), tenantId, projectId, conceptId);
    },
    async list({tenantId, projectId} = {}) {
      if (!text(tenantId) || !CONCEPT_ID_PATTERN.test(projectId ?? "")) return [];
      const out = [];
      for (const record of records.values()) {
        if (record?.tenantId !== tenantId || record?.projectId !== projectId) continue;
        const ok = checkRecord(record, tenantId, projectId, record.conceptId);
        if (ok) out.push(ok);
      }
      return out.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.conceptId.localeCompare(b.conceptId));
    },
    async approve({tenantId, projectId, conceptId, approvedBy, approvedAt} = {}) {
      const current = await this.load({tenantId, projectId, conceptId});
      if (!current) return null;
      const next = applyConceptApproval(current, {approvedBy, approvedAt});
      records.set(keyOf(tenantId, projectId, conceptId), structuredClone(next));
      return structuredClone(next);
    },
    async deleteForProject({tenantId, projectId} = {}) {
      let removed = 0;
      for (const [key, record] of records) if (record?.tenantId === tenantId && record?.projectId === projectId) { records.delete(key); removed++; }
      return removed;
    },
    async purgeExpired({now = Date.now()} = {}) {
      let removed = 0;
      for (const [key, record] of records) {
        if (record?.approval?.approved === true) continue;
        if (record?.expiresAt && Date.parse(record.expiresAt) <= now) { records.delete(key); removed++; }
      }
      return removed;
    },
    get storageClass() { return "ephemeral-test-only"; }
  };
}

export function createFileConceptStore({rootDir} = {}) {
  if (!text(rootDir)) throw new TypeError("concept store root directory required");
  let ready = null;
  const ensureDir = () => (ready ??= mkdir(rootDir, {recursive: true}));
  const fileFor = (tenantId, projectId, conceptId) => join(rootDir, createHash("sha256").update(keyOf(tenantId, projectId, conceptId)).digest("hex") + ".json");
  const readEnvelope = async (file) => { try { return JSON.parse(await readFile(file, "utf8")); } catch { return null; } };
  const recordFromEnvelope = (envelope, tenantId, projectId, conceptId) => {
    if (!envelope || envelope.conceptId !== conceptId || envelope.tenantId !== tenantId || envelope.projectId !== projectId) return null;
    return checkRecord(envelope.record, tenantId, projectId, conceptId);
  };
  const writeEnvelope = async (record) => {
    await ensureDir();
    const file = fileFor(record.tenantId, record.projectId, record.conceptId);
    const envelope = {conceptId: record.conceptId, tenantId: record.tenantId, projectId: record.projectId, savedAt: new Date().toISOString(), record: structuredClone(record)};
    await writeFile(file + ".tmp", JSON.stringify(envelope));
    await rename(file + ".tmp", file);
  };
  const store = {
    async create(record) {
      if (!record || !validScope(record.tenantId, record.projectId, record.conceptId) || !validateConceptRecord(record).valid) throw Error("invalid concept record");
      await ensureDir();
      const existing = await readEnvelope(fileFor(record.tenantId, record.projectId, record.conceptId));
      if (existing) throw conflictError();
      await writeEnvelope(record);
      return {saved: true, conceptId: record.conceptId};
    },
    async load({tenantId, projectId, conceptId} = {}) {
      if (!validScope(tenantId, projectId, conceptId)) return null;
      return recordFromEnvelope(await readEnvelope(fileFor(tenantId, projectId, conceptId)), tenantId, projectId, conceptId);
    },
    async list({tenantId, projectId} = {}) {
      if (!text(tenantId) || !CONCEPT_ID_PATTERN.test(projectId ?? "")) return [];
      await ensureDir();
      const out = [];
      for (const name of await readdir(rootDir)) {
        if (!name.endsWith(".json")) continue;
        const envelope = await readEnvelope(join(rootDir, name));
        if (!envelope || envelope.tenantId !== tenantId || envelope.projectId !== projectId) continue;
        const record = recordFromEnvelope(envelope, tenantId, projectId, envelope.conceptId);
        if (record) out.push(record);
      }
      return out.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.conceptId.localeCompare(b.conceptId));
    },
    async approve({tenantId, projectId, conceptId, approvedBy, approvedAt} = {}) {
      const current = await store.load({tenantId, projectId, conceptId});
      if (!current) return null;
      const next = applyConceptApproval(current, {approvedBy, approvedAt});
      if (next.updatedAt !== current.updatedAt || !current.approval?.approved) await writeEnvelope(next);
      return structuredClone(next);
    },
    async deleteForProject({tenantId, projectId} = {}) {
      await ensureDir();
      let removed = 0;
      for (const name of await readdir(rootDir)) {
        if (!name.endsWith(".json")) continue;
        const envelope = await readEnvelope(join(rootDir, name));
        if (envelope?.tenantId === tenantId && envelope?.projectId === projectId) { await unlink(join(rootDir, name)).catch(() => {}); removed++; }
      }
      return removed;
    },
    async purgeExpired({now = Date.now()} = {}) {
      await ensureDir();
      let removed = 0;
      for (const name of await readdir(rootDir)) {
        if (!name.endsWith(".json")) continue;
        const envelope = await readEnvelope(join(rootDir, name));
        const record = envelope?.record;
        if (!record || record.approval?.approved === true) continue;
        if (record.expiresAt && Date.parse(record.expiresAt) <= now) { await unlink(join(rootDir, name)).catch(() => {}); removed++; }
      }
      return removed;
    },
    get storageClass() { return "durable-filesystem"; }
  };
  return store;
}
export {writeConflictError};
