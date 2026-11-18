import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {buildRoomModel, lockRoomGeometry} from "../lib/renovision/room-model.mjs";
import {buildRenovationPreview, compareRoomStates, renderFloorPlanSvg} from "../lib/renovision/renovation-preview.mjs";
const digest = "sha256:" + createHash("sha256").update("evidence").digest("hex");
const actor = {id: "operator-1", tenantId: "tenant-a", authenticated: true};
const mk = (featureId, value) => ({propertyId: "property-1", roomId: "room-1", measurementId: "meas-" + featureId, featureId, captureId: "capture-1", deviceModel: "laser-x", platform: "web", timestamp: "2026-10-26T10:00:00Z", coordinateFrame: "local", evidenceRef: digest, semanticType: "wall", method: "manual_laser", value, unit: "m", uncertainty: 0.02, calibrationStatus: "calibrated", verificationStatus: "verified", verifiedBy: "verifier-1", verifiedAt: "2026-10-26T11:00:00Z", geometryState: "EXISTING", fieldMeasured: true});
const model = () => buildRoomModel({measurements: [mk("width", 3.6), mk("depth", 4.2), mk("height", 2.7), mk("door_width", 0.9), mk("door_offset", 0.5), mk("window_width", 1.2), mk("window_offset", 1), mk("obstruction_offset", 2)], propertyId: "property-1", roomId: "room-1"});
test("preview is blocked without a geometry lock", () => {
 const result = buildRenovationPreview({roomModel: model(), lock: {locked: false}, sourceEvidenceRef: digest, previewId: "p1"});
 assert.equal(result.ok, false);
 assert.match(result.errors.join(" "), /geometry lock/);
});
test("locked preview renders a dimensioned CONCEPT svg and never authorizes an accuracy claim", () => {
 const roomModel = model();
 const lock = lockRoomGeometry({roomModel, manifestVerified: true, actor});
 const result = buildRenovationPreview({roomModel, lock, proposedFeatures: [{featureId: "floor-main", semanticType: "floor", label: "White oak", scopeItemId: "scope-1", approvalRef: "approval-1"}], existingFeatures: [{featureId: "floor-main", semanticType: "floor", label: "Existing vinyl"}], sourceEvidenceRef: digest, previewId: "p1"});
 assert.equal(result.ok, true);
 assert.equal(result.preview.status, "concept");
 assert.equal(result.preview.accuracyClaimAuthorized, false);
 assert.equal(result.preview.claim.eligibleForAccuracyClaim, false);
 assert.match(result.preview.existingSvg, /CONCEPT/);
 assert.match(result.preview.existingSvg, /3\.60 m/);
 assert.match(result.preview.existingSvg, /door 0\.90 m/);
 assert.equal(result.preview.diff.summary.modified, 1);
 assert.equal(result.preview.diff.summary.unapprovedChanges, 0);
});
test("structural changes without approval are flagged in the comparison", () => {
 const diff = compareRoomStates({existingFeatures: [], proposedFeatures: [{featureId: "wall-north", semanticType: "wall", label: "Remove wall"}]});
 assert.equal(diff.summary.added, 1);
 assert.equal(diff.summary.unapprovedChanges, 1);
 assert.equal(diff.verified, false);
});
test("svg output escapes untrusted labels", () => {
 const svg = renderFloorPlanSvg({plan: {widthMeters: 3, depthMeters: 3, features: [{xMeters: 0, yMeters: 0, widthMeters: 1, depthMeters: 1, label: "<script>alert(1)</script>"}]}, title: "Plan", disclosure: {warnings: []}});
 assert.ok(!svg.includes("<script>alert"));
 assert.match(svg, /&lt;script&gt;/);
});
test("comparison reports removed and unchanged features", () => {
 const diff = compareRoomStates({existingFeatures: [{featureId: "a", label: "same"}, {featureId: "b", label: "gone"}], proposedFeatures: [{featureId: "a", label: "same"}]});
 assert.equal(diff.summary.unchanged, 1);
 assert.equal(diff.summary.removed, 1);
});
