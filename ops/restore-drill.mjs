#!/usr/bin/env node
// Mission Control — restore drill (ops tooling, not part of the server).
//
// Proves a backup is restorable WITHOUT touching any live database: the
// backup is copied to a scratch file, opened through the application's own
// store, and verified (integrity_check, table counts, per-project audit
// hash chain, and a live read of every project). A corrupt or tampered
// backup FAILS the drill loudly.
//
// Usage: node ops/restore-drill.mjs <backup-db-path> [expected-sha256]
// When expected-sha256 (from the backup receipt) is supplied, the file's
// SHA-256 must match BEFORE it is opened — this is the content-level
// tamper control: PRAGMA integrity_check verifies B-tree structure and
// the audit chain covers financial rows, but neither detects edits to
// non-audit content (e.g. project JSON). The receipt hash does.
// Emits a JSON report on stdout. Exit 0 = drill PASS. Exit 1 = drill FAIL.
import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { copyFileSync, mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MissionControlStore } from "../src/missionControlStore.mjs";
import { MissionControlFinance } from "../src/financialGovernance.mjs";

const [backupPath, expectedSha] = process.argv.slice(2);
if (!backupPath) { console.error("usage: node ops/restore-drill.mjs <backup-db-path> [expected-sha256]"); process.exit(2); }

const dir = mkdtempSync(join(tmpdir(), "mc-restore-drill-"));
const scratch = join(dir, "restored.db");
const report = { ok: false, backup: backupPath, checks: {} };
try {
  if (expectedSha) {
    const actual = createHash("sha256").update(readFileSync(backupPath)).digest("hex");
    report.checks.sha256 = actual;
    if (actual !== expectedSha.toLowerCase()) throw new Error(`sha256 mismatch: expected ${expectedSha.toLowerCase()}, got ${actual}`);
  }
  copyFileSync(backupPath, scratch);
  const raw = new DatabaseSync(scratch, { readOnly: true });
  report.checks.integrity = raw.prepare("PRAGMA integrity_check").get()["integrity_check"];
  const tables = {};
  for (const t of ["projects", "invoices", "governed_draws", "payments", "reconciliations", "financial_audit", "events"]) {
    try { tables[t] = raw.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n; } catch { tables[t] = null; }
  }
  raw.close();
  report.checks.counts = tables;
  if (report.checks.integrity !== "ok") throw new Error(`integrity_check: ${report.checks.integrity}`);

  // verifyAuditChain returns a boolean verdict; false FAILS the drill
  // (remediation 2026-11-16, QUINCEY F-1). Tenant resolves from
  // MISSION_CONTROL_TENANT_ID (default "default"); a tenant that sees no
  // projects in a non-empty backup fails loudly (QUINCEY F-3).
  const tenantId = process.env.MISSION_CONTROL_TENANT_ID || "default";
  const store = new MissionControlStore(scratch, { tenantId });
  const finance = new MissionControlFinance(store);
  const projects = store.listProjects(tenantId);
  if (tables.projects > 0 && projects.length === 0) {
    store.close();
    throw new Error(`tenant mismatch: backup holds ${tables.projects} project(s) but tenant "${tenantId}" sees none — set MISSION_CONTROL_TENANT_ID to the database's tenant`);
  }
  let verified = 0;
  for (const p of projects) {
    if (finance.verifyAuditChain(p.id, tenantId) !== true) { store.close(); throw new Error(`audit chain verification FAILED for project ${p.id}`); }
    verified++;
  }
  report.checks.tenantId = tenantId;
  report.checks.projectsReadable = projects.length;
  report.checks.auditChainsVerified = verified;
  store.close();
  report.ok = true;
} catch (err) {
  report.error = String(err && err.message || err);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
console.log(JSON.stringify(report, null, 2));
process.exit(report.ok ? 0 : 1);
