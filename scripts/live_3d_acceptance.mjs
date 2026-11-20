/** Live 3D inference acceptance harness.
 * Generates a deterministic 256x256 shaded object PNG (never a 1x1 stub),
 * fails closed (exit 2, BLOCKED) unless OCG_3D_ENGINE_URL and OCG_3D_ENGINE_TOKEN
 * are provided for an authorized live GPU runtime, and never substitutes sample GLBs. */

import zlib from "node:zlib";
import { performance } from "node:perf_hooks";
import { inspectGlbFile } from "../lib/renovision/glb-inspector.mjs";

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const tag = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([tag, data])), 0);
  return Buffer.concat([len, tag, data, crc]);
}

export function buildProceduralObjectPng256() {
  const size = 256;
  const raw = Buffer.alloc(size * (1 + size * 4));
  for (let y = 0; y < size; y++) {
    const rowStart = y * (1 + size * 4);
    raw[rowStart] = 0;
    for (let x = 0; x < size; x++) {
      const px = rowStart + 1 + x * 4;
      const inBack = x >= 84 && x <= 172 && y >= 48 && y <= 140;
      const inSeat = x >= 68 && x <= 188 && y >= 136 && y <= 164;
      const inLegL = x >= 76 && x <= 92 && y >= 164 && y <= 218;
      const inLegR = x >= 164 && x <= 180 && y >= 164 && y <= 218;
      if (inBack || inSeat || inLegL || inLegR) {
        const shade = Math.max(90, 210 - Math.floor((x + y) / 5));
        raw[px] = shade;
        raw[px + 1] = Math.floor(shade * 0.72);
        raw[px + 2] = Math.floor(shade * 0.45);
        raw[px + 3] = 255;
      } else {
        raw[px] = 240;
        raw[px + 1] = 242;
        raw[px + 2] = 245;
        raw[px + 3] = 255;
      }
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const idat = zlib.deflateSync(raw);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", idat),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

export async function runLiveAcceptanceSuite({
  engineUrl,
  engineToken,
  crossTenantToken = null,
  timeoutMs = 240_000,
  modeLabel = "REAL GPU EXECUTED",
} = {}) {
  const baseUrl = String(engineUrl || "").replace(/\/$/, "");
  const token = String(engineToken || "").trim();
  if (!baseUrl || !token) {
    return {
      status: "BLOCKED",
      classification: "BLOCKED",
      reason: "OCG_3D_ENGINE_URL and OCG_3D_ENGINE_TOKEN are required for live GPU inference acceptance.",
    };
  }

  const refPng = buildProceduralObjectPng256();
  const healthRes = await fetch(`${baseUrl}/health`);
  if (!healthRes.ok) throw new Error(`Liveness /health failed: ${healthRes.status}`);

  const unauth = await fetch(`${baseUrl}/api/3d/jobs`, { method: "POST" });
  if (unauth.status !== 401 && unauth.status !== 403 && unauth.status !== 503) {
    throw new Error(`Expected unauthenticated POST /api/3d/jobs to fail closed, got ${unauth.status}`);
  }

  const invalidAuth = await fetch(`${baseUrl}/api/3d/jobs`, {
    method: "POST",
    headers: { authorization: "Bearer invalid-acceptance-token", "content-type": "application/json" },
    body: JSON.stringify({ consumer: "nova", mode: "image_to_3d", category: "furniture" }),
  });
  if (invalidAuth.status !== 401 && invalidAuth.status !== 403) {
    throw new Error(`Expected invalid Bearer token to be rejected (401/403), got ${invalidAuth.status}`);
  }

  const capRes = await fetch(`${baseUrl}/api/3d/capabilities`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!capRes.ok) throw new Error(`Capabilities check failed: ${capRes.status}`);
  const capabilities = await capRes.json();

  const t0 = performance.now();
  const submitRes = await fetch(`${baseUrl}/api/3d/jobs`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      consumer: "nova",
      mode: "image_to_3d",
      category: "furniture",
      assetName: "live-acceptance-chair-256",
      mimeType: "image/png",
      imageBase64: refPng.toString("base64"),
      processImmediately: true,
    }),
  });
  const submitData = await submitRes.json();
  if (!submitRes.ok || !submitData?.job?.jobId) {
    throw new Error(`Job submit failed: ${submitRes.status} ${JSON.stringify(submitData)}`);
  }

  const jobId = submitData.job.jobId;
  let job = submitData.job;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline && !["completed", "failed", "blocked", "cancelled"].includes(job.status)) {
    await new Promise((r) => setTimeout(r, 100));
    const pollRes = await fetch(`${baseUrl}/api/3d/jobs/${encodeURIComponent(jobId)}`, {
      headers: { authorization: `Bearer ${token}` },
    });
    const pollData = await pollRes.json();
    job = pollData.job ?? job;
  }

  if (job.status !== "completed") {
    throw new Error(`Inference did not complete: status=${job.status} reason=${job.blockedReason || job.error}`);
  }
  const latencyMs = +(performance.now() - t0).toFixed(2);

  if (crossTenantToken) {
    const crossJobRes = await fetch(`${baseUrl}/api/3d/jobs/${encodeURIComponent(jobId)}`, {
      headers: { authorization: `Bearer ${crossTenantToken}` },
    });
    if (crossJobRes.status !== 404 && crossJobRes.status !== 403) {
      throw new Error(`Cross-tenant job isolation failed: expected 404/403, got ${crossJobRes.status}`);
    }
  }

  const exportSizes = {};
  let glbInspection = null;
  for (const fmt of ["glb", "gltf", "obj", "stl", "ply"]) {
    const expRes = await fetch(
      `${baseUrl}/api/3d/jobs/${encodeURIComponent(jobId)}/export.${fmt}`,
      { headers: { authorization: `Bearer ${token}` } }
    );
    if (!expRes.ok) throw new Error(`Export ${fmt} failed: ${expRes.status}`);
    const buf = Buffer.from(await expRes.arrayBuffer());
    exportSizes[fmt] = buf.length;
    if (fmt === "glb") {
      glbInspection = inspectGlbFile(buf);
      const triCount = glbInspection?.inspection?.triangleCount ?? 0;
      const vertCount = glbInspection?.inspection?.vertexCount ?? 0;
      if (!glbInspection.passed || !glbInspection.validGlb || triCount <= 0 || vertCount <= 0) {
        throw new Error(`Generated GLB failed inspection: ${JSON.stringify(glbInspection.errors)}`);
      }
    }
  }

  // Cancellation contract check on a separate queued job
  const cancelSubmit = await fetch(`${baseUrl}/api/3d/jobs`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({
      consumer: "nova",
      mode: "image_to_3d",
      category: "furniture",
      assetName: "cancel-probe-256",
      mimeType: "image/png",
      imageBase64: refPng.toString("base64"),
    }),
  });
  let cancelVerified = false;
  if (cancelSubmit.ok) {
    const cancelData = await cancelSubmit.json();
    const cid = cancelData?.job?.jobId;
    if (cid) {
      const cancelRes = await fetch(`${baseUrl}/api/3d/jobs/${encodeURIComponent(cid)}/cancel`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
      });
      cancelVerified = cancelRes.ok;
    }
  }

  const mem = process.memoryUsage();
  return {
    status: "LIVE_INFERENCE_VERIFIED",
    classification: modeLabel,
    jobId,
    assetId: job.assetId || null,
    latencyMs,
    vertexCount: glbInspection?.inspection?.vertexCount ?? 0,
    triangleCount: glbInspection?.inspection?.triangleCount ?? 0,
    glbExportMode: capabilities.glbExportMode,
    texturedGlbSupported: capabilities.texturedGlbSupported,
    exportSizes,
    cancelVerified,
    budgetUsd: 0,
    memoryMb: {
      rss: +(mem.rss / 1048576).toFixed(2),
      heapUsed: +(mem.heapUsed / 1048576).toFixed(2),
    },
  };
}

async function main() {
  const engineUrl = (process.env.OCG_3D_ENGINE_URL || "").replace(/\/$/, "");
  const engineToken = (process.env.OCG_3D_ENGINE_TOKEN || "").trim();
  const crossTenantToken = (process.env.OCG_3D_CROSS_TENANT_TOKEN || "").trim() || null;

  if (!engineUrl || !engineToken) {
    console.error(JSON.stringify({
      status: "BLOCKED",
      classification: "BLOCKED",
      reason: "OCG_3D_ENGINE_URL and OCG_3D_ENGINE_TOKEN are required for live GPU inference acceptance.",
    }));
    process.exit(2);
  }

  const report = await runLiveAcceptanceSuite({ engineUrl, engineToken, crossTenantToken });
  console.log(JSON.stringify(report));
}

const isCli = process.argv[1] && import.meta.url.endsWith(process.argv[1].replaceAll("\\", "/").split("/").pop());
if (isCli) {
  main().catch((err) => {
    console.error(JSON.stringify({ status: "FAILED", error: err.message }));
    process.exit(1);
  });
}
