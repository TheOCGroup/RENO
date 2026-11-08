/** RENOVISION HTTP service: wires the project workflow to durable evidence,
 * spatial-event and project storage. Authentication is injected — production
 * uses verified ID tokens (lib/renovision/identity.mjs); every route then
 * enforces role-based, scope-bound authorization (lib/renovision/access-control.mjs)
 * against the actor's verified tenant and property/room entitlements. Caller
 * supplied tenant/operator headers are never trusted by this service: identity
 * comes only from the injected authenticator. All routes fail closed. */
import {createServer} from "node:http";
import {webcrypto} from "node:crypto";
import {RenovisionProject} from "../lib/renovision/project-workflow.mjs";
import {persistFrameEvidence} from "../lib/renovision/evidence-repository.mjs";
import {authorizeAction} from "../lib/renovision/access-control.mjs";
import {buildExportPackage} from "../lib/renovision/export-package.mjs";
import {RENOVISION_APP_HTML} from "./renovisionUi.mjs";
import {RENOVISION_STUDIO_HTML} from "./renovisionStudio.mjs";
const MAX_BODY_BYTES = 32_000_000;
const text = (x) => typeof x === "string" && x.trim().length > 0;
export function createMemoryApprovalRegistry() {
 const approvals = new Map();
 return {
   register(record) {
     if (!record || !text(record.approvalRef)) throw new Error("approval_ref_required");
     if (approvals.has(record.approvalRef)) throw Object.assign(new Error("approval_ref_conflict"), {code: "APPROVAL_REF_CONFLICT"});
     approvals.set(record.approvalRef, structuredClone(record));
     return structuredClone(record);
   },
   async resolveApproval({approvalRef, tenantId, propertyId}) {
     const record = approvals.get(approvalRef);
     if (!record || record.tenantId !== tenantId || (propertyId !== undefined && record.propertyId !== propertyId)) return null;
     return structuredClone(record);
   },
   async revoke({approvalRef, tenantId, revokedBy, reason}) {
     const record = approvals.get(approvalRef);
     if (!record || record.tenantId !== tenantId) return null;
     if (record.revoked === true) return structuredClone(record);
     const revoked = {...record, status: "revoked", revoked: true, revokedBy, revokedAt: new Date().toISOString(), ...(typeof reason === "string" && reason.trim() ? {revokeReason: reason} : {})};
     approvals.set(approvalRef, revoked);
     return structuredClone(revoked);
   },
   get size() { return approvals.size; },
   get storageClass() { return "in-memory"; }
 };
}
export function createRenovisionServer({authenticate, resolveApproval, evidenceStorage, eventStore, projectStore, renderProvider, photoRenderer, identityMode = "custom", webAuthConfig = null, cryptoApi = webcrypto} = {}) {
 if (typeof authenticate !== "function") throw new TypeError("authenticate function required");
 if (!evidenceStorage || typeof evidenceStorage.put !== "function" || typeof evidenceStorage.get !== "function") throw new TypeError("evidence storage adapter required");
 const projects = new Map();
 const keyFor = (actor, projectId) => actor.tenantId + "/" + projectId;
 /** Bounded retry for transient store failures (a single GCS hiccup must not
  * fail a request whose workflow already committed elsewhere). Typed
  * generation conflicts are never retried — they are answers, not transients. */
 const saveWithRetry = async (project) => {
   let lastError;
   for (let attempt = 0; attempt < 3; attempt++) {
     try { await projectStore.save(project.projectId, project.serialize()); return; }
     catch (error) {
       if (error?.code === "PROJECT_WRITE_CONFLICT") throw error;
       lastError = error;
       if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 50 * (attempt + 1)));
     }
   }
   throw lastError;
 };
 const loadArtifact = async ({artifactId, actor}) => evidenceStorage.get({storageRef: artifactId, actorId: actor.id});
 const send = (res, status, body, type = "application/json") => {
   const payload = type === "application/json" ? JSON.stringify(body) : body;
   res.writeHead(status, {"content-type": type, "cache-control": "no-store", "x-content-type-options": "nosniff", "referrer-policy": "no-referrer", "x-frame-options": "DENY", "strict-transport-security": "max-age=31536000"});
   res.end(payload);
 };
 const readBody = (req) => new Promise((resolve, reject) => {
   const chunks = []; let size = 0;
   req.on("data", (c) => { size += c.length; if (size > MAX_BODY_BYTES) { reject(new Error("body_too_large")); req.destroy(); } else chunks.push(c); });
   req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
   req.on("error", reject);
 });
 const resolveProject = async (id, actor) => {
   const key = keyFor(actor, id);
   if (!projectStore && projects.has(key)) return projects.get(key);
   if (projectStore) {
     const data = await projectStore.load(id, actor.tenantId);
     if (data) {
       try {
         const restored = RenovisionProject.restore(data);
         if (restored.tenantId !== actor.tenantId) return null;
         // Heal the proposeChange two-store window: if the event store holds
         // committed events this record never persisted, adopt them (and
         // durably re-save the healed record) before serving the project.
         // Candidate features come from the lock, the record's own event /
         // proposal state, and any write-ahead pending markers — design
         // features (e.g. floor-main) are not measurement features, so the
         // lock list alone cannot enumerate them.
         if (eventStore && typeof eventStore.readFeatureEvents === "function") {
           const candidates = new Set([
             ...(Array.isArray(restored.lock?.featureIds) ? restored.lock.featureIds : []),
             ...Object.keys(restored.featureRevisions ?? {}),
             ...restored.spatialEvents.map((e) => e.featureId),
             ...[...restored.proposals.keys()],
             ...restored.pendingSpatialFeatures
           ].filter((f) => typeof f === "string" && f.length > 0));
           if (candidates.size) {
             const pendingBefore = [...restored.pendingSpatialFeatures];
             const snapshots = [];
             for (const featureId of candidates) {
               const snap = await eventStore.readFeatureEvents({tenantId: actor.tenantId, propertyId: restored.propertyId, roomId: restored.roomId, featureId, actor});
               snapshots.push({featureId, revision: snap.revision, events: snap.events});
             }
             const healed = restored.reconcileFeatureEvents({actor, snapshots});
             const markersResolved = pendingBefore.length !== restored.pendingSpatialFeatures.length;
             if (healed.length || markersResolved) { try { await saveWithRetry(restored); } catch { /* reconciliation is idempotent; it runs again on the next load */ } }
           }
         }
         projects.set(key, restored);
         return restored;
       } catch { return null; }
     }
   }
   return null;
 };
 const route = async (req, res) => {
   const url = new URL(req.url, "http://localhost");
   const path = url.pathname;
   if (req.method === "GET" && path === "/") return send(res, 200, RENOVISION_STUDIO_HTML, "text/html; charset=utf-8");
   if (req.method === "GET" && path === "/operator") return send(res, 200, RENOVISION_APP_HTML, "text/html; charset=utf-8");
   if (req.method === "GET" && path === "/health") return send(res, 200, {ok: true, service: "renovision", identityMode, evidenceStorageClass: evidenceStorage.storageClass ?? "unknown", eventStorageClass: eventStore?.storageClass ?? "in-memory", projectStorageClass: projectStore?.storageClass ?? "in-memory", approvalStorageClass: resolveApproval?.storageClass ?? "not-configured", renderProvider: renderProvider?.status?.() ?? {enabled: false, provider: null}, accuracyClaimsAuthorized: false});
   if (req.method === "GET" && path === "/studio-capabilities") return send(res, 200, {ok:true, photoRendering:photoRenderer?.status?.() ?? {enabled:false}});
   if (req.method === "GET" && path === "/auth-config") {
     // Public browser sign-in configuration. The Identity Platform web API key
     // is a client identifier, not a credential; it is exposed only when the
     // deployment configured one. Access control is enforced by Identity
     // Platform rules and this service's verified-token authentication.
     const apiKey = text(webAuthConfig?.apiKey) ? webAuthConfig.apiKey : null;
     const projectId = text(webAuthConfig?.projectId) ? webAuthConfig.projectId : null;
     return send(res, 200, {ok: true, identityMode, signIn: {provider: "google-identity-platform", configured: Boolean(apiKey && projectId), apiKey, projectId}});
   }
   if (!path.startsWith("/api/renovision")) return send(res, 404, {ok: false, errors: ["not_found"]});
   const actor = await authenticate(req);
   if (!actor || actor.authenticated !== true || !text(actor.id) || !text(actor.tenantId)) return send(res, 401, {ok: false, errors: ["authenticated_actor_required"]});
   req.actor = actor;
   const guard = (action, scope = {}) => authorizeAction(actor, {action, tenantId: scope.tenantId ?? actor.tenantId, propertyId: scope.propertyId, roomId: scope.roomId});
   const bodyText = req.method === "POST" ? await readBody(req) : "";
   let body = {};
   if (bodyText) { try { body = JSON.parse(bodyText); } catch { return send(res, 400, {ok: false, errors: ["invalid_json"]}); } }
   try {
     if (req.method === "POST" && path === "/api/renovision/approvals") {
       const check = guard("approval:register", {propertyId: body.propertyId, roomId: body.roomId});
       if (!check.allowed) return send(res, 403, {ok: false, errors: check.errors});
       if (typeof resolveApproval?.register !== "function") return send(res, 501, {ok: false, errors: ["approval_registry_not_configured"]});
       let record;
       try { record = await resolveApproval.register({...body, tenantId: actor.tenantId, approvedBy: actor.id, approvedAt: new Date().toISOString()}); }
       catch (error) { if (error?.code === "APPROVAL_REF_CONFLICT") return send(res, 409, {ok: false, errors: ["approval_ref_conflict"]}); throw error; }
       return send(res, 201, {ok: true, approval: record});
     }
     if (req.method === "POST" && path === "/api/renovision/approvals/revoke") {
       if (typeof resolveApproval?.revoke !== "function" || typeof resolveApproval?.resolveApproval !== "function") return send(res, 501, {ok: false, errors: ["approval_registry_not_configured"]});
       const existing = await resolveApproval.resolveApproval({approvalRef: body.approvalRef, tenantId: actor.tenantId});
       if (!existing) return send(res, 404, {ok: false, errors: ["approval_not_found"]});
       const check = guard("approval:register", {propertyId: existing.propertyId, roomId: existing.roomId});
       if (!check.allowed) return send(res, 403, {ok: false, errors: check.errors});
       let record;
       try { record = await resolveApproval.revoke({approvalRef: body.approvalRef, tenantId: actor.tenantId, revokedBy: actor.id, reason: body.reason}); }
       catch (error) { if (error?.code === "APPROVAL_WRITE_CONFLICT") return send(res, 409, {ok: false, conflict: true, errors: ["approval_write_conflict"]}); throw error; }
       if (!record) return send(res, 404, {ok: false, errors: ["approval_not_found"]});
       return send(res, 200, {ok: true, approval: record});
     }
     if (req.method === "POST" && path === "/api/renovision/projects") {
       const check = guard("project:create", {propertyId: body.propertyId, roomId: body.roomId});
       if (!check.allowed) return send(res, 403, {ok: false, errors: check.errors});
       if ((!projectStore && projects.has(keyFor(actor, body.projectId))) || (projectStore && await projectStore.load(body.projectId, actor.tenantId))) return send(res, 409, {ok: false, errors: ["project_already_exists"]});
       const project = new RenovisionProject({projectId: body.projectId, tenantId: actor.tenantId, propertyId: body.propertyId, roomId: body.roomId, createdBy: actor.id});
       if (projectStore) await saveWithRetry(project);
       else projects.set(keyFor(actor, project.projectId), project);
       return send(res, 201, {ok: true, project: project.snapshot()});
     }
     const match = path.match(/^\/api\/renovision\/projects\/([^/]+)(?:\/(.+))?$/);
     if (!match) return send(res, 404, {ok: false, errors: ["not_found"]});
     const project = await resolveProject(decodeURIComponent(match[1]), actor);
     if (!project || project.tenantId !== actor.tenantId) return send(res, 404, {ok: false, errors: ["project_not_found"]});
     const sub = match[2] ?? "";
     const scope = {propertyId: project.propertyId, roomId: project.roomId};
     const actionFor = (routeKey) => ({
       "": "project:read", "preview/existing.svg": "project:read", "preview/proposed.svg": "project:read",
       "capture-plan": "capture:write", evidence: "capture:write", captures: "capture:write", "capture-review": "capture:write",
       measurements: "measurement:write", corrections: "measurement:correct", lock: "geometry:lock",
       proposals: "change:propose", preview: "preview:generate", "render-photo": "preview:generate", furnishing: "furnishing:write",
       comparison: "comparison:build", "quincey-packet": "export:read", export: "export:read"
     })[routeKey];
     const action = actionFor(sub);
     if (!action) return send(res, 404, {ok: false, errors: ["route_not_found"]});
     const check = guard(action, scope);
     if (!check.allowed) return send(res, 403, {ok: false, errors: check.errors});
     const done = async (status, responseBody, type) => {
       if (req.method === "POST" && projectStore) {
         try { await saveWithRetry(project); } catch (error) { if (error?.code === "PROJECT_WRITE_CONFLICT") return send(res, 409, {ok: false, conflict: true, errors: ["project_write_conflict"]}); return send(res, 500, {ok: false, errors: ["project_persistence_failed"]}); }
       }
       return send(res, status, responseBody, type);
     };
     if (req.method === "GET" && sub === "") return send(res, 200, {ok: true, project: project.snapshot()});
     if (req.method === "GET" && sub === "export") return send(res, 200, {ok: true, export: buildExportPackage({projectData: project.serialize(), exportedBy: actor.id})});
     if (req.method === "GET" && (sub === "preview/existing.svg" || sub === "preview/proposed.svg")) {
       const svg = sub.includes("existing") ? project.preview?.existingSvg : project.preview?.proposedSvg;
       if (!svg) return send(res, 404, {ok: false, errors: ["preview_not_generated"]});
       return send(res, 200, svg, "image/svg+xml");
     }
     if (req.method === "POST" && sub === "capture-plan") return done(200, {ok: true, plan: project.planCapture({actor, deviceProfile: body.deviceProfile})});
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
     if (req.method === "POST" && sub === "captures") { const snap = await project.registerCapture({actor, manifest: body.manifest, loadArtifact, cryptoApi, qualityInput: body.qualityInput}); return done(200, {ok: true, project: snap}); }
     if (req.method === "POST" && sub === "capture-review") return done(200, {ok: true, project: project.reviewCapture({actor, decision: body.decision, reason: body.reason})});
     if (req.method === "POST" && sub === "measurements") return done(201, {ok: true, result: project.addMeasurement({actor, record: body.record})});
     if (req.method === "POST" && sub === "corrections") return done(200, {ok: true, result: project.correctMeasurement({actor, correction: body.correction})});
     if (req.method === "POST" && sub === "lock") return done(200, {ok: true, lock: project.lockGeometry({actor})});
     if (req.method === "POST" && sub === "proposals") {
       const targetFeature = typeof body.change?.featureId === "string" && body.change.featureId ? body.change.featureId : null;
       // Reconcile the target feature first. The event stream is keyed by
       // (tenant, property, room, feature) — not by project — so it may hold
       // committed events this record has never seen, including wedges left
       // before write-ahead markers existed. Load-time reconciliation cannot
       // enumerate design features (they are not in the lock's feature list);
       // the proposal request itself names the one feature that must be
       // reconciled before its expected revision is computed.
       if (eventStore && typeof eventStore.readFeatureEvents === "function" && targetFeature) {
         const snap = await eventStore.readFeatureEvents({tenantId: actor.tenantId, propertyId: project.propertyId, roomId: project.roomId, featureId: targetFeature, actor});
         project.reconcileFeatureEvents({actor, snapshots: [{featureId: targetFeature, revision: snap.revision, events: snap.events}]});
       }
       // Write-ahead: persist the intent marker BEFORE the event commits, so
       // a failure of the final save leaves a reconcilable record instead of
       // a silent divergence. If the marker save itself fails, nothing has
       // committed and the request fails cleanly.
       if (projectStore && eventStore && targetFeature) {
         project.notePendingSpatialEvent(targetFeature);
         try { await saveWithRetry(project); }
         catch (error) { if (error?.code === "PROJECT_WRITE_CONFLICT") return send(res, 409, {ok: false, conflict: true, errors: ["project_write_conflict"]}); return send(res, 500, {ok: false, errors: ["project_persistence_failed"]}); }
       }
       const result = await project.proposeChange({actor, resolveApproval: typeof resolveApproval === "function" ? resolveApproval : resolveApproval?.resolveApproval, eventStore, change: body.change});
       project.clearPendingSpatialEvent(targetFeature);
       return done(201, {ok: true, result});
     }
     if (req.method === "POST" && sub === "render-photo") {
       const result = photoRenderer ? await photoRenderer.render({mimeType:body.mimeType,imageBase64:body.imageBase64,prompt:body.prompt}) : {ok:false,errors:["photo_rendering_not_enabled"]};
       return send(res, result.ok ? 200 : 422, result);
     }
     if (req.method === "POST" && sub === "preview") {
       if (body.mode === "photoreal") {
         const rendered = renderProvider ? await renderProvider.render({project: project.snapshot()}) : {ok: false, errors: ["photorealistic rendering disabled"]};
         if (!rendered.ok) return send(res, 422, {ok: false, errors: rendered.errors});
         return send(res, 200, {ok: true, render: rendered});
       }
       const preview = project.generatePreview({actor, mode: body.mode, sourceEvidenceRef: body.sourceEvidenceRef}); const {existingSvg, proposedSvg, ...rest} = preview; return done(200, {ok: true, preview: rest});
     }
     if (req.method === "POST" && sub === "furnishing") return done(200, {ok: true, plan: project.evaluateFurnishing({actor, items: body.items, minimumClearanceMeters: body.minimumClearanceMeters})});
     if (req.method === "POST" && sub === "comparison") return done(200, {ok: true, comparison: project.buildComparison({actor})});
     if (req.method === "POST" && sub === "quincey-packet") return done(200, {ok: true, ...project.buildReviewPacket({actor, commitSha: body.commitSha, prUrl: body.prUrl, studyId: body.studyId, ciRuns: body.ciRuns, testCount: body.testCount, readinessEvidence: body.readinessEvidence})});
     return send(res, 404, {ok: false, errors: ["route_not_found"]});
   } catch (e) {
     const errors = Array.isArray(e?.errors) ? e.errors : [e?.message ?? "request_failed"];
     if (e?.code === "PROJECT_WRITE_CONFLICT") return send(res, 409, {ok: false, conflict: true, errors: ["project_write_conflict"]});
     if (e?.code === "SPATIAL_EVENT_CONFLICT" || errors.includes("spatial_event_conflict")) return send(res, 409, {ok: false, conflict: true, errors: ["spatial_event_conflict"]});
     return send(res, 422, {ok: false, errors});
   }
 };
 const server = createServer((req, res) => { route(req, res).catch(() => { try { send(res, 500, {ok: false, errors: ["internal_error"]}); } catch {} }); });
 server.renovisionProjects = projects;
 return server;
}
