/** Measurement correction: append-only. A correction never edits a recorded value;
 * it supersedes the original with a new evidence-backed record, preserving the
 * original, the reason, the actor and the supporting evidence reference.
 * A correction cannot promote its own measurement to verified — verification
 * requires an independent verifier, mirroring the attestation policy. */
import {validateMeasurement} from "./spatial-validation.mjs";
const text = (x) => typeof x === "string" && x.trim().length > 0;
const digest = (x) => typeof x === "string" && /^sha256:[a-fA-F0-9]{64}$/.test(x);
const iso = (x) => text(x) && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(x) && Number.isFinite(Date.parse(x));
export function getActiveMeasurements(measurements) {
 if (!Array.isArray(measurements)) return [];
 return measurements.filter((m) => !m?.supersededBy);
}
export function applyMeasurementCorrection({measurements, correction, actor} = {}) {
 const errors = [];
 if (!Array.isArray(measurements)) errors.push("measurements array required");
 if (!correction || typeof correction !== "object" || Array.isArray(correction)) errors.push("correction required");
 if (actor?.authenticated !== true || !text(actor?.id)) errors.push("authenticated actor required");
 if (!text(correction?.targetMeasurementId)) errors.push("targetMeasurementId required");
 if (!text(correction?.newMeasurementId) || correction?.newMeasurementId === correction?.targetMeasurementId) errors.push("distinct newMeasurementId required");
 if (!text(correction?.reason)) errors.push("correction reason required");
 if (!digest(correction?.evidenceRef)) errors.push("correction evidence requires sha256 digest reference");
 if (!iso(correction?.timestamp)) errors.push("correction timestamp invalid");
 if (errors.length) return {ok: false, errors, measurements: Array.isArray(measurements) ? measurements : []};
 const target = measurements.find((m) => m?.measurementId === correction.targetMeasurementId);
 if (!target) return {ok: false, errors: ["target measurement not found"], measurements};
 if (target.supersededBy) return {ok: false, errors: ["target measurement already superseded"], measurements};
 if (measurements.some((m) => m?.measurementId === correction.newMeasurementId)) return {ok: false, errors: ["newMeasurementId already exists"], measurements};
 if (Date.parse(correction.timestamp) < Date.parse(target.timestamp)) return {ok: false, errors: ["correction cannot predate the original measurement"], measurements};
 const next = {...target};
 for (const key of ["value", "unit", "uncertainty", "method", "calibrationStatus", "deviceModel", "captureId"]) {
   if (correction[key] !== undefined) next[key] = correction[key];
 }
 next.measurementId = correction.newMeasurementId;
 next.timestamp = correction.timestamp;
 next.evidenceRef = correction.evidenceRef;
 next.supersedes = target.measurementId;
 next.correctionReason = correction.reason;
 next.correctedBy = actor.id;
 if (correction.verificationStatus !== undefined) next.verificationStatus = correction.verificationStatus;
 if (correction.verifiedBy !== undefined) next.verifiedBy = correction.verifiedBy;
 if (correction.verifiedAt !== undefined) next.verifiedAt = correction.verifiedAt;
 if (next.verificationStatus === "verified" && target.verificationStatus !== "verified") {
   if (!text(next.verifiedBy) || next.verifiedBy === actor.id) return {ok: false, errors: ["correction cannot self-verify: independent verifier required"], measurements};
 }
 const check = validateMeasurement(next);
 if (!check.valid) return {ok: false, errors: check.errors, measurements};
 const superseded = {...target, supersededBy: next.measurementId, supersededAt: correction.timestamp, supersededReason: correction.reason};
 const updated = measurements.map((m) => (m.measurementId === target.measurementId ? superseded : m));
 updated.push(Object.freeze(next));
 return {ok: true, errors: [], measurements: updated, active: next, superseded, verified: check.verified};
}
