import {test} from "node:test";
import assert from "node:assert/strict";
import {
  createRoomLayout, validateRoomLayout, evaluateRoomLayout, openingZoneMeters,
  effectiveFootprint, addLayoutItem, moveLayoutItem, rotateLayoutItem,
  removeLayoutItem, duplicateLayoutItem, duplicateRoomLayout, compareRoomLayouts,
} from "../lib/renovision/room-layout.mjs";
import {
  DESIGN_STYLES, DESIGN_MATERIALS, DESIGN_CATEGORIES,
  listDesignStyles, listDesignMaterials, listDesignPalettes, listRoomCollections,
  compareDesignMaterials, searchDesignLibrary,
} from "../lib/renovision/design-library.mjs";
import {
  validateCatalogProduct, createManualProduct, productFreshness,
  searchCatalog, compareCatalogProducts, buildShoppingList,
} from "../lib/renovision/product-catalog.mjs";
import {
  BUDGET_CATEGORIES, createProjectBudget, validateProjectBudget,
  summarizeProjectBudget, compareBudgetOptions,
} from "../lib/renovision/project-budget.mjs";

/* ---------------- room layout ---------------- */

const baseLayout = () => {
  const l = createRoomLayout({layoutId: "L1", name: "Main", roomId: "room-1", widthMeters: 5, depthMeters: 4});
  l.openings.push({id: "door-1", kind: "door", wall: "north", offsetMeters: 0.5, widthMeters: 0.9, swing: {hinge: "start", direction: "in"}});
  l.openings.push({id: "win-1", kind: "window", wall: "east", offsetMeters: 1, widthMeters: 1.5});
  l.obstacles.push({id: "fp-1", kind: "fireplace", xMeters: 2, yMeters: 0, widthMeters: 1.2, depthMeters: 0.5});
  l.walkways.push({id: "wk-1", xMeters: 0.5, yMeters: 1.5, widthMeters: 3, depthMeters: 0.9, minimumWidthMeters: 0.9});
  return l;
};

test("layout: valid layout passes structural validation", () => {
  assert.equal(validateRoomLayout(baseLayout()).valid, true);
});

test("layout: opening beyond its wall is rejected", () => {
  const l = baseLayout();
  l.openings.push({id: "win-2", kind: "window", wall: "north", offsetMeters: 4.5, widthMeters: 1});
  const v = validateRoomLayout(l);
  assert.equal(v.valid, false);
  assert.ok(v.errors.some((e) => e.includes("win-2")));
});

test("layout: non-right-angle rotation is rejected, never approximated", () => {
  const l = addLayoutItem(baseLayout(), {id: "sofa", xMeters: 1, yMeters: 2, widthMeters: 2, depthMeters: 0.9, rotationDeg: 45});
  assert.equal(validateRoomLayout(l).valid, false);
});

test("layout: rotated footprint swaps width and depth at 90 degrees", () => {
  const f = effectiveFootprint({widthMeters: 2, depthMeters: 0.9, rotationDeg: 90});
  assert.deepEqual(f, {widthMeters: 0.9, depthMeters: 2});
  const f0 = effectiveFootprint({widthMeters: 2, depthMeters: 0.9, rotationDeg: 180});
  assert.deepEqual(f0, {widthMeters: 2, depthMeters: 0.9});
});

test("layout: door swing zone is the conservative square inside the room", () => {
  const l = baseLayout();
  const zone = openingZoneMeters(l, l.openings[0]);
  assert.deepEqual(zone, {left: 0.5, top: 0, right: 1.4, bottom: 0.9});
  const out = {...l.openings[0], swing: {hinge: "start", direction: "out"}};
  assert.equal(openingZoneMeters(l, out), null);
});

test("layout: diagnostics flag swing intrusion, obstacle overlap, walkway intrusion, out-of-bounds", () => {
  let l = baseLayout();
  l = addLayoutItem(l, {id: "chair-swing", xMeters: 0.6, yMeters: 0.2, widthMeters: 0.5, depthMeters: 0.5}); // in door swing
  l = addLayoutItem(l, {id: "sofa-fp", xMeters: 2.1, yMeters: 0.1, widthMeters: 1, depthMeters: 0.4}); // overlaps fireplace
  l = addLayoutItem(l, {id: "table-wk", xMeters: 1, yMeters: 1.6, widthMeters: 0.8, depthMeters: 0.6}); // in walkway
  l = addLayoutItem(l, {id: "shelf-oob", xMeters: 4.6, yMeters: 3, widthMeters: 0.8, depthMeters: 0.4}); // out of bounds (4.6+0.8>5)
  const r = evaluateRoomLayout(l);
  assert.equal(r.valid, true);
  assert.equal(r.verified, false);
  const byId = Object.fromEntries(r.items.map((i) => [i.id, i]));
  assert.ok(byId["chair-swing"].issues.includes("intrudes_door_swing"));
  assert.ok(byId["sofa-fp"].issues.some((i) => i.startsWith("overlaps_obstacle")));
  assert.ok(byId["table-wk"].issues.includes("intrudes_walkway"));
  assert.ok(byId["shelf-oob"].issues.includes("outside_room_bounds"));
  assert.equal(r.summary.conflictCount, 4);
});

test("layout: clean placement reports no_conflict_detected and stays unverified", () => {
  const l = addLayoutItem(baseLayout(), {id: "rug-1", xMeters: 1.2, yMeters: 2.6, widthMeters: 1.6, depthMeters: 1.1});
  const r = evaluateRoomLayout(l);
  assert.equal(r.items[0].status, "no_conflict_detected");
  assert.equal(r.fieldVerificationRequired, true);
  // 0.3m from the south wall: advisory only, never a conflict by itself.
  assert.ok(r.items[0].advisories.includes("wall_clearance_below_stated_minimum"));
});

test("layout: overlapping furniture pair is flagged on both items", () => {
  let l = baseLayout();
  l = addLayoutItem(l, {id: "a", xMeters: 3.4, yMeters: 2.8, widthMeters: 1, depthMeters: 0.8});
  l = addLayoutItem(l, {id: "b", xMeters: 3.8, yMeters: 3, widthMeters: 1, depthMeters: 0.8});
  const r = evaluateRoomLayout(l);
  assert.ok(r.items.every((i) => i.issues.includes("overlaps_furniture")));
});

test("layout: operations are pure and duplicate/rotate/move/remove compose", () => {
  const l0 = baseLayout();
  const l1 = addLayoutItem(l0, {id: "desk", xMeters: 3.5, yMeters: 0.8, widthMeters: 1.4, depthMeters: 0.6});
  assert.equal(l0.items.length, 0);
  const l2 = duplicateLayoutItem(l1, "desk", "desk-copy");
  assert.equal(l2.items.length, 2);
  const l3 = rotateLayoutItem(l2, "desk");
  assert.equal(l3.items.find((i) => i.id === "desk").rotationDeg, 90);
  const l4 = moveLayoutItem(l3, "desk", 3.4, 0.9);
  assert.equal(l4.items.find((i) => i.id === "desk").xMeters, 3.4);
  const l5 = removeLayoutItem(l4, "desk-copy");
  assert.equal(l5.items.length, 1);
  const whole = duplicateRoomLayout(l5, {layoutId: "L2", name: "Alt"});
  assert.equal(whole.layoutId, "L2");
  assert.equal(whole.items.length, 1);
});

test("layout: comparison reports shared and unique items", () => {
  const a = addLayoutItem(baseLayout(), {id: "shared", xMeters: 1, yMeters: 2.6, widthMeters: 1, depthMeters: 0.6});
  let b = addLayoutItem(baseLayout(), {id: "shared", xMeters: 1, yMeters: 2.6, widthMeters: 1, depthMeters: 0.6});
  b = addLayoutItem(b, {id: "b-only", xMeters: 3.5, yMeters: 2.8, widthMeters: 0.8, depthMeters: 0.5});
  const c = compareRoomLayouts(a, b);
  assert.equal(c.valid, true);
  assert.deepEqual(c.itemsOnlyInB, ["b-only"]);
  assert.deepEqual(c.itemsInBoth, ["shared"]);
});

/* ---------------- design library ---------------- */

test("library: exactly the 20 directive styles and 13 categories", () => {
  assert.equal(DESIGN_STYLES.length, 20);
  assert.equal(DESIGN_CATEGORIES.length, 13);
  assert.equal(listDesignStyles().length, 20);
  for (const name of ["Japandi", "Art Deco", "Southwestern", "Maximalist", "French country"])
    assert.ok(DESIGN_STYLES.some((s) => s.name === name), name);
});

test("library: materials cover the directive list and filter by category", () => {
  for (const name of ["Hardwood", "Luxury vinyl", "Quartz", "Marble", "Granite", "Concrete", "Wallpaper", "Plaster", "Leather"])
    assert.ok(DESIGN_MATERIALS.some((m) => m.name === name), name);
  const flooring = listDesignMaterials({category: "flooring"});
  assert.ok(flooring.length >= 5 && flooring.every((m) => m.category === "flooring"));
});

test("library: palettes are cohesive (style + materials resolve) and collections resolve", () => {
  for (const p of listDesignPalettes()) {
    assert.ok(DESIGN_STYLES.some((s) => s.id === p.styleId), p.id);
    assert.ok(p.colors.length >= 3);
    for (const mid of p.materialIds) assert.ok(DESIGN_MATERIALS.some((m) => m.id === mid), p.id + ":" + mid);
  }
  for (const c of listRoomCollections()) {
    assert.ok(DESIGN_STYLES.some((s) => s.id === c.styleId), c.id);
    assert.ok(listDesignPalettes().some((p) => p.id === c.paletteId), c.id);
  }
});

test("library: material comparison rejects unknown ids; search finds styles by keyword", () => {
  assert.equal(compareDesignMaterials(["quartz", "nope"]).valid, false);
  const ok = compareDesignMaterials(["quartz", "marble"]);
  assert.equal(ok.valid, true);
  assert.equal(ok.materials.length, 2);
  const found = searchDesignLibrary("wabi-sabi");
  assert.ok(found.styles.includes("japandi"));
});

/* ---------------- product catalog ---------------- */

const NOW = "2026-11-15T12:00:00.000Z";
const manual = (over = {}) => createManualProduct({
  productId: "p-1", name: "Oak dining table", type: "table",
  widthMeters: 1.8, depthMeters: 0.9, priceCents: 89900,
  retailer: {name: "Example Retailer", url: "https://example.com/table"},
  enteredBy: "founder",
  ...over,
}, NOW);

test("catalog: manual product is labeled manual_entry with unknown availability", () => {
  const r = manual();
  assert.equal(r.valid, true);
  assert.equal(r.product.source.kind, "manual_entry");
  assert.equal(r.product.availability, "unknown");
  assert.equal(r.product.dimensionsVerified, false);
});

test("catalog: dimensionsVerified requires provenance, in factory and validator", () => {
  const noProv = manual({dimensionsVerified: true});
  assert.equal(noProv.product.dimensionsVerified, false);
  const withProv = manual({dimensionsVerified: true, dimensionSource: "manufacturer spec sheet"});
  assert.equal(withProv.product.dimensionsVerified, true);
  const bad = validateCatalogProduct({productId: "x", name: "x", type: "sofa", widthMeters: 2, depthMeters: 1, priceCents: 100, deliveryCents: null, dimensionsVerified: true, source: {kind: "retailer_feed", label: "feed", retrievedAt: NOW}});
  assert.equal(bad.valid, false);
});

test("catalog: non-HTTPS retailer URL and fractional cents are rejected", () => {
  assert.equal(manual({retailer: {name: "R", url: "http://example.com/x"}}).valid, false);
  assert.equal(manual({priceCents: 10.5}).valid, false);
  assert.equal(manual({priceCents: -1}).valid, false);
});

test("catalog: freshness is computed from the source timestamp", () => {
  const {product} = manual();
  assert.equal(productFreshness(product, Date.parse(NOW) + 24 * 3600 * 1000), "fresh");
  assert.equal(productFreshness(product, Date.parse(NOW) + 30 * 24 * 3600 * 1000), "stale");
  assert.equal(productFreshness({source: {}}, Date.parse(NOW)), "unknown");
});

test("catalog: search filters by dimensions, price and verification", () => {
  const a = manual().product;
  const b = manual({productId: "p-2", name: "Wide sofa", type: "sofa", widthMeters: 2.6, depthMeters: 1.05, priceCents: 150000}).product;
  const all = [a, b];
  assert.equal(searchCatalog(all, {maxWidthMeters: 2}).length, 1);
  assert.equal(searchCatalog(all, {maxPriceCents: 100000}).length, 1);
  assert.equal(searchCatalog(all, {type: "sofa"}).length, 1);
  assert.equal(searchCatalog(all, {verifiedOnly: true}).length, 0);
  assert.equal(searchCatalog(all, {query: "oak"}).length, 1);
});

test("catalog: shopping list total is withheld unless every price is known", () => {
  const a = manual().product;
  const unknown = manual({productId: "p-9", name: "Mystery chair", type: "chair", priceCents: null}).product;
  const partial = buildShoppingList([a, unknown], ["p-1", "p-9"]);
  assert.equal(partial.valid, true);
  assert.equal(partial.merchandiseCents, null);
  assert.equal(partial.totalsComplete, false);
  const full = buildShoppingList([a], ["p-1"]);
  assert.equal(full.merchandiseCents, 89900);
  assert.equal(full.deliveryCents, null); // delivery unknown -> grand total withheld
  assert.equal(full.totalCents, null);
});

/* ---------------- project budget ---------------- */

test("budget: exactly the 15 directive categories", () => {
  assert.equal(BUDGET_CATEGORIES.length, 15);
  for (const id of ["furniture", "flooring", "paint", "lighting", "fixtures", "cabinetry", "countertops", "appliances", "labor", "contractor-estimates", "delivery", "taxes", "permits", "contingency", "materials"])
    assert.ok(BUDGET_CATEGORIES.some((c) => c.id === id), id);
});

test("budget: summary computes estimates, actuals, remaining and alerts", () => {
  const b = createProjectBudget({totalBudgetCents: 1000000});
  b.allocations.furniture = 300000;
  b.lines.push({lineId: "l1", categoryId: "furniture", label: "Sofa", estimatedCents: 250000, actualCents: 240000, status: "purchased"});
  b.lines.push({lineId: "l2", categoryId: "furniture", label: "Rug", estimatedCents: 80000, actualCents: null, status: "planned"});
  b.lines.push({lineId: "l3", categoryId: "paint", label: "Paint", estimatedCents: 20000, actualCents: null, status: "planned"});
  const s = summarizeProjectBudget(b);
  assert.equal(s.valid, true);
  const furn = s.categories.find((c) => c.categoryId === "furniture");
  assert.equal(furn.estimatedCents, 330000);
  assert.equal(furn.actualCents, 240000);
  assert.equal(furn.overAllocation, true); // 330000 > 300000 allocation
  assert.equal(s.estimatedTotalCents, 350000);
  assert.equal(s.remainingBudgetCents, 650000);
  assert.ok(s.alerts.some((a) => a.kind === "estimate_over_allocation" && a.categoryId === "furniture"));
  assert.equal(s.verified, false);
});

test("budget: fractional cents and unknown categories fail closed with no totals", () => {
  const b = createProjectBudget({totalBudgetCents: 1000});
  b.lines.push({lineId: "bad", categoryId: "furniture", label: "X", estimatedCents: 10.5, actualCents: null});
  const s = summarizeProjectBudget(b);
  assert.equal(s.valid, false);
  assert.equal(s.estimatedTotalCents, undefined);
  const b2 = createProjectBudget({});
  b2.lines.push({lineId: "bad2", categoryId: "gold-plating", label: "X", estimatedCents: 100, actualCents: null});
  assert.equal(validateProjectBudget(b2).valid, false);
});

/* ---------------- QUINCEY remediation regressions (U-1..U-3) ---------------- */

test("U-1: budget totals fail closed at safe-integer overflow, never masked to 0", () => {
  const b = createProjectBudget({totalBudgetCents: null});
  b.lines.push({lineId: "m1", categoryId: "furniture", label: "A", estimatedCents: Number.MAX_SAFE_INTEGER, actualCents: null, status: "planned"});
  b.lines.push({lineId: "m2", categoryId: "furniture", label: "B", estimatedCents: Number.MAX_SAFE_INTEGER, actualCents: null, status: "planned"});
  const s = summarizeProjectBudget(b);
  assert.equal(s.valid, true);
  assert.equal(s.estimatedTotalCents, null);
  assert.equal(s.totalsComplete, false);
  assert.ok(s.alerts.some((a) => a.kind === "totals_overflow_withheld"));
  const cmp = compareBudgetOptions(b, createProjectBudget({totalBudgetCents: 100}));
  assert.equal(cmp.valid, false);
  assert.ok(cmp.errors.includes("budget_totals_unavailable"));
});

test("U-2: validators return {valid:false} on non-iterable collection fields instead of throwing", () => {
  assert.equal(validateRoomLayout({room: {widthMeters: 5, depthMeters: 4}, items: 5, openings: "x", obstacles: null}).valid, false);
  assert.equal(validateDesignWorkspace({materialIds: 7, layouts: [], products: []}).valid, false);
  assert.equal(validateDesignWorkspace({layouts: [], products: [], shoppingListIds: "nope"}).valid, false);
  assert.equal(validateProjectBudget({lines: 3}).valid, false);
  assert.equal(validateProjectBudget({allocations: [1, 2]}).valid, false);
  assert.equal(summarizeProjectBudget({lines: "nope"}).valid, false);
});

test("U-6: allocations-total overflow is flagged and marks totals incomplete", () => {
  const b = createProjectBudget({totalBudgetCents: null});
  b.allocations = {furniture: Number.MAX_SAFE_INTEGER, materials: Number.MAX_SAFE_INTEGER};
  b.lines.push({lineId: "ok1", categoryId: "furniture", label: "Chair", estimatedCents: 1000, actualCents: null, status: "planned"});
  const s = summarizeProjectBudget(b);
  assert.equal(s.valid, true);
  assert.equal(s.allocatedTotalCents, null);
  assert.equal(s.totalsComplete, false);
  assert.ok(s.alerts.some((a) => a.kind === "allocations_overflow_withheld"));
  assert.equal(s.estimatedTotalCents, 1000); // line totals unaffected and exact
  assert.ok(!s.alerts.some((a) => a.kind === "totals_overflow_withheld"));
});

test("U-3: obstacles and walkways must lie fully within the room", () => {
  const l = baseLayout();
  l.obstacles.push({id: "ob-out", kind: "column", xMeters: 4.8, yMeters: 0, widthMeters: 0.5, depthMeters: 0.5});
  assert.equal(validateRoomLayout(l).valid, false);
  const l2 = baseLayout();
  l2.walkways.push({id: "wk-out", xMeters: 0, yMeters: 3.8, widthMeters: 2, depthMeters: 0.5});
  assert.equal(validateRoomLayout(l2).valid, false);
  assert.equal(validateRoomLayout(baseLayout()).valid, true);
});

/* ---------------- design library + layout evaluation routes ---------------- */

test("routes: design-library serves the full library; evaluate-layout validates and diagnoses", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "renovision-lib-"));
  t.after(() => rm(dir, {recursive: true, force: true}));
  const actorTenants = new Map();
  const authenticate = async (req) => {
    const id = req.headers["x-actor-id"], tenantId = req.headers["x-tenant-id"];
    if (!id || !tenantId) return null;
    actorTenants.set(id, tenantId);
    return {id, tenantId, authenticated: true, roles: ["admin"], propertyIds: ["*"], roomIds: []};
  };
  const authorize = async ({actorId, tenantId}) => Boolean(actorId && actorTenants.has(actorId) && (!tenantId || actorTenants.get(actorId) === tenantId));
  const evidenceStorage = createDurableEvidenceStorage({rootDir: join(dir, "evidence"), authorize});
  const eventStore = createDurableSpatialEventStore({rootDir: join(dir, "events"), authorize: async (scope) => authorize({actorId: scope?.actor?.id, tenantId: scope?.tenantId})});
  const server = createRenovisionServer({authenticate, resolveApproval: createMemoryApprovalRegistry(), evidenceStorage, eventStore});
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  t.after(() => server.close());
  const base = "http://127.0.0.1:" + server.address().port;
  const HA = {"x-actor-id": "operator-1", "x-tenant-id": "tenant-a", "content-type": "application/json"};
  const libRes = await fetch(base + "/api/renovision/design-library", {headers: HA});
  assert.equal(libRes.status, 200);
  const lib = (await libRes.json()).library;
  assert.equal(lib.styles.length, 20);
  assert.equal(lib.categories.length, 13);
  assert.ok(lib.materials.length >= 17);
  assert.ok(lib.palettes.length >= 8);
  assert.ok(lib.collections.length >= 6);
  const unauth = await fetch(base + "/api/renovision/design-library");
  assert.equal(unauth.status, 401);
  const layout = createRoomLayout({layoutId: "eval-1", name: "Eval", roomId: "room-1", widthMeters: 5, depthMeters: 4});
  layout.items.push({id: "big", xMeters: 4.5, yMeters: 3.5, widthMeters: 1, depthMeters: 1, rotationDeg: 0});
  const evRes = await fetch(base + "/api/renovision/design/evaluate-layout", {method: "POST", headers: HA, body: JSON.stringify({layout})});
  assert.equal(evRes.status, 200);
  const ev = (await evRes.json()).evaluation;
  assert.equal(ev.valid, true);
  assert.equal(ev.verified, false);
  assert.ok(ev.items[0].issues.includes("outside_room_bounds"));
  const badRes = await fetch(base + "/api/renovision/design/evaluate-layout", {method: "POST", headers: HA, body: JSON.stringify({layout: {room: {widthMeters: -1, depthMeters: 4}, items: []}})});
  assert.equal(badRes.status, 422);
});

/* ---------------- studio extension executes and collects a valid workspace ---------------- */

import {createContext, runInContext} from "node:vm";
import {RENOVISION_STUDIO_HTML} from "../src/renovisionStudio.mjs";

test("studio extension: appended design-platform script executes and its workspace passes server validation", () => {
  const startMarker = "/* ===== RENOVISION design platform extension";
  const endMarker = "$('room').addEventListener('change',()=>{furnitureItems.length=0;updateFurniturePlan()});updateFurniturePlan();";
  const start = RENOVISION_STUDIO_HTML.indexOf(startMarker);
  const end = RENOVISION_STUDIO_HTML.indexOf(endMarker);
  assert.ok(start > 0 && end > start, "extension block present in studio page");
  const block = RENOVISION_STUDIO_HTML.slice(start, end);

  const allElements = [];
  const makeEl = (tag = "div") => {
    const el = {
      tag, id: "", value: "", textContent: "", innerHTML: "", title: "", placeholder: "", type: "", className: "", checked: false,
      style: {}, children: [], options: [], dataset: {},
      classList: {add() {}, remove() {}, toggle() {}},
      setAttribute() {}, getAttribute() { return null; },
      append(...kids) { this.children.push(...kids); }, appendChild(k) { this.children.push(k); return k; },
      replaceChildren(...kids) { this.children = [...kids]; },
      addEventListener() {}, removeEventListener() {},
      querySelectorAll() { return []; }, querySelector() { return null; },
      closest() { return null; }, scrollIntoView() {}, focus() {},
    };
    allElements.push(el);
    return el;
  };
  const byId = (id) => {
    let el = allElements.find((e) => e.id === id);
    if (!el) { el = makeEl("input"); el.id = id; }
    return el;
  };
  // Pre-register the main-script element ids the extension reads at load.
  const preset = {roomWidth: "240", roomDepth: "180", designBudget: "5000", roomId: "room-1", clearance: "30"};
  for (const [id, v] of Object.entries(preset)) { const el = byId(id); el.value = v; }
  byId("designStyle").options = [{text: "Japandi", value: "Japandi"}];
  byId("designStyle").value = "Japandi";
  byId("floorPlan").clientWidth = 800;

  const sandbox = {
    console, JSON, Math, Number, String, Boolean, Array, Object, Set, Map, Date, URL, Error, Promise, fetch: async () => { throw new Error("no network in test"); },
    document: {
      createElement: (tag) => makeEl(tag),
      createTextNode: (text) => ({textContent: text}),
      getElementById: (id) => byId(id),
      querySelector: () => makeEl("main"),
      querySelectorAll: () => [],
      body: makeEl("body"),
    },
    furnitureItems: [], obstacles: [],
    selectedFurniture: -1,
    activeProjectId: "proj-1", idToken: "test-token",
    dimension: (n) => { const v = Number(n); return n !== "" && n !== null && n !== undefined && Number.isFinite(v) && v > 0 && v <= 100000 ? v : null; },
    moneyCents: (n) => { const v = Number(n); return Number.isFinite(v) && v >= 0 && Number.isSafeInteger(Math.round(v * 100)) && Math.abs(v * 100 - Math.round(v * 100)) < 0.000001 ? Math.round(v * 100) : null; },
    drawFloorPlan: function () {},
    updateFurniturePlan: function () { sandbox.__ufp = (sandbox.__ufp || 0) + 1; },
  };
  sandbox.$ = (id) => byId(id);
  sandbox.window = sandbox;
  const ctx = createContext(sandbox);
  runInContext(block, ctx, {filename: "studio-extension.js"});
  // The block executed end to end (panels built, catalog + budget rendered).
  assert.ok(runInContext("typeof collectWorkspace", ctx) === "function");
  // Exercise the collectors: add a plan item and an opening through the
  // extension's own state, then collect and validate server-side.
  runInContext("furnitureItems.push({name:'Test sofa', retailer:'R', url:'', width:84, depth:38, priceCents:129900, x:12, y:60, rotated:false, _pid:null, _lid:'item-t1'})", ctx);
  runInContext("openings.push({id:'op-t1', kind:'door', wall:'north', offsetIn:24, widthIn:36, hinge:'start', direction:'in'})", ctx);
  runInContext("walkways.push({id:'wk-t1', x:12, y:96, width:120, depth:36, minWidthIn:36})", ctx);
  const ws = runInContext("collectWorkspace()", ctx);
  const check = validateDesignWorkspace(ws);
  assert.equal(check.valid, true, check.errors.join("; "));
  assert.equal(ws.layouts.length, 1);
  assert.equal(ws.layouts[0].items[0].widthMeters, 2.134); // 84in in meters, 3dp
  assert.equal(ws.layouts[0].openings[0].kind, "door");
  assert.equal(ws.budget.totalBudgetCents, 500000);
  assert.equal(ws.budget.lines[0].estimatedCents, 129900);
  // U-5b: layout names that slugify to the same saved id are refused with a
  // clear message before anything is sent to the server.
  runInContext("savedLayouts.set('My Layout', {f:[],o:[],p:[],w:[]}); savedLayouts.set('my-layout', {f:[],o:[],p:[],w:[]})", ctx);
  assert.throws(() => runInContext("collectWorkspace()", ctx), /same saved id/);
});

test("studio extension U-4: an unset budget field persists as null, never as 0", () => {
  const startMarker = "/* ===== RENOVISION design platform extension";
  const endMarker = "$('room').addEventListener('change',()=>{furnitureItems.length=0;updateFurniturePlan()});updateFurniturePlan();";
  const block = RENOVISION_STUDIO_HTML.slice(RENOVISION_STUDIO_HTML.indexOf(startMarker), RENOVISION_STUDIO_HTML.indexOf(endMarker));
  const allElements = [];
  const makeEl = (tag = "div") => {
    const el = {tag, id: "", value: "", textContent: "", innerHTML: "", title: "", placeholder: "", type: "", className: "", checked: false, style: {}, children: [], options: [], dataset: {}, classList: {add() {}, remove() {}, toggle() {}}, setAttribute() {}, getAttribute() { return null; }, append(...k) { this.children.push(...k); }, appendChild(k) { this.children.push(k); return k; }, replaceChildren(...k) { this.children = [...k]; }, addEventListener() {}, removeEventListener() {}, querySelectorAll() { return []; }, querySelector() { return null; }, closest() { return null; }, scrollIntoView() {}, focus() {}};
    allElements.push(el);
    return el;
  };
  const byId = (id) => { let el = allElements.find((e) => e.id === id); if (!el) { el = makeEl("input"); el.id = id; } return el; };
  for (const [id, v] of Object.entries({roomWidth: "240", roomDepth: "180", designBudget: "", roomId: "room-1", clearance: "30"})) byId(id).value = v;
  byId("designStyle").options = [{text: "Japandi", value: "Japandi"}];
  byId("designStyle").value = "Japandi";
  byId("floorPlan").clientWidth = 800;
  const sandbox = {
    console, JSON, Math, Number, String, Boolean, Array, Object, Set, Map, Date, URL, Error, Promise, fetch: async () => { throw new Error("no network in test"); },
    document: {createElement: (tag) => makeEl(tag), createTextNode: (text) => ({textContent: text}), getElementById: (id) => byId(id), querySelector: () => makeEl("main"), querySelectorAll: () => [], body: makeEl("body")},
    furnitureItems: [], obstacles: [], selectedFurniture: -1, activeProjectId: "proj-1", idToken: "test-token",
    dimension: (n) => { const v = Number(n); return n !== "" && n !== null && n !== undefined && Number.isFinite(v) && v > 0 && v <= 100000 ? v : null; },
    moneyCents: (n) => { const v = Number(n); return Number.isFinite(v) && v >= 0 && Number.isSafeInteger(Math.round(v * 100)) && Math.abs(v * 100 - Math.round(v * 100)) < 0.000001 ? Math.round(v * 100) : null; },
    drawFloorPlan: function () {}, updateFurniturePlan: function () {},
  };
  sandbox.$ = (id) => byId(id);
  sandbox.window = sandbox;
  const ctx = createContext(sandbox);
  runInContext(block, ctx, {filename: "studio-extension.js"});
  const ws = runInContext("collectWorkspace()", ctx);
  assert.equal(ws.budget.totalBudgetCents, null);
});

import {RenovisionProject} from "../lib/renovision/project-workflow.mjs";
import {validateDesignWorkspace, normalizeDesignWorkspace, emptyDesignWorkspace} from "../lib/renovision/design-workspace.mjs";
import {createRenovisionServer, createMemoryApprovalRegistry} from "../src/renovisionServer.mjs";
import {createDurableEvidenceStorage} from "../lib/renovision/durable-evidence-storage.mjs";
import {createDurableSpatialEventStore} from "../lib/renovision/durable-spatial-event-store.mjs";
import {mkdtemp, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";

const sampleWorkspace = () => {
  const ws = emptyDesignWorkspace();
  ws.styleId = "japandi";
  ws.paletteId = "japandi-calm";
  ws.materialIds = ["engineered-wood", "natural-fabrics"];
  const layout = createRoomLayout({layoutId: "lay-1", name: "Main", roomId: "room-1", widthMeters: 5, depthMeters: 4});
  layout.items.push({id: "sofa-1", productId: "p-1", xMeters: 1, yMeters: 2.5, widthMeters: 2, depthMeters: 0.95, rotationDeg: 0});
  ws.layouts = [layout];
  ws.activeLayoutId = "lay-1";
  const {product} = createManualProduct({productId: "p-1", name: "Linen sofa", type: "sofa", widthMeters: 2, depthMeters: 0.95, priceCents: 129900, enteredBy: "test"}, NOW);
  ws.products = [product];
  ws.shoppingListIds = ["p-1"];
  const budget = createProjectBudget({totalBudgetCents: 500000});
  budget.lines.push({lineId: "b1", categoryId: "furniture", label: "Linen sofa", productId: "p-1", estimatedCents: 129900, actualCents: null, status: "planned"});
  ws.budget = budget;
  ws.notes = "Keep the window wall clear.";
  return ws;
};

test("workspace: sample workspace validates; unknown library refs are rejected", () => {
  assert.equal(validateDesignWorkspace(sampleWorkspace()).valid, true);
  const bad = sampleWorkspace();
  bad.styleId = "not-a-style";
  assert.equal(validateDesignWorkspace(bad).valid, false);
  const badLayout = sampleWorkspace();
  badLayout.layouts[0].items[0].rotationDeg = 33;
  assert.equal(validateDesignWorkspace(badLayout).valid, false);
});

test("workspace: workflow stores, snapshots and restores it byte-stable; tenant mismatch fails", () => {
  const actor = {id: "op-1", tenantId: "tenant-a", authenticated: true};
  const project = new RenovisionProject({projectId: "ws-1", tenantId: "tenant-a", propertyId: "property-1", roomId: "room-1", createdBy: "op-1"});
  const saved = project.setDesignWorkspace({actor, workspace: sampleWorkspace()});
  assert.equal(saved.format, "renovision-design-workspace/v1");
  assert.ok(saved.updatedAt);
  assert.equal(project.snapshot().designWorkspace.layouts.length, 1);
  const restored = RenovisionProject.restore(project.serialize());
  assert.deepEqual(restored.designWorkspace, project.designWorkspace);
  assert.throws(() => project.setDesignWorkspace({actor: {id: "op-2", tenantId: "tenant-b", authenticated: true}, workspace: sampleWorkspace()}), /tenant_scope_mismatch/);
  assert.throws(() => project.setDesignWorkspace({actor, workspace: {...sampleWorkspace(), styleId: "nope"}}), /design_workspace_invalid/);
  // Audit chain still verifies after the workspace entries.
  const restored2 = RenovisionProject.restore(project.serialize());
  assert.equal(restored2.projectId, "ws-1");
});

test("workspace: corrupted stored workspace fails restore closed", () => {
  const actor = {id: "op-1", tenantId: "tenant-a", authenticated: true};
  const project = new RenovisionProject({projectId: "ws-2", tenantId: "tenant-a", propertyId: "property-1", roomId: "room-1", createdBy: "op-1"});
  project.setDesignWorkspace({actor, workspace: sampleWorkspace()});
  const data = project.serialize();
  data.designWorkspace.layouts[0].items[0].widthMeters = -3;
  assert.throws(() => RenovisionProject.restore(data), /design_workspace_invalid/);
});

test("workspace: HTTP route saves, reads back, rejects invalid, and isolates tenants", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "renovision-ws-"));
  t.after(() => rm(dir, {recursive: true, force: true}));
  const actorTenants = new Map();
  const authenticate = async (req) => {
    const id = req.headers["x-actor-id"], tenantId = req.headers["x-tenant-id"];
    if (!id || !tenantId) return null;
    actorTenants.set(id, tenantId);
    return {id, tenantId, authenticated: true, roles: ["admin"], propertyIds: ["*"], roomIds: []};
  };
  const authorize = async ({actorId, tenantId}) => Boolean(actorId && actorTenants.has(actorId) && (!tenantId || actorTenants.get(actorId) === tenantId));
  const evidenceStorage = createDurableEvidenceStorage({rootDir: join(dir, "evidence"), authorize});
  const eventStore = createDurableSpatialEventStore({rootDir: join(dir, "events"), authorize: async (scope) => authorize({actorId: scope?.actor?.id, tenantId: scope?.tenantId})});
  const server = createRenovisionServer({authenticate, resolveApproval: createMemoryApprovalRegistry(), evidenceStorage, eventStore});
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  t.after(() => server.close());
  const base = "http://127.0.0.1:" + server.address().port;
  const HA = {"x-actor-id": "operator-1", "x-tenant-id": "tenant-a", "content-type": "application/json"};
  const HB = {"x-actor-id": "operator-2", "x-tenant-id": "tenant-b", "content-type": "application/json"};
  const call = async (method, path, body, headers = HA) => {
    const res = await fetch(base + path, {method, headers, body: body ? JSON.stringify(body) : undefined});
    return {status: res.status, body: await res.json().catch(() => ({}))};
  };
  let r = await call("POST", "/api/renovision/projects", {projectId: "ws-http-1", propertyId: "property-1", roomId: "room-1"});
  assert.equal(r.status, 201);
  r = await call("GET", "/api/renovision/projects/ws-http-1/design-workspace");
  assert.equal(r.status, 200);
  assert.equal(r.body.designWorkspace, null);
  r = await call("POST", "/api/renovision/projects/ws-http-1/design-workspace", {workspace: sampleWorkspace()});
  assert.equal(r.status, 200);
  assert.equal(r.body.designWorkspace.styleId, "japandi");
  r = await call("GET", "/api/renovision/projects/ws-http-1/design-workspace");
  assert.equal(r.body.designWorkspace.layouts[0].items.length, 1);
  assert.equal(r.body.designWorkspace.budget.lines[0].estimatedCents, 129900);
  r = await call("POST", "/api/renovision/projects/ws-http-1/design-workspace", {workspace: {...sampleWorkspace(), styleId: "bogus"}});
  assert.equal(r.status, 422);
  // The failed write must not have clobbered the stored workspace.
  r = await call("GET", "/api/renovision/projects/ws-http-1/design-workspace");
  assert.equal(r.body.designWorkspace.styleId, "japandi");
  // Another tenant cannot see the project at all.
  r = await call("GET", "/api/renovision/projects/ws-http-1/design-workspace", undefined, HB);
  assert.equal(r.status, 404);
});

test("budget: cancelled lines are excluded; option comparison reports the cheaper option", () => {
  const mk = (sofaCents) => {
    const b = createProjectBudget({totalBudgetCents: 500000});
    b.lines.push({lineId: "s", categoryId: "furniture", label: "Sofa", estimatedCents: sofaCents, actualCents: null, status: "planned"});
    b.lines.push({lineId: "x", categoryId: "furniture", label: "Cancelled extra", estimatedCents: 999999, actualCents: null, status: "cancelled"});
    return b;
  };
  assert.equal(summarizeProjectBudget(mk(100000)).estimatedTotalCents, 100000);
  const cmp = compareBudgetOptions(mk(100000), mk(80000));
  assert.equal(cmp.valid, true);
  assert.equal(cmp.deltaTotalCents, -20000);
  assert.equal(cmp.cheaperOption, "b");
});
