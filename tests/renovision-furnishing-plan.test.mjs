import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {buildRoomModel, lockRoomGeometry} from "../lib/renovision/room-model.mjs";
import {evaluateFurnishingPlan} from "../lib/renovision/furnishing-plan.mjs";
const digest = "sha256:" + createHash("sha256").update("evidence").digest("hex");
const actor = {id: "operator-1", tenantId: "tenant-a", authenticated: true};
const mk = (featureId, value) => ({propertyId: "property-1", roomId: "room-1", measurementId: "meas-" + featureId, featureId, captureId: "capture-1", deviceModel: "laser-x", platform: "web", timestamp: "2026-10-26T10:00:00Z", coordinateFrame: "local", evidenceRef: digest, semanticType: "wall", method: "manual_laser", value, unit: "m", uncertainty: 0.02, calibrationStatus: "calibrated", verificationStatus: "verified", verifiedBy: "verifier-1", verifiedAt: "2026-10-26T11:00:00Z", geometryState: "EXISTING", fieldMeasured: true});
const roomModel = buildRoomModel({measurements: [mk("width", 3.6), mk("depth", 4.2), mk("height", 2.7)], propertyId: "property-1", roomId: "room-1"});
const lock = lockRoomGeometry({roomModel, manifestVerified: true, actor});
const sofa = {id: "sofa-1", productId: "sofa-001", dimensionSource: "manufacturer-spec", dimensionsVerified: true, width: 2.1, depth: 0.95, x: 0.4, y: 0.4, clearance: 0.3, uncertaintyMeters: 0.01};
test("furnishing requires a geometry lock", () => {
 const plan = evaluateFurnishingPlan({roomModel, lock: {locked: false}, items: [sofa]});
 assert.equal(plan.valid, false);
 assert.equal(plan.blocked, true);
});
test("verified-dimension item that fits with uncertainty margin gets a conservative pass verdict", () => {
 const plan = evaluateFurnishingPlan({roomModel, lock, items: [sofa]});
 assert.equal(plan.valid, true);
 assert.equal(plan.items[0].verdict, "fits_with_uncertainty_margin");
 assert.equal(plan.items[0].verified, false);
 assert.equal(plan.fieldVerificationRequired, true);
 assert.match(plan.disclosure, /not a verified fit/);
});
test("oversized item does not fit", () => {
 const plan = evaluateFurnishingPlan({roomModel, lock, items: [{...sofa, id: "big-1", width: 3.5}]});
 assert.equal(plan.items[0].verdict, "does_not_fit");
});
test("items without verified dimension provenance are blocked", () => {
 const plan = evaluateFurnishingPlan({roomModel, lock, items: [{...sofa, id: "mystery-1", dimensionsVerified: false}]});
 assert.equal(plan.items[0].verdict, "blocked_unverified_dimensions");
});
test("uncertainty can downgrade a nominal fit", () => {
 const tight = {...sofa, id: "tight-1", width: 3.2, depth: 3.9, x: 0.1, y: 0.1, clearance: 0.1, uncertaintyMeters: 0.25};
 const plan = evaluateFurnishingPlan({roomModel, lock, items: [tight]});
 assert.equal(plan.items[0].verdict, "fits_nominal_only");
});
test("overlapping placements are reported as not fitting", () => {
 const plan = evaluateFurnishingPlan({roomModel, lock, items: [sofa, {...sofa, id: "sofa-2"}]});
 assert.equal(plan.items[1].verdict, "does_not_fit");
 assert.ok(plan.overlaps.length >= 1);
});
