/** RENOVISION project budget engine.
 *
 * Money discipline (consistent with the platform's financial safeguards):
 * - All amounts are integer cents; any non-integer, negative or unsafe
 *   amount invalidates the summary instead of being rounded or estimated.
 * - Totals are fail-closed: a category or project total is reported only
 *   when every contributing line is complete and valid.
 * - Contractor-entered estimates keep their unverified status end to end;
 *   nothing in this module approves a cost.
 * - "Actual" amounts are recorded expenses, entered by the user; they are
 *   never inferred from estimates.
 */

export const BUDGET_CATEGORIES = Object.freeze([
  {id: "furniture", name: "Furniture"},
  {id: "materials", name: "Materials"},
  {id: "flooring", name: "Flooring"},
  {id: "paint", name: "Paint"},
  {id: "lighting", name: "Lighting"},
  {id: "fixtures", name: "Fixtures"},
  {id: "cabinetry", name: "Cabinetry"},
  {id: "countertops", name: "Countertops"},
  {id: "appliances", name: "Appliances"},
  {id: "labor", name: "Labor"},
  {id: "contractor-estimates", name: "Contractor estimates"},
  {id: "delivery", name: "Delivery"},
  {id: "taxes", name: "Taxes"},
  {id: "permits", name: "Permits"},
  {id: "contingency", name: "Contingency"},
]);

const CATEGORY_IDS = new Set(BUDGET_CATEGORIES.map((c) => c.id));
const isCents = (n) => typeof n === "number" && Number.isSafeInteger(n) && n >= 0;
const isId = (s) => typeof s === "string" && s.trim().length > 0;

export function createProjectBudget({totalBudgetCents = null} = {}) {
  return {
    currency: "USD",
    totalBudgetCents,
    allocations: {},   // categoryId -> cents
    lines: [],         // {lineId, categoryId, label, productId, roomId, estimatedCents, actualCents, status, source}
  };
}

export function validateBudgetLine(line) {
  const errors = [];
  if (!line || typeof line !== "object") return {valid: false, errors: ["line object required"]};
  if (!isId(line.lineId)) errors.push("lineId required");
  if (!CATEGORY_IDS.has(line.categoryId)) errors.push("unknown categoryId: " + line.categoryId);
  if (!isId(line.label)) errors.push("label required");
  if (!isCents(line.estimatedCents)) errors.push("estimatedCents must be a non-negative integer of cents");
  if (line.actualCents !== null && line.actualCents !== undefined && !isCents(line.actualCents))
    errors.push("actualCents must be null (not yet spent) or a non-negative integer of cents");
  if (line.status !== undefined && !["planned", "purchased", "cancelled"].includes(line.status))
    errors.push("status must be planned, purchased or cancelled");
  return {valid: errors.length === 0, errors};
}

export function validateProjectBudget(budget) {
  const errors = [];
  if (!budget || typeof budget !== "object") return {valid: false, errors: ["budget object required"]};
  if (budget.totalBudgetCents !== null && budget.totalBudgetCents !== undefined && !isCents(budget.totalBudgetCents))
    errors.push("totalBudgetCents must be null or a non-negative integer of cents");
  if (budget.allocations !== undefined && budget.allocations !== null && (typeof budget.allocations !== "object" || Array.isArray(budget.allocations)))
    errors.push("allocations must be an object keyed by categoryId");
  for (const [categoryId, cents] of Object.entries(budget.allocations ?? {})) {
    if (!CATEGORY_IDS.has(categoryId)) errors.push("unknown allocation category: " + categoryId);
    else if (!isCents(cents)) errors.push("allocation for " + categoryId + " must be a non-negative integer of cents");
  }
  if (budget.lines !== undefined && budget.lines !== null && !Array.isArray(budget.lines))
    errors.push("lines must be an array");
  const seen = new Set();
  for (const line of Array.isArray(budget.lines) ? budget.lines : []) {
    const check = validateBudgetLine(line);
    if (!check.valid) errors.push(...check.errors.map((e) => "line " + (line?.lineId ?? "?") + ": " + e));
    if (line?.lineId) { if (seen.has(line.lineId)) errors.push("duplicate lineId: " + line.lineId); seen.add(line.lineId); }
  }
  return {valid: errors.length === 0, errors};
}

const sum = (nums) => {
  let total = 0;
  for (const n of nums) {
    if (typeof n !== "number" || !Number.isFinite(n)) return null;
    total += n;
    if (!Number.isSafeInteger(total)) return null;
  }
  return total;
};

/** Full budget summary. Fail-closed: invalid input yields valid:false and
 *  no totals. Over-budget states are reported per category and overall,
 *  for both estimated and actual spend. */
export function summarizeProjectBudget(budget) {
  const check = validateProjectBudget(budget);
  if (!check.valid) return {valid: false, errors: check.errors, verified: false};
  const active = (budget.lines ?? []).filter((l) => l.status !== "cancelled");
  const categories = BUDGET_CATEGORIES.map((cat) => {
    const lines = active.filter((l) => l.categoryId === cat.id);
    const estimatedCents = sum(lines.map((l) => l.estimatedCents));
    const withActuals = lines.filter((l) => l.actualCents !== null && l.actualCents !== undefined);
    const actualCents = withActuals.length ? sum(withActuals.map((l) => l.actualCents)) : 0;
    const allocatedCents = budget.allocations?.[cat.id] ?? null;
    return {
      categoryId: cat.id,
      name: cat.name,
      allocatedCents,
      estimatedCents,
      actualCents,
      actualsRecorded: withActuals.length,
      lineCount: lines.length,
      remainingVsAllocationCents: allocatedCents !== null && estimatedCents !== null ? allocatedCents - estimatedCents : null,
      overAllocation: allocatedCents !== null && estimatedCents !== null ? estimatedCents > allocatedCents : false,
      actualOverAllocation: allocatedCents !== null ? actualCents > allocatedCents : false,
    };
  });
  // Totals are fail-closed: if any category sum overflowed the safe-integer
  // range, sum() returned null and the project totals are withheld (null),
  // never masked to 0.
  const estimatedTotalCents = categories.some((c) => c.estimatedCents === null) ? null : sum(categories.map((c) => c.estimatedCents));
  const actualTotalCents = categories.some((c) => c.actualCents === null) ? null : sum(categories.map((c) => c.actualCents));
  const allocatedTotalCents = sum(Object.values(budget.allocations ?? {}));
  // U-6: the allocations total is part of completeness too — if it overflowed
  // it is withheld (null) AND flagged, exactly like the line totals.
  const totalsComplete = estimatedTotalCents !== null && actualTotalCents !== null && allocatedTotalCents !== null;
  const totalBudgetCents = budget.totalBudgetCents ?? null;
  const overBudgetCategories = categories.filter((c) => c.overAllocation || c.actualOverAllocation).map((c) => c.categoryId);
  return {
    valid: true,
    errors: [],
    verified: false,
    currency: "USD",
    categories,
    estimatedTotalCents,
    actualTotalCents,
    allocatedTotalCents,
    totalBudgetCents,
    remainingBudgetCents: totalBudgetCents !== null && estimatedTotalCents !== null ? totalBudgetCents - estimatedTotalCents : null,
    totalsComplete,
    overBudget: totalBudgetCents !== null && estimatedTotalCents !== null ? estimatedTotalCents > totalBudgetCents : false,
    actualOverBudget: totalBudgetCents !== null && actualTotalCents !== null ? actualTotalCents > totalBudgetCents : false,
    overBudgetCategories,
    alerts: [
      ...(estimatedTotalCents === null || actualTotalCents === null ? [{kind: "totals_overflow_withheld", categoryId: null}] : []),
      ...(allocatedTotalCents === null ? [{kind: "allocations_overflow_withheld", categoryId: null}] : []),
      ...categories.filter((c) => c.overAllocation).map((c) => ({kind: "estimate_over_allocation", categoryId: c.categoryId})),
      ...categories.filter((c) => c.actualOverAllocation).map((c) => ({kind: "actual_over_allocation", categoryId: c.categoryId})),
      ...(totalBudgetCents !== null && estimatedTotalCents !== null && estimatedTotalCents > totalBudgetCents ? [{kind: "estimate_over_total_budget", categoryId: null}] : []),
      ...(totalBudgetCents !== null && actualTotalCents !== null && actualTotalCents > totalBudgetCents ? [{kind: "actual_over_total_budget", categoryId: null}] : []),
    ],
    note: "Estimates are planning figures. Contractor-entered estimates are unverified and are never approved costs; actuals are user-recorded expenses.",
  };
}

/** Compare two budget options (e.g. design A vs design B): per-category and
 *  total estimated deltas. Both options must summarize cleanly. */
export function compareBudgetOptions(a, b) {
  const sa = summarizeProjectBudget(a), sb = summarizeProjectBudget(b);
  if (!sa.valid || !sb.valid)
    return {valid: false, errors: [...(sa.errors ?? []), ...(sb.errors ?? [])], verified: false};
  if (sa.estimatedTotalCents === null || sb.estimatedTotalCents === null)
    return {valid: false, errors: ["budget_totals_unavailable"], verified: false};
  const rows = BUDGET_CATEGORIES.map((cat) => {
    const ca = sa.categories.find((c) => c.categoryId === cat.id);
    const cb = sb.categories.find((c) => c.categoryId === cat.id);
    return {categoryId: cat.id, name: cat.name, aEstimatedCents: ca.estimatedCents, bEstimatedCents: cb.estimatedCents, deltaCents: (cb.estimatedCents ?? 0) - (ca.estimatedCents ?? 0)};
  });
  return {
    valid: true,
    categories: rows,
    aEstimatedTotalCents: sa.estimatedTotalCents,
    bEstimatedTotalCents: sb.estimatedTotalCents,
    deltaTotalCents: (sb.estimatedTotalCents ?? 0) - (sa.estimatedTotalCents ?? 0),
    cheaperOption: sb.estimatedTotalCents < sa.estimatedTotalCents ? "b" : sa.estimatedTotalCents < sb.estimatedTotalCents ? "a" : "equal",
    verified: false,
    note: "Comparison uses estimated figures only and does not verify either option's prices.",
  };
}
