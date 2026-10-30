/** Dimension-aware furnishing plan. Combines the three existing fit engines —
 * bounds/collision (spatial-validation), clearance (furniture-clearance) and the
 * uncertainty-adjusted fit (uncertain-furniture-fit) — into one conservative
 * per-item verdict. A plan is never a verified fit: field verification is always
 * required, and items without verified dimension provenance are blocked. */
import {verifyFurnitureFit} from "./spatial-validation.mjs";
import {evaluateFurnitureClearance} from "./furniture-clearance.mjs";
import {assessUncertainFurnitureFit} from "./uncertain-furniture-fit.mjs";
const text = (x) => typeof x === "string" && x.trim().length > 0;
export function evaluateFurnishingPlan({roomModel, lock, items, minimumClearanceMeters = 0.75} = {}) {
 if (!lock || lock.locked !== true) return {valid: false, blocked: true, errors: ["geometry lock required before furnishing"], verified: false};
 if (!roomModel || roomModel.dimensions?.valid !== true) return {valid: false, blocked: true, errors: ["valid dimensioned room model required"], verified: false};
 if (!Array.isArray(items)) return {valid: false, blocked: false, errors: ["items array required"], verified: false};
 const room = {width: roomModel.dimensions.widthMeters, depth: roomModel.dimensions.depthMeters, geometryVerified: lock.fieldVerified === true};
 const effective = (i) => (i?.orientation === "rotated" ? {...i, width: i?.depth, depth: i?.width} : i);
 const clearanceInput = {room: {widthMeters: room.width, depthMeters: room.depth}, items: items.map((i) => { const e = effective(i); return {id: e?.id, xMeters: e?.x, yMeters: e?.y, widthMeters: e?.width, depthMeters: e?.depth}; }), minimumClearanceMeters};
 const clearance = evaluateFurnitureClearance(clearanceInput);
 const overlapPairs = new Set((clearance.valid ? clearance.overlaps : []).flatMap(([a, b]) => [a + "|" + b, b + "|" + a]));
 const results = [];
 const placed = [];
 for (const rawItem of items) {
   const item = effective(rawItem);
   const reasons = [];
   const missing = [];
   if (!text(item?.productId)) missing.push("productId");
   if (!text(item?.dimensionSource)) missing.push("dimensionSource (provenance)");
   if (item?.dimensionsVerified !== true) missing.push("dimensionsVerified");
   for (const field of ["width", "depth", "x", "y"]) if (typeof item?.[field] !== "number" || !Number.isFinite(item[field])) missing.push(field);
   let verdict;
   if (missing.length) {
     verdict = "blocked_unverified_dimensions";
     reasons.push("verified product dimensions and provenance required", "missing or invalid fields: " + missing.join(", "));
   } else {
     const fit = verifyFurnitureFit(room, item, placed);
     if (!fit.fits) { verdict = "does_not_fit"; reasons.push(...(fit.errors.length ? fit.errors : ["out of bounds, collision or insufficient clearance"])); }
     else if ((clearance.valid ? clearance.overlaps : []).some(([a, b]) => a === item.id || b === item.id)) { verdict = "does_not_fit"; reasons.push("footprint overlaps another item"); }
     else {
       let uncertain = null;
       if (typeof item.uncertaintyMeters === "number") {
         uncertain = assessUncertainFurnitureFit({room: {width: {meters: room.width, uncertaintyMeters: roomModel.features?.width?.uncertaintyMeters ?? 0}, depth: {meters: room.depth, uncertaintyMeters: roomModel.features?.depth?.uncertaintyMeters ?? 0}}, object: {width: {meters: item.width, uncertaintyMeters: item.uncertaintyMeters}, depth: {meters: item.depth, uncertaintyMeters: item.uncertaintyMeters}}, clearanceMeters: item.clearance ?? 0});
       }
       if (uncertain && uncertain.valid && !uncertain.fit) { verdict = "fits_nominal_only"; reasons.push("nominal fit only: measurement uncertainty removes the margin"); }
       else if (uncertain && uncertain.valid && uncertain.fit) { verdict = "fits_with_uncertainty_margin"; }
       else { verdict = "fits_nominal_only"; reasons.push("no uncertainty assessment available"); }
       if (fit.verified !== true) reasons.push("fit is not field-verified");
     }
   }
   results.push({id: item?.id ?? null, productId: item?.productId ?? null, orientation: rawItem?.orientation === "rotated" ? "rotated" : "normal", missing, verdict, verified: false, fieldVerificationRequired: true, reasons});
   if (verdict !== "blocked_unverified_dimensions") placed.push(item);
 }
 return {valid: true, blocked: false, errors: [], verified: false, fieldVerificationRequired: true, geometryDigest: lock.geometryDigest, items: results, overlaps: clearance.valid ? clearance.overlaps : [], wallClearances: clearance.valid ? clearance.wallClearances : [], disclosure: "Fit verdicts are dimensional estimates from recorded measurements — not a verified fit, egress or code-compliance determination. Field verification is required before purchase or placement."};
}
