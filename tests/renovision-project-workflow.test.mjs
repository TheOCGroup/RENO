import test from "node:test";
import assert from "node:assert/strict";
import {webcrypto, createHash} from "node:crypto";
import {RenovisionProject} from "../lib/renovision/project-workflow.mjs";
import {createMemoryEvidenceStorage} from "../lib/renovision/memory-evidence-storage.mjs";
const actor = {id: "operator-1", tenantId: "tenant-a", authenticated: true};
const bytes = new TextEncoder().encode("workflow room capture fixture");
const blob = new Blob([bytes], {type: "image/png"});
const digest = "sha256:" + createHash("sha256").update(bytes).digest("hex");
const approvalRecord = {status: "approved", tenantId: "tenant-a", propertyId: "property-1", roomId: "room-1", featureId: "floor-main", scopeItemId: "scope-floor-1", approvalRef: "approval-1", approvedAt: "2026-10-20T09:00:00Z", approvedBy: "founder", allowedActorIds: ["operator-1"]};
const resolveApproval = async ({approvalRef}) => (approvalRef === "approval-1" ? structuredClone(approvalRecord) : null);
const mk = (featureId, value, extra = {}) => ({propertyId: "property-1", roomId: "room-1", measurementId: "meas-" + featureId, featureId, captureId: "capture-1", deviceModel: "laser-x", platform: "web", timestamp: "2026-10-26T10:00:00Z", coordinateFrame: "local", evidenceRef: digest, semanticType: "wall", method: "manual_laser", value, unit: "m", uncertainty: 0.02, calibrationStatus: "calibrated", verificationStatus: "verified", verifiedBy: "verifier-1", verifiedAt: "2026-10-26T11:00:00Z", geometryState: "EXISTING", fieldMeasured: true, ...extra});
async function projectAtMeasurementReview() {
 const project = new RenovisionProject({projectId: "reno-1", tenantId: "tenant-a", propertyId: "property-1", roomId: "room-1", createdBy: "operator-1"});
 project.planCapture({actor, deviceProfile: {platform: "web", cameraPermission: true, depthSupported: false, roomPlanSupported: false, manualMeasurementAvailable: true}});
 const storage = createMemoryEvidenceStorage({authorize: async ({actorId, propertyId, roomId}) => actorId === "operator-1" && propertyId === "property-1" && roomId === "room-1"});
 const receipt = await storage.put({blob, artifact: {propertyId: "property-1", roomId: "room-1"}, actorId: "operator-1", retentionDays: 30});
 const manifest = {tenantId: "tenant-a", propertyId: "property-1", roomId: "room-1", captureId: "capture-1", operatorId: "operator-1", deviceModel: "laser-x", coordinateFrame: "local", capturedAt: "2026-10-26T10:00:00Z", platform: "web", calibrationStatus: "calibrated", coverageGaps: [], artifacts: [{id: receipt.storageRef, kind: "photo", digest, byteLength: blob.size}]};
 const loadArtifact = async ({artifactId, actor: a}) => storage.get({storageRef: artifactId, actorId: a.id});
 await project.registerCapture({actor, manifest, loadArtifact, cryptoApi: webcrypto, qualityInput: {blurScore: 0.1, depthCoverageFraction: 0.5, deviceClass: "browser"}});
 assert.equal(project.stage, "capture_review");
 project.reviewCapture({actor, decision: "accept"});
 assert.equal(project.stage, "measurement_review");
 return project;
}
async function projectLocked() {
 const project = await projectAtMeasurementReview();
 for (const [f, v] of [["width", 3.6], ["depth", 4.2], ["height", 2.7], ["door_width", 0.9], ["door_offset", 0.5], ["window_width", 1.2], ["window_offset", 1], ["obstruction_offset", 2]]) project.addMeasurement({actor, record: mk(f, v)});
 project.lockGeometry({actor});
 assert.equal(project.stage, "geometry_locked");
 return project;
}
const change = {featureId: "floor-main", semanticType: "floor", scopeItemId: "scope-floor-1", approvalRef: "approval-1", eventId: "evt-1", reason: "approved flooring change", baseline: {featureId: "floor-main", semanticType: "floor", label: "Existing vinyl"}, proposed: {label: "White oak"}};
test("end-to-end: capture to preview, furnishing, comparison and QUINCEY packet", async () => {
 const project = await projectLocked();
 assert.equal(project.lock.fieldVerified, true);
 assert.equal(project.roomModel.completeness.complete, true);
 await project.proposeChange({actor, resolveApproval, change});
 assert.equal(project.stage, "design_proposed");
 const preview = project.generatePreview({actor});
 assert.equal(preview.status, "concept");
 assert.equal(preview.accuracyClaimAuthorized, false);
 assert.equal(preview.claim.previewAllowed, true);
 assert.equal(preview.claim.eligibleForAccuracyClaim, false);
 assert.match(preview.proposedSvg, /CONCEPT/);
 const plan = project.evaluateFurnishing({actor, items: [{id: "sofa-1", productId: "sofa-001", dimensionSource: "manufacturer-spec", dimensionsVerified: true, width: 2.1, depth: 0.95, x: 0.4, y: 0.4, clearance: 0.3, uncertaintyMeters: 0.01}]});
 assert.equal(plan.items[0].verdict, "fits_with_uncertainty_margin");
 const comparison = project.buildComparison({actor});
 assert.equal(comparison.diff.summary.modified, 1);
 assert.equal(comparison.diff.summary.unapprovedChanges, 0);
 const {packet, readiness} = project.buildReviewPacket({actor, commitSha: "a".repeat(40), prUrl: "https://github.com/TheOCGroup/RENO/pull/3", studyId: "study-1", testCount: 296, ciRuns: [{workflow: "RENOVISION Spatial Validation CI", status: "success"}]});
 assert.equal(packet.valid, true);
 assert.equal(packet.reviewPerformed, false);
 assert.equal(packet.approved, false);
 assert.equal(readiness.ready, false);
 assert.ok(readiness.missing.includes("physicalRoomBenchmark"));
 assert.equal(project.stage, "ready_for_review");
});
test("preview before any approved proposal is blocked by the stage gate", async () => {
 const project = await projectLocked();
 assert.throws(() => project.generatePreview({actor}), /stage_/);
});
test("proposal without a trusted approval never advances the project", async () => {
 const project = await projectLocked();
 await assert.rejects(() => project.proposeChange({actor, resolveApproval: async () => null, change}), /active approval required/);
 assert.equal(project.stage, "geometry_locked");
 assert.equal(project.snapshot().spatialEventCount, 0);
});
test("self-approved proposals are rejected by the approval gate", async () => {
 const project = await projectLocked();
 const selfResolver = async () => ({...approvalRecord, approvedBy: "operator-1", allowedActorIds: undefined});
 await assert.rejects(() => project.proposeChange({actor, resolveApproval: selfResolver, change}), /self-approved/);
});
test("cross-tenant and unauthenticated actors cannot act on a project", async () => {
 const project = await projectLocked();
 assert.throws(() => project.lockGeometry({actor: {...actor, tenantId: "tenant-b"}}), /tenant_scope_mismatch/);
 assert.throws(() => project.lockGeometry({actor: {id: "operator-1", tenantId: "tenant-a"}}), /authenticated_actor_required/);
});
test("tampered capture evidence fails manifest integrity and blocks registration", async () => {
 const project = new RenovisionProject({projectId: "reno-2", tenantId: "tenant-a", propertyId: "property-1", roomId: "room-1", createdBy: "operator-1"});
 const storage = createMemoryEvidenceStorage({authorize: async () => true});
 const receipt = await storage.put({blob, artifact: {propertyId: "property-1", roomId: "room-1"}, actorId: "operator-1", retentionDays: 30});
 const manifest = {tenantId: "tenant-a", propertyId: "property-1", roomId: "room-1", captureId: "capture-1", operatorId: "operator-1", deviceModel: "laser-x", coordinateFrame: "local", capturedAt: "2026-10-26T10:00:00Z", platform: "web", calibrationStatus: "pending", coverageGaps: [], artifacts: [{id: receipt.storageRef, kind: "photo", digest: "sha256:" + "0".repeat(64), byteLength: blob.size}]};
 const loadArtifact = async ({artifactId, actor: a}) => storage.get({storageRef: artifactId, actorId: a.id});
 await assert.rejects(() => project.registerCapture({actor, manifest, loadArtifact, cryptoApi: webcrypto}), /integrity/);
 assert.equal(project.stage, "capture_planned");
});
test("a post-lock measurement correction unlocks geometry and preserves the original", async () => {
 const project = await projectLocked();
 const digestBefore = project.lock.geometryDigest;
 project.correctMeasurement({actor, correction: {targetMeasurementId: "meas-width", newMeasurementId: "meas-width-corr-1", value: 3.62, reason: "laser re-measure", evidenceRef: digest, timestamp: "2026-10-26T13:00:00Z"}});
 assert.equal(project.lock, null);
 assert.equal(project.stage, "measurement_review");
 const snap = project.snapshot();
 assert.equal(snap.measurements.find((m) => m.measurementId === "meas-width").value, 3.6);
 assert.equal(snap.activeMeasurements.find((m) => m.featureId === "width").value, 3.62);
 project.lockGeometry({actor});
 assert.notEqual(project.lock.geometryDigest, digestBefore);
});
test("rejected capture returns the project to capture planning with a reason", async () => {
 const project = new RenovisionProject({projectId: "reno-3", tenantId: "tenant-a", propertyId: "property-1", roomId: "room-1", createdBy: "operator-1"});
 const storage = createMemoryEvidenceStorage({authorize: async () => true});
 const receipt = await storage.put({blob, artifact: {propertyId: "property-1", roomId: "room-1"}, actorId: "operator-1", retentionDays: 30});
 const manifest = {tenantId: "tenant-a", propertyId: "property-1", roomId: "room-1", captureId: "capture-1", operatorId: "operator-1", deviceModel: "laser-x", coordinateFrame: "local", capturedAt: "2026-10-26T10:00:00Z", platform: "web", calibrationStatus: "pending", coverageGaps: [], artifacts: [{id: receipt.storageRef, kind: "photo", digest, byteLength: blob.size}]};
 await project.registerCapture({actor, manifest, loadArtifact: async ({artifactId, actor: a}) => storage.get({storageRef: artifactId, actorId: a.id}), cryptoApi: webcrypto});
 assert.throws(() => project.reviewCapture({actor, decision: "reject"}), /reason/);
 project.reviewCapture({actor, decision: "reject", reason: "occluded corner not captured"});
 assert.equal(project.stage, "capture_planned");
});
