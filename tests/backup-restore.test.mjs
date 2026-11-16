import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, existsSync, copyFileSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { MissionControlStore } from "../src/missionControlStore.mjs";
import { MissionControlFinance } from "../src/financialGovernance.mjs";
import { receiveClosedAcquisition } from "../src/missionControlIntake.mjs";

// Production-readiness (2026-11-16): the ops backup/restore tooling must
// produce a verified, restorable backup and must FAIL loudly on tampered
// or truncated copies. Exercises ops/backup.mjs + ops/restore-drill.mjs
// as the operator would run them (child processes).

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const TENANT = "default";

function seedDb(dbPath) {
  const store = new MissionControlStore(dbPath, { tenantId: TENANT });
  const finance = new MissionControlFinance(store);
  finance.setActorRole({ tenantId: TENANT, actorId: "op1", role: "operator" });
  finance.setActorRole({ tenantId: TENANT, actorId: "ap1", role: "approver" });
  const repository = store.intakeRepository(TENANT);
  const { project } = receiveClosedAcquisition({
    handoffId: "backup-handoff-1",
    payload: {
      contractVersion: "1.0", sourceSystem: "pipeline", targetSystem: "mission-control",
      opportunityId: "backup-opp-1", opportunityCode: "BKP-backup-opp-1", propertyId: "backup-property-1",
      address: "1 Backup Way, Wichita, KS", closedAt: "2026-10-01T16:00:00Z",
      acquisition: { purchasePrice: 100000, earnestMoney: 1000, strategyType: "cash_purchase", offerId: "backup-offer-1", offerVersionId: "backup-version-1" },
      underwriting: { sourceSystem: "deal-scout", sourceUnderwritingId: "backup-victor-1", arv: 210000, rehab: 40000, mao: 110000, confidence: 0.9, limitations: null },
      renovationSeed: { budgetBaseline: 40000, scopeStatus: "needs_field_validation", projectStatus: "intake_ready" },
    },
    repository,
  });
  const workflow = store.restoreWorkflow(project.id, { tenantId: TENANT });
  workflow.validateScope({ actor: "op1", items: [{ title: "Roof", category: "exterior", estimatedCost: 10000 }] });
  workflow.approveBudget({ actor: "ap1", amount: 44000, contingencyPct: 10, rationale: "backup seed" });
  const bid = workflow.addBid({ actor: "op1", contractor: "Backup Builders", amount: 40000, days: 30 });
  workflow.selectBid({ actor: "ap1", bidId: bid.id, rationale: "backup seed" });
  workflow.scheduleWork({ actor: "op1", startAt: "2026-10-05T08:00:00Z", targetCompleteAt: "2026-12-01T17:00:00Z" });
  workflow.startWork({ actor: "op1", startedAt: "2026-10-05T08:05:00Z" });
  store.persistWorkflow(workflow, { tenantId: TENANT });
  finance.submitInvoice({ tenantId: TENANT, projectId: project.id, actor: "op1", contractor: "Backup Builders", externalNumber: "BKP-INV-1", lineItems: [{ description: "Roof tear-off", amount: 5000 }], evidenceRefs: ["evidence://backup/inv-1"] });
  store.close();
  return project.id;
}

function run(script, args) {
  try {
    const out = execFileSync("node", [join(ROOT, "ops", script), ...args], { encoding: "utf8" });
    return { code: 0, json: JSON.parse(out) };
  } catch (err) {
    let json = null;
    try { json = JSON.parse(String(err.stdout || "")); } catch {}
    return { code: err.status ?? 1, json, stderr: String(err.stderr || "") };
  }
}

test("backup produces a verified copy and the restore drill passes on it", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "mc-backup-test-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const dbPath = join(dir, "live.db");
  seedDb(dbPath);
  const dest = join(dir, "backup.db");

  const backup = run("backup.mjs", [dbPath, dest]);
  assert.equal(backup.code, 0, `backup failed: ${backup.stderr}`);
  assert.equal(backup.json.ok, true);
  assert.equal(backup.json.integrity, "ok");
  assert.equal(backup.json.counts.projects, 1);
  assert.equal(backup.json.counts.invoices, 1);
  assert.ok(backup.json.counts.financial_audit >= 1, "audit rows carried into the backup");
  assert.equal(backup.json.auditChainsVerified, 1);
  assert.match(backup.json.sha256, /^[0-9a-f]{64}$/);

  const drill = run("restore-drill.mjs", [dest]);
  assert.equal(drill.code, 0, `drill failed on a good backup: ${JSON.stringify(drill.json)}`);
  assert.equal(drill.json.ok, true);
  assert.equal(drill.json.checks.projectsReadable, 1);
  assert.equal(drill.json.checks.auditChainsVerified, 1);

  // Refusals: existing destination and missing source.
  assert.equal(run("backup.mjs", [dbPath, dest]).code, 1);
  assert.equal(run("backup.mjs", [join(dir, "nope.db"), join(dir, "x.db")]).code, 1);
  assert.equal(existsSync(join(dir, "x.db")), false);
});

test("restore drill FAILS on a tampered backup and on a truncated backup", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "mc-backup-test-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const dbPath = join(dir, "live.db");
  seedDb(dbPath);
  const dest = join(dir, "backup.db");
  const receipt = run("backup.mjs", [dbPath, dest]);
  assert.equal(receipt.code, 0);

  // The untampered backup passes WITH its correct receipt hash.
  const drillGood = run("restore-drill.mjs", [dest, receipt.json.sha256]);
  assert.equal(drillGood.code, 0, `good backup + correct hash must pass: ${JSON.stringify(drillGood.json)}`);

  const tampered = join(dir, "tampered.db");
  copyFileSync(dest, tampered);
  const bytes = readFileSync(tampered);
  bytes[Math.floor(bytes.length / 2)] ^= 0xff;
  bytes[Math.floor(bytes.length / 2) + 4096] ^= 0xff;
  writeFileSync(tampered, bytes);
  // Content-level tampering is caught by the receipt hash (integrity_check
  // alone verifies structure, not non-audit content — see ops/restore-drill).
  const drillTampered = run("restore-drill.mjs", [tampered, receipt.json.sha256]);
  assert.equal(drillTampered.code, 1, "tampered backup must fail the drill");
  assert.equal(drillTampered.json.ok, false);
  assert.match(drillTampered.json.error, /sha256 mismatch/);


  const truncated = join(dir, "truncated.db");
  writeFileSync(truncated, readFileSync(dest).subarray(0, 1024));
  const drillTruncated = run("restore-drill.mjs", [truncated]);
  assert.equal(drillTruncated.code, 1, "truncated backup must fail the drill");
});
