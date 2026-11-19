/** Bridges 3D generated assets (from asset3d-adapter / GLB inspector) into
 * RENO's existing measured furnishing-plan engine without duplicating spatial
 * bounds, clearance, or uncertainty math. Enforces that AI-estimated GLB
 * bounding boxes cannot pass furnishing fit until calibrated/verified SKU
 * dimensions are supplied. */
import {evaluateFurnishingPlan} from "./furnishing-plan.mjs";

export function evaluateAsset3dFurnishingFit({
  roomModel,
  lock,
  assets = [],
  minimumClearanceMeters = 0.75,
} = {}) {
  if (!Array.isArray(assets)) {
    return { valid: false, blocked: false, errors: ["assets array required"], verified: false };
  }

  const items = assets.map((entry, idx) => {
    const cal = entry?.calibratedDimensions;
    const hasCalibrated =
      cal &&
      typeof cal.widthMeters === "number" &&
      typeof cal.depthMeters === "number" &&
      cal.dimensionsVerified === true &&
      typeof cal.dimensionSource === "string" &&
      cal.dimensionSource.trim().length > 0;

    return {
      id: entry?.id ?? `asset_${idx + 1}`,
      productId: entry?.productId ?? entry?.jobId ?? null,
      dimensionSource: hasCalibrated ? cal.dimensionSource : null,
      dimensionsVerified: hasCalibrated ? true : false,
      width: hasCalibrated ? cal.widthMeters : entry?.estimatedDimensionsMeters?.width,
      depth: hasCalibrated ? cal.depthMeters : entry?.estimatedDimensionsMeters?.depth,
      x: entry?.x,
      y: entry?.y,
      orientation: entry?.orientation === "rotated" ? "rotated" : "normal",
      uncertaintyMeters: hasCalibrated ? cal.uncertaintyMeters : undefined,
      clearance: entry?.clearance,
    };
  });

  const plan = evaluateFurnishingPlan({
    roomModel,
    lock,
    items,
    minimumClearanceMeters,
  });

  return {
    ...plan,
    asset3dBridgeVersion: "1.0",
  };
}
