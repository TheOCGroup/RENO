import {test} from "node:test";
import assert from "node:assert/strict";
import {FIT_TIERS, FIT_RULES, FIT_TOLERANCE_IN, assessFit} from "../lib/renovision/fit-tiers.mjs";
import {
  DEAL_SCOUT_INTEGRATION, SCOPE_FORMAT,
  validateDealScoutScope, importDealScoutScope, summarizeScope,
} from "../lib/renovision/deal-scout-contract.mjs";

/* ---------------- fit tiers ---------------- */

const ROOM = {widthIn: 120, depthIn: 120, clearanceIn: 0, confirmed: true};
const verifiedProduct = (over = {}) => ({
  productId: "p1", name: "Sofa", type: "sofa",
  widthMeters: 1.0, depthMeters: 0.5,
  dimensionSource: "manufacturer spec sheet", dimensionsVerified: true,
  ...over,
});

test("FIT_TIERS and FIT_RULES document the evidence model honestly", () => {
  assert.deepEqual([...FIT_TIERS], ["VERIFIED_FIT", "POTENTIAL_FIT", "UNKNOWN", "DOES_NOT_FIT"]);
  assert.equal(FIT_RULES.toleranceIn, FIT_TOLERANCE_IN);
  for (const tier of FIT_TIERS) assert.equal(typeof FIT_RULES.tiers[tier], "string", tier + " documented");
  assert.match(FIT_RULES.note, /not building-code certification/);
});

test("verified dims + confirmed room + fits -> VERIFIED_FIT", () => {
  const r = assessFit({product: verifiedProduct(), room: ROOM});
  assert.equal(r.tier, "VERIFIED_FIT");
  assert.deepEqual(r.provenance, {dimensions: "verified", roomGeometry: "confirmed"});
  assert.ok(r.reasons.length >= 1);
});

test("verified dims + too large in both orientations -> DOES_NOT_FIT", () => {
  const r = assessFit({product: verifiedProduct({widthMeters: 3.0, depthMeters: 2.5}), room: {widthIn: 100, depthIn: 100, clearanceIn: 0, confirmed: true}});
  assert.equal(r.tier, "DOES_NOT_FIT");
  assert.equal(r.provenance.dimensions, "verified");
});

test("unverified dims + fits -> POTENTIAL_FIT (recorded-unverified)", () => {
  const noProvenance = assessFit({product: verifiedProduct({dimensionSource: null, dimensionsVerified: false}), room: ROOM});
  assert.equal(noProvenance.tier, "POTENTIAL_FIT");
  assert.equal(noProvenance.provenance.dimensions, "recorded-unverified");
  // A dimensionSource alone, without the verified flag, is still only
  // recorded-unverified under the catalog convention.
  const sourceOnly = assessFit({product: verifiedProduct({dimensionsVerified: false}), room: ROOM});
  assert.equal(sourceOnly.tier, "POTENTIAL_FIT");
  assert.equal(sourceOnly.provenance.dimensions, "recorded-unverified");
  // The flag without a source is not verified either (catalog rejects it).
  const flagOnly = assessFit({product: verifiedProduct({dimensionSource: null}), room: ROOM});
  assert.equal(flagOnly.tier, "POTENTIAL_FIT");
  assert.equal(flagOnly.provenance.dimensions, "recorded-unverified");
});

test("missing or non-positive dims -> UNKNOWN", () => {
  for (const product of [{}, {widthMeters: 1.0}, {widthMeters: 0, depthMeters: 0.5}, {widthMeters: -1, depthMeters: 0.5}, null]) {
    const r = assessFit({product, room: ROOM});
    assert.equal(r.tier, "UNKNOWN", JSON.stringify(product));
    assert.equal(r.provenance.dimensions, "missing");
  }
});

test("unconfirmed room + verified product -> UNKNOWN", () => {
  for (const room of [{...ROOM, confirmed: false}, {widthIn: 120, depthIn: 120, clearanceIn: 0}, null]) {
    const r = assessFit({product: verifiedProduct(), room});
    assert.equal(r.tier, "UNKNOWN");
    assert.equal(r.provenance.roomGeometry, "unconfirmed");
    assert.equal(r.provenance.dimensions, "verified");
  }
});

test("rotation saves a fit: wide product, narrow room -> not DOES_NOT_FIT", () => {
  // 2.0m wide (78.7in) x 0.4m deep (15.7in): fails as-is across a 60in
  // width, fits rotated into the 100in depth.
  const r = assessFit({product: verifiedProduct({widthMeters: 2.0, depthMeters: 0.4}), room: {widthIn: 60, depthIn: 100, clearanceIn: 0, confirmed: true}});
  assert.notEqual(r.tier, "DOES_NOT_FIT");
  assert.equal(r.tier, "VERIFIED_FIT");
  assert.match(r.reasons.join(" "), /rotated 90°/);
});

test("clearance makes a borderline product not fit", () => {
  const product = verifiedProduct({widthMeters: 2.9, depthMeters: 0.3}); // 114.2in x 11.8in
  const room = {widthIn: 120, depthIn: 120, clearanceIn: 0, confirmed: true};
  assert.equal(assessFit({product, room}).tier, "VERIFIED_FIT");
  const withClearance = assessFit({product, room: {...room, clearanceIn: 6}});
  assert.equal(withClearance.tier, "DOES_NOT_FIT");
});

/* ---------------- Deal Scout contract ---------------- */

const NOW = "2026-11-19T18:00:00.000Z";
const validDoc = () => ({
  format: SCOPE_FORMAT,
  source: "deal-scout",
  version: "2026-11-19",
  exportedAt: "2026-11-19T15:30:00.000Z",
  items: [
    {id: "ds-1", label: "Kitchen demolition", category: "demolition", estimatedCents: 450000},
    {id: "ds-2", label: "Plumbing rough-in", category: "plumbing", estimatedCents: null},
    {id: "ds-3", label: "Electrical panel upgrade", category: "electrical", estimatedCents: 275000},
  ],
});

test("integration status is honestly UNAVAILABLE with manual import only", () => {
  assert.equal(DEAL_SCOUT_INTEGRATION.status, "UNAVAILABLE");
  assert.equal(DEAL_SCOUT_INTEGRATION.mode, "manual-import");
  assert.match(DEAL_SCOUT_INTEGRATION.note, /No live Deal Scout connection exists/);
  assert.equal(SCOPE_FORMAT, "renovision-deal-scout-scope/v1");
});

test("valid scope validates and imports with provenance", () => {
  const doc = validDoc();
  assert.deepEqual(validateDealScoutScope(doc), {valid: true, errors: []});
  const scope = importDealScoutScope(doc, NOW);
  assert.equal(scope.format, SCOPE_FORMAT);
  assert.equal(scope.source, "deal-scout");
  assert.equal(scope.version, "2026-11-19");
  assert.equal(scope.exportedAt, doc.exportedAt);
  assert.equal(scope.importedAt, NOW);
  assert.deepEqual(scope.provenance, {source: "deal-scout", importedVia: "manual-import", integrationStatus: "UNAVAILABLE"});
  assert.deepEqual(scope.items, doc.items);
});

test("wrong source is rejected (provenance integrity)", () => {
  const doc = {...validDoc(), source: "renovision"};
  const check = validateDealScoutScope(doc);
  assert.equal(check.valid, false);
  assert.ok(check.errors.some((e) => /source/.test(e)));
  assert.throws(() => importDealScoutScope(doc, NOW), (err) => Array.isArray(err.errors) && err.errors.length > 0);
});

test("wrong format is rejected", () => {
  const doc = {...validDoc(), format: "renovision-deal-scout-scope/v2"};
  assert.equal(validateDealScoutScope(doc).valid, false);
  assert.throws(() => importDealScoutScope(doc, NOW), /deal_scout_scope_invalid/);
});

test("negative or fractional estimatedCents rejected; null accepted", () => {
  const negative = validDoc(); negative.items[0].estimatedCents = -5;
  assert.equal(validateDealScoutScope(negative).valid, false);
  const fractional = validDoc(); fractional.items[0].estimatedCents = 10.5;
  assert.equal(validateDealScoutScope(fractional).valid, false);
  const unpriced = validDoc(); unpriced.items.forEach((i) => { i.estimatedCents = null; });
  assert.equal(validateDealScoutScope(unpriced).valid, true);
});

test("duplicate item ids are rejected", () => {
  const doc = validDoc(); doc.items[1].id = "ds-1";
  const check = validateDealScoutScope(doc);
  assert.equal(check.valid, false);
  assert.ok(check.errors.some((e) => /duplicat/.test(e)));
});

test("empty items, bad version and bad exportedAt are rejected", () => {
  assert.equal(validateDealScoutScope({...validDoc(), items: []}).valid, false);
  assert.equal(validateDealScoutScope({...validDoc(), version: ""}).valid, false);
  assert.equal(validateDealScoutScope({...validDoc(), exportedAt: "not a date"}).valid, false);
  assert.equal(validateDealScoutScope(null).valid, false);
});

test("summarizeScope reports partial totals honestly", () => {
  const summary = summarizeScope(importDealScoutScope(validDoc(), NOW));
  assert.equal(summary.itemCount, 3);
  assert.deepEqual(summary.categories, ["demolition", "plumbing", "electrical"]);
  assert.equal(summary.knownTotalCents, 725000);
  assert.equal(summary.unpricedCount, 1);
  assert.equal(summary.totalIsComplete, false);
  const priced = validDoc(); priced.items[1].estimatedCents = 100000;
  const full = summarizeScope(importDealScoutScope(priced, NOW));
  assert.equal(full.knownTotalCents, 825000);
  assert.equal(full.unpricedCount, 0);
  assert.equal(full.totalIsComplete, true);
});

test("imported scope is a deep clone of the supplied document", () => {
  const doc = validDoc();
  const scope = importDealScoutScope(doc, NOW);
  doc.items[0].label = "MUTATED";
  doc.items[0].estimatedCents = 1;
  doc.items.push({id: "ds-4", label: "Late addition", category: "finishes", estimatedCents: 5});
  doc.version = "9999";
  assert.equal(scope.items[0].label, "Kitchen demolition");
  assert.equal(scope.items[0].estimatedCents, 450000);
  assert.equal(scope.items.length, 3);
  assert.equal(scope.version, "2026-11-19");
});
