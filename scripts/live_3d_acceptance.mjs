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

async function main() {
  const engineUrl = (process.env.OCG_3D_ENGINE_URL || "").replace(/\/$/, "");
  const engineToken = (process.env.OCG_3D_ENGINE_TOKEN || "").trim();

  if (!engineUrl || !engineToken) {
    console.error(JSON.stringify({
      status: "BLOCKED",
      reason: "OCG_3D_ENGINE_URL and OCG_3D_ENGINE_TOKEN are required for live GPU inference acceptance.",
    }));
    process.exit(2);
  }

  const refPng = buildProceduralObjectPng256();
  const unauth = await fetch(`${engineUrl}/api/3d/jobs`, { method: "POST" });
  if (unauth.status !== 401 && unauth.status !== 403 && unauth.status !== 503) {
    throw new Error(`Expected unauthenticated POST /api/3d/jobs to fail closed, got ${unauth.status}`);
  }

  const t0 = performance.now();
  const submitRes = await fetch(`${engineUrl}/api/3d/jobs`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${engineToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      consumer: "nova",
      mode: "image_to_3d",
      category: "furniture",
      assetName: "live-acceptance-chair-256",
      mimeType: "image/png",
      imageBase64: refPng.toString("base64"),
    }),
  });
  const submitData = await submitRes.json();
  if (!submitRes.ok || !submitData?.job?.jobId) {
    throw new Error(`Job submit failed: ${submitRes.status} ${JSON.stringify(submitData)}`);
  }

  const jobId = submitData.job.jobId;
  let job = submitData.job;
  const deadline = Date.now() + 240_000;
  while (Date.now() < deadline && !["completed", "failed", "blocked"].includes(job.status)) {
    await new Promise((r) => setTimeout(r, 2000));
    const pollRes = await fetch(`${engineUrl}/api/3d/jobs/${encodeURIComponent(jobId)}`, {
      headers: { authorization: `Bearer ${engineToken}` },
    });
    const pollData = await pollRes.json();
    job = pollData.job ?? job;
  }

  if (job.status !== "completed") {
    throw new Error(`Live inference did not complete: status=${job.status} reason=${job.blockedReason || job.error}`);
  }
  const latencyMs = +(performance.now() - t0).toFixed(2);

  const exportSizes = {};
  for (const fmt of ["glb", "gltf", "obj", "stl", "ply"]) {
    const expRes = await fetch(
      `${engineUrl}/api/3d/jobs/${encodeURIComponent(jobId)}/export?format=${fmt}`,
      { headers: { authorization: `Bearer ${engineToken}` } }
    );
    if (!expRes.ok) throw new Error(`Export ${fmt} failed: ${expRes.status}`);
    const buf = Buffer.from(await expRes.arrayBuffer());
    exportSizes[fmt] = buf.length;
    if (fmt === "glb") {
      const inspected = inspectGlbFile(buf);
      if (!inspected.passed || !inspected.validGlb) {
        throw new Error(`Generated GLB failed inspection: ${JSON.stringify(inspected.errors)}`);
      }
    }
  }

  console.log(JSON.stringify({ status: "LIVE_INFERENCE_VERIFIED", jobId, latencyMs, exportSizes }));
}

const isCli = process.argv[1] && import.meta.url.endsWith(process.argv[1].replaceAll("\\", "/").split("/").pop());
if (isCli) {
  main().catch((err) => {
    console.error(JSON.stringify({ status: "FAILED", error: err.message }));
    process.exit(1);
  });
}
