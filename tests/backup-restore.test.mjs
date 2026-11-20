import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, existsSync, copyFileSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { MissionControlStore } from "../src/missionControlStore.mjs";
import { MissionControlFinance } from "../src/financialGovernance.mjs";
import { receiveClosedAcquisition } from "../src/missionControlIntake.mjs";

// Production-readiness (2026-11-16): the ops backup/restore tooling must
// produce a verified, restorable backup and must FAIL loudly on tampered
// or truncated copies. Exercises ops/backup.mjs + ops/restore-drill.mjs
// as the operator would run them (child processes).

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const TENANT = "default";

function seedDb(dbPath, tenant = TENANT) {
  const store = new MissionControlStore(dbPath, { tenantId: tenant });
  const finance = new MissionControlFinance(store);
  finance.setActorRole({ tenantId: tenant, actorId: "op1", role: "operator" });
  finance.setActorRole({ tenantId: tenant, actorId: "ap1", role: "approver" });
  const repository = store.intakeRepository(tenant);
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
  const workflow = store.restoreWorkflow(project.id, { tenantId: tenant });
  workflow.validateScope({ actor: "op1", items: [{ title: "Roof", category: "exterior", estimatedCost: 10000 }] });
  workflow.approveBudget({ actor: "ap1", amount: 44000, contingencyPct: 10, rationale: "backup seed" });
  const bid = workflow.addBid({ actor: "op1", contractor: "Backup Builders", amount: 40000, days: 30 });
  workflow.selectBid({ actor: "ap1", bidId: bid.id, rationale: "backup seed" });
  workflow.scheduleWork({ actor: "op1", startAt: "2026-10-05T08:00:00Z", targetCompleteAt: "2026-12-01T17:00:00Z" });
  workflow.startWork({ actor: "op1", startedAt: "2026-10-05T08:05:00Z" });
  store.persistWorkflow(workflow, { tenantId: tenant });
  finance.submitInvoice({ tenantId: tenant, projectId: project.id, actor: "op1", contractor: "Backup Builders", externalNumber: "BKP-INV-1", lineItems: [{ description: "Roof tear-off", amount: 5000 }], evidenceRefs: ["evidence://backup/inv-1"] });
  store.close();
  return project.id;
}

function run(script, args, extraEnv = {}) {
  const env = { PATH: process.env.PATH, TMPDIR: process.env.TMPDIR || "", ...extraEnv };
  try {
    const out = execFileSync("node", [join(ROOT, "ops", script), ...args], { encoding: "utf8", env });
    return { code: 0, json: JSON.parse(out) };
  } catch (err) {
    let json = null;
    try { json = JSON.parse(String(err.stdout || "") || String(err.stderr || "")); } catch {}
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

test("F-1 regression: backup and drill FAIL on a chain-tampered database", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "mc-backup-test-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const dbPath = join(dir, "live.db");
  seedDb(dbPath);
  const good = join(dir, "good.db");
  assert.equal(run("backup.mjs", [dbPath, good]).code, 0);

  const tamper = (file, sql) => {
    const db = new DatabaseSync(file);
    db.prepare(sql).run();
    db.close();
  };

  // Variant 1: audit payload edited (hash no longer recomputes).
  const payloadTampered = join(dir, "payload-tampered.db");
  copyFileSync(good, payloadTampered);
  tamper(payloadTampered, "UPDATE financial_audit SET payload_json = '{}' WHERE seq = 1");
  const d1 = run("restore-drill.mjs", [payloadTampered]);
  assert.equal(d1.code, 1, "drill must fail on a payload-tampered chain");
  assert.equal(d1.json.ok, false);
  assert.match(d1.json.error, /audit chain verification FAILED/);

  // Variant 2: stored chain hash destroyed.
  const hashTampered = join(dir, "hash-tampered.db");
  copyFileSync(good, hashTampered);
  tamper(hashTampered, "UPDATE financial_audit SET hash = 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff' WHERE seq = 1");
  const d2 = run("restore-drill.mjs", [hashTampered]);
  assert.equal(d2.code, 1, "drill must fail on a hash-tampered chain");
  assert.equal(d2.json.ok, false);

  // Backup FROM a chain-broken source must refuse and leave no file.
  const refusedDest = join(dir, "refused.db");
  const b = run("backup.mjs", [payloadTampered, refusedDest]);
  assert.equal(b.code, 1, "backup of a chain-broken source must fail");
  assert.equal(existsSync(refusedDest), false, "a failed backup leaves no destination file");
});

test("F-3 regression: tenant resolution — wrong tenant fails loudly, right tenant verifies", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "mc-backup-test-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const dbPath = join(dir, "custom.db");
  seedDb(dbPath, "custom-tenant");

  const dest = join(dir, "custom-backup.db");
  const wrong = run("backup.mjs", [dbPath, dest]);
  assert.equal(wrong.code, 1, "default tenant against a custom-tenant DB must fail, not verify vacuously");
  assert.equal(existsSync(dest), false);

  const right = run("backup.mjs", [dbPath, dest], { MISSION_CONTROL_TENANT_ID: "custom-tenant" });
  assert.equal(right.code, 0, JSON.stringify(right.json));
  assert.equal(right.json.tenantId, "custom-tenant");
  assert.equal(right.json.counts.projects, 1);
  assert.equal(right.json.auditChainsVerified, 1);

  const drillWrong = run("restore-drill.mjs", [dest]);
  assert.equal(drillWrong.code, 1);
  const drillRight = run("restore-drill.mjs", [dest, right.json.sha256], { MISSION_CONTROL_TENANT_ID: "custom-tenant" });
  assert.equal(drillRight.code, 0, JSON.stringify(drillRight.json));
  assert.equal(drillRight.json.checks.auditChainsVerified, 1);
});
