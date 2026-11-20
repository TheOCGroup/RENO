/** RENOVISION space-conversion planning.
 *
 * Honesty contract (binding, per AI-PLATFORM-ARCHITECTURE-2026-11-19):
 * - Feasibility screening is a structured self-assessment over the
 *   customer's own answers. It is NEVER an approval, a compliance
 *   determination, or a permit decision, and its output language never
 *   claims otherwise. Anything unconfirmed routes to a qualified
 *   professional or the local authority.
 * - Conceptual layouts are planning geometry generated from the
 *   customer's stated room dimensions. They are not construction
 *   drawings, carry no accuracy claim, and require professional
 *   verification before any work.
 * - This module invents nothing: no dimensions, no code citations, no
 *   jurisdiction-specific rules. Questions are generic prompts; the
 *   answers — and their limits — belong to the customer.
 *
 * All geometry is in inches. Zone placement is deterministic: the same
 * template and dimensions always produce the same two alternatives.
 */

export const SCREENING_TOPICS = Object.freeze([
  "zoning",
  "permitting",
  "structural",
  "fire-safety",
  "accessibility",
  "building-code",
]);

const TOPIC_LABELS = Object.freeze({
  zoning: "Zoning",
  permitting: "Permitting",
  structural: "Structural",
  "fire-safety": "Fire safety & egress",
  accessibility: "Accessibility",
  "building-code": "Building code",
});

/** Topics where a stated concern always requires a professional — a
 *  self-assessment cannot clear structure or life-safety. */
const PROFESSIONAL_TOPICS = new Set(["structural", "fire-safety"]);

const screeningItem = (id, topic, question) => Object.freeze({id, topic, question});
const space = (key, label) => Object.freeze({key, label});
const template = (t) => Object.freeze({
  ...t,
  requiredInputs: Object.freeze([...t.requiredInputs]),
  screening: Object.freeze(t.screening.map((s) => screeningItem(s[0], s[1], s[2]))),
  spaces: Object.freeze(t.spaces.map((s) => space(s[0], s[1]))),
});

export const CONVERSION_TEMPLATES = Object.freeze([
  template({
    id: "garage-guest-suite",
    label: "Garage to guest suite",
    fromSpace: "Garage",
    toSpace: "Guest suite (bedroom + bathroom)",
    requiredInputs: ["widthIn", "depthIn", "ceilingHeightIn", "plumbingAccess", "entranceOption"],
    screening: [
      ["zoning-dwelling-use", "zoning", "Does local zoning allow a habitable guest suite in this garage structure?"],
      ["permit-reviewed", "permitting", "Has the conversion been reviewed for a building permit with your local authority?"],
      ["structure-slab", "structural", "Is the foundation and slab condition documented as sound by inspection or records?"],
      ["fire-egress", "fire-safety", "Will the sleeping area have a code-sized egress window or an exterior door?"],
      ["code-ceiling-height", "building-code", "Is the finished ceiling height known to meet the local minimum for habitable rooms?"],
      ["access-step-free", "accessibility", "Can a step-free entry be provided from grade?"],
    ],
    spaces: [["sleeping", "Sleeping area"], ["bathroom", "Bathroom"], ["living", "Sitting area"], ["storage", "Closet & storage"]],
  }),
  template({
    id: "basement-apartment",
    label: "Basement to apartment",
    fromSpace: "Basement",
    toSpace: "Self-contained apartment",
    requiredInputs: ["widthIn", "depthIn", "ceilingHeightIn", "egressWindows", "moistureHistory"],
    screening: [
      ["zoning-dwelling-unit", "zoning", "Does local zoning allow a separate dwelling unit in the basement?"],
      ["permit-reviewed", "permitting", "Has the conversion been reviewed for a building permit with your local authority?"],
      ["structure-moisture", "structural", "Has the foundation been checked for moisture intrusion and structural soundness?"],
      ["fire-egress", "fire-safety", "Does every sleeping area have a compliant egress window or exterior door?"],
      ["fire-separation", "fire-safety", "Is there a fire-rated separation between the unit and any furnace or utility area?"],
      ["code-ceiling-height", "building-code", "Is the finished ceiling height known to meet the local minimum for habitable rooms?"],
      ["access-route", "accessibility", "Is the access route acceptable for the intended occupants' mobility needs?"],
    ],
    spaces: [["living", "Living area"], ["sleeping", "Sleeping area"], ["kitchenette", "Kitchenette"], ["bathroom", "Bathroom"]],
  }),
  template({
    id: "attic-bedroom",
    label: "Attic to bedroom",
    fromSpace: "Attic",
    toSpace: "Bedroom",
    requiredInputs: ["widthIn", "depthIn", "peakHeightIn", "floorStructureKnown"],
    screening: [
      ["permit-reviewed", "permitting", "Has the conversion been reviewed for a building permit with your local authority?"],
      ["structure-floor-load", "structural", "Have the floor joists been confirmed rated for habitable-room live loads?"],
      ["fire-egress", "fire-safety", "Will the bedroom have a compliant egress window or exterior door?"],
      ["fire-stair", "fire-safety", "Is there a code-compliant stair (not a ladder or pull-down stair) serving the attic?"],
      ["code-ceiling-height", "building-code", "Does the required portion of the ceiling meet the minimum height for habitable rooms?"],
      ["access-stair-only", "accessibility", "Is stair-only access acceptable for the intended occupants?"],
    ],
    spaces: [["sleeping", "Sleeping area"], ["storage", "Storage"], ["nook", "Reading nook"]],
  }),
  template({
    id: "bedroom-office",
    label: "Bedroom to home office",
    fromSpace: "Bedroom",
    toSpace: "Home office",
    requiredInputs: ["widthIn", "depthIn", "outletCount"],
    screening: [
      ["permit-change-of-use", "permitting", "Have you confirmed whether a permit is required for this change of use in your jurisdiction?"],
      ["code-electrical", "building-code", "Is the existing electrical service adequate for the planned equipment load?"],
      ["access-clearances", "accessibility", "Do the doorway and layout allow the clearances the occupant needs?"],
    ],
    spaces: [["workspace", "Workspace"], ["storage", "Storage"], ["reading", "Reading corner"]],
  }),
  template({
    id: "open-plan-merge",
    label: "Two rooms into open-plan space",
    fromSpace: "Two adjoining rooms",
    toSpace: "Open-plan living space",
    requiredInputs: ["widthIn", "depthIn", "wallConstruction", "spanIn"],
    screening: [
      ["permit-reviewed", "permitting", "Has the wall removal been reviewed for a building permit with your local authority?"],
      ["structure-load-bearing", "structural", "Has the wall been confirmed non-load-bearing, or has a qualified professional designed the replacement support?"],
      ["code-services-in-wall", "building-code", "Have any electrical, plumbing, or HVAC runs inside the wall been identified and planned for relocation?"],
      ["access-step-free", "accessibility", "Will the merged space keep a step-free path between the combined rooms?"],
    ],
    spaces: [["living", "Living area"], ["dining", "Dining area"], ["kitchen", "Kitchen zone"]],
  }),
  template({
    id: "commercial-conversion",
    label: "Commercial space conversion",
    fromSpace: "Commercial space",
    toSpace: "New use (residential or revised commercial)",
    requiredInputs: ["widthIn", "depthIn", "currentUse", "targetUse", "occupancyLoad"],
    screening: [
      ["zoning-new-use", "zoning", "Does zoning allow the intended new use at this address?"],
      ["permit-change-of-use", "permitting", "Has a change-of-use permit path been confirmed with the local authority?"],
      ["structure-occupancy-load", "structural", "Is the structure documented as sound for the new occupancy load?"],
      ["fire-egress", "fire-safety", "Does the space meet egress and fire-protection requirements for the new occupancy?"],
      ["access-public", "accessibility", "Does the space provide an accessible entrance, route, and restroom for public use?"],
      ["code-change-of-occupancy", "building-code", "Has a change-of-occupancy code review been completed by a qualified professional?"],
    ],
    spaces: [["main", "Main space"], ["office", "Office"], ["restroom", "Restroom"], ["storage", "Storage"]],
  }),
  template({
    id: "kitchen-reconfig",
    label: "Kitchen reconfiguration",
    fromSpace: "Kitchen",
    toSpace: "Reconfigured kitchen",
    requiredInputs: ["widthIn", "depthIn", "plumbingLocations", "electricalPanelCapacity"],
    screening: [
      ["permit-reviewed", "permitting", "Has the reconfiguration been reviewed for permits covering electrical, plumbing, or wall work?"],
      ["structure-wall-moves", "structural", "If any walls move, has their structural role been confirmed?"],
      ["code-electrical", "building-code", "Has the electrical panel capacity been confirmed for the planned appliance load?"],
      ["access-clearances", "accessibility", "Do the planned clearances meet the primary cook's mobility needs?"],
    ],
    spaces: [["cooking", "Cooking zone"], ["prep", "Prep & pantry"], ["dining", "Dining nook"]],
  }),
  template({
    id: "bathroom-reconfig",
    label: "Bathroom reconfiguration",
    fromSpace: "Bathroom",
    toSpace: "Reconfigured bathroom",
    requiredInputs: ["widthIn", "depthIn", "plumbingLocations", "ventingRoute"],
    screening: [
      ["permit-reviewed", "permitting", "Has the reconfiguration been reviewed for a plumbing or building permit?"],
      ["structure-floor-load", "structural", "Has the floor been confirmed able to support the planned tub or shower load?"],
      ["code-plumbing-venting", "building-code", "Have drain, vent, and water-supply routes been confirmed for the new fixture locations?"],
      ["access-grab-bars", "accessibility", "Are grab-bar blocking and clear floor space included for the intended users?"],
    ],
    spaces: [["bathing", "Bathing"], ["vanity", "Vanity"], ["wc", "Water closet"]],
  }),
]);

const TEMPLATE_BY_ID = new Map(CONVERSION_TEMPLATES.map((t) => [t.id, t]));

export function getConversionTemplate(id) {
  return TEMPLATE_BY_ID.get(id) ?? null;
}

export const FEASIBILITY_DISCLAIMER =
  "Conceptual feasibility screening only, based on your own answers. This is not a determination of compliance and does not replace review by a licensed professional or your local building authority. Requirements vary by jurisdiction and property.";

/** Normalize a screening answer: "yes" (addressed), "no" (concern), or
 *  "unknown" (unanswered / not confirmed). Anything unrecognized is
 *  treated as unknown — screening never assumes a fact. */
function normalizeAnswer(value) {
  if (value === true) return "yes";
  if (value === false) return "no";
  if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    if (v === "yes" || v === "no" || v === "unknown") return v;
  }
  return "unknown";
}

/** Screen a conversion template against the customer's answers
 *  (screening-question id -> "yes" | "no" | "unknown" | boolean).
 *  One flag per topic the template screens, in template order.
 *  - Any question unanswered or "unknown" -> that topic is
 *    professional_required (a self-assessment cannot confirm it).
 *  - A "no" (concern) on a structural or fire-safety question ->
 *    professional_required; on any other topic -> attention.
 *  - All "yes" -> ok.
 *  The result never asserts compliance or approval of anything. */
export function screenFeasibility(tpl, answers = {}) {
  if (!tpl || !Array.isArray(tpl.screening)) throw new TypeError("screenFeasibility requires a conversion template");
  const given = answers && typeof answers === "object" ? answers : {};
  const topicOrder = [];
  const byTopic = new Map();
  for (const item of tpl.screening) {
    if (!byTopic.has(item.topic)) { byTopic.set(item.topic, []); topicOrder.push(item.topic); }
    byTopic.get(item.topic).push(normalizeAnswer(given[item.id]));
  }
  const flags = topicOrder.map((topic) => {
    const states = byTopic.get(topic);
    const label = TOPIC_LABELS[topic] ?? topic;
    if (states.includes("unknown")) {
      return {topic, level: "professional_required",
        note: `${label}: not yet confirmed. A qualified professional or the local authority must verify this before work begins.`};
    }
    if (states.includes("no")) {
      if (PROFESSIONAL_TOPICS.has(topic)) {
        return {topic, level: "professional_required",
          note: `${label}: your answers indicate a concern. A qualified professional must evaluate this before any work.`};
      }
      return {topic, level: "attention",
        note: `${label}: your answers indicate this needs attention before proceeding.`};
    }
    return {topic, level: "ok", note: `${label}: your answers indicate this has been considered.`};
  });
  return {
    status: "screened",
    flags,
    professionalReviewRequired: flags.some((f) => f.level === "professional_required"),
    disclaimer: FEASIBILITY_DISCLAIMER,
  };
}

export const CONCEPT_LAYOUT_DISCLOSURE =
  "Conceptual layout only: planning geometry generated from your stated dimensions. Not construction drawings. All dimensions are unverified — confirm measurements, structure, and requirements with a qualified professional before any work.";

/** Basic furniture blocks for a template's primary space, by space key.
 *  Nominal sizes in inches; blocks that cannot fit the primary zone are
 *  omitted rather than shrunk, so nothing is silently misrepresented. */
const PRIMARY_FURNITURE = Object.freeze({
  sleeping: [["Bed", 60, 80], ["Nightstand", 22, 18], ["Dresser", 54, 20]],
  living: [["Sofa", 84, 36], ["Coffee table", 44, 24], ["Armchair", 32, 32]],
  workspace: [["Desk", 54, 26], ["Chair", 24, 24], ["Bookshelf", 36, 12]],
  cooking: [["Counter run", 96, 25], ["Range", 30, 25], ["Island", 54, 30]],
  bathing: [["Tub", 60, 32], ["Shower", 36, 36]],
  main: [["Work counter", 96, 30], ["Desk", 54, 26]],
});
const DEFAULT_FURNITURE = [["Table", 48, 30], ["Chair", 20, 20]];

function checkDims(dims) {
  const w = dims?.widthIn, d = dims?.depthIn;
  if (!Number.isFinite(w) || !Number.isFinite(d) || w <= 0 || d <= 0)
    throw new TypeError("dims must provide positive widthIn and depthIn (inches)");
  return {widthIn: w, depthIn: d};
}

/** Split `total` into `count` consecutive spans: equal floor shares, the
 *  last span takes the remainder so spans tile exactly with no gaps or
 *  overlaps. */
function spans(total, count) {
  const out = [];
  const base = Math.floor(total / count);
  let pos = 0;
  for (let i = 0; i < count; i++) {
    const size = i === count - 1 ? total - pos : base;
    out.push({at: pos, size});
    pos += size;
  }
  return out;
}

/** Shelf-pack furniture specs into a zone rect with a 4in inset and 4in
 *  gaps. Deterministic; a block that cannot fit is omitted. */
function packFurniture(zone, specs) {
  const inset = 4, gap = 4;
  const right = zone.x + zone.width - inset, bottom = zone.y + zone.depth - inset;
  let x = zone.x + inset, y = zone.y + inset, rowHeight = 0;
  const items = [];
  for (const [label, w, d] of specs) {
    if (x + w > right) { x = zone.x + inset; y += rowHeight + gap; rowHeight = 0; }
    if (x + w > right || y + d > bottom) continue;
    items.push({kind: "furniture", label, x, y, width: w, depth: d});
    x += w + gap;
    rowHeight = Math.max(rowHeight, d);
  }
  return items;
}

/** Generate exactly two deterministic conceptual layout alternatives for
 *  a template within dims {widthIn, depthIn} (inches).
 *  Concept A partitions the room into two horizontal bands; Concept B
 *  into two vertical bands. Zones tile the room exactly (non-overlapping,
 *  in bounds); furniture blocks are shelf-packed into the primary zone. */
export function generateConceptLayouts(tpl, dims) {
  if (!tpl || !Array.isArray(tpl.spaces) || tpl.spaces.length === 0)
    throw new TypeError("generateConceptLayouts requires a conversion template with spaces");
  const {widthIn, depthIn} = checkDims(dims);
  const spaces = tpl.spaces;
  const firstCount = Math.ceil(spaces.length / 2);
  const first = spaces.slice(0, firstCount), rest = spaces.slice(firstCount);

  const build = (zones) => {
    const primary = zones[0];
    const specs = PRIMARY_FURNITURE[spaces[0].key] ?? DEFAULT_FURNITURE;
    return [...zones, ...packFurniture(primary, specs)];
  };

  // Concept A — horizontal bands (55% / 45% of depth).
  const bandA = Math.round(depthIn * 0.55);
  const zonesA = [
    ...spans(widthIn, first.length).map((s, i) => ({kind: "zone", label: first[i].label, x: s.at, y: 0, width: s.size, depth: bandA})),
    ...spans(widthIn, rest.length).map((s, i) => ({kind: "zone", label: rest[i].label, x: s.at, y: bandA, width: s.size, depth: depthIn - bandA})),
  ];
  // Concept B — vertical bands (55% / 45% of width), spaces stacked.
  const bandB = Math.round(widthIn * 0.55);
  const zonesB = [
    ...spans(depthIn, first.length).map((s, i) => ({kind: "zone", label: first[i].label, x: 0, y: s.at, width: bandB, depth: s.size})),
    ...spans(depthIn, rest.length).map((s, i) => ({kind: "zone", label: rest[i].label, x: bandB, y: s.at, width: widthIn - bandB, depth: s.size})),
  ];

  return [
    {name: `${tpl.label} — Concept A`, disclosure: CONCEPT_LAYOUT_DISCLOSURE, items: build(zonesA)},
    {name: `${tpl.label} — Concept B`, disclosure: CONCEPT_LAYOUT_DISCLOSURE, items: build(zonesB)},
  ];
}

/** Validate a conceptual layout against dims: every item in bounds with
 *  positive size, and zones pairwise non-overlapping. Furniture may sit
 *  inside a zone (it belongs to one) but must stay in bounds. */
export function validateConceptLayout(layout, dims) {
  const errors = [];
  if (!layout || !Array.isArray(layout.items)) return {valid: false, errors: ["layout with items array required"]};
  let widthIn, depthIn;
  try { ({widthIn, depthIn} = checkDims(dims)); }
  catch { return {valid: false, errors: ["dims must provide positive widthIn and depthIn (inches)"]}; }
  const zones = [];
  layout.items.forEach((item, i) => {
    const tag = `item ${i} (${item?.label ?? "?"})`;
    if (!item || ![item.x, item.y, item.width, item.depth].every(Number.isFinite)) { errors.push(`${tag}: geometry must be finite numbers`); return; }
    if (item.width <= 0 || item.depth <= 0) errors.push(`${tag}: width and depth must be positive`);
    if (item.x < 0 || item.y < 0 || item.x + item.width > widthIn || item.y + item.depth > depthIn)
      errors.push(`${tag}: outside room bounds`);
    if (item.kind === "zone") zones.push(item);
  });
  for (let i = 0; i < zones.length; i++) {
    for (let j = i + 1; j < zones.length; j++) {
      const a = zones[i], b = zones[j];
      if (a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.depth && b.y < a.y + a.depth)
        errors.push(`zones overlap: ${a.label} / ${b.label}`);
    }
  }
  return {valid: errors.length === 0, errors};
}
