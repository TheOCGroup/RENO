/** RENOVISION product catalog: furniture and home products with mandatory
 * source and freshness provenance.
 *
 * Integrity rules (founder directive, Priority 3):
 * - No product exists without an identified source and a retrieval/entry
 *   timestamp. There are NO seeded retailer listings in this module and no
 *   invented prices, availability or links.
 * - A product entered manually is labeled manual_entry forever; its
 *   dimensions are unverified unless explicit dimension provenance is
 *   recorded (dimensionSource + dimensionsVerified).
 * - Prices are integer cents; availability is "unknown" unless a source
 *   actually reported it; delivery is null (unknown) unless reported.
 * - Freshness is computed from the source timestamp, never asserted.
 */

export const PRODUCT_SOURCE_KINDS = Object.freeze(["retailer_feed", "manual_entry", "user_provided"]);
export const FRESHNESS_WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

const isId = (s) => typeof s === "string" && s.trim().length > 0;
const pos = (n) => typeof n === "number" && Number.isFinite(n) && n > 0;
const cents = (n) => n === null || (typeof n === "number" && Number.isSafeInteger(n) && n >= 0);

export function validateCatalogProduct(p) {
  const errors = [];
  if (!p || typeof p !== "object") return {valid: false, errors: ["product object required"]};
  if (!isId(p.productId)) errors.push("productId required");
  if (!isId(p.name)) errors.push("name required");
  if (!isId(p.type)) errors.push("type required (e.g. sofa, table, rug)");
  if (!pos(p.widthMeters) || !pos(p.depthMeters)) errors.push("widthMeters/depthMeters must be positive");
  if (p.heightMeters !== undefined && p.heightMeters !== null && !pos(p.heightMeters)) errors.push("heightMeters must be positive when present");
  if (!cents(p.priceCents)) errors.push("priceCents must be null (unknown) or a non-negative integer of cents");
  if (!cents(p.deliveryCents)) errors.push("deliveryCents must be null (unknown) or a non-negative integer of cents");
  if (!p.source || !PRODUCT_SOURCE_KINDS.includes(p.source.kind)) errors.push("source.kind must be one of " + PRODUCT_SOURCE_KINDS.join(", "));
  if (!p.source || !isId(p.source.label)) errors.push("source.label required (who or what provided this record)");
  const ts = p.source ? Date.parse(p.source.retrievedAt ?? "") : NaN;
  if (!Number.isFinite(ts)) errors.push("source.retrievedAt must be an ISO timestamp");
  if (p.retailer !== undefined && p.retailer !== null) {
    if (!isId(p.retailer.name)) errors.push("retailer.name required when retailer present");
    if (p.retailer.url !== undefined && p.retailer.url !== null) {
      let ok = false;
      try { const u = new URL(p.retailer.url); ok = u.protocol === "https:" && !!u.hostname; } catch { ok = false; }
      if (!ok) errors.push("retailer.url must be a valid HTTPS URL");
    }
  }
  if (p.availability !== undefined && !["unknown", "in_stock", "out_of_stock"].includes(p.availability))
    errors.push("availability must be unknown, in_stock or out_of_stock");
  if (p.dimensionsVerified === true && !isId(p.dimensionSource))
    errors.push("dimensionsVerified requires a dimensionSource (provenance)");
  return {valid: errors.length === 0, errors};
}

/** Create a manually entered product. Dimensions stay unverified unless the
 *  caller supplies explicit provenance; price may be null (unknown). */
export function createManualProduct(input, now = new Date().toISOString()) {
  const product = {
    productId: input?.productId,
    name: input?.name,
    type: input?.type,
    widthMeters: input?.widthMeters,
    depthMeters: input?.depthMeters,
    heightMeters: input?.heightMeters ?? null,
    color: input?.color ?? null,
    material: input?.material ?? null,
    styleIds: Array.isArray(input?.styleIds) ? [...input.styleIds] : [],
    priceCents: input?.priceCents ?? null,
    deliveryCents: input?.deliveryCents ?? null,
    currency: "USD",
    retailer: input?.retailer ?? null,
    availability: "unknown",
    dimensionSource: input?.dimensionSource ?? null,
    dimensionsVerified: input?.dimensionsVerified === true && isId(input?.dimensionSource),
    source: {kind: "manual_entry", label: input?.enteredBy ?? "manual entry", retrievedAt: now},
  };
  const check = validateCatalogProduct(product);
  return check.valid ? {valid: true, product} : {valid: false, errors: check.errors};
}

export function productFreshness(product, nowMs = Date.now()) {
  const ts = Date.parse(product?.source?.retrievedAt ?? "");
  if (!Number.isFinite(ts)) return "unknown";
  const age = nowMs - ts;
  if (age < 0) return "unknown";
  return age <= FRESHNESS_WINDOW_MS ? "fresh" : "stale";
}

/** Filter a catalog. Dimension filters are maxima (must fit within). */
export function searchCatalog(products, filters = {}) {
  if (!Array.isArray(products)) return [];
  const q = typeof filters.query === "string" ? filters.query.trim().toLowerCase() : "";
  return products.filter((p) => {
    if (!p || typeof p !== "object") return false;
    if (q && ![p.name, p.type, p.color, p.material, p.retailer?.name].some((f) => typeof f === "string" && f.toLowerCase().includes(q))) return false;
    if (filters.type && p.type !== filters.type) return false;
    if (filters.styleId && !(p.styleIds ?? []).includes(filters.styleId)) return false;
    if (filters.color && (p.color ?? "").toLowerCase() !== String(filters.color).toLowerCase()) return false;
    if (filters.material && (p.material ?? "").toLowerCase() !== String(filters.material).toLowerCase()) return false;
    if (typeof filters.maxWidthMeters === "number" && !(p.widthMeters <= filters.maxWidthMeters)) return false;
    if (typeof filters.maxDepthMeters === "number" && !(p.depthMeters <= filters.maxDepthMeters)) return false;
    if (typeof filters.minPriceCents === "number" && !(p.priceCents !== null && p.priceCents >= filters.minPriceCents)) return false;
    if (typeof filters.maxPriceCents === "number" && !(p.priceCents !== null && p.priceCents <= filters.maxPriceCents)) return false;
    if (filters.verifiedOnly && p.dimensionsVerified !== true) return false;
    return true;
  });
}

/** Side-by-side comparison of catalog products, with freshness attached. */
export function compareCatalogProducts(products, ids, nowMs = Date.now()) {
  if (!Array.isArray(products) || !Array.isArray(ids) || ids.length === 0)
    return {valid: false, errors: ["products and ids required"]};
  const rows = [];
  for (const id of ids) {
    const p = products.find((x) => x?.productId === id);
    if (!p) return {valid: false, errors: ["unknown product: " + id]};
    rows.push({
      productId: p.productId, name: p.name, type: p.type,
      widthMeters: p.widthMeters, depthMeters: p.depthMeters, heightMeters: p.heightMeters ?? null,
      priceCents: p.priceCents, deliveryCents: p.deliveryCents,
      retailerName: p.retailer?.name ?? null, retailerUrl: p.retailer?.url ?? null,
      availability: p.availability ?? "unknown",
      dimensionsVerified: p.dimensionsVerified === true,
      dimensionSource: p.dimensionSource ?? null,
      sourceKind: p.source?.kind ?? null, sourceLabel: p.source?.label ?? null,
      freshness: productFreshness(p, nowMs),
    });
  }
  return {valid: true, products: rows, note: "Prices, availability and delivery are as recorded from the identified source at the recorded time; re-check the retailer page before purchase."};
}

/** Build a shopping list from selected product ids, with honest totals:
 *  the merchandise total is null unless EVERY selected product has a price. */
export function buildShoppingList(products, ids) {
  const cmp = compareCatalogProducts(products, ids);
  if (!cmp.valid) return cmp;
  const allPriced = cmp.products.every((p) => p.priceCents !== null);
  const allDeliveryKnown = cmp.products.every((p) => p.deliveryCents !== null);
  const merchandiseCents = allPriced ? cmp.products.reduce((s, p) => s + p.priceCents, 0) : null;
  const deliveryCents = allDeliveryKnown ? cmp.products.reduce((s, p) => s + p.deliveryCents, 0) : null;
  const totalCents = merchandiseCents !== null && deliveryCents !== null ? merchandiseCents + deliveryCents : null;
  return {
    valid: true,
    items: cmp.products,
    merchandiseCents: merchandiseCents !== null && Number.isSafeInteger(merchandiseCents) ? merchandiseCents : null,
    deliveryCents: deliveryCents !== null && Number.isSafeInteger(deliveryCents) ? deliveryCents : null,
    totalCents: totalCents !== null && Number.isSafeInteger(totalCents) ? totalCents : null,
    totalsComplete: totalCents !== null,
    note: "Totals are shown only when every selected product has a recorded price (and delivery, for the grand total). Unknown prices are never estimated.",
  };
}
