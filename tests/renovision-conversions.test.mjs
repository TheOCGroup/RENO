import {test} from "node:test";
import assert from "node:assert/strict";
import {
  CONVERSION_TEMPLATES, SCREENING_TOPICS, getConversionTemplate,
  screenFeasibility, generateConceptLayouts, validateConceptLayout,
} from "../lib/renovision/conversions.mjs";
import {
  CONVERSION_COST_CATEGORIES, createRateBook, setRate,
  buildConversionEstimate, estimateToBudgetLines,
} from "../lib/renovision/conversion-costs.mjs";
import {validateBudgetLine, createProjectBudget, summarizeProjectBudget} from "../lib/renovision/project-budget.mjs";

const EXPECTED_TEMPLATE_IDS = [
  "garage-guest-suite", "basement-apartment", "attic-bedroom", "bedroom-office",
  "open-plan-merge", "commercial-conversion", "kitchen-reconfig", "bathroom-reconfig",
];

test("all 8 conversion templates present with screening and spaces", () => {
  assert.deepEqual(CONVERSION_TEMPLATES.map((t) => t.id), EXPECTED_TEMPLATE_IDS);
  const topicsSeen = new Set();
  for (const t of CONVERSION_TEMPLATES) {
    assert.equal(getConversionTemplate(t.id), t);
    assert.ok(t.label && t.fromSpace && t.toSpace, t.id);
    assert.ok(Array.isArray(t.requiredInputs) && t.requiredInputs.length > 0, t.id);
    assert.ok(t.spaces.length >= 2, t.id);
    for (const s of t.spaces) assert.ok(s.key && s.label, t.id);
    assert.ok(t.screening.length > 0, t.id);
    for (const item of t.screening) {
      assert.ok(item.id && item.question, `${t.id} screening item shape`);
      assert.ok(SCREENING_TOPICS.includes(item.topic), `${t.id} topic ${item.topic}`);
      topicsSeen.add(item.topic);
    }
  }
  // The six directive screening topics are covered across the set.
  assert.deepEqual([...topicsSeen].sort(), [...SCREENING_TOPICS].sort());
  assert.equal(getConversionTemplate("no-such-template"), null);
});

test("feasibility: unanswered screening is professional_required, never an approval", () => {
  const tpl = getConversionTemplate("garage-guest-suite");
  const result = screenFeasibility(tpl, {});
  assert.equal(result.status, "screened");
  assert.equal(result.professionalReviewRequired, true);
  assert.ok(result.flags.length > 0);
  for (const flag of result.flags) assert.equal(flag.level, "professional_required", flag.topic);
  assert.match(result.disclaimer, /screening only/i);
  const blob = JSON.stringify(result).toLowerCase();
  assert.ok(!blob.includes("approved"), "no approval language");
  assert.ok(!blob.includes("permit-ready"), "no permit-ready language");
  // Explicit "unknown" behaves exactly like unanswered.
  const answers = Object.fromEntries(tpl.screening.map((s) => [s.id, "unknown"]));
  assert.deepEqual(screenFeasibility(tpl, answers).flags, result.flags);
});

test("feasibility: all-yes screens ok; structural/fire concerns escalate; other concerns flag attention", () => {
  const tpl = getConversionTemplate("garage-guest-suite");
  const yes = Object.fromEntries(tpl.screening.map((s) => [s.id, "yes"]));
  const ok = screenFeasibility(tpl, yes);
  assert.equal(ok.professionalReviewRequired, false);
  assert.ok(ok.flags.every((f) => f.level === "ok"));

  const egressNo = screenFeasibility(tpl, {...yes, "fire-egress": "no"});
  assert.equal(egressNo.flags.find((f) => f.topic === "fire-safety").level, "professional_required");
  assert.equal(egressNo.professionalReviewRequired, true);

  const slabUnknown = screenFeasibility(tpl, {...yes, "structure-slab": "unknown"});
  assert.equal(slabUnknown.flags.find((f) => f.topic === "structural").level, "professional_required");

  const zoningNo = screenFeasibility(tpl, {...yes, "zoning-dwelling-use": "no"});
  assert.equal(zoningNo.flags.find((f) => f.topic === "zoning").level, "attention");
  assert.equal(zoningNo.professionalReviewRequired, false);
});

test("concept layouts: two valid alternatives for a 20x20 ft garage", () => {
  const tpl = getConversionTemplate("garage-guest-suite");
  const dims = {widthIn: 240, depthIn: 240};
  const layouts = generateConceptLayouts(tpl, dims);
  assert.equal(layouts.length, 2);
  assert.notEqual(layouts[0].name, layouts[1].name);
  for (const layout of layouts) {
    assert.match(layout.disclosure, /conceptual layout only/i);
    assert.deepEqual(validateConceptLayout(layout, dims), {valid: true, errors: []});
    const zones = layout.items.filter((i) => i.kind === "zone");
    assert.equal(zones.length, tpl.spaces.length);
    assert.deepEqual(zones.map((z) => z.label), tpl.spaces.map((s) => s.label));
    assert.ok(layout.items.some((i) => i.kind === "furniture"), "primary space furnished");
    for (const item of layout.items) {
      assert.ok(item.x >= 0 && item.y >= 0 && item.x + item.width <= dims.widthIn && item.y + item.depth <= dims.depthIn, item.label);
    }
  }
  // Deterministic: same inputs, same geometry.
  assert.deepEqual(generateConceptLayouts(tpl, dims), layouts);
});

test("concept layouts: valid in a smaller room; overlap and bounds are rejected", () => {
  const tpl = getConversionTemplate("bedroom-office");
  const dims = {widthIn: 120, depthIn: 144};
  for (const layout of generateConceptLayouts(tpl, dims)) {
    assert.deepEqual(validateConceptLayout(layout, dims), {valid: true, errors: []});
  }
  const overlapping = {name: "bad", disclosure: "", items: [
    {kind: "zone", label: "A", x: 0, y: 0, width: 100, depth: 100},
    {kind: "zone", label: "B", x: 50, y: 50, width: 100, depth: 100},
  ]};
  const check = validateConceptLayout(overlapping, dims);
  assert.equal(check.valid, false);
  assert.ok(check.errors.some((e) => e.includes("overlap")));
  const outOfBounds = {name: "bad", disclosure: "", items: [
    {kind: "zone", label: "A", x: 100, y: 0, width: 100, depth: 100},
  ]};
  assert.equal(validateConceptLayout(outOfBounds, dims).valid, false);
  assert.throws(() => generateConceptLayouts(tpl, {widthIn: 0, depthIn: 100}), TypeError);
});

/** A complete rate book for a 400 sq ft conversion scope. */
function fullBook() {
  let book = createRateBook();
  book = setRate(book, "demolition", {amountCents: 150000, unit: "lump", source: "Operator planning assumption, confirmed by customer", sourceDate: "2026-11-19", confidence: "sourced"});
  book = setRate(book, "framing", {amountCents: 250, unit: "sqft", source: "Regional cost guide excerpt supplied by operator", sourceDate: "2026-11-01", confidence: "assumption"});
  book = setRate(book, "windows-doors", {amountCents: 45000, unit: "each", source: "Retailer listing captured by customer", sourceDate: "2026-11-18", confidence: "verified"});
  book = setRate(book, "contingency", {amountCents: 20000, unit: "lump", source: "Customer-set planning allowance", sourceDate: "2026-11-19", confidence: "sourced"});
  return book;
}
const REQUIRED = ["demolition", "framing", "windows-doors", "contingency"];

test("rate book: provenance is enforced and unknown categories are rejected", () => {
  assert.deepEqual(createRateBook(), {rates: {}});
  const book = createRateBook();
  assert.throws(() => setRate(book, "demolition", {amountCents: 100, unit: "lump", source: "", sourceDate: "2026-11-19", confidence: "sourced"}), /source/);
  assert.throws(() => setRate(book, "demolition", {amountCents: 100, unit: "lump", source: "x", sourceDate: "2026-11-19", confidence: "guess"}), /confidence/);
  assert.throws(() => setRate(book, "demolition", {amountCents: 100, unit: "hourly", source: "x", sourceDate: "2026-11-19", confidence: "sourced"}), /unit/);
  assert.throws(() => setRate(book, "demolition", {amountCents: -5, unit: "lump", source: "x", sourceDate: "2026-11-19", confidence: "sourced"}), /amountCents/);
  assert.throws(() => setRate(book, "roofing", {amountCents: 100, unit: "lump", source: "x", sourceDate: "2026-11-19", confidence: "sourced"}), /unknown/);
  const updated = setRate(book, "labor", {amountCents: 5000, unit: "lump", source: "Customer's contractor ballpark", sourceDate: "2026-11-19", confidence: "assumption"});
  assert.deepEqual(book, {rates: {}}, "setRate does not mutate its input");
  assert.equal(updated.rates.labor.amountCents, 5000);
  assert.equal(CONVERSION_COST_CATEGORIES.length, 14);
});

test("estimate: fail-closed when any required category lacks a rate", () => {
  let book = createRateBook();
  book = setRate(book, "demolition", {amountCents: 150000, unit: "lump", source: "Operator assumption", sourceDate: "2026-11-19", confidence: "assumption"});
  const est = buildConversionEstimate({areaSqFt: 400, rateBook: book, requiredCategories: REQUIRED});
  assert.equal(est.status, "incomplete");
  assert.deepEqual(est.missing, ["framing", "windows-doors", "contingency"]);
  assert.deepEqual(est.lines, []);
  assert.equal(est.totalCents, null);
  assert.deepEqual(estimateToBudgetLines(est), [], "incomplete estimates export no budget lines");
});

test("estimate: exact sqft/lump/each math, subtotal vs contingency, lowest confidence", () => {
  const est = buildConversionEstimate({
    areaSqFt: 400,
    rateBook: fullBook(),
    requiredCategories: REQUIRED,
    quantities: {"windows-doors": 3},
  });
  assert.equal(est.status, "estimated");
  const byCat = Object.fromEntries(est.lines.map((l) => [l.categoryId, l]));
  assert.equal(byCat.demolition.amountCents, 150000);          // lump
  assert.equal(byCat.framing.amountCents, 250 * 400);          // sqft
  assert.equal(byCat["windows-doors"].amountCents, 45000 * 3); // each × 3
  assert.equal(byCat.contingency.amountCents, 20000);
  assert.equal(est.subtotalCents, 150000 + 100000 + 135000);
  assert.equal(est.totalCents, est.subtotalCents + 20000);
  assert.equal(est.confidence, "assumption", "lowest confidence among used rates");
  assert.equal(est.assumptions.length, 4);
  assert.ok(est.assumptions.some((a) => a.includes("Regional cost guide excerpt") && a.includes("2026-11-01") && a.includes("assumption")));
  assert.ok(est.estimatedAt && !Number.isNaN(Date.parse(est.estimatedAt)));
  assert.match(est.disclaimer, /not quotes/i);
});

test("estimateToBudgetLines: every line passes project-budget validation and summarizes", () => {
  const est = buildConversionEstimate({
    areaSqFt: 400,
    rateBook: fullBook(),
    requiredCategories: REQUIRED,
    quantities: {"windows-doors": 3},
  });
  const lines = estimateToBudgetLines(est);
  assert.equal(lines.length, est.lines.length);
  for (const line of lines) {
    const check = validateBudgetLine(line);
    assert.deepEqual(check, {valid: true, errors: []}, JSON.stringify(line));
    assert.equal(line.estimatedCents, est.lines.find((l) => l.categoryId === line.conversionCategoryId).amountCents);
  }
  // And the exported lines work inside a real project budget end to end.
  const budget = createProjectBudget({totalBudgetCents: 3500000}); // $35,000 demo scenario
  budget.lines = lines;
  const summary = summarizeProjectBudget(budget);
  assert.equal(summary.valid, true);
  assert.equal(summary.estimatedTotalCents, est.totalCents);
  assert.equal(summary.overBudget, false);
});
