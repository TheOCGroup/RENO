/** Deterministic renovation preview: a dimensioned floor-plan rendering generated
 * from locked measurements, never from inferred pixels. No AI image model is used.
 * Every preview is a CONCEPT visualization carrying the conservative disclosure from
 * describeRenovisionPreview; accuracy claims remain governed by assessVisualClaim
 * and authorizeAccuracyClaim, which this module never bypasses. */
import {describeRenovisionPreview} from "./preview-disclosure.mjs";
import {assessVisualClaim} from "./visual-claim-policy.mjs";
const text = (x) => typeof x === "string" && x.trim().length > 0;
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const STRUCTURAL = new Set(["wall", "floor", "ceiling", "opening"]);
export function compareRoomStates({existingFeatures = [], proposedFeatures = []} = {}) {
 const existing = new Map(existingFeatures.map((f) => [f.featureId, f]));
 const proposed = new Map(proposedFeatures.map((f) => [f.featureId, f]));
 const entries = [];
 const ids = [...new Set([...existing.keys(), ...proposed.keys()])].sort();
 for (const featureId of ids) {
   const from = existing.get(featureId), to = proposed.get(featureId);
   let change = "unchanged";
   if (from && !to) change = "removed";
   else if (!from && to) change = "added";
   else if (JSON.stringify(from) !== JSON.stringify(to)) change = "modified";
   const target = to ?? from;
   const unapproved = change !== "unchanged" && STRUCTURAL.has(target?.semanticType) && (!text(target?.scopeItemId) || !text(target?.approvalRef));
   entries.push({featureId, change, from: from ?? null, to: to ?? null, unapproved});
 }
 return {entries, summary: {total: entries.length, modified: entries.filter((e) => e.change === "modified").length, added: entries.filter((e) => e.change === "added").length, removed: entries.filter((e) => e.change === "removed").length, unchanged: entries.filter((e) => e.change === "unchanged").length, unapprovedChanges: entries.filter((e) => e.unapproved).length}, verified: false};
}
export function buildPlanFromRoomModel(roomModel, {label, features = []} = {}) {
 const f = roomModel?.features ?? {};
 return {
   label,
   widthMeters: roomModel?.dimensions?.widthMeters ?? null,
   depthMeters: roomModel?.dimensions?.depthMeters ?? null,
   heightMeters: roomModel?.dimensions?.heightMeters ?? null,
   widthUncertaintyMeters: f.width?.uncertaintyMeters ?? 0,
   depthUncertaintyMeters: f.depth?.uncertaintyMeters ?? 0,
   door: f.door_width && f.door_offset ? {widthMeters: f.door_width.meters, offsetMeters: f.door_offset.meters} : null,
   window: f.window_width && f.window_offset ? {widthMeters: f.window_width.meters, offsetMeters: f.window_offset.meters} : null,
   hasObstruction: Boolean(f.obstruction_offset),
   obstructionOffsetMeters: f.obstruction_offset?.meters ?? null,
   features
 };
}
export function renderFloorPlanSvg({plan, title, disclosure} = {}) {
 const scale = 44, pad = 46;
 const w = Math.max(1, plan?.widthMeters ?? 1), d = Math.max(1, plan?.depthMeters ?? 1);
 const W = Math.round(w * scale + pad * 2), H = Math.round(d * scale + pad * 2 + 44);
 const fmt = (v, u) => (typeof v === "number" ? v.toFixed(2) + " m" + (u ? " ±" + u.toFixed(2) : "") : "unknown");
 const parts = [];
 parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(title)}">`);
 parts.push(`<rect width="${W}" height="${H}" fill="#ffffff"/>`);
 parts.push(`<text x="${pad}" y="24" font-family="sans-serif" font-size="14" font-weight="700" fill="#17375B">${esc(title)}</text>`);
 parts.push(`<text x="${pad}" y="40" font-family="sans-serif" font-size="10" fill="#b3261e">CONCEPT — not a construction drawing or measured survey</text>`);
 parts.push(`<rect x="${pad}" y="${pad}" width="${Math.round(w * scale)}" height="${Math.round(d * scale)}" fill="#F5F9FC" stroke="#17375B" stroke-width="3"/>`);
 if (plan?.door) {
   const x = pad + Math.round(plan.door.offsetMeters * scale);
   parts.push(`<rect x="${x}" y="${pad + Math.round(d * scale) - 3}" width="${Math.round(plan.door.widthMeters * scale)}" height="6" fill="#ffffff"/>`);
   parts.push(`<text x="${x}" y="${pad + Math.round(d * scale) + 16}" font-family="sans-serif" font-size="9" fill="#17375B">door ${fmt(plan.door.widthMeters)}</text>`);
 }
 if (plan?.window) {
   const x = pad + Math.round(plan.window.offsetMeters * scale);
   parts.push(`<rect x="${x}" y="${pad - 3}" width="${Math.round(plan.window.widthMeters * scale)}" height="6" fill="#bfe3ff" stroke="#1769E0"/>`);
   parts.push(`<text x="${x}" y="${pad - 8}" font-family="sans-serif" font-size="9" fill="#1769E0">window ${fmt(plan.window.widthMeters)}</text>`);
 }
 if (plan?.hasObstruction) {
   const x = pad + Math.round((plan.obstructionOffsetMeters ?? 0) * scale);
   parts.push(`<rect x="${x}" y="${pad + 14}" width="26" height="26" fill="#f6d8d5" stroke="#b3261e" stroke-dasharray="4 2"/>`);
   parts.push(`<text x="${x}" y="${pad + 52}" font-family="sans-serif" font-size="9" fill="#b3261e">obstruction (position only)</text>`);
 }
 for (const item of plan?.features ?? []) {
   if (![item.xMeters, item.yMeters, item.widthMeters, item.depthMeters].every((v) => typeof v === "number" && Number.isFinite(v))) continue;
   const x = pad + Math.round(item.xMeters * scale), y = pad + Math.round(item.yMeters * scale);
   parts.push(`<rect x="${x}" y="${y}" width="${Math.max(4, Math.round(item.widthMeters * scale))}" height="${Math.max(4, Math.round(item.depthMeters * scale))}" fill="#d8f2ea" stroke="#13A989"/>`);
   parts.push(`<text x="${x + 3}" y="${y + 12}" font-family="sans-serif" font-size="9" fill="#0b5c48">${esc(item.label ?? item.featureId ?? item.id ?? "item")}</text>`);
 }
 parts.push(`<text x="${pad}" y="${pad + Math.round(d * scale) + 30}" font-family="sans-serif" font-size="10" fill="#17375B">Width ${fmt(plan?.widthMeters, plan?.widthUncertaintyMeters)} · Depth ${fmt(plan?.depthMeters, plan?.depthUncertaintyMeters)} · Height ${fmt(plan?.heightMeters)}</text>`);
 for (const [i, warning] of (disclosure?.warnings ?? []).entries()) {
   parts.push(`<text x="${pad}" y="${H - 22 + i * 0}" font-family="sans-serif" font-size="0" fill="#ffffff"></text>`);
   if (i === 0) parts.push(`<text x="${pad}" y="${H - 8}" font-family="sans-serif" font-size="9" fill="#666666">${esc(warning)}</text>`);
 }
 parts.push("</svg>");
 return parts.join("");
}
export function buildRenovationPreview({mode = "renovate", roomModel, lock, proposedFeatures = [], existingFeatures = [], sourceEvidenceRef, previewId} = {}) {
 if (!lock || lock.locked !== true) return {ok: false, errors: ["geometry lock required before preview"], preview: null};
 if (!roomModel || roomModel.valid !== true || roomModel.dimensions?.valid !== true) return {ok: false, errors: ["valid dimensioned room model required"], preview: null};
 if (!text(sourceEvidenceRef)) return {ok: false, errors: ["source evidence reference required"], preview: null};
 if (!text(previewId)) return {ok: false, errors: ["previewId required"], preview: null};
 const disclosure = describeRenovisionPreview({mode, geometryLocked: true, physicalBenchmarkPassed: false, fieldMeasurementsVerified: lock.fieldVerified === true});
 if (disclosure.valid !== true) return {ok: false, errors: disclosure.errors, preview: null};
 const measuredDimensions = ["width", "depth", "height"].filter((f) => roomModel.features[f]).map((f) => ({featureId: f, meters: roomModel.features[f].meters, fieldVerified: roomModel.features[f].fieldVerified === true}));
 const claim = assessVisualClaim({mode, sourceEvidenceRef, geometryLocked: true, measuredDimensions, generatedImageRef: "svg:" + previewId, hasIndependentBenchmark: false});
 const diff = compareRoomStates({existingFeatures, proposedFeatures});
 const existingPlan = buildPlanFromRoomModel(roomModel, {label: "Existing"});
 const proposedPlan = buildPlanFromRoomModel(roomModel, {label: "Proposed", features: proposedFeatures.filter((f) => f.renderAsFootprint === true)});
 const preview = {
   previewId, mode, status: "concept",
   disclosure, claim,
   geometryDigest: lock.geometryDigest,
   fieldVerified: lock.fieldVerified === true,
   accuracyClaimAuthorized: false,
   existingPlan, proposedPlan, diff,
   existingSvg: renderFloorPlanSvg({plan: existingPlan, title: disclosure.title + " — Existing", disclosure}),
   proposedSvg: renderFloorPlanSvg({plan: proposedPlan, title: disclosure.title + " — Proposed", disclosure}),
   verified: false
 };
 return {ok: true, errors: [], preview};
}
