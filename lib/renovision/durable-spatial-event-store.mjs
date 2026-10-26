/** Durable filesystem compare-and-append spatial event store.
 * Implements the transactional store contract consumed by commitSpatialEvent
 * (readFeatureEvents / compareAndAppend) with the same revision semantics as the
 * in-memory fixture, plus tenant-scoped authorization on every operation.
 * Single-process durability: writes are atomic (temp file + rename); the revision
 * compare-and-append check fails closed on any conflict. */
import {mkdir, readFile, rename, writeFile} from "node:fs/promises";
import {join} from "node:path";
import {createHash} from "node:crypto";
export function createDurableSpatialEventStore({rootDir, authorize} = {}) {
 if (typeof rootDir !== "string" || !rootDir.trim()) throw new TypeError("durable event store root directory required");
 if (typeof authorize !== "function") throw new TypeError("authorization callback required");
 let ready = null;
 const ensureDir = () => (ready ??= mkdir(rootDir, {recursive: true}));
 const fileFor = (scope) => join(rootDir, createHash("sha256").update(JSON.stringify([scope.tenantId, scope.propertyId, scope.roomId, scope.featureId])).digest("hex") + ".json");
 const clone = (e) => structuredClone(e);
 const readRecord = async (scope) => {
   try {
     const parsed = JSON.parse(await readFile(fileFor(scope), "utf8"));
     if (!parsed || !Number.isSafeInteger(parsed.revision) || parsed.revision < 0 || !Array.isArray(parsed.events) || parsed.revision !== parsed.events.length) throw Error("corrupt event record");
     return parsed;
   } catch (e) {
     if (e && e.code === "ENOENT") return {revision: 0, events: []};
     throw e;
   }
 };
 return {
   async readFeatureEvents(scope) {
     if (!await authorize({...scope, action: "read"})) throw Error("access denied");
     const record = await readRecord(scope);
     return {revision: record.revision, events: record.events.map(clone)};
   },
   async compareAndAppend(scope) {
     if (!await authorize({...scope, action: "write"})) throw Error("access denied");
     await ensureDir();
     const record = await readRecord(scope);
     if (record.revision !== scope.expectedRevision) return {committed: false};
     if (scope.event?.propertyId !== scope.propertyId || scope.event?.roomId !== scope.roomId || scope.event?.featureId !== scope.featureId) return {committed: false};
     const next = {revision: record.revision + 1, events: [...record.events, clone(scope.event)]};
     const file = fileFor(scope);
     await writeFile(file + ".tmp", JSON.stringify(next));
     await rename(file + ".tmp", file);
     return {committed: true, revision: next.revision};
   },
   get storageClass() { return "durable-filesystem"; }
 };
}
