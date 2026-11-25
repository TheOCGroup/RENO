// Phase 9.5 — UF-Q9D2-1 regression: the export checklist must reflect the
// project's ACTUAL confirmed design selections. Before the fix it was driven
// only by harmony-panel interaction state (designChosen), so a user who
// generated and saved a concept — recording style/palette/material selections
// on the project — still saw "Design selections … (not yet)".
import test from "node:test";
import assert from "node:assert/strict";
import { evaluateDesignChecklist } from "../lib/renovision/export-checklist.mjs";
import { RENOVISION_STUDIO_HTML } from "../src/renovisionStudio.mjs";

test("UF-Q9D2-1: empty project reports no design selections ready", () => {
  assert.deepEqual(evaluateDesignChecklist({}), { designSelections: false, paintMaterialSchedule: false });
  assert.deepEqual(evaluateDesignChecklist({ harmonyChosen: false, harmonySelections: {}, conceptSelections: [] }), {
    designSelections: false,
    paintMaterialSchedule: false,
  });
});

test("UF-Q9D2-1: saved concept selections spanning categories satisfy the checklist without any harmony interaction", () => {
  // The QUINCEY delta-2 reproduction, at state level: concept generated and
  // saved (style + palette + material + priorities recorded), harmony panel
  // never touched.
  const out = evaluateDesignChecklist({
    harmonyChosen: false,
    harmonySelections: {},
    conceptSelections: [
      { room: "Kitchen", style: "Warm modern", palette: "Warm neutral", material: "Light oak", priorities: ["Flooring", "Lighting"] },
    ],
  });
  assert.equal(out.designSelections, true);
  assert.equal(out.paintMaterialSchedule, true);
});

test("UF-Q9D2-1: a single-category concept still counts as design selections, honestly scoped", () => {
  const styleOnly = evaluateDesignChecklist({ conceptSelections: [{ style: "Coastal" }] });
  assert.equal(styleOnly.designSelections, true);
  assert.equal(styleOnly.paintMaterialSchedule, false, "style alone is not a paint & material schedule");
  const materialOnly = evaluateDesignChecklist({ conceptSelections: [{ material: "Walnut" }] });
  assert.equal(materialOnly.designSelections, true);
  assert.equal(materialOnly.paintMaterialSchedule, true);
});

test("UF-Q9D2-1: harmony selections across categories satisfy the checklist", () => {
  const out = evaluateDesignChecklist({
    harmonySelections: { paintHex: "#E8DED0", flooringKeyword: "white oak", cabinetry: "shaker" },
  });
  assert.equal(out.designSelections, true);
  assert.equal(out.paintMaterialSchedule, true);
  const chosen = evaluateDesignChecklist({ harmonyChosen: true });
  assert.equal(chosen.designSelections, true);
});

test("UF-Q9D2-1: null/blank selection values never count as confirmed", () => {
  const out = evaluateDesignChecklist({
    harmonySelections: { paintHex: "", cabinetry: null },
    conceptSelections: [{ style: "", palette: null }, null, {}],
  });
  assert.deepEqual(out, { designSelections: false, paintMaterialSchedule: false });
});

test("UF-Q9.5-2: whitespace-only strings and falsy non-strings never count as confirmed", () => {
  const out = evaluateDesignChecklist({
    harmonySelections: { paintHex: "   ", cabinetry: 0 },
    conceptSelections: [{ style: " ", palette: false, material: "\t\n" }],
  });
  assert.deepEqual(out, { designSelections: false, paintMaterialSchedule: false });
});

test("UF-Q9D2-1 wiring: studio publishes saved concept selections and the checklist consumes the shared evaluator", () => {
  // The module script exposes the evaluator on window.RV.
  assert.match(RENOVISION_STUDIO_HTML, /export-checklist\.mjs/);
  assert.match(RENOVISION_STUDIO_HTML, /exportChecklist/);
  // Concept save/load/delete all flow through renderConceptHistory, which must
  // publish the recorded selections and notify listeners.
  assert.match(RENOVISION_STUDIO_HTML, /__rvConceptSelections/);
  assert.match(RENOVISION_STUDIO_HTML, /rv-concepts-changed/);
  // The checklist itself must be driven by the evaluator over ALL confirmed
  // sources — not by the harmony-only flag alone.
  assert.match(RENOVISION_STUDIO_HTML, /evaluateDesignChecklist/);
  assert.doesNotMatch(RENOVISION_STUDIO_HTML, /\[designChosen, "Design selections/);
  assert.doesNotMatch(RENOVISION_STUDIO_HTML, /\[designChosen, "Paint & material schedule/);
});
