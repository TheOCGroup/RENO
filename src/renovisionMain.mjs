/** RENOVISION local/demo entry point.
 * Storage: durable filesystem under RENOVISION_DATA_DIR (default ./data/renovision),
 * or Google Cloud Storage when RENOVISION_GCS_BUCKET is set (token from the GCP
 * metadata server or RENOVISION_GCS_TOKEN_URL). No cloud resources are provisioned
 * by this process — the bucket and identity must already exist (founder-approved).
 * Auth: DEMO header auth (x-actor-id / x-tenant-id) for local use only. Production
 * must inject a real identity provider via createRenovisionServer. */
import {join} from "node:path";
import {createRenovisionServer, createMemoryApprovalRegistry} from "./renovisionServer.mjs";
import {createDurableEvidenceStorage} from "../lib/renovision/durable-evidence-storage.mjs";
import {createGcsEvidenceStorage} from "../lib/renovision/gcs-evidence-storage.mjs";
import {createDurableSpatialEventStore} from "../lib/renovision/durable-spatial-event-store.mjs";
const dataDir = process.env.RENOVISION_DATA_DIR || join(process.cwd(), "data", "renovision");
const actorTenants = new Map();
const authenticate = async (req) => {
 const id = req.headers["x-actor-id"], tenantId = req.headers["x-tenant-id"];
 if (typeof id !== "string" || !id.trim() || typeof tenantId !== "string" || !tenantId.trim()) return null;
 actorTenants.set(id, tenantId);
 return {id, tenantId, authenticated: true};
};
// Authorization policy for storage adapters: the actor must be a known session actor;
// when the stored scope carries a tenant, it must match the actor's session tenant.
// Property-level entitlement resolution is a production integration point.
const authorizeStorage = async ({actorId, tenantId}) => {
 if (!actorId || !actorTenants.has(actorId)) return false;
 if (tenantId && actorTenants.get(actorId) !== tenantId) return false;
 return true;
};
let evidenceStorage;
if (process.env.RENOVISION_GCS_BUCKET) {
 const tokenUrl = process.env.RENOVISION_GCS_TOKEN_URL || "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token";
 evidenceStorage = createGcsEvidenceStorage({
   bucket: process.env.RENOVISION_GCS_BUCKET,
   fetchImpl: (...args) => fetch(...args),
   getAccessToken: async () => {
     const res = await fetch(tokenUrl, {headers: {"Metadata-Flavor": "Google"}});
     if (!res.ok) throw Error("metadata token unavailable");
     const body = await res.json();
     if (!body?.access_token) throw Error("metadata token unavailable");
     return body.access_token;
   },
   authorize: authorizeStorage
 });
 console.log("RENOVISION evidence storage: Google Cloud Storage bucket " + process.env.RENOVISION_GCS_BUCKET + " (must already exist; nothing provisioned)");
} else {
 evidenceStorage = createDurableEvidenceStorage({rootDir: join(dataDir, "evidence"), authorize: authorizeStorage});
 console.log("RENOVISION evidence storage: durable filesystem at " + join(dataDir, "evidence"));
}
const eventStore = createDurableSpatialEventStore({rootDir: join(dataDir, "events"), authorize: async (scope) => {
 // commitSpatialEvent passes the full actor object inside the scope.
 const actorId = scope?.actor?.id;
 if (!actorId || !actorTenants.has(actorId)) return false;
 if (scope?.tenantId && actorTenants.get(actorId) !== scope.tenantId) return false;
 return true;
}});
const approvals = createMemoryApprovalRegistry();
const server = createRenovisionServer({authenticate, resolveApproval: approvals, evidenceStorage, eventStore});
const port = Number(process.env.PORT || 8787);
server.listen(port, () => {
 console.log("RENOVISION demo server listening on http://localhost:" + port);
 console.log("WARNING: demo header authentication only — do not expose publicly. No accuracy claims are authorized by this service.");
});
