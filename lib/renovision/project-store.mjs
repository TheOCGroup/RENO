/** Durable project store: one JSON record per project, written atomically
 * (temp file + rename). Records are keyed by tenant + project id, so project
 * ids form a per-tenant namespace: an id taken in one tenant is invisible to
 * every other tenant (no cross-tenant existence oracle), and the HTTP service
 * mediates all access (authentication, tenant scope, RBAC) before touching
 * this store. */
import {mkdir, readFile, readdir, rename, writeFile} from "node:fs/promises";
import {join} from "node:path";
import {createHash} from "node:crypto";
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const text = (x) => typeof x === "string" && x.trim().length > 0;
export function createFileProjectStore({rootDir} = {}) {
 if (typeof rootDir !== "string" || !rootDir.trim()) throw new TypeError("project store root directory required");
 let ready = null;
 const ensureDir = () => (ready ??= mkdir(rootDir, {recursive: true}));
 const fileFor = (tenantId, projectId) => join(rootDir, createHash("sha256").update(tenantId + "\n" + projectId).digest("hex") + ".json");
 return {
   async save(projectId, data) {
     if (!ID_PATTERN.test(projectId ?? "") || !data || data.projectId !== projectId || !text(data.tenantId)) throw Error("invalid project record");
     await ensureDir();
     const file = fileFor(data.tenantId, projectId);
     await writeFile(file + ".tmp", JSON.stringify({projectId, tenantId: data.tenantId, savedAt: new Date().toISOString(), data}));
     await rename(file + ".tmp", file);
     return {saved: true, projectId};
   },
   async load(projectId, tenantId) {
     if (!ID_PATTERN.test(projectId ?? "") || !text(tenantId)) return null;
     try {
       const record = JSON.parse(await readFile(fileFor(tenantId, projectId), "utf8"));
       if (!record || record.projectId !== projectId || record.tenantId !== tenantId || record.data?.projectId !== projectId || record.data?.tenantId !== tenantId) return null;
       return record.data;
     } catch { return null; }
   },
   async list(tenantId) {
     await ensureDir();
     const ids = [];
     for (const name of await readdir(rootDir)) {
       if (!name.endsWith(".json")) continue;
       try { const record = JSON.parse(await readFile(join(rootDir, name), "utf8")); if (record?.projectId && (!text(tenantId) || record.tenantId === tenantId)) ids.push(record.projectId); } catch { /* skip torn records */ }
     }
     return ids.sort();
   },
   get storageClass() { return "durable-filesystem"; }
 };
}
