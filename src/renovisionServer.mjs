/** RENOVISION HTTP service: wires the project workflow to durable evidence and
 * spatial-event storage. Authentication and approval resolution are injected;
 * the header-based authenticator in renovisionMain is a local/demo mechanism only
 * and must be replaced by the production identity provider before deployment.
 * All mutation routes fail closed: no actor, no tenant match, no approval, no write. */
import {createServer} from "node:http";
import {webcrypto} from "node:crypto";
import {RenovisionProject} from "../lib/renovision/project-workflow.mjs";
import {persistFrameEvidence} from "../lib/renovision/evidence-repository.mjs";
import {RENOVISION_APP_HTML} from "./renovisionUi.mjs";
const MAX_BODY_BYTES = 32_000_000;
const text = (x) => typeof x === "string" && x.trim().length > 0;
export function createMemoryApprovalRegistry() {
 const approvals = new Map();
 return {
   register(record) {
     if (!record || !text(record.approvalRef)) throw new Error("approval_ref_required");
     approvals.set(record.approvalRef, structuredClone(record));
     return structuredClone(record);
   },
   async resolveApproval({approvalRef, tenantId, propertyId}) {
     const record = approvals.get(approvalRef);
     if (!record || record.tenantId !== tenantId || record.propertyId !== propertyId) return null;
     return structuredClone(record);
   },
   get size() { return approvals.size; }
 };
}
export function createRenovisionServer({authenticate, resolveApproval, evidenceStorage, eventStore, cryptoApi = webcrypto} = {}) {
 if (typeof authenticate !== "function") throw new TypeError("authenticate function required");
 if (!evidenceStorage || typeof evidenceStorage.put !== "function" || typeof evidenceStorage.get !== "function") throw new TypeError("evidence storage adapter required");
 const projects = new Map();
 const loadArtifact = async ({artifactId, actor}) => evidenceStorage.get({storageRef: artifactId, actorId: actor.id});
 const send = (res, status, body, type = "application/json") => {
   const payload = type === "application/json" ? JSON.stringify(body) : body;
   res.writeHead(status, {"content-type": type, "cache-control": "no-store"});
   res.end(payload);
 };
 const readBody = (req) => new Promise((resolve, reject) => {
   const chunks = []; let size = 0;
   req.on("data", (c) => { size += c.length; if (size > MAX_BODY_BYTES) { reject(new Error("body_too_large")); req.destroy(); } else chunks.push(c); });
   req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
   req.on("error", reject);
 });
 const projectFor = (req, id) => {
   const project = projects.get(id);
   if (!project || project.tenantId !== req.actor.tenantId) return null;
   return project;
 };
 const route = async (req, res) => {
   const url = new URL(req.url, "http://localhost");
   const path = url.pathname;
   if (req.method === "GET" && path === "/") return send(res, 200, RENOVISION_APP_HTML, "text/html; charset=utf-8");
   if (req.method === "GET" && path === "/health") return send(res, 200, {ok: true, service: "renovision", evidenceStorageClass: evidenceStorage.storageClass ?? "unknown", eventStorageClass: eventStore?.storageClass ?? "in-memory", accuracyClaimsAuthorized: false});
   if (!path.startsWith("/api/renovision")) return send(res, 404, {ok: false, errors: ["not_found"]});
   const actor = await authenticate(req);
   if (!actor || actor.authenticated !== true || !text(actor.id) || !text(actor.tenantId)) return send(res, 401, {ok: false, errors: ["authenticated_actor_required"]});
   req.actor = actor;
   const bodyText = req.method === "POST" ? await readBody(req) : "";
   let body = {};
   if (bodyText) { try { body = JSON.parse(bodyText); } catch { return send(res, 400, {ok: false, errors: ["invalid_json"]}); } }
   try {
     if (req.method === "POST" && path === "/api/renovision/approvals") {
       if (typeof resolveApproval?.register !== "function") return send(res, 501, {ok: false, errors: ["approval_registry_not_configured"]});
       const record = resolveApproval.register({...body, tenantId: actor.tenantId});
       return send(res, 201, {ok: true, approval: record});
     }
     if (req.method === "POST" && path === "/api/renovision/projects") {
       const project = new RenovisionProject({projectId: body.projectId, tenantId: actor.tenantId, propertyId: body.propertyId, roomId: body.roomId, createdBy: actor.id});
       if (projects.has(project.projectId)) return send(res, 409, {ok: false, errors: ["project_already_exists"]});
       projects.set(project.projectId, project);
       return send(res, 201, {ok: true, project: project.snapshot()});
     }
     const match = path.match(/^\/api\/renovision\/projects\/([^/]+)(?:\/(.+))?$/);
     if (!match) return send(res, 404, {ok: false, errors: ["not_found"]});
     const project = projectFor(req, decodeURIComponent(match[1]));
     if (!project) return send(res, 404, {ok: false, errors: ["project_not_found"]});
     const sub = match[2] ?? "";
     if (req.method === "GET" && sub === "") return send(res, 200, {ok: true, project: project.snapshot()});
     if (req.method === "GET" && (sub === "preview/existing.svg" || sub === "preview/proposed.svg")) {
       const svg = sub.includes("existing") ? project.preview?.existingSvg : project.preview?.proposedSvg;
       if (!svg) return send(res, 404, {ok: false, errors: ["preview_not_generated"]});
       return send(res, 200, svg, "image/svg+xml");
     }
     if (req.method === "POST" && sub === "capture-plan") return send(res, 200, {ok: true, plan: project.planCapture({actor, deviceProfile: body.deviceProfile})});
     if (req.method === "POST" && sub === "evidence") {
       if (!text(body.contentBase64)) return send(res, 400, {ok: false, errors: ["content_base64_required"]});
       const bytes = Buffer.from(body.contentBase64, "base64");
       const digestBytes = new Uint8Array(await cryptoApi.subtle.digest("SHA-256", bytes));
       const digest = "sha256:" + Array.from(digestBytes, (b) => b.toString(16).padStart(2, "0")).join("");
       const blob = new Blob([bytes], {type: body.mimeType || "image/png"});
       const capture = {ok: true, blob, artifact: {kind: body.kind || "photo", digest, byteLength: blob.size, propertyId: project.propertyId, roomId: project.roomId, captureId: body.captureId || "capture-pending", tenantId: actor.tenantId}};
       const receipt = await persistFrameEvidence(capture, {storage: evidenceStorage, cryptoApi, actorId: actor.id, retentionDays: body.retentionDays ?? 30});
       if (!receipt.stored) return send(res, 422, {ok: false, errors: receipt.errors});
       return send(res, 201, {ok: true, receipt: {...receipt, byteLength: blob.size}});
     }
     if (req.method === "POST" && sub === "captures") { const snap = await project.registerCapture({actor, manifest: body.manifest, loadArtifact, cryptoApi, qualityInput: body.qualityInput}); return send(res, 200, {ok: true, project: snap}); }
     if (req.method === "POST" && sub === "capture-review") return send(res, 200, {ok: true, project: project.reviewCapture({actor, decision: body.decision, reason: body.reason})});
     if (req.method === "POST" && sub === "measurements") return send(res, 201, {ok: true, result: project.addMeasurement({actor, record: body.record})});
     if (req.method === "POST" && sub === "corrections") return send(res, 200, {ok: true, result: project.correctMeasurement({actor, correction: body.correction})});
     if (req.method === "POST" && sub === "lock") return send(res, 200, {ok: true, lock: project.lockGeometry({actor})});
     if (req.method === "POST" && sub === "proposals") { const result = await project.proposeChange({actor, resolveApproval: typeof resolveApproval === "function" ? resolveApproval : resolveApproval?.resolveApproval, eventStore, change: body.change}); return send(res, 201, {ok: true, result}); }
     if (req.method === "POST" && sub === "preview") { const preview = project.generatePreview({actor, mode: body.mode, sourceEvidenceRef: body.sourceEvidenceRef}); const {existingSvg, proposedSvg, ...rest} = preview; return send(res, 200, {ok: true, preview: rest}); }
     if (req.method === "POST" && sub === "furnishing") return send(res, 200, {ok: true, plan: project.evaluateFurnishing({actor, items: body.items, minimumClearanceMeters: body.minimumClearanceMeters})});
     if (req.method === "POST" && sub === "comparison") return send(res, 200, {ok: true, comparison: project.buildComparison({actor})});
     if (req.method === "POST" && sub === "quincey-packet") return send(res, 200, {ok: true, ...project.buildReviewPacket({actor, commitSha: body.commitSha, prUrl: body.prUrl, studyId: body.studyId, ciRuns: body.ciRuns, testCount: body.testCount, readinessEvidence: body.readinessEvidence})});
     return send(res, 404, {ok: false, errors: ["route_not_found"]});
   } catch (e) {
     return send(res, 422, {ok: false, errors: Array.isArray(e?.errors) ? e.errors : [e?.message ?? "request_failed"]});
   }
 };
 const server = createServer((req, res) => { route(req, res).catch(() => { try { send(res, 500, {ok: false, errors: ["internal_error"]}); } catch {} }); });
 server.renovisionProjects = projects;
 return server;
}
