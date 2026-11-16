/** Interactive room layout model for the RENOVISION design studio.
 *
 * Pure domain logic: a dimensioned room rectangle, wall openings (doors with
 * hinge/swing, windows), fixed obstacles, circulation (walkway) zones and
 * furniture placements, plus a conservative diagnostics pass.
 *
 * Honesty contract (consistent with the rest of the platform):
 * - All geometry is axis-aligned. Furniture rotation is supported in
 *   90-degree steps only; any other angle is rejected, never approximated.
 * - A door swing zone is the CONSERVATIVE square swept area on the hinge
 *   side (side = door width), not the exact quarter-disc. Intrusions are
 *   therefore possible false positives, never false negatives.
 * - Diagnostics are planning estimates from user-entered dimensions.
 *   Nothing here verifies a fit, egress, accessibility or code compliance;
 *   every result carries verified:false and field verification is required.
 */
import {evaluateFurnitureClearance} from "./furniture-clearance.mjs";

const WALLS = Object.freeze(["north", "south", "east", "west"]);
const OPENING_KINDS = Object.freeze(["door", "window"]);
const OBSTACLE_KINDS = Object.freeze(["column", "fireplace", "built-in", "radiator", "other"]);
const VALID_ROTATIONS = Object.freeze([0, 90, 180, 270]);

const isNum = (n) => typeof n === "number" && Number.isFinite(n);
const pos = (n) => isNum(n) && n > 0;
const nonNeg = (n) => isNum(n) && n >= 0;
const isId = (s) => typeof s === "string" && s.trim().length > 0;

export const ROOM_LAYOUT_DISCLOSURE =
  "Layout diagnostics are planning estimates from user-entered dimensions. Door swing zones are conservative swept squares. Nothing here is a verified fit, egress, accessibility or code-compliance determination; field verification is required before purchase or placement.";

export function createRoomLayout({layoutId, name, roomId, widthMeters, depthMeters} = {}) {
  return {
    layoutId: layoutId ?? null,
    name: typeof name === "string" && name.trim() ? name.trim() : "Untitled layout",
    roomId: roomId ?? null,
    room: {widthMeters, depthMeters},
    openings: [],
    obstacles: [],
    walkways: [],
    items: [],
  };
}

/** Effective axis-aligned footprint of a placed item after rotation. */
export function effectiveFootprint(item) {
  const rotated = item?.rotationDeg === 90 || item?.rotationDeg === 270;
  return rotated
    ? {widthMeters: item?.depthMeters, depthMeters: item?.widthMeters}
    : {widthMeters: item?.widthMeters, depthMeters: item?.depthMeters};
}

function boxOf(x, y, w, d) {
  return {left: x, top: y, right: x + w, bottom: y + d};
}
function itemBox(item) {
  const f = effectiveFootprint(item);
  return boxOf(item.xMeters, item.yMeters, f.widthMeters, f.depthMeters);
}
function boxesOverlap(a, b) {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

/** Wall length for a named wall of the room. */
export function wallLengthMeters(room, wall) {
  if (!room) return NaN;
  return wall === "north" || wall === "south" ? room.widthMeters : room.depthMeters;
}

/** Rectangle (in room coordinates) occupied by an opening's wall strip.
 *  Windows use a shallow advisory strip; doors use their swing zone. */
export function openingZoneMeters(layout, opening) {
  const room = layout?.room ?? {};
  const W = room.widthMeters, D = room.depthMeters;
  const off = opening?.offsetMeters, w = opening?.widthMeters;
  if (!isNum(W) || !isNum(D) || !isNum(off) || !isNum(w)) return null;
  if (opening.kind === "window") {
    const strip = 0.6; // advisory: keep the window wall usable / unblocked
    switch (opening.wall) {
      case "north": return boxOf(off, 0, w, strip);
      case "south": return boxOf(off, D - strip, w, strip);
      case "west": return boxOf(0, off, strip, w);
      case "east": return boxOf(W - strip, off, strip, w);
      default: return null;
    }
  }
  if (opening.kind === "door") {
    // Conservative swept square: side = door width, extending into the room
    // from the hinge end of the opening when the door swings in.
    // Conservative swept square: side = door width, extending into the room
    // across the full opening span (the hinge end does not change the square,
    // because the door leaf is exactly as wide as the opening).
    const swingsIn = opening.swing?.direction !== "out";
    if (!swingsIn) return null; // outward swing does not intrude into this room
    switch (opening.wall) {
      case "north": return boxOf(off, 0, w, w);
      case "south": return boxOf(off, D - w, w, w);
      case "west": return boxOf(0, off, w, w);
      case "east": return boxOf(W - w, off, w, w);
      default: return null;
    }
  }
  return null;
}

export function validateRoomLayout(layout) {
  const errors = [];
  if (!layout || typeof layout !== "object") return {valid: false, errors: ["layout object required"]};
  if (!pos(layout.room?.widthMeters) || !pos(layout.room?.depthMeters)) errors.push("room width/depth must be positive meters");
  const roomValid = pos(layout.room?.widthMeters) && pos(layout.room?.depthMeters);
  const asArray = (value, fieldName) => {
    if (value === undefined || value === null) return [];
    if (!Array.isArray(value)) { errors.push(fieldName + " must be an array"); return []; }
    return value;
  };
  const fullyInside = (x, y, w, d) => roomValid && x + w <= layout.room.widthMeters + 1e-9 && y + d <= layout.room.depthMeters + 1e-9;
  const seen = new Set();
  const claimId = (id, where) => {
    if (!isId(id)) { errors.push(where + ": id required"); return; }
    if (seen.has(id)) errors.push("duplicate id: " + id);
    seen.add(id);
  };
  for (const o of asArray(layout.openings, "openings")) {
    claimId(o?.id, "opening");
    if (!OPENING_KINDS.includes(o?.kind)) errors.push("opening " + o?.id + ": kind must be door or window");
    if (!WALLS.includes(o?.wall)) errors.push("opening " + o?.id + ": wall must be north, south, east or west");
    if (!nonNeg(o?.offsetMeters) || !pos(o?.widthMeters)) errors.push("opening " + o?.id + ": offset/width invalid");
    else if (pos(layout.room?.widthMeters) && pos(layout.room?.depthMeters) &&
             o.offsetMeters + o.widthMeters > wallLengthMeters(layout.room, o.wall) + 1e-9)
      errors.push("opening " + o?.id + ": extends beyond its wall");
    if (o?.kind === "door" && o.swing !== undefined) {
      if (!["start", "end"].includes(o.swing?.hinge)) errors.push("door " + o?.id + ": swing.hinge must be start or end");
      if (!["in", "out"].includes(o.swing?.direction)) errors.push("door " + o?.id + ": swing.direction must be in or out");
    }
  }
  for (const z of asArray(layout.obstacles, "obstacles")) {
    claimId(z?.id, "obstacle");
    if (!OBSTACLE_KINDS.includes(z?.kind)) errors.push("obstacle " + z?.id + ": unsupported kind");
    if (!nonNeg(z?.xMeters) || !nonNeg(z?.yMeters) || !pos(z?.widthMeters) || !pos(z?.depthMeters))
      errors.push("obstacle " + z?.id + ": geometry invalid");
    else if (roomValid && !fullyInside(z.xMeters, z.yMeters, z.widthMeters, z.depthMeters))
      errors.push("obstacle " + z?.id + ": must lie fully within the room");
  }
  for (const wk of asArray(layout.walkways, "walkways")) {
    claimId(wk?.id, "walkway");
    if (!nonNeg(wk?.xMeters) || !nonNeg(wk?.yMeters) || !pos(wk?.widthMeters) || !pos(wk?.depthMeters))
      errors.push("walkway " + wk?.id + ": geometry invalid");
    else if (roomValid && !fullyInside(wk.xMeters, wk.yMeters, wk.widthMeters, wk.depthMeters))
      errors.push("walkway " + wk?.id + ": must lie fully within the room");
    if (wk?.minimumWidthMeters !== undefined && !pos(wk.minimumWidthMeters))
      errors.push("walkway " + wk?.id + ": minimumWidthMeters must be positive");
  }
  for (const it of asArray(layout.items, "items")) {
    claimId(it?.id, "item");
    if (!nonNeg(it?.xMeters) || !nonNeg(it?.yMeters) || !pos(it?.widthMeters) || !pos(it?.depthMeters))
      errors.push("item " + it?.id + ": geometry invalid");
    const rot = it?.rotationDeg ?? 0;
    if (!VALID_ROTATIONS.includes(rot))
      errors.push("item " + it?.id + ": rotationDeg must be one of 0, 90, 180, 270 (other angles are not approximated)");
  }
  return {valid: errors.length === 0, errors};
}

/** Full diagnostics pass over a structurally valid layout. */
export function evaluateRoomLayout(layout, {minimumClearanceMeters = 0.75} = {}) {
  const structural = validateRoomLayout(layout);
  if (!structural.valid) return {valid: false, errors: structural.errors, verified: false, disclosure: ROOM_LAYOUT_DISCLOSURE};
  const W = layout.room.widthMeters, D = layout.room.depthMeters;
  const items = layout.items ?? [];
  const clearance = evaluateFurnitureClearance({
    room: {widthMeters: W, depthMeters: D},
    items: items.map((it) => {
      const f = effectiveFootprint(it);
      return {id: it.id, xMeters: it.xMeters, yMeters: it.yMeters, widthMeters: f.widthMeters, depthMeters: f.depthMeters};
    }),
    minimumClearanceMeters,
  });
  const overlapPairs = clearance.valid ? clearance.overlaps : [];
  const obstacleBoxes = (layout.obstacles ?? []).map((z) => ({id: z.id, kind: z.kind, box: boxOf(z.xMeters, z.yMeters, z.widthMeters, z.depthMeters)}));
  const openingZones = (layout.openings ?? []).map((o) => ({id: o.id, kind: o.kind, zone: openingZoneMeters(layout, o)})).filter((z) => z.zone);
  const walkwayBoxes = (layout.walkways ?? []).map((wk) => ({id: wk.id, minimumWidthMeters: wk.minimumWidthMeters ?? null, box: boxOf(wk.xMeters, wk.yMeters, wk.widthMeters, wk.depthMeters), narrow: wk.minimumWidthMeters ? Math.min(wk.widthMeters, wk.depthMeters) < wk.minimumWidthMeters : false}));

  const results = items.map((it) => {
    const issues = [];
    const advisories = [];
    const box = itemBox(it);
    const inside = box.left >= 0 && box.top >= 0 && box.right <= W + 1e-9 && box.bottom <= D + 1e-9;
    if (!inside) issues.push("outside_room_bounds");
    if (overlapPairs.some(([a, b]) => a === it.id || b === it.id)) issues.push("overlaps_furniture");
    for (const ob of obstacleBoxes) if (boxesOverlap(box, ob.box)) issues.push("overlaps_obstacle:" + ob.kind);
    for (const oz of openingZones) if (boxesOverlap(box, oz.zone)) issues.push(oz.kind === "door" ? "intrudes_door_swing" : "blocks_window_zone");
    for (const wk of walkwayBoxes) if (boxesOverlap(box, wk.box)) issues.push("intrudes_walkway");
    const wall = clearance.valid ? clearance.wallClearances.find((c) => c.id === it.id) : null;
    // Wall clearance is advisory only: furniture against a wall is normal
    // design. It never turns a placement into a conflict by itself.
    if (wall && wall.minimumMeters < minimumClearanceMeters) advisories.push("wall_clearance_below_stated_minimum");
    return {id: it.id, status: issues.length ? "conflict" : "no_conflict_detected", issues, advisories, wallClearanceMeters: wall ? wall.minimumMeters : null};
  });
  const warnings = [];
  for (const wk of walkwayBoxes) if (wk.narrow) warnings.push("walkway " + wk.id + " is narrower than its stated minimum width (accessibility unverified)");
  if ((layout.openings ?? []).some((o) => o.kind === "door" && !o.swing)) warnings.push("one or more doors have no swing information; swing conflicts cannot be assessed for them");
  const conflictCount = results.filter((r) => r.status === "conflict").length;
  return {
    valid: true,
    errors: [],
    verified: false,
    fieldVerificationRequired: true,
    items: results,
    summary: {
      itemCount: items.length,
      conflictCount,
      overlaps: clearance.valid ? clearance.overlaps : [],
      obstacleCount: obstacleBoxes.length,
      openingCount: (layout.openings ?? []).length,
      walkwayCount: walkwayBoxes.length,
    },
    warnings,
    disclosure: ROOM_LAYOUT_DISCLOSURE,
  };
}

/* ---- Pure layout operations (return new layout objects; inputs untouched) ---- */

const clone = (layout) => JSON.parse(JSON.stringify(layout));

export function addLayoutItem(layout, item) {
  const next = clone(layout);
  next.items.push({rotationDeg: 0, ...item});
  return next;
}
export function moveLayoutItem(layout, itemId, xMeters, yMeters) {
  const next = clone(layout);
  const it = next.items.find((i) => i.id === itemId);
  if (it) { it.xMeters = xMeters; it.yMeters = yMeters; }
  return next;
}
export function rotateLayoutItem(layout, itemId) {
  const next = clone(layout);
  const it = next.items.find((i) => i.id === itemId);
  if (it) it.rotationDeg = ((it.rotationDeg ?? 0) + 90) % 360;
  return next;
}
export function removeLayoutItem(layout, itemId) {
  const next = clone(layout);
  next.items = next.items.filter((i) => i.id !== itemId);
  return next;
}
export function duplicateLayoutItem(layout, itemId, newId, offsetMeters = 0.3) {
  const next = clone(layout);
  const src = next.items.find((i) => i.id === itemId);
  if (src) next.items.push({...src, id: newId, xMeters: src.xMeters + offsetMeters, yMeters: src.yMeters + offsetMeters});
  return next;
}
export function duplicateRoomLayout(layout, {layoutId, name} = {}) {
  const next = clone(layout);
  if (layoutId !== undefined) next.layoutId = layoutId;
  if (name !== undefined) next.name = name;
  return next;
}

/** Side-by-side comparison summary of two layouts of the same room. */
export function compareRoomLayouts(a, b) {
  const ea = evaluateRoomLayout(a), eb = evaluateRoomLayout(b);
  const ids = (l) => new Set((l.items ?? []).map((i) => i.id));
  const sa = ids(a), sb = ids(b);
  return {
    valid: ea.valid && eb.valid,
    a: ea.valid ? ea.summary : null,
    b: eb.valid ? eb.summary : null,
    itemsOnlyInA: [...sa].filter((id) => !sb.has(id)),
    itemsOnlyInB: [...sb].filter((id) => !sa.has(id)),
    itemsInBoth: [...sa].filter((id) => sb.has(id)),
    verified: false,
    disclosure: ROOM_LAYOUT_DISCLOSURE,
  };
}
