/** Exportable project evidence and review record. The package binds the full
 * serialized project (measurements with provenance, geometry lock + digest,
 * spatial events, proposals, preview metadata, furnishing verdicts, comparison
 * and the hash-chained audit trail) under one SHA-256 digest so any later edit
 * is detectable. Verification re-checks the digest and the audit chain; it does
 * not certify the underlying measurements. */
import {createHash} from "node:crypto";
import {verifyAuditChain} from "./audit-chain.mjs";
export const EXPORT_FORMAT = "renovision-export/v1";
const digestOf = (content) => "sha256:" + createHash("sha256").update(JSON.stringify(content)).digest("hex");
export function buildExportPackage({projectData, exportedBy, at = new Date().toISOString()} = {}) {
 if (!projectData || typeof projectData !== "object" || !projectData.projectId) throw Error("project data required");
 if (typeof exportedBy !== "string" || !exportedBy.trim()) throw Error("exporter identity required");
 const content = {format: EXPORT_FORMAT, exportedAt: at, exportedBy, project: structuredClone(projectData)};
 return {content, digest: digestOf(content), fieldVerified: false, certified: false};
}
export function verifyExportPackage(pkg) {
 const errors = [];
 if (!pkg || typeof pkg !== "object" || !pkg.content || pkg.content.format !== EXPORT_FORMAT) return {valid: false, errors: ["export format invalid"], fieldVerified: false};
 if (pkg.digest !== digestOf(pkg.content)) errors.push("export digest mismatch");
 const chain = verifyAuditChain(pkg.content.project?.audit ?? []);
 if (!chain.valid) errors.push(...chain.errors);
 const project = pkg.content.project;
 if (project?.lock && project.lock.geometryDigest && !/^sha256:[a-f0-9]{64}$/.test(project.lock.geometryDigest)) errors.push("geometry digest malformed");
 return {valid: errors.length === 0, errors, auditEntries: chain.entries, fieldVerified: false, certified: false};
}
