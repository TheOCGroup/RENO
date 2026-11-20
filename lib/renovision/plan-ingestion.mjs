/** RENOVISION floor-plan ingestion: upload registry, original preservation,
 * revision history, and guided dimension extraction.
 *
 * Honesty rules (founder master directive 2026-11-19, architecture contract):
 * - Automated room-boundary / dimension detection is NOT AVAILABLE in this
 *   build and is never simulated. No geometry is derived from an upload
 *   until a human confirms dimensions through the guided workflow.
 * - Dimensions enter only with provenance: "user_measured" (the customer
 *   measured the space) or "plan_stated" (read off the plan by a human).
 *   Nothing is inferred from an address, a file name, or image content.
 * - The original upload is preserved forever: revision 1 is flagged
 *   original and is never removed or rewritten by later revisions.
 * - All functions are pure: they return new objects and never mutate
 *   their inputs.
 */

/* The upload id is a stable identifier derived from the caller-supplied
 * content digest. It uses a dependency-free FNV-1a hash so this module runs
 * identically on the server and in the browser (no node:crypto); the digest
 * itself (a real content hash computed by the uploader) is stored verbatim
 * on the record — the id is an identifier, not a security claim. */
function planIdFromDigest(digest) {
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (let i = 0; i < digest.length; i++) {
    const c = digest.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ (c + i), 0x85ebca6b) >>> 0;
  }
  return "plan-" + h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0");
}

export const PLAN_MEDIA_TYPES = Object.freeze(["application/pdf", "image/png", "image/jpeg", "image/webp"]);

export const PLAN_DETECTION_STATUS = Object.freeze({
  automatedDetection: "NOT_AVAILABLE",
  reason: "No computer-vision plan detection ships in this build. Uploaded plans are preserved with full revision history, and dimensions are extracted only through the guided confirmation workflow (user-measured, or as stated on the plan and read by a human). Detection results are never simulated.",
});

export const PLAN_DIMENSION_SOURCES = Object.freeze(["user_measured", "plan_stated"]);

const isId = (s) => typeof s === "string" && s.trim().length > 0;
const pos = (n) => typeof n === "number" && Number.isFinite(n) && n > 0;

function assertUpload(upload) {
  if (!upload || typeof upload !== "object" || !Array.isArray(upload.revisions) || upload.revisions.length === 0)
    throw new Error("a plan upload created by createPlanUpload is required");
}

/** Register an uploaded floor plan. The upload itself is preserved as
 *  revision 1 (the original); extraction starts in "needs_dimensions"
 *  because nothing about the plan's geometry is known yet. The id is
 *  derived deterministically from the content digest. */
export function createPlanUpload(input, now = new Date().toISOString()) {
  const {fileName, mediaType, sizeBytes, digest} = input ?? {};
  if (!isId(fileName)) throw new Error("fileName required");
  if (!PLAN_MEDIA_TYPES.includes(mediaType))
    throw new Error("unsupported plan mediaType: " + String(mediaType) + " (accepted: " + PLAN_MEDIA_TYPES.join(", ") + ")");
  if (!pos(sizeBytes)) throw new Error("sizeBytes must be a positive number");
  if (!isId(digest)) throw new Error("digest required (content hash of the uploaded file)");
  const id = planIdFromDigest(digest);
  return {
    id,
    fileName,
    mediaType,
    sizeBytes,
    digest,
    status: "uploaded",
    revisions: [{rev: 1, digest, note: "Original plan preserved", at: now, original: true}],
    extraction: {status: "needs_dimensions", widthIn: null, depthIn: null, source: null},
  };
}

/** Append a revision (e.g. a corrected or re-exported plan file). The
 *  original revision stays in place, flagged original; history is
 *  append-only. Returns a new upload object. */
export function addPlanRevision(upload, revision, now = new Date().toISOString()) {
  assertUpload(upload);
  const {digest, note} = revision ?? {};
  if (!isId(digest)) throw new Error("revision digest required (content hash of the revised file)");
  const nextRev = upload.revisions.reduce((max, r) => Math.max(max, r.rev), 0) + 1;
  const entry = {
    rev: nextRev,
    digest,
    note: isId(note) ? note : "Revision added",
    at: now,
    original: false,
  };
  return {...upload, revisions: [...upload.revisions, entry]};
}

/** Confirm the room dimensions for an uploaded plan through the guided
 *  workflow. Dimensions are accepted only with human provenance
 *  ("user_measured" or "plan_stated") and must be positive and finite.
 *  Returns a new upload object with extraction.status "confirmed". */
export function confirmPlanDimensions(upload, confirmation) {
  assertUpload(upload);
  const {widthIn, depthIn, source} = confirmation ?? {};
  if (!PLAN_DIMENSION_SOURCES.includes(source))
    throw new Error("dimension source must be one of " + PLAN_DIMENSION_SOURCES.join(", ") + " (dimensions are never inferred)");
  if (!pos(widthIn) || !pos(depthIn))
    throw new Error("widthIn and depthIn must be positive, finite numbers of inches");
  return {...upload, extraction: {status: "confirmed", widthIn, depthIn, source}};
}

/** Room geometry for the planner, available only after dimension
 *  confirmation. Returns null while dimensions are unconfirmed — an
 *  uploaded plan alone never yields geometry. */
export function planToRoomGeometry(upload) {
  const ex = upload?.extraction;
  if (!ex || ex.status !== "confirmed" || !pos(ex.widthIn) || !pos(ex.depthIn)) return null;
  return {widthIn: ex.widthIn, depthIn: ex.depthIn};
}
