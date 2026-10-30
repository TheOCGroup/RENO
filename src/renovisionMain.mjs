/** RENOVISION service entry point.
 * Identity (fail closed): production mode verifies OIDC ID tokens against
 * RENOVISION_JWKS_URL with RENOVISION_TOKEN_ISSUER / RENOVISION_TOKEN_AUDIENCE.
 * If those are not configured the process refuses to start — unless
 * RENOVISION_DEMO_AUTH=1 explicitly selects the local demo mode (header actor
 * with admin entitlement, for development only, never for deployment).
 * Storage: durable filesystem under RENOVISION_DATA_DIR (default
 * ./data/renovision), or Google Cloud Storage when RENOVISION_GCS_BUCKET is
 * set. No cloud resources are provisioned by this process. */
import {join} from "node:path";
import {createRenovisionServer, createMemoryApprovalRegistry} from "./renovisionServer.mjs";
import {createDurableEvidenceStorage} from "../lib/renovision/durable-evidence-storage.mjs";
import {createGcsEvidenceStorage} from "../lib/renovision/gcs-evidence-storage.mjs";
import {createDurableSpatialEventStore} from "../lib/renovision/durable-spatial-event-store.mjs";
import {createFileProjectStore} from "../lib/renovision/project-store.mjs";
import {createTokenAuthenticator} from "../lib/renovision/identity.mjs";
import {authorizeAction} from "../lib/renovision/access-control.mjs";
import {createRenderProvider} from "../lib/renovision/render-provider.mjs";
const dataDir = process.env.RENOVISION_DATA_DIR || join(process.cwd(), "data", "renovision");
const actorRegistry = new Map();
const registerActor = (actor) => { if (actor?.id) actorRegistry.set(actor.id, actor); };
const authorizeStorage = async ({actorId, tenantId, propertyId, roomId}) => {
 const actor = actorRegistry.get(actorId);
 if (!actor) return false;
 return authorizeAction(actor, {action: "project:read", tenantId, propertyId, roomId}).allowed;
};
let authenticate, identityMode;
if (process.env.RENOVISION_DEMO_AUTH === "1") {
 identityMode = "demo";
 authenticate = async (req) => {
   const id = req.headers["x-actor-id"], tenantId = req.headers["x-tenant-id"];
   if (typeof id !== "string" || !id.trim() || typeof tenantId !== "string" || !tenantId.trim()) return null;
   const actor = {id, tenantId, authenticated: true, roles: ["admin"], propertyIds: ["*"], roomIds: []};
   registerActor(actor);
   return actor;
 };
 console.log("WARNING: RENOVISION_DEMO_AUTH=1 — demo header identity with admin entitlement. Local development only; never deploy this mode.");
} else {
 const authenticator = createTokenAuthenticator({
   jwksUrl: process.env.RENOVISION_JWKS_URL,
   fetchImpl: (...args) => fetch(...args),
   audience: process.env.RENOVISION_TOKEN_AUDIENCE,
   issuer: process.env.RENOVISION_TOKEN_ISSUER,
   tenantClaim: process.env.RENOVISION_TENANT_CLAIM || "tenant_id",
   singleUseJti: process.env.RENOVISION_TOKEN_SINGLE_USE === "1",
   onActor: registerActor
 });
 if (!authenticator.configured) {
   console.error("RENOVISION identity is not configured: set RENOVISION_JWKS_URL, RENOVISION_TOKEN_ISSUER and RENOVISION_TOKEN_AUDIENCE, or set RENOVISION_DEMO_AUTH=1 for local development. Refusing to start (fail closed).");
   process.exit(1);
 }
 identityMode = "token";
 authenticate = authenticator.authenticate;
 console.log("RENOVISION identity: verified ID tokens (issuer " + process.env.RENOVISION_TOKEN_ISSUER + ")");
}
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
const eventStore = createDurableSpatialEventStore({rootDir: join(dataDir, "events"), authorize: async (scope) => authorizeStorage({actorId: scope?.actor?.id, tenantId: scope?.tenantId, propertyId: scope?.propertyId, roomId: scope?.roomId})});
const projectStore = createFileProjectStore({rootDir: join(dataDir, "projects")});
const approvals = createMemoryApprovalRegistry();
const renderProvider = createRenderProvider({enabled: process.env.RENOVISION_PHOTOREAL_ENABLED === "1", founderApproved: process.env.RENOVISION_PHOTOREAL_FOUNDER_APPROVED === "1"});
const server = createRenovisionServer({authenticate, resolveApproval: approvals, evidenceStorage, eventStore, projectStore, renderProvider, identityMode});
const port = Number(process.env.PORT || 8787);
server.listen(port, () => {
 console.log("RENOVISION server listening on http://localhost:" + port + " (identity: " + identityMode + ", projects durable at " + join(dataDir, "projects") + ")");
 console.log("Photorealistic rendering: " + (renderProvider.status().enabled ? "ENABLED by founder-approved flag" : "disabled") + ". No accuracy claims are authorized by this service.");
});
