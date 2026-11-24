/** Shared HTTP API server for the OCG 3D ENGINE.
 * Binds to 127.0.0.1 by default, enforces OIDC authentication and tenant
 * isolation on all /api/3d/* routes (failing closed when auth is unavailable),
 * backs assets with pluggable storage (memory or optional approved GCS), and
 * exposes job lifecycle, 5-format export, GLB inspection, and model routing. */
import http from "node:http";
import {renderAsset3dViewerHtml} from "../lib/renovision/asset3d-viewer.mjs";
import {exportAssetFormat, inspectGlbFile, EXPORT_FORMATS} from "../lib/renovision/glb-inspector.mjs";
import {createModelRouter3d} from "../lib/renovision/model-router-3d.mjs";
import {createAsset3dAdapter, ASSET3D_MODES} from "../lib/renovision/asset3d-adapter.mjs";
import {createAsset3dAuthMiddleware} from "../lib/renovision/asset3d-auth.mjs";
import {createMemoryAsset3dStorage} from "../lib/renovision/asset3d-storage.mjs";
import {createUnified3dEngine} from "../lib/renovision/ocg-unified-engine.mjs";

export const SAMPLE_3D_CATALOG = Object.freeze([
  {
    id: "sofa-sectional",
    label: "Modern Linen Sectional Sofa",
    category: "sofa_sectional",
    widthMeters: 2.6,
    heightMeters: 0.82,
    depthMeters: 1.05,
    baseColorFactor: [0.76, 0.72, 0.65, 1.0],
    metallicFactor: 0.0,
    roughnessFactor: 0.85,
    extras: { modelId: "deterministic-sample", license: "MIT", dimensionsVerified: false },
  },
  {
    id: "dining-table",
    label: "White Oak Dining Table",
    category: "dining_table",
    widthMeters: 2.0,
    heightMeters: 0.76,
    depthMeters: 0.95,
    baseColorFactor: [0.68, 0.52, 0.36, 1.0],
    metallicFactor: 0.05,
    roughnessFactor: 0.55,
    extras: { modelId: "deterministic-sample", license: "MIT", dimensionsVerified: false },
  },
  {
    id: "accent-chair",
    label: "Walnut & Boucle Accent Chair",
    category: "chair_seating",
    widthMeters: 0.78,
    heightMeters: 0.81,
    depthMeters: 0.82,
    baseColorFactor: [0.85, 0.83, 0.78, 1.0],
    metallicFactor: 0.0,
    roughnessFactor: 0.9,
    extras: { modelId: "deterministic-sample", license: "MIT", dimensionsVerified: false },
  },
  {
    id: "kitchen-cabinet",
    label: "Shaker Base Cabinet 36in",
    category: "cabinet",
    widthMeters: 0.914,
    heightMeters: 0.876,
    depthMeters: 0.61,
    baseColorFactor: [0.24, 0.31, 0.28, 1.0],
    metallicFactor: 0.1,
    roughnessFactor: 0.45,
    extras: { modelId: "deterministic-sample", license: "MIT", dimensionsVerified: false },
  },
  {
    id: "pendant-light",
    label: "Brushed Brass Pendant Light",
    category: "lighting_fixture",
    widthMeters: 0.45,
    heightMeters: 0.38,
    depthMeters: 0.45,
    baseColorFactor: [0.83, 0.68, 0.32, 1.0],
    metallicFactor: 0.9,
    roughnessFactor: 0.25,
    extras: { modelId: "deterministic-sample", license: "MIT", dimensionsVerified: false },
  },
]);

const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
const text = (x) => typeof x === "string" && x.trim().length > 0;

function send(res, status, contentType, body, extraHeaders = {}) {
  res.writeHead(status, {
    "content-type": contentType,
    "cache-control": "no-store",
    "content-security-policy":
      "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "no-referrer",
    ...extraHeaders,
  });
  res.end(body);
}

function sendJson(res, status, payload, extraHeaders = {}) {
  return send(res, status, "application/json; charset=utf-8", JSON.stringify(payload), extraHeaders);
}

function readBody(req, maxBytes = MAX_UPLOAD_BYTES) {
  return new Promise((resolve, reject) => {
    const contentLength = Number(req.headers?.["content-length"]);
    if (Number.isFinite(contentLength) && contentLength > maxBytes) {
      req.resume();
      reject(Object.assign(new Error("body_too_large"), { statusCode: 413 }));
      return;
    }
    const chunks = [];
    let total = 0;
    let settled = false;
    req.on("data", (chunk) => {
      if (settled) return;
      total += chunk.length;
      if (total > maxBytes) {
        settled = true;
        req.resume();
        reject(Object.assign(new Error("body_too_large"), { statusCode: 413 }));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (!settled) {
        settled = true;
        resolve(Buffer.concat(chunks));
      }
    });
    req.on("error", (err) => {
      if (!settled) {
        settled = true;
        reject(err);
      }
    });
  });
}

function mapStorageErrorStatus(errCode) {
  if (errCode === "not_found") return 404;
  if (errCode === "corrupted_asset") return 422;
  if (errCode === "unsupported_export_format" || errCode === "invalid_asset_id") return 400;
  if (errCode === "gcs_disabled" || errCode === "gcs_not_configured" || errCode === "storage_write_failed") return 503;
  return 500;
}

export function createAsset3dRouter({
  environment = {},
  adapter = null,
  modelRouter = null,
  storage = null,
} = {}) {
  const router = modelRouter ?? createModelRouter3d({ allowPaid: false });
  const engineAdapter = adapter ?? createAsset3dAdapter({ environment, modelRouter: router });
  const artifactStore = storage ?? createMemoryAsset3dStorage();
  const sampleMap = new Map(SAMPLE_3D_CATALOG.map((s) => [s.id, s]));
  const jobAssetMap = new Map();

  async function ensureJobAssetPersisted(job, actor) {
    if (!job || job.status !== "completed" || !job.result?.glbBuffer) return null;
    if (jobAssetMap.has(job.jobId)) return jobAssetMap.get(job.jobId);
    const glbBuf = Buffer.isBuffer(job.result.glbBuffer)
      ? job.result.glbBuffer
      : Buffer.from(job.result.glbBuffer);
    const assetId = `asset_${job.jobId}`;
    const stored = await artifactStore.putAsset({
      assetId,
      tenantId: actor.tenantId,
      consumer: job.consumer,
      category: job.category,
      jobId: job.jobId,
      glbBuffer: glbBuf,
      metadata: {
        name: job.assetName,
        propertyId: job.propertyId,
        roomId: job.roomId,
        versionOf: job.versionOf ?? null,
        versionNumber: job.versionNumber ?? 1,
      },
      provenance: {
        ...(job.result.provenance ?? {}),
        dimensionProvenance: job.result.dimensionProvenance ?? "ai_estimated",
        dimensionsVerified: job.result.dimensionsVerified === true,
        createdBy: actor.id,
      },
    });
    if (!stored.ok) {
      return { ok: false, error: stored.error };
    }
    jobAssetMap.set(job.jobId, { ok: true, assetId: stored.asset.assetId });
    return { ok: true, assetId: stored.asset.assetId };
  }

  function sanitizeHttpJob(job, assetId = null) {
    const out = structuredClone(job);
    if (out.result && out.result.glbBuffer) {
      delete out.result.glbBuffer;
    }
    if (assetId) out.assetId = assetId;
    return out;
  }

  async function handleAuthenticatedRequest({ req, res, url, actor }) {
    const path = url.pathname;

    if (req.method === "GET" && path === "/api/3d/health") {
      return sendJson(res, 200, {
        ok: true,
        service: "ocg-3d-engine",
        tenantId: actor.tenantId,
        actorId: actor.id,
        localOnly: true,
        budgetUsd: 0,
        supportedExportFormats: EXPORT_FORMATS,
        storageClass: artifactStore.storageClass,
        storageConfigured: artifactStore.configured !== false,
        adapterStatus: engineAdapter.status(),
      });
    }

    if (req.method === "GET" && path === "/api/3d/capabilities") {
      const unified = createUnified3dEngine();
      const glbExportMode = process.env.OCG_TEXTURED_GLB_MODE || "geometry_only";
      return sendJson(res, 200, {
        ok: true,
        modes: ASSET3D_MODES,
        exportFormats: EXPORT_FORMATS,
        maxUploadBytes: MAX_UPLOAD_BYTES,
        storageClass: artifactStore.storageClass,
        localOnly: true,
        budgetUsd: 0,
        glbExportMode,
        texturedGlbSupported: process.env.OCG_NVDIFFRAST_COMMERCIAL_LICENSED === "true",
        unifiedSubsystems: Object.keys(unified.subsystems),
        qualityProfiles: Object.keys(unified.subsystems.adaptiveInference.QUALITY_PROFILES),
        motionPrimitives: unified.subsystems.motion.MOTION_PRIMITIVES,
        adapterStatus: engineAdapter.status(),
      });
    }

    if (req.method === "POST" && path === "/api/3d/unified/evaluate") {
      const rawBody = await readBody(req).catch((err) => err);
      if (rawBody instanceof Error) return sendJson(res, 400, {error: rawBody.message});
      let body;
      try {
        body = JSON.parse(rawBody.toString("utf8") || "{}");
      } catch {
        return sendJson(res, 400, {error: "invalid_json"});
      }
      const unified = createUnified3dEngine();
      const subsystem = String(body?.subsystem || "");
      try {
        if (subsystem === "world") {
          const world = unified.subsystems.world.createWorldSceneGraph({
            sceneId: body.sceneId || "default-scene",
            boundsMeters: body.boundsMeters,
            nodes: Array.isArray(body.nodes) ? body.nodes : [],
          });
          const nav =
            body.startMeters && body.goalMeters
              ? world.planNavigationPath(body.startMeters, body.goalMeters, body.steps || 8)
              : null;
          return sendJson(res, 200, {ok: true, subsystem, nodes: world.getNodes(), navigation: nav});
        }
        if (subsystem === "reality") {
          const composite = unified.subsystems.reality.computeRealityComposite(body.params || {});
          return sendJson(res, 200, {ok: true, subsystem, composite});
        }
        if (subsystem === "fourD") {
          const trajectory = unified.subsystems.fourD.create4dCameraTrajectory(body.params || {});
          return sendJson(res, 200, {ok: true, subsystem, trajectory});
        }
        if (subsystem === "motion") {
          const clip = unified.subsystems.motion.createMotionSmartPrimitive(body.params || {});
          const retargeted = Array.isArray(body.targetJoints)
            ? unified.subsystems.motion.retargetMotionClip({clip, targetJoints: body.targetJoints})
            : null;
          return sendJson(res, 200, {ok: true, subsystem, clip, retargeted});
        }
        if (subsystem === "adaptiveInference") {
          const schedule = unified.subsystems.adaptiveInference.scheduleInferenceJob({
            ...(body.params || {}),
            environment,
          });
          return sendJson(res, 200, {ok: true, subsystem, schedule});
        }
        return sendJson(res, 400, {error: "unsupported_subsystem", supported: ["world", "reality", "fourD", "motion", "adaptiveInference"]});
      } catch (err) {
        return sendJson(res, 400, {error: err?.message || "unified_evaluation_failed"});
      }
    }

    if (req.method === "GET" && path === "/api/3d/models") {
      return sendJson(res, 200, {
        models: router.listModels(),
        selection: router.selectModel({ mode: "image_to_3d", environment }),
      });
    }

    if (req.method === "GET" && path === "/api/3d/samples") {
      return sendJson(res, 200, { samples: SAMPLE_3D_CATALOG });
    }

    const sampleMatch = path.match(/^\/api\/3d\/samples\/([a-z0-9-]+)\.([a-z0-9]+)$/);
    if (req.method === "GET" && sampleMatch) {
      const [, id, fmt] = sampleMatch;
      const spec = sampleMap.get(id);
      if (!spec) {
        return sendJson(res, 404, { error: "sample_not_found" });
      }
      const exported = exportAssetFormat(fmt, { ...spec, name: spec.id });
      if (!exported.ok) {
        return sendJson(res, 400, { errors: exported.errors });
      }
      return send(res, 200, exported.mimeType, exported.buffer, {
        "content-disposition": `attachment; filename="${id}.${exported.format}"`,
      });
    }

    if (req.method === "POST" && path === "/api/3d/inspect") {
      const raw = await readBody(req, MAX_UPLOAD_BYTES);
      const report = inspectGlbFile(raw);
      return sendJson(res, report.passed ? 200 : 400, report);
    }

    if (req.method === "POST" && path === "/api/3d/batches") {
      const raw = await readBody(req, MAX_UPLOAD_BYTES);
      let payload;
      try {
        payload = JSON.parse(raw.toString("utf8"));
      } catch {
        return sendJson(res, 400, { error: "invalid_json" });
      }
      if (!payload || !Array.isArray(payload.requests) || payload.requests.length === 0) {
        return sendJson(res, 400, { error: "requests_array_required" });
      }
      for (const item of payload.requests) {
        if (text(item?.tenantId) && item.tenantId.trim() !== actor.tenantId) {
          return sendJson(res, 403, { error: "tenant_impersonation_denied" });
        }
      }
      const batch = engineAdapter.submitBatch(
        payload.requests.map((r) => ({ ...r, tenantId: actor.tenantId })),
      );
      return sendJson(res, batch.acceptedCount > 0 ? 202 : 429, batch);
    }

    if (req.method === "POST" && path === "/api/3d/jobs") {
      const raw = await readBody(req, MAX_UPLOAD_BYTES);
      let payload;
      try {
        payload = JSON.parse(raw.toString("utf8"));
      } catch {
        return sendJson(res, 400, { error: "invalid_json" });
      }
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        return sendJson(res, 400, { error: "invalid_request_body" });
      }
      if (text(payload.tenantId) && payload.tenantId.trim() !== actor.tenantId) {
        return sendJson(res, 403, { error: "tenant_impersonation_denied" });
      }
      const sub = engineAdapter.submitJob({
        ...payload,
        tenantId: actor.tenantId,
      });
      if (!sub.accepted) {
        return sendJson(res, sub.code === "concurrency_limit_exceeded" ? 429 : 400, sub);
      }
      if (payload.processImmediately === true) {
        const proc = await engineAdapter.processJob(sub.job.jobId, { tenantId: actor.tenantId });
        const persisted = proc.job ? await ensureJobAssetPersisted(proc.job, actor) : null;
        if (persisted && !persisted.ok) {
          return sendJson(res, mapStorageErrorStatus(persisted.error), { error: persisted.error });
        }
        return sendJson(res, proc.ok ? 201 : 202, {
          accepted: true,
          processed: proc.ok,
          errors: proc.errors ?? [],
          job: sanitizeHttpJob(proc.job, persisted?.assetId ?? null),
        });
      }
      return sendJson(res, 202, { accepted: true, job: sanitizeHttpJob(sub.job) });
    }

    const refineMatch = path.match(/^\/api\/3d\/jobs\/([a-zA-Z0-9_-]+)\/refine$/);
    if (req.method === "POST" && refineMatch) {
      const raw = await readBody(req, 64 * 1024);
      let body = {};
      if (raw.length > 0) {
        try {
          body = JSON.parse(raw.toString("utf8"));
        } catch {
          return sendJson(res, 400, { error: "invalid_json" });
        }
      }
      const refined = engineAdapter.refineJob({
        parentJobId: refineMatch[1],
        tenantId: actor.tenantId,
        scaleMultiplier: body.scaleMultiplier ?? 1.0,
        materialOverride: body.materialOverride ?? null,
        assetName: body.assetName ?? null,
      });
      if (!refined.ok) {
        const notFound = refined.errors?.some((e) => /not found/.test(e));
        return sendJson(res, notFound ? 404 : 400, { error: notFound ? "job_not_found" : "refine_failed", errors: refined.errors });
      }
      const persisted = await ensureJobAssetPersisted(refined.job, actor);
      if (persisted && !persisted.ok) {
        return sendJson(res, mapStorageErrorStatus(persisted.error), { error: persisted.error });
      }
      return sendJson(res, 201, { ok: true, job: sanitizeHttpJob(refined.job, persisted?.assetId ?? null) });
    }

    const jobExportMatch = path.match(/^\/api\/3d\/jobs\/([a-zA-Z0-9_-]+)\/export\.([a-z0-9]+)$/);
    if (req.method === "GET" && jobExportMatch) {
      const [, jobId, fmt] = jobExportMatch;
      if (!EXPORT_FORMATS.includes(fmt)) {
        return sendJson(res, 400, { error: "unsupported_export_format", supportedFormats: EXPORT_FORMATS });
      }
      const job = engineAdapter.getJob(jobId, { tenantId: actor.tenantId });
      if (!job) {
        return sendJson(res, 404, { error: "job_not_found" });
      }
      if (job.status !== "completed" || !job.result?.glbBuffer) {
        return sendJson(res, 409, { error: "job_not_completed", status: job.status });
      }
      const persisted = await ensureJobAssetPersisted(job, actor);
      if (!persisted?.ok) {
        return sendJson(res, mapStorageErrorStatus(persisted?.error), { error: persisted?.error ?? "storage_error" });
      }
      const exported = await artifactStore.exportAsset({
        assetId: persisted.assetId,
        tenantId: actor.tenantId,
        format: fmt,
      });
      if (!exported.ok) {
        return sendJson(res, mapStorageErrorStatus(exported.error), { error: exported.error });
      }
      return send(res, 200, exported.mimeType, exported.buffer, {
        "content-disposition": `attachment; filename="${jobId}.${exported.format}"`,
        ...(exported.limitations?.length ? { "x-ocg-export-limitations": exported.limitations.join(" ") } : {}),
      });
    }

    const jobMatch = path.match(/^\/api\/3d\/jobs\/([a-zA-Z0-9_-]+)$/);
    if (req.method === "GET" && jobMatch) {
      const job = engineAdapter.getJob(jobMatch[1], { tenantId: actor.tenantId });
      if (!job) {
        return sendJson(res, 404, { error: "job_not_found" });
      }
      const persisted = await ensureJobAssetPersisted(job, actor);
      if (persisted && !persisted.ok) {
        return sendJson(res, mapStorageErrorStatus(persisted.error), { error: persisted.error });
      }
      return sendJson(res, 200, { job: sanitizeHttpJob(job, persisted?.assetId ?? null) });
    }

    const cancelMatch = path.match(/^\/api\/3d\/jobs\/([a-zA-Z0-9_-]+)\/cancel$/);
    if (req.method === "POST" && cancelMatch) {
      const raw = await readBody(req, 64 * 1024);
      if (raw.length > 0) {
        let body;
        try {
          body = JSON.parse(raw.toString("utf8"));
        } catch {
          return sendJson(res, 400, { error: "invalid_json" });
        }
        if (text(body?.tenantId) && body.tenantId.trim() !== actor.tenantId) {
          return sendJson(res, 403, { error: "tenant_impersonation_denied" });
        }
      }
      const cancelled = engineAdapter.cancelJob(cancelMatch[1], { tenantId: actor.tenantId });
      if (!cancelled.ok) {
        const isTerminal = cancelled.errors?.some((e) => /cannot cancel job/.test(e));
        return sendJson(res, isTerminal ? 409 : 404, {
          error: isTerminal ? "cannot_cancel_terminal_job" : "job_not_found",
          errors: cancelled.errors,
        });
      }
      return sendJson(res, 200, { ok: true, job: sanitizeHttpJob(cancelled.job) });
    }

    if (req.method === "GET" && path === "/api/3d/assets") {
      const assets = await artifactStore.listAssets({
        tenantId: actor.tenantId,
        consumer: url.searchParams.get("consumer") || null,
        category: url.searchParams.get("category") || null,
      });
      return sendJson(res, 200, { assets });
    }

    const assetMatch = path.match(/^\/api\/3d\/assets\/([a-zA-Z0-9_-]+)$/);
    if (assetMatch && req.method === "GET") {
      const download = url.searchParams.get("download") === "1";
      const got = await artifactStore.getAsset({
        assetId: assetMatch[1],
        tenantId: actor.tenantId,
        includeBuffer: download,
      });
      if (!got.ok) {
        return sendJson(res, mapStorageErrorStatus(got.error), { error: got.error });
      }
      if (download) {
        return send(res, 200, "model/gltf-binary", got.glbBuffer, {
          "content-disposition": `attachment; filename="${got.asset.assetId}.glb"`,
        });
      }
      return sendJson(res, 200, { asset: got.asset });
    }

    if (assetMatch && req.method === "DELETE") {
      const del = await artifactStore.deleteAsset({
        assetId: assetMatch[1],
        tenantId: actor.tenantId,
      });
      if (!del.ok) {
        return sendJson(res, mapStorageErrorStatus(del.error), { error: del.error });
      }
      return sendJson(res, 200, del);
    }

    return sendJson(res, 404, { error: "not_found" });
  }

  return {
    handleAuthenticatedRequest,
    adapter: engineAdapter,
    storage: artifactStore,
    router,
  };
}

export function createAsset3dServer({
  environment = {},
  adapter = null,
  modelRouter = null,
  auth = null,
  authenticator = null,
  authenticate = null,
  storage = null,
} = {}) {
  const authMiddleware = auth ?? createAsset3dAuthMiddleware({ authenticator, authenticate });
  const asset3dRouter = createAsset3dRouter({ environment, adapter, modelRouter, storage });

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    const path = url.pathname;

    try {
      if (req.method === "GET" && path === "/") {
        return send(res, 200, "text/html; charset=utf-8", renderAsset3dViewerHtml());
      }

      if (req.method === "GET" && path === "/health") {
        return sendJson(res, 200, {
          ok: true,
          status: "live",
          service: "ocg-3d-engine",
        });
      }

      if (req.method === "GET" && path === "/ready") {
        // Phase 9.2 fix (Phase 8 Low): readiness reflects ENGINE readiness,
        // not only auth configuration. A disabled engine, or an engine whose
        // model preflight fails, must NOT report ready-for-inference.
        // Fail-closed is preserved: unconfigured auth is also not-ready.
        const authReady = authMiddleware.configured === true;
        let adapterStatus = null;
        try {
          adapterStatus = asset3dRouter.adapter.status();
        } catch {
          adapterStatus = null;
        }
        const engineEnabled = adapterStatus?.enabled === true;
        const preflightReady = adapterStatus?.preflight?.ready === true;
        const readyForInference = authReady && engineEnabled && preflightReady;
        return sendJson(res, readyForInference ? 200 : 503, {
          ok: readyForInference,
          status: readyForInference ? "ready" : "not_ready",
          service: "ocg-3d-engine",
          readyForInference,
          components: {
            auth: { configured: authReady, ready: authReady },
            engine: {
              enabled: engineEnabled,
              preflightReady,
              providerConfigured: adapterStatus?.providerConfigured === true,
              blockers: preflightReady ? [] : (adapterStatus?.preflight?.blockers ?? ["engine_status_unavailable"]),
            },
          },
        });
      }

      if (path.startsWith("/api/3d/")) {
        const authResult = await authMiddleware.requireAuth(req);
        if (!authResult.ok) {
          return sendJson(res, authResult.status, {
            error: authResult.error,
            message: authResult.message,
          });
        }
        return await asset3dRouter.handleAuthenticatedRequest({
          req,
          res,
          url,
          actor: authResult.actor,
        });
      }

      return sendJson(res, 404, { error: "not_found" });
    } catch (err) {
      if (err?.statusCode === 413) {
        return sendJson(res, 413, { error: "body_too_large" });
      }
      return sendJson(res, 500, { error: "internal_error" });
    }
  });

  return server;
}
