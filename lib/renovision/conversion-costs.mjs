/** RENOVISION conversion cost engine (directive §8).
 *
 * Honesty contract (binding, per AI-PLATFORM-ARCHITECTURE-2026-11-19):
 * - No rate in this module is market data. Every rate is supplied by the
 *   customer or operator and must carry its source, source date,
 *   confidence, and unit before it can be used. A rate without
 *   provenance is rejected, never defaulted.
 * - Estimates are FAIL-CLOSED, consistent with project-budget: if any
 *   in-scope category lacks a rate, no total is produced — the missing
 *   scope is listed instead. Amounts are integer cents; any computed
 *   amount that is not a safe integer withholds the total rather than
 *   being rounded or approximated.
 * - Nothing here is a quote, bid, or verified cost. Figures are
 *   preliminary planning numbers built only from the supplied rates.
 *
 * Contract choices:
 * - requiredCategories is passed explicitly to buildConversionEstimate
 *   (derived by the caller from a conversion template's scope), keeping
 *   this module decoupled from conversions.mjs.
 * - Lines are produced ONLY for requiredCategories. Rates recorded for
 *   out-of-scope categories are ignored, so scope stays explicit.
 * - Contingency is a normal rate-book category (any unit). When it is in
 *   scope and rated, subtotalCents reports the sum of all other lines
 *   and totalCents adds the contingency line — the construction-estimate
 *   convention. Without contingency in scope, subtotal == total.
 * - estimateToBudgetLines maps each conversion category onto the
 *   project-budget category vocabulary (see BUDGET_CATEGORY_MAP) and
 *   keeps the original conversion category on the line as
 *   conversionCategoryId, so provenance survives the mapping. An
 *   incomplete estimate exports no lines.
 */

import {validateBudgetLine} from "./project-budget.mjs";

export const CONVERSION_COST_CATEGORIES = Object.freeze([
  {id: "demolition", label: "Demolition"},
  {id: "framing", label: "Framing"},
  {id: "insulation", label: "Insulation"},
  {id: "drywall", label: "Drywall"},
  {id: "flooring", label: "Flooring"},
  {id: "electrical", label: "Electrical"},
  {id: "plumbing", label: "Plumbing"},
  {id: "hvac", label: "HVAC"},
  {id: "windows-doors", label: "Windows and doors"},
  {id: "fixtures", label: "Fixtures"},
  {id: "finishes", label: "Finishes"},
  {id: "labor", label: "Labor"},
  {id: "permits", label: "Permits"},
  {id: "contingency", label: "Contingency"},
]);

const CATEGORY_IDS = new Set(CONVERSION_COST_CATEGORIES.map((c) => c.id));
const CATEGORY_LABELS = new Map(CONVERSION_COST_CATEGORIES.map((c) => [c.id, c.label]));
const UNITS = new Set(["sqft", "each", "lump"]);
/** Lowest first: an estimate is only as strong as its weakest rate. */
const CONFIDENCE_ORDER = Object.freeze(["assumption", "sourced", "verified"]);
const CONFIDENCE_RANK = new Map(CONFIDENCE_ORDER.map((c, i) => [c, i]));

export const CONVERSION_ESTIMATE_DISCLAIMER =
  "Preliminary planning estimate built only from the rates supplied in the rate book. Figures are unverified planning numbers, not quotes, bids, or confirmed costs. Confirm scope and pricing with qualified professionals before committing funds.";

/** Conversion category -> project-budget category. Trade and site-work
 *  categories land in "contractor-estimates"; loose materials in
 *  "materials"; categories the budget engine already names map to
 *  themselves. */
export const BUDGET_CATEGORY_MAP = Object.freeze({
  demolition: "contractor-estimates",
  framing: "contractor-estimates",
  insulation: "materials",
  drywall: "materials",
  flooring: "flooring",
  electrical: "contractor-estimates",
  plumbing: "contractor-estimates",
  hvac: "contractor-estimates",
  "windows-doors": "materials",
  fixtures: "fixtures",
  finishes: "materials",
  labor: "labor",
  permits: "permits",
  contingency: "contingency",
});

const isCents = (n) => typeof n === "number" && Number.isSafeInteger(n) && n >= 0;
const isNonEmptyString = (s) => typeof s === "string" && s.trim().length > 0;

export function createRateBook() {
  return {rates: {}};
}

/** Record a rate. Returns a NEW rate book (the input is not mutated).
 *  Throws on any invalid input — a rate without full provenance must
 *  never enter the book silently. */
export function setRate(book, categoryId, rate) {
  if (!book || typeof book !== "object" || !book.rates || typeof book.rates !== "object")
    throw new TypeError("setRate requires a rate book from createRateBook()");
  if (!CATEGORY_IDS.has(categoryId)) throw new TypeError("unknown conversion cost category: " + categoryId);
  if (!rate || typeof rate !== "object") throw new TypeError("rate object required");
  if (!isCents(rate.amountCents)) throw new TypeError("amountCents must be a non-negative integer of cents");
  if (!UNITS.has(rate.unit)) throw new TypeError('unit must be "sqft", "each" or "lump"');
  if (!isNonEmptyString(rate.source)) throw new TypeError("source must be a non-empty string");
  if (!isNonEmptyString(rate.sourceDate)) throw new TypeError("sourceDate must be a non-empty string");
  if (!CONFIDENCE_RANK.has(rate.confidence)) throw new TypeError('confidence must be "assumption", "sourced" or "verified"');
  return {
    rates: {
      ...book.rates,
      [categoryId]: {
        amountCents: rate.amountCents,
        unit: rate.unit,
        source: rate.source.trim(),
        sourceDate: rate.sourceDate.trim(),
        confidence: rate.confidence,
      },
    },
  };
}

/** Build a fail-closed conversion estimate.
 *  { areaSqFt, rateBook, requiredCategories, quantities } — quantities
 *  maps categoryId -> count for "each"-unit rates (default 1).
 *  Returns either:
 *    { status: "incomplete", missing, lines: [], subtotalCents: null,
 *      totalCents: null, disclaimer }                       (no total, ever)
 *  or:
 *    { status: "estimated", lines, subtotalCents, totalCents,
 *      confidence, assumptions, estimatedAt, disclaimer }
 *  A required category that is not a known category can never hold a
 *  rate (setRate rejects it), so it is reported in `missing` like any
 *  other unrated scope — the estimate still refuses a total. */
export function buildConversionEstimate({areaSqFt, rateBook, requiredCategories, quantities = {}} = {}) {
  if (!Number.isFinite(areaSqFt) || areaSqFt <= 0)
    throw new TypeError("areaSqFt must be a positive number");
  if (!rateBook || typeof rateBook !== "object" || !rateBook.rates || typeof rateBook.rates !== "object")
    throw new TypeError("rateBook from createRateBook() required");
  if (!Array.isArray(requiredCategories))
    throw new TypeError("requiredCategories must be an array of category ids");

  const required = [...new Set(requiredCategories)];
  const missing = required.filter((id) => !rateBook.rates[id]);
  if (missing.length > 0) {
    return {status: "incomplete", missing, lines: [], subtotalCents: null, totalCents: null, disclaimer: CONVERSION_ESTIMATE_DISCLAIMER};
  }

  const lines = [];
  const assumptions = [];
  let weakest = null;
  for (const categoryId of required) {
    const rate = rateBook.rates[categoryId];
    let amountCents, basis;
    if (rate.unit === "sqft") {
      amountCents = rate.amountCents * areaSqFt;
      basis = `sqft × ${areaSqFt}`;
    } else if (rate.unit === "each") {
      const qty = quantities?.[categoryId] ?? 1;
      if (!Number.isFinite(qty) || qty <= 0)
        return {status: "incomplete", missing: [], errors: [`quantity for ${categoryId} must be a positive number`], lines: [], subtotalCents: null, totalCents: null, disclaimer: CONVERSION_ESTIMATE_DISCLAIMER};
      amountCents = rate.amountCents * qty;
      basis = `each × ${qty}`;
    } else {
      amountCents = rate.amountCents;
      basis = "lump sum";
    }
    // Money discipline: never round or approximate a line into validity.
    if (!Number.isSafeInteger(amountCents) || amountCents < 0)
      return {status: "incomplete", missing: [], errors: [`amount for ${categoryId} is not an exact integer of cents`], lines: [], subtotalCents: null, totalCents: null, disclaimer: CONVERSION_ESTIMATE_DISCLAIMER};
    lines.push({categoryId, basis, amountCents});
    assumptions.push(`${CATEGORY_LABELS.get(categoryId) ?? categoryId}: rate from ${rate.source} (${rate.sourceDate}, confidence: ${rate.confidence})`);
    if (weakest === null || CONFIDENCE_RANK.get(rate.confidence) < CONFIDENCE_RANK.get(weakest)) weakest = rate.confidence;
  }

  const sum = (xs) => xs.reduce((a, b) => a + b, 0);
  const contingencyCents = sum(lines.filter((l) => l.categoryId === "contingency").map((l) => l.amountCents));
  const subtotalCents = sum(lines.filter((l) => l.categoryId !== "contingency").map((l) => l.amountCents));
  const totalCents = subtotalCents + contingencyCents;
  if (!Number.isSafeInteger(totalCents))
    return {status: "incomplete", missing: [], errors: ["estimate total exceeds exact integer range"], lines: [], subtotalCents: null, totalCents: null, disclaimer: CONVERSION_ESTIMATE_DISCLAIMER};

  return {
    status: "estimated",
    lines,
    subtotalCents,
    totalCents,
    confidence: weakest,
    assumptions,
    estimatedAt: new Date().toISOString(),
    disclaimer: CONVERSION_ESTIMATE_DISCLAIMER,
  };
}

/** Export an estimated conversion estimate as project-budget lines.
 *  Every produced line satisfies project-budget's validateBudgetLine
 *  (asserted in the test suite). An incomplete estimate exports [] —
 *  fail-closed figures never enter a budget. */
export function estimateToBudgetLines(estimate) {
  if (!estimate || estimate.status !== "estimated" || !Array.isArray(estimate.lines)) return [];
  return estimate.lines.map((line) => ({
    lineId: `conversion-${line.categoryId}`,
    categoryId: BUDGET_CATEGORY_MAP[line.categoryId] ?? "contractor-estimates",
    conversionCategoryId: line.categoryId,
    label: `${CATEGORY_LABELS.get(line.categoryId) ?? line.categoryId} — conversion estimate`,
    estimatedCents: line.amountCents,
    actualCents: null,
    status: "planned",
    source: "conversion-estimate",
  }));
}

/** Re-exported so consumers can verify exported lines against the same
 *  validator the budget engine uses, without a second import path. */
export {validateBudgetLine};
