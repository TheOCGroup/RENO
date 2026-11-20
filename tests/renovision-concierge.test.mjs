import {test} from "node:test";
import assert from "node:assert/strict";
import {
  CONCIERGE_CAPABILITIES, CONVERSION_TYPES,
  createConciergeContext, parseIntent, recordDecision, applyIntent,
  nextActions, explainTradeoffs,
} from "../lib/renovision/concierge.mjs";
import {
  PROPERTY_PROVENANCE, PROPERTY_INTEGRATION_STATUS,
  createPropertyProfile, setPropertyFact, summarizePropertyProfile,
} from "../lib/renovision/property-profile.mjs";
import {DESIGN_STYLES, getDesignStyle} from "../lib/renovision/design-library.mjs";

const DEMO = "I have a two-car garage and want to convert it into a one-bedroom guest suite with a bathroom. My renovation budget is $35,000. I want a warm modern design.";

/* ---------------- capabilities honesty ---------------- */

test("concierge capabilities are honestly labeled: guided rules, no LLM, voice unavailable", () => {
  assert.equal(CONCIERGE_CAPABILITIES.mode, "guided-rules");
  assert.equal(CONCIERGE_CAPABILITIES.llm, false);
  assert.equal(CONCIERGE_CAPABILITIES.voice, "UNAVAILABLE");
  assert.match(CONCIERGE_CAPABILITIES.description, /not a large language model/i);
});

/* ---------------- intent parsing: founder demo ---------------- */

test("founder demo sentence parses to the garage guest-suite conversion", () => {
  const intent = parseIntent(DEMO);
  assert.equal(intent.objective, "conversion");
  assert.equal(intent.conversionType, "garage-guest-suite");
  assert.equal(intent.budgetCents, 3500000);
  assert.ok(getDesignStyle(intent.style), "style must be a real design-library style id, got: " + intent.style);
  assert.equal(intent.style, "modern-organic");
  assert.ok(intent.rooms.includes("garage"));
  assert.ok(intent.rooms.includes("bathroom"));
  assert.equal(intent.raw, DEMO);
});

test("every conversion id the parser can emit is a declared conversion type", () => {
  const samples = [
    "Convert my garage into a guest suite",
    "Turn the basement into a rental apartment",
    "Finish the attic as a bedroom",
    "Convert my spare bedroom into a home office",
    "I want an open-plan space, combine the two rooms",
    "Convert this commercial space into a cafe",
    "Reconfigure the kitchen layout and move the sink",
    "Enlarge and reconfigure the bathroom layout",
  ];
  for (const s of samples) {
    const intent = parseIntent(s);
    assert.ok(CONVERSION_TYPES.includes(intent.conversionType), s + " -> " + intent.conversionType);
    assert.equal(intent.objective, "conversion", s);
  }
});

test("furnish and renovation objectives are distinguished from conversions", () => {
  const furnish = parseIntent("Furnish my bedroom with new furniture, please.");
  assert.equal(furnish.objective, "furnish");
  assert.equal(furnish.conversionType, null);
  const reno = parseIntent("I want to remodel my kitchen.");
  assert.equal(reno.objective, "renovation");
  assert.equal(reno.conversionType, null);
  const unknown = parseIntent("Hello, just looking around.");
  assert.equal(unknown.objective, "unknown");
  assert.equal(unknown.conversionType, null);
  assert.equal(unknown.style, null);
  assert.equal(unknown.budgetCents, null);
  assert.deepEqual(unknown.rooms, []);
});

test("parsed styles always resolve to design-library styles", () => {
  for (const s of ["a Scandinavian living room", "make it Japandi", "Art Deco powder room", "warm modern", "mid-century modern"]) {
    const intent = parseIntent("I want " + s + " style.");
    assert.ok(intent.style === null || DESIGN_STYLES.some((d) => d.id === intent.style), s + " -> " + intent.style);
  }
});

/* ---------------- money parsing ---------------- */

test("money formats parse to exact cents", () => {
  assert.equal(parseIntent("My budget is $35,000.").budgetCents, 3500000);
  assert.equal(parseIntent("My budget is $35k.").budgetCents, 3500000);
  assert.equal(parseIntent("My budget is 35000.").budgetCents, 3500000);
  assert.equal(parseIntent("Budget: 35000 dollars.").budgetCents, 3500000);
  assert.equal(parseIntent("Around $1,250.50 for this.").budgetCents, 125050);
  assert.equal(parseIntent("No money mentioned here.").budgetCents, null);
});

/* ---------------- context, decisions, guidance ---------------- */

test("context lifecycle: create, record, apply — immutably", () => {
  const ctx = createConciergeContext("proj-1");
  assert.equal(ctx.projectId, "proj-1");
  assert.equal(ctx.objective, null);
  assert.equal(ctx.stage, "describe");
  assert.deepEqual(ctx.decisions, []);

  const withStyle = recordDecision(ctx, "style", "coastal", "customer");
  assert.equal(withStyle.style, "coastal");
  assert.equal(ctx.style, null, "recordDecision must not mutate the input context");
  assert.equal(ctx.decisions.length, 0);
  assert.equal(withStyle.decisions.length, 1);
  assert.equal(withStyle.decisions[0].source, "customer");
  assert.ok(!withStyle.missing.includes("style"));

  const applied = applyIntent(createConciergeContext("proj-2"), parseIntent(DEMO));
  assert.equal(applied.objective, "conversion");
  assert.equal(applied.conversionType, "garage-guest-suite");
  assert.equal(applied.budgetCents, 3500000);
  assert.equal(applied.style, "modern-organic");
  assert.equal(applied.stage, "discover");
  assert.ok(applied.decisions.every((d) => d.source === "customer"));
  assert.ok(!applied.missing.includes("objective"));
  assert.ok(!applied.missing.includes("budget"));
});

test("recordDecision rejects invented vocabulary and bad money", () => {
  const ctx = createConciergeContext("proj-3");
  assert.throws(() => recordDecision(ctx, "budgetCents", -100, "customer"), /non-negative integer/);
  assert.throws(() => recordDecision(ctx, "budgetCents", 10.5, "customer"), /non-negative integer/);
  assert.throws(() => recordDecision(ctx, "style", "not-a-style", "customer"), /unknown design style/);
  assert.throws(() => recordDecision(ctx, "conversionType", "castle-moat", "customer"), /unknown conversionType/);
  assert.throws(() => recordDecision(ctx, "objective", "demolish", "customer"), /unknown objective/);
});

test("nextActions derives only genuinely-missing steps from state", () => {
  const fresh = createConciergeContext("proj-4");
  const first = nextActions(fresh);
  assert.equal(first.length, 1);
  assert.equal(first[0].id, "clarify-objective");

  const applied = applyIntent(fresh, parseIntent(DEMO));
  const ids = nextActions(applied).map((a) => a.id);
  assert.ok(ids.includes("confirm-measurements"), "conversion without measurements must ask for them");
  assert.ok(ids.includes("run-feasibility-screen"), "unscreened conversion must be screened");
  assert.ok(ids.includes("confirm-estimate-rates"));
  assert.ok(!ids.includes("set-budget"), "budget was recorded by the intent");
  assert.ok(!ids.includes("choose-style"), "style was recorded by the intent");
  for (const a of nextActions(applied)) {
    assert.ok(a.label && a.reason && a.stage, "every action carries label, reason and stage");
  }

  let progressed = recordDecision(applied, "measurements", {widthIn: 240, depthIn: 200, source: "user_supplied"}, "customer");
  progressed = recordDecision(progressed, "feasibility", {screened: true}, "concierge");
  const later = nextActions(progressed).map((a) => a.id);
  assert.ok(!later.includes("confirm-measurements"));
  assert.ok(!later.includes("run-feasibility-screen"));
});

/* ---------------- trade-off explanations: honesty ---------------- */

test("explainTradeoffs with no estimate presents no figures at all", () => {
  const applied = applyIntent(createConciergeContext("proj-5"), parseIntent(DEMO));
  const lines = explainTradeoffs(applied, null);
  assert.ok(lines.length >= 2);
  assert.ok(!/\$\d/.test(lines.join(" ")), "no dollar figures may appear when there is no estimate: " + lines.join(" | "));
  assert.match(lines.join(" "), /does not invent prices/);
});

test("explainTradeoffs with an incomplete estimate names the missing scope and no total", () => {
  const applied = applyIntent(createConciergeContext("proj-6"), parseIntent(DEMO));
  const lines = explainTradeoffs(applied, {complete: false, totalCents: null, missingCategories: ["plumbing", "electrical"]});
  const joined = lines.join(" ");
  assert.match(joined, /plumbing/);
  assert.match(joined, /electrical/);
  assert.ok(!/\$\d/.test(joined), "an incomplete estimate must not present figures: " + joined);
});

test("explainTradeoffs compares a complete estimate against the recorded budget using only its numbers", () => {
  const applied = applyIntent(createConciergeContext("proj-7"), parseIntent(DEMO));
  const under = explainTradeoffs(applied, {
    complete: true, totalCents: 3200000, confidence: "low",
    lines: [{category: "plumbing", amountCents: 900000}, {category: "framing", amountCents: 500000}],
    assumptions: ["labor rate"],
  }).join(" ");
  assert.match(under, /\$32,000\.00/);
  assert.match(under, /\$35,000\.00/);
  assert.match(under, /under your recorded budget/);
  assert.match(under, /plumbing/);
  assert.match(under, /confidence is low/);

  const over = explainTradeoffs(applied, {complete: true, totalCents: 4000000}).join(" ");
  assert.match(over, /\$40,000\.00/);
  assert.match(over, /over your recorded budget/);
});

/* ---------------- property profile ---------------- */

test("property profile starts unknown and records user-supplied facts with provenance", () => {
  const profile = createPropertyProfile("123 Main St, Wichita, KS");
  assert.equal(profile.address, "123 Main St, Wichita, KS");
  assert.equal(profile.facts.bedrooms, null);
  assert.equal(profile.provenance.bedrooms, "unknown");

  const updated = setPropertyFact(profile, "bedrooms", 3, "user_supplied");
  assert.equal(updated.facts.bedrooms, 3);
  assert.equal(updated.provenance.bedrooms, "user_supplied");
  assert.equal(profile.facts.bedrooms, null, "setPropertyFact must not mutate the input profile");

  const estimated = setPropertyFact(updated, "areaSqFt", 1450, "estimate");
  assert.equal(estimated.provenance.areaSqFt, "estimate");

  const cleared = setPropertyFact(estimated, "bedrooms", null, "unknown");
  assert.equal(cleared.facts.bedrooms, null);
  assert.equal(cleared.provenance.bedrooms, "unknown");
});

test("verified_record provenance is refused while the integration is UNAVAILABLE (fail-closed)", () => {
  assert.equal(PROPERTY_INTEGRATION_STATUS.propertyRecords, "UNAVAILABLE");
  assert.equal(PROPERTY_INTEGRATION_STATUS.geocoding, "UNAVAILABLE");
  const profile = createPropertyProfile("456 Oak Ave");
  assert.throws(() => setPropertyFact(profile, "bedrooms", 3, "verified_record"), /UNAVAILABLE/);
  assert.throws(() => setPropertyFact(profile, "yearBuilt", 1998, "verified_record"), /UNAVAILABLE/);
});

test("property profile rejects unknown keys, unknown provenance and invalid values", () => {
  const profile = createPropertyProfile("789 Pine Rd");
  assert.throws(() => setPropertyFact(profile, "lotSizeAcres", 1, "user_supplied"), /unknown property fact/);
  assert.throws(() => setPropertyFact(profile, "bedrooms", 3, "county_records"), /unknown provenance/);
  assert.throws(() => setPropertyFact(profile, "bedrooms", -1, "user_supplied"), /non-negative integer/);
  assert.throws(() => setPropertyFact(profile, "areaSqFt", -5, "estimate"), /positive number/);
  assert.throws(() => setPropertyFact(profile, "yearBuilt", 1200, "user_supplied"), /yearBuilt/);
  assert.ok(PROPERTY_PROVENANCE.includes("user_supplied"));
});

test("summarizePropertyProfile reports facts, unknowns and the integration status", () => {
  let profile = createPropertyProfile("321 Elm St");
  profile = setPropertyFact(profile, "bedrooms", 4, "user_supplied");
  profile = setPropertyFact(profile, "yearBuilt", 1975, "user_supplied");
  const summary = summarizePropertyProfile(profile);
  assert.equal(summary.facts.length, 5);
  assert.equal(summary.facts.find((f) => f.key === "bedrooms").value, 4);
  assert.equal(summary.facts.find((f) => f.key === "bedrooms").provenance, "user_supplied");
  assert.deepEqual(new Set(summary.unknowns), new Set(["areaSqFt", "bathrooms", "floorPlanRef"]));
  assert.equal(summary.integrationStatus.propertyRecords, "UNAVAILABLE");
  assert.match(summary.integrationStatus.reason, /nothing is inferred/i);
});
