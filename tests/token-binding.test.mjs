import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MissionControlStore } from "../src/missionControlStore.mjs";
import { createMissionControlServer, missionControlServerConfigFromEnv } from "../src/missionControlServer.mjs";

// Port P2 (reconciliation PRESERVE 3.1 / MATRIX-B PRESERVE-2): the actor
// for a write must be BOUND to the credential presented, via a server-side
// token -> actor registry — not asserted through the x-actor-id header
// under one shared token. The store's role gates remain the authority for
// what the bound actor may do; binding is identity, not authorization.

const OPERATOR_TOKEN = "test-operator-token";
const HANDOFF_SECRET = "test-handoff-secret";
const PM = "pm-1";
const BOSS = "boss-1";
const GHOST = "ghost-1";
const TOK_PM = "tok-pm-1";
const TOK_BOSS = "tok-boss-1";
const TOK_GHOST = "tok-ghost-1";
const REGISTRY = { [TOK_PM]: PM, [TOK_BOSS]: BOSS, [TOK_GHOST]: GHOST };

function handoffPayload(opportunityId = "opp-binding", address = "100 Binding Way") {
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
  const dir = mkdtempSync(join(tmpdir(), "mc-binding-"));
  const store = new MissionControlStore(join(dir, "mission-control.db"), { tenantId: "default" });
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

async function post(base, path, { token, headers = {}, body } = {}) {
  return fetch(`${base}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
    body: JSON.stringify(body ?? {}),
  });
}

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

/** Project with roles recorded, one approved invoice, one pending draw requested by PM. */
async function setupProjectWithDraw(app, opportunityId = "opp-binding") {
  const { base, store, finance } = app;
  finance.setActorRole({ actorId: PM, role: "operator" });
  finance.setActorRole({ actorId: BOSS, role: "approver" });
  const intake = await post(base, "/api/v1/integrations/pipeline/acquisition-handoff", {
    token: HANDOFF_SECRET,
    body: { handoffId: `handoff-${opportunityId}`, payload: handoffPayload(opportunityId) },
  });
  assert.equal(intake.status, 201);
  const projectId = (await intake.json()).data.project.id;
  driveToInProgress(store, projectId);
  const invoice = finance.submitInvoice({
    projectId, actor: PM, contractor: "Acme Builders", externalNumber: "INV-BIND-1",
    lineItems: [{ description: "Roofing", amount: 12000 }], evidenceRefs: ["evidence://inv-bind-1"],
  });
  finance.reviewInvoice({ projectId, actor: BOSS, invoiceId: invoice.id, decision: "approved", rationale: "Verified against scope" });
  const { draw } = finance.requestDraw({
    projectId, actor: PM, amount: 12000, percentComplete: 50,
    evidenceRefs: ["evidence://progress-50"], invoiceIds: [invoice.id],
    reason: "Roof complete", idempotencyKey: `bind-draw-${opportunityId}`,
  });
  return { projectId, invoiceId: invoice.id, drawId: draw.id };
}

test("STEP 0: with a registry configured, the shared token + asserted approver header cannot decide a draw", async t => {
  const app = await startApp(t, { actorTokens: REGISTRY });
  const { projectId, drawId } = await setupProjectWithDraw(app);
  const res = await post(app.base, `/api/projects/${projectId}/draws/${drawId}/decide`, {
    token: OPERATOR_TOKEN,
    headers: { "x-actor-id": BOSS },
    body: { decision: "approved", rationale: "Asserted, not possessed" },
  });
  assert.equal(res.status, 403);
  assert.equal((await res.json()).error, "actor_token_required");
  assert.equal(app.finance.getDraw(drawId).status, "pending");
  assert.equal(app.finance.listDecisions(drawId).length, 0);
});

test("a registry token binds the actor: a disagreeing x-actor-id is refused, and the bound actor faces the store's own gates", async t => {
  const app = await startApp(t, { actorTokens: REGISTRY });
  const { projectId, drawId } = await setupProjectWithDraw(app);
  // the operator's token cannot speak as the approver
  let res = await post(app.base, `/api/projects/${projectId}/draws/${drawId}/decide`, {
    token: TOK_PM,
    headers: { "x-actor-id": BOSS },
    body: { decision: "approved", rationale: "Impersonation attempt" },
  });
  assert.equal(res.status, 403);
  assert.equal((await res.json()).error, "actor_token_mismatch");
  assert.equal(app.finance.getDraw(drawId).status, "pending");
  // the bound actor IS pm-1, the requester: the service self-approval gate fires
  res = await post(app.base, `/api/projects/${projectId}/draws/${drawId}/decide`, {
    token: TOK_PM,
    body: { decision: "approved", rationale: "Mine" },
  });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error, "self_approval_forbidden");
  assert.equal(app.finance.getDraw(drawId).status, "pending");
});

test("the bound approver decides: matching header accepted, and no header needed (actor derived from the token)", async t => {
  const app = await startApp(t, { actorTokens: REGISTRY });
  const { projectId, drawId } = await setupProjectWithDraw(app);
  let res = await post(app.base, `/api/projects/${projectId}/draws/${drawId}/decide`, {
    token: TOK_BOSS,
    headers: { "x-actor-id": BOSS, "x-actor-role": "approver" },
    body: { decision: "approved", rationale: "Evidence verified" },
  });
  assert.equal(res.status, 200);
  assert.equal(app.finance.getDraw(drawId).status, "approved");
  assert.equal(app.finance.listDecisions(drawId)[0].actor, BOSS);

  // a second invoice, reviewed with the approver token and NO actor header
  const invoice2 = app.finance.submitInvoice({
    projectId, actor: PM, contractor: "Acme Builders", externalNumber: "INV-BIND-2",
    lineItems: [{ description: "Gutters", amount: 2000 }], evidenceRefs: ["evidence://inv-bind-2"],
  });
  res = await post(app.base, `/api/projects/${projectId}/invoices/${invoice2.id}/review`, {
    token: TOK_BOSS,
    body: { decision: "approved", rationale: "Verified" },
  });
  assert.equal(res.status, 200);
  assert.equal(app.finance.getInvoice(invoice2.id).status, "approved");
  assert.equal(app.finance.getInvoice(invoice2.id).reviewedBy, BOSS);
});

test("a claimed role on a bound actor is still cross-checked against the store", async t => {
  const app = await startApp(t, { actorTokens: REGISTRY });
  const { projectId, drawId } = await setupProjectWithDraw(app);
  const res = await post(app.base, `/api/projects/${projectId}/draws/${drawId}/decide`, {
    token: TOK_BOSS,
    headers: { "x-actor-id": BOSS, "x-actor-role": "operator" },
    body: { decision: "approved", rationale: "Verified" },
  });
  assert.equal(res.status, 403);
  assert.equal((await res.json()).error, "actor_role_mismatch");
  assert.equal(app.finance.getDraw(drawId).status, "pending");
});

test("binding is not authorization: a token bound to an actor with no recorded role still fails the service gates", async t => {
  const app = await startApp(t, { actorTokens: REGISTRY });
  const { projectId, drawId } = await setupProjectWithDraw(app);
  const res = await post(app.base, `/api/projects/${projectId}/draws/${drawId}/decide`, {
    token: TOK_GHOST,
    body: { decision: "approved", rationale: "No role recorded" },
  });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error, "approver_role_required");
  assert.equal(app.finance.getDraw(drawId).status, "pending");
});

test("reads accept the shared token and registry tokens; unknown tokens are refused", async t => {
  const app = await startApp(t, { actorTokens: REGISTRY });
  const { projectId } = await setupProjectWithDraw(app);
  for (const token of [OPERATOR_TOKEN, TOK_PM, TOK_BOSS]) {
    const res = await fetch(`${app.base}/api/projects`, { headers: { authorization: `Bearer ${token}` } });
    assert.equal(res.status, 200, `read with a configured credential must succeed`);
    const detail = await fetch(`${app.base}/api/projects/${projectId}`, { headers: { authorization: `Bearer ${token}` } });
    assert.equal(detail.status, 200);
  }
  const bad = await fetch(`${app.base}/api/projects`, { headers: { authorization: "Bearer not-a-token" } });
  assert.equal(bad.status, 401);
  assert.equal((await bad.json()).error, "unauthorized");
});

test("legacy mode: with NO registry configured, the shared token + asserted actor keeps working (certified flows)", async t => {
  const app = await startApp(t);
  const { projectId, drawId } = await setupProjectWithDraw(app);
  const res = await post(app.base, `/api/projects/${projectId}/draws/${drawId}/decide`, {
    token: OPERATOR_TOKEN,
    headers: { "x-actor-id": BOSS, "x-actor-role": "approver" },
    body: { decision: "approved", rationale: "Evidence verified" },
  });
  assert.equal(res.status, 200);
  assert.equal(app.finance.getDraw(drawId).status, "approved");
});

test("the handoff receiver path keeps its own secret and is untouched by the registry", async t => {
  const app = await startApp(t, { actorTokens: REGISTRY });
  let res = await post(app.base, "/api/v1/integrations/pipeline/acquisition-handoff", {
    token: HANDOFF_SECRET,
    body: { handoffId: "handoff-binding", payload: handoffPayload("opp-handoff-binding") },
  });
  assert.equal(res.status, 201);
  res = await post(app.base, "/api/v1/integrations/pipeline/acquisition-handoff", {
    token: TOK_BOSS,
    body: { handoffId: "handoff-binding-2", payload: handoffPayload("opp-handoff-binding-2") },
  });
  assert.equal(res.status, 401);
});

test("registry config: JSON-string form works, env config passes it through, malformed config fails closed at construction", async t => {
  const app = await startApp(t, { actorTokens: JSON.stringify(REGISTRY) });
  const { projectId, drawId } = await setupProjectWithDraw(app);
  const res = await post(app.base, `/api/projects/${projectId}/draws/${drawId}/decide`, {
    token: OPERATOR_TOKEN,
    headers: { "x-actor-id": BOSS },
    body: { decision: "approved", rationale: "Asserted" },
  });
  assert.equal(res.status, 403);
  assert.equal((await res.json()).error, "actor_token_required");

  const fromEnv = missionControlServerConfigFromEnv({ MISSION_CONTROL_ACTOR_TOKENS: '{"tok-x":"actor-x"}' });
  assert.equal(fromEnv.actorTokens, '{"tok-x":"actor-x"}');

  const dir = mkdtempSync(join(tmpdir(), "mc-binding-bad-"));
  const store = new MissionControlStore(join(dir, "mission-control.db"), { tenantId: "default" });
  t.after(() => { store.close(); rmSync(dir, { recursive: true, force: true }); });
  assert.throws(
    () => createMissionControlServer({ store, operatorToken: OPERATOR_TOKEN, actorTokens: "{not json" }),
    /actor_tokens_invalid/,
  );
  assert.throws(
    () => createMissionControlServer({ store, operatorToken: OPERATOR_TOKEN, actorTokens: { "": PM } }),
    /actor_tokens_invalid/,
  );
});

test("demo mode seeds per-actor tokens for its synthetic actors and runs in the bound posture", async t => {
  const app = await startApp(t, { demo: true });
  assert.equal(app.actorTokens["demo-token-pm"], "demo-pm");
  assert.equal(app.actorTokens["demo-token-approver"], "demo-approver");

  const list = await (await fetch(`${app.base}/api/projects`, { headers: { authorization: `Bearer ${OPERATOR_TOKEN}` } })).json();
  assert.equal(list.demo, true);
  const project = list.data.projects.find(p => p.stage === "in_progress");
  assert.ok(project);

  // the shared token no longer writes in demo: a per-actor token is required
  let res = await post(app.base, `/api/projects/${project.id}/invoices`, {
    token: OPERATOR_TOKEN,
    headers: { "x-actor-id": "demo-pm" },
    body: { contractor: "DEMO Builders LLC", externalNumber: "DEMO-BIND-1", lineItems: [{ description: "Work", amount: 100 }], evidenceRefs: ["evidence://demo-bind"] },
  });
  assert.equal(res.status, 403);
  assert.equal((await res.json()).error, "actor_token_required");

  // the seeded demo-pm token writes as demo-pm with no actor header at all
  res = await post(app.base, `/api/projects/${project.id}/invoices`, {
    token: "demo-token-pm",
    body: { contractor: "DEMO Builders LLC", externalNumber: "DEMO-BIND-1", lineItems: [{ description: "Work", amount: 100 }], evidenceRefs: ["evidence://demo-bind"] },
  });
  assert.equal(res.status, 201);
  assert.equal((await res.json()).data.submittedBy, "demo-pm");
});
