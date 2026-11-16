import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Production-readiness (2026-11-16): ops/config-check.mjs must accept a
// complete production posture and refuse unsafe ones — demo mode, missing
// secrets, missing actor registry, missing DB path — without ever printing
// a secret value.

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function run(env) {
  try {
    const out = execFileSync("node", [join(ROOT, "ops", "config-check.mjs")], { encoding: "utf8", env: { PATH: process.env.PATH, ...env } });
    return { code: 0, json: JSON.parse(out), raw: out };
  } catch (err) {
    return { code: err.status ?? 1, json: JSON.parse(String(err.stdout || "{}")), raw: String(err.stdout || "") };
  }
}

function goodEnv(dir) {
  return {
    MISSION_CONTROL_OPERATOR_TOKEN: "op-secret-value",
    MISSION_CONTROL_HANDOFF_SECRET: "handoff-secret-value",
    MISSION_CONTROL_ACTOR_TOKENS: JSON.stringify({ "pm-token-value": "pm-1", "ap-token-value": "ap-1" }),
    MISSION_CONTROL_DB_PATH: join(dir, "mc.db"),
    MISSION_CONTROL_TENANT_ID: "ocg",
    MISSION_CONTROL_PORT: "8787",
  };
}

test("config-check accepts a complete production posture and prints no secret values", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "mc-config-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const r = run(goodEnv(dir));
  assert.equal(r.code, 0, JSON.stringify(r.json));
  assert.equal(r.json.ok, true);
  for (const secret of ["op-secret-value", "handoff-secret-value", "pm-token-value", "ap-token-value"]) {
    assert.ok(!r.raw.includes(secret), `config-check must never print ${secret}`);
  }
});

test("config-check refuses demo mode, missing registry, missing secrets, missing DB path", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "mc-config-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const good = goodEnv(dir);
  const codes = (r) => r.json.findings.filter(f => f.level === "FAIL").map(f => f.code);

  const demo = run({ ...good, MISSION_CONTROL_DEMO: "1" });
  assert.equal(demo.code, 1); assert.ok(codes(demo).includes("demo_mode_on"));

  const noRegistry = { ...good }; delete noRegistry.MISSION_CONTROL_ACTOR_TOKENS;
  const r2 = run(noRegistry);
  assert.equal(r2.code, 1); assert.ok(codes(r2).includes("actor_tokens"));

  const badRegistry = run({ ...good, MISSION_CONTROL_ACTOR_TOKENS: "not-json" });
  assert.equal(badRegistry.code, 1); assert.ok(codes(badRegistry).includes("actor_tokens"));

  const noDb = { ...good }; delete noDb.MISSION_CONTROL_DB_PATH;
  const r3 = run(noDb);
  assert.equal(r3.code, 1); assert.ok(codes(r3).includes("db_path"));

  const empty = run({});
  assert.equal(empty.code, 1);
  assert.ok(codes(empty).length >= 4, "an empty environment fails on every mandatory item");
});
