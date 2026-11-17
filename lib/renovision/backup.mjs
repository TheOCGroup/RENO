/** Backup and restoration for a RENOVISION data directory (evidence, spatial
 * events, projects). A backup copies the tree and records a SHA-256 manifest
 * of every file; verification recomputes the manifest, and restoration refuses
 * to proceed when verification fails or the destination is not empty. */
import {cp, mkdir, readFile, readdir, rm, stat, writeFile} from "node:fs/promises";
import {join, relative, sep} from "node:path";
import {createHash} from "node:crypto";
const MANIFEST = "backup-manifest.json";
async function walk(dir, base = dir, out = []) {
 for (const name of await readdir(dir)) {
   const full = join(dir, name);
   const s = await stat(full);
   if (s.isDirectory()) await walk(full, base, out);
   else out.push(relative(base, full).split(sep).join("/"));
 }
 return out;
}
const digestFile = async (path) => "sha256:" + createHash("sha256").update(await readFile(path)).digest("hex");
export async function createBackup({sourceDir, destDir, createdAt = new Date().toISOString()} = {}) {
 if (!sourceDir || !destDir) throw Error("backup source and destination required");
 await mkdir(destDir, {recursive: true});
 await cp(sourceDir, destDir, {recursive: true, errorOnExist: false, force: true});
 const files = [];
 for (const rel of (await walk(destDir)).filter((f) => f !== MANIFEST).sort()) {
   files.push({path: rel, sha256: await digestFile(join(destDir, rel)), bytes: (await stat(join(destDir, rel))).size});
 }
 const manifest = {format: "renovision-backup/v1", createdAt, files};
 await writeFile(join(destDir, MANIFEST), JSON.stringify(manifest, null, 2));
 return {manifest, fileCount: files.length};
}
export async function verifyBackup({backupDir} = {}) {
 const manifest = JSON.parse(await readFile(join(backupDir, MANIFEST), "utf8"));
 if (manifest?.format !== "renovision-backup/v1" || !Array.isArray(manifest.files)) return {valid: false, errors: ["backup manifest invalid"]};
 const errors = [];
 const present = new Set((await walk(backupDir)).filter((f) => f !== MANIFEST));
 for (const entry of manifest.files) {
   if (!present.has(entry.path)) { errors.push("missing file: " + entry.path); continue; }
   if (await digestFile(join(backupDir, entry.path)) !== entry.sha256) errors.push("digest mismatch: " + entry.path);
   present.delete(entry.path);
 }
 if (present.size) errors.push("unexpected files: " + [...present].join(", "));
 return {valid: errors.length === 0, errors, fileCount: manifest.files.length};
}
export async function restoreBackup({backupDir, destDir} = {}) {
 const check = await verifyBackup({backupDir});
 if (!check.valid) throw Error("backup verification failed: " + check.errors.join("; "));
 const existing = await readdir(destDir).catch(() => []);
 if (existing.length > 0) throw Error("restore destination is not empty");
 await mkdir(destDir, {recursive: true});
 await cp(backupDir, destDir, {recursive: true, filter: (src) => !src.endsWith(MANIFEST)});
 return {restored: true, fileCount: check.fileCount};
}
export async function clearDirectory(dir) { await rm(dir, {recursive: true, force: true}); await mkdir(dir, {recursive: true}); }
