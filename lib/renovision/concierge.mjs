/** RENOVISION AI concierge: a deterministic guided assistant.
 *
 * This is NOT a large language model and is never described as one. It is a
 * pattern-based intent parser plus a project state machine over RENOVISION's
 * own vocabulary (objectives, conversions, design styles, budgets,
 * measurements). It remembers decisions recorded against a project, derives
 * the next genuinely-missing steps from that state, and explains trade-offs
 * using only figures a computed estimate actually contains.
 *
 * Honesty rules (binding): no invented prices, rates, dimensions, property
 * data or availability. An explanation built from an estimate quotes only
 * that estimate and the customer's own recorded budget. When an estimate is
 * absent or incomplete, the concierge says what is missing instead of
 * presenting numbers.
 */

import {DESIGN_STYLES, getDesignStyle} from "./design-library.mjs";

export const CONCIERGE_CAPABILITIES = Object.freeze({
  mode: "guided-rules",
  llm: false,
  voice: "UNAVAILABLE",
  description: "Deterministic guided assistant: pattern-based intent recognition and a project state machine over RENOVISION's own vocabulary (conversions, rooms, design styles, budgets, measurements). It is not a large language model, cannot answer questions outside the guided project workflow, and never invents prices, dimensions or property data. Voice interaction is unavailable: no approved voice implementation is connected.",
});

/** The platform journey, in order (directive §10). */
export const CONCIERGE_STAGES = Object.freeze([
  "describe", "discover", "capture", "design", "transform", "estimate", "furnish", "review", "export",
]);

export const CONCIERGE_OBJECTIVES = Object.freeze(["conversion", "furnish", "renovation", "unknown"]);

/** Conversion template ids (owned by conversions.mjs; mirrored here so the
 * concierge can parse intent before that module loads). */
export const CONVERSION_TYPES = Object.freeze([
  "garage-guest-suite",
  "basement-apartment",
  "attic-bedroom",
  "bedroom-office",
  "open-plan-merge",
  "commercial-conversion",
  "kitchen-reconfig",
  "bathroom-reconfig",
]);

const CONTEXT_FIELDS = Object.freeze(["objective", "conversionType", "style", "budgetCents", "stage"]);
const now = () => new Date().toISOString();

/* ---------------- context ---------------- */

export function createConciergeContext(projectId) {
  if (typeof projectId !== "string" || projectId.trim() === "") {
    throw new TypeError("createConciergeContext: projectId must be a non-empty string");
  }
  return {
    projectId,
    objective: null,
    conversionType: null,
    style: null,
    budgetCents: null,
    stage: "describe",
    decisions: [],
    missing: [],
    updatedAt: now(),
  };
}

const hasDecision = (context, key) => context.decisions.some((d) => d.key === key);
const objectiveKnown = (context) => Boolean(context.objective) && context.objective !== "unknown";

/** Intake items still genuinely missing, derived only from recorded state. */
function deriveMissing(context) {
  const missing = [];
  if (!objectiveKnown(context)) missing.push("objective");
  if (!context.style) missing.push("style");
  if (context.budgetCents === null) missing.push("budget");
  if ((context.objective === "conversion" || context.objective === "renovation")
      && !hasDecision(context, "measurements") && !hasDecision(context, "dimensions")) {
    missing.push("measurements");
  }
  if (context.objective === "conversion" && context.conversionType && !hasDecision(context, "feasibility")) {
    missing.push("feasibility-screen");
  }
  if (!hasDecision(context, "estimateRates") && !hasDecision(context, "ratesConfirmed")) {
    missing.push("estimate-rates");
  }
  return missing;
}

function validateDecisionValue(key, value) {
  if (key === "budgetCents" && value !== null && (!Number.isInteger(value) || value < 0)) {
    throw new TypeError("recordDecision: budgetCents must be a non-negative integer number of cents or null");
  }
  if (key === "objective" && value !== null && !CONCIERGE_OBJECTIVES.includes(value)) {
    throw new TypeError("recordDecision: unknown objective: " + value);
  }
  if (key === "conversionType" && value !== null && !CONVERSION_TYPES.includes(value)) {
    throw new TypeError("recordDecision: unknown conversionType: " + value);
  }
  if (key === "style" && value !== null && !getDesignStyle(value)) {
    throw new TypeError("recordDecision: unknown design style id: " + value);
  }
  if (key === "stage" && !CONCIERGE_STAGES.includes(value)) {
    throw new TypeError("recordDecision: unknown stage: " + value);
  }
}

/** Record one decision against the project. Returns a NEW context; the
 * input context is not modified. `source` is who supplied the value
 * ("customer", "operator", "concierge", ...). */
export function recordDecision(context, key, value, source) {
  if (!context || typeof context !== "object" || !Array.isArray(context.decisions)) {
    throw new TypeError("recordDecision: a concierge context is required");
  }
  if (typeof key !== "string" || key.trim() === "") {
    throw new TypeError("recordDecision: key must be a non-empty string");
  }
  validateDecisionValue(key, value);
  const entry = {key, value, source: typeof source === "string" && source !== "" ? source : "customer", at: now()};
  const next = {...context, decisions: [...context.decisions, entry], updatedAt: entry.at};
  if (CONTEXT_FIELDS.includes(key)) next[key] = value;
  next.missing = deriveMissing(next);
  return next;
}

/* ---------------- intent parsing ---------------- */

const CONVERT_VERB = /\b(convert|conversion|turn|transform|finish)\b/;

function detectConversionType(t) {
  if (/\bopen[-\s]?plan\b/.test(t) || /\bcombine\b[^.]*\brooms?\b/.test(t) || /\bknock (down|out)\b[^.]*\bwall/.test(t)) {
    return "open-plan-merge";
  }
  if (/\bcommercial\b/.test(t) && CONVERT_VERB.test(t)) return "commercial-conversion";
  if (/\bgarage\b/.test(t) && /\b(guest|suite|apartment|in-law|inlaw|adu|accessory|bedroom|living)\b/.test(t)) {
    return "garage-guest-suite";
  }
  if (/\bbasement\b/.test(t) && /\b(apartment|unit|suite|rental|bedroom|living)\b/.test(t)) {
    return "basement-apartment";
  }
  if (/\battic\b/.test(t) && /\b(bedroom|sleeping)\b/.test(t)) return "attic-bedroom";
  if (/\bbedroom\b/.test(t) && /\b(office|workspace|study)\b/.test(t)) return "bedroom-office";
  if (/\bgarage\b/.test(t) && CONVERT_VERB.test(t)) return "garage-guest-suite";
  if (/\bbasement\b/.test(t) && CONVERT_VERB.test(t)) return "basement-apartment";
  if (/\battic\b/.test(t) && CONVERT_VERB.test(t)) return "attic-bedroom";
  if (/\bkitchen\b/.test(t) && /\b(reconfig|layout|move|relocat|gut|open up)\b/.test(t)) return "kitchen-reconfig";
  if (/\bbathroom\b/.test(t) && /\b(reconfig|layout|move|relocat|gut|expand|enlarge)\b/.test(t)) return "bathroom-reconfig";
  return null;
}

function detectObjective(t, conversionType) {
  if (conversionType) return "conversion";
  if (/\b(convert|conversion)\b/.test(t)) return "conversion";
  if (/\b(furnish|furnishing|furniture|decorate|decorating)\b/.test(t)) return "furnish";
  if (/\b(renovat\w*|remodel\w*|redo|refresh|fix up)\b/.test(t)) return "renovation";
  return "unknown";
}

const ROOM_PATTERNS = [
  [/\bguest suite\b/, "guest suite"],
  [/\bliving room\b/, "living room"],
  [/\bdining room\b/, "dining room"],
  [/\bhome office\b/, "office"],
  [/\bgarage\b/, "garage"],
  [/\bbasement\b/, "basement"],
  [/\battic\b/, "attic"],
  [/\bkitchen\b/, "kitchen"],
  [/\bbathroom\b/, "bathroom"],
  [/\bbedroom\b/, "bedroom"],
  [/\boffice\b/, "office"],
];

function detectRooms(t) {
  const found = [];
  for (const [pattern, name] of ROOM_PATTERNS) {
    const m = t.match(pattern);
    if (m && !found.some((f) => f.name === name)) found.push({name, index: m.index});
  }
  return found.sort((a, b) => a.index - b.index).map((f) => f.name);
}

function moneyToCents(numStr, kilo) {
  const dollars = Number.parseFloat(String(numStr).replace(/,/g, "")) * (kilo ? 1000 : 1);
  if (!Number.isFinite(dollars) || dollars < 0) return null;
  const cents = Math.round(dollars * 100);
  return Number.isSafeInteger(cents) ? cents : null;
}

function detectBudgetCents(t) {
  let m = t.match(/\$\s*([\d,]+(?:\.\d{1,2})?)\s*([kK])?\b/);
  if (m) return moneyToCents(m[1], Boolean(m[2]));
  m = t.match(/\b([\d,]+(?:\.\d+)?)\s*(k|thousand)\b/i);
  if (m) return moneyToCents(m[1], true);
  m = t.match(/\b([\d,]+(?:\.\d+)?)\s*(?:dollars|usd)\b/i);
  if (m) return moneyToCents(m[1], false);
  m = t.match(/\b(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d{4,}(?:\.\d+)?)\b/);
  if (m) return moneyToCents(m[1], false);
  return null;
}

const STYLE_ALIASES = [
  ["warm modern", "modern-organic"],
  ["mid century modern", "mid-century-modern"],
  ["french country", "french-country"],
  ["luxury modern", "luxury-modern"],
  ["art deco", "art-deco"],
];

function detectStyle(t) {
  for (const [phrase, id] of STYLE_ALIASES) {
    if (t.includes(phrase)) return id;
  }
  const byNameLength = [...DESIGN_STYLES].sort((a, b) => b.name.length - a.name.length);
  for (const style of byNameLength) {
    if (t.includes(style.name.toLowerCase())) return style.id;
  }
  for (const style of DESIGN_STYLES) {
    if ((style.keywords ?? []).some((k) => t.includes(k.toLowerCase()))) return style.id;
  }
  if (/\bmodern\b/.test(t)) return "modern-organic";
  return null;
}

/** Parse a natural-language project request into structured intent.
 * Pattern-based over the platform's vocabulary only; anything unrecognized
 * stays null / "unknown" rather than being guessed. */
export function parseIntent(text) {
  if (typeof text !== "string") {
    return {objective: "unknown", conversionType: null, style: null, budgetCents: null, rooms: [], raw: text};
  }
  const t = text.toLowerCase();
  const conversionType = detectConversionType(t);
  return {
    objective: detectObjective(t, conversionType),
    conversionType,
    style: detectStyle(t),
    budgetCents: detectBudgetCents(t),
    rooms: detectRooms(t),
    raw: text,
  };
}

/** Apply a parsed intent to the context: every non-null field is recorded
 * as a customer decision, and the stage advances describe -> discover once
 * an objective is known. Returns a NEW context. */
export function applyIntent(context, intent) {
  if (!intent || typeof intent !== "object") {
    throw new TypeError("applyIntent: an intent object from parseIntent is required");
  }
  let next = context;
  for (const key of ["objective", "conversionType", "style", "budgetCents"]) {
    if (intent[key] !== null && intent[key] !== undefined) {
      next = recordDecision(next, key, intent[key], "customer");
    }
  }
  if (intent.objective && next.stage === "describe") {
    next = {...next, stage: "discover", updatedAt: now()};
  }
  return next;
}

/* ---------------- guidance ---------------- */

/** The next actions that are genuinely missing, derived only from what has
 * actually been recorded. Nothing here invents project data. */
export function nextActions(context) {
  if (!context || typeof context !== "object" || !Array.isArray(context.decisions)) {
    throw new TypeError("nextActions: a concierge context is required");
  }
  const actions = [];
  if (!objectiveKnown(context)) {
    actions.push({
      id: "clarify-objective",
      label: "Describe what you want to achieve",
      reason: "No project objective has been recorded yet, so RENOVISION cannot tell whether this is a conversion, a renovation or a furnishing project.",
      stage: "describe",
    });
    return actions;
  }
  if ((context.objective === "conversion" || context.objective === "renovation")
      && !hasDecision(context, "measurements") && !hasDecision(context, "dimensions")) {
    actions.push({
      id: "confirm-measurements",
      label: "Confirm the space measurements",
      reason: "No confirmed measurements are recorded. Layouts, fit checks and estimates need dimensions you confirm; RENOVISION does not guess room dimensions.",
      stage: "capture",
    });
  }
  if (!context.style) {
    actions.push({
      id: "choose-style",
      label: "Choose a design style",
      reason: "No design style is recorded. Style drives material suggestions, layouts and furnishing selections.",
      stage: "design",
    });
  }
  if (context.objective === "conversion" && context.conversionType && !hasDecision(context, "feasibility")) {
    actions.push({
      id: "run-feasibility-screen",
      label: "Run the conversion feasibility screen",
      reason: "A conversion is planned but zoning, permitting, structural, fire-safety and accessibility screening has not been recorded. Screening flags items for professional verification; it is not an approval.",
      stage: "transform",
    });
  }
  if (context.budgetCents === null) {
    actions.push({
      id: "set-budget",
      label: "Set a project budget",
      reason: "No budget is recorded, so an estimate cannot be compared against a target.",
      stage: "estimate",
    });
  }
  if (!hasDecision(context, "estimateRates") && !hasDecision(context, "ratesConfirmed")) {
    actions.push({
      id: "confirm-estimate-rates",
      label: "Confirm the estimate rates",
      reason: "No cost rates have been supplied or confirmed. Estimates are built only from rates you supply or explicitly confirm as planning assumptions; RENOVISION does not invent prices.",
      stage: "estimate",
    });
  }
  if (!hasDecision(context, "furnishing")) {
    actions.push({
      id: "furnish-space",
      label: "Furnish the space",
      reason: "No furnishing selection has been recorded. Furnish My Space proposes coordinated products from the catalog and checks each one against the room geometry.",
      stage: "furnish",
    });
  }
  if ((hasDecision(context, "estimate") || hasDecision(context, "furnishing")) && !hasDecision(context, "export")) {
    actions.push({
      id: "export-package",
      label: "Export the project package",
      reason: "Work has been recorded that can be exported as a project package for review and sharing.",
      stage: "export",
    });
  }
  return actions;
}

/* ---------------- trade-off explanations ---------------- */

const formatMoney = (cents) => "$" + (cents / 100).toLocaleString("en-US", {minimumFractionDigits: 2, maximumFractionDigits: 2});

/** Explain cost/design trade-offs using ONLY the provided estimate object
 * and the customer's recorded budget. If the estimate is null or
 * incomplete, the explanation names what is missing and presents no
 * figures at all. */
export function explainTradeoffs(context, estimate) {
  const lines = [];
  if (!estimate || typeof estimate !== "object") {
    lines.push("No estimate has been calculated yet, so there is nothing to compare.");
    lines.push("An estimate can only be built from rates you supply or explicitly confirm as planning assumptions; RENOVISION does not invent prices.");
    lines.push(context && context.budgetCents !== null && context.budgetCents !== undefined
      ? "A budget is recorded, and once an estimate exists it will be compared against it."
      : "No budget has been recorded yet; recording one lets a future estimate be compared against a target.");
    return lines;
  }
  const missingCategories = Array.isArray(estimate.missingCategories)
    ? estimate.missingCategories
    : (Array.isArray(estimate.missingScope) ? estimate.missingScope : []);
  const totalCents = Number.isInteger(estimate.totalCents) ? estimate.totalCents : null;
  if (totalCents === null || estimate.complete === false) {
    if (missingCategories.length > 0) {
      lines.push(`The estimate is incomplete: no confirmed rate for ${missingCategories.join(", ")}. No total is presented until every in-scope category has a sourced rate or a planning assumption you confirm.`);
    } else {
      lines.push("The estimate is incomplete, so no total is presented yet.");
    }
  } else {
    if (context && Number.isInteger(context.budgetCents)) {
      const diff = totalCents - context.budgetCents;
      if (diff > 0) {
        lines.push(`The estimated total of ${formatMoney(totalCents)} is ${formatMoney(diff)} over your recorded budget of ${formatMoney(context.budgetCents)}. Reducing scope or choosing lower-cost finishes in the largest categories is where the difference can be recovered.`);
      } else if (diff < 0) {
        lines.push(`The estimated total of ${formatMoney(totalCents)} is ${formatMoney(-diff)} under your recorded budget of ${formatMoney(context.budgetCents)}. The remaining headroom can absorb contingency or upgraded finishes.`);
      } else {
        lines.push(`The estimated total of ${formatMoney(totalCents)} exactly matches your recorded budget of ${formatMoney(context.budgetCents)}, leaving no headroom for contingency.`);
      }
    } else {
      lines.push(`The estimated total is ${formatMoney(totalCents)}. No budget has been recorded, so it cannot be compared against a target.`);
    }
    const rows = Array.isArray(estimate.lines) ? estimate.lines : (Array.isArray(estimate.categories) ? estimate.categories : []);
    const priced = rows
      .map((r) => (r && typeof r === "object"
        ? {name: r.category ?? r.name ?? r.id, amount: r.amountCents ?? r.totalCents ?? r.cents}
        : null))
      .filter((r) => r && typeof r.name === "string" && Number.isInteger(r.amount));
    if (priced.length > 0) {
      const top = priced.reduce((a, b) => (b.amount > a.amount ? b : a));
      lines.push(`The largest category is ${top.name} at ${formatMoney(top.amount)}; that is where design choices move the total most.`);
    }
  }
  if (typeof estimate.confidence === "string" && estimate.confidence !== "") {
    lines.push(estimate.confidence === "low"
      ? "Estimate confidence is low: treat the figures as planning guidance, not quotes."
      : `Estimate confidence: ${estimate.confidence}.`);
  }
  if (Array.isArray(estimate.assumptions) && estimate.assumptions.length > 0) {
    lines.push(`The estimate rests on ${estimate.assumptions.length} planning assumption(s) you confirmed. Assumptions are labeled as such; they are not market data.`);
  }
  if (context && context.conversionType) {
    lines.push("Conversion work also requires professional verification of permits, structure and life-safety items before construction; screening flags are not approvals.");
  }
  return lines;
}
