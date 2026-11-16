#!/usr/bin/env node
// Mission Control — production backup (ops tooling, not part of the server).
//
// Creates a SQLite-consistent backup of the live database with VACUUM INTO
// (the certified recovery mechanism for this platform), then verifies the
// copy before declaring success: PRAGMA integrity_check, exact table counts
// vs the source, and the financial audit hash chain for every project.
//
// Usage: node ops/backup.mjs <source-db-path> <dest-db-path>
// Emits a JSON receipt on stdout (includes the backup's SHA-256).
// Exit 0 = backup created AND verified. Exit 1 = failure (dest removed).
import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { readFileSync, rmSync, existsSync } from "node:fs";
import { MissionControlStore } from "../src/missionControlStore.mjs";
import { MissionControlFinance } from "../src/financialGovernance.mjs";

const [src, dest] = process.argv.slice(2);
if (!src || !dest) { console.error("usage: node ops/backup.mjs <source-db-path> <dest-db-path>"); process.exit(2); }
if (!existsSync(src)) { console.error(`source not found: ${src}`); process.exit(1); }
if (existsSync(dest)) { console.error(`destination already exists (refusing to overwrite): ${dest}`); process.exit(1); }

const TABLES = ["projects", "invoices", "governed_draws", "payments", "reconciliations", "financial_audit", "events"];
function counts(db) {
  const out = {};
  for (const t of TABLES) {
    try { out[t] = db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n; } catch { out[t] = null; }
  }
  return out;
}

let receipt;
try {
  const source = new DatabaseSync(src, { readOnly: true });
  const srcCounts = counts(source);
  source.prepare("VACUUM INTO ?").run(dest);
  source.close();

  const backup = new DatabaseSync(dest, { readOnly: true });
  const integrity = backup.prepare("PRAGMA integrity_check").get()["integrity_check"];
  const destCounts = counts(backup);
  backup.close();
  if (integrity !== "ok") throw new Error(`integrity_check failed: ${integrity}`);
  for (const t of TABLES) {
    if (srcCounts[t] !== null && srcCounts[t] !== destCounts[t]) throw new Error(`count mismatch on ${t}: source ${srcCounts[t]} vs backup ${destCounts[t]}`);
  }

  // Audit-chain verification through the application's own modules.
  const store = new MissionControlStore(dest, {});
  const finance = new MissionControlFinance(store);
  const projects = store.listProjects(store.defaultTenantId);
  let chainsVerified = 0;
  for (const p of projects) { finance.verifyAuditChain(p.id); chainsVerified++; }
  store.close();

  const bytes = readFileSync(dest);
  receipt = { ok: true, source: src, backup: dest, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"), integrity, counts: destCounts, projects: projects.length, auditChainsVerified: chainsVerified };
} catch (err) {
  try { rmSync(dest, { force: true }); } catch {}
  console.error(JSON.stringify({ ok: false, error: String(err && err.message || err) }));
  process.exit(1);
}
console.log(JSON.stringify(receipt, null, 2));
