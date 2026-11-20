import test from "node:test";
import assert from "node:assert/strict";
import {
  PLAN_DETECTION_STATUS,
  createPlanUpload,
  addPlanRevision,
  confirmPlanDimensions,
  planToRoomGeometry,
} from "../lib/renovision/plan-ingestion.mjs";
import {
  RETAILER_INTEGRATION_STATUS,
  createFurnishRequest,
  proposeFurnishing,
  replaceSelection,
} from "../lib/renovision/furnish.mjs";
import {createManualProduct} from "../lib/renovision/product-catalog.mjs";

const NOW = "2026-11-19T12:00:00.000Z";
const DIGEST = "a".repeat(64);

/* ---------------- plan ingestion ---------------- */

test("plan upload accepts supported media types and preserves the original", () => {
  for (const mediaType of ["application/pdf", "image/png", "image/jpeg", "image/webp"]) {
    const up = createPlanUpload({fileName: "plan", mediaType, sizeBytes: 1024, digest: DIGEST}, NOW);
    assert.equal(up.status, "uploaded");
    assert.equal(up.mediaType, mediaType);
    assert.equal(up.revisions.length, 1);
    assert.equal(up.revisions[0].rev, 1);
    assert.equal(up.revisions[0].original, true);
    assert.equal(up.revisions[0].note, "Original plan preserved");
    assert.equal(up.revisions[0].digest, DIGEST);
    assert.deepEqual(up.extraction, {status: "needs_dimensions", widthIn: null, depthIn: null, source: null});
  }
  assert.equal(PLAN_DETECTION_STATUS.automatedDetection, "NOT_AVAILABLE");
  assert.ok(PLAN_DETECTION_STATUS.reason.length > 0);
});

test("plan upload rejects unsupported media types", () => {
  for (const mediaType of ["text/plain", "image/gif", "application/dwg", ""])
    assert.throws(() => createPlanUpload({fileName: "x", mediaType, sizeBytes: 10, digest: DIGEST}), /unsupported plan mediaType/);
});

test("plan upload id is deterministic from the digest", () => {
  const a = createPlanUpload({fileName: "a.pdf", mediaType: "application/pdf", sizeBytes: 5, digest: DIGEST}, NOW);
  const b = createPlanUpload({fileName: "b.pdf", mediaType: "application/pdf", sizeBytes: 9, digest: DIGEST}, NOW);
  const c = createPlanUpload({fileName: "c.pdf", mediaType: "application/pdf", sizeBytes: 5, digest: "b".repeat(64)}, NOW);
  assert.equal(a.id, b.id);
  assert.notEqual(a.id, c.id);
});

test("plan revisions append and the original stays flagged and untouched", () => {
  const up = createPlanUpload({fileName: "plan.pdf", mediaType: "application/pdf", sizeBytes: 5, digest: DIGEST}, NOW);
  const up2 = addPlanRevision(up, {digest: "c".repeat(64), note: "Corrected north wall"}, NOW);
  const up3 = addPlanRevision(up2, {digest: "d".repeat(64)}, NOW);
  assert.equal(up.revisions.length, 1); // input not mutated
  assert.deepEqual(up3.revisions.map((r) => r.rev), [1, 2, 3]);
  assert.equal(up3.revisions[0].original, true);
  assert.equal(up3.revisions[0].digest, DIGEST);
  assert.equal(up3.revisions[1].original, false);
  assert.equal(up3.revisions[1].note, "Corrected north wall");
  assert.equal(up3.digest, DIGEST); // upload identity stays with the original
});

test("dimension confirmation enforces provenance and positive finite dimensions", () => {
  const up = createPlanUpload({fileName: "plan.pdf", mediaType: "application/pdf", sizeBytes: 5, digest: DIGEST}, NOW);
  assert.throws(() => confirmPlanDimensions(up, {widthIn: 200, depthIn: 144, source: "aerial_estimate"}), /dimension source/);
  assert.throws(() => confirmPlanDimensions(up, {widthIn: 200, depthIn: 144, source: "address_lookup"}), /dimension source/);
  assert.throws(() => confirmPlanDimensions(up, {widthIn: 0, depthIn: 144, source: "user_measured"}), /positive, finite/);
  assert.throws(() => confirmPlanDimensions(up, {widthIn: -3, depthIn: 144, source: "user_measured"}), /positive, finite/);
  assert.throws(() => confirmPlanDimensions(up, {widthIn: 200, depthIn: NaN, source: "plan_stated"}), /positive, finite/);
  assert.throws(() => confirmPlanDimensions(up, {widthIn: Infinity, depthIn: 144, source: "plan_stated"}), /positive, finite/);
  const confirmed = confirmPlanDimensions(up, {widthIn: 200, depthIn: 144, source: "user_measured"});
  assert.deepEqual(confirmed.extraction, {status: "confirmed", widthIn: 200, depthIn: 144, source: "user_measured"});
  assert.equal(up.extraction.status, "needs_dimensions"); // input not mutated
});

test("room geometry is null until dimensions are confirmed", () => {
  const up = createPlanUpload({fileName: "plan.png", mediaType: "image/png", sizeBytes: 5, digest: DIGEST}, NOW);
  assert.equal(planToRoomGeometry(up), null);
  const confirmed = confirmPlanDimensions(up, {widthIn: 200, depthIn: 144, source: "plan_stated"});
  assert.deepEqual(planToRoomGeometry(confirmed), {widthIn: 200, depthIn: 144});
});

/* ---------------- furnish ---------------- */

function makeProduct(input) {
  const r = createManualProduct(input, NOW);
  assert.equal(r.valid, true, JSON.stringify(r.errors));
  return r.product;
}

const VERIFIED = {dimensionSource: "Manufacturer spec sheet", dimensionsVerified: true};
const sofaWarm = makeProduct({productId: "sofa-warm", name: "Warm Modern Sofa", type: "sofa", widthMeters: 2.0, depthMeters: 0.95, styleIds: ["warm-modern"], priceCents: 89900, ...VERIFIED});
const sofaPlain = makeProduct({productId: "sofa-plain", name: "Plain Sofa", type: "sofa", widthMeters: 1.8, depthMeters: 0.9, priceCents: 49900, ...VERIFIED});
const rugPricey = makeProduct({productId: "rug-pricey", name: "Designer Rug", type: "rug", widthMeters: 2.4, depthMeters: 1.7, priceCents: 500000, ...VERIFIED});
const chairCheap = makeProduct({productId: "chair-cheap", name: "Side Chair", type: "chair", widthMeters: 0.6, depthMeters: 0.6, priceCents: 25000, ...VERIFIED});
const chairSwap = makeProduct({productId: "chair-swap", name: "Lounge Chair", type: "chair", widthMeters: 0.65, depthMeters: 0.65, priceCents: 40000, ...VERIFIED});
const lampUnverified = makeProduct({productId: "lamp-unverified", name: "Floor Lamp", type: "lamp", widthMeters: 0.4, depthMeters: 0.4, priceCents: 8000}); // no dimension provenance
const mirrorUnpriced = makeProduct({productId: "mirror-unpriced", name: "Wall Mirror", type: "mirror", widthMeters: 0.8, depthMeters: 0.05, ...VERIFIED}); // priceCents null
const invalidProduct = {productId: "bad-1", name: "Ghost Product"}; // fails catalog validation

const ROOM = {widthIn: 240, depthIn: 180, clearanceIn: 6};
const CATALOG = [sofaPlain, sofaWarm, rugPricey, chairCheap, lampUnverified];

test("furnish request validates quality and budget", () => {
  assert.throws(() => createFurnishRequest({roomId: "room-1", style: "warm-modern", budgetCents: 1000, quality: "luxury"}), /quality/);
  assert.throws(() => createFurnishRequest({roomId: "room-1", style: "warm-modern", budgetCents: 0, quality: "mid"}), /budgetCents/);
  assert.throws(() => createFurnishRequest({roomId: "room-1", style: "warm-modern", budgetCents: -5, quality: "mid"}), /budgetCents/);
  assert.throws(() => createFurnishRequest({roomId: "room-1", style: "warm-modern", budgetCents: 10.5, quality: "mid"}), /budgetCents/);
  const noBudget = createFurnishRequest({roomId: "room-1", style: "warm-modern", budgetCents: null, quality: "value"});
  assert.equal(noBudget.budgetCents, null);
});

test("proposal respects the budget, prefers the style match, and notes over-budget skips", () => {
  const request = createFurnishRequest({roomId: "room-1", style: "warm-modern", budgetCents: 150000, quality: "mid"});
  const proposal = proposeFurnishing({request, products: CATALOG, room: ROOM});
  assert.equal(proposal.status, "proposed");
  assert.deepEqual(proposal.request, request);
  const ids = proposal.selections.map((s) => s.productId);
  assert.ok(ids.includes("sofa-warm")); // style match preferred over the cheaper plain sofa
  assert.ok(!ids.includes("sofa-plain"));
  assert.ok(ids.includes("chair-cheap"));
  assert.ok(proposal.totalCents <= 150000);
  assert.equal(proposal.totalCents, 89900 + 25000 + 8000);
  assert.equal(proposal.remainingCents, 150000 - proposal.totalCents);
  assert.deepEqual(proposal.skippedOverBudget, ["rug-pricey"]);
  assert.deepEqual(proposal.unfilledCategories, ["rug"]);
});

test("products with unverified dimensions get fit unknown, never fits", () => {
  const request = createFurnishRequest({roomId: "room-1", style: "warm-modern", budgetCents: 150000, quality: "mid"});
  const proposal = proposeFurnishing({request, products: CATALOG, room: ROOM});
  const lamp = proposal.selections.find((s) => s.productId === "lamp-unverified");
  assert.equal(lamp.fit.status, "unknown");
  assert.notEqual(lamp.fit.status, "fits");
  assert.ok(lamp.flags.includes("dimensions_unverified"));
  const sofa = proposal.selections.find((s) => s.productId === "sofa-warm");
  assert.equal(sofa.fit.status, "fits");
  assert.equal(sofa.fit.verified, false); // a fit screen is never a verification
  assert.equal(sofa.fit.fieldVerificationRequired, true);
});

test("without a budget, totals are reported and remaining is null", () => {
  const request = createFurnishRequest({roomId: "room-1", style: "warm-modern", budgetCents: null, quality: "mid"});
  const proposal = proposeFurnishing({request, products: CATALOG, room: ROOM});
  assert.equal(proposal.remainingCents, null);
  assert.deepEqual(proposal.skippedOverBudget, []);
  assert.ok(proposal.selections.some((s) => s.productId === "rug-pricey"));
  assert.equal(proposal.totalCents, 89900 + 500000 + 25000 + 8000);
});

test("invalid catalog products are excluded from proposals", () => {
  const request = createFurnishRequest({roomId: "room-1", style: "warm-modern", budgetCents: null, quality: "mid"});
  const proposal = proposeFurnishing({request, products: [...CATALOG, invalidProduct], room: ROOM});
  assert.ok(!proposal.selections.some((s) => s.productId === "bad-1"));
  assert.ok(proposal.notes.some((n) => n.includes("excluded")));
});

test("an unpriced selection makes the total honestly null", () => {
  const request = createFurnishRequest({roomId: "room-1", style: "warm-modern", budgetCents: 150000, quality: "mid"});
  const proposal = proposeFurnishing({request, products: [chairCheap, mirrorUnpriced], room: ROOM});
  assert.ok(proposal.selections.some((s) => s.productId === "mirror-unpriced"));
  assert.equal(proposal.totalCents, null);
  assert.equal(proposal.remainingCents, null);
  assert.ok(proposal.notes.some((n) => n.includes("never estimated")));
});

test("replaceSelection swaps the product and recalculates totals and fit", () => {
  const request = createFurnishRequest({roomId: "room-1", style: "warm-modern", budgetCents: null, quality: "mid"});
  const proposal = proposeFurnishing({request, products: [sofaWarm, chairCheap], room: ROOM});
  const before = proposal.totalCents;
  const swapped = replaceSelection(proposal, "chair-cheap", chairSwap, ROOM);
  assert.ok(swapped.selections.some((s) => s.productId === "chair-swap"));
  assert.ok(!swapped.selections.some((s) => s.productId === "chair-cheap"));
  assert.equal(swapped.totalCents, before - 25000 + 40000);
  const chair = swapped.selections.find((s) => s.productId === "chair-swap");
  assert.equal(chair.fit.status, "fits"); // fit recalculated for the replacement
  assert.equal(proposal.totalCents, before); // original proposal untouched
  assert.throws(() => replaceSelection(proposal, "not-selected", chairSwap, ROOM), /not part of this proposal/);
  assert.throws(() => replaceSelection(proposal, "chair-cheap", invalidProduct, ROOM), /failed catalog validation/);
});

test("retailer integration status is UNAVAILABLE for every named retailer", () => {
  const request = createFurnishRequest({roomId: "room-1", style: "warm-modern", budgetCents: null, quality: "mid"});
  const proposal = proposeFurnishing({request, products: CATALOG, room: ROOM});
  assert.deepEqual(proposal.retailerStatus, RETAILER_INTEGRATION_STATUS);
  for (const key of ["wayfair", "walmart", "ikea", "target", "homeDepot"])
    assert.equal(RETAILER_INTEGRATION_STATUS[key], "UNAVAILABLE");
  assert.ok(RETAILER_INTEGRATION_STATUS.reason.length > 0);
});
