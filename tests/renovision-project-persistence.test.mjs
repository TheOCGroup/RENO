import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {webcrypto, createHash} from "node:crypto";
import {appendAuditEntry, verifyAuditChain} from "../lib/renovision/audit-chain.mjs";
import {createFileProjectStore} from "../lib/renovision/project-store.mjs";
import {buildExportPackage, verifyExportPackage} from "../lib/renovision/export-package.mjs";
import {RenovisionProject} from "../lib/renovision/project-workflow.mjs";
import {createMemoryEvidenceStorage} from "../lib/renovision/memory-evidence-storage.mjs";
const actor = {id: "operator-1", tenantId: "tenant-a", authenticated: true};
test("audit chain detects edits, deletions and reordering", () => {
 let chain = [];
 chain = appendAuditEntry(chain, {action: "a", actorId: "op", at: "2026-10-27T00:00:00Z", detail: {n: 1}});
 chain = appendAuditEntry(chain, {action: "b", actorId: "op", at: "2026-10-27T00:01:00Z", detail: {n: 2}});
 assert.equal(verifyAuditChain(chain).valid, true);
 const edited = structuredClone(chain); edited[0].detail.n = 99;
 assert.equal(verifyAuditChain(edited).valid, false);
 assert.equal(verifyAuditChain(chain.slice(1)).valid, false);
 assert.equal(verifyAuditChain([chain[1], chain[0]]).valid, false);
 assert.equal(verifyAuditChain([]).valid, true);
});
async function lockedProject() {
 const project = new RenovisionProject({projectId: "reno-persist-1", tenantId: "tenant-a", propertyId: "property-1", roomId: "room-1", createdBy: "operator-1"});
 const bytes = new TextEncoder().encode("persist fixture");
 const blob = new Blob([bytes], {type: "image/png"});
 const digest = "sha256:" + createHash("sha256").update(bytes).digest("hex");
 const storage = createMemoryEvidenceStorage({authorize: async () => true});
 const receipt = await storage.put({blob, artifact: {propertyId: "property-1", roomId: "room-1"}, actorId: "operator-1", retentionDays: 30});
 const manifest = {tenantId: "tenant-a", propertyId: "property-1", roomId: "room-1", captureId: "capture-1", operatorId: "operator-1", deviceModel: "laser-x", coordinateFrame: "local", capturedAt: "2026-10-26T10:00:00Z", platform: "web", calibrationStatus: "calibrated", coverageGaps: [], artifacts: [{id: receipt.storageRef, kind: "photo", digest, byteLength: blob.size}]};
 await project.registerCapture({actor, manifest, loadArtifact: async ({artifactId, actor: a}) => storage.get({storageRef: artifactId, actorId: a.id}), cryptoApi: webcrypto});
 project.reviewCapture({actor, decision: "accept"});
 const mk = (featureId, value) => ({propertyId: "property-1", roomId: "room-1", measurementId: "meas-" + featureId, featureId, captureId: "capture-1", deviceModel: "laser-x", platform: "web", timestamp: "2026-10-26T10:00:00Z", coordinateFrame: "local", evidenceRef: digest, semanticType: "wall", method: "manual_laser", value, unit: "m", uncertainty: 0.02, calibrationStatus: "calibrated", verificationStatus: "verified", verifiedBy: "verifier-1", verifiedAt: "2026-10-26T11:00:00Z", geometryState: "EXISTING", fieldMeasured: true});
 for (const [f, v] of [["width", 3.6], ["depth", 4.2], ["height", 2.7]]) project.addMeasurement({actor, record: mk(f, v)});
 project.lockGeometry({actor});
 return project;
}
test("project serialize/restore round-trips full state with a valid audit chain", async () => {
 const project = await lockedProject();
 const data = project.serialize();
 const restored = RenovisionProject.restore(data);
 assert.equal(restored.stage, "geometry_locked");
 assert.equal(restored.lock.geometryDigest, project.lock.geometryDigest);
 assert.equal(restored.snapshot().audit.length, project.snapshot().audit.length);
 assert.equal(verifyAuditChain(restored.snapshot().audit).valid, true);
});
test("restore rejects a project record with a tampered audit trail", async () => {
 const project = await lockedProject();
 const data = project.serialize();
 data.audit[0].detail = {forged: true};
 assert.throws(() => RenovisionProject.restore(data), /hash mismatch/);
});
test("file project store persists records across instances and rejects unsafe ids", async (t) => {
 const dir = await mkdtemp(join(tmpdir(), "renovision-projects-"));
 t.after(() => rm(dir, {recursive: true, force: true}));
 const project = await lockedProject();
 const store = createFileProjectStore({rootDir: dir});
 await store.save(project.projectId, project.serialize());
 const reopened = createFileProjectStore({rootDir: dir});
 const loaded = await reopened.load(project.projectId, "tenant-a");
 assert.equal(loaded.stage, "geometry_locked");
 assert.equal(await reopened.load(project.projectId, "tenant-b"), null);
 assert.deepEqual(await reopened.list("tenant-a"), ["reno-persist-1"]);
 assert.deepEqual(await reopened.list("tenant-b"), []);
 assert.equal(await reopened.load("../escape", "tenant-a"), null);
 await assert.rejects(() => store.save("../escape", {projectId: "../escape"}), /invalid project record/);
});
test("export package verifies and detects tampering", async () => {
 const project = await lockedProject();
 const pkg = buildExportPackage({projectData: project.serialize(), exportedBy: "operator-1"});
 const result = verifyExportPackage(pkg);
 assert.equal(result.valid, true);
 assert.equal(result.certified, false);
 assert.ok(result.auditEntries > 0);
 const tampered = structuredClone(pkg);
 tampered.content.project.measurements[0].value = 99;
 assert.equal(verifyExportPackage(tampered).valid, false);
});
