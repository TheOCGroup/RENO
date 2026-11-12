/** Device capability decision only. Does not invoke camera or claim measured accuracy. */
const supported = new Set(["ios","android","web","manual"]);
const bool = (x) => x === true;
export function planRoomCapture(input) {
  const errors = [];
  if (!input || typeof input !== "object" || Array.isArray(input)) return {ready:false,mode:"unavailable",errors:["device profile required"]};
  if (!supported.has(input.platform)) errors.push("unsupported platform");
  if (typeof input.cameraPermission !== "boolean") errors.push("cameraPermission must be explicit");
  if (typeof input.depthSupported !== "boolean") errors.push("depthSupported must be explicit");
  if (typeof input.roomPlanSupported !== "boolean") errors.push("roomPlanSupported must be explicit");
  if (typeof input.manualMeasurementAvailable !== "boolean") errors.push("manualMeasurementAvailable must be explicit");
  if (errors.length) return {ready:false,mode:"unavailable",errors};
  let mode="unavailable";
  if (input.platform==="ios" && bool(input.cameraPermission) && bool(input.roomPlanSupported) && bool(input.depthSupported)) mode="roomplan_lidar";
  else if (input.platform==="android" && bool(input.cameraPermission) && bool(input.depthSupported)) mode="arcore_depth";
  else if (bool(input.cameraPermission) && input.platform!=="manual") mode="photo_assisted_estimate";
  else if (bool(input.manualMeasurementAvailable)) mode="manual_verified_entry";
  if (mode==="unavailable") errors.push("no permitted capture or manual measurement path");
  return {ready:mode!=="unavailable",mode,measurementStatus:"estimated",requiresCalibration:true,requiresFieldVerification:true,errors};
}
export function validateCaptureManifest(manifest) {
  const errors=[];
  if (!manifest || typeof manifest!=="object" || Array.isArray(manifest)) return {valid:false,errors:["manifest required"]};
  for (const key of ["propertyId","roomId","captureId","deviceModel","platform","capturedAt","operatorId","coordinateFrame"]) {
    if (typeof manifest[key]!=="string" || !manifest[key].trim()) errors.push(key+" required");
  }
  if (!Array.isArray(manifest.artifacts) || manifest.artifacts.length===0) errors.push("at least one capture artifact required");
  else for (const a of manifest.artifacts) {
    if (!a || typeof a!=="object" || !/^sha256:[a-fA-F0-9]{64}$/.test(a.digest??"") || typeof a.kind!=="string" || !["photo","video","depth","plan","field_note"].includes(a.kind)) errors.push("artifact requires kind and sha256 digest");
  }
  if (!Array.isArray(manifest.coverageGaps)) errors.push("coverageGaps array required");
  if (!["calibrated","uncalibrated","not_applicable"].includes(manifest.calibrationStatus)) errors.push("calibrationStatus invalid");
  return {valid:errors.length===0,errors};
}
