/** Export-checklist design readiness (UF-Q9D2-1).
 *
 * The studio's "Your project package" checklist must reflect the project's
 * ACTUAL confirmed design selections, from every place they are recorded:
 *
 *  - the Design Harmony workspace state (a chosen family, or selections the
 *    user applied there — persisted in the project workspace document), and
 *  - saved concept records (each generation saved to the project records the
 *    style / palette / material selections it was made with, with revision
 *    history via revisionOf chains).
 *
 * Before this module existed, the checklist was driven only by the harmony
 * panel's interaction flag, so a user who generated and saved a concept —
 * without ever touching the harmony panel — was told their design selections
 * were "(not yet)" ready. Pure functions, no DOM: the studio publishes the
 * recorded selections and this evaluator decides readiness. */

const PAINT_KEYS = Object.freeze(["paintHex", "paint", "palette"]);
const MATERIAL_KEYS = Object.freeze([
  "flooringKeyword", "flooring", "cabinetry", "countertop", "countertops",
  "material", "materials", "tile", "fixtures", "lighting", "hardware", "furniture",
]);

function present(value) {
  return value !== null && value !== undefined && value !== "";
}

function selectionKeys(selections) {
  if (!selections || typeof selections !== "object") return [];
  return Object.keys(selections).filter((k) => present(selections[k]));
}

export function evaluateDesignChecklist({ harmonyChosen = false, harmonySelections = {}, conceptSelections = [] } = {}) {
  const harmonyKeys = selectionKeys(harmonySelections);
  const concepts = (Array.isArray(conceptSelections) ? conceptSelections : []).filter(
    (s) => s && typeof s === "object",
  );
  const conceptHas = (keys) => concepts.some((s) => keys.some((k) => present(s[k])));

  const designSelections = Boolean(
    harmonyChosen || harmonyKeys.length > 0 || conceptHas(["style", "palette", "material"]),
  );
  const paintMaterialSchedule = Boolean(
    harmonyChosen ||
      harmonyKeys.some((k) => PAINT_KEYS.includes(k) || MATERIAL_KEYS.includes(k)) ||
      conceptHas(["palette", "material"]),
  );
  return { designSelections, paintMaterialSchedule };
}
