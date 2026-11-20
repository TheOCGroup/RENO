/** Live 3D inference acceptance harness.
 * Fails closed (exit 2, BLOCKED) unless OCG_3D_ENGINE_URL and OCG_3D_ENGINE_TOKEN
 * are explicitly provided for an authorized live GPU runtime. Never uses sample GLBs
 * as a substitute for live TRELLIS.2-4B inference. */

import { performance } from "node:perf_hooks";
import { inspectGlbFile } from "../lib/renovision/glb-inspector.mjs";

const engineUrl = (process.env.OCG_3D_ENGINE_URL || "").replace(/\/$/, "");
const engineToken = (process.env.OCG_3D_ENGINE_TOKEN || "").trim();

if (!engineUrl || !engineToken) {
  console.error(JSON.stringify({
    status: "BLOCKED",
    reason: "OCG_3D_ENGINE_URL and OCG_3D_ENGINE_TOKEN are required for live GPU inference acceptance.",
  }));
  process.exit(2);
}

const samplePng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64"
);

async function run() {
  // 1. Fail-closed unauthenticated check
  const unauth = await fetch(`${engineUrl}/api/3d/jobs`, { method: "POST" });
  if (unauth.status !== 401 && unauth.status !== 403 && unauth.status !== 503) {
    throw new Error(`Expected unauthenticated POST /api/3d/jobs to fail closed, got ${unauth.status}`);
  }

  // 2. Submit real image-to-3D job
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
      category: "prop",
      assetName: "live-acceptance-01",
      mimeType: "image/png",
      imageBase64: samplePng.toString("base64"),
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

  // 3. Export & validate all 5 formats
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

run().catch((err) => {
  console.error(JSON.stringify({ status: "FAILED", error: err.message }));
  process.exit(1);
});
