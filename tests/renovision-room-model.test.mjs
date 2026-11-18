import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {buildRoomModel, lockRoomGeometry, computeGeometryDigest} from "../lib/renovision/room-model.mjs";
const digest = "sha256:" + createHash("sha256").update("evidence").digest("hex");
const actor = {id: "operator-1", tenantId: "tenant-a", authenticated: true};
const mk = (featureId, value, unit = "m", extra = {}) => ({propertyId: "property-1", roomId: "room-1", measurementId: "meas-" + featureId, featureId, captureId: "capture-1", deviceModel: "laser-x", platform: "web", timestamp: "2026-10-26T10:00:00Z", coordinateFrame: "local", evidenceRef: digest, semanticType: "wall", method: "manual_laser", value, unit, uncertainty: 0.02, calibrationStatus: "calibrated", verificationStatus: "verified", verifiedBy: "verifier-1", verifiedAt: "2026-10-26T11:00:00Z", geometryState: "EXISTING", fieldMeasured: true, ...extra});
const full = () => [mk("width", 3.6), mk("depth", 4.2), mk("height", 2.7), mk("door_width", 90, "cm"), mk("door_offset", 0.5), mk("window_width", 1.2), mk("window_offset", 1), mk("obstruction_offset", 2)];
test("room model normalizes units and completes the survey when all features are verified", () => {
 const model = buildRoomModel({measurements: full(), propertyId: "property-1", roomId: "room-1"});
 assert.equal(model.valid, true);
 assert.equal(model.dimensions.widthMeters, 3.6);
 assert.equal(model.features.door_width.meters, 0.9);
 assert.equal(model.completeness.complete, true);
 assert.equal(model.fieldVerified, true);
});
test("estimated measurements do not complete the survey or field-verify the model", () => {
 const rows = full().map((m) => ({...m, verificationStatus: "estimated", verifiedBy: undefined, verifiedAt: undefined}));
 const model = buildRoomModel({measurements: rows, propertyId: "property-1", roomId: "room-1"});
 assert.equal(model.completeness.complete, false);
 assert.equal(model.fieldVerified, false);
});
test("geometry lock requires a verified manifest and reports digest stability", () => {
 const model = buildRoomModel({measurements: full(), propertyId: "property-1", roomId: "room-1"});
 const denied = lockRoomGeometry({roomModel: model, manifestVerified: false, actor});
 assert.equal(denied.locked, false);
 const lock = lockRoomGeometry({roomModel: model, manifestVerified: true, actor});
 assert.equal(lock.locked, true);
 assert.equal(lock.geometryDigest, computeGeometryDigest(model));
 assert.equal(lock.fieldVerified, true);
 assert.ok(lock.featureIds.includes("width"));
});
test("missing core dimensions prevent locking", () => {
 const model = buildRoomModel({measurements: full().filter((m) => m.featureId !== "height"), propertyId: "property-1", roomId: "room-1"});
 assert.equal(model.dimensions.valid, false);
 const lock = lockRoomGeometry({roomModel: model, manifestVerified: true, actor});
 assert.equal(lock.locked, false);
});
test("superseded measurements are excluded from the room model", () => {
 const rows = full();
 rows.push({...mk("width", 9.9), measurementId: "meas-width-old", supersededBy: "meas-width"});
 const model = buildRoomModel({measurements: rows, propertyId: "property-1", roomId: "room-1"});
 assert.equal(model.dimensions.widthMeters, 3.6);
});
