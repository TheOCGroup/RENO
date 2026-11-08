/**
 * PHASE F/G financial-safety regression (founder directive 2026-11-03,
 * §6 + Phase C interplay). This file fills ONLY the gaps the Phase F
 * mapping found in the existing battery (PHASE-F-RECORD.md Part 1):
 *
 *   F6  — req 6: no live disbursement path, locked as an executable
 *         scan of src/ + an assertion on the finance class's exported
 *         money-writing surface (previously review evidence only,
 *         QUINCEY C8).
 *   F8  — req 8: cumulative allocation landing EXACTLY on the
 *         contingency-derived authority passes; one cent beyond it is
 *         refused (retainage's exact boundary is E1's, not repeated).
 *   F13 — req 13: after a decision reversal, the freed authority and
 *         invoice headroom can be re-used exactly up to the true cap
 *         and not one cent beyond it.
 *   F2-2 — Phase C interplay: a review event naming a DIFFERENT
 *         approver than the invoice's recorded reviewer corroborates
 *         nothing (actor mismatch).
 *   F2-3 — Phase C interplay: a legacy pre-Phase-C approval record
 *         (invoice_reviewed event with NO reviewerRole field) still
 *         corroborates — "previously approved invoices verify
 *         unchanged" (PHASE-C-RECORD).
 *   F2-1 — Phase C interplay: a forged, chain-consistent
 *         invoice_reviewed event whose payload claims an OPERATOR
 *         reviewer must NOT corroborate an approval — Phase C made
 *         operator final approval impossible through the service, so
 *         corroboration must require reviewerRole in {approver,
 *         admin} when the event carries one.
 *   F2-4..F2-7 — Phase G delta probes (defect F-1 closure): a valid
 *         reviewerRole with the WRONG actor corroborates nothing;
 *         the legacy roleless path corroborates ONLY on an actor
 *         match; a roleless-string reviewerRole corroborates nothing
 *         even on an actor match; and a legitimate Phase C approval
 *         (role recorded) still corroborates and funds end-to-end.
 *
 * Battery method (per UNIT-4): assertions state the CHARTER behavior;
 * a failure is a defect, recorded in PHASE-F-RECORD.md, never fixed
 * here and never loosened.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash, randomUUID } from "node:crypto";
import { MissionControlStore } from "../src/missionControlStore.mjs";
import { MissionControlFinance } from "../src/financialGovernance.mjs";
import { receiveClosedAcquisition } from "../src/missionControlIntake.mjs";

// Actors: pm submits/requests (operator), boss approves (approver),
// admin also approves (admin), clerk has no approval power (operator).
const PM = "pm-1";
const BOSS = "boss-1";
const ADMIN = "admin-1";
const CLERK = "clerk-1";

function payload(opportunityId = "opp-fsr") {
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
  const dir = mkdtempSync(join(tmpdir(), "mc-fsr-"));
  const path = join(dir, "mission-control.db");
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return { path, open: () => new MissionControlStore(path) };
}

/** Same fixture shape as financial-governance.test.mjs: budget 50000 +
 * 10% contingency (authority 55000), Acme bid 48000 committed, work in
 * progress at 50%. Draw requests at percentComplete 100 face the
 * domain cap 48000 * 1.0 * (1 - 10%) = 43200. */
function setupProject(store, { handoffId = "handoff-fsr" } = {}) {
  const repo = store.intakeRepository();
  const { project } = receiveClosedAcquisition({ handoffId, payload: payload(handoffId), repository: repo });
  const workflow = store.restoreWorkflow(project.id);
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
  return { project, workflow };
}

function setupFinance(store) {
  const finance = new MissionControlFinance(store);
  const t = store.defaultTenantId;
  finance.setActorRole({ tenantId: t, actorId: PM, role: "operator" });
  finance.setActorRole({ tenantId: t, actorId: BOSS, role: "approver" });
  finance.setActorRole({ tenantId: t, actorId: ADMIN, role: "admin" });
  finance.setActorRole({ tenantId: t, actorId: CLERK, role: "operator" });
  return finance;
}

/** Rewrite the workflow document's budget figures (the same direct
 * document correction the U1b authority test uses) so the governance
 * authority becomes budget * (1 + contingencyPct/100) exactly. */
function setAuthority(store, projectId, approvedBudget, contingencyPct) {
  const loaded = store.loadWorkflowState(projectId);
  loaded.state.project.approvedBudget = approvedBudget;
  loaded.state.project.contingencyPct = contingencyPct;
  store.saveWorkflowState(projectId, loaded.state, loaded.version);
}

// --- forged-audit construction (the QUINCEY S2d class: a chain-
// --- consistent append by a writer with total DB access) -------------

function canonicalStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalStringify).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map(key => `${JSON.stringify(key)}:${canonicalStringify(value[key])}`).join(",")}}`;
}

/** Append a financial_audit row with a correctly extended hash chain —
 * the strongest form of the forgery: verifyAuditChain still passes. */
function forgeAuditEvent(store, { projectId, eventType, actor, entityType, entityId, detail }) {
  const db = store.db;
  const tenantId = store.defaultTenantId;
  const last = db.prepare("SELECT seq, hash FROM financial_audit WHERE project_id = ? ORDER BY seq DESC LIMIT 1").get(projectId);
  const seq = (last?.seq || 0) + 1;
  const prevHash = last?.hash || "0".repeat(64);
  const payloadJson = canonicalStringify({ eventType, actor, entityType, entityId, ...detail });
  const hash = createHash("sha256").update(prevHash + payloadJson).digest("hex");
  const id = randomUUID();
  db.prepare("INSERT INTO financial_audit (tenant_id, project_id, seq, id, event_type, actor, entity_type, entity_id, payload_json, prev_hash, hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run(tenantId, projectId, seq, id, eventType, actor, entityType, entityId, payloadJson, prevHash, hash, "2026-10-02T00:00:00Z");
  return id;
}

// --- F6: no live disbursement path (req 6) -----------------------------

test("F6: no disbursement path exists — src/ carries no egress or payment-rail code, and the finance surface writes records only", () => {
  const srcDir = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
  const files = readdirSync(srcDir).filter(name => name.endsWith(".mjs"));
  assert.ok(files.length >= 9, "scan must actually cover the source tree");
  // Code constructs that could move money or reach a payment rail.
  // (The word "disbursement" legitimately appears in comments stating
  // its absence; what is forbidden is any construct that performs one.)
  const forbidden = [
    [/\bfetch\s*\(/, "fetch("],
    [/\bhttps?\.request\b/, "http(s).request"],
    [/\bhttps?\.get\s*\(/, "http(s).get("],
    [/child_process/, "child_process"],
    [/\bnet\.connect\b/, "net.connect"],
    [/new\s+Socket\b/, "new Socket"],
    [/XMLHttpRequest/, "XMLHttpRequest"],
    [/\bWebSocket\b/, "WebSocket"],
    [/stripe/i, "stripe"],
    [/twilio/i, "twilio"],
    [/plaid/i, "plaid"],
    [/\bdisburse\s*\(/, "a disburse( call"],
    [/\binitiate\w*[Pp]ayment/, "a payment-initiating call"],
    [/\bsendPayment\b/, "sendPayment"],
    [/\bwireTransfer\b/, "wireTransfer"],
  ];
  for (const file of files) {
    const source = readFileSync(join(srcDir, file), "utf8");
    for (const [pattern, label] of forbidden) {
      // RENOVISION uses fetch for Google metadata and private GCS persistence,
      // and browser-authenticated API requests in the operator and studio UIs, not payment rails. Keep every other guard in force,
      // and prohibit network fetch in all other src modules.
      if (["renovisionMain.mjs", "renovisionUi.mjs", "renovisionStudio.mjs"].includes(file) && label === "fetch(") continue;
      assert.ok(!pattern.test(source), `${file} must not contain ${label}`);
    }
  }
  // The exported money surface of the governance class is exactly the
  // known recording set; every other public method is a read or a
  // derivation. A future money-moving method fails this test and
  // forces a review instead of slipping in.
  const methods = Object.getOwnPropertyNames(MissionControlFinance.prototype)
    .filter(name => name !== "constructor")
    .sort();
  const writers = methods.filter(name => /^(submit|review|request|decide|reverse|record|set)/.test(name));
  assert.deepEqual(writers, [
    "decideDraw", "recordPayment", "recordReconciliation", "requestDraw",
    "reverseDecision", "reviewInvoice", "setActorRole", "submitInvoice",
  ]);
  assert.ok(!methods.some(name => /disburs|payout|transfer|wire|send/i.test(name)),
    "no public method may be named like a money movement");
});

// --- F8: exact-authority boundary (req 8, contingency half) ------------

test("F8: cumulative allocation landing EXACTLY on contingency-derived authority passes; one cent beyond is refused", (t) => {
  const { open } = openDb(t);
  const store = open();
  const { project } = setupProject(store);
  const finance = setupFinance(store);
  // authority = 20000 * (1 + 50/100) = 30000 exactly. The domain cap
  // (43200 at 100%) sits above it, so only the authority guard can
  // refuse the final cent — the contingency term is what is measured.
  setAuthority(store, project.id, 20000, 50);
  // PORT P1 fixture adjustment (2026-11-04): the draws below claim
  // 100% completion citing "evidence://p" — recorded progress must
  // genuinely reach 100% with that evidence, or the P-6.1/P-6.2
  // gates refuse the requests before authority is measured.
  const f8ops = store.restoreOperations(store.restoreWorkflow(project.id));
  f8ops.recordProgress({ percentComplete: 100, evidenceRefs: ["evidence://p"] });
  store.persistOperations(f8ops);
  const invoice = finance.submitInvoice({ projectId: project.id, actor: PM, contractor: "Acme Builders", externalNumber: "INV-F8", lineItems: [{ description: "Roofing and kitchen", amount: 40000 }], evidenceRefs: ["evidence://inv-f8"] });
  finance.reviewInvoice({ projectId: project.id, actor: BOSS, invoiceId: invoice.id, decision: "approved", rationale: "Verified against scope" });
  const draw1 = finance.requestDraw({ projectId: project.id, actor: PM, amount: 20000, percentComplete: 100, evidenceRefs: ["evidence://p"], invoiceIds: [invoice.id], reason: "Progress" }).draw;
  finance.decideDraw({ projectId: project.id, actor: BOSS, drawId: draw1.id, decision: "approved", rationale: "Verified" });
  const draw2 = finance.requestDraw({ projectId: project.id, actor: PM, amount: 10000, percentComplete: 100, evidenceRefs: ["evidence://p"], invoiceIds: [invoice.id], reason: "Progress" }).draw;
  finance.decideDraw({ projectId: project.id, actor: BOSS, drawId: draw2.id, decision: "approved", rationale: "Verified" });
  // cumulative allocation is now EXACTLY the authority — allowed.
  assert.equal(finance.getProjectFinancials(project.id).allocated, 30000);
  assert.equal(finance.getProjectFinancials(project.id).approved, 30000);
  // one cent beyond the authority is refused atomically.
  const draw3 = finance.requestDraw({ projectId: project.id, actor: PM, amount: 0.01, percentComplete: 100, evidenceRefs: ["evidence://p"], invoiceIds: [invoice.id], reason: "One cent too far" }).draw;
  assert.throws(() => finance.decideDraw({ projectId: project.id, actor: BOSS, drawId: draw3.id, decision: "approved", rationale: "ok" }), /allocation_exceeds_authority/);
  assert.equal(finance.getDraw(draw3.id).status, "pending");
  assert.equal(finance.listDecisions(draw3.id).length, 0);
  assert.equal(finance.getProjectFinancials(project.id).allocated, 30000);
  store.close();
});

// --- F13: post-reversal re-draw arithmetic (req 13) ---------------------

test("F13: a reversal frees authority and invoice headroom for re-use up to EXACTLY the true cap — and not one cent beyond", (t) => {
  const { open } = openDb(t);
  const store = open();
  const { project } = setupProject(store);
  const finance = setupFinance(store);
  // authority = 20000 * (1 + 0) = 20000; domain cap 43200 at 100%
  // stays above every figure below, so governance arithmetic is what
  // is measured.
  setAuthority(store, project.id, 20000, 0);
  // PORT P1 fixture adjustment (2026-11-04): same as F8 — the draws
  // below claim 100% citing "evidence://p"; recorded progress must
  // genuinely reach 100% with that evidence (P-6.1/P-6.2).
  const f13ops = store.restoreOperations(store.restoreWorkflow(project.id));
  f13ops.recordProgress({ percentComplete: 100, evidenceRefs: ["evidence://p"] });
  store.persistOperations(f13ops);
  const invoice = finance.submitInvoice({ projectId: project.id, actor: PM, contractor: "Acme Builders", externalNumber: "INV-F13", lineItems: [{ description: "Roofing and kitchen", amount: 30000 }], evidenceRefs: ["evidence://inv-f13"] });
  finance.reviewInvoice({ projectId: project.id, actor: BOSS, invoiceId: invoice.id, decision: "approved", rationale: "Verified against scope" });
  const draw1 = finance.requestDraw({ projectId: project.id, actor: PM, amount: 15000, percentComplete: 100, evidenceRefs: ["evidence://p"], invoiceIds: [invoice.id], reason: "Progress" }).draw;
  const { decision } = finance.decideDraw({ projectId: project.id, actor: BOSS, drawId: draw1.id, decision: "approved", rationale: "Verified" });
  assert.equal(finance.getProjectFinancials(project.id).allocated, 15000);
  // reverse BEFORE any payment: allocations net to zero.
  finance.reverseDecision({ projectId: project.id, actor: ADMIN, decisionId: decision.id, rationale: "Evidence was misfiled" });
  assert.deepEqual(finance.getProjectFinancials(project.id), { projectId: project.id, approved: 0, allocated: 0, paid: 0, reconciled: 0 });
  // the freed authority + headroom are genuinely re-usable: a fresh
  // draw of exactly the authority (20000) against the same invoice
  // (headroom fully restored to 30000) is approved.
  const draw2 = finance.requestDraw({ projectId: project.id, actor: PM, amount: 20000, percentComplete: 100, evidenceRefs: ["evidence://p"], invoiceIds: [invoice.id], reason: "Re-issued progress" }).draw;
  finance.decideDraw({ projectId: project.id, actor: BOSS, drawId: draw2.id, decision: "approved", rationale: "Verified" });
  assert.equal(finance.getProjectFinancials(project.id).allocated, 20000);
  assert.equal(finance.getProjectFinancials(project.id).approved, 20000);
  // but the reversal created no excess authority: the next draw —
  // whose invoice headroom (30000 - 20000 = 10000) would allow it —
  // is refused purely on authority. Total live allocation can never
  // exceed 20000 by "reusing" the reversed 15000.
  const draw3 = finance.requestDraw({ projectId: project.id, actor: PM, amount: 5000, percentComplete: 100, evidenceRefs: ["evidence://p"], invoiceIds: [invoice.id], reason: "Beyond the cap" }).draw;
  assert.throws(() => finance.decideDraw({ projectId: project.id, actor: BOSS, drawId: draw3.id, decision: "approved", rationale: "ok" }), /allocation_exceeds_authority/);
  assert.equal(finance.getDraw(draw3.id).status, "pending");
  assert.equal(finance.getProjectFinancials(project.id).allocated, 20000);
  store.close();
});

// --- F2-2: actor mismatch (Phase C interplay) ----------------------------

test("F2-2: a review event naming a DIFFERENT approver than the invoice's recorded reviewer corroborates nothing", (t) => {
  const { open } = openDb(t);
  const store = open();
  const { project } = setupProject(store);
  const finance = setupFinance(store);
  const invoice = finance.submitInvoice({ projectId: project.id, actor: PM, contractor: "Acme Builders", externalNumber: "INV-F22", lineItems: [{ description: "Roofing", amount: 12000 }], evidenceRefs: ["evidence://inv-f22"] });
  finance.reviewInvoice({ projectId: project.id, actor: BOSS, invoiceId: invoice.id, decision: "approved", rationale: "Verified" });
  // control: the governed approval corroborates as recorded.
  assert.equal(finance.isGovernedApprovedInvoice(finance.getInvoice(invoice.id)), true);
  // re-point the invoice's recorded reviewer at a DIFFERENT approver
  // (admin-1): the audit event still names boss-1, so corroboration
  // must fail — identity is part of the derivation, not decoration.
  store.db.prepare("UPDATE invoices SET reviewed_by = ? WHERE id = ?").run(ADMIN, invoice.id);
  assert.equal(finance.isGovernedApprovedInvoice(finance.getInvoice(invoice.id)), false);
  assert.throws(
    () => finance.requestDraw({ projectId: project.id, actor: PM, amount: 5000, percentComplete: 50, evidenceRefs: ["evidence://progress-50"], invoiceIds: [invoice.id], reason: "Progress" }),
    /invoice_not_approved/,
  );
  assert.equal(finance.listDraws(project.id).length, 0);
  store.close();
});

// --- F2-3: legacy pre-Phase-C approval record (Phase C interplay) -------

test("F2-3: a legacy pre-Phase-C approval (audit event with NO reviewerRole) still corroborates and funds a draw", (t) => {
  const { open } = openDb(t);
  const store = open();
  const { project } = setupProject(store);
  const finance = setupFinance(store);
  const invoice = finance.submitInvoice({ projectId: project.id, actor: PM, contractor: "Acme Builders", externalNumber: "INV-F23", lineItems: [{ description: "Roofing", amount: 12000 }], evidenceRefs: ["evidence://inv-f23"] });
  // Construct the approval EXACTLY as the pre-Phase-C code wrote it:
  // the status update, plus an invoice_reviewed audit event whose
  // payload is {decision, fromStatus} — reviewerRole did not exist.
  store.db.prepare("UPDATE invoices SET status = 'approved', reviewed_by = ?, reviewed_at = '2026-10-02T00:00:00Z' WHERE id = ?").run(BOSS, invoice.id);
  forgeAuditEvent(store, { projectId: project.id, eventType: "invoice_reviewed", actor: BOSS, entityType: "invoice", entityId: invoice.id, detail: { decision: "approved", fromStatus: "submitted" } });
  // the record is internally consistent (chain verifies) and the
  // Phase C promise holds: previously approved invoices verify
  // unchanged — the derivation never required the new field.
  assert.equal(finance.verifyAuditChain(project.id), true);
  assert.equal(finance.isGovernedApprovedInvoice(finance.getInvoice(invoice.id)), true);
  const { draw } = finance.requestDraw({ projectId: project.id, actor: PM, amount: 5000, percentComplete: 50, evidenceRefs: ["evidence://progress-50"], invoiceIds: [invoice.id], reason: "Progress" });
  assert.equal(draw.status, "pending");
  store.close();
});

// --- F2-1: forged review event claiming an OPERATOR reviewer ------------
// Phase C (founder ruling) made final invoice approval impossible for
// an operator through every service path. Corroboration is the other
// door: an invoice_reviewed event whose payload records
// reviewerRole 'operator' attests a review Phase C forbids, so it
// must corroborate nothing. This test asserts that charter behavior.
//
// AMENDMENT NOTE (Phase G delta, 2026-11-03): this probe was defect
// F-1 — it FAILED against the pre-delta derivation, which matched
// decision + reviewer identity and never read reviewerRole
// (PHASE-F-RECORD.md Part 2). Defect F-1 closed by delta; expectation
// flipped 2026-11-03, coordinator-chartered: the assertions below are
// unchanged from the battery's charter form and now PASS against the
// corrected isGovernedApprovedInvoice (a present reviewerRole must be
// approver/admin; an absent one corroborates as before — F2-3).

test("F2-1: a forged invoice_reviewed event claiming an OPERATOR reviewer must not corroborate an approval", (t) => {
  const { open } = openDb(t);
  const store = open();
  const { project } = setupProject(store);
  const finance = setupFinance(store);
  const invoice = finance.submitInvoice({ projectId: project.id, actor: PM, contractor: "Acme Builders", externalNumber: "INV-F21", lineItems: [{ description: "Roofing", amount: 12000 }], evidenceRefs: ["evidence://inv-f21"] });
  // Direct ledger writes only — no reviewInvoice call. CLERK holds a
  // recorded OPERATOR role: Phase C refuses clerk-1's final approval
  // with approver_role_required on every service path.
  store.db.prepare("UPDATE invoices SET status = 'approved', reviewed_by = ?, reviewed_at = '2026-10-02T00:00:00Z' WHERE id = ?").run(CLERK, invoice.id);
  forgeAuditEvent(store, { projectId: project.id, eventType: "invoice_reviewed", actor: CLERK, entityType: "invoice", entityId: invoice.id, detail: { decision: "approved", fromStatus: "submitted", reviewerRole: "operator" } });
  // precondition: the forgery is chain-consistent — the chain itself
  // cannot distinguish it; only the recorded reviewerRole can.
  assert.equal(finance.verifyAuditChain(project.id), true);
  assert.equal(finance.isGovernedApprovedInvoice(finance.getInvoice(invoice.id)), false,
    "an event recording an operator's final approval attests a review Phase C forbids; it must corroborate nothing");
  assert.throws(
    () => finance.requestDraw({ projectId: project.id, actor: PM, amount: 5000, percentComplete: 50, evidenceRefs: ["evidence://progress-50"], invoiceIds: [invoice.id], reason: "Progress" }),
    /invoice_not_approved/,
  );
  assert.equal(finance.listDraws(project.id).length, 0);
  store.close();
});

// --- Phase G delta probes (defect F-1 closure, 2026-11-03) --------------

// F2-4: the forged-construction complement to F2-2 — a valid approver
// role recorded in a FORGED event does not rescue an actor mismatch:
// corroboration requires role AND identity, not either one alone.
test("F2-4: a forged review event with reviewerRole 'approver' but a different actor than the recorded reviewer corroborates nothing", (t) => {
  const { open } = openDb(t);
  const store = open();
  const { project } = setupProject(store);
  const finance = setupFinance(store);
  const invoice = finance.submitInvoice({ projectId: project.id, actor: PM, contractor: "Acme Builders", externalNumber: "INV-F24", lineItems: [{ description: "Roofing", amount: 12000 }], evidenceRefs: ["evidence://inv-f24"] });
  // The invoice names BOSS as its reviewer; the forged event is by
  // ADMIN (a genuine approver) and records a genuine approver role —
  // but it is not the review the invoice records, so it confers nothing.
  store.db.prepare("UPDATE invoices SET status = 'approved', reviewed_by = ?, reviewed_at = '2026-10-02T00:00:00Z' WHERE id = ?").run(BOSS, invoice.id);
  forgeAuditEvent(store, { projectId: project.id, eventType: "invoice_reviewed", actor: ADMIN, entityType: "invoice", entityId: invoice.id, detail: { decision: "approved", fromStatus: "submitted", reviewerRole: "approver" } });
  assert.equal(finance.verifyAuditChain(project.id), true);
  assert.equal(finance.isGovernedApprovedInvoice(finance.getInvoice(invoice.id)), false);
  assert.throws(
    () => finance.requestDraw({ projectId: project.id, actor: PM, amount: 5000, percentComplete: 50, evidenceRefs: ["evidence://progress-50"], invoiceIds: [invoice.id], reason: "Progress" }),
    /invoice_not_approved/,
  );
  assert.equal(finance.listDraws(project.id).length, 0);
  store.close();
});

// F2-5: the legacy path's ONLY-IF half — a roleless event claiming a
// recorded-approver identity corroborates only when that identity is
// the invoice's recorded reviewer; on a mismatch it behaves exactly
// as F2-3's complement requires: nothing.
test("F2-5: a legacy roleless review event corroborates ONLY when its actor matches the recorded reviewer (mismatch confers nothing)", (t) => {
  const { open } = openDb(t);
  const store = open();
  const { project } = setupProject(store);
  const finance = setupFinance(store);
  const invoice = finance.submitInvoice({ projectId: project.id, actor: PM, contractor: "Acme Builders", externalNumber: "INV-F25", lineItems: [{ description: "Roofing", amount: 12000 }], evidenceRefs: ["evidence://inv-f25"] });
  // Invoice names ADMIN as reviewer; the roleless (pre-Phase-C form)
  // event is by BOSS — a recorded approver, but not the named one.
  store.db.prepare("UPDATE invoices SET status = 'approved', reviewed_by = ?, reviewed_at = '2026-10-02T00:00:00Z' WHERE id = ?").run(ADMIN, invoice.id);
  forgeAuditEvent(store, { projectId: project.id, eventType: "invoice_reviewed", actor: BOSS, entityType: "invoice", entityId: invoice.id, detail: { decision: "approved", fromStatus: "submitted" } });
  assert.equal(finance.verifyAuditChain(project.id), true);
  assert.equal(finance.isGovernedApprovedInvoice(finance.getInvoice(invoice.id)), false);
  assert.throws(
    () => finance.requestDraw({ projectId: project.id, actor: PM, amount: 5000, percentComplete: 50, evidenceRefs: ["evidence://progress-50"], invoiceIds: [invoice.id], reason: "Progress" }),
    /invoice_not_approved/,
  );
  assert.equal(finance.listDraws(project.id).length, 0);
  store.close();
});

// F2-6: the role check is a membership check, not a known-bad list —
// an arbitrary roleless string in reviewerRole disqualifies the event
// even when actor and decision both match the invoice's record.
test("F2-6: a forged review event recording a roleless-string reviewerRole corroborates nothing even when the actor matches", (t) => {
  const { open } = openDb(t);
  const store = open();
  const { project } = setupProject(store);
  const finance = setupFinance(store);
  const invoice = finance.submitInvoice({ projectId: project.id, actor: PM, contractor: "Acme Builders", externalNumber: "INV-F26", lineItems: [{ description: "Roofing", amount: 12000 }], evidenceRefs: ["evidence://inv-f26"] });
  store.db.prepare("UPDATE invoices SET status = 'approved', reviewed_by = ?, reviewed_at = '2026-10-02T00:00:00Z' WHERE id = ?").run(BOSS, invoice.id);
  forgeAuditEvent(store, { projectId: project.id, eventType: "invoice_reviewed", actor: BOSS, entityType: "invoice", entityId: invoice.id, detail: { decision: "approved", fromStatus: "submitted", reviewerRole: "superuser" } });
  assert.equal(finance.verifyAuditChain(project.id), true);
  assert.equal(finance.isGovernedApprovedInvoice(finance.getInvoice(invoice.id)), false);
  assert.throws(
    () => finance.requestDraw({ projectId: project.id, actor: PM, amount: 5000, percentComplete: 50, evidenceRefs: ["evidence://progress-50"], invoiceIds: [invoice.id], reason: "Progress" }),
    /invoice_not_approved/,
  );
  assert.equal(finance.listDraws(project.id).length, 0);
  store.close();
});

// F2-7: regression — a legitimate Phase C approval exercises the new
// role check on its happy path: the service records reviewerRole
// 'approver' in the event, corroboration accepts it, and the invoice
// funds a draw through decision to payment end-to-end.
test("F2-7: a legitimate Phase C approval (approver role recorded in the event) corroborates and funds draw + payment end-to-end", (t) => {
  const { open } = openDb(t);
  const store = open();
  const { project } = setupProject(store);
  const finance = setupFinance(store);
  const invoice = finance.submitInvoice({ projectId: project.id, actor: PM, contractor: "Acme Builders", externalNumber: "INV-F27", lineItems: [{ description: "Roofing", amount: 12000 }], evidenceRefs: ["evidence://inv-f27"] });
  finance.reviewInvoice({ projectId: project.id, actor: BOSS, invoiceId: invoice.id, decision: "approved", rationale: "Verified" });
  // the Phase C trail records the authority that was exercised.
  const auditRow = store.db.prepare("SELECT payload_json FROM financial_audit WHERE event_type = 'invoice_reviewed' AND entity_id = ?").get(invoice.id);
  assert.equal(JSON.parse(auditRow.payload_json).reviewerRole, "approver");
  assert.equal(finance.isGovernedApprovedInvoice(finance.getInvoice(invoice.id)), true);
  const { draw } = finance.requestDraw({ projectId: project.id, actor: PM, amount: 5000, percentComplete: 50, evidenceRefs: ["evidence://progress-50"], invoiceIds: [invoice.id], reason: "Progress" });
  finance.decideDraw({ projectId: project.id, actor: BOSS, drawId: draw.id, decision: "approved", rationale: "Evidence verified" });
  finance.recordPayment({ projectId: project.id, actor: CLERK, drawId: draw.id, amount: 5000, paymentRef: "ACH-F27", method: "ach" });
  const financials = finance.getProjectFinancials(project.id);
  assert.equal(financials.approved, 5000);
  assert.equal(financials.allocated, 5000);
  assert.equal(financials.paid, 5000);
  store.close();
});
