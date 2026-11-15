/** Local-only HTTP server for the OCG 3D ENGINE Preview & Inspection Studio.
 * Binds to 127.0.0.1 by default, applies strict security headers, enforces
 * upload size limits, and exposes sample assets, multi-format export, GLB
 * inspection, model-router status, and async 3D generation jobs. */
import http from "node:http";
import {renderAsset3dViewerHtml} from "../lib/renovision/asset3d-viewer.mjs";
import {exportAssetFormat, inspectGlbFile, EXPORT_FORMATS} from "../lib/renovision/glb-inspector.mjs";
import {createModelRouter3d} from "../lib/renovision/model-router-3d.mjs";
import {createAsset3dAdapter} from "../lib/renovision/asset3d-adapter.mjs";

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

function readBody(req, maxBytes = MAX_UPLOAD_BYTES) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on("data", (chunk) => {
      total += chunk.length;
      if (total > maxBytes) {
        reject(Object.assign(new Error("body_too_large"), { statusCode: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

export function createAsset3dServer({
  environment = {},
  adapter = null,
  modelRouter = null,
} = {}) {
  const router = modelRouter ?? createModelRouter3d({ allowPaid: false });
  const engineAdapter = adapter ?? createAsset3dAdapter({ environment, modelRouter: router });
  const sampleMap = new Map(SAMPLE_3D_CATALOG.map((s) => [s.id, s]));

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    const path = url.pathname;

    try {
      if (req.method === "GET" && path === "/") {
        return send(res, 200, "text/html; charset=utf-8", renderAsset3dViewerHtml());
      }

      if (req.method === "GET" && path === "/health") {
        return send(
          res,
          200,
          "application/json; charset=utf-8",
          JSON.stringify({
            ok: true,
            service: "ocg-3d-engine",
            localOnly: true,
            budgetUsd: 0,
            supportedExportFormats: EXPORT_FORMATS,
            adapterStatus: engineAdapter.status(),
          }),
        );
      }

      if (req.method === "GET" && path === "/api/3d/models") {
        return send(
          res,
          200,
          "application/json; charset=utf-8",
          JSON.stringify({
            models: router.listModels(),
            selection: router.selectModel({ mode: "image_to_3d", environment }),
          }),
        );
      }

      if (req.method === "GET" && path === "/api/3d/samples") {
        return send(
          res,
          200,
          "application/json; charset=utf-8",
          JSON.stringify({ samples: SAMPLE_3D_CATALOG }),
        );
      }

      const sampleMatch = path.match(/^\/api\/3d\/samples\/([a-z0-9-]+)\.([a-z0-9]+)$/);
      if (req.method === "GET" && sampleMatch) {
        const [, id, fmt] = sampleMatch;
        const spec = sampleMap.get(id);
        if (!spec) {
          return send(res, 404, "application/json; charset=utf-8", JSON.stringify({ error: "sample_not_found" }));
        }
        const exported = exportAssetFormat(fmt, { ...spec, name: spec.id });
        if (!exported.ok) {
          return send(res, 400, "application/json; charset=utf-8", JSON.stringify({ errors: exported.errors }));
        }
        return send(res, 200, exported.mimeType, exported.buffer, {
          "content-disposition": `attachment; filename="${id}.${exported.format}"`,
        });
      }

      if (req.method === "POST" && path === "/api/3d/inspect") {
        const raw = await readBody(req, MAX_UPLOAD_BYTES);
        const report = inspectGlbFile(raw);
        return send(
          res,
          report.passed ? 200 : 400,
          "application/json; charset=utf-8",
          JSON.stringify(report),
        );
      }

      if (req.method === "POST" && path === "/api/3d/jobs") {
        const raw = await readBody(req, MAX_UPLOAD_BYTES);
        let payload;
        try {
          payload = JSON.parse(raw.toString("utf8"));
        } catch {
          return send(res, 400, "application/json; charset=utf-8", JSON.stringify({ error: "invalid_json" }));
        }
        const sub = engineAdapter.submitJob(payload);
        return send(
          res,
          sub.accepted ? 202 : 400,
          "application/json; charset=utf-8",
          JSON.stringify(sub),
        );
      }

      const jobMatch = path.match(/^\/api\/3d\/jobs\/([a-zA-Z0-9_-]+)$/);
      if (req.method === "GET" && jobMatch) {
        const tenantId = url.searchParams.get("tenantId") || "";
        const job = engineAdapter.getJob(jobMatch[1], { tenantId });
        if (!job) {
          return send(res, 404, "application/json; charset=utf-8", JSON.stringify({ error: "job_not_found" }));
        }
        return send(res, 200, "application/json; charset=utf-8", JSON.stringify({ job }));
      }

      const cancelMatch = path.match(/^\/api\/3d\/jobs\/([a-zA-Z0-9_-]+)\/cancel$/);
      if (req.method === "POST" && cancelMatch) {
        const raw = await readBody(req, 64 * 1024);
        let body = {};
        if (raw.length > 0) {
          try {
            body = JSON.parse(raw.toString("utf8"));
          } catch {
            return send(res, 400, "application/json; charset=utf-8", JSON.stringify({ error: "invalid_json" }));
          }
        }
        const tenantId =
          (typeof body?.tenantId === "string" && body.tenantId.trim()) ||
          (url.searchParams.get("tenantId") || "").trim();
        if (!tenantId) {
          return send(res, 400, "application/json; charset=utf-8", JSON.stringify({ error: "tenant_id_required" }));
        }
        const cancelled = engineAdapter.cancelJob(cancelMatch[1], { tenantId });
        if (!cancelled.ok) {
          const isTerminal = cancelled.errors?.some((e) => /cannot cancel job/.test(e));
          return send(
            res,
            isTerminal ? 409 : 404,
            "application/json; charset=utf-8",
            JSON.stringify({ error: isTerminal ? "cannot_cancel_terminal_job" : "job_not_found", errors: cancelled.errors }),
          );
        }
        return send(res, 200, "application/json; charset=utf-8", JSON.stringify({ ok: true, job: cancelled.job }));
      }

      return send(res, 404, "application/json; charset=utf-8", JSON.stringify({ error: "not_found" }));
    } catch (err) {
      if (err?.statusCode === 413) {
        return send(res, 413, "application/json; charset=utf-8", JSON.stringify({ error: "body_too_large" }));
      }
      return send(res, 500, "application/json; charset=utf-8", JSON.stringify({ error: "internal_error" }));
    }
  });

  return server;
}
