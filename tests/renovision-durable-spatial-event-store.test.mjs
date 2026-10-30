import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {createDurableSpatialEventStore} from "../lib/renovision/durable-spatial-event-store.mjs";
import {commitSpatialEvent} from "../lib/renovision/transactional-change-log.mjs";
const actor = {id: "operator-1", tenantId: "tenant-a", authenticated: true};
const authorize = async (scope) => scope?.actor?.tenantId === "tenant-a" || scope?.tenantId === "tenant-a";
const scope = {tenantId: "tenant-a", propertyId: "property-1", roomId: "room-1", featureId: "floor-main"};
const event = {eventId: "evt-1", propertyId: "property-1", roomId: "room-1", featureId: "floor-main", actorId: "operator-1", occurredAt: "2026-10-26T10:00:00Z", reason: "approved flooring change", fromState: "EXISTING", toState: "PROPOSED", scopeItemId: "scope-floor-1", approvalRef: "approval-1"};
const resolveApproval = async () => ({status: "approved", tenantId: "tenant-a", propertyId: "property-1", roomId: "room-1", featureId: "floor-main", scopeItemId: "scope-floor-1", approvalRef: "approval-1", approvedAt: "2026-10-20T09:00:00Z", approvedBy: "founder", allowedActorIds: ["operator-1"]});
async function fixture(t) {
 const dir = await mkdtemp(join(tmpdir(), "renovision-events-"));
 t.after(() => rm(dir, {recursive: true, force: true}));
 return {dir, store: createDurableSpatialEventStore({rootDir: dir, authorize})};
}
test("transactional commits persist through the durable event store", async (t) => {
 const {dir, store} = await fixture(t);
 const committed = await commitSpatialEvent({store, actor, resolveApproval, event, expectedRevision: 0});
 assert.equal(committed.committed, true);
 assert.equal(committed.revision, 1);
 const reopened = createDurableSpatialEventStore({rootDir: dir, authorize});
 const snapshot = await reopened.readFeatureEvents({...scope, actor});
 assert.equal(snapshot.revision, 1);
 assert.equal(snapshot.events[0].eventId, "evt-1");
});
test("stale revision is rejected by compare-and-append", async (t) => {
 const {store} = await fixture(t);
 await commitSpatialEvent({store, actor, resolveApproval, event, expectedRevision: 0});
 const again = await store.compareAndAppend({...scope, actor, expectedRevision: 0, event});
 assert.equal(again.committed, false);
});
test("event stores are isolated per tenant scope", async (t) => {
 const {dir} = await fixture(t);
 const store = createDurableSpatialEventStore({rootDir: dir, authorize: async () => true});
 await commitSpatialEvent({store, actor, resolveApproval, event, expectedRevision: 0});
 const other = await store.readFeatureEvents({tenantId: "tenant-b", propertyId: "property-1", roomId: "room-1", featureId: "floor-main", actor: {...actor, tenantId: "tenant-b"}});
 assert.equal(other.revision, 0);
 assert.equal(other.events.length, 0);
});
test("denied authorization prevents reads and writes", async (t) => {
 const dir = await mkdtemp(join(tmpdir(), "renovision-events-"));
 t.after(() => rm(dir, {recursive: true, force: true}));
 const store = createDurableSpatialEventStore({rootDir: dir, authorize: async () => false});
 await assert.rejects(() => store.readFeatureEvents({...scope, actor}), /access denied/);
 await assert.rejects(() => store.compareAndAppend({...scope, actor, expectedRevision: 0, event}), /access denied/);
});
