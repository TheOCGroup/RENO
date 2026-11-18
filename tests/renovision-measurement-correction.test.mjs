import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {applyMeasurementCorrection, getActiveMeasurements} from "../lib/renovision/measurement-correction.mjs";
const digest = "sha256:" + createHash("sha256").update("evidence").digest("hex");
const actor = {id: "operator-1", tenantId: "tenant-a", authenticated: true};
const base = {propertyId: "property-1", roomId: "room-1", measurementId: "meas-width", featureId: "width", captureId: "capture-1", deviceModel: "laser-x", platform: "web", timestamp: "2026-10-26T10:00:00Z", coordinateFrame: "local", evidenceRef: digest, semanticType: "wall", method: "manual_laser", value: 3.6, unit: "m", uncertainty: 0.02, calibrationStatus: "calibrated", verificationStatus: "estimated", geometryState: "EXISTING"};
const correction = {targetMeasurementId: "meas-width", newMeasurementId: "meas-width-corr-1", value: 3.62, reason: "re-measured on site", evidenceRef: digest, timestamp: "2026-10-26T12:00:00Z"};
test("correction supersedes without mutating the original value", () => {
 const result = applyMeasurementCorrection({measurements: [base], correction, actor});
 assert.equal(result.ok, true);
 const original = result.measurements.find((m) => m.measurementId === "meas-width");
 assert.equal(original.value, 3.6);
 assert.equal(original.supersededBy, "meas-width-corr-1");
 const active = getActiveMeasurements(result.measurements);
 assert.equal(active.length, 1);
 assert.equal(active[0].value, 3.62);
 assert.equal(active[0].supersedes, "meas-width");
});
test("correcting an already superseded measurement fails", () => {
 const first = applyMeasurementCorrection({measurements: [base], correction, actor});
 const second = applyMeasurementCorrection({measurements: first.measurements, correction: {...correction, newMeasurementId: "meas-width-corr-2"}, actor});
 assert.equal(second.ok, false);
 assert.match(second.errors.join(" "), /already superseded/);
});
test("a correction cannot promote its own measurement to verified", () => {
 const result = applyMeasurementCorrection({measurements: [base], correction: {...correction, verificationStatus: "verified", verifiedBy: "operator-1", verifiedAt: "2026-10-26T12:30:00Z"}, actor});
 assert.equal(result.ok, false);
 assert.match(result.errors.join(" "), /self-verify/);
});
test("an independent verifier can verify through a correction", () => {
 const result = applyMeasurementCorrection({measurements: [base], correction: {...correction, verificationStatus: "verified", verifiedBy: "verifier-9", verifiedAt: "2026-10-26T12:30:00Z"}, actor});
 assert.equal(result.ok, true);
 assert.equal(result.verified, true);
});
test("correction requires reason, digest evidence and a non-predating timestamp", () => {
 assert.equal(applyMeasurementCorrection({measurements: [base], correction: {...correction, reason: ""}, actor}).ok, false);
 assert.equal(applyMeasurementCorrection({measurements: [base], correction: {...correction, evidenceRef: "not-a-digest"}, actor}).ok, false);
 assert.equal(applyMeasurementCorrection({measurements: [base], correction: {...correction, timestamp: "2026-10-25T12:00:00Z"}, actor}).ok, false);
});
test("unauthenticated actors cannot correct measurements", () => {
 const result = applyMeasurementCorrection({measurements: [base], correction, actor: {id: "operator-1"}});
 assert.equal(result.ok, false);
});
