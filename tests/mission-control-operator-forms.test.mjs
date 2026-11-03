import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MissionControlStore } from "../src/missionControlStore.mjs";
import { createMissionControlServer } from "../src/missionControlServer.mjs";

// Unit 3b — the operator page carries a governed write form for every POST
// route the server exposes. These tests assert the served page's contract:
// session bar, one form per route, the caller-reported label, and the
// plain-language error surface. The page's live behavior against the real
// forms is driven headlessly by the mission drive check (see UNIT-3B-RECORD).

const OPERATOR_TOKEN = "test-operator-token";

async function startApp(t, options = {}) {
  const dir = mkdtempSync(join(tmpdir(), "mc-forms-"));
  const store = new MissionControlStore(join(dir, "mission-control.db"), { tenantId: "default" });
  const app = createMissionControlServer({ store, operatorToken: OPERATOR_TOKEN, handoffSecret: "test-handoff-secret", ...options });
  await new Promise(resolve => app.server.listen(0, "127.0.0.1", resolve));
  t.after(() => { app.server.close(); store.close(); rmSync(dir, { recursive: true, force: true }); });
  return { ...app, base: `http://127.0.0.1:${app.server.address().port}` };
}

async function servedPage(base) {
  const res = await fetch(`${base}/`);
  assert.equal(res.status, 200);
  return res.text();
}

test("operator page carries a session bar: token, actor id, optional role — with the store as role authority", async t => {
  const { base } = await startApp(t);
  const html = await servedPage(base);
  for (const landmark of ["id=\"token-form\"", "id=\"token-input\"", "id=\"actor-input\"", "id=\"actor-role-input\"", "id=\"session-note\""]) {
    assert.ok(html.includes(landmark), `page is missing session landmark ${landmark}`);
  }
  // The role is whatever the store records for the actor id; the page says so.
  assert.ok(html.includes("recorded for that actor ID in the store"), "session note must name the store as the role authority");
  // Session state persists in sessionStorage only (tab-scoped), never cookies.
  assert.ok(html.includes("sessionStorage"), "session fields persist via sessionStorage");
  assert.equal(/document\.cookie/.test(html), false, "the page must not use cookies for the session");
});

test("operator page carries one governed write form per POST route, each collapsed behind a toggle", async t => {
  const { base } = await startApp(t);
  const html = await servedPage(base);
  const routes = [
    "POST /api/projects/:id/invoices",
    "POST /api/projects/:id/invoices/:invoiceId/review",
    "POST /api/projects/:id/draws",
    "POST /api/projects/:id/draws/:drawId/decide",
    "POST /api/projects/:id/draws/:drawId/payments",
    "POST /api/projects/:id/payments/:paymentId/reconciliation",
    "POST /api/projects/:id/inspections",
    "POST /api/projects/:id/inspections/:inspectionId/outcome",
    "POST /api/projects/:id/corrections/:correctionId/complete",
    "POST /api/projects/:id/tasks",
    "POST /api/projects/:id/tasks/:taskId/status",
  ];
  for (const route of routes) {
    // Each form builder passes its route label to the shared collapsible-form
    // factory, which stamps it onto the form as its data-route attribute.
    assert.ok(html.includes(`"${route}"`), `page is missing a form for ${route}`);
  }
  assert.ok(html.includes("setAttribute(\"data-route\""), "forms are stamped with their route");
  // Forms start hidden and are revealed by their toggle buttons.
  assert.ok(html.includes("form.hidden = true"), "write forms start collapsed");
  assert.ok(html.includes("aria-expanded"), "toggles expose their expanded state");
  // Every form reports progress and, on refusal, the plain sentence + raw code.
  assert.ok(html.includes("Working…"), "submits show progress");
  assert.ok(html.includes("translateError"), "server error codes are translated in the page");
  assert.ok(html.includes("self_approval_forbidden"), "the self-approval control has a plain-language translation");
  assert.ok(html.includes("form-feedback err"), "refusals render as form errors");
  // Successful writes refresh the detail (and therefore the next action).
  assert.ok(html.includes("refreshAfterWrite"), "successful writes refresh the project state");
  assert.ok(html.includes("action-status"), "write confirmations have a persistent status line");
  // Idempotency keys on the two money-moving-shaped submissions.
  assert.ok(html.includes("idemKey(\"draw\")"), "draw requests carry a client idempotency key");
  assert.ok(html.includes("idemKey(\"payment\")"), "payment records carry a client idempotency key");
});

test("reconciliation is permanently labeled caller-reported, never bank-verified, in form and result copy", async t => {
  const { base } = await startApp(t);
  const html = await servedPage(base);
  const occurrences = html.split("Caller-reported — not bank-verified").length - 1;
  assert.ok(occurrences >= 2, `the caller-reported label must appear beside the form and in rendered results (found ${occurrences})`);
  assert.ok(html.includes("caller-label"), "the label has its own visible treatment");
  assert.ok(html.includes("never forced to match"), "the form explains mismatches are kept, not corrected");
});

test("operator page still references zero external URLs with the forms present", async t => {
  const { base } = await startApp(t);
  const html = await servedPage(base);
  assert.equal(/https?:\/\//.test(html), false, "operator page must reference no external URLs");
  // U3 landmarks survive the forms rebuild.
  for (const landmark of ["id=\"project-list\"", "id=\"next-action\"", "id=\"budget-summary\"",
    "id=\"section-draws\"", "id=\"section-invoices\"", "id=\"section-inspections\"", "id=\"section-tasks\"", "id=\"section-risks\"",
    "id=\"draws-write\"", "id=\"invoices-write\"", "id=\"inspections-write\"", "id=\"tasks-write\"", "id=\"demo-banner\""]) {
    assert.ok(html.includes(landmark), `page is missing landmark ${landmark}`);
  }
});

test("the routes the forms target answer through the governed service layer (demo flow over HTTP)", async t => {
  const { base } = await startApp(t, { demo: true });
  const headers = { authorization: `Bearer ${OPERATOR_TOKEN}` };
  const body = await (await fetch(`${base}/api/projects`, { headers })).json();
  const project = body.data.projects.find(p => p.stage === "in_progress");
  assert.ok(project, "demo seed provides an in-progress project");
  const detail = (await (await fetch(`${base}/api/projects/${project.id}`, { headers })).json()).data;
  assert.equal(detail.draws.length, 1);
  assert.equal(detail.draws[0].status, "pending");

  // The decide form's target refuses the requester's own decision with the
  // exact code the page translates.
  const res = await fetch(`${base}/api/projects/${project.id}/draws/${detail.draws[0].id}/decide`, {
    method: "POST",
    headers: { ...headers, "content-type": "application/json", "x-actor-id": "demo-pm" },
    body: JSON.stringify({ decision: "approved", rationale: "Mine" }),
  });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error, "self_approval_forbidden");

  // The invoice form's target accepts a submission as the demo PM.
  const inv = await fetch(`${base}/api/projects/${project.id}/invoices`, {
    method: "POST",
    headers: { ...headers, "content-type": "application/json", "x-actor-id": "demo-pm" },
    body: JSON.stringify({ contractor: "DEMO Drive Builders", externalNumber: "DRIVE-1", lineItems: [{ description: "Drive test work", amount: 1000 }], evidenceRefs: ["evidence://drive-1"] }),
  });
  assert.equal(inv.status, 201);
  assert.equal((await inv.json()).data.status, "submitted");
});
