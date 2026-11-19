/** RENOVISION <-> Deal Scout scope contract: the documented boundary
 * between the two products.
 *
 * Ownership boundary (founder directive): Deal Scout owns general
 * renovation scope extraction. RENOVISION does not generate, regenerate,
 * or modify general renovation scope. RENOVISION may generate
 * conversion-specific scope for space conversions (a separate system);
 * for existing-property renovation it consumes an approved Deal Scout
 * scope when one is available.
 *
 * Integration status — stated honestly: there is NO live Deal Scout
 * connection. No API, feed, or shared database is wired up. The only
 * supported path is MANUAL IMPORT: a customer or operator supplies a
 * scope document (exported from Deal Scout by whatever means they have)
 * and RENOVISION validates and adopts it verbatim, with provenance.
 * Import never edits item content; provenance records that the scope
 * came from Deal Scout via manual import while the integration is
 * UNAVAILABLE, so no one mistakes an imported document for a live sync.
 *
 * Provenance integrity: a document is accepted only when it declares
 * format "renovision-deal-scout-scope/v1" and source "deal-scout".
 * Anything else is rejected — RENOVISION will not relabel a document
 * from another origin as a Deal Scout scope.
 */

export const DEAL_SCOUT_INTEGRATION = Object.freeze({
  status: "UNAVAILABLE",
  mode: "manual-import",
  note:
    "No live Deal Scout connection exists. Scopes are imported documents supplied by the customer/operator; " +
    "RENOVISION validates and adopts them verbatim with provenance, and does not generate or modify general renovation scope. " +
    "When no scope is imported, Deal Scout functionality is simply absent — design, conversion, and furnishing workflows continue without it.",
});

export const SCOPE_FORMAT = "renovision-deal-scout-scope/v1";

const isId = (s) => typeof s === "string" && s.trim().length > 0;
const centsOrNull = (n) => n === null || (typeof n === "number" && Number.isSafeInteger(n) && n >= 0);

/** Validate a candidate Deal Scout scope document. Purely structural and
 *  provenance checks — item content is Deal Scout's, not ours to judge. */
export function validateDealScoutScope(doc) {
  const errors = [];
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) return {valid: false, errors: ["scope document object required"]};
  if (doc.format !== SCOPE_FORMAT) errors.push("format must be \"" + SCOPE_FORMAT + "\"");
  if (doc.source !== "deal-scout") errors.push("source must be \"deal-scout\" (provenance integrity: other origins are not accepted as Deal Scout scopes)");
  if (!isId(doc.version)) errors.push("version must be a non-empty string");
  if (!isId(doc.exportedAt) || !Number.isFinite(Date.parse(doc.exportedAt))) errors.push("exportedAt must be a parseable date string");
  if (!Array.isArray(doc.items) || doc.items.length === 0) {
    errors.push("items must be a non-empty array");
  } else {
    const seen = new Set();
    doc.items.forEach((item, i) => {
      const at = "items[" + i + "]";
      if (!item || typeof item !== "object") { errors.push(at + " must be an object"); return; }
      if (!isId(item.id)) errors.push(at + ".id must be a non-empty string");
      else if (seen.has(item.id)) errors.push(at + ".id duplicates an earlier item id: " + item.id);
      else seen.add(item.id);
      if (!isId(item.label)) errors.push(at + ".label must be a non-empty string");
      if (!isId(item.category)) errors.push(at + ".category must be a non-empty string");
      if (!centsOrNull(item.estimatedCents)) errors.push(at + ".estimatedCents must be null (unpriced) or a non-negative safe integer of cents");
    });
  }
  return {valid: errors.length === 0, errors};
}

/** Adopt a validated scope document into RENOVISION, verbatim, with
 *  import provenance. Returns a deep clone: later mutation of the
 *  caller's document cannot alter the imported scope. Throws an Error
 *  carrying .errors when the document is invalid — nothing partial is
 *  imported (fail closed). */
export function importDealScoutScope(doc, now = new Date().toISOString()) {
  const check = validateDealScoutScope(doc);
  if (!check.valid) {
    const err = new Error("deal_scout_scope_invalid");
    err.errors = check.errors;
    throw err;
  }
  return {
    format: SCOPE_FORMAT,
    source: "deal-scout",
    version: doc.version,
    exportedAt: doc.exportedAt,
    importedAt: now,
    provenance: {
      source: "deal-scout",
      importedVia: "manual-import",
      integrationStatus: DEAL_SCOUT_INTEGRATION.status,
    },
    items: structuredClone(doc.items),
  };
}

/** Summarize an imported scope. The known total sums PRICED items only;
 *  it is labeled incomplete whenever any item is unpriced — an imported
 *  scope's total is never silently presented as a full estimate. */
export function summarizeScope(scope) {
  const items = scope && Array.isArray(scope.items) ? scope.items : [];
  const categories = [];
  let knownTotalCents = 0;
  let unpricedCount = 0;
  for (const item of items) {
    if (item && isId(item.category) && !categories.includes(item.category)) categories.push(item.category);
    if (item && centsOrNull(item.estimatedCents) && item.estimatedCents !== null) knownTotalCents += item.estimatedCents;
    else unpricedCount++;
  }
  return {
    itemCount: items.length,
    categories,
    knownTotalCents,
    unpricedCount,
    totalIsComplete: unpricedCount === 0,
  };
}
