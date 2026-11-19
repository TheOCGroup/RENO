import test from "node:test";
import assert from "node:assert/strict";
import {
  HARMONY_STYLE_FAMILIES, PAINT_FAMILIES, ATMOSPHERES,
  getHarmonyFamily, colorsForAtmosphere, colorInfo, evaluateHarmony,
  createDesignState, setSelection, lockSelection, unlockSelection,
  proposeChange, confirmChange, saveVersion, restoreVersion,
} from "../lib/renovision/design-harmony.mjs";

const finding = (ev, rule) => ev.findings.find((f) => f.rule === rule);

test("exactly the 13 required style families, in order", () => {
  assert.deepEqual(HARMONY_STYLE_FAMILIES.map((f) => f.id), [
    "warm-modern", "timeless-elegance", "organic-contemporary", "modern-sophistication",
    "transitional", "scandinavian", "contemporary-luxury", "mid-century-modern",
    "traditional", "coastal", "industrial", "minimalist", "custom-mixed",
  ]);
  for (const f of HARMONY_STYLE_FAMILIES) {
    assert.ok(["warm", "cool", "neutral"].includes(f.undertone), f.id);
    assert.ok(["warm", "neutral", "cool"].includes(f.lighting), f.id);
    assert.ok(typeof f.description === "string" && f.description.length > 10, f.id);
    if (f.id === "custom-mixed") assert.equal(f.palette.wall, null);
    else for (const k of ["wall", "trim", "ceiling", "accent"]) assert.doesNotThrow(() => colorInfo(f.palette[k]), f.id + "." + k);
  }
});

test("warm modern is genuinely warm: ivory wall, oak flooring, warm light", () => {
  const wm = getHarmonyFamily("warm-modern");
  assert.equal(wm.undertone, "warm");
  assert.equal(colorInfo(wm.palette.wall).undertone, "warm");
  assert.ok(wm.flooringKeywords.some((k) => k.includes("oak")));
  assert.equal(wm.lighting, "warm");
});

test("paint families: exact ids, >=3 colors each, every hex parses", () => {
  assert.deepEqual(PAINT_FAMILIES.map((f) => f.id), [
    "warm-whites", "cool-whites", "creams", "greiges", "taupes",
    "earth-tones", "muted-greens", "blues", "charcoals", "accents",
  ]);
  for (const fam of PAINT_FAMILIES) {
    assert.ok(fam.colors.length >= 3, fam.id);
    for (const c of fam.colors) {
      const info = colorInfo(c.hex);
      assert.ok(info.hue >= 0 && info.hue <= 360, c.id);
      assert.ok(info.saturation >= 0 && info.saturation <= 1, c.id);
      assert.ok(info.lightness >= 0 && info.lightness <= 1, c.id);
      assert.ok(["warm", "cool", "neutral"].includes(c.undertone), c.id);
    }
  }
});

test("colorInfo: known colors land in the documented bands", () => {
  assert.equal(colorInfo("#F3EAD8").undertone, "warm");   // warm ivory
  assert.equal(colorInfo("#7C8DA6").undertone, "cool");   // slate blue
  assert.equal(colorInfo("#4A4A4A").undertone, "neutral"); // pure grey
  assert.throws(() => colorInfo("not-a-color"), /invalid hex/);
  assert.throws(() => colorInfo("#12345"), /invalid hex/);
});

test("atmospheres: exact list; mappings return trait-matching colors", () => {
  assert.deepEqual([...ATMOSPHERES], ["warm", "elegant", "airy", "cozy", "dramatic", "sophisticated", "natural", "contemporary", "calm"]);
  const warm = colorsForAtmosphere("warm");
  assert.ok(warm.length >= 3);
  for (const c of warm) assert.equal(colorInfo(c.hex).undertone, "warm");
  const airy = colorsForAtmosphere("airy");
  assert.ok(airy.length >= 3);
  for (const c of airy) assert.ok(colorInfo(c.hex).lightness >= 0.82);
  const dramatic = colorsForAtmosphere("dramatic");
  assert.ok(dramatic.length >= 3);
  for (const c of dramatic) assert.ok(colorInfo(c.hex).lightness <= 0.45);
  for (const a of ATMOSPHERES) assert.ok(colorsForAtmosphere(a).length > 0, a);
  assert.throws(() => colorsForAtmosphere("moody"), /unknown atmosphere/);
});

test("harmony: warm modern + warm ivory + natural oak + warm light = harmonious", () => {
  const ev = evaluateHarmony({
    familyId: "warm-modern",
    selections: { paintHex: "#F3EAD8", flooringKeyword: "natural oak", lighting: "warm", furnitureTags: ["natural wood"] },
  });
  assert.equal(ev.status, "harmonious");
  assert.equal(finding(ev, "undertone").level, "ok");
  assert.equal(finding(ev, "color").level, "ok");
  assert.equal(finding(ev, "material").level, "ok");
  assert.equal(finding(ev, "style").level, "ok");
  assert.equal(ev.findings.length, 8);
});

test("harmony: warm modern + cool blue-grey paint = undertone conflict", () => {
  const ev = evaluateHarmony({ familyId: "warm-modern", selections: { paintHex: "#7C8DA6" } });
  assert.equal(finding(ev, "undertone").level, "conflict");
  assert.equal(ev.status, "conflict");
});

test("harmony: missing inputs are not-evaluated, never silently ok", () => {
  const ev = evaluateHarmony({ familyId: "warm-modern", selections: {} });
  for (const rule of ["color", "undertone", "material", "finish", "style", "spatial", "budget", "whole-property"])
    assert.equal(finding(ev, rule).level, "not-evaluated", rule);
  assert.equal(ev.status, "harmonious"); // nothing evaluated, nothing degraded
});

test("harmony: budget rules — over is conflict, within 10% is attention", () => {
  const over = evaluateHarmony({ familyId: "warm-modern", selections: {}, budget: { estimatedCents: 120000, budgetCents: 100000 } });
  assert.equal(finding(over, "budget").level, "conflict");
  assert.equal(over.status, "conflict");
  const near = evaluateHarmony({ familyId: "warm-modern", selections: {}, budget: { estimatedCents: 95000, budgetCents: 100000 } });
  assert.equal(finding(near, "budget").level, "attention");
  const fine = evaluateHarmony({ familyId: "warm-modern", selections: {}, budget: { estimatedCents: 50000, budgetCents: 100000 } });
  assert.equal(finding(fine, "budget").level, "ok");
});

test("harmony: spatial footprint vs confirmed room area", () => {
  const room = { widthIn: 120, depthIn: 120 }; // 100 sq ft
  const crowded = evaluateHarmony({ familyId: "warm-modern", selections: { spatialFootprintSqFt: 70 }, room });
  assert.equal(finding(crowded, "spatial").level, "conflict");
  const fine = evaluateHarmony({ familyId: "warm-modern", selections: { spatialFootprintSqFt: 40 }, room });
  assert.equal(finding(fine, "spatial").level, "ok");
});

test("harmony: whole-property mixing and disjoint furniture tags", () => {
  const mixed = evaluateHarmony({ familyId: "warm-modern", selections: { otherRooms: ["coastal"] } });
  assert.equal(finding(mixed, "whole-property").level, "attention");
  const same = evaluateHarmony({ familyId: "warm-modern", selections: { otherRooms: ["warm-modern"] } });
  assert.equal(finding(same, "whole-property").level, "ok");
  const disjoint = evaluateHarmony({ familyId: "warm-modern", selections: { furnitureTags: ["exposed", "raw"] } });
  assert.equal(finding(disjoint, "style").level, "attention");
});

test("harmony: unknown family throws; custom-mixed skips family rules only", () => {
  assert.throws(() => evaluateHarmony({ familyId: "french-country", selections: {} }), /unknown harmony style family/);
  const ev = evaluateHarmony({ familyId: "custom-mixed", selections: { paintHex: "#7C8DA6", flooringKeyword: "zebrawood", furnitureTags: ["anything"] } });
  assert.equal(finding(ev, "material").level, "not-evaluated");
  assert.equal(finding(ev, "style").level, "not-evaluated");
  assert.equal(finding(ev, "color").level, "ok");
  assert.equal(finding(ev, "undertone").level, "ok");
  assert.equal(ev.status, "harmonious");
});

test("locked selections cannot be silently replaced; state unchanged", () => {
  let s = createDesignState();
  s = setSelection(s, "paintHex", "#F3EAD8");
  s = lockSelection(s, "paintHex");
  assert.throws(() => setSelection(s, "paintHex", "#7C8DA6"), /locked/);
  assert.equal(s.selections.paintHex, "#F3EAD8");
  const unlocked = unlockSelection(s, "paintHex");
  const changed = setSelection(unlocked, "paintHex", "#7C8DA6");
  assert.equal(changed.selections.paintHex, "#7C8DA6");
  assert.equal(s.selections.paintHex, "#F3EAD8"); // original untouched (immutability)
});

test("proposeChange never applies; reports locked key and degradations", () => {
  let s = createDesignState();
  s = setSelection(s, "paintHex", "#F3EAD8");
  s = lockSelection(s, "paintHex");
  const p = proposeChange(s, "paintHex", "#7C8DA6", { familyId: "warm-modern" });
  assert.equal(p.applied, false);
  assert.ok(p.conflicts.includes("paintHex"));
  assert.equal(finding(p.evaluation, "undertone").level, "conflict");
  assert.equal(s.selections.paintHex, "#F3EAD8"); // intact

  // Degradation of another locked key: custom-mixed, warm paint locked,
  // flipping lighting to cool degrades the undertone rule paint feeds.
  let s2 = createDesignState();
  s2 = setSelection(s2, "paintHex", "#F3EAD8");
  s2 = setSelection(s2, "lighting", "warm");
  s2 = lockSelection(s2, "paintHex");
  const p2 = proposeChange(s2, "lighting", "cool", { familyId: "custom-mixed" });
  assert.equal(p2.applied, false);
  assert.ok(p2.conflicts.includes("paintHex"));
  assert.equal(s2.selections.lighting, "warm");
});

test("confirmChange overrides a lock explicitly and records history", () => {
  let s = createDesignState();
  s = setSelection(s, "paintHex", "#F3EAD8");
  s = lockSelection(s, "paintHex");
  const before = s.history.length;
  const s2 = confirmChange(s, "paintHex", "#7C8DA6");
  assert.equal(s2.selections.paintHex, "#7C8DA6");
  assert.equal(s2.history.length, before + 1);
  const entry = s2.history[s2.history.length - 1];
  assert.equal(entry.key, "paintHex");
  assert.equal(entry.from, "#F3EAD8");
  assert.equal(entry.to, "#7C8DA6");
  assert.ok(typeof entry.at === "string" && entry.at.length > 0);
  assert.equal(s.selections.paintHex, "#F3EAD8"); // original state untouched
  assert.equal(s2.locked.paintHex, true); // lock survives at the new value
});

test("versions: save / change / restore round-trip", () => {
  let s = createDesignState();
  s = setSelection(s, "paintHex", "#F3EAD8");
  s = setSelection(s, "flooringKeyword", "natural oak");
  s = saveVersion(s, "Warm ivory scheme");
  const v1 = s.activeVersionId;
  assert.ok(v1);
  assert.equal(s.versions.length, 1);
  assert.equal(s.versions[0].label, "Warm ivory scheme");
  assert.equal(s.versions[0].selections.paintHex, "#F3EAD8");

  s = confirmChange(s, "paintHex", "#7C8DA6");
  s = saveVersion(s, "Slate experiment");
  assert.equal(s.versions.length, 2);
  assert.equal(s.selections.paintHex, "#7C8DA6");

  const restored = restoreVersion(s, v1);
  assert.equal(restored.selections.paintHex, "#F3EAD8");
  assert.equal(restored.selections.flooringKeyword, "natural oak");
  assert.equal(restored.activeVersionId, v1);
  assert.equal(restored.history[restored.history.length - 1].key, "__version__");
  // Snapshot is deep: mutating the restored copy cannot corrupt the version.
  restored.selections.paintHex = "#000000";
  assert.equal(restored.versions[0].selections.paintHex, "#F3EAD8");
  assert.throws(() => restoreVersion(s, "version-99"), /unknown design version/);
});
