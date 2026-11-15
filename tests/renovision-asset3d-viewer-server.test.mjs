import test from "node:test";
import assert from "node:assert/strict";
import {createAsset3dServer} from "../src/asset3dServer.mjs";
import {buildMinimalGlb, EXPORT_FORMATS} from "../lib/renovision/glb-inspector.mjs";

async function startServer(opts = {}) {
  const server = createAsset3dServer(opts);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

test("viewer HTML serves with security headers, zero external URLs, and valid inline JavaScript", async () => {
  const srv = await startServer();
  try {
    const res = await fetch(`${srv.baseUrl}/`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("x-content-type-options"), "nosniff");
    assert.equal(res.headers.get("x-frame-options"), "DENY");
    assert.equal(res.headers.get("referrer-policy"), "no-referrer");
    const html = await res.text();
    assert.ok(!/https?:\/\//i.test(html), "viewer HTML must not contain external URLs");
    const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
    assert.ok(scriptMatch, "inline script must exist");
    assert.doesNotThrow(() => new Function(scriptMatch[1]));
  } finally {
    await srv.close();
  }
});

test("server exposes health, models, sample GLB catalog, and all 5 export formats", async () => {
  const srv = await startServer();
  try {
    const health = await (await fetch(`${srv.baseUrl}/health`)).json();
    assert.equal(health.ok, true);
    assert.equal(health.budgetUsd, 0);
    assert.deepEqual(health.supportedExportFormats, EXPORT_FORMATS);

    const samples = await (await fetch(`${srv.baseUrl}/api/3d/samples`)).json();
    assert.ok(samples.samples.length >= 5);

    for (const fmt of EXPORT_FORMATS) {
      const r = await fetch(`${srv.baseUrl}/api/3d/samples/sofa-sectional.${fmt}`);
      assert.equal(r.status, 200, `export format ${fmt} should return 200`);
      const buf = Buffer.from(await r.arrayBuffer());
      assert.ok(buf.length > 20, `export format ${fmt} should be non-empty`);
    }
  } finally {
    await srv.close();
  }
});

test("server inspects valid and invalid GLB uploads and enforces tenant isolation on jobs", async () => {
  const srv = await startServer();
  try {
    const validGlb = buildMinimalGlb({ name: "chair", widthMeters: 0.7, heightMeters: 0.8, depthMeters: 0.7 });
    const okRes = await fetch(`${srv.baseUrl}/api/3d/inspect`, { method: "POST", body: validGlb });
    assert.equal(okRes.status, 200);
    const okJson = await okRes.json();
    assert.equal(okJson.passed, true);
    assert.equal(okJson.inspection.boundingBoxMeters.width, 0.7);

    const badRes = await fetch(`${srv.baseUrl}/api/3d/inspect`, { method: "POST", body: Buffer.from("corrupt-glb") });
    assert.equal(badRes.status, 400);
    const badJson = await badRes.json();
    assert.equal(badJson.passed, false);

    // Valid PNG magic bytes
    const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0,0,0,1, 0,0,0,1, 8, 6, 0, 0, 0]).toString("base64");
    const jobRes = await fetch(`${srv.baseUrl}/api/3d/jobs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        tenantId: "tenant-alpha",
        consumer: "reno",
        category: "sofa_sectional",
        mimeType: "image/png",
        imageBase64: pngBytes,
      }),
    });
    assert.equal(jobRes.status, 202);
    const { job } = await jobRes.json();

    const sameTenant = await fetch(`${srv.baseUrl}/api/3d/jobs/${job.jobId}?tenantId=tenant-alpha`);
    assert.equal(sameTenant.status, 200);

    const crossTenant = await fetch(`${srv.baseUrl}/api/3d/jobs/${job.jobId}?tenantId=tenant-beta`);
    assert.equal(crossTenant.status, 404);
  } finally {
    await srv.close();
  }
});
