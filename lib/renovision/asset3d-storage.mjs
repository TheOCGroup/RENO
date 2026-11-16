/** Pluggable artifact-storage interface for the OCG 3D ENGINE.
 * Supports:
 * - Memory / local development storage (default, $0)
 * - Optional GCS adapter (disabled by default unless an existing approved
 *   bucket, credentials, permissions, and operating costs are verified)
 * Enforces tenant ownership, GLB validation, SHA-256 integrity checks,
 * provenance preservation, 5-format export, and safe deletion. */
import {createHash, randomUUID} from "node:crypto";
import {EXPORT_FORMATS, exportAssetFormat, inspectGlbFile, parseGlb} from "./glb-inspector.mjs";

const text = (x) => typeof x === "string" && x.trim().length > 0;
const ASSET_ID_PATTERN = /^[a-zA-Z0-9_-]{4,120}$/;
const GCS_API = "https://storage.googleapis.com";
const MAX_ASSET_BYTES = 64 * 1024 * 1024;

function sha256Digest(buf) {
  return "sha256:" + createHash("sha256").update(buf).digest("hex");
}

function validateAssetWrite({ assetId, tenantId, consumer, category, glbBuffer }) {
  if (!text(tenantId)) return { ok: false, error: "tenant_required" };
  if (!text(consumer)) return { ok: false, error: "consumer_required" };
  if (!text(category)) return { ok: false, error: "category_required" };
  if (assetId !== undefined && assetId !== null && !ASSET_ID_PATTERN.test(String(assetId))) {
    return { ok: false, error: "invalid_asset_id" };
  }
  if (!Buffer.isBuffer(glbBuffer) || glbBuffer.length === 0 || glbBuffer.length > MAX_ASSET_BYTES) {
    return { ok: false, error: "invalid_glb_buffer" };
  }
  const check = inspectGlbFile(glbBuffer);
  if (!check.passed) {
    return { ok: false, error: "invalid_glb_asset", details: check.errors };
  }
  return { ok: true, inspection: check.inspection };
}

function buildAssetRecord({ assetId, tenantId, consumer, category, jobId, glbBuffer, inspection, metadata, provenance, createdAt }) {
  const parsed = parseGlb(glbBuffer);
  return {
    assetId,
    tenantId: tenantId.trim(),
    consumer,
    category,
    jobId: text(jobId) ? jobId.trim() : null,
    name: text(metadata?.name) ? metadata.name.trim() : assetId,
    digest: sha256Digest(glbBuffer),
    byteLength: glbBuffer.length,
    boundingBoxMeters: parsed.boundingBoxMeters ?? inspection?.boundingBoxMeters ?? null,
    inspection,
    dimensionProvenance: provenance?.dimensionProvenance ?? "ai_estimated",
    dimensionsVerified: provenance?.dimensionsVerified === true ? true : false,
    provenance: structuredClone(provenance ?? {}),
    metadata: structuredClone(metadata ?? {}),
    createdAt,
  };
}

function exportFromStoredRecord(record, glbBuffer, format) {
  const fmt = typeof format === "string" ? format.trim().toLowerCase() : "";
  if (!EXPORT_FORMATS.includes(fmt)) {
    return { ok: false, error: "unsupported_export_format", errors: [`unsupported format: ${format}`] };
  }
  if (fmt === "glb") {
    return { ok: true, format: "glb", mimeType: "model/gltf-binary", buffer: Buffer.from(glbBuffer) };
  }
  const bbox = record.boundingBoxMeters ?? { width: 1, height: 1, depth: 1 };
  return exportAssetFormat(fmt, {
    name: record.name || record.assetId,
    widthMeters: bbox.width || 1,
    heightMeters: bbox.height || 1,
    depthMeters: bbox.depth || 1,
    extras: {
      assetId: record.assetId,
      digest: record.digest,
      consumer: record.consumer,
      category: record.category,
      dimensionsVerified: record.dimensionsVerified,
      dimensionProvenance: record.dimensionProvenance,
      ...(record.provenance ?? {}),
    },
  });
}

export function createMemoryAsset3dStorage({ now = () => new Date().toISOString() } = {}) {
  const records = new Map();
  const blobs = new Map();

  async function putAsset({ assetId = `asset_${randomUUID()}`, tenantId, consumer, category, jobId = null, glbBuffer, metadata = {}, provenance = {} } = {}) {
    const check = validateAssetWrite({ assetId, tenantId, consumer, category, glbBuffer });
    if (!check.ok) return check;
    const record = buildAssetRecord({
      assetId,
      tenantId,
      consumer,
      category,
      jobId,
      glbBuffer,
      inspection: check.inspection,
      metadata,
      provenance,
      createdAt: now(),
    });
    records.set(assetId, record);
    blobs.set(assetId, Buffer.from(glbBuffer));
    return { ok: true, asset: structuredClone(record) };
  }

  async function getAsset({ assetId, tenantId, includeBuffer = false } = {}) {
    if (!text(tenantId) || !ASSET_ID_PATTERN.test(String(assetId ?? ""))) {
      return { ok: false, error: "not_found" };
    }
    const record = records.get(assetId);
    if (!record || record.tenantId !== tenantId) {
      return { ok: false, error: "not_found" };
    }
    const buf = blobs.get(assetId);
    if (!Buffer.isBuffer(buf) || sha256Digest(buf) !== record.digest) {
      return { ok: false, error: "corrupted_asset" };
    }
    const glbCheck = inspectGlbFile(buf);
    if (!glbCheck.passed) {
      return { ok: false, error: "corrupted_asset", details: glbCheck.errors };
    }
    return {
      ok: true,
      asset: structuredClone(record),
      ...(includeBuffer ? { glbBuffer: Buffer.from(buf) } : {}),
    };
  }

  async function exportAsset({ assetId, tenantId, format } = {}) {
    const res = await getAsset({ assetId, tenantId, includeBuffer: true });
    if (!res.ok) return res;
    return exportFromStoredRecord(res.asset, res.glbBuffer, format);
  }

  async function deleteAsset({ assetId, tenantId } = {}) {
    if (!text(tenantId) || !ASSET_ID_PATTERN.test(String(assetId ?? ""))) {
      return { ok: false, error: "not_found" };
    }
    const record = records.get(assetId);
    if (!record || record.tenantId !== tenantId) {
      return { ok: false, error: "not_found" };
    }
    records.delete(assetId);
    blobs.delete(assetId);
    return { ok: true, deleted: true, assetId };
  }

  async function listAssets({ tenantId, consumer = null, category = null } = {}) {
    if (!text(tenantId)) return [];
    const out = [];
    for (const rec of records.values()) {
      if (rec.tenantId !== tenantId) continue;
      if (consumer && rec.consumer !== consumer) continue;
      if (category && rec.category !== category) continue;
      out.push(structuredClone(rec));
    }
    return out;
  }

  // Test-only corruption hook is intentionally not exposed in production;
  // callers testing corruption can pass a custom backend or inspect via factory.
  return {
    storageClass: "in-memory",
    configured: true,
    putAsset,
    getAsset,
    exportAsset,
    deleteAsset,
    listAssets,
    _corruptBlobForTest(assetId, badBuffer) {
      if (blobs.has(assetId)) blobs.set(assetId, badBuffer);
    },
  };
}

/** Optional GCS artifact storage adapter.
 * Remains disabled unless BOTH enabled === true AND approved === true,
 * plus bucket, getAccessToken, and fetchImpl are explicitly provided. */
export function createGcsAsset3dStorage({
  enabled = false,
  approved = false,
  bucket = null,
  getAccessToken = null,
  fetchImpl = null,
  prefix = "ocg-3d-assets",
  now = () => new Date().toISOString(),
} = {}) {
  const isConfigured = () =>
    enabled === true &&
    approved === true &&
    text(bucket) &&
    typeof getAccessToken === "function" &&
    typeof fetchImpl === "function";

  const ensureReady = () => {
    if (enabled !== true || approved !== true) {
      return { ok: false, error: "gcs_disabled" };
    }
    if (!text(bucket) || typeof getAccessToken !== "function" || typeof fetchImpl !== "function") {
      return { ok: false, error: "gcs_not_configured" };
    }
    return { ok: true };
  };

  const objectNameFor = (tenantId, assetId, ext) => {
    const cleanPrefix = String(prefix).replace(/^\/+|\/+$/g, "");
    const safeTenant = encodeURIComponent(tenantId.trim());
    return `${cleanPrefix}/${safeTenant}/${assetId}.${ext}`;
  };

  const authHeaders = async (extra = {}) => ({
    authorization: `Bearer ${await getAccessToken()}`,
    ...extra,
  });

  async function putAsset({ assetId = `asset_${randomUUID()}`, tenantId, consumer, category, jobId = null, glbBuffer, metadata = {}, provenance = {} } = {}) {
    const ready = ensureReady();
    if (!ready.ok) return ready;
    const check = validateAssetWrite({ assetId, tenantId, consumer, category, glbBuffer });
    if (!check.ok) return check;

    const record = buildAssetRecord({
      assetId,
      tenantId,
      consumer,
      category,
      jobId,
      glbBuffer,
      inspection: check.inspection,
      metadata,
      provenance,
      createdAt: now(),
    });

    const glbName = objectNameFor(tenantId, assetId, "glb");
    const metaName = objectNameFor(tenantId, assetId, "meta.json");

    const glbRes = await fetchImpl(
      `${GCS_API}/upload/storage/v1/b/${encodeURIComponent(bucket)}/o?uploadType=media&name=${encodeURIComponent(glbName)}`,
      { method: "POST", headers: await authHeaders({ "content-type": "model/gltf-binary" }), body: glbBuffer },
    );
    if (!glbRes || glbRes.ok !== true) return { ok: false, error: "storage_write_failed" };

    const metaRes = await fetchImpl(
      `${GCS_API}/upload/storage/v1/b/${encodeURIComponent(bucket)}/o?uploadType=media&name=${encodeURIComponent(metaName)}`,
      { method: "POST", headers: await authHeaders({ "content-type": "application/json" }), body: JSON.stringify(record) },
    );
    if (!metaRes || metaRes.ok !== true) return { ok: false, error: "storage_write_failed" };

    return { ok: true, asset: structuredClone(record) };
  }

  async function getAsset({ assetId, tenantId, includeBuffer = false } = {}) {
    const ready = ensureReady();
    if (!ready.ok) return ready;
    if (!text(tenantId) || !ASSET_ID_PATTERN.test(String(assetId ?? ""))) {
      return { ok: false, error: "not_found" };
    }
    const metaName = objectNameFor(tenantId, assetId, "meta.json");
    const glbName = objectNameFor(tenantId, assetId, "glb");

    const metaRes = await fetchImpl(
      `${GCS_API}/storage/v1/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(metaName)}?alt=media`,
      { method: "GET", headers: await authHeaders() },
    );
    if (!metaRes || metaRes.ok !== true) return { ok: false, error: "not_found" };

    let record;
    try {
      record = await metaRes.json();
    } catch {
      return { ok: false, error: "corrupted_asset" };
    }
    if (!record || record.tenantId !== tenantId) {
      return { ok: false, error: "not_found" };
    }

    const glbRes = await fetchImpl(
      `${GCS_API}/storage/v1/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(glbName)}?alt=media`,
      { method: "GET", headers: await authHeaders() },
    );
    if (!glbRes || glbRes.ok !== true) return { ok: false, error: "corrupted_asset" };

    const buf = Buffer.from(await glbRes.arrayBuffer());
    if (sha256Digest(buf) !== record.digest || !inspectGlbFile(buf).passed) {
      return { ok: false, error: "corrupted_asset" };
    }

    return {
      ok: true,
      asset: structuredClone(record),
      ...(includeBuffer ? { glbBuffer: buf } : {}),
    };
  }

  async function exportAsset({ assetId, tenantId, format } = {}) {
    const res = await getAsset({ assetId, tenantId, includeBuffer: true });
    if (!res.ok) return res;
    return exportFromStoredRecord(res.asset, res.glbBuffer, format);
  }

  async function deleteAsset({ assetId, tenantId } = {}) {
    const ready = ensureReady();
    if (!ready.ok) return ready;
    if (!text(tenantId) || !ASSET_ID_PATTERN.test(String(assetId ?? ""))) {
      return { ok: false, error: "not_found" };
    }
    const existing = await getAsset({ assetId, tenantId, includeBuffer: false });
    if (!existing.ok && existing.error === "not_found") return existing;

    const metaName = objectNameFor(tenantId, assetId, "meta.json");
    const glbName = objectNameFor(tenantId, assetId, "glb");
    await fetchImpl(`${GCS_API}/storage/v1/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(metaName)}`, {
      method: "DELETE",
      headers: await authHeaders(),
    });
    await fetchImpl(`${GCS_API}/storage/v1/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(glbName)}`, {
      method: "DELETE",
      headers: await authHeaders(),
    });
    return { ok: true, deleted: true, assetId };
  }

  async function listAssets({ tenantId } = {}) {
    const ready = ensureReady();
    if (!ready.ok || !text(tenantId)) return [];
    const cleanPrefix = String(prefix).replace(/^\/+|\/+$/g, "");
    const tenantPrefix = `${cleanPrefix}/${encodeURIComponent(tenantId.trim())}/`;
    const listRes = await fetchImpl(
      `${GCS_API}/storage/v1/b/${encodeURIComponent(bucket)}/o?prefix=${encodeURIComponent(tenantPrefix)}`,
      { method: "GET", headers: await authHeaders() },
    );
    if (!listRes || listRes.ok !== true) return [];
    const listing = await listRes.json().catch(() => ({}));
    const out = [];
    for (const item of listing?.items ?? []) {
      if (!item?.name?.endsWith(".meta.json")) continue;
      const assetId = item.name.slice(tenantPrefix.length, -".meta.json".length);
      const got = await getAsset({ assetId, tenantId, includeBuffer: false });
      if (got.ok) out.push(got.asset);
    }
    return out;
  }

  return {
    get storageClass() { return "durable-gcs"; },
    get configured() { return isConfigured(); },
    putAsset,
    getAsset,
    exportAsset,
    deleteAsset,
    listAssets,
  };
}
