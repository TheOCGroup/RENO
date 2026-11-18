/** RENOVISION durable AI concept history.
 *
 * A concept record links a generated design concept to its originating
 * project and room. The image bytes themselves live in the platform's
 * tenant-authorized evidence storage; the record keeps only references,
 * digests, the brief that produced the concept, and provider metadata.
 *
 * Honesty rules enforced here:
 * - A concept is NEVER a verified measurement or a construction document
 *   (verified is always false; the disclosure travels with the record).
 * - Simulated generation (local fixtures / mock providers used in
 *   engineering tests) is recorded as simulated and must be labeled as
 *   such wherever the record is presented.
 * - Records are append-only except for authorized deletion; refinement
 *   creates a NEW record linked by revisionOf, so revision history is
 *   the chain itself and is never rewritten.
 */

export const MAX_CONCEPTS_PER_PROJECT = 100;
export const CONCEPT_IMAGE_MIME_TYPES = Object.freeze(["image/png", "image/jpeg", "image/webp"]);

const isId = (s) => typeof s === "string" && s.trim().length > 0 && !/[\\/]/.test(s) && s.length <= 128;
const isDigest = (s) => typeof s === "string" && /^sha256:[a-f0-9]{64}$/i.test(s);
const isRef = (s) => typeof s === "string" && /^[a-z]+-evidence-[a-f0-9]{24}$/.test(s);
const isText = (s, max) => typeof s === "string" && s.length <= max;

function validateImageRef(img, where, errors, {required}) {
  if (img === null || img === undefined) { if (required) errors.push(where + " image reference required"); return; }
  if (typeof img !== "object") { errors.push(where + " image reference must be an object"); return; }
  if (!isRef(img.storageRef)) errors.push(where + ".storageRef invalid");
  if (!isDigest(img.digest)) errors.push(where + ".digest invalid");
  if (!CONCEPT_IMAGE_MIME_TYPES.includes(img.mimeType)) errors.push(where + ".mimeType unsupported");
}

export function validateConceptRecord(record) {
  const errors = [];
  if (!record || typeof record !== "object") return {valid: false, errors: ["concept record required"]};
  if (!isId(record.conceptId)) errors.push("conceptId invalid");
  if (!isId(record.roomId)) errors.push("roomId required");
  if (typeof record.createdAt !== "string" || Number.isNaN(Date.parse(record.createdAt))) errors.push("createdAt must be an ISO timestamp");
  if (!isText(record.prompt ?? "", 2000)) errors.push("prompt must be a string of at most 2000 characters");
  const sel = record.selections ?? {};
  if (typeof sel !== "object" || Array.isArray(sel)) errors.push("selections must be an object");
  else {
    for (const key of ["room", "style", "palette", "material"]) if (sel[key] !== undefined && sel[key] !== null && !isText(sel[key], 200)) errors.push("selections." + key + " too long or not a string");
    if (sel.priorities !== undefined && (!Array.isArray(sel.priorities) || sel.priorities.length > 20 || sel.priorities.some((p) => !isText(p, 100)))) errors.push("selections.priorities invalid");
  }
  const provider = record.provider ?? {};
  if (typeof provider !== "object" || Array.isArray(provider)) errors.push("provider must be an object");
  else {
    if (!isText(provider.kind ?? "", 60) || !(provider.kind ?? "").trim()) errors.push("provider.kind required");
    if (typeof provider.simulated !== "boolean") errors.push("provider.simulated must be a boolean");
    if (provider.model !== undefined && provider.model !== null && !isText(provider.model, 120)) errors.push("provider.model too long or not a string");
  }
  if (!isText(record.disclosure ?? "", 600) || !(record.disclosure ?? "").trim()) errors.push("disclosure required");
  if (record.verified !== false) errors.push("concept records are never verified");
  validateImageRef(record.concept, "concept", errors, {required: true});
  validateImageRef(record.original, "original", errors, {required: false});
  if (record.revisionOf !== null && record.revisionOf !== undefined && !isId(record.revisionOf)) errors.push("revisionOf invalid");
  if (record.retentionDays !== undefined && (!Number.isInteger(record.retentionDays) || record.retentionDays < 1 || record.retentionDays > 365)) errors.push("retentionDays out of bounds");
  return {valid: errors.length === 0, errors};
}

/** Validate + normalize a concept record for storage. Throws an Error with
 *  .errors on invalid input (the workflow layer's fail() convention). */
export function normalizeConceptRecord(record) {
  const check = validateConceptRecord(record);
  if (!check.valid) { const e = new Error("concept_record_invalid"); e.errors = check.errors; throw e; }
  const sel = record.selections ?? {};
  return {
    conceptId: record.conceptId,
    roomId: record.roomId,
    createdAt: record.createdAt,
    prompt: record.prompt ?? "",
    selections: {
      room: sel.room ?? null, style: sel.style ?? null, palette: sel.palette ?? null,
      material: sel.material ?? null, priorities: Array.isArray(sel.priorities) ? [...sel.priorities] : [],
    },
    provider: {kind: record.provider.kind, simulated: record.provider.simulated, model: record.provider.model ?? null},
    disclosure: record.disclosure,
    verified: false,
    status: "concept",
    original: record.original ? {storageRef: record.original.storageRef, digest: record.original.digest.toLowerCase(), mimeType: record.original.mimeType} : null,
    concept: {storageRef: record.concept.storageRef, digest: record.concept.digest.toLowerCase(), mimeType: record.concept.mimeType},
    revisionOf: record.revisionOf ?? null,
    retentionDays: record.retentionDays ?? 365,
  };
}

/** Order concepts as a revision-aware history: chronological, with each
 *  record's chain depth computed from revisionOf links (0 = original). */
export function conceptHistoryView(records) {
  const byId = new Map(records.map((r) => [r.conceptId, r]));
  const depth = (r, seen = new Set()) => {
    if (!r.revisionOf || !byId.has(r.revisionOf) || seen.has(r.conceptId)) return 0;
    seen.add(r.conceptId);
    return 1 + depth(byId.get(r.revisionOf), seen);
  };
  return [...records]
    .sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0))
    .map((r) => ({...r, revisionDepth: depth(r)}));
}
