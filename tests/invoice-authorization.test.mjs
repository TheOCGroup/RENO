import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MissionControlStore } from "../src/missionControlStore.mjs";
import { MissionControlFinance } from "../src/financialGovernance.mjs";
import { createMissionControlServer } from "../src/missionControlServer.mjs";
import { receiveClosedAcquisition } from "../src/missionControlIntake.mjs";

/**
 * Phase C (founder ruling 2026-11-03, directive §4): final invoice
 * approval/rejection requires the reviewer's recorded tenant role to
 * be approver or admin. The intermediate under_review claim grants no
 * final authority and is open to any actor with a recorded tenant
 * role. The submitter is refused first (self_review_forbidden), even
 * when the submitter holds an approver role.
 *
 * Actors: pm submits (operator), boss approves (approver), admin
 * approves (admin), clerk reviews without authority (operator),
 * ghost has NO recorded role anywhere.
 */
const PM = "pm-1";
const BOSS = "boss-1";
const ADMIN = "admin-1";
const CLERK = "clerk-1";
const GHOST = "ghost-1";
const TENANT_B = "tenant-b";

function payload(opportunityId = "opp-auth") {
  return {
    contractVersion: "1.0",
    sourceSystem: "pipeline",
    targetSystem: "mission-control",
    opportunityId,
    opportunityCode: `OCG-${opportunityId}`,
    propertyId: `property-${opportunityId}`,
    address: "100 Governance Way",
    closedAt: "2026-09-25T16:00:00Z",
    acquisition: { purchasePrice: 150000, earnestMoney: 1000, strategyType: "cash_purchase", offerId: "offer-1", offerVersionId: "version-1" },
    underwriting: { sourceSystem: "deal-scout", sourceUnderwritingId: "victor-1", arv: 260000, rehab: 48000, mao: 160000, confidence: 0.9, limitations: null },
    renovationSeed: { budgetBaseline: 48000, scopeStatus: "needs_field_validation", projectStatus: "intake_ready" }
  };
}

function openDb(t) {
  const dir = mkdtempSync(join(tmpdir(), "mc-invauth-"));
  const path = join(dir, "mission-control.db");
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return { path, open: () => new MissionControlStore(path) };
}

function setupProject(store, { handoffId = "handoff-auth", tenantId } = {}) {
  const repo = tenantId ? store.intakeRepository(tenantId) : store.intakeRepository();
  const { project } = receiveClosedAcquisition({ handoffId, payload: payload(handoffId), repository: repo });
  const workflow = tenantId ? store.restoreWorkflow(project.id, { tenantId }) : store.restoreWorkflow(project.id);
  workflow.validateScope({ items: [
    { title: "Roof replacement", category: "exterior", estimatedCost: 12000 },
    { title: "Kitchen remodel", category: "interior", estimatedCost: 30000 },
  ] });
  workflow.approveBudget({ amount: 50000, contingencyPct: 10, rationale: "Baselines verified" });
  const bid = workflow.addBid({ contractor: "Acme Builders", amount: 48000, days: 45 });
  workflow.selectBid({ bidId: bid.id, rationale: "Best coverage within authority" });
  workflow.scheduleWork({ startAt: "2026-10-01T08:00:00Z", targetCompleteAt: "2026-11-15T17:00:00Z" });
  workflow.startWork({ startedAt: "2026-10-01T08:05:00Z" });
  store.persistWorkflow(workflow, tenantId ? { tenantId } : {});
  const operations = store.restoreOperations(workflow, tenantId ? { tenantId } : {});
  operations.recordProgress({ percentComplete: 50, evidenceRefs: ["evidence://progress-50"], note: "Roof done, kitchen framed" });
  store.persistOperations(operations, tenantId ? { tenantId } : {});
  return { project };
}

function setupFinance(store, tenantId) {
  const finance = new MissionControlFinance(store);
  const t = tenantId || store.defaultTenantId;
  finance.setActorRole({ tenantId: t, actorId: PM, role: "operator" });
  finance.setActorRole({ tenantId: t, actorId: BOSS, role: "approver" });
  finance.setActorRole({ tenantId: t, actorId: ADMIN, role: "admin" });
  finance.setActorRole({ tenantId: t, actorId: CLERK, role: "operator" });
  // GHOST deliberately gets no recorded role in any tenant.
  return finance;
}

function submitInvoice(finance, { projectId, tenantId, actor = PM, number = "INV-A1", amount = 12000 }) {
  return finance.submitInvoice({
    tenantId, projectId, actor, contractor: "Acme Builders", externalNumber: number,
    lineItems: [{ description: "Roofing labor and materials", amount }],
    evidenceRefs: [`evidence://invoice-${number}`],
  });
}

function reviewEventsFor(finance, projectId, invoiceId, tenantId) {
  return finance.listAudit(projectId, tenantId).filter(row => row.event_type === "invoice_reviewed" && row.entity_id === invoiceId);
}

test("operator final approval and rejection are refused with approver_role_required and write nothing", (t) => {
  const { open } = openDb(t);
  const store = open();
  const { project } = setupProject(store);
  const finance = setupFinance(store);
  const invoice = submitInvoice(finance, { projectId: project.id });

  assert.throws(() => finance.reviewInvoice({ projectId: project.id, actor: CLERK, invoiceId: invoice.id, decision: "approved", rationale: "Looks fine" }), /approver_role_required/);
  assert.throws(() => finance.reviewInvoice({ projectId: project.id, actor: CLERK, invoiceId: invoice.id, decision: "rejected", rationale: "No good" }), /approver_role_required/);
  // the submitting operator is also an operator — but self-review fires
  // first for the submitter; a different operator hits the role gate.

  const after = finance.getInvoice(invoice.id);
  assert.equal(after.status, "submitted");
  assert.equal(after.reviewedBy, null);
  assert.equal(reviewEventsFor(finance, project.id, invoice.id).length, 0);
  assert.equal(finance.verifyAuditChain(project.id), true);
  store.close();
});

test("an actor with no recorded role is refused every review decision, including under_review", (t) => {
  const { open } = openDb(t);
  const store = open();
  const { project } = setupProject(store);
  const finance = setupFinance(store);
  const invoice = submitInvoice(finance, { projectId: project.id });

  assert.equal(finance.actorRole(store.defaultTenantId, GHOST), null);
  assert.throws(() => finance.reviewInvoice({ projectId: project.id, actor: GHOST, invoiceId: invoice.id, decision: "approved" }), /approver_role_required/);
  assert.throws(() => finance.reviewInvoice({ projectId: project.id, actor: GHOST, invoiceId: invoice.id, decision: "rejected", rationale: "No" }), /approver_role_required/);
  assert.throws(() => finance.reviewInvoice({ projectId: project.id, actor: GHOST, invoiceId: invoice.id, decision: "under_review" }), /approver_role_required/);
  assert.equal(finance.getInvoice(invoice.id).status, "submitted");
  assert.equal(reviewEventsFor(finance, project.id, invoice.id).length, 0);
  store.close();
});

test("under_review: any recorded role may claim an invoice, but claiming grants no final authority", (t) => {
  const { open } = openDb(t);
  const store = open();
  const { project } = setupProject(store);
  const finance = setupFinance(store);
  const invoice = submitInvoice(finance, { projectId: project.id });

  // an operator (non-submitter) claims the invoice
  const claimed = finance.reviewInvoice({ projectId: project.id, actor: CLERK, invoiceId: invoice.id, decision: "under_review" });
  assert.equal(claimed.status, "under_review");
  // the claim recorded the claimer's role (operator) — and no approval
  const claimEvents = reviewEventsFor(finance, project.id, invoice.id);
  assert.equal(claimEvents.length, 1);
  assert.equal(claimEvents[0].payload.decision, "under_review");
  assert.equal(claimEvents[0].payload.reviewerRole, "operator");
  assert.equal(finance.isGovernedApprovedInvoice(finance.getInvoice(invoice.id)), false);

  // the same operator still cannot finalize from under_review
  assert.throws(() => finance.reviewInvoice({ projectId: project.id, actor: CLERK, invoiceId: invoice.id, decision: "approved" }), /approver_role_required/);
  assert.throws(() => finance.reviewInvoice({ projectId: project.id, actor: CLERK, invoiceId: invoice.id, decision: "rejected", rationale: "No" }), /approver_role_required/);
  assert.equal(finance.getInvoice(invoice.id).status, "under_review");

  // an approver finalizes from under_review
  const approved = finance.reviewInvoice({ projectId: project.id, actor: BOSS, invoiceId: invoice.id, decision: "approved", rationale: "Verified" });
  assert.equal(approved.status, "approved");
  assert.equal(finance.isGovernedApprovedInvoice(approved), true);
  store.close();
});

test("self-review beats role: a submitter holding an approver/admin role still cannot review their own invoice", (t) => {
  const { open } = openDb(t);
  const store = open();
  const { project } = setupProject(store);
  const finance = setupFinance(store);
  // BOSS (approver) submits this invoice herself
  const invoice = submitInvoice(finance, { projectId: project.id, actor: BOSS, number: "INV-SELF" });

  assert.throws(() => finance.reviewInvoice({ projectId: project.id, actor: BOSS, invoiceId: invoice.id, decision: "approved" }), /self_review_forbidden/);
  assert.throws(() => finance.reviewInvoice({ projectId: project.id, actor: BOSS, invoiceId: invoice.id, decision: "rejected", rationale: "Mine" }), /self_review_forbidden/);
  assert.throws(() => finance.reviewInvoice({ projectId: project.id, actor: BOSS, invoiceId: invoice.id, decision: "under_review" }), /self_review_forbidden/);
  assert.equal(finance.getInvoice(invoice.id).status, "submitted");

  // another authorized reviewer (admin) can still decide it
  const approved = finance.reviewInvoice({ projectId: project.id, actor: ADMIN, invoiceId: invoice.id, decision: "approved", rationale: "Independent review" });
  assert.equal(approved.status, "approved");
  assert.equal(approved.reviewedBy, ADMIN);
  const events = reviewEventsFor(finance, project.id, invoice.id);
  assert.equal(events.length, 1);
  assert.equal(events[0].payload.reviewerRole, "admin");
  store.close();
});

test("admin approval works and the approved invoice funds a governed draw (happy path regression)", (t) => {
  const { open } = openDb(t);
  const store = open();
  const { project } = setupProject(store);
  const finance = setupFinance(store);
  const invoice = submitInvoice(finance, { projectId: project.id, number: "INV-ADMIN" });

  const approved = finance.reviewInvoice({ projectId: project.id, actor: ADMIN, invoiceId: invoice.id, decision: "approved", rationale: "Verified against scope" });
  assert.equal(approved.status, "approved");
  assert.equal(finance.isGovernedApprovedInvoice(approved), true);

  const { draw, duplicate } = finance.requestDraw({
    projectId: project.id, actor: PM, amount: 12000, percentComplete: 50,
    evidenceRefs: ["evidence://progress-50"], invoiceIds: [invoice.id], reason: "Roof complete",
  });
  assert.equal(duplicate, false);
  assert.equal(draw.status, "pending");
  const { decision } = finance.decideDraw({ projectId: project.id, actor: BOSS, drawId: draw.id, decision: "approved", rationale: "Evidence verified" });
  assert.equal(decision.decision, "approved");
  assert.deepEqual(finance.getProjectFinancials(project.id), { projectId: project.id, approved: 12000, allocated: 12000, paid: 0, reconciled: 0 });
  store.close();
});

test("approver approval records the exercised role in the audit event; chain and corroboration survive a restart", (t) => {
  const { path, open } = openDb(t);
  let store = open();
  const { project } = setupProject(store);
  let finance = setupFinance(store);
  const invoice = submitInvoice(finance, { projectId: project.id, number: "INV-AUDIT" });
  finance.reviewInvoice({ projectId: project.id, actor: CLERK, invoiceId: invoice.id, decision: "under_review" });
  finance.reviewInvoice({ projectId: project.id, actor: BOSS, invoiceId: invoice.id, decision: "approved", rationale: "Verified" });
  store.close();

  // reopen: previously approved records retain integrity — the audit
  // chain still verifies and the U4R2 corroboration still holds.
  store = open();
  finance = new MissionControlFinance(store);
  const reopened = finance.getInvoice(invoice.id);
  assert.equal(reopened.status, "approved");
  assert.equal(reopened.reviewedBy, BOSS);
  assert.equal(finance.isGovernedApprovedInvoice(reopened), true);
  assert.equal(finance.verifyAuditChain(project.id), true);
  const events = reviewEventsFor(finance, project.id, invoice.id);
  assert.deepEqual(events.map(row => [row.payload.decision, row.payload.reviewerRole]), [
    ["under_review", "operator"],
    ["approved", "approver"],
  ]);
  store.close();
});

test("cross-tenant review is not-found, never a role answer: no tenant or project information leaks", (t) => {
  const { open } = openDb(t);
  const store = open();
  const { project: projectA } = setupProject(store, { handoffId: "handoff-a" });
  const financeA = setupFinance(store);
  const invoiceA = submitInvoice(financeA, { projectId: projectA.id, number: "INV-XT" });

  // tenant B exists with its own project, and BOSS is an approver THERE too
  const { project: projectB } = setupProject(store, { handoffId: "handoff-b", tenantId: TENANT_B });
  const financeB = setupFinance(store, TENANT_B);
  assert.equal(financeB.actorRole(TENANT_B, BOSS), "approver");

  // (a) naming tenant A's project under tenant B: the project itself is invisible
  assert.throws(() => financeB.reviewInvoice({ tenantId: TENANT_B, projectId: projectA.id, actor: BOSS, invoiceId: invoiceA.id, decision: "approved" }), /project_not_found/);
  // (b) naming tenant B's own project with tenant A's invoice: the invoice is invisible
  assert.throws(() => financeB.reviewInvoice({ tenantId: TENANT_B, projectId: projectB.id, actor: BOSS, invoiceId: invoiceA.id, decision: "approved" }), /invoice_not_found/);
  // (c) an operator in tenant B gets the same not-found answers — the
  // refusal never reveals that the invoice exists or what role would do
  assert.throws(() => financeB.reviewInvoice({ tenantId: TENANT_B, projectId: projectB.id, actor: CLERK, invoiceId: invoiceA.id, decision: "approved" }), /invoice_not_found/);

  // tenant A's invoice is untouched
  assert.equal(financeA.getInvoice(invoiceA.id).status, "submitted");
  assert.equal(reviewEventsFor(financeA, projectA.id, invoiceA.id).length, 0);
  store.close();
});

// --- HTTP layer ------------------------------------------------------------

const OPERATOR_TOKEN = "test-operator-token";
const HANDOFF_SECRET = "test-handoff-secret";

function handoffPayload(opportunityId = "opp-invauth-http") {
  return payload(opportunityId);
}

function actorHeaders(actorId, role) {
  return { authorization: `Bearer ${OPERATOR_TOKEN}`, "x-actor-id": actorId, ...(role ? { "x-actor-role": role } : {}) };
}

async function postJson(base, path, { headers = {}, body } = {}) {
  return fetch(`${base}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body ?? {}),
  });
}

test("HTTP: a store-recorded operator's final approval is 400 approver_role_required; an approver succeeds", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "mc-invauth-http-"));
  const store = new MissionControlStore(join(dir, "mission-control.db"));
  const app = createMissionControlServer({ store, operatorToken: OPERATOR_TOKEN, handoffSecret: HANDOFF_SECRET });
  await new Promise(resolve => app.server.listen(0, "127.0.0.1", resolve));
  t.after(() => { app.server.close(); store.close(); rmSync(dir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const { finance } = app;
  finance.setActorRole({ actorId: PM, role: "operator" });
  finance.setActorRole({ actorId: CLERK, role: "operator" });
  finance.setActorRole({ actorId: BOSS, role: "approver" });

  let res = await postJson(base, "/api/v1/integrations/pipeline/acquisition-handoff", {
    headers: { authorization: `Bearer ${HANDOFF_SECRET}` },
    body: { handoffId: "handoff-invauth-http", payload: handoffPayload() },
  });
  assert.equal(res.status, 201);
  const projectId = (await res.json()).data.project.id;

  res = await postJson(base, `/api/projects/${projectId}/invoices`, {
    headers: actorHeaders(PM, "operator"),
    body: { contractor: "Acme Builders", externalNumber: "INV-H1", lineItems: [{ description: "Roofing", amount: 12000 }], evidenceRefs: ["evidence://inv-h1"] },
  });
  assert.equal(res.status, 201);
  const invoiceId = (await res.json()).data.id;

  // the operator's claimed role matches the store record (no mismatch) —
  // the refusal is the service layer's new gate, with its exact code
  res = await postJson(base, `/api/projects/${projectId}/invoices/${invoiceId}/review`, {
    headers: actorHeaders(CLERK, "operator"),
    body: { decision: "approved", rationale: "Looks fine" },
  });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error, "approver_role_required");
  assert.equal(finance.getInvoice(invoiceId).status, "submitted");

  // an operator may still claim the invoice for review over HTTP
  res = await postJson(base, `/api/projects/${projectId}/invoices/${invoiceId}/review`, {
    headers: actorHeaders(CLERK, "operator"),
    body: { decision: "under_review" },
  });
  assert.equal(res.status, 200);
  assert.equal(finance.getInvoice(invoiceId).status, "under_review");

  // the approver finalizes
  res = await postJson(base, `/api/projects/${projectId}/invoices/${invoiceId}/review`, {
    headers: actorHeaders(BOSS, "approver"),
    body: { decision: "approved", rationale: "Verified against scope" },
  });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).data.status, "approved");
  assert.equal(finance.isGovernedApprovedInvoice(finance.getInvoice(invoiceId)), true);
});
