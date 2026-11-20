/** RENOVISION fit tiers: an evidence-graded furniture fit assessment.
 *
 * Honesty contract (founder directive): furniture is never labeled as
 * fitting beyond the evidence behind the claim. Four tiers grade the
 * claim by (a) whether the product dimensions are verified, (b) whether
 * the room geometry is confirmed, and (c) whether the footprint plus
 * clearance actually fits the room.
 *
 * Dimension-verification convention — matched to lib/renovision/
 * product-catalog.mjs, the catalog's own rule: dimensions count as
 * VERIFIED only when `dimensionsVerified === true` AND a non-empty
 * `dimensionSource` is recorded. validateCatalogProduct rejects a record
 * that claims dimensionsVerified without a dimensionSource, and
 * createManualProduct coerces dimensionsVerified to
 * `input.dimensionsVerified === true && isId(input.dimensionSource)`.
 * A dimensionSource on its own (flag not true) means the dimensions were
 * recorded with a stated source but never verified: "recorded-unverified".
 *
 * Clearance model — matched to lib/renovision/uncertain-furniture-fit.mjs:
 * the required clearance applies on BOTH sides of each axis, so the
 * needed span on an axis is footprint + 2 * clearanceIn.
 *
 * These are advisory placement checks only. They are not building-code
 * certification and do not establish egress, accessibility, or structural
 * compliance; field verification is still required before purchase.
 */

export const FIT_TIERS = Object.freeze(["VERIFIED_FIT", "POTENTIAL_FIT", "UNKNOWN", "DOES_NOT_FIT"]);

/** Small slack (inches) allowed before a nominal fit is declared a
 *  non-fit: tape-measure and rounding noise, not a design allowance. */
export const FIT_TOLERANCE_IN = 0.5;

export const FIT_RULES = Object.freeze({
  toleranceIn: FIT_TOLERANCE_IN,
  clearanceModel:
    "clearanceIn is required on both sides of each axis: needed span = product footprint + 2 * clearanceIn, " +
    "matching assessUncertainFurnitureFit in uncertain-furniture-fit.mjs. Either orientation (as-is or rotated 90°) may satisfy the fit.",
  verifiedConvention:
    "Product dimensions are 'verified' only when dimensionsVerified === true AND a non-empty dimensionSource is recorded " +
    "(the product-catalog.mjs convention). A dimensionSource without the flag is 'recorded-unverified'; absent or non-positive dimensions are 'missing'.",
  tiers: Object.freeze({
    VERIFIED_FIT:
      "Requires: product dimensions verified (see verifiedConvention) + room geometry confirmed + footprint with clearance fits the room in at least one orientation (within toleranceIn).",
    POTENTIAL_FIT:
      "Requires: room geometry confirmed + footprint with clearance nominally fits in at least one orientation (within toleranceIn), but the product dimensions are recorded-unverified, so the fit is plausible, not established.",
    UNKNOWN:
      "Fit cannot be assessed: product dimensions are missing/non-positive, OR the room geometry is unconfirmed (room.confirmed !== true), OR confirmed room dimensions are unavailable. UNKNOWN is returned even for a verified product when the room is unconfirmed.",
    DOES_NOT_FIT:
      "The footprint with clearance exceeds the available room span in BOTH orientations by more than toleranceIn. Returned regardless of dimension verification: an oversized verified product still does not fit, and an oversized unverified product is a definite non-fit on its recorded dimensions.",
  }),
  note:
    "Advisory clearance checks are not building-code certification. Fit tiers describe measurement evidence only; they do not certify egress, accessibility, ventilation, or structural compliance, and field verification is required before purchase or installation.",
});

const METERS_TO_INCHES = 1 / 0.0254;
const isId = (s) => typeof s === "string" && s.trim().length > 0;
const pos = (n) => typeof n === "number" && Number.isFinite(n) && n > 0;
const round1 = (n) => Math.round(n * 10) / 10;

function dimensionsState(product) {
  if (!product || typeof product !== "object" || !pos(product.widthMeters) || !pos(product.depthMeters)) return "missing";
  if (product.dimensionsVerified === true && isId(product.dimensionSource)) return "verified";
  return "recorded-unverified";
}

/** Assess one catalog product against one room.
 *  product: catalog-shaped ({ widthMeters, depthMeters, dimensionSource,
 *           dimensionsVerified } — dimension fields may be absent).
 *  room:    { widthIn, depthIn, clearanceIn, confirmed } in inches;
 *           confirmed must be exactly true for geometry to count. */
export function assessFit({product, room} = {}) {
  const dims = dimensionsState(product);
  const roomConfirmed = !!room && typeof room === "object" && room.confirmed === true;
  const provenance = {
    dimensions: dims,
    roomGeometry: roomConfirmed ? "confirmed" : "unconfirmed",
  };
  const reasons = [];

  if (dims === "missing") {
    reasons.push("Product dimensions are missing or non-positive, so no fit conclusion can be drawn.");
    if (!roomConfirmed) reasons.push("Room geometry is also unconfirmed.");
    return {tier: "UNKNOWN", reasons, provenance};
  }
  if (!roomConfirmed) {
    reasons.push("Room geometry is unconfirmed; fit is never claimed against unconfirmed measurements, even for a verified product.");
    return {tier: "UNKNOWN", reasons, provenance};
  }
  if (!pos(room.widthIn) || !pos(room.depthIn)) {
    reasons.push("Room is marked confirmed but its width/depth are unavailable, so the fit cannot be computed.");
    return {tier: "UNKNOWN", reasons, provenance};
  }

  const clearanceIn = typeof room.clearanceIn === "number" && Number.isFinite(room.clearanceIn) && room.clearanceIn > 0 ? room.clearanceIn : 0;
  const wIn = product.widthMeters * METERS_TO_INCHES;
  const dIn = product.depthMeters * METERS_TO_INCHES;
  const needW = wIn + 2 * clearanceIn;
  const needD = dIn + 2 * clearanceIn;
  const asIs = needW <= room.widthIn + FIT_TOLERANCE_IN && needD <= room.depthIn + FIT_TOLERANCE_IN;
  const rotated = needD <= room.widthIn + FIT_TOLERANCE_IN && needW <= room.depthIn + FIT_TOLERANCE_IN;

  if (!asIs && !rotated) {
    reasons.push(
      "Footprint " + round1(wIn) + " x " + round1(dIn) + " in plus " + clearanceIn + " in clearance on each side needs " +
      round1(needW) + " x " + round1(needD) + " in, exceeding the room's " + round1(room.widthIn) + " x " + round1(room.depthIn) +
      " in in both orientations (beyond the " + FIT_TOLERANCE_IN + " in tolerance)."
    );
    return {tier: "DOES_NOT_FIT", reasons, provenance};
  }

  const orientation = asIs ? "as-is" : "rotated 90°";
  if (dims === "verified") {
    reasons.push(
      "Verified dimensions (" + product.dimensionSource + ") fit the confirmed room " + orientation +
      " with " + clearanceIn + " in clearance on each side."
    );
    return {tier: "VERIFIED_FIT", reasons, provenance};
  }
  reasons.push(
    "Recorded dimensions nominally fit the confirmed room " + orientation + " with " + clearanceIn +
    " in clearance on each side, but the product dimensions are unverified, so the fit is potential, not established."
  );
  return {tier: "POTENTIAL_FIT", reasons, provenance};
}
