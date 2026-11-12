/** Room model assembled from active (non-superseded) measurements only.
 * The geometry lock freezes the EXISTING room geometry as the reference for all
 * proposed changes. Locking is not verification: field-verified status is reported
 * separately and is never implied by the lock. */
import {createHash} from "node:crypto";
import {normalizeLength, summarizeRoomDimensions} from "./measurement-math.mjs";
import {assessRoomSurveyCompleteness} from "./survey-completeness.mjs";
import {getActiveMeasurements} from "./measurement-correction.mjs";
const text = (x) => typeof x === "string" && x.trim().length > 0;
const CORE_FEATURES = ["width", "depth", "height"];
export function buildRoomModel({measurements, propertyId, roomId} = {}) {
 const errors = [];
 if (!text(propertyId) || !text(roomId)) errors.push("property and room required");
 const active = getActiveMeasurements(measurements);
 const byFeature = new Map();
 for (const m of active) {
   if (!text(m?.featureId)) continue;
   if (byFeature.has(m.featureId)) { errors.push("duplicate active measurement for feature: " + m.featureId); continue; }
   byFeature.set(m.featureId, m);
 }
 const normalized = {};
 for (const [featureId, m] of byFeature) {
   const n = normalizeLength({value: m.value, unit: m.unit, uncertainty: m.uncertainty ?? 0});
   if (!n.valid) { errors.push("invalid dimension: " + featureId); continue; }
   normalized[featureId] = {meters: n.meters, uncertaintyMeters: n.uncertaintyMeters, measurementId: m.measurementId, verificationStatus: m.verificationStatus, fieldVerified: m.verificationStatus === "verified", evidenceRef: m.evidenceRef};
 }
 const core = {};
 for (const f of CORE_FEATURES) if (normalized[f]) core[f] = byFeature.get(f);
 const dimensions = CORE_FEATURES.every((f) => normalized[f])
   ? summarizeRoomDimensions({width: {value: core.width.value, unit: core.width.unit, uncertainty: core.width.uncertainty ?? 0}, depth: {value: core.depth.value, unit: core.depth.unit, uncertainty: core.depth.uncertainty ?? 0}, height: {value: core.height.value, unit: core.height.unit, uncertainty: core.height.uncertainty ?? 0}})
   : {valid: false, errors: ["width, depth and height measurements required"]};
 const surveyInput = active.filter((m) => text(m?.featureId)).map((m) => ({featureId: m.featureId, value: m.value, unit: m.unit, sourceEvidenceVerified: m.verificationStatus === "verified", fieldMeasured: m.fieldMeasured === true}));
 const completeness = assessRoomSurveyCompleteness({measurements: surveyInput, coverageGaps: []});
 return {valid: errors.length === 0, errors, propertyId, roomId, features: normalized, dimensions, completeness, activeMeasurementCount: active.length, fieldVerified: CORE_FEATURES.every((f) => normalized[f]?.fieldVerified === true)};
}
export function computeGeometryDigest(roomModel) {
 const entries = Object.entries(roomModel?.features ?? {}).sort(([a], [b]) => a.localeCompare(b)).map(([featureId, f]) => [featureId, Number(f.meters.toFixed(6)), Number(f.uncertaintyMeters.toFixed(6))]);
 return "sha256:" + createHash("sha256").update(JSON.stringify(entries)).digest("hex");
}
export function lockRoomGeometry({roomModel, manifestVerified, actor, now = () => new Date().toISOString()} = {}) {
 const errors = [];
 if (actor?.authenticated !== true || !text(actor?.id)) errors.push("authenticated actor required");
 if (!roomModel || roomModel.valid !== true) errors.push("valid room model required");
 if (roomModel?.dimensions?.valid !== true) errors.push("room dimensions incomplete");
 if (manifestVerified !== true) errors.push("verified capture manifest required before geometry lock");
 if (errors.length) return {locked: false, errors, fieldVerified: false};
 const lockedAt = now();
 return {locked: true, errors: [], propertyId: roomModel.propertyId, roomId: roomModel.roomId, lockedBy: actor.id, lockedAt, tenantId: actor.tenantId ?? null, featureIds: Object.keys(roomModel.features).sort(), geometryDigest: computeGeometryDigest(roomModel), fieldVerified: roomModel.fieldVerified === true, surveyComplete: roomModel.completeness?.complete === true};
}
