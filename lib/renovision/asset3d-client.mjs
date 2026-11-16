/** Reusable consumer SDK and product contracts for the OCG 3D ENGINE.
 * Provides a shared authenticated HTTP client plus typed/validated consumer
 * wrappers for RENO, NOVA, and OCG LAB without duplicating 3D engine or
 * spatial validation logic. */
import {ASSET3D_CONSUMERS, ASSET3D_CATEGORIES} from "./asset3d-adapter.mjs";
import {EXPORT_FORMATS} from "./glb-inspector.mjs";
import {evaluateAsset3dFurnishingFit} from "./asset3d-furnishing-bridge.mjs";

export const RENO_ASSET3D_CATEGORIES = Object.freeze([
  "sofa_sectional",
  "chair_seating",
  "dining_table",
  "bed",
  "cabinet",
  "lighting_fixture",
  "decorative_object",
  "kitchen_fixture",
  "bathroom_fixture",
  "architectural_prop",
  "furniture",
  "interior_fixture",
  "room_prop",
]);

export const NOVA_ASSET3D_CATEGORIES = Object.freeze([
  "character",
  "prop",
  "environment",
  "furniture",
  "architectural_prop",
  "decorative_object",
]);

export const OCGLAB_ASSET3D_CATEGORIES = ASSET3D_CATEGORIES;

const text = (x) => typeof x === "string" && x.trim().length > 0;

export function createAsset3dClient({
  baseUrl,
  getToken,
  fetchImpl = globalThis.fetch,
  consumer,
  allowedCategories = ASSET3D_CATEGORIES,
} = {}) {
  if (!text(baseUrl)) throw new TypeError("baseUrl required");
  if (typeof getToken !== "function") throw new TypeError("getToken function required");
  if (typeof fetchImpl !== "function") throw new TypeError("fetchImpl function required");
  if (!ASSET3D_CONSUMERS.includes(consumer)) {
    throw new TypeError(`consumer must be one of: ${ASSET3D_CONSUMERS.join(", ")}`);
  }

  const root = baseUrl.replace(/\/+$/, "");

  async function request(path, { method = "GET", headers = {}, body = undefined, binary = false } = {}) {
    const token = await getToken();
    if (!text(token)) {
      return { ok: false, status: 401, error: "missing_client_token" };
    }
    const res = await fetchImpl(`${root}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        ...headers,
      },
      body,
    });
    if (binary) {
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({ error: "request_failed" }));
        return { ok: false, status: res.status, ...errBody };
      }
      return {
        ok: true,
        status: res.status,
        contentType: res.headers?.get?.("content-type") ?? "application/octet-stream",
        buffer: Buffer.from(await res.arrayBuffer()),
      };
    }
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, ...data };
  }

  function health() {
    return request("/api/3d/health");
  }

  function listModels() {
    return request("/api/3d/models");
  }

  function inspectGlb(glbBuffer) {
    if (!Buffer.isBuffer(glbBuffer)) throw new TypeError("glbBuffer must be a Buffer");
    return request("/api/3d/inspect", {
      method: "POST",
      headers: { "content-type": "application/octet-stream" },
      body: glbBuffer,
    });
  }

  function submitJob(req) {
    if (!req || typeof req !== "object") throw new TypeError("job request object required");
    if (!allowedCategories.includes(req.category)) {
      return Promise.resolve({
        ok: false,
        status: 400,
        error: "invalid_consumer_category",
        allowedCategories,
      });
    }
    const payload = { ...req, consumer };
    delete payload.tenantId; // Tenant is always derived from OIDC token on the server.
    return request("/api/3d/jobs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
  }

  function getJob(jobId) {
    return request(`/api/3d/jobs/${encodeURIComponent(jobId)}`);
  }

  function cancelJob(jobId) {
    return request(`/api/3d/jobs/${encodeURIComponent(jobId)}/cancel`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
  }

  function exportJobAsset(jobId, format = "glb") {
    if (!EXPORT_FORMATS.includes(format)) {
      return Promise.resolve({ ok: false, status: 400, error: "unsupported_export_format" });
    }
    return request(`/api/3d/jobs/${encodeURIComponent(jobId)}/export.${format}`, { binary: true });
  }

  function getAsset(assetId, { download = false } = {}) {
    return request(`/api/3d/assets/${encodeURIComponent(assetId)}${download ? "?download=1" : ""}`, {
      binary: download,
    });
  }

  function listAssets({ category = null } = {}) {
    const qs = new URLSearchParams({ consumer });
    if (text(category)) qs.set("category", category);
    return request(`/api/3d/assets?${qs.toString()}`);
  }

  function deleteAsset(assetId) {
    return request(`/api/3d/assets/${encodeURIComponent(assetId)}`, { method: "DELETE" });
  }

  return {
    consumer,
    allowedCategories,
    health,
    listModels,
    inspectGlb,
    submitJob,
    getJob,
    cancelJob,
    exportJobAsset,
    getAsset,
    listAssets,
    deleteAsset,
  };
}

/** RENO consumer contract: furniture, cabinets, fixtures, interior design,
 * and spatially validated furnishing fit via RENO's canonical bridge. */
export function createRenoAsset3dClient(opts = {}) {
  const client = createAsset3dClient({
    ...opts,
    consumer: "reno",
    allowedCategories: RENO_ASSET3D_CATEGORIES,
  });
  return {
    ...client,
    evaluateFurnishingFit(args) {
      return evaluateAsset3dFurnishingFit(args);
    },
  };
}

/** NOVA consumer contract: characters, props, environments, cinematic assets.
 * Never duplicates RENO spatial validation. */
export function createNovaAsset3dClient(opts = {}) {
  return createAsset3dClient({
    ...opts,
    consumer: "nova",
    allowedCategories: NOVA_ASSET3D_CATEGORIES,
  });
}

/** OCG LAB consumer contract: shared asset generation, preview, inspection,
 * 5-format export, and asset lifecycle management. */
export function createOcgLabAsset3dClient(opts = {}) {
  return createAsset3dClient({
    ...opts,
    consumer: "ocg-lab",
    allowedCategories: OCGLAB_ASSET3D_CATEGORIES,
  });
}
