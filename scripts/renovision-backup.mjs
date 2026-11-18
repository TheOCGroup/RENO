#!/usr/bin/env node
/** RENOVISION backup tooling.
 * Usage:
 *   node scripts/renovision-backup.mjs create <dataDir> <backupDir>
 *   node scripts/renovision-backup.mjs verify <backupDir>
 *   node scripts/renovision-backup.mjs restore <backupDir> <emptyDestDir>
 * Verification recomputes every file digest from the backup manifest;
 * restoration refuses unverified backups and non-empty destinations. */
import {createBackup, verifyBackup, restoreBackup} from "../lib/renovision/backup.mjs";
const [command, a, b] = process.argv.slice(2);
try {
 if (command === "create") { const r = await createBackup({sourceDir: a, destDir: b}); console.log(JSON.stringify({ok: true, fileCount: r.fileCount, format: r.manifest.format})); }
 else if (command === "verify") { const r = await verifyBackup({backupDir: a}); console.log(JSON.stringify({ok: r.valid, errors: r.errors, fileCount: r.fileCount})); process.exitCode = r.valid ? 0 : 2; }
 else if (command === "restore") { const r = await restoreBackup({backupDir: a, destDir: b}); console.log(JSON.stringify({ok: true, restored: r.restored, fileCount: r.fileCount})); }
 else { console.error("usage: create <dataDir> <backupDir> | verify <backupDir> | restore <backupDir> <emptyDestDir>"); process.exitCode = 64; }
} catch (e) { console.log(JSON.stringify({ok: false, errors: [e.message]})); process.exitCode = 2; }
