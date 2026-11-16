#!/usr/bin/env node
// Mission Control — production configuration check (ops tooling).
//
// Validates the environment the server WOULD start with, for a production
// posture, without printing any secret value (presence + length only).
//
// FAIL (exit 1) when: demo mode is on (synthetic credentials must never be
// a production posture); the operator token, handoff secret, or actor-token
// registry is missing (the registry is a mandatory production item —
// without it, the shared operator token can write under any actor ID);
// the actor registry is not valid JSON mapping token -> actorId; the DB
// path is unset (the server would fall back to a CWD-relative file) or its
// directory does not exist / is not writable.
// WARN when: tenant id unset (server default applies), body cap unset
// (server default applies), port unset (8787 default).
//
// Usage: node ops/config-check.mjs   (reads process.env)
import { accessSync, constants, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";

const env = process.env;
const findings = [];
const fail = (code, detail) => findings.push({ level: "FAIL", code, detail });
const warn = (code, detail) => findings.push({ level: "WARN", code, detail });
const ok = (code, detail) => findings.push({ level: "OK", code, detail });

const present = (name) => typeof env[name] === "string" && env[name].length > 0;
const describe = (name) => present(name) ? `set (${env[name].length} chars)` : "MISSING";

if (env.MISSION_CONTROL_DEMO === "1") fail("demo_mode_on", "MISSION_CONTROL_DEMO=1 — synthetic demo credentials/posture must never run as production");
else ok("demo_mode_off", "MISSION_CONTROL_DEMO is not 1");

for (const name of ["MISSION_CONTROL_OPERATOR_TOKEN", "MISSION_CONTROL_HANDOFF_SECRET"]) {
  if (present(name)) ok(name.toLowerCase(), describe(name)); else fail(name.toLowerCase(), `${name} is ${describe(name)}`);
}

if (!present("MISSION_CONTROL_ACTOR_TOKENS")) {
  fail("actor_tokens", "MISSION_CONTROL_ACTOR_TOKENS is MISSING — per-actor token binding is mandatory in production");
} else {
  try {
    // Mirrors the server's normalizeActorTokens exactly (remediation
    // 2026-11-16, QUINCEY F-2): a plain object (never an array), no empty
    // token keys, every actor ID a non-blank string.
    const parsed = JSON.parse(env.MISSION_CONTROL_ACTOR_TOKENS);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object mapping");
    const entries = Object.entries(parsed);
    if (entries.length === 0) throw new Error("empty mapping");
    if (entries.some(([token, v]) => !token || typeof v !== "string" || !v.trim())) throw new Error("empty token or blank actor id");
    ok("actor_tokens", `valid JSON registry, ${entries.length} actor binding(s)`);
  } catch (err) {
    fail("actor_tokens", `MISSION_CONTROL_ACTOR_TOKENS is not a valid token->actorId JSON mapping (${err.message})`);
  }
}

if (!present("MISSION_CONTROL_DB_PATH")) {
  fail("db_path", "MISSION_CONTROL_DB_PATH is MISSING — the server would fall back to a CWD-relative mission-control.db");
} else {
  const dir = dirname(resolve(env.MISSION_CONTROL_DB_PATH));
  if (!existsSync(dir)) fail("db_path", `DB directory does not exist: ${dir}`);
  else {
    try { accessSync(dir, constants.W_OK); ok("db_path", `set; directory writable: ${dir}`); }
    catch { fail("db_path", `DB directory is not writable: ${dir}`); }
  }
}

if (!present("MISSION_CONTROL_TENANT_ID")) warn("tenant_id", "MISSION_CONTROL_TENANT_ID unset — server default tenant applies; set it explicitly in production");
else ok("tenant_id", describe("MISSION_CONTROL_TENANT_ID"));
if (!present("MISSION_CONTROL_MAX_BODY_BYTES")) warn("max_body_bytes", "MISSION_CONTROL_MAX_BODY_BYTES unset — server default applies");
if (!present("MISSION_CONTROL_PORT")) warn("port", "MISSION_CONTROL_PORT unset — 8787 default applies");

const failures = findings.filter(f => f.level === "FAIL").length;
console.log(JSON.stringify({ ok: failures === 0, failures, findings }, null, 2));
process.exit(failures === 0 ? 0 : 1);
