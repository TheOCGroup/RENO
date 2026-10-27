/** Durable project store: one JSON record per project, written atomically
 * (temp file + rename). The HTTP service mediates all access (authentication,
 * tenant scope, RBAC) before touching this store; the store itself only
 * guarantees durable, non-torn records keyed by a traversal-safe project id. */
import {mkdir, readFile, readdir, rename, writeFile} from "node:fs/promises";
import {join} from "node:path";
import {createHash} from "node:crypto";
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
export function createFileProjectStore({rootDir} = {}) {
 if (typeof rootDir !== "string" || !rootDir.trim()) throw new TypeError("project store root directory required");
 let ready = null;
 const ensureDir = () => (ready ??= mkdir(rootDir, {recursive: true}));
 const fileFor = (projectId) => join(rootDir, createHash("sha256").update(projectId).digest("hex") + ".json");
 return {
   async save(projectId, data) {
     if (!ID_PATTERN.test(projectId ?? "") || !data || data.projectId !== projectId) throw Error("invalid project record");
     await ensureDir();
     const file = fileFor(projectId);
     await writeFile(file + ".tmp", JSON.stringify({projectId, savedAt: new Date().toISOString(), data}));
     await rename(file + ".tmp", file);
     return {saved: true, projectId};
   },
   async load(projectId) {
     if (!ID_PATTERN.test(projectId ?? "")) return null;
     try {
       const record = JSON.parse(await readFile(fileFor(projectId), "utf8"));
       if (!record || record.projectId !== projectId || record.data?.projectId !== projectId) return null;
       return record.data;
     } catch { return null; }
   },
   async list() {
     await ensureDir();
     const ids = [];
     for (const name of await readdir(rootDir)) {
       if (!name.endsWith(".json")) continue;
       try { const record = JSON.parse(await readFile(join(rootDir, name), "utf8")); if (record?.projectId) ids.push(record.projectId); } catch { /* skip torn records */ }
     }
     return ids.sort();
   },
   get storageClass() { return "durable-filesystem"; }
 };
}
