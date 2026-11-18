/** RENOVISION design workspace: the customer-facing design state of a
 * project — chosen style/palette/materials, room layouts, the project's
 * product selections, its budget and notes — validated as one document and
 * persisted inside the existing project record (no new database, no new
 * store). Tenant isolation is inherited from the project record itself.
 *
 * Validation composes the platform's own engines: every layout must pass
 * the room-layout structural validation, every product the catalog
 * integrity validation, and the budget the fail-closed budget validation.
 * Library references (style, palette, materials, collection) must resolve.
 */
import {validateRoomLayout} from "./room-layout.mjs";
import {validateCatalogProduct} from "./product-catalog.mjs";
import {validateProjectBudget} from "./project-budget.mjs";
import {getDesignStyle, getDesignPalette, getDesignMaterial, listRoomCollections} from "./design-library.mjs";

export const DESIGN_WORKSPACE_FORMAT = "renovision-design-workspace/v1";
const MAX_LAYOUTS = 12;
const MAX_PRODUCTS = 200;
const MAX_NOTES_CHARS = 10000;

export function emptyDesignWorkspace() {
  return {
    format: DESIGN_WORKSPACE_FORMAT,
    styleId: null,
    paletteId: null,
    collectionId: null,
    materialIds: [],
    layouts: [],
    activeLayoutId: null,
    products: [],
    shoppingListIds: [],
    budget: null,
    notes: "",
    updatedAt: null,
  };
}

export function validateDesignWorkspace(ws) {
  const errors = [];
  if (!ws || typeof ws !== "object") return {valid: false, errors: ["workspace object required"]};
  if (ws.styleId !== null && ws.styleId !== undefined && !getDesignStyle(ws.styleId)) errors.push("unknown styleId: " + ws.styleId);
  if (ws.paletteId !== null && ws.paletteId !== undefined && !getDesignPalette(ws.paletteId)) errors.push("unknown paletteId: " + ws.paletteId);
  if (ws.collectionId !== null && ws.collectionId !== undefined && !listRoomCollections().some((c) => c.id === ws.collectionId)) errors.push("unknown collectionId: " + ws.collectionId);
  if (ws.materialIds !== undefined && ws.materialIds !== null && !Array.isArray(ws.materialIds)) errors.push("materialIds must be an array");
  for (const mid of Array.isArray(ws.materialIds) ? ws.materialIds : []) if (!getDesignMaterial(mid)) errors.push("unknown materialId: " + mid);
  const layouts = ws.layouts ?? [];
  if (!Array.isArray(layouts)) errors.push("layouts must be an array");
  else {
    if (layouts.length > MAX_LAYOUTS) errors.push("too many layouts (max " + MAX_LAYOUTS + ")");
    const layoutIds = new Set();
    for (const layout of layouts) {
      const check = validateRoomLayout(layout);
      if (!check.valid) errors.push(...check.errors.map((e) => "layout " + (layout?.layoutId ?? "?") + ": " + e));
      if (layout?.layoutId) { if (layoutIds.has(layout.layoutId)) errors.push("duplicate layoutId: " + layout.layoutId); layoutIds.add(layout.layoutId); }
    }
    if (ws.activeLayoutId !== null && ws.activeLayoutId !== undefined && !layoutIds.has(ws.activeLayoutId))
      errors.push("activeLayoutId does not match any layout");
  }
  const products = ws.products ?? [];
  if (!Array.isArray(products)) errors.push("products must be an array");
  else {
    if (products.length > MAX_PRODUCTS) errors.push("too many products (max " + MAX_PRODUCTS + ")");
    const productIds = new Set();
    for (const product of products) {
      const check = validateCatalogProduct(product);
      if (!check.valid) errors.push(...check.errors.map((e) => "product " + (product?.productId ?? "?") + ": " + e));
      if (product?.productId) { if (productIds.has(product.productId)) errors.push("duplicate productId: " + product.productId); productIds.add(product.productId); }
    }
    if (ws.shoppingListIds !== undefined && ws.shoppingListIds !== null && !Array.isArray(ws.shoppingListIds)) errors.push("shoppingListIds must be an array");
    for (const id of Array.isArray(ws.shoppingListIds) ? ws.shoppingListIds : []) if (!productIds.has(id)) errors.push("shoppingListId not in products: " + id);
  }
  if (ws.budget !== null && ws.budget !== undefined) {
    const check = validateProjectBudget(ws.budget);
    if (!check.valid) errors.push(...check.errors.map((e) => "budget: " + e));
  }
  if (ws.notes !== undefined && ws.notes !== null && (typeof ws.notes !== "string" || ws.notes.length > MAX_NOTES_CHARS))
    errors.push("notes must be a string of at most " + MAX_NOTES_CHARS + " characters");
  return {valid: errors.length === 0, errors};
}

/** Validate and normalize a workspace for storage. Throws Error with
 *  .errors on invalid input (fail closed — nothing partial is stored). */
export function normalizeDesignWorkspace(ws, now = new Date().toISOString()) {
  const check = validateDesignWorkspace(ws);
  if (!check.valid) {
    const err = new Error("design_workspace_invalid");
    err.errors = check.errors;
    throw err;
  }
  const base = emptyDesignWorkspace();
  const out = {...base, ...structuredClone(ws), format: DESIGN_WORKSPACE_FORMAT, updatedAt: now};
  out.materialIds = [...(ws.materialIds ?? [])];
  out.layouts = structuredClone(ws.layouts ?? []);
  out.products = structuredClone(ws.products ?? []);
  out.shoppingListIds = [...(ws.shoppingListIds ?? [])];
  out.notes = ws.notes ?? "";
  return out;
}
