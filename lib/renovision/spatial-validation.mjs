/** RENOVISION evidence gate: deterministic validation, no inference from images. */
const METHODS = new Set(["manual_laser","manual_tape","roomplan_lidar","arcore_depth","photogrammetry","imported_plan"]);
const STATES = new Set(["EXISTING","PROPOSED","ALTERNATE","AS_BUILT"]);
const TYPES = new Set(["wall","floor","ceiling","opening","obstruction"]);
const isText = (x) => typeof x === "string" && x.trim().length > 0;
const finitePositive = (x) => typeof x === "number" && Number.isFinite(x) && x > 0;
export function validateMeasurement(record) {
  const errors = [];
  if (!record || typeof record !== "object" || Array.isArray(record)) return { valid:false, verified:false, errors:["record must be an object"] };
  for (const field of ["propertyId","roomId","measurementId","captureId","deviceModel","platform","timestamp","coordinateFrame","evidenceRef"]) {
    if (!isText(record[field])) errors.push(field + " required");
  }
  if (!TYPES.has(record.semanticType)) errors.push("semanticType invalid");
  if (!METHODS.has(record.method)) errors.push("method invalid");
  if (!finitePositive(record.value)) errors.push("value must be finite and positive");
  if (!["m","cm","mm","in","ft"].includes(record.unit)) errors.push("unit invalid");
  if (typeof record.uncertainty !== "number" || !Number.isFinite(record.uncertainty) || record.uncertainty < 0) errors.push("uncertainty must be finite and nonnegative");
  if (!["calibrated","uncalibrated","not_applicable"].includes(record.calibrationStatus)) errors.push("calibrationStatus invalid");
  if (!["estimated","verified"].includes(record.verificationStatus)) errors.push("verificationStatus invalid");
  if (!STATES.has(record.geometryState)) errors.push("geometryState invalid");
  if (record.verificationStatus === "verified") {
    if (record.calibrationStatus !== "calibrated") errors.push("verified measurement requires calibrated evidence");
    if (!isText(record.verifiedBy) || !isText(record.verifiedAt)) errors.push("verified measurement requires verifier and time");
    if (record.geometryState !== "EXISTING" && record.geometryState !== "AS_BUILT") errors.push("proposed geometry cannot be field verified");
  }
  return { valid: errors.length === 0, verified: errors.length === 0 && record.verificationStatus === "verified", errors };
}
export function validateGeometryChange(change, lockedIds) {
  const errors = [];
  if (!change || typeof change !== "object") return { allowed:false, errors:["change required"] };
  if (!isText(change.featureId)) errors.push("featureId required");
  if (!STATES.has(change.targetState) || change.targetState === "EXISTING") errors.push("EXISTING cannot be modified");
  if (lockedIds.includes(change.featureId) && (!isText(change.approvedScopeItemId) || !isText(change.approvedBy) || !isText(change.approvedAt))) errors.push("locked feature requires approved scope and audit trail");
  return { allowed:errors.length === 0, errors };
}
export function verifyFurnitureFit(room, item) {
  const errors = [];
  for (const [name, value] of Object.entries({roomWidth:room?.width,roomDepth:room?.depth,itemWidth:item?.width,itemDepth:item?.depth,x:item?.x,y:item?.y})) {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || (name !== "x" && name !== "y" && value === 0)) errors.push(name + " invalid");
  }
  if (!isText(item?.productId) || !isText(item?.dimensionSource)) errors.push("product and dimension provenance required");
  if (!finitePositive(item?.clearance)) errors.push("clearance required");
  if (errors.length) return { fits:false, verified:false, errors };
  const fits = item.x - item.clearance >= 0 && item.y - item.clearance >= 0 && item.x + item.width + item.clearance <= room.width && item.y + item.depth + item.clearance <= room.depth;
  return { fits, verified:fits && item.dimensionsVerified === true && room.geometryVerified === true, errors:fits?[]:["out of bounds or insufficient clearance"] };
}
