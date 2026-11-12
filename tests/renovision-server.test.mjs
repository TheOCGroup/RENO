import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {createHash} from "node:crypto";
import {createRenovisionServer, createMemoryApprovalRegistry} from "../src/renovisionServer.mjs";
import {createDurableEvidenceStorage} from "../lib/renovision/durable-evidence-storage.mjs";
import {createDurableSpatialEventStore} from "../lib/renovision/durable-spatial-event-store.mjs";
const H = {"x-actor-id": "operator-1", "x-tenant-id": "tenant-a", "content-type": "application/json"};
async function boot(t) {
 const dir = await mkdtemp(join(tmpdir(), "renovision-server-"));
 t.after(() => rm(dir, {recursive: true, force: true}));
 const actorTenants = new Map();
 const authenticate = async (req) => {
   const id = req.headers["x-actor-id"], tenantId = req.headers["x-tenant-id"];
   if (!id || !tenantId) return null;
   actorTenants.set(id, tenantId);
   return {id, tenantId, authenticated: true, roles: ["admin"], propertyIds: ["*"], roomIds: []};
 };
 const authorize = async ({actorId, tenantId}) => Boolean(actorId && actorTenants.has(actorId) && (!tenantId || actorTenants.get(actorId) === tenantId));
 const evidenceStorage = createDurableEvidenceStorage({rootDir: join(dir, "evidence"), authorize});
 const eventStore = createDurableSpatialEventStore({rootDir: join(dir, "events"), authorize: async (scope) => authorize({actorId: scope?.actor?.id, tenantId: scope?.tenantId})});
 const server = createRenovisionServer({authenticate, resolveApproval: createMemoryApprovalRegistry(), evidenceStorage, eventStore});
 await new Promise((r) => server.listen(0, "127.0.0.1", r));
 t.after(() => server.close());
 return "http://127.0.0.1:" + server.address().port;
}
const call = async (base, method, path, body, headers = H) => {
 const res = await fetch(base + path, {method, headers, body: body ? JSON.stringify(body) : undefined});
 return {status: res.status, body: await res.json().catch(async () => ({raw: await res.text()}))};
};
test("http end-to-end: project, evidence, capture, measurements, lock, proposal, preview, furnishing, comparison", async (t) => {
 const base = await boot(t);
 let r = await call(base, "POST", "/api/renovision/projects", {projectId: "reno-http-1", propertyId: "property-1", roomId: "room-1"});
 assert.equal(r.status, 201);
 const bytes = new TextEncoder().encode("http capture bytes");
 r = await call(base, "POST", "/api/renovision/projects/reno-http-1/evidence", {contentBase64: Buffer.from(bytes).toString("base64"), mimeType: "image/png", captureId: "capture-1"});
 assert.equal(r.status, 201);
 const receipt = r.body.receipt;
 assert.equal(receipt.digest, "sha256:" + createHash("sha256").update(bytes).digest("hex"));
 const manifest = {tenantId: "tenant-a", propertyId: "property-1", roomId: "room-1", captureId: "capture-1", operatorId: "operator-1", deviceModel: "laser-x", coordinateFrame: "local", capturedAt: "2026-10-26T10:00:00Z", platform: "web", calibrationStatus: "calibrated", coverageGaps: [], artifacts: [{id: receipt.storageRef, kind: "photo", digest: receipt.digest, byteLength: receipt.byteLength}]};
 r = await call(base, "POST", "/api/renovision/projects/reno-http-1/captures", {manifest, qualityInput: {blurScore: 0.1, depthCoverageFraction: 0.5, deviceClass: "browser"}});
 assert.equal(r.status, 200);
 assert.equal(r.body.project.stage, "capture_review");
 r = await call(base, "POST", "/api/renovision/projects/reno-http-1/capture-review", {decision: "accept"});
 assert.equal(r.body.project.stage, "measurement_review");
 const mk = (featureId, value) => ({propertyId: "property-1", roomId: "room-1", measurementId: "meas-" + featureId, featureId, captureId: "capture-1", deviceModel: "laser-x", platform: "web", timestamp: "2026-10-26T10:00:00Z", coordinateFrame: "local", evidenceRef: receipt.digest, semanticType: "wall", method: "manual_laser", value, unit: "m", uncertainty: 0.02, calibrationStatus: "calibrated", verificationStatus: "verified", verifiedBy: "verifier-1", verifiedAt: "2026-10-26T11:00:00Z", geometryState: "EXISTING", fieldMeasured: true});
 for (const [f, v] of [["width", 3.6], ["depth", 4.2], ["height", 2.7], ["door_width", 0.9], ["door_offset", 0.5], ["window_width", 1.2], ["window_offset", 1], ["obstruction_offset", 2]]) {
   r = await call(base, "POST", "/api/renovision/projects/reno-http-1/measurements", {record: mk(f, v)});
   assert.equal(r.status, 201, f);
 }
 r = await call(base, "POST", "/api/renovision/projects/reno-http-1/lock", {});
 assert.equal(r.status, 200);
 assert.equal(r.body.lock.locked, true);
 r = await call(base, "POST", "/api/renovision/approvals", {approvalRef: "approval-1", propertyId: "property-1", roomId: "room-1", featureId: "floor-main", scopeItemId: "scope-floor-1", status: "approved", approvedBy: "founder", approvedAt: "2026-10-20T09:00:00Z", allowedActorIds: ["operator-1"]});
 assert.equal(r.status, 201);
 r = await call(base, "POST", "/api/renovision/projects/reno-http-1/proposals", {change: {featureId: "floor-main", semanticType: "floor", scopeItemId: "scope-floor-1", approvalRef: "approval-1", eventId: "evt-1", reason: "approved flooring change", baseline: {featureId: "floor-main", semanticType: "floor", label: "Existing vinyl"}, proposed: {label: "White oak"}}});
 assert.equal(r.status, 201);
 r = await call(base, "POST", "/api/renovision/projects/reno-http-1/preview", {mode: "renovate"});
 assert.equal(r.status, 200);
 assert.equal(r.body.preview.accuracyClaimAuthorized, false);
 assert.equal(r.body.preview.disclosure.title, "Renovation concept preview");
 const svgRes = await fetch(base + "/api/renovision/projects/reno-http-1/preview/proposed.svg", {headers: H});
 assert.equal(svgRes.status, 200);
 const svg = await svgRes.text();
 assert.match(svg, /CONCEPT/);
 r = await call(base, "POST", "/api/renovision/projects/reno-http-1/furnishing", {items: [{id: "sofa-1", productId: "sofa-001", dimensionSource: "manufacturer-spec", dimensionsVerified: true, width: 2.1, depth: 0.95, x: 0.4, y: 0.4, clearance: 0.3, uncertaintyMeters: 0.01}]});
 assert.equal(r.body.plan.items[0].verdict, "fits_with_uncertainty_margin");
 r = await call(base, "POST", "/api/renovision/projects/reno-http-1/comparison", {});
 assert.equal(r.body.comparison.diff.summary.modified, 1);
});
test("unauthenticated requests are rejected and cross-tenant projects are invisible", async (t) => {
 const base = await boot(t);
 let r = await call(base, "POST", "/api/renovision/projects", {projectId: "reno-http-2", propertyId: "property-1", roomId: "room-1"});
 assert.equal(r.status, 201);
 const noAuth = await fetch(base + "/api/renovision/projects/reno-http-2", {method: "GET"});
 assert.equal(noAuth.status, 401);
 r = await call(base, "GET", "/api/renovision/projects/reno-http-2", null, {"x-actor-id": "operator-9", "x-tenant-id": "tenant-b"});
 assert.equal(r.status, 404);
});
test("the operator interface is served with the permanent accuracy disclosure", async (t) => {
 const base = await boot(t);
 const studio = await fetch(base + "/");
 assert.equal(studio.status, 200);
 const studioHtml = await studio.text();
 assert.match(studioHtml, /Upload room photo/);
 assert.match(studioHtml, /AI redesign not generated/);
 const res = await fetch(base + "/operator");
 assert.equal(res.status, 200);
 const html = await res.text();
 assert.match(html, /Concept visualization only/);
 assert.match(html, /RENOVISION AI/);
 const health = await (await fetch(base + "/health")).json();
 assert.equal(health.accuracyClaimsAuthorized, false);
 assert.equal(health.evidenceStorageClass, "durable-filesystem");
});
test("proposals fail closed when no approval exists", async (t) => {
 const base = await boot(t);
 await call(base, "POST", "/api/renovision/projects", {projectId: "reno-http-3", propertyId: "property-1", roomId: "room-1"});
 const r = await call(base, "POST", "/api/renovision/projects/reno-http-3/proposals", {change: {featureId: "floor-main", semanticType: "floor", scopeItemId: "s1", approvalRef: "missing", eventId: "evt-x", reason: "test"}});
 assert.equal(r.status, 422);
 assert.equal(r.body.ok, false);
});

test("durable project creation rejects storage failure without caching a phantom project", async (t) => {
 const dir = await mkdtemp(join(tmpdir(), "renovision-create-fail-"));
 t.after(() => rm(dir, {recursive:true, force:true}));
 const authenticate = async () => ({id:"operator-1",tenantId:"tenant-a",authenticated:true,roles:["admin"],propertyIds:["*"],roomIds:[]});
 const evidenceStorage = createDurableEvidenceStorage({rootDir:join(dir,"evidence"),authorize:async()=>true});
 const projectStore = {storageClass:"test-failing",load:async()=>null,save:async()=>{throw Error("simulated persistence failure");}};
 const server = createRenovisionServer({authenticate,evidenceStorage,projectStore});
 await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
 t.after(()=>server.close());
 const base="http://127.0.0.1:"+server.address().port;
 const response=await call(base,"POST","/api/renovision/projects",{projectId:"failure-case",propertyId:"property-1",roomId:"room-1"});
 assert.notEqual(response.status,201);
 assert.equal(server.renovisionProjects.size,0);
 const lookup=await call(base,"GET","/api/renovision/projects/failure-case");
 assert.equal(lookup.status,404);
});

test("HTTP project creation maps GCS generation conflict to 409",async(t)=>{
 const dir=await mkdtemp(join(tmpdir(),"renovision-http-conflict-"));
 t.after(()=>rm(dir,{recursive:true,force:true}));
 const authenticate=async()=>({id:"operator-1",tenantId:"tenant-a",authenticated:true,roles:["admin"],propertyIds:["*"],roomIds:[]});
 const evidenceStorage=createDurableEvidenceStorage({rootDir:join(dir,"evidence"),authorize:async()=>true});
 const projectStore={storageClass:"gcs-test",load:async()=>null,save:async()=>{const e=new Error("generation mismatch");e.code="PROJECT_WRITE_CONFLICT";throw e;}};
 const server=createRenovisionServer({authenticate,evidenceStorage,projectStore});
 await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
 t.after(()=>server.close());
 const response=await call("http://127.0.0.1:"+server.address().port,"POST","/api/renovision/projects",{projectId:"conflict",propertyId:"property-1",roomId:"room-1"});
 assert.equal(response.status,409);
 assert.deepEqual(response.body.errors,["project_write_conflict"]);
 assert.equal(server.renovisionProjects.size,0);
});

test("durable project reads bypass stale per-instance cache",async(t)=>{
 const dir=await mkdtemp(join(tmpdir(),"renovision-shared-store-"));
 t.after(()=>rm(dir,{recursive:true,force:true}));
 const authenticate=async()=>({id:"operator-1",tenantId:"tenant-a",authenticated:true,roles:["admin"],propertyIds:["*"],roomIds:[]});
 const evidenceStorage=createDurableEvidenceStorage({rootDir:join(dir,"evidence"),authorize:async()=>true});
 const records=new Map();
 const projectStore={storageClass:"shared-test",load:async(id,tenant)=>structuredClone(records.get(tenant+"/"+id)??null),save:async(id,data)=>{records.set(data.tenantId+"/"+id,structuredClone(data));}};
 const servers=await Promise.all([0,1].map(async()=>{
  const server=createRenovisionServer({authenticate,evidenceStorage,projectStore});
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  t.after(()=>server.close());
  return "http://127.0.0.1:"+server.address().port;
 }));
 const [a,b]=servers;
 const created=await call(a,"POST","/api/renovision/projects",{projectId:"shared-1",propertyId:"property-1",roomId:"room-1"});
 assert.equal(created.status,201);
 const first=await call(b,"GET","/api/renovision/projects/shared-1");
 assert.equal(first.status,200);
 const changed=structuredClone(records.get("tenant-a/shared-1"));
 changed.stage="measurement_review";
 records.set("tenant-a/shared-1",changed);
 const fresh=await call(b,"GET","/api/renovision/projects/shared-1");
 assert.equal(fresh.status,200);
 assert.equal(fresh.body.project.stage,"measurement_review");
});

test("approval registration fails closed without a durable approval authority",async(t)=>{
 const dir=await mkdtemp(join(tmpdir(),"renovision-no-approval-"));
 t.after(()=>rm(dir,{recursive:true,force:true}));
 const authenticate=async()=>({id:"operator-1",tenantId:"tenant-a",authenticated:true,roles:["admin"],propertyIds:["*"],roomIds:[]});
 const evidenceStorage=createDurableEvidenceStorage({rootDir:join(dir,"evidence"),authorize:async()=>true});
 const server=createRenovisionServer({authenticate,evidenceStorage,resolveApproval:null});
 await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
 t.after(()=>server.close());
 const base="http://127.0.0.1:"+server.address().port;
 const response=await call(base,"POST","/api/renovision/approvals",{approvalRef:"untrusted",propertyId:"property-1",roomId:"room-1"});
 assert.equal(response.status,501);
 assert.deepEqual(response.body.errors,["approval_registry_not_configured"]);
});

test("approval references cannot be overwritten across tenants or by a second registration",async(t)=>{
 const base=await boot(t);
 const payload={approvalRef:"immutable-ref",propertyId:"property-1",roomId:"room-1",status:"approved",approvedBy:"founder"};
 const first=await call(base,"POST","/api/renovision/approvals",payload);
 assert.equal(first.status,201);
 const duplicate=await call(base,"POST","/api/renovision/approvals",{...payload,status:"rejected"});
 assert.equal(duplicate.status,409);
 assert.deepEqual(duplicate.body.errors,["approval_ref_conflict"]);
 const crossTenant=await call(base,"POST","/api/renovision/approvals",payload,{"x-actor-id":"other-actor","x-tenant-id":"tenant-b","content-type":"application/json"});
 assert.equal(crossTenant.status,409);
});

test("approval audit identity and time are server-owned, not caller-supplied",async(t)=>{
 const base=await boot(t);
 const result=await call(base,"POST","/api/renovision/approvals",{
  approvalRef:"server-audit",propertyId:"property-1",roomId:"room-1",
  status:"approved",approvedBy:"spoofed-founder",approvedAt:"2020-01-01T00:00:00Z"
 });
 assert.equal(result.status,201);
 assert.equal(result.body.approval.approvedBy,"operator-1");
 assert.notEqual(result.body.approval.approvedAt,"2020-01-01T00:00:00Z");
 assert.ok(Math.abs(Date.parse(result.body.approval.approvedAt)-Date.now())<30000);
});
