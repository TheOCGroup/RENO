/** Google Cloud Storage evidence adapter (approved GCP architecture).
 * Implements the same put/get contract as the memory and filesystem adapters so the
 * evidence repository and manifest verification code paths do not change.
 * No resources are provisioned by this module: the bucket, workload identity and
 * access-token provider are injected by deployment configuration. Every operation
 * fails closed when configuration, authorization or scope metadata is missing.
 * Tenant isolation is enforced by (1) the injected authorize callback, (2) scope
 * metadata stored on each object and re-verified before bytes are returned. */
import {randomBytes} from "node:crypto";
import {MAX_EVIDENCE_BYTES} from "./frame-evidence.mjs";
const REF_PATTERN = /^gcs-evidence-[a-f0-9]{24}$/;
const API = "https://storage.googleapis.com";
const text = (x) => typeof x === "string" && x.trim().length > 0;
export function buildGcsEvidenceObjectName({prefix = "renovision-evidence", storageRef} = {}) {
 if (!REF_PATTERN.test(storageRef ?? "")) return null;
 const cleanPrefix = String(prefix).replace(/^\/+|\/+$/g, "");
 return cleanPrefix + "/evidence/" + storageRef;
}
export function createGcsEvidenceStorage({bucket, getAccessToken, fetchImpl, authorize, clock = () => Date.now(), prefix = "renovision-evidence"} = {}) {
 if (typeof authorize !== "function") throw new TypeError("authorization callback required");
 const configured = () => text(bucket) && typeof getAccessToken === "function" && typeof fetchImpl === "function";
 const headers = async (extra = {}) => ({authorization: "Bearer " + (await getAccessToken()), ...extra});
 return {
   async put({blob, artifact, actorId, retentionDays}) {
     if (!configured()) throw Error("gcs evidence storage not configured");
     if (!text(artifact?.tenantId)) throw Error("tenant-scoped evidence required");
     if (!await authorize({action: "write", actorId, propertyId: artifact?.propertyId, roomId: artifact?.roomId, tenantId: artifact?.tenantId})) throw Error("access denied");
     if (!blob || typeof blob.arrayBuffer !== "function" || !Number.isSafeInteger(blob.size) || blob.size <= 0 || blob.size > MAX_EVIDENCE_BYTES || !Number.isInteger(retentionDays) || retentionDays < 1 || retentionDays > 365) throw Error("invalid evidence");
     if (!text(artifact?.propertyId) || !text(artifact?.roomId)) throw Error("evidence scope required");
     const bytes = new Uint8Array(await blob.arrayBuffer());
     if (bytes.byteLength !== blob.size) throw Error("evidence size mismatch");
     const expiresAt = clock() + retentionDays * 86400000;
     if (!Number.isFinite(expiresAt)) throw Error("invalid retention clock");
     const storageRef = "gcs-evidence-" + randomBytes(12).toString("hex");
     const name = buildGcsEvidenceObjectName({prefix, storageRef});
     const metadata = {name, contentType: blob.type || "application/octet-stream", metadata: {tenantId: artifact.tenantId, propertyId: artifact.propertyId, roomId: artifact.roomId, digest: typeof artifact.digest === "string" ? artifact.digest.toLowerCase() : "", expiresAt: String(expiresAt)}};
     const boundary = "renovision-" + randomBytes(8).toString("hex");
     const body = new Blob([
       "--" + boundary + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" + JSON.stringify(metadata) + "\r\n--" + boundary + "\r\nContent-Type: " + metadata.contentType + "\r\n\r\n",
       bytes,
       "\r\n--" + boundary + "--"
     ]);
     const res = await fetchImpl(API + "/upload/storage/v1/b/" + encodeURIComponent(bucket) + "/o?uploadType=multipart", {method: "POST", headers: await headers({"content-type": "multipart/related; boundary=" + boundary}), body});
     if (!res || res.ok !== true) throw Error("storage write failed");
     return {accepted: true, storageRef};
   },
   async get({storageRef, actorId}) {
     if (!configured()) throw Error("gcs evidence storage not configured");
     if (!REF_PATTERN.test(storageRef ?? "")) throw Error("not found");
     const name = buildGcsEvidenceObjectName({prefix, storageRef});
     const objectUrl = API + "/storage/v1/b/" + encodeURIComponent(bucket) + "/o/" + encodeURIComponent(name);
     const metaRes = await fetchImpl(objectUrl, {method: "GET", headers: await headers()});
     if (!metaRes || metaRes.ok !== true) throw Error("not found");
     const object = await metaRes.json();
     const scope = object?.metadata ?? {};
     if (!text(scope.tenantId) || !text(scope.propertyId) || !text(scope.roomId)) throw Error("evidence scope missing");
     if (clock() >= Number(scope.expiresAt)) throw Error("expired");
     if (!await authorize({action: "read", actorId, propertyId: scope.propertyId, roomId: scope.roomId, tenantId: scope.tenantId})) throw Error("access denied");
     const dataRes = await fetchImpl(objectUrl + "?alt=media", {method: "GET", headers: await headers()});
     if (!dataRes || dataRes.ok !== true || typeof dataRes.blob !== "function") throw Error("evidence read failed");
     const blob = await dataRes.blob();
     if (!Number.isSafeInteger(blob?.size) || blob.size <= 0 || blob.size > MAX_EVIDENCE_BYTES) throw Error("evidence size mismatch");
     return blob;
   },
   async purgeExpired() { return 0; },
   get storageClass() { return "durable-gcs"; },
   get configured() { return configured(); }
 };
}
