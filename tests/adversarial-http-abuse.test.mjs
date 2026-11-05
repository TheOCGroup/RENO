import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { request as httpRequest } from "node:http";
import { MissionControlStore } from "../src/missionControlStore.mjs";
import { createMissionControlServer } from "../src/missionControlServer.mjs";
import { receiveClosedAcquisition } from "../src/missionControlIntake.mjs";

// ADVERSARIAL FAMILY G — HTTP abuse (§7): malformed bodies, wrong
// content types, oversized bodies, path traversal, method confusion,
// duplicate headers, and tenant-override attempts through the query.

const PM = "pm-1";
const BOSS = "boss-1";
const OPERATOR_TOKEN = "test-operator-token";
const HANDOFF_SECRET = "test-handoff-secret";

function payload(id) {
  return {
    contractVersion: "1.0", sourceSystem: "pipeline", targetSystem: "mission-control",
    opportunityId: id, opportunityCode: `OCG-${id}`, propertyId: `property-${id}`, address: "700 Http Way",
    closedAt: "2026-09-25T16:00:00Z",
    acquisition: { purchasePrice: 150000, earnestMoney: 1000, strategyType: "cash_purchase", offerId: "offer-1", offerVersionId: "version-1" },
    underwriting: { sourceSystem: "deal-scout", sourceUnderwritingId: "victor-1", arv: 260000, rehab: 48000, mao: 160000, confidence: 0.9, limitations: null },
    renovationSeed: { budgetBaseline: 48000, scopeStatus: "needs_field_validation", projectStatus: "intake_ready" }
  };
}

async function startApp(t, options = {}) {
  const dir = mkdtempSync(join(tmpdir(), "mc-adv-g-"));
  const store = new MissionControlStore(join(dir, "mission-control.db"), { tenantId: options.tenantId || "default" });
  const app = createMissionControlServer({ store, operatorToken: OPERATOR_TOKEN, handoffSecret: HANDOFF_SECRET, ...options });
  await new Promise(resolve => app.server.listen(0, "127.0.0.1", resolve));
  t.after(() => { app.server.close(); store.close(); rmSync(dir, { recursive: true, force: true }); });
  const { project } = receiveClosedAcquisition({ handoffId: "handoff-g", payload: payload("opp-g"), repository: store.intakeRepository(options.tenantId || "default") });
  app.finance.setActorRole({ actorId: PM, role: "operator" });
  app.finance.setActorRole({ actorId: BOSS, role: "approver" });
  return { ...app, base: `http://127.0.0.1:${app.server.address().port}`, projectId: project.id };
}

/** Raw HTTP request with full control over the path and duplicate headers. */
function rawRequest(port, { method = "GET", path, headers = {}, body = null }) {
  return new Promise((resolve, reject) => {
    const req = httpRequest({ host: "127.0.0.1", port, method, path, headers }, (res) => {
      const chunks = [];
      res.on("data", c => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString("utf8") }));
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

test("G1: malformed bodies — broken JSON is a 400, an empty body is a 400, a JSON null body is a bounded 400 (never a crash or a write)", async (t) => {
  const app = await startApp(t);
  const headers = { authorization: `Bearer ${OPERATOR_TOKEN}`, "x-actor-id": PM, "content-type": "application/json" };
  const postRaw = (body) => fetch(`${app.base}/api/projects/${app.projectId}/invoices`, { method: "POST", headers, body });
  let res = await postRaw("{not json at all");
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error, "invalid_json");
  res = await postRaw("");
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error, "empty_request_body");
  res = await postRaw("null");
  assert.equal(res.status, 400); // null body reaches field access and is mapped to a bounded client error
  assert.equal((await res.json()).ok, false);
  res = await postRaw("[1,2,3]");
  assert.equal(res.status, 400);
  assert.equal(app.finance.listInvoices(app.projectId).length, 0, "no malformed body may write anything");
  // server is unharmed and responsive
  res = await fetch(`${app.base}/api/projects`, { headers: { authorization: `Bearer ${OPERATOR_TOKEN}` } });
  assert.equal(res.status, 200);
});

test("G2: content-type IS enforced on POST /api/* (defect OBS-G1) — a valid JSON body labeled text/plain is refused 415 and writes nothing", async (t) => {
  const app = await startApp(t);
  // AMENDMENT — re-chartered by coordinator 2026-11-03 under §4/§7.
  // Original pin: the server parsed the request body as JSON regardless
  // of the declared content type, so this text/plain POST returned 201
  // and wrote the invoice (OBS-G1, characterized as interop laxity).
  // New expectation: POST /api/* requires Content-Type
  // application/json — the same request is refused 415
  // unsupported_content_type before any parsing, and writes nothing.
  const res = await fetch(`${app.base}/api/projects/${app.projectId}/invoices`, {
    method: "POST",
    headers: { authorization: `Bearer ${OPERATOR_TOKEN}`, "x-actor-id": PM, "content-type": "text/plain" },
    body: JSON.stringify({ contractor: "Acme Builders", externalNumber: "INV-G2", lineItems: [{ description: "Work", amount: 100 }], evidenceRefs: ["evidence://g2"] }),
  });
  assert.equal(res.status, 415);
  assert.equal((await res.json()).error, "unsupported_content_type");
  assert.equal(app.finance.listInvoices(app.projectId).length, 0);
});

test("G3: oversized body — a stream-enforced cap (default 1 MiB) refuses a 5 MiB body with 413 body_too_large; malformed JSON under the cap is still a 400, and the server stays healthy", async (t) => {
  const app = await startApp(t);
  // AMENDMENT — re-chartered by coordinator 2026-11-03 under §4/§7.
  // Original pin: no size limit existed — readJsonBody buffered the
  // entire 5 MiB body before JSON.parse refused it, so this request
  // returned 400 invalid_json (OBS-G2 in UNIT-4-RECORD).
  // New expectation: the same request returns 413 body_too_large
  // (bytes past the cap are discarded as they arrive, never buffered),
  // while the original test's other half is preserved below: a
  // malformed-JSON body UNDER the cap still returns 400 invalid_json.
  const res = await fetch(`${app.base}/api/projects/${app.projectId}/invoices`, {
    method: "POST",
    headers: { authorization: `Bearer ${OPERATOR_TOKEN}`, "x-actor-id": PM, "content-type": "application/json" },
    body: "x".repeat(5 * 1024 * 1024),
  });
  assert.equal(res.status, 413);
  assert.equal((await res.json()).error, "body_too_large");
  const small = await fetch(`${app.base}/api/projects/${app.projectId}/invoices`, {
    method: "POST",
    headers: { authorization: `Bearer ${OPERATOR_TOKEN}`, "x-actor-id": PM, "content-type": "application/json" },
    body: "{not json at all",
  });
  assert.equal(small.status, 400);
  assert.equal((await small.json()).error, "invalid_json");
  const alive = await fetch(`${app.base}/api/projects`, { headers: { authorization: `Bearer ${OPERATOR_TOKEN}` } });
  assert.equal(alive.status, 200);
});

test("G4: path traversal — no repository file is reachable through the static surface", async (t) => {
  const app = await startApp(t);
  const port = app.server.address().port;
  const attempts = ["/../package.json", "/%2e%2e/package.json", "/web/../package.json", "/../src/missionControlStore.mjs", "/%2e%2e%2fpackage.json", "/..;/package.json", "/static/../../package.json"];
  for (const path of attempts) {
    const { status, body } = await rawRequest(port, { path });
    assert.equal(status, 404, path);
    assert.equal(body.includes("ocg-reno-mission-control"), false, `${path} must not leak package.json`);
    assert.equal(body.includes("MissionControlStore"), false, `${path} must not leak source`);
    assert.equal(body.includes("node:sqlite"), false, `${path} must not leak source`);
  }
});

test("G5: method confusion — non-POST verbs on API routes are 404s; non-POST verbs on the handoff path are 405s", async (t) => {
  const app = await startApp(t);
  const port = app.server.address().port;
  const auth = { authorization: `Bearer ${OPERATOR_TOKEN}` };
  const cases = [
    ["DELETE", "/api/projects", 404],
    ["PUT", "/api/projects", 404],
    ["PUT", `/api/projects/${app.projectId}`, 404],
    ["DELETE", `/api/projects/${app.projectId}`, 404],
    ["PATCH", `/api/projects/${app.projectId}/invoices`, 404],
    ["DELETE", `/api/projects/${app.projectId}/draws`, 404],
    ["POST", "/", 404],
    ["GET", "/api/v1/integrations/pipeline/acquisition-handoff", 405],
    ["DELETE", "/api/v1/integrations/pipeline/acquisition-handoff", 405],
    ["PUT", "/api/v1/integrations/pipeline/acquisition-handoff", 405],
  ];
  for (const [method, path, expected] of cases) {
    const { status, body } = await rawRequest(port, { method, path, headers: auth });
    assert.equal(status, expected, `${method} ${path}`);
    if (expected === 404) assert.equal(JSON.parse(body).error, "route_not_found");
    if (expected === 405) assert.equal(JSON.parse(body).error, "method_not_allowed");
  }
});

test("G6: duplicate Authorization headers — the parser keeps the FIRST value; an invalid first credential is never rescued by a valid second one", async (t) => {
  const app = await startApp(t);
  const port = app.server.address().port;
  // Probed semantics (Node HTTP): repeated authorization headers are NOT
  // joined — the first value wins and later duplicates are discarded by
  // the parser. The security property that matters holds: a request is
  // admitted only when the FIRST presented credential is exactly valid,
  // so duplicates can never upgrade an invalid credential.
  const cases = [
    [["Bearer wrong", `Bearer ${OPERATOR_TOKEN}`], 401], // valid second does NOT rescue
    [["Bearer wrong", "Bearer also-wrong"], 401],
    [[`Bearer ${OPERATOR_TOKEN}`, "Bearer wrong"], 200], // first is valid; trailing garbage discarded by the parser
    [[`Bearer ${OPERATOR_TOKEN}`, `Bearer ${OPERATOR_TOKEN}`], 200],
  ];
  for (const [values, expected] of cases) {
    const { status } = await rawRequest(port, { path: "/api/projects", headers: { authorization: values } });
    assert.equal(status, expected, `duplicate authorization headers (first=${values[0].slice(0, 13)}…)`);
  }
  const { status } = await rawRequest(port, { path: "/api/projects", headers: { authorization: `Bearer ${OPERATOR_TOKEN}` } });
  assert.equal(status, 200);
});

test("G7: tenant override attempts — query params and body fields cannot move a request across tenants", async (t) => {
  const app = await startApp(t);
  // a project that lives only in a foreign tenant
  const foreign = receiveClosedAcquisition({
    handoffId: "handoff-g-foreign",
    payload: payload("opp-g-foreign"),
    repository: app.store.intakeRepository("other-tenant"),
  });
  // query-string tenant selection on the detail route: still 404
  let res = await fetch(`${app.base}/api/projects/${foreign.project.id}?tenantId=other-tenant&tenant=other-tenant`, { headers: { authorization: `Bearer ${OPERATOR_TOKEN}` } });
  assert.equal(res.status, 404);
  // query params on the list route are ignored: the server tenant answers
  res = await fetch(`${app.base}/api/projects?tenantId=other-tenant`, { headers: { authorization: `Bearer ${OPERATOR_TOKEN}` } });
  assert.equal(res.status, 200);
  const list = (await res.json()).data;
  assert.equal(list.tenantId, "default");
  assert.equal(list.projects.some(p => p.id === foreign.project.id), false);
  // a tenantId smuggled in a WRITE body is ignored: the invoice lands in
  // the server's tenant and is invisible from the named one
  res = await fetch(`${app.base}/api/projects/${app.projectId}/invoices`, {
    method: "POST",
    headers: { authorization: `Bearer ${OPERATOR_TOKEN}`, "x-actor-id": PM, "content-type": "application/json" },
    body: JSON.stringify({ tenantId: "other-tenant", contractor: "Acme Builders", externalNumber: "INV-G7", lineItems: [{ description: "Work", amount: 100 }], evidenceRefs: ["evidence://g7"] }),
  });
  assert.equal(res.status, 201);
  const invoiceId = (await res.json()).data.id;
  assert.ok(app.finance.getInvoice(invoiceId, "default"));
  assert.equal(app.finance.getInvoice(invoiceId, "other-tenant"), null);
});
