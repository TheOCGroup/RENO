/**
 * RENOVISION Design Harmony Engine.
 *
 * Coordinates every design decision around the customer's selected style
 * family: coordinated palettes, compatibility evaluation across eight
 * harmony rules, and locked selections with design memory (versions +
 * revision history). Pure and deterministic — no I/O, no randomness.
 *
 * PAINT DATA HONESTY (binding): every paint color in this module is a
 * GENERIC DIGITAL COLOR REFERENCE — a descriptive name plus a hex value —
 * provided for on-screen coordination only. Screen colors are approximate
 * and vary by display. These are NOT manufacturer products: they carry no
 * manufacturer name, no manufacturer color code, no price, and no
 * availability, and must never be presented as real paint SKUs. Physical
 * paint appearance must be verified with real samples before purchase.
 *
 * RECOMMENDATIONS ARE SUGGESTIONS, NEVER RESTRICTIONS: harmony findings
 * advise; the customer can override any suggestion. A locked selection is
 * the one hard rule, and it protects the CUSTOMER's own approved decision
 * from silent replacement — an explicit confirmChange always overrides it.
 */

const clone = (value) => structuredClone(value);

/* ------------------------------------------------------------------ */
/* Color math                                                          */
/* ------------------------------------------------------------------ */

function parseHex(hex) {
  if (typeof hex !== "string") throw new TypeError("hex color must be a string");
  const m = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) throw new TypeError("invalid hex color: " + String(hex));
  let h = m[1];
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

const round4 = (n) => Math.round(n * 10000) / 10000;

/**
 * colorInfo(hex) -> { hue (0-360), saturation (0-1), lightness (0-1),
 * undertone: "warm" | "cool" | "neutral" } using standard HSL math.
 *
 * Undertone thresholds (documented, deterministic):
 *  - saturation below 0.06: the hue is too weak to read as warm or cool,
 *    so the color is "neutral" (true greys and near-greys land here).
 *  - warm band: hue in [345, 360] or [0, 75] — reds, oranges, yellows.
 *    (Warm whites still classify warm: their HSL saturation is moderate
 *    even though they look pale, because HSL saturation is relative.)
 *  - cool band: hue in (75, 345) — greens, blues, violets.
 */
export function colorInfo(hex) {
  const { r, g, b } = parseHex(hex);
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const lightness = (max + min) / 2;
  const delta = max - min;
  let saturation = 0, hue = 0;
  if (delta > 0) {
    saturation = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
    if (max === rn) hue = ((gn - bn) / delta + (gn < bn ? 6 : 0)) * 60;
    else if (max === gn) hue = ((bn - rn) / delta + 2) * 60;
    else hue = ((rn - gn) / delta + 4) * 60;
  }
  hue = ((hue % 360) + 360) % 360;
  let undertone = "neutral";
  if (saturation >= 0.06) undertone = hue <= 75 || hue >= 345 ? "warm" : "cool";
  return { hue: round4(hue), saturation: round4(saturation), lightness: round4(lightness), undertone };
}

/* ------------------------------------------------------------------ */
/* Style families                                                      */
/* ------------------------------------------------------------------ */

/**
 * The 13 required style families. The list is data, not platform logic:
 * new families can be appended without touching the engine. Palettes are
 * generic digital color references (see the honesty note above).
 * custom-mixed is the customer's own combination — it has no house
 * palette, so family-based harmony rules are not evaluated for it.
 */
export const HARMONY_STYLE_FAMILIES = Object.freeze([
  {
    id: "warm-modern", name: "Warm Modern", undertone: "warm",
    palette: { wall: "#F3EAD8", trim: "#FBF7EE", ceiling: "#FFFFFF", accent: "#B26E35" },
    flooringKeywords: ["natural oak", "white oak", "warm walnut", "honey hardwood"],
    cabinetKeywords: ["white oak", "warm white", "natural maple"],
    lighting: "warm",
    furnitureTags: ["natural wood", "linen", "curved", "low-profile"],
    description: "Warm ivory walls, natural oak, clean lines and warm light — modern, but never cold.",
  },
  {
    id: "timeless-elegance", name: "Timeless Elegance", undertone: "warm",
    palette: { wall: "#EFE9DC", trim: "#FAF6EC", ceiling: "#FFFFFF", accent: "#7A6A53" },
    flooringKeywords: ["dark walnut", "mahogany", "herringbone oak"],
    cabinetKeywords: ["cream", "ivory painted", "walnut"],
    lighting: "warm",
    furnitureTags: ["tufted", "classic", "brass", "velvet"],
    description: "Classic proportions, rich woods and tailored detail that does not date.",
  },
  {
    id: "organic-contemporary", name: "Organic Contemporary", undertone: "warm",
    palette: { wall: "#E9E2D0", trim: "#F7F3E8", ceiling: "#FCFAF4", accent: "#6B7250" },
    flooringKeywords: ["white oak", "bamboo", "cork"],
    cabinetKeywords: ["rift oak", "clay", "sage"],
    lighting: "warm",
    furnitureTags: ["organic", "woven", "stone", "rounded"],
    description: "Earthy textures, rounded forms and natural materials with a contemporary outline.",
  },
  {
    id: "modern-sophistication", name: "Modern Sophistication", undertone: "neutral",
    palette: { wall: "#E4E2DE", trim: "#F4F3F0", ceiling: "#FFFFFF", accent: "#3E4348" },
    flooringKeywords: ["grey oak", "polished concrete", "ebonized wood"],
    cabinetKeywords: ["matte grey", "charcoal", "flat panel"],
    lighting: "neutral",
    furnitureTags: ["sculptural", "metal", "glass", "tailored"],
    description: "Restrained neutrals, sculptural pieces and a gallery-like calm.",
  },
  {
    id: "transitional", name: "Transitional", undertone: "neutral",
    palette: { wall: "#EAE6DC", trim: "#F8F5EE", ceiling: "#FFFFFF", accent: "#5C6650" },
    flooringKeywords: ["medium oak", "hickory"],
    cabinetKeywords: ["shaker white", "greige", "navy"],
    lighting: "warm",
    furnitureTags: ["shaker", "rolled arm", "mixed metals", "patterned"],
    description: "The bridge between traditional comfort and contemporary simplicity.",
  },
  {
    id: "scandinavian", name: "Scandinavian", undertone: "cool",
    palette: { wall: "#EEF0EE", trim: "#FAFBF9", ceiling: "#FFFFFF", accent: "#7C8DA6" },
    flooringKeywords: ["pale ash", "birch", "light pine"],
    cabinetKeywords: ["white", "pale grey", "birch"],
    lighting: "neutral",
    furnitureTags: ["light wood", "wool", "simple", "functional"],
    description: "Pale woods, bright whites and functional simplicity with soft textiles.",
  },
  {
    id: "contemporary-luxury", name: "Contemporary Luxury", undertone: "neutral",
    palette: { wall: "#E6E1D8", trim: "#F5F1E9", ceiling: "#FBF9F4", accent: "#8C6D3F" },
    flooringKeywords: ["wide plank walnut", "marble", "dark oak"],
    cabinetKeywords: ["high gloss", "walnut veneer", "lacquer"],
    lighting: "warm",
    furnitureTags: ["velvet", "marble", "brass", "statement"],
    description: "Statement materials, plush textures and polished detail.",
  },
  {
    id: "mid-century-modern", name: "Mid-Century Modern", undertone: "warm",
    palette: { wall: "#F0E6D2", trim: "#FAF3E3", ceiling: "#FFFFFF", accent: "#C96F2E" },
    flooringKeywords: ["teak", "walnut", "cork"],
    cabinetKeywords: ["walnut", "teak", "mustard"],
    lighting: "warm",
    furnitureTags: ["teak", "tapered legs", "geometric", "retro"],
    description: "Teak and walnut, tapered legs and confident mid-century geometry.",
  },
  {
    id: "traditional", name: "Traditional", undertone: "warm",
    palette: { wall: "#EFE7D3", trim: "#F9F4E6", ceiling: "#FFFFFF", accent: "#5E3F2E" },
    flooringKeywords: ["cherry", "dark oak", "walnut"],
    cabinetKeywords: ["raised panel", "cream", "cherry"],
    lighting: "warm",
    furnitureTags: ["carved", "classic", "damask", "antique"],
    description: "Raised panels, rich woods and familiar, formal comfort.",
  },
  {
    id: "coastal", name: "Coastal", undertone: "cool",
    palette: { wall: "#EDF1EC", trim: "#FAFCF8", ceiling: "#FFFFFF", accent: "#4E7E96" },
    flooringKeywords: ["whitewashed oak", "driftwood", "seagrass"],
    cabinetKeywords: ["white", "sea glass", "light blue"],
    lighting: "neutral",
    furnitureTags: ["rattan", "linen", "driftwood", "breezy"],
    description: "Sea-glass tones, weathered woods and an easy, breezy lightness.",
  },
  {
    id: "industrial", name: "Industrial", undertone: "neutral",
    palette: { wall: "#DDD9D2", trim: "#EFEBE4", ceiling: "#F4F1EC", accent: "#43484D" },
    flooringKeywords: ["concrete", "reclaimed wood", "dark steel tile"],
    cabinetKeywords: ["blackened steel", "reclaimed wood", "matte black"],
    lighting: "neutral",
    furnitureTags: ["metal", "leather", "exposed", "raw"],
    description: "Raw materials, exposed structure and utilitarian honesty.",
  },
  {
    id: "minimalist", name: "Minimalist", undertone: "neutral",
    palette: { wall: "#ECECEA", trim: "#F7F7F5", ceiling: "#FFFFFF", accent: "#2F3235" },
    flooringKeywords: ["pale maple", "microcement", "light concrete"],
    cabinetKeywords: ["handleless white", "matte white", "pale oak"],
    lighting: "neutral",
    furnitureTags: ["simple", "uncluttered", "flush", "monochrome"],
    description: "Only what earns its place — flush lines, quiet surfaces, no visual noise.",
  },
  {
    id: "custom-mixed", name: "Custom / Mixed Style", undertone: "neutral",
    palette: { wall: null, trim: null, ceiling: null, accent: null },
    flooringKeywords: [],
    cabinetKeywords: [],
    lighting: "neutral",
    furnitureTags: [],
    description: "Your own combination. The engine still checks color, undertone, spatial and budget harmony, but there is no house palette to conform to.",
  },
]);

export function getHarmonyFamily(familyId) {
  return HARMONY_STYLE_FAMILIES.find((f) => f.id === familyId) || null;
}

/* ------------------------------------------------------------------ */
/* Paint families — generic digital color references ONLY (see header) */
/* ------------------------------------------------------------------ */

export const PAINT_FAMILIES = Object.freeze([
  { id: "warm-whites", name: "Warm Whites", colors: [
    { id: "warm-ivory", name: "Warm Ivory", hex: "#F3EAD8", undertone: "warm" },
    { id: "creamy-white", name: "Creamy White", hex: "#F7F0DC", undertone: "warm" },
    { id: "alabaster-glow", name: "Alabaster Glow", hex: "#F5EFE0", undertone: "warm" },
  ]},
  { id: "cool-whites", name: "Cool Whites", colors: [
    { id: "crisp-white", name: "Crisp White", hex: "#EFF1F2", undertone: "cool" },
    { id: "glacier-white", name: "Glacier White", hex: "#E9EEF0", undertone: "cool" },
    { id: "pearl-mist", name: "Pearl Mist", hex: "#EEF0EA", undertone: "cool" },
  ]},
  { id: "creams", name: "Creams", colors: [
    { id: "soft-cream", name: "Soft Cream", hex: "#F6E8C8", undertone: "warm" },
    { id: "vanilla-cream", name: "Vanilla Cream", hex: "#F9EFD4", undertone: "warm" },
    { id: "buttercream", name: "Buttercream", hex: "#F3E3B3", undertone: "warm" },
  ]},
  { id: "greiges", name: "Greiges", colors: [
    { id: "soft-greige", name: "Soft Greige", hex: "#C9BBA7", undertone: "warm" },
    { id: "stone-greige", name: "Stone Greige", hex: "#B3A48F", undertone: "warm" },
    { id: "mushroom-greige", name: "Mushroom Greige", hex: "#A79B88", undertone: "warm" },
  ]},
  { id: "taupes", name: "Taupes", colors: [
    { id: "warm-taupe", name: "Warm Taupe", hex: "#A68F77", undertone: "warm" },
    { id: "cocoa-taupe", name: "Cocoa Taupe", hex: "#8A7260", undertone: "warm" },
    { id: "drift-taupe", name: "Drift Taupe", hex: "#B49B82", undertone: "warm" },
  ]},
  { id: "earth-tones", name: "Earth Tones", colors: [
    { id: "terracotta", name: "Terracotta", hex: "#C06B45", undertone: "warm" },
    { id: "clay", name: "Clay", hex: "#A85B38", undertone: "warm" },
    { id: "sage-earth", name: "Sage Earth", hex: "#8A9164", undertone: "cool" },
  ]},
  { id: "muted-greens", name: "Muted Greens", colors: [
    { id: "sage", name: "Sage", hex: "#A8B39A", undertone: "cool" },
    { id: "eucalyptus", name: "Eucalyptus", hex: "#8FA998", undertone: "cool" },
    { id: "forest-mist", name: "Forest Mist", hex: "#6E8577", undertone: "cool" },
  ]},
  { id: "blues", name: "Blues", colors: [
    { id: "slate-blue", name: "Slate Blue", hex: "#7C8DA6", undertone: "cool" },
    { id: "dusty-blue", name: "Dusty Blue", hex: "#93A7BC", undertone: "cool" },
    { id: "deep-navy", name: "Deep Navy", hex: "#2E4057", undertone: "cool" },
    { id: "sky-wash", name: "Sky Wash", hex: "#B9CBD8", undertone: "cool" },
  ]},
  { id: "charcoals", name: "Charcoals", colors: [
    { id: "charcoal", name: "Charcoal", hex: "#3A3F44", undertone: "cool" },
    { id: "graphite", name: "Graphite", hex: "#4A4A4A", undertone: "neutral" },
    { id: "soft-black", name: "Soft Black", hex: "#26282B", undertone: "cool" },
  ]},
  { id: "accents", name: "Accent Colors", colors: [
    { id: "terracotta-accent", name: "Terracotta Accent", hex: "#B26E35", undertone: "warm" },
    { id: "brass-gold", name: "Brass Gold", hex: "#B08D3C", undertone: "warm" },
    { id: "forest-accent", name: "Forest Accent", hex: "#3F5D4C", undertone: "cool" },
    { id: "burgundy", name: "Burgundy", hex: "#6E2F35", undertone: "warm" },
  ]},
]);

/* ------------------------------------------------------------------ */
/* Atmospheres                                                         */
/* ------------------------------------------------------------------ */

export const ATMOSPHERES = Object.freeze([
  "warm", "elegant", "airy", "cozy", "dramatic", "sophisticated", "natural", "contemporary", "calm",
]);

/** Deterministic trait filters over the paint library, via colorInfo. */
const ATMOSPHERE_TRAITS = {
  warm: (i) => i.undertone === "warm",
  elegant: (i) => i.lightness >= 0.6 && i.saturation <= 0.45,
  airy: (i) => i.lightness >= 0.82,
  cozy: (i) => i.undertone === "warm" && i.lightness >= 0.35 && i.lightness <= 0.8,
  dramatic: (i) => i.lightness <= 0.45,
  sophisticated: (i) => i.saturation <= 0.3 && i.lightness <= 0.75,
  natural: (i) => i.hue >= 20 && i.hue <= 170 && i.saturation <= 0.5,
  contemporary: (i) => i.undertone !== "warm" && i.lightness >= 0.5,
  calm: (i) => i.saturation <= 0.28 && i.lightness >= 0.55,
};

/** All paint colors whose computed traits match the atmosphere. */
export function colorsForAtmosphere(atmosphere) {
  const trait = ATMOSPHERE_TRAITS[atmosphere];
  if (!trait) throw new Error("unknown atmosphere: " + String(atmosphere));
  const out = [];
  for (const family of PAINT_FAMILIES)
    for (const color of family.colors)
      if (trait(colorInfo(color.hex))) out.push({ ...color, paintFamilyId: family.id });
  return out;
}

/* ------------------------------------------------------------------ */
/* Harmony evaluation                                                  */
/* ------------------------------------------------------------------ */

const SEVERITY = { ok: 0, attention: 1, conflict: 2 };
const opposed = (a, b) => (a === "warm" && b === "cool") || (a === "cool" && b === "warm");
const keywordHit = (keyword, familyKeywords) => {
  if (typeof keyword !== "string" || !keyword.trim()) return false;
  const k = keyword.trim().toLowerCase();
  return familyKeywords.some((fk) => {
    const f = fk.toLowerCase();
    return k.includes(f) || f.includes(k);
  });
};

/**
 * evaluateHarmony({ familyId, selections, room, budget })
 * selections may include { paintHex, flooringKeyword, cabinetKeyword,
 * countertopKeyword, lighting, furnitureTags, finishes,
 * spatialFootprintSqFt, otherRooms }.
 * Returns { status, findings } with exactly one finding per rule:
 * color, undertone, material, finish, style, spatial, budget,
 * whole-property. A rule with insufficient input reports
 * "not-evaluated" — never a silent "ok".
 */
export function evaluateHarmony({ familyId, selections = {}, room = null, budget = null } = {}) {
  const family = getHarmonyFamily(familyId);
  if (!family) throw new Error("unknown harmony style family: " + String(familyId));
  const custom = family.id === "custom-mixed";
  const findings = [];
  const add = (rule, level, message, suggestion = null) => findings.push({ rule, level, message, suggestion });

  let paint = null, paintInvalid = false;
  if (selections.paintHex) {
    try { paint = colorInfo(selections.paintHex); } catch { paintInvalid = true; }
  }

  /* color — paint vs the family's wall reference (or validity alone) */
  if (paintInvalid) {
    add("color", "conflict", "The selected paint value is not a valid hex color, so no color coordination is possible.", "Choose a color from the paint library.");
  } else if (!paint) {
    add("color", "not-evaluated", "No paint color selected yet.");
  } else if (custom) {
    add("color", "ok", "Custom palette: the paint color is a valid digital reference; there is no house palette to conflict with.");
  } else {
    const wall = colorInfo(family.palette.wall);
    if (paint.undertone === wall.undertone || paint.undertone === "neutral" || wall.undertone === "neutral")
      add("color", "ok", `Paint sits in the same color direction as the ${family.name} wall reference (${family.palette.wall}).`);
    else
      add("color", "attention", `Paint leans ${paint.undertone} while the ${family.name} wall reference leans ${wall.undertone}.`, `Consider the family wall reference ${family.palette.wall} or an accent that bridges the two.`);
  }

  /* undertone — paint undertone vs family undertone (or vs lighting) */
  if (!paint) {
    add("undertone", "not-evaluated", paintInvalid ? "Paint color is invalid; undertone cannot be evaluated." : "No paint color selected yet.");
  } else if (custom) {
    const light = selections.lighting;
    if (light && light !== "neutral" && paint.undertone !== "neutral" && opposed(paint.undertone, light))
      add("undertone", "attention", `${paint.undertone === "warm" ? "Warm" : "Cool"} paint under ${light} lighting will fight the light's temperature.`, "Align the lighting temperature with the paint undertone, or test both under the room's actual light.");
    else
      add("undertone", "ok", "Custom palette: no undertone conflict between the paint and the stated lighting.");
  } else if (paint.undertone === family.undertone) {
    add("undertone", "ok", `Paint undertone (${paint.undertone}) matches the ${family.name} undertone.`);
  } else if (opposed(paint.undertone, family.undertone)) {
    add("undertone", "conflict", `Paint undertone is ${paint.undertone} but ${family.name} is built on a ${family.undertone} undertone — they are directly opposed.`, `Choose a ${family.undertone}-undertone paint (for example the family wall reference ${family.palette.wall}), or switch the style family if the paint is a locked decision.`);
  } else {
    add("undertone", "attention", `Paint undertone is ${paint.undertone}; ${family.name} leans ${family.undertone}. Not opposed, but not aligned either.`, "A neutral paint can work — support it with textiles and finishes in the family undertone.");
  }

  /* material — flooring / cabinetry / countertop keywords vs family */
  const materialInputs = [
    ["flooring", selections.flooringKeyword, family.flooringKeywords],
    ["cabinetry", selections.cabinetKeyword, family.cabinetKeywords],
    ["countertop", selections.countertopKeyword, [...family.cabinetKeywords, ...family.flooringKeywords]],
  ].filter(([, v]) => typeof v === "string" && v.trim());
  if (custom) {
    add("material", "not-evaluated", "Custom palette: no family material list to compare against.");
  } else if (!materialInputs.length) {
    add("material", "not-evaluated", "No flooring, cabinetry or countertop selection yet.");
  } else {
    const hits = materialInputs.filter(([, v, list]) => keywordHit(v, list)).map(([label]) => label);
    if (hits.length)
      add("material", "ok", `Coordinated with ${family.name}: ${hits.join(", ")}.`);
    else
      add("material", "attention", `None of the selected materials match the ${family.name} material palette.`, `Family flooring: ${family.flooringKeywords.join(", ")} · cabinetry: ${family.cabinetKeywords.join(", ")}.`);
  }

  /* finish — metal/finish temperature consistency */
  const finishes = Array.isArray(selections.finishes) ? selections.finishes.map((f) => String(f).toLowerCase()) : [];
  const WARM_METALS = ["brass", "gold", "bronze", "copper"];
  const COOL_METALS = ["chrome", "nickel", "stainless", "silver", "platinum"];
  const hasWarmMetal = finishes.some((f) => WARM_METALS.some((m) => f.includes(m)));
  const hasCoolMetal = finishes.some((f) => COOL_METALS.some((m) => f.includes(m)));
  if (!finishes.length) {
    add("finish", "not-evaluated", "No hardware or fixture finishes selected yet.");
  } else if (hasWarmMetal && hasCoolMetal) {
    add("finish", "attention", "Warm and cool metal finishes are mixed (for example brass with chrome). Mixing can work when one dominates — as stated, neither does.", "Pick one metal temperature as primary and repeat it at least three times before adding the second.");
  } else if (hasWarmMetal || hasCoolMetal) {
    add("finish", "ok", `Finish temperature is consistent (${hasWarmMetal ? "warm" : "cool"} metals).`);
  } else {
    add("finish", "not-evaluated", "Finishes selected, but none are recognized metal finishes, so finish consistency cannot be evaluated.");
  }

  /* style — furniture tags vs family furniture tags */
  const tags = Array.isArray(selections.furnitureTags) ? selections.furnitureTags.map((t) => String(t).toLowerCase()) : [];
  if (custom) {
    add("style", "not-evaluated", "Custom palette: no family furniture style to compare against.");
  } else if (!tags.length) {
    add("style", "not-evaluated", "No furniture selected yet.");
  } else if (tags.some((t) => family.furnitureTags.some((ft) => ft.toLowerCase() === t))) {
    add("style", "ok", `Furniture speaks the ${family.name} language.`);
  } else {
    add("style", "attention", `Furniture tags (${tags.join(", ")}) do not overlap the ${family.name} style.`, `Family furniture direction: ${family.furnitureTags.join(", ")}.`);
  }

  /* spatial — furniture footprint vs confirmed room area */
  const fp = selections.spatialFootprintSqFt;
  if (room && Number.isFinite(room.widthIn) && room.widthIn > 0 && Number.isFinite(room.depthIn) && room.depthIn > 0 && Number.isFinite(fp)) {
    const areaSqFt = (room.widthIn * room.depthIn) / 144;
    const ratio = fp / areaSqFt;
    const pct = Math.round(ratio * 100);
    if (ratio > 0.65)
      add("spatial", "conflict", `Planned furniture footprint is ${pct}% of the ${Math.round(areaSqFt)} sq ft room (from the confirmed dimensions) — circulation will be compromised. This is an advisory clearance check, not a building-code certification.`, "Remove or downsize pieces until the footprint is under roughly half the room.");
    else if (ratio > 0.5)
      add("spatial", "attention", `Planned furniture footprint is ${pct}% of the ${Math.round(areaSqFt)} sq ft room — workable, but circulation will feel tight. This is an advisory clearance check, not a building-code certification.`);
    else
      add("spatial", "ok", `Furniture footprint is ${pct}% of the ${Math.round(areaSqFt)} sq ft room, leaving comfortable circulation (advisory check, not a code certification).`);
  } else {
    add("spatial", "not-evaluated", "Needs confirmed room dimensions and a furniture footprint to evaluate.");
  }

  /* budget — estimate vs stated budget */
  if (budget && Number.isFinite(budget.estimatedCents) && Number.isFinite(budget.budgetCents) && budget.budgetCents > 0) {
    if (budget.estimatedCents > budget.budgetCents)
      add("budget", "conflict", "The current estimate exceeds the stated budget.", "Reduce scope, choose good-tier alternatives, or raise the budget deliberately — the selections themselves are preserved either way.");
    else if (budget.estimatedCents >= budget.budgetCents * 0.9)
      add("budget", "attention", "The current estimate is within 10% of the stated budget — little room for surprises.", "Hold a contingency or identify one selection that could step down a tier.");
    else
      add("budget", "ok", "The current estimate sits comfortably within the stated budget.");
  } else {
    add("budget", "not-evaluated", "No estimate and budget pair provided.");
  }

  /* whole-property — family consistency across rooms */
  if (Array.isArray(selections.otherRooms)) {
    const distinct = new Set(selections.otherRooms);
    if (!custom) distinct.add(family.id);
    if (distinct.size > 1)
      add("whole-property", "attention", `This property mixes style families (${[...distinct].join(", ")}). Mixed properties can work — keep one shared thread (flooring, hardware finish, or trim color) running through every room.`);
    else
      add("whole-property", "ok", "One style family runs through the property — whole-property consistency holds.");
  } else {
    add("whole-property", "not-evaluated", "No other rooms' style families provided.");
  }

  let status = "harmonious";
  for (const f of findings) {
    if (f.level === "conflict") { status = "conflict"; break; }
    if (f.level === "attention") status = "attention";
  }
  return { status, findings };
}

/* ------------------------------------------------------------------ */
/* Design memory — locked selections, versions, revision history       */
/* ------------------------------------------------------------------ */

/**
 * A design state: the customer's selections, which of them are LOCKED
 * (approved decisions that must never be silently replaced), the full
 * revision history, and saved design versions. All functions are pure:
 * they return new state objects and never mutate their input.
 */
export function createDesignState() {
  return { selections: {}, locked: {}, history: [], versions: [], activeVersionId: null };
}

export function setSelection(state, key, value) {
  if (state.locked && state.locked[key])
    throw new Error(`selection "${key}" is locked — it cannot be replaced silently; use confirmChange for an explicit, recorded override`);
  const next = clone(state);
  next.selections[key] = clone(value);
  return next;
}

export function lockSelection(state, key) {
  const next = clone(state);
  next.locked[key] = true;
  return next;
}

export function unlockSelection(state, key) {
  const next = clone(state);
  delete next.locked[key];
  return next;
}

/** Which harmony rules each selection key feeds (for degradation checks). */
const KEY_RULES = {
  paintHex: ["color", "undertone"],
  flooringKeyword: ["material"],
  cabinetKeyword: ["material"],
  countertopKeyword: ["material"],
  lighting: ["finish", "undertone"],
  finishes: ["finish"],
  furnitureTags: ["style"],
};

const levelOf = (evaluation, rule) => {
  const f = evaluation.findings.find((x) => x.rule === rule);
  return f && f.level !== "not-evaluated" ? SEVERITY[f.level] : null;
};

/**
 * proposeChange(state, key, value, harmonyInput) — evaluates a change
 * WITHOUT applying it. Returns { applied: false, conflicts, evaluation }
 * where conflicts lists locked keys that stand in the way: the changed
 * key itself when it is locked, plus any other locked key whose harmony
 * rule would degrade (ok -> attention/conflict, attention -> conflict)
 * under the would-be selections. The state is never mutated.
 */
export function proposeChange(state, key, value, harmonyInput = {}) {
  const familyId = harmonyInput.familyId ?? "custom-mixed";
  const wouldBe = { ...clone(state.selections), [key]: clone(value) };
  const evaluation = evaluateHarmony({ familyId, selections: wouldBe, room: harmonyInput.room ?? null, budget: harmonyInput.budget ?? null });
  const conflicts = [];
  if (state.locked && state.locked[key]) conflicts.push(key);
  let baseline = null;
  try {
    baseline = evaluateHarmony({ familyId, selections: clone(state.selections), room: harmonyInput.room ?? null, budget: harmonyInput.budget ?? null });
  } catch { baseline = null; }
  if (baseline) {
    for (const [lockedKey, isLocked] of Object.entries(state.locked || {})) {
      if (!isLocked || lockedKey === key || conflicts.includes(lockedKey)) continue;
      const rules = KEY_RULES[lockedKey] || [];
      const degraded = rules.some((rule) => {
        const before = levelOf(baseline, rule), after = levelOf(evaluation, rule);
        return before !== null && after !== null && after > before;
      });
      if (degraded) conflicts.push(lockedKey);
    }
  }
  return { applied: false, conflicts, evaluation };
}

/**
 * confirmChange — the explicit customer override. Applies the change even
 * to a locked selection (the lock stays in place at the new value) and
 * appends a revision-history entry { key, from, to, at }.
 */
export function confirmChange(state, key, value) {
  const next = clone(state);
  const from = state.selections[key] === undefined ? null : clone(state.selections[key]);
  next.selections[key] = clone(value);
  next.history = [...next.history, { key, from, to: clone(value), at: new Date().toISOString() }];
  return next;
}

export function saveVersion(state, label) {
  const next = clone(state);
  const id = "version-" + (next.versions.length + 1);
  next.versions = [...next.versions, {
    id,
    label: label ?? id,
    at: new Date().toISOString(),
    selections: clone(state.selections),
  }];
  next.activeVersionId = id;
  return next;
}

export function restoreVersion(state, versionId) {
  const version = state.versions.find((v) => v.id === versionId);
  if (!version) throw new Error("unknown design version: " + String(versionId));
  const next = clone(state);
  next.selections = clone(version.selections);
  next.activeVersionId = versionId;
  next.history = [...next.history, { key: "__version__", from: state.activeVersionId, to: versionId, at: new Date().toISOString() }];
  return next;
}
