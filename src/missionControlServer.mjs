import { createServer } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { MissionControlStore, DEFAULT_TENANT_ID } from "./missionControlStore.mjs";
import { MissionControlFinance } from "./financialGovernance.mjs";
import {
  MissionControlOperationsCompletion,
  projectHealth,
  buildLenderPackage,
} from "./operationsCompletion.mjs";
import { createMissionControlHandoffHandler } from "./missionControlHttpReceiver.mjs";
import { receiveClosedAcquisition } from "./missionControlIntake.mjs";

// Mission Control operator server (Unit 3).
//
// Composition only: this module adds NO business rules. The pipeline handoff
// intake is the existing receiver module, delegated to unmodified. Every
// operator write calls the U1b finance / U2 operations service functions and
// maps their error codes to HTTP. Auth is fail-closed: without a configured
// operator token the API answers 503 operator_auth_not_configured, never open.
// The tenant is server-side configuration; clients cannot select one.
//
// U4R2 transport hardening (OBS-G1 / OBS-G2), operator API only — the
// handoff receiver keeps its own contract and its own body reader:
// POST /api/* requires Content-Type application/json (parameters such
// as charset are allowed), else 415 unsupported_content_type; request
// bodies are stream-capped (default 1 MiB, override via the
// MISSION_CONTROL_MAX_BODY_BYTES env or the maxBodyBytes option) —
// bytes past the cap are discarded as they arrive, never buffered,
// and an over-cap body is refused 413 body_too_large.
//
// Port P2 (reconciliation PRESERVE 3.1): per-actor token binding. An
// optional registry (actorTokens option / MISSION_CONTROL_ACTOR_TOKENS
// env, a token -> actorId map) binds write actor identity to the
// credential presented, the desktop API's model: with a registry
// configured, a registry token's actor IS the bound actor (a
// disagreeing x-actor-id is 403 actor_token_mismatch), and the shared
// operator token remains valid for reads but no longer writes (403
// actor_token_required). With NO registry configured, the legacy
// posture stands: the shared token writes under an asserted
// x-actor-id. Either way the store's recorded role remains the
// authority for what the actor may do — binding is identity, not
// authorization, and the claimed-role cross-check still applies.

const OPERATOR_HTML = readFileSync(new URL("../web/operator.html", import.meta.url), "utf8");

const DEFAULT_MAX_BODY_BYTES = 1024 * 1024;

function resolveMaxBodyBytes(optionValue) {
  const raw = optionValue ?? process.env.MISSION_CONTROL_MAX_BODY_BYTES;
  const parsed = raw == null ? NaN : Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : DEFAULT_MAX_BODY_BYTES;
}

function httpError(status, code) {
  const error = new Error(code);
  error.httpStatus = status;
  return error;
}

function statusForServiceError(error) {
  if (error?.httpStatus) return error.httpStatus;
  const code = String(error?.message || "");
  if (code.endsWith("_not_found") || code === "project_not_found") return 404;
  return 400;
}

async function readJsonBody(req, maxBodyBytes = DEFAULT_MAX_BODY_BYTES) {
  const chunks = [];
  let received = 0;
  let overflow = false;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    received += buffer.length;
    if (received > maxBodyBytes) overflow = true;
    else chunks.push(buffer);
  }
  if (overflow) throw httpError(413, "body_too_large");
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw.trim()) throw httpError(400, "empty_request_body");
  try {
    return JSON.parse(raw);
  } catch {
    throw httpError(400, "invalid_json");
  }
}

function tokenEquals(supplied, expected) {
  const left = Buffer.from(String(supplied));
  const right = Buffer.from(String(expected));
  return left.length === right.length && timingSafeEqual(left, right);
}

function presentedToken(req) {
  const header = String(req.headers.authorization || "");
  return header.startsWith("Bearer ") ? header.slice(7) : null;
}

function tokenAuthorized(req, token) {
  if (!token) return false;
  const supplied = presentedToken(req);
  return supplied != null && tokenEquals(supplied, token);
}

// Normalize the actor-token registry from the factory option: an object
// map token -> actorId, or a JSON string of the same. Malformed config
// throws actor_tokens_invalid at construction — a misconfigured
// registry must fail closed at boot, never silently degrade to
// shared-token writes.
function normalizeActorTokens(raw) {
  if (raw == null) return {};
  let parsed = raw;
  if (typeof raw === "string") {
    try { parsed = JSON.parse(raw); } catch { throw new Error("actor_tokens_invalid"); }
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("actor_tokens_invalid");
  const registry = {};
  for (const [token, actorId] of Object.entries(parsed)) {
    if (!token || typeof actorId !== "string" || !actorId.trim()) throw new Error("actor_tokens_invalid");
    registry[token] = actorId;
  }
  return registry;
}

function demoHandoffPayload({ opportunityId, address, purchasePrice, arv, rehab }) {
  return {
    contractVersion: "1.0",
    sourceSystem: "pipeline",
    targetSystem: "mission-control",
    opportunityId,
    opportunityCode: `DEMO-${opportunityId}`,
    propertyId: `demo-property-${opportunityId}`,
    address,
    closedAt: "2026-10-01T16:00:00Z",
    acquisition: { purchasePrice, earnestMoney: 1000, strategyType: "cash_purchase", offerId: "demo-offer-1", offerVersionId: "demo-version-1" },
    underwriting: { sourceSystem: "deal-scout", sourceUnderwritingId: "demo-victor-1", arv, rehab, mao: purchasePrice + 10000, confidence: 0.9, limitations: null },
    renovationSeed: { budgetBaseline: rehab, scopeStatus: "needs_field_validation", projectStatus: "intake_ready" },
  };
}

/** Idempotent synthetic seed for demo mode. Names are unmistakably synthetic. */
export function seedDemoData({ store, finance, ops, tenantId }) {
  if (store.listProjects(tenantId).length > 0) return { seeded: false };
  finance.setActorRole({ tenantId, actorId: "demo-pm", role: "operator" });
  finance.setActorRole({ tenantId, actorId: "demo-approver", role: "approver" });
  const repository = store.intakeRepository(tenantId);

  const { project } = receiveClosedAcquisition({
    handoffId: "demo-handoff-1",
    payload: demoHandoffPayload({ opportunityId: "demo-opp-1", address: "DEMO — 123 Example St", purchasePrice: 120000, arv: 240000, rehab: 48000 }),
    repository,
  });
  const workflow = store.restoreWorkflow(project.id, { tenantId });
  workflow.validateScope({ actor: "demo-pm", items: [
    { title: "Roof replacement", category: "exterior", estimatedCost: 12000 },
    { title: "Kitchen remodel", category: "interior", estimatedCost: 30000 },
  ] });
  workflow.approveBudget({ actor: "demo-approver", amount: 50000, contingencyPct: 10, rationale: "Demo baseline" });
  const bid = workflow.addBid({ actor: "demo-pm", contractor: "DEMO Builders LLC", amount: 48000, days: 45 });
  workflow.selectBid({ actor: "demo-approver", bidId: bid.id, rationale: "Demo selection" });
  workflow.scheduleWork({ actor: "demo-pm", startAt: "2026-10-05T08:00:00Z", targetCompleteAt: "2026-11-20T17:00:00Z" });
  workflow.startWork({ actor: "demo-pm", startedAt: "2026-10-05T08:05:00Z" });
  store.persistWorkflow(workflow, { tenantId });
  const operations = store.restoreOperations(workflow, { tenantId });
  operations.recordProgress({ actor: "demo-pm", percentComplete: 50, evidenceRefs: ["evidence://demo-progress-50"], note: "Demo progress" });
  store.persistOperations(operations, { tenantId });

  const invoice = finance.submitInvoice({
    tenantId, projectId: project.id, actor: "demo-pm", contractor: "DEMO Builders LLC", externalNumber: "DEMO-INV-100",
    lineItems: [{ description: "Roof replacement", amount: 12000 }],
    evidenceRefs: ["evidence://demo-invoice-100"],
  });
  finance.reviewInvoice({ tenantId, projectId: project.id, actor: "demo-approver", invoiceId: invoice.id, decision: "approved", rationale: "Demo review" });
  finance.requestDraw({
    tenantId, projectId: project.id, actor: "demo-pm", amount: 12000, percentComplete: 50,
    evidenceRefs: ["evidence://demo-progress-50"], invoiceIds: [invoice.id],
    reason: "Demo draw — roof complete", idempotencyKey: "demo-draw-1",
  });
  ops.scheduleInspection({ tenantId, projectId: project.id, actor: "demo-pm", type: "framing", scheduledFor: "2026-10-12T09:00:00Z", inspectorRef: "DEMO Inspector (synthetic)" });
  ops.createTask({ tenantId, projectId: project.id, actor: "demo-pm", title: "DEMO task — order kitchen cabinets", startsOn: "2026-10-06", dueOn: "2026-10-20" });
  ops.createTask({ tenantId, projectId: project.id, actor: "demo-pm", title: "DEMO task — schedule final walkthrough", startsOn: "2026-11-01", dueOn: "2026-11-18" });

  receiveClosedAcquisition({
    handoffId: "demo-handoff-2",
    payload: demoHandoffPayload({ opportunityId: "demo-opp-2", address: "DEMO — 456 Sample Ave", purchasePrice: 95000, arv: 180000, rehab: 35000 }),
    repository,
  });
  return { seeded: true };
}

export function createMissionControlServer(options = {}) {
  const store = options.store || new MissionControlStore(options.dbPath || ":memory:", { tenantId: options.tenantId || DEFAULT_TENANT_ID });
  const tenantId = options.tenantId || store.defaultTenantId || DEFAULT_TENANT_ID;
  const operatorToken = options.operatorToken ?? null;
  const maxBodyBytes = resolveMaxBodyBytes(options.maxBodyBytes);
  const demo = options.demo === true;
  let actorTokens = normalizeActorTokens(options.actorTokens ?? null);
  let seededDemoActorTokens = null;
  const finance = new MissionControlFinance(store);
  const ops = new MissionControlOperationsCompletion(store);
  if (demo) {
    seedDemoData({ store, finance, ops, tenantId });
    // Demo runs in the bound posture: its synthetic actors get
    // deterministic synthetic credentials (overridable via the
    // actorTokens option / env) so the page and harness exercise the
    // same identity binding as a configured deployment.
    if (Object.keys(actorTokens).length === 0) {
      actorTokens = { "demo-token-pm": "demo-pm", "demo-token-approver": "demo-approver" };
      seededDemoActorTokens = actorTokens;
    }
  }
  const registryConfigured = Object.keys(actorTokens).length > 0;

  // The actor a presented credential is bound to, or null. Every
  // registry entry is compared (length-guarded, constant-time) with
  // no early exit, so the lookup does not leak which entry matched.
  function boundActorFor(req) {
    const supplied = presentedToken(req);
    if (supplied == null || !registryConfigured) return null;
    let bound = null;
    for (const [token, actorId] of Object.entries(actorTokens)) {
      if (tokenEquals(supplied, token)) bound = actorId;
    }
    return bound;
  }

  const handoffHandler = createMissionControlHandoffHandler({
    repository: store.intakeRepository(tenantId),
    secret: options.handoffSecret ?? null,
    // L-2: the server's resolved body cap governs the handoff
    // receiver's reader too, so both HTTP readers share one limit.
    maxBodyBytes,
  });

  function sendJson(res, status, body) {
    const payload = demo ? { demo: true, ...body } : body;
    const text = JSON.stringify(payload);
    res.writeHead(status, { "content-type": "application/json; charset=utf-8", "content-length": Buffer.byteLength(text) });
    res.end(text);
  }

  function sendOperatorPage(res) {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8", "content-length": Buffer.byteLength(OPERATOR_HTML) });
    res.end(OPERATOR_HTML);
  }

  function healthSummary(projectId) {
    try {
      const health = projectHealth(store, tenantId, projectId, new Date().toISOString());
      return {
        riskLevel: health.riskLevel,
        domainRiskLevel: health.domainRiskLevel,
        findings: health.findings,
        counts: health.counts,
        nextAction: health.nextAction,
      };
    } catch (error) {
      return { riskLevel: "unknown", domainRiskLevel: "unknown", findings: [], counts: {}, nextAction: null, healthError: String(error?.message || error) };
    }
  }

  function projectListItem(project) {
    const workflow = store.restoreWorkflow(project.id, { tenantId });
    const snapshot = workflow.snapshot();
    const financials = finance.getProjectFinancials(project.id, tenantId);
    const health = healthSummary(project.id);
    return {
      id: project.id,
      address: project.address,
      sourceOpportunityId: project.sourceOpportunityId,
      sourceOpportunityCode: project.sourceOpportunityCode,
      stage: snapshot.project.stage,
      scopeStatus: snapshot.project.scopeStatus,
      budgetStatus: snapshot.project.budgetStatus,
      budget: {
        authority: snapshot.budget.contingencyAuthority,
        approvedBudget: snapshot.budget.approvedBudget,
        committed: snapshot.budget.committed,
      },
      financials,
      health,
      nextAction: health.nextAction,
    };
  }

  function projectDetail(project) {
    const workflow = store.restoreWorkflow(project.id, { tenantId });
    const operations = store.restoreOperations(workflow, { tenantId });
    let riskReport = null;
    try { riskReport = operations.riskReport(); } catch { riskReport = null; }
    const draws = finance.listDraws(project.id, tenantId).map(draw => ({
      ...draw,
      decisions: finance.listDecisions(draw.id, tenantId),
      allocations: finance.listAllocations(draw.id, tenantId),
      financials: finance.getDrawFinancials(draw.id, tenantId),
    }));
    return {
      ...projectListItem(project),
      project,
      workflow: workflow.snapshot(),
      operations: {
        progressUpdates: operations.progressUpdates,
        contractorScorecards: operations.contractorScorecards,
        riskReport,
      },
      invoices: finance.listInvoices(project.id, tenantId),
      draws,
      payments: finance.listPayments(project.id, tenantId),
      reconciliations: finance.listReconciliations(project.id, tenantId),
      inspections: ops.listInspections(project.id, tenantId),
      permits: ops.listPermits(project.id, tenantId),
      tasks: ops.listTasks(project.id, tenantId),
      scheduleHealth: ops.scheduleHealth(project.id, new Date().toISOString(), tenantId),
      materials: ops.listMaterials(project.id, tenantId),
      materialsSummary: ops.materialsSummary(project.id, tenantId),
      contractors: ops.listContractors(tenantId),
    };
  }

  // Actor identity for writes. With a registry configured, identity is
  // possessed, not asserted: the effective actor is the one bound to the
  // presented token; an x-actor-id that disagrees is a misrepresentation
  // (403 actor_token_mismatch), and the shared operator token — valid
  // for reads — cannot write at all (403 actor_token_required). With no
  // registry, the legacy posture stands: x-actor-id is required. Either
  // way, a supplied x-actor-role must match the role recorded in the
  // store for the effective actor (403 actor_role_mismatch), and the
  // service layer's own role gates remain the authority for what the
  // actor may do.
  function actorFrom(req, boundActor) {
    const asserted = String(req.headers["x-actor-id"] || "").trim();
    let actorId;
    if (boundActor) {
      if (asserted && asserted !== boundActor) throw httpError(403, "actor_token_mismatch");
      actorId = boundActor;
    } else if (registryConfigured) {
      throw httpError(403, "actor_token_required");
    } else {
      if (!asserted) throw httpError(400, "actor_id_required");
      actorId = asserted;
    }
    const claimedRole = String(req.headers["x-actor-role"] || "").trim();
    if (claimedRole && finance.actorRole(tenantId, actorId) !== claimedRole) {
      throw httpError(403, "actor_role_mismatch");
    }
    return actorId;
  }

  function requireProject(projectId) {
    const project = store.getProject(projectId, tenantId);
    if (!project) throw httpError(404, "project_not_found");
    return project;
  }

  async function handleApi(req, res, url) {
    if (!operatorToken && !registryConfigured) { sendJson(res, 503, { ok: false, error: "operator_auth_not_configured" }); return; }
    const boundActor = boundActorFor(req);
    if (!boundActor && !tokenAuthorized(req, operatorToken)) { sendJson(res, 401, { ok: false, error: "unauthorized" }); return; }

    const segments = url.pathname.split("/").filter(Boolean).map(part => {
      try { return decodeURIComponent(part); } catch { return part; }
    });
    const method = req.method;
    try {
      if (segments[0] !== "api" || segments[1] !== "projects") throw httpError(404, "route_not_found");

      if (segments.length === 2) {
        if (method !== "GET") throw httpError(404, "route_not_found");
        sendJson(res, 200, { ok: true, data: { tenantId, projects: store.listProjects(tenantId).map(projectListItem) } });
        return;
      }

      const projectId = segments[2];
      const project = requireProject(projectId);

      if (segments.length === 3) {
        if (method !== "GET") throw httpError(404, "route_not_found");
        sendJson(res, 200, { ok: true, data: projectDetail(project) });
        return;
      }

      if (method === "POST") {
        const mediaType = String(req.headers["content-type"] || "").split(";")[0].trim().toLowerCase();
        if (mediaType !== "application/json") throw httpError(415, "unsupported_content_type");
      }
      const body = method === "POST" ? await readJsonBody(req, maxBodyBytes) : null;
      const actor = method === "POST" ? actorFrom(req, boundActor) : null;
      const resource = segments[3];

      if (resource === "invoices" && segments.length === 4 && method === "POST") {
        const invoice = finance.submitInvoice({
          tenantId, projectId, actor,
          contractor: body.contractor, externalNumber: body.externalNumber,
          lineItems: body.lineItems, total: body.total ?? null,
          evidenceRefs: body.evidenceRefs, resubmissionOf: body.resubmissionOf ?? null,
        });
        sendJson(res, 201, { ok: true, data: invoice });
        return;
      }
      if (resource === "invoices" && segments.length === 6 && segments[5] === "review" && method === "POST") {
        const invoice = finance.reviewInvoice({
          tenantId, projectId, actor, invoiceId: segments[4],
          decision: body.decision, rationale: body.rationale ?? null,
        });
        sendJson(res, 200, { ok: true, data: invoice });
        return;
      }
      if (resource === "draws" && segments.length === 4 && method === "POST") {
        const result = finance.requestDraw({
          tenantId, projectId, actor,
          amount: body.amount, percentComplete: body.percentComplete,
          evidenceRefs: body.evidenceRefs, invoiceIds: body.invoiceIds,
          retainagePct: body.retainagePct ?? 10, reason: body.reason,
          idempotencyKey: body.idempotencyKey ?? null,
        });
        sendJson(res, result.duplicate ? 200 : 201, { ok: true, data: result });
        return;
      }
      if (resource === "draws" && segments.length === 6 && segments[5] === "decide" && method === "POST") {
        const result = finance.decideDraw({
          tenantId, projectId, actor, drawId: segments[4],
          decision: body.decision, approvedAmount: body.approvedAmount ?? null,
          rationale: body.rationale,
        });
        sendJson(res, 200, { ok: true, data: result });
        return;
      }
      if (resource === "draws" && segments.length === 6 && segments[5] === "payments" && method === "POST") {
        const result = finance.recordPayment({
          tenantId, projectId, actor, drawId: segments[4],
          amount: body.amount, paymentRef: body.paymentRef,
          method: body.method ?? null, paidAt: body.paidAt ?? null,
          idempotencyKey: body.idempotencyKey ?? null,
        });
        sendJson(res, result.duplicate ? 200 : 201, { ok: true, data: result });
        return;
      }
      if (resource === "draws" && segments.length === 6 && segments[5] === "package" && method === "GET") {
        const pkg = buildLenderPackage(store, tenantId, projectId, segments[4]);
        sendJson(res, 200, { ok: true, data: pkg });
        return;
      }
      if (resource === "payments" && segments.length === 6 && segments[5] === "reconciliation" && method === "POST") {
        const reconciliation = finance.recordReconciliation({
          tenantId, projectId, actor, paymentId: segments[4], bankRecord: body.bankRecord,
        });
        sendJson(res, 201, { ok: true, data: reconciliation });
        return;
      }
      if (resource === "reconciliation-breakdown" && segments.length === 4 && method === "POST") {
        // Read-only set reconciliation against caller-supplied bank
        // records (port P-B3): the records travel in the POST body
        // because the set is caller input, not server state — the
        // service writes nothing.
        const report = finance.reconciliationBreakdown(projectId, body.bankRecords, tenantId);
        sendJson(res, 200, { ok: true, data: report });
        return;
      }
      if (resource === "inspections" && segments.length === 4 && method === "POST") {
        const inspection = ops.scheduleInspection({
          tenantId, projectId, actor,
          type: body.type, scheduledFor: body.scheduledFor,
          inspectorRef: body.inspectorRef, supersedesId: body.supersedesId ?? null,
        });
        sendJson(res, 201, { ok: true, data: inspection });
        return;
      }
      if (resource === "inspections" && segments.length === 6 && segments[5] === "outcome" && method === "POST") {
        const inspection = ops.recordInspectionOutcome({
          tenantId, projectId, actor, inspectionId: segments[4],
          outcome: body.outcome, evidenceRef: body.evidenceRef ?? null,
          correctionItems: body.correctionItems ?? null,
          expectedVersion: body.expectedVersion ?? null,
        });
        sendJson(res, 200, { ok: true, data: inspection });
        return;
      }
      if (resource === "corrections" && segments.length === 6 && segments[5] === "complete" && method === "POST") {
        const correction = ops.completeCorrectionItem({
          tenantId, projectId, actor, correctionId: segments[4], evidenceRef: body.evidenceRef,
        });
        sendJson(res, 200, { ok: true, data: correction });
        return;
      }
      if (resource === "tasks" && segments.length === 4 && method === "POST") {
        const task = ops.createTask({
          tenantId, projectId, actor,
          title: body.title, stage: body.stage ?? null,
          startsOn: body.startsOn, dueOn: body.dueOn,
          dependsOn: body.dependsOn ?? [],
        });
        sendJson(res, 201, { ok: true, data: task });
        return;
      }
      if (resource === "tasks" && segments.length === 6 && segments[5] === "status" && method === "POST") {
        const task = ops.setTaskStatus({
          tenantId, projectId, actor, taskId: segments[4],
          status: body.status, expectedVersion: body.expectedVersion ?? null,
        });
        sendJson(res, 200, { ok: true, data: task });
        return;
      }

      throw httpError(404, "route_not_found");
    } catch (error) {
      sendJson(res, statusForServiceError(error), { ok: false, error: String(error?.message || "operator_request_failed") });
    }
  }

  const server = createServer(async (req, res) => {
    try {
      if (await handoffHandler(req, res)) return;
      const url = new URL(req.url, "http://mission-control.local");
      if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/operator")) { sendOperatorPage(res); return; }
      if (url.pathname.startsWith("/api/")) { await handleApi(req, res, url); return; }
      sendJson(res, 404, { ok: false, error: "route_not_found" });
    } catch {
      if (!res.headersSent) sendJson(res, 500, { ok: false, error: "operator_request_failed" });
      else res.end();
    }
  });

  return { server, store, finance, ops, tenantId, demo, actorTokens, seededDemoActorTokens };
}

export function missionControlServerConfigFromEnv(env = process.env) {
  return {
    dbPath: env.MISSION_CONTROL_DB_PATH || "mission-control.db",
    operatorToken: env.MISSION_CONTROL_OPERATOR_TOKEN || null,
    actorTokens: env.MISSION_CONTROL_ACTOR_TOKENS || null,
    handoffSecret: env.MISSION_CONTROL_HANDOFF_SECRET || null,
    tenantId: env.MISSION_CONTROL_TENANT_ID || DEFAULT_TENANT_ID,
    demo: env.MISSION_CONTROL_DEMO === "1",
    maxBodyBytes: env.MISSION_CONTROL_MAX_BODY_BYTES != null ? Number(env.MISSION_CONTROL_MAX_BODY_BYTES) : undefined,
    port: Number(env.MISSION_CONTROL_PORT || 8787),
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const config = missionControlServerConfigFromEnv();
  const { server, seededDemoActorTokens } = createMissionControlServer(config);
  server.listen(config.port, () => {
    console.log(`mission-control operator server listening on port ${config.port} (tenant ${config.tenantId}${config.demo ? ", DEMO mode" : ""})`);
    // Only the SEEDED synthetic demo credentials are ever printed;
    // operator-configured registry tokens are never logged.
    if (seededDemoActorTokens) {
      for (const [token, actorId] of Object.entries(seededDemoActorTokens)) {
        console.log(`demo actor token: ${token} (acts as ${actorId})`);
      }
    }
  });
}
