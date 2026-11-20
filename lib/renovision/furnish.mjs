/** RENOVISION "Furnish My Space": coordinated furnishing proposals built
 * from the product catalog, with budget discipline and honest fit checks.
 *
 * Honesty rules (founder master directive 2026-11-19, architecture contract):
 * - Retailer integrations (Wayfair, Walmart, IKEA, Target, Home Depot) are
 *   UNAVAILABLE: no compliant API access is connected. Proposals are built
 *   only from catalog records, which carry source provenance and freshness.
 *   Availability, pricing and purchase links are never invented.
 * - Only products passing catalog validation are considered. Invalid
 *   records are excluded, never repaired silently.
 * - Fit is never claimed without dimensions: a product whose dimensions
 *   are missing — or recorded but unverified (no dimension provenance) —
 *   gets fit status "unknown", never "fits". A "fits" result is a
 *   conservative geometric screen from the uncertain-fit evaluator; it is
 *   never a verification (verified stays false, field verification is
 *   always required).
 * - Totals follow the catalog rule: a total is shown only when every
 *   selected product has a recorded price. Unknown prices are never
 *   estimated, so an incomplete total is null, with a note.
 */

import {validateCatalogProduct, productFreshness} from "./product-catalog.mjs";
import {assessUncertainFurnitureFit} from "./uncertain-furniture-fit.mjs";

export const RETAILER_INTEGRATION_STATUS = Object.freeze({
  wayfair: "UNAVAILABLE",
  walmart: "UNAVAILABLE",
  ikea: "UNAVAILABLE",
  target: "UNAVAILABLE",
  homeDepot: "UNAVAILABLE",
  reason: "No compliant retailer API access is connected. Furnish My Space works from catalog records with recorded source provenance and freshness; availability, pricing, shipping and purchase links are never invented.",
});

export const FURNISH_QUALITY_LEVELS = Object.freeze(["value", "mid", "premium"]);

const IN_TO_M = 0.0254;
const isId = (s) => typeof s === "string" && s.trim().length > 0;
const pos = (n) => typeof n === "number" && Number.isFinite(n) && n > 0;
const norm = (s) => String(s).trim().toLowerCase();

function assertRequest(request) {
  if (!request || typeof request !== "object") throw new Error("furnish request required");
  if (!isId(request.roomId)) throw new Error("request.roomId required");
  if (typeof request.style !== "string" || !request.style.trim()) throw new Error("request.style required");
  if (!FURNISH_QUALITY_LEVELS.includes(request.quality))
    throw new Error("request.quality must be one of " + FURNISH_QUALITY_LEVELS.join(", "));
  const b = request.budgetCents;
  if (!(b === null || (typeof b === "number" && Number.isSafeInteger(b) && b > 0)))
    throw new Error("request.budgetCents must be null (no budget stated) or a positive integer of cents");
}

/** A furnishing request. budgetCents is a positive integer of cents, or
 *  null when the customer has not stated a budget (proposals then report
 *  totals without a remaining figure). */
export function createFurnishRequest(input) {
  const request = {
    roomId: input?.roomId,
    style: input?.style,
    budgetCents: input?.budgetCents ?? null,
    quality: input?.quality,
  };
  assertRequest(request);
  return request;
}

const categoryOf = (p) => (isId(p.category) ? p.category : p.type);

function styleMatches(product, style) {
  const want = norm(style);
  if (!want) return false;
  if (Array.isArray(product.styleIds) && product.styleIds.some((id) => norm(id) === want)) return true;
  return typeof product.style === "string" && norm(product.style) === want;
}

/** Evaluate one product's fit in the room. Fit uses the uncertain-fit
 *  evaluator with the room's stated clearance. Missing or unverified
 *  dimensions, or an unconfirmed room, yield "unknown" — never "fits". */
function evaluateProductFit(product, room) {
  if (!pos(product.widthMeters) || !pos(product.depthMeters))
    return {status: "unknown", verified: false, reason: "product dimensions are missing; fit cannot be evaluated", flags: ["dimensions_missing"]};
  if (product.dimensionsVerified !== true)
    return {status: "unknown", verified: false, reason: "product dimensions are recorded but not verified (no dimension provenance); fit cannot be claimed", flags: ["dimensions_unverified"]};
  if (!room || !pos(room.widthIn) || !pos(room.depthIn))
    return {status: "unknown", verified: false, reason: "room dimensions are not confirmed; fit cannot be evaluated", flags: ["room_dimensions_unknown"]};
  const clearanceMeters = pos(room.clearanceIn) ? room.clearanceIn * IN_TO_M : 0;
  const result = assessUncertainFurnitureFit({
    room: {
      width: {meters: room.widthIn * IN_TO_M, uncertaintyMeters: 0},
      depth: {meters: room.depthIn * IN_TO_M, uncertaintyMeters: 0},
    },
    object: {
      width: {meters: product.widthMeters, uncertaintyMeters: 0},
      depth: {meters: product.depthMeters, uncertaintyMeters: 0},
    },
    clearanceMeters,
  });
  if (!result.valid)
    return {status: "unknown", verified: false, reason: "fit evaluation failed: " + result.errors.join("; "), flags: ["fit_evaluation_failed"]};
  return {
    status: result.fit ? "fits" : "does_not_fit",
    verified: false,
    fieldVerificationRequired: true,
    rotated: result.fit && !result.normal,
    flags: [],
  };
}

function candidateOrder(request) {
  const byPrice = request.quality === "premium"
    ? (a, b) => (b.priceCents ?? -Infinity) - (a.priceCents ?? -Infinity)
    : (a, b) => (a.priceCents ?? Infinity) - (b.priceCents ?? Infinity);
  return (a, b) => {
    const s = Number(styleMatches(b.product, request.style)) - Number(styleMatches(a.product, request.style));
    if (s !== 0) return s;
    const p = byPrice(a.product, b.product);
    if (p !== 0) return p;
    return a.product.productId < b.product.productId ? -1 : 1;
  };
}

/** Build a furnishing proposal: one coordinated product per category
 *  present among the valid catalog products, style-preferred, greedily
 *  within budget when a budget was stated. Products that would exceed
 *  the budget are skipped and recorded; categories left without a
 *  selection are reported unfilled. */
export function proposeFurnishing(input) {
  const {request, products, room} = input ?? {};
  assertRequest(request);
  if (!Array.isArray(products)) throw new Error("products array required");

  const notes = ["Retailer integrations are unavailable; this proposal is built from catalog records with recorded source provenance. Verify price and availability with the source before purchase."];
  const seen = new Set();
  const valid = [];
  let invalidCount = 0;
  for (const p of products) {
    if (!p || typeof p !== "object" || seen.has(p.productId)) continue;
    seen.add(p.productId);
    if (validateCatalogProduct(p).valid) valid.push(p);
    else invalidCount++;
  }
  if (invalidCount > 0)
    notes.push(invalidCount + " catalog product(s) were excluded because they failed catalog validation; invalid records are never used.");

  const categories = [];
  const byCategory = new Map();
  for (const p of valid) {
    const c = categoryOf(p);
    if (!byCategory.has(c)) { byCategory.set(c, []); categories.push(c); }
    byCategory.get(c).push(p);
  }

  const budget = request.budgetCents;
  const selections = [];
  const selectedProducts = [];
  const unfilledCategories = [];
  const skippedOverBudget = [];
  let committedCents = 0;
  const order = candidateOrder(request);

  for (const category of categories) {
    const candidates = byCategory.get(category).map((product) => ({product})).sort(order);
    let chosen = null;
    for (const {product} of candidates) {
      if (budget !== null && product.priceCents !== null && committedCents + product.priceCents > budget) {
        skippedOverBudget.push(product.productId);
        continue;
      }
      chosen = product;
      break;
    }
    if (!chosen) { unfilledCategories.push(category); continue; }
    if (chosen.priceCents !== null) committedCents += chosen.priceCents;
    const fit = evaluateProductFit(chosen, room);
    selections.push({
      productId: chosen.productId,
      name: chosen.name,
      category,
      priceCents: chosen.priceCents,
      fit,
      flags: fit.flags,
    });
    selectedProducts.push(chosen);
    const freshness = productFreshness(chosen);
    if (freshness === "stale")
      notes.push("Product \"" + chosen.name + "\" (" + chosen.productId + "): source data is stale (" + chosen.source.label + ", retrieved " + chosen.source.retrievedAt + "); re-check price and availability before purchase.");
    else if (freshness === "unknown")
      notes.push("Product \"" + chosen.name + "\" (" + chosen.productId + "): source freshness is unknown (" + chosen.source.label + "); re-check price and availability before purchase.");
  }

  const allPriced = selections.every((s) => s.priceCents !== null);
  const totalCents = allPriced ? selections.reduce((sum, s) => sum + s.priceCents, 0) : null;
  if (!allPriced)
    notes.push("Total is incomplete: " + selections.filter((s) => s.priceCents === null).length + " selected product(s) have no recorded price. Unknown prices are never estimated.");
  const remainingCents = budget !== null && totalCents !== null ? budget - totalCents : null;

  const proposal = {
    status: "proposed",
    request,
    selections,
    totalCents,
    remainingCents,
    unfilledCategories,
    skippedOverBudget,
    notes,
    retailerStatus: RETAILER_INTEGRATION_STATUS,
  };
  // The full selected product records ride along non-enumerably so
  // replaceSelection can recalculate without inventing product data;
  // the proposal's enumerable shape stays exactly as documented.
  Object.defineProperty(proposal, "_selectedProducts", {value: selectedProducts, enumerable: false});
  return proposal;
}

/** Replace one selected product with another catalog product and
 *  recalculate: the swapped selection set is re-run through
 *  proposeFurnishing with the proposal's preserved request, so totals,
 *  budget discipline and fit are all recomputed honestly. */
export function replaceSelection(proposal, productId, replacementProduct, room) {
  if (!proposal || typeof proposal !== "object" || !proposal.request || !Array.isArray(proposal._selectedProducts))
    throw new Error("a proposal created by proposeFurnishing is required");
  const check = validateCatalogProduct(replacementProduct);
  if (!check.valid) throw new Error("replacement product failed catalog validation: " + check.errors.join("; "));
  if (!proposal._selectedProducts.some((p) => p.productId === productId))
    throw new Error("product is not part of this proposal: " + String(productId));
  const swapped = proposal._selectedProducts.map((p) => (p.productId === productId ? replacementProduct : p));
  return proposeFurnishing({request: proposal.request, products: swapped, room});
}
