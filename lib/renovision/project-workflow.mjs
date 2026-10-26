/** RENOVISION end-to-end project workflow: capture -> review -> measurement ->
 * geometry lock -> approved proposal -> concept preview -> furnishing -> comparison
 * -> QUINCEY review packet. This orchestrator wires the existing evidence,
 * validation, approval and transaction modules together; it adds no new trust
 * assumptions. Every stage transition requires an authenticated, tenant-matched
 * actor, geometry changes require the trusted approval gate, and no stage can
 * produce a verified or survey-grade claim. */
import {planRoomCapture} from "./capture-capabilities.mjs";
import {assessCaptureQuality} from "./capture-quality.mjs";
import {validateEvidenceManifest} from "./evidence-manifest-validation.mjs";
import {verifyManifestArtifacts} from "./manifest-integrity.mjs";
import {validateMeasurement, validateGeometryChange} from "./spatial-validation.mjs";
import {applyMeasurementCorrection, getActiveMeasurements} from "./measurement-correction.mjs";
import {buildRoomModel, lockRoomGeometry} from "./room-model.mjs";
import {appendAuthorizedSpatialEvent} from "./authorized-change-log.mjs";
import {commitSpatialEvent} from "./transactional-change-log.mjs";
import {getLatestFeatureState} from "./spatial-change-log.mjs";
import {buildRenovationPreview, compareRoomStates} from "./renovation-preview.mjs";
import {evaluateFurnishingPlan} from "./furnishing-plan.mjs";
import {buildQuinceyReviewPacket} from "./quincey-review-packet.mjs";
import {evaluateRenovisionReleaseReadiness} from "./release-readiness.mjs";
const text = (x) => typeof x === "string" && x.trim().length > 0;
const fail = (errors) => { const list = Array.isArray(errors) ? errors : [errors]; const e = new Error(list[0]); e.errors = list; throw e; };
export const RENOVISION_STAGES = Object.freeze(["capture_planned", "capture_review", "measurement_review", "geometry_locked", "design_proposed", "preview_ready", "furnishing_review", "comparison_ready", "ready_for_review"]);
export class RenovisionProject {
 constructor({projectId, tenantId, propertyId, roomId, createdBy} = {}) {
   for (const [key, value] of Object.entries({projectId, tenantId, propertyId, roomId, createdBy})) if (!text(value)) throw new Error(key + "_required");
   this.projectId = projectId; this.tenantId = tenantId; this.propertyId = propertyId; this.roomId = roomId; this.createdBy = createdBy;
   this.stage = "capture_planned";
   this.capturePlan = null; this.captureRecord = null;
   this.measurements = []; this.roomModel = null; this.lock = null;
   this.spatialEvents = []; this.featureRevisions = {};
   this.baselines = new Map(); this.proposals = new Map();
   this.preview = null; this.furnishingPlan = null; this.comparison = null;
   this.audit = [];
 }
 #actor(actor) {
   if (actor?.authenticated !== true || !text(actor?.id) || !text(actor?.tenantId)) fail("authenticated_actor_required");
   if (actor.tenantId !== this.tenantId) fail("tenant_scope_mismatch");
 }
 #stage(...allowed) { if (!allowed.includes(this.stage)) fail("stage_" + allowed.join("_or_") + "_required_current_" + this.stage); }
 #log(action, actor, detail = {}) { this.audit.push({action, actorId: actor?.id ?? null, at: new Date().toISOString(), detail: structuredClone(detail)}); }
 planCapture({actor, deviceProfile} = {}) {
   this.#actor(actor);
   const plan = planRoomCapture(deviceProfile);
   if (!plan.ready) fail(plan.errors.length ? plan.errors : ["no_capture_path_available"]);
   this.capturePlan = plan; this.#log("capture_planned", actor, {mode: plan.mode});
   return structuredClone(plan);
 }
 async registerCapture({actor, manifest, loadArtifact, cryptoApi, qualityInput} = {}) {
   this.#actor(actor);
   if (!manifest || manifest.tenantId !== this.tenantId || manifest.propertyId !== this.propertyId || manifest.roomId !== this.roomId) fail("manifest_scope_mismatch");
   const structural = validateEvidenceManifest(manifest);
   if (!structural.valid) fail(structural.errors);
   const integrity = await verifyManifestArtifacts({manifest, loadArtifact, cryptoApi, actor});
   if (!integrity.verified) fail(integrity.errors.length ? integrity.errors : ["manifest_integrity_not_verified"]);
   const quality = qualityInput ? assessCaptureQuality({calibrationStatus: manifest.calibrationStatus === "pending" ? "pending" : manifest.calibrationStatus, coverageGaps: manifest.coverageGaps, blurScore: qualityInput.blurScore, depthCoverageFraction: qualityInput.depthCoverageFraction, deviceClass: qualityInput.deviceClass}) : null;
   if (quality && !quality.valid) fail(quality.errors);
   this.captureRecord = {manifest: structuredClone(manifest), integrity: {verified: true, checked: integrity.checked}, quality, registeredBy: actor.id, registeredAt: new Date().toISOString(), reviewDecision: null};
   this.stage = "capture_review";
   this.#log("capture_registered", actor, {captureId: manifest.captureId, artifacts: manifest.artifacts.length, quality: quality?.quality ?? "not_assessed"});
   return this.snapshot();
 }
 reviewCapture({actor, decision, reason} = {}) {
   this.#actor(actor); this.#stage("capture_review");
   if (!["accept", "reject"].includes(decision)) fail("capture_review_decision_required");
   if (decision === "reject" && !text(reason)) fail("capture_rejection_reason_required");
   this.captureRecord.reviewDecision = {decision, by: actor.id, at: new Date().toISOString(), reason: reason ?? null};
   this.stage = decision === "accept" ? "measurement_review" : "capture_planned";
   this.#log("capture_" + (decision === "accept" ? "accepted" : "rejected"), actor, {reason: reason ?? null});
   return this.snapshot();
 }
 addMeasurement({actor, record} = {}) {
   this.#actor(actor); this.#stage("measurement_review");
   if (!record || record.propertyId !== this.propertyId || record.roomId !== this.roomId) fail("measurement_scope_mismatch");
   if (this.measurements.some((m) => m.measurementId === record.measurementId)) fail("duplicate_measurement_id");
   const check = validateMeasurement(record);
   if (!check.valid) fail(check.errors);
   this.measurements.push(structuredClone(record));
   this.#log("measurement_added", actor, {measurementId: record.measurementId, featureId: record.featureId ?? null, verified: check.verified});
   return {measurementId: record.measurementId, verified: check.verified, activeCount: getActiveMeasurements(this.measurements).length};
 }
 correctMeasurement({actor, correction} = {}) {
   this.#actor(actor); this.#stage("measurement_review", "geometry_locked", "design_proposed", "preview_ready", "furnishing_review", "comparison_ready");
   const wasLocked = this.lock?.locked === true;
   const result = applyMeasurementCorrection({measurements: this.measurements, correction, actor});
   if (!result.ok) fail(result.errors);
   this.measurements = result.measurements;
   if (wasLocked) {
     this.lock = null; this.roomModel = null; this.preview = null; this.furnishingPlan = null; this.comparison = null;
     this.stage = "measurement_review";
     this.#log("geometry_unlocked_by_correction", actor, {target: correction.targetMeasurementId});
   }
   this.#log("measurement_corrected", actor, {target: correction.targetMeasurementId, replacement: correction.newMeasurementId});
   return {corrected: true, wasLocked, activeCount: getActiveMeasurements(this.measurements).length};
 }
 lockGeometry({actor} = {}) {
   this.#actor(actor); this.#stage("measurement_review");
   const roomModel = buildRoomModel({measurements: this.measurements, propertyId: this.propertyId, roomId: this.roomId});
   if (!roomModel.valid) fail(roomModel.errors);
   const lock = lockRoomGeometry({roomModel, manifestVerified: this.captureRecord?.integrity?.verified === true, actor});
   if (!lock.locked) fail(lock.errors);
   this.roomModel = roomModel; this.lock = lock;
   this.stage = "geometry_locked";
   this.#log("geometry_locked", actor, {geometryDigest: lock.geometryDigest, fieldVerified: lock.fieldVerified});
   return structuredClone(lock);
 }
 async proposeChange({actor, resolveApproval, eventStore, change} = {}) {
   this.#actor(actor); this.#stage("geometry_locked", "design_proposed", "preview_ready", "furnishing_review", "comparison_ready");
   if (!change || !text(change.featureId) || !text(change.scopeItemId) || !text(change.approvalRef) || !text(change.eventId) || !text(change.reason)) fail("change_feature_scope_approval_event_reason_required");
   const gate = validateGeometryChange({featureId: change.featureId, targetState: "PROPOSED", semanticType: change.semanticType, approvedScopeItemId: change.scopeItemId, approvedBy: change.approvedBy, approvedAt: change.approvedAt}, this.lock.featureIds);
   if (!gate.allowed) fail(gate.errors);
   const latest = getLatestFeatureState(this.spatialEvents, change.featureId, this.propertyId, this.roomId);
   const event = {eventId: change.eventId, propertyId: this.propertyId, roomId: this.roomId, featureId: change.featureId, actorId: actor.id, occurredAt: change.occurredAt ?? new Date().toISOString(), reason: change.reason, fromState: latest.found ? latest.state : "EXISTING", toState: "PROPOSED", scopeItemId: change.scopeItemId, approvalRef: change.approvalRef};
   if (eventStore) {
     const expectedRevision = this.featureRevisions[change.featureId] ?? 0;
     const committed = await commitSpatialEvent({store: eventStore, actor, resolveApproval, event, expectedRevision});
     if (!committed.committed) fail(committed.errors);
     this.featureRevisions[change.featureId] = committed.revision;
     this.spatialEvents.push(structuredClone(event));
   } else {
     const appended = await appendAuthorizedSpatialEvent({events: this.spatialEvents, event, actor, resolveApproval, expectedLastEventId: latest.found ? latest.eventId : null});
     if (!appended.ok) fail(appended.errors);
     this.spatialEvents = appended.events;
   }
   if (change.baseline && typeof change.baseline === "object") this.baselines.set(change.featureId, structuredClone(change.baseline));
   this.proposals.set(change.featureId, {featureId: change.featureId, semanticType: change.semanticType ?? null, label: change.label ?? change.featureId, scopeItemId: change.scopeItemId, approvalRef: change.approvalRef, state: "PROPOSED", ...(change.proposed && typeof change.proposed === "object" ? structuredClone(change.proposed) : {})});
   this.stage = "design_proposed";
   this.#log("change_proposed", actor, {featureId: change.featureId, scopeItemId: change.scopeItemId, approvalRef: change.approvalRef});
   return {proposed: true, featureId: change.featureId, eventId: change.eventId};
 }
 generatePreview({actor, mode = "renovate", sourceEvidenceRef} = {}) {
   this.#actor(actor); this.#stage("design_proposed", "preview_ready", "furnishing_review", "comparison_ready");
   const sourceRef = sourceEvidenceRef ?? this.captureRecord?.manifest?.artifacts?.[0]?.digest;
   const result = buildRenovationPreview({mode, roomModel: this.roomModel, lock: this.lock, proposedFeatures: [...this.proposals.values()], existingFeatures: [...this.baselines.values()], sourceEvidenceRef: sourceRef, previewId: this.projectId + "-preview-1"});
   if (!result.ok) fail(result.errors);
   this.preview = result.preview;
   this.stage = "preview_ready";
   this.#log("preview_generated", actor, {mode, geometryDigest: this.preview.geometryDigest, previewAllowed: this.preview.claim.previewAllowed, accuracyClaimAuthorized: false});
   return structuredClone(this.preview);
 }
 evaluateFurnishing({actor, items, minimumClearanceMeters} = {}) {
   this.#actor(actor); this.#stage("preview_ready", "furnishing_review", "comparison_ready");
   const plan = evaluateFurnishingPlan({roomModel: this.roomModel, lock: this.lock, items, minimumClearanceMeters});
   if (!plan.valid) fail(plan.errors);
   this.furnishingPlan = plan;
   this.stage = "furnishing_review";
   this.#log("furnishing_evaluated", actor, {items: plan.items.length, verdicts: plan.items.map((i) => i.verdict)});
   return structuredClone(plan);
 }
 buildComparison({actor} = {}) {
   this.#actor(actor); this.#stage("preview_ready", "furnishing_review", "comparison_ready");
   if (!this.preview) fail("preview_required_before_comparison");
   const diff = compareRoomStates({existingFeatures: [...this.baselines.values()], proposedFeatures: [...this.proposals.values()]});
   const unchangedFeatures = (this.lock?.featureIds ?? []).filter((id) => !this.proposals.has(id));
   this.comparison = {diff, unchangedFeatures, disclosure: this.preview.disclosure, geometryDigest: this.lock.geometryDigest, verified: false};
   this.stage = "comparison_ready";
   this.#log("comparison_built", actor, {unapprovedChanges: diff.summary.unapprovedChanges});
   return structuredClone(this.comparison);
 }
 buildReviewPacket({actor, commitSha, prUrl, studyId, ciRuns = [], testCount, readinessEvidence = {}} = {}) {
   this.#actor(actor); this.#stage("comparison_ready", "ready_for_review");
   const packet = buildQuinceyReviewPacket({commitSha, prUrl, studyId, benchmarkRef: null, artifactRefs: [this.captureRecord?.manifest?.captureId].filter(Boolean), testCount, ciRuns});
   if (!packet.valid) fail(packet.errors);
   const readiness = evaluateRenovisionReleaseReadiness(readinessEvidence);
   this.stage = "ready_for_review";
   this.#log("quincey_packet_built", actor, {commitSha, releaseReady: readiness.ready});
   return {packet, readiness, reviewRequested: false, note: "Packet prepared for founder to transmit to QUINCEY. No review has been performed and nothing is certified."};
 }
 snapshot() {
   return structuredClone({projectId: this.projectId, tenantId: this.tenantId, propertyId: this.propertyId, roomId: this.roomId, stage: this.stage, capturePlan: this.capturePlan, captureRecord: this.captureRecord, measurements: this.measurements, activeMeasurements: getActiveMeasurements(this.measurements), roomModel: this.roomModel, lock: this.lock, spatialEventCount: this.spatialEvents.length, proposals: [...this.proposals.values()], preview: this.preview, furnishingPlan: this.furnishingPlan, comparison: this.comparison, audit: this.audit});
 }
}
