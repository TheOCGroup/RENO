import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {createRenovisionServer, createMemoryApprovalRegistry} from "../src/renovisionServer.mjs";
import {createDurableEvidenceStorage} from "../lib/renovision/durable-evidence-storage.mjs";
import {createFileProjectStore} from "../lib/renovision/project-store.mjs";
import {emptyDesignWorkspace} from "../lib/renovision/design-workspace.mjs";
import {createProjectBudget} from "../lib/renovision/project-budget.mjs";
import {createManualProduct} from "../lib/renovision/product-catalog.mjs";
const H = {"x-actor-id": "operator-1", "x-tenant-id": "tenant-a", "content-type": "application/json"};
const HB = {"x-actor-id": "operator-9", "x-tenant-id": "tenant-b", "content-type": "application/json"};
const HV = {"x-actor-id": "viewer-1", "x-tenant-id": "tenant-a", "content-type": "application/json"};
const HO = {"x-actor-id": "outsider-1", "x-tenant-id": "tenant-a", "content-type": "application/json"};
const NOW = "2026-11-17T12:00:00.000Z";
const authenticate = async (req) => {
 const id = req.headers["x-actor-id"], tenantId = req.headers["x-tenant-id"];
 if (!id || !tenantId) return null;
 return {id, tenantId, authenticated: true, roles: [id.startsWith("viewer") ? "viewer" : "admin"], propertyIds: [id.startsWith("outsider") ? "property-other" : "*"], roomIds: []};
};
async function boot(t, dir, {withStore = true} = {}) {
 const evidenceStorage = createDurableEvidenceStorage({rootDir: join(dir, "evidence"), authorize: async () => true});
 const projectStore = withStore ? createFileProjectStore({rootDir: join(dir, "projects")}) : undefined;
 const server = createRenovisionServer({authenticate, resolveApproval: createMemoryApprovalRegistry(), evidenceStorage, projectStore});
 await new Promise((r) => server.listen(0, "127.0.0.1", r));
 t.after(() => server.close());
 return {server, base: "http://127.0.0.1:" + server.address().port};
}
async function bootDir(t, options) {
 const dir = await mkdtemp(join(tmpdir(), "renovision-phase2-"));
 t.after(() => rm(dir, {recursive: true, force: true}));
 return {dir, ...(await boot(t, dir, options))};
}
const call = async (base, method, path, body, headers = H) => {
 const res = await fetch(base + path, {method, headers, body: body ? JSON.stringify(body) : undefined});
 return {status: res.status, body: await res.json().catch(async () => ({raw: await res.text()}))};
};
const createProject = async (base, projectId, headers = H, propertyId = "property-1", roomId = "room-1") => {
 const r = await call(base, "POST", "/api/renovision/projects", {projectId, propertyId, roomId}, headers);
 assert.equal(r.status, 201);
 return r;
};
/** Fixture workspace whose expected totals are computed by hand from the
 * library semantics: cancelled lines excluded, actuals counted only where
 * recorded, per-category remaining measured against the allocation. */
function fixtureWorkspace() {
 const ws = emptyDesignWorkspace();
 const sofa = createManualProduct({productId: "p-sofa", name: "Linen sofa", type: "sofa", widthMeters: 2, depthMeters: 0.95, priceCents: 129900, deliveryCents: 4900, enteredBy: "test"}, NOW).product;
 const rug = createManualProduct({productId: "p-rug", name: "Wool rug", type: "rug", widthMeters: 1.6, depthMeters: 2.3, priceCents: 25000, deliveryCents: null, enteredBy: "test"}, NOW).product;
 ws.products = [sofa, rug];
 ws.shoppingListIds = ["p-sofa"];
 const budget = createProjectBudget({totalBudgetCents: 500000});
 budget.allocations = {furniture: 200000, materials: 50000};
 budget.lines = [
   {lineId: "b1", categoryId: "furniture", label: "Linen sofa", productId: "p-sofa", estimatedCents: 129900, actualCents: 120000, status: "purchased"},
   {lineId: "b2", categoryId: "furniture", label: "Side table", estimatedCents: 30000, actualCents: null, status: "planned"},
   {lineId: "b3", categoryId: "materials", label: "Paint and primer", estimatedCents: 60000, actualCents: null, status: "planned"},
   {lineId: "b4", categoryId: "furniture", label: "Cancelled extra", estimatedCents: 999999, actualCents: null, status: "cancelled"}
 ];
 ws.budget = budget;
 return ws;
}
async function bootWithBudgetProject(t) {
 const ctx = await bootDir(t);
 await createProject(ctx.base, "reno-budget-1");
 const saved = await call(ctx.base, "POST", "/api/renovision/projects/reno-budget-1/design-workspace", {workspace: fixtureWorkspace()});
 assert.equal(saved.status, 200);
 return ctx;
}

test("project list: returns only the actor's tenant projects, as safe summaries", async (t) => {
 const {base, dir} = await bootDir(t);
 await createProject(base, "proj-a1");
 await createProject(base, "proj-a2", H, "property-2", "room-2");
 await createProject(base, "proj-b1", HB);
 let r = await call(base, "GET", "/api/renovision/projects");
 assert.equal(r.status, 200);
 assert.deepEqual(r.body.projects.map((p) => p.projectId), ["proj-a1", "proj-a2"]);
 assert.deepEqual(r.body.projects[0], {projectId: "proj-a1", tenantId: "tenant-a", propertyId: "property-1", roomId: "room-1", stage: "capture_planned"});
 assert.deepEqual(r.body.projects[1], {projectId: "proj-a2", tenantId: "tenant-a", propertyId: "property-2", roomId: "room-2", stage: "capture_planned"});
 assert.ok(!JSON.stringify(r.body).includes(dir), "list response must not leak the storage directory");
 // Tenant B's list contains only tenant B's project — tenant A is invisible.
 r = await call(base, "GET", "/api/renovision/projects", null, HB);
 assert.equal(r.status, 200);
 assert.deepEqual(r.body.projects.map((p) => p.projectId), ["proj-b1"]);
 // A viewer holds project:read and may discover the tenant's projects.
 r = await call(base, "GET", "/api/renovision/projects", null, HV);
 assert.equal(r.status, 200);
 assert.deepEqual(r.body.projects.map((p) => p.projectId), ["proj-a1", "proj-a2"]);
});

test("project list: unauthenticated is rejected and unentitled properties are filtered out", async (t) => {
 const {base} = await bootDir(t);
 await createProject(base, "proj-a1");
 const anon = await fetch(base + "/api/renovision/projects");
 assert.equal(anon.status, 401);
 assert.deepEqual((await anon.json()).errors, ["authenticated_actor_required"]);
 // Same tenant, but entitled only to a different property: the project is
 // not listed (the scope check every other project route applies).
 const r = await call(base, "GET", "/api/renovision/projects", null, HO);
 assert.equal(r.status, 200);
 assert.deepEqual(r.body.projects, []);
});

test("project list: works on the in-memory fallback when no project store is injected", async (t) => {
 const {base} = await bootDir(t, {withStore: false});
 await createProject(base, "mem-1");
 await createProject(base, "mem-2");
 await createProject(base, "mem-b", HB);
 let r = await call(base, "GET", "/api/renovision/projects");
 assert.equal(r.status, 200);
 assert.deepEqual(r.body.projects.map((p) => p.projectId), ["mem-1", "mem-2"]);
 r = await call(base, "GET", "/api/renovision/projects", null, HB);
 assert.deepEqual(r.body.projects.map((p) => p.projectId), ["mem-b"]);
});

test("project list: durable store listing survives a server restart", async (t) => {
 const dir = await mkdtemp(join(tmpdir(), "renovision-phase2-restart-"));
 t.after(() => rm(dir, {recursive: true, force: true}));
 const first = await boot(t, dir);
 await createProject(first.base, "durable-1");
 await new Promise((r) => first.server.close(r));
 const second = await boot(t, dir);
 const r = await call(second.base, "GET", "/api/renovision/projects");
 assert.equal(r.status, 200);
 assert.deepEqual(r.body.projects.map((p) => p.projectId), ["durable-1"]);
});

test("budget-summary: server-computed totals match the library semantics", async (t) => {
 const {base} = await bootWithBudgetProject(t);
 const r = await call(base, "GET", "/api/renovision/projects/reno-budget-1/budget-summary");
 assert.equal(r.status, 200);
 const s = r.body.budgetSummary;
 assert.equal(s.computedBy, "server");
 assert.equal(s.hasDesignWorkspace, true);
 assert.equal(s.hasBudget, true);
 const b = s.budget;
 assert.equal(b.valid, true);
 assert.equal(b.verified, false);
 assert.equal(b.currency, "USD");
 assert.equal(b.categories.length, 15);
 const furniture = b.categories.find((c) => c.categoryId === "furniture");
 assert.deepEqual(
   {estimatedCents: furniture.estimatedCents, actualCents: furniture.actualCents, allocatedCents: furniture.allocatedCents, remainingVsAllocationCents: furniture.remainingVsAllocationCents, lineCount: furniture.lineCount, actualsRecorded: furniture.actualsRecorded, overAllocation: furniture.overAllocation},
   {estimatedCents: 159900, actualCents: 120000, allocatedCents: 200000, remainingVsAllocationCents: 40100, lineCount: 2, actualsRecorded: 1, overAllocation: false}
 );
 const materials = b.categories.find((c) => c.categoryId === "materials");
 assert.equal(materials.estimatedCents, 60000);
 assert.equal(materials.actualCents, 0);
 assert.equal(materials.remainingVsAllocationCents, -10000);
 assert.equal(materials.overAllocation, true);
 assert.equal(b.estimatedTotalCents, 219900);
 assert.equal(b.actualTotalCents, 120000);
 assert.equal(b.allocatedTotalCents, 250000);
 assert.equal(b.totalBudgetCents, 500000);
 assert.equal(b.remainingBudgetCents, 280100);
 assert.equal(b.totalsComplete, true);
 assert.equal(b.overBudget, false);
 assert.equal(b.actualOverBudget, false);
 assert.deepEqual(b.overBudgetCategories, ["materials"]);
 assert.ok(b.alerts.some((a) => a.kind === "estimate_over_allocation" && a.categoryId === "materials"));
 const shop = s.shoppingList;
 assert.equal(shop.valid, true);
 assert.equal(shop.items.length, 1);
 assert.equal(shop.items[0].productId, "p-sofa");
 assert.equal(shop.merchandiseCents, 129900);
 assert.equal(shop.deliveryCents, 4900);
 assert.equal(shop.totalCents, 134800);
 assert.equal(shop.totalsComplete, true);
});

test("budget-summary: shopping totals are withheld (null) when any delivery price is unknown", async (t) => {
 const {base} = await bootWithBudgetProject(t);
 const ws = fixtureWorkspace();
 ws.shoppingListIds = ["p-sofa", "p-rug"];
 const saved = await call(base, "POST", "/api/renovision/projects/reno-budget-1/design-workspace", {workspace: ws});
 assert.equal(saved.status, 200);
 const r = await call(base, "GET", "/api/renovision/projects/reno-budget-1/budget-summary");
 assert.equal(r.status, 200);
 const shop = r.body.budgetSummary.shoppingList;
 assert.equal(shop.items.length, 2);
 assert.equal(shop.merchandiseCents, 154900);
 assert.equal(shop.deliveryCents, null);
 assert.equal(shop.totalCents, null);
 assert.equal(shop.totalsComplete, false);
});

test("budget-summary: a project with no workspace returns an honest empty server summary", async (t) => {
 const {base} = await bootDir(t);
 await createProject(base, "reno-empty-1");
 const r = await call(base, "GET", "/api/renovision/projects/reno-empty-1/budget-summary");
 assert.equal(r.status, 200);
 const s = r.body.budgetSummary;
 assert.equal(s.computedBy, "server");
 assert.equal(s.hasDesignWorkspace, false);
 assert.equal(s.hasBudget, false);
 assert.equal(s.budget.valid, true);
 assert.equal(s.budget.estimatedTotalCents, 0);
 assert.equal(s.budget.actualTotalCents, 0);
 assert.equal(s.budget.allocatedTotalCents, 0);
 assert.equal(s.budget.totalBudgetCents, null);
 assert.equal(s.budget.remainingBudgetCents, null);
 assert.equal(s.budget.totalsComplete, true);
 assert.equal(s.shoppingList, null);
});

test("budget-summary: cross-tenant and missing projects are 404; unentitled actor is 403; anonymous is 401", async (t) => {
 const {base} = await bootWithBudgetProject(t);
 let r = await call(base, "GET", "/api/renovision/projects/reno-budget-1/budget-summary", null, HB);
 assert.equal(r.status, 404);
 assert.deepEqual(r.body.errors, ["project_not_found"]);
 r = await call(base, "GET", "/api/renovision/projects/no-such-project/budget-summary");
 assert.equal(r.status, 404);
 assert.deepEqual(r.body.errors, ["project_not_found"]);
 r = await call(base, "GET", "/api/renovision/projects/reno-budget-1/budget-summary", null, HO);
 assert.equal(r.status, 403);
 const anon = await fetch(base + "/api/renovision/projects/reno-budget-1/budget-summary");
 assert.equal(anon.status, 401);
});

test("budget-summary: overflow totals are withheld as null by the server, never zeroed", async (t) => {
 const {base} = await bootDir(t);
 await createProject(base, "reno-overflow-1");
 const ws = emptyDesignWorkspace();
 const budget = createProjectBudget({});
 budget.lines = [
   {lineId: "o1", categoryId: "furniture", label: "Huge one", estimatedCents: Number.MAX_SAFE_INTEGER, actualCents: null, status: "planned"},
   {lineId: "o2", categoryId: "furniture", label: "Huge two", estimatedCents: Number.MAX_SAFE_INTEGER, actualCents: null, status: "planned"}
 ];
 ws.budget = budget;
 const saved = await call(base, "POST", "/api/renovision/projects/reno-overflow-1/design-workspace", {workspace: ws});
 assert.equal(saved.status, 200);
 const r = await call(base, "GET", "/api/renovision/projects/reno-overflow-1/budget-summary");
 assert.equal(r.status, 200);
 const b = r.body.budgetSummary.budget;
 assert.equal(b.valid, true);
 const furniture = b.categories.find((c) => c.categoryId === "furniture");
 assert.equal(furniture.estimatedCents, null);
 assert.equal(b.estimatedTotalCents, null);
 assert.notEqual(b.estimatedTotalCents, 0);
 assert.equal(b.totalsComplete, false);
 assert.ok(b.alerts.some((a) => a.kind === "totals_overflow_withheld"));
});
