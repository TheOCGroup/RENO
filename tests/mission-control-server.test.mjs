import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MissionControlStore } from "../src/missionControlStore.mjs";
import { createMissionControlServer } from "../src/missionControlServer.mjs";
import { receiveClosedAcquisition } from "../src/missionControlIntake.mjs";
import { verifyLenderPackage } from "../src/operationsCompletion.mjs";

const OPERATOR_TOKEN = "test-operator-token";
const HANDOFF_SECRET = "test-handoff-secret";
const PM = "pm-1";
const BOSS = "boss-1";

function handoffPayload(opportunityId = "opp-http", address = "100 Operator Way") {
  return {
    contractVersion: "1.0",
    sourceSystem: "pipeline",
    targetSystem: "mission-control",
    opportunityId,
    opportunityCode: `OCG-${opportunityId}`,
    propertyId: `property-${opportunityId}`,
    address,
    closedAt: "2026-09-25T16:00:00Z",
    acquisition: { purchasePrice: 150000, earnestMoney: 1000, strategyType: "cash_purchase", offerId: "offer-1", offerVersionId: "version-1" },
    underwriting: { sourceSystem: "deal-scout", sourceUnderwritingId: "victor-1", arv: 260000, rehab: 48000, mao: 160000, confidence: 0.9, limitations: null },
    renovationSeed: { budgetBaseline: 48000, scopeStatus: "needs_field_validation", projectStatus: "intake_ready" },
  };
}

async function startApp(t, options = {}) {
  const dir = mkdtempSync(join(tmpdir(), "mc-server-"));
  const store = new MissionControlStore(join(dir, "mission-control.db"), { tenantId: options.tenantId || "default" });
  const app = createMissionControlServer({
    store,
    operatorToken: OPERATOR_TOKEN,
    handoffSecret: HANDOFF_SECRET,
    ...options,
  });
  await new Promise(resolve => app.server.listen(0, "127.0.0.1", resolve));
  t.after(() => { app.server.close(); store.close(); rmSync(dir, { recursive: true, force: true }); });
  return { ...app, base: `http://127.0.0.1:${app.server.address().port}` };
}

function operatorHeaders(extra = {}) {
  return { authorization: `Bearer ${OPERATOR_TOKEN}`, ...extra };
}
function actorHeaders(actorId, role) {
  return operatorHeaders({ "x-actor-id": actorId, ...(role ? { "x-actor-role": role } : {}) });
}
async function post(base, path, { headers = {}, body } = {}) {
  return fetch(`${base}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body ?? {}),
  });
}

/** Drive an intaken project to in_progress with 50% progress, directly on the store. */
function driveToInProgress(store, projectId) {
  const workflow = store.restoreWorkflow(projectId);
  workflow.validateScope({ items: [
    { title: "Roof replacement", category: "exterior", estimatedCost: 12000 },
    { title: "Kitchen remodel", category: "interior", estimatedCost: 30000 },
  ] });
  workflow.approveBudget({ amount: 50000, contingencyPct: 10, rationale: "Baselines verified" });
  const bid = workflow.addBid({ contractor: "Acme Builders", amount: 48000, days: 45 });
  workflow.selectBid({ bidId: bid.id, rationale: "Best coverage within authority" });
  workflow.scheduleWork({ startAt: "2026-10-01T08:00:00Z", targetCompleteAt: "2026-11-15T17:00:00Z" });
  workflow.startWork({ startedAt: "2026-10-01T08:05:00Z" });
  store.persistWorkflow(workflow);
  const operations = store.restoreOperations(workflow);
  operations.recordProgress({ percentComplete: 50, evidenceRefs: ["evidence://progress-50"], note: "Roof done, kitchen framed" });
  store.persistOperations(operations);
}

test("operator page is served openly with the required landmarks and zero external references", async t => {
  const { base } = await startApp(t);
  const res = await fetch(`${base}/`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type"), /text\/html/);
  const html = await res.text();
  for (const landmark of ["id=\"project-list\"", "id=\"project-list-items\"", "id=\"next-action\"", "id=\"budget-summary\"",
    "id=\"section-draws\"", "id=\"section-invoices\"", "id=\"section-inspections\"", "id=\"section-tasks\"", "id=\"section-risks\"",
    "Draws &amp; Payments", "Invoices", "Inspections", "Tasks", "Risks", "id=\"demo-banner\""]) {
    assert.ok(html.includes(landmark), `page is missing landmark ${landmark}`);
  }
  assert.equal(/https?:\/\//.test(html), false, "operator page must reference no external URLs");
});

test("API fails closed: 503 when the operator token is unconfigured, 401 when missing or wrong", async t => {
  const unconfigured = await startApp(t, { operatorToken: null });
  let res = await fetch(`${unconfigured.base}/api/projects`, { headers: operatorHeaders() });
  assert.equal(res.status, 503);
  assert.equal((await res.json()).error, "operator_auth_not_configured");
  // the page itself is not sensitive and still serves
  res = await fetch(`${unconfigured.base}/`);
  assert.equal(res.status, 200);

  const { base } = await startApp(t);
  res = await fetch(`${base}/api/projects`);
  assert.equal(res.status, 401);
  assert.equal((await res.json()).error, "unauthorized");
  res = await fetch(`${base}/api/projects`, { headers: { authorization: "Bearer wrong-token" } });
  assert.equal(res.status, 401);
});

test("clients cannot select a tenant: tenant headers and query params are ignored", async t => {
  const app = await startApp(t);
  // a project that lives only in a foreign tenant, written directly to the store
  const foreign = receiveClosedAcquisition({
    handoffId: "foreign-handoff",
    payload: handoffPayload("opp-foreign", "999 Foreign Terrace"),
    repository: app.store.intakeRepository("other-tenant"),
  });
  const res = await fetch(`${app.base}/api/projects`, {
    headers: operatorHeaders({ "x-tenant-id": "other-tenant", "x-tenant": "other-tenant" }),
  });
  // re-request with a query string too
  const res2 = await fetch(`${app.base}/api/projects?tenantId=other-tenant&tenant=other-tenant`, { headers: operatorHeaders() });
  for (const r of [res, res2]) {
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.equal(body.data.tenantId, "default");
    assert.equal(body.data.projects.some(p => p.id === foreign.project.id), false);
  }
  const detail = await fetch(`${app.base}/api/projects/${foreign.project.id}`, { headers: operatorHeaders() });
  assert.equal(detail.status, 404);
  assert.equal((await detail.json()).error, "project_not_found");
});

test("full operator flow over HTTP: handoff -> invoice -> review -> draw -> independent decision -> payment -> reconciliation -> lender package", async t => {
  const app = await startApp(t);
  const { base, store, finance } = app;
  finance.setActorRole({ actorId: PM, role: "operator" });
  finance.setActorRole({ actorId: BOSS, role: "approver" });

  // 1. handoff intake through the EXISTING receiver path, with its own secret
  let res = await post(base, "/api/v1/integrations/pipeline/acquisition-handoff", {
    headers: { authorization: `Bearer ${HANDOFF_SECRET}` },
    body: { handoffId: "handoff-http", payload: handoffPayload() },
  });
  assert.equal(res.status, 201);
  const projectId = (await res.json()).data.project.id;

  // the operator token does not open the handoff path, and vice versa
  res = await post(base, "/api/v1/integrations/pipeline/acquisition-handoff", {
    headers: operatorHeaders(),
    body: { handoffId: "handoff-http-2", payload: handoffPayload("opp-http-2") },
  });
  assert.equal(res.status, 401);

  driveToInProgress(store, projectId);

  // 2. the project appears in the operator list, in progress, with a next action
  res = await fetch(`${base}/api/projects`, { headers: operatorHeaders() });
  assert.equal(res.status, 200);
  let body = await res.json();
  const listed = body.data.projects.find(p => p.id === projectId);
  assert.ok(listed);
  assert.equal(listed.stage, "in_progress");
  // the domain budgetSummary computes authority as budget * (1 + pct/100) in
  // floating point (55000.00000000001); compare at cent precision.
  assert.equal(Math.round(listed.budget.authority * 100) / 100, 55000);
  assert.equal(typeof listed.nextAction, "string");

  // 3. invoice submitted by the PM over HTTP
  res = await post(base, `/api/projects/${projectId}/invoices`, {
    headers: actorHeaders(PM, "operator"),
    body: { contractor: "Acme Builders", externalNumber: "INV-100", lineItems: [{ description: "Roofing", amount: 12000 }], evidenceRefs: ["evidence://inv-100"] },
  });
  assert.equal(res.status, 201);
  const invoiceId = (await res.json()).data.id;

  // 4. a client claiming a role it does not hold in the store is refused
  res = await post(base, `/api/projects/${projectId}/invoices/${invoiceId}/review`, {
    headers: actorHeaders(BOSS, "operator"),
    body: { decision: "approved", rationale: "Verified" },
  });
  assert.equal(res.status, 403);
  assert.equal((await res.json()).error, "actor_role_mismatch");
  assert.equal(finance.getInvoice(invoiceId).status, "submitted");

  // 5. the approver reviews with her recorded role
  res = await post(base, `/api/projects/${projectId}/invoices/${invoiceId}/review`, {
    headers: actorHeaders(BOSS, "approver"),
    body: { decision: "approved", rationale: "Verified against scope" },
  });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).data.status, "approved");

  // 6. draw requested by the PM
  res = await post(base, `/api/projects/${projectId}/draws`, {
    headers: actorHeaders(PM, "operator"),
    body: { amount: 12000, percentComplete: 50, evidenceRefs: ["evidence://progress-50"], invoiceIds: [invoiceId], reason: "Roof complete", idempotencyKey: "http-draw-1" },
  });
  assert.equal(res.status, 201);
  const drawId = (await res.json()).data.draw.id;

  // 7. the requester cannot decide their own draw (service-layer control, via HTTP)
  res = await post(base, `/api/projects/${projectId}/draws/${drawId}/decide`, {
    headers: actorHeaders(PM, "operator"),
    body: { decision: "approved", rationale: "Mine" },
  });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error, "self_approval_forbidden");

  // 8. the independent approver decides
  res = await post(base, `/api/projects/${projectId}/draws/${drawId}/decide`, {
    headers: actorHeaders(BOSS, "approver"),
    body: { decision: "approved", rationale: "Evidence verified" },
  });
  assert.equal(res.status, 200);
  assert.equal(finance.getDraw(drawId).status, "approved");

  // 9. payment recorded (recording only)
  res = await post(base, `/api/projects/${projectId}/draws/${drawId}/payments`, {
    headers: actorHeaders(PM, "operator"),
    body: { amount: 5000, paymentRef: "PAY-HTTP-1", method: "wire", idempotencyKey: "http-pay-1" },
  });
  assert.equal(res.status, 201);
  const paymentId = (await res.json()).data.payment.id;

  // 10. reconciliation with a caller-supplied bank record — labeled, never verified
  res = await post(base, `/api/projects/${projectId}/payments/${paymentId}/reconciliation`, {
    headers: actorHeaders(PM, "operator"),
    body: { bankRecord: { amount: 5000, reference: "stmt-line-1" } },
  });
  assert.equal(res.status, 201);
  const reconciliation = (await res.json()).data;
  assert.equal(reconciliation.state, "reconciled");
  assert.equal(reconciliation.source, "caller_reported");
  assert.equal(reconciliation.bankVerified, false);

  // 11. lender package export verifies against its own digest
  res = await fetch(`${base}/api/projects/${projectId}/draws/${drawId}/package`, { headers: operatorHeaders() });
  assert.equal(res.status, 200);
  const pkg = (await res.json()).data;
  assert.equal(typeof pkg.packageDigest, "string");
  assert.equal(pkg.bankVerified, false);
  assert.equal(verifyLenderPackage(pkg), true);

  // 12. inspections + tasks over HTTP
  res = await post(base, `/api/projects/${projectId}/inspections`, {
    headers: actorHeaders(PM, "operator"),
    body: { type: "framing", scheduledFor: "2026-10-12T09:00:00Z", inspectorRef: "City inspector (as recorded)" },
  });
  assert.equal(res.status, 201);
  const inspectionId = (await res.json()).data.id;
  res = await post(base, `/api/projects/${projectId}/inspections/${inspectionId}/outcome`, {
    headers: actorHeaders(PM, "operator"),
    body: { outcome: "failed", evidenceRef: "evidence://framing-fail", correctionItems: ["Add fire blocking"] },
  });
  assert.equal(res.status, 200);
  body = await res.json();
  assert.equal(body.data.status, "corrections_required");
  const correctionId = body.data.corrections[0].id;
  res = await post(base, `/api/projects/${projectId}/corrections/${correctionId}/complete`, {
    headers: actorHeaders(PM, "operator"),
    body: { evidenceRef: "evidence://fire-blocking-photo" },
  });
  assert.equal(res.status, 200);

  res = await post(base, `/api/projects/${projectId}/tasks`, {
    headers: actorHeaders(PM, "operator"),
    body: { title: "Order cabinets", startsOn: "2026-10-06", dueOn: "2026-10-20" },
  });
  assert.equal(res.status, 201);
  const taskId = (await res.json()).data.id;
  res = await post(base, `/api/projects/${projectId}/tasks/${taskId}/status`, {
    headers: actorHeaders(PM, "operator"),
    body: { status: "done" },
  });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).data.status, "done");

  // 13. the detail view reflects everything, with distinct financial states
  res = await fetch(`${base}/api/projects/${projectId}`, { headers: operatorHeaders() });
  assert.equal(res.status, 200);
  const detail = (await res.json()).data;
  assert.deepEqual(
    { approved: detail.financials.approved, allocated: detail.financials.allocated, paid: detail.financials.paid, reconciled: detail.financials.reconciled },
    { approved: 12000, allocated: 12000, paid: 5000, reconciled: 5000 },
  );
  assert.equal(detail.draws.length, 1);
  assert.equal(detail.invoices.length, 1);
  assert.equal(detail.inspections[0].status, "corrections_complete");
  assert.equal(detail.tasks[0].status, "done");
  assert.equal(typeof detail.health.nextAction, "string");
});

test("malformed JSON is a 400, unknown routes are a 404, missing actor is a 400", async t => {
  const { base } = await startApp(t);
  let res = await post(base, "/api/projects/whatever/invoices", {
    headers: actorHeaders(PM, "operator"),
    body: "{not json",
  });
  // unknown project wins over body parsing? No — the project check runs first: 404.
  assert.equal(res.status, 404);

  const app2 = await startApp(t);
  const intake = await post(app2.base, "/api/v1/integrations/pipeline/acquisition-handoff", {
    headers: { authorization: `Bearer ${HANDOFF_SECRET}` },
    body: { handoffId: "handoff-bad-json", payload: handoffPayload("opp-bad-json") },
  });
  const projectId = (await intake.json()).data.project.id;

  res = await post(app2.base, `/api/projects/${projectId}/invoices`, {
    headers: actorHeaders(PM, "operator"),
    body: "{not json",
  });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error, "invalid_json");

  res = await post(app2.base, `/api/projects/${projectId}/invoices`, {
    headers: operatorHeaders(),
    body: { contractor: "Acme Builders", externalNumber: "INV-1", lineItems: [{ description: "x", amount: 1 }], evidenceRefs: ["evidence://x"] },
  });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error, "actor_id_required");

  res = await fetch(`${app2.base}/api/definitely-not-a-route`, { headers: operatorHeaders() });
  assert.equal(res.status, 404);
  assert.equal((await res.json()).error, "route_not_found");
  res = await fetch(`${app2.base}/definitely-not-a-page`, { headers: operatorHeaders() });
  assert.equal(res.status, 404);
});

test("demo mode seeds obviously synthetic projects and labels page and API as demo", async t => {
  const { base } = await startApp(t, { demo: true });
  const res = await fetch(`${base}/api/projects`, { headers: operatorHeaders() });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.demo, true);
  assert.equal(body.data.projects.length, 2);
  assert.ok(body.data.projects.every(p => String(p.address).startsWith("DEMO — ")));
  const active = body.data.projects.find(p => p.stage === "in_progress");
  assert.ok(active, "one demo project is driven to in_progress");
  assert.equal(active.financials.approved, 0);
  assert.equal(active.nextAction.length > 0, true);

  const detail = await (await fetch(`${base}/api/projects/${active.id}`, { headers: operatorHeaders() })).json();
  assert.equal(detail.demo, true);
  assert.equal(detail.data.invoices.length, 1);
  assert.equal(detail.data.draws.length, 1);
  assert.equal(detail.data.draws[0].status, "pending");
  assert.equal(detail.data.inspections.length, 1);
  assert.equal(detail.data.tasks.length, 2);

  const page = await (await fetch(`${base}/`)).text();
  assert.ok(page.includes("DEMO MODE — synthetic data only"));
});
