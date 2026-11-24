import test from "node:test";
import assert from "node:assert/strict";
import {
  buildMinimalGlb,
  convertGlbToFormat,
  extractGlbGeometry,
  transformGlbGeometry,
  EXPORT_FORMATS,
} from "../lib/renovision/glb-inspector.mjs";
import {createAsset3dAdapter} from "../lib/renovision/asset3d-adapter.mjs";
import {createRenovisionServer} from "../src/renovisionServer.mjs";
import {createMemoryEvidenceStorage} from "../lib/renovision/memory-evidence-storage.mjs";

const VALID_PNG_B64 = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52,
  0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0,
]).toString("base64");

test("Phase 1: genuine geometry-preserving conversion across all 5 formats + transformGlbGeometry", () => {
  const glb = buildMinimalGlb({
    name: "custom-cabinet",
    widthMeters: 1.2,
    heightMeters: 0.9,
    depthMeters: 0.6,
    baseColorFactor: [0.2, 0.4, 0.3, 1.0],
    metallicFactor: 0.1,
    roughnessFactor: 0.5,
  });

  const extracted = extractGlbGeometry(glb);
  assert.equal(extracted.ok, true);
  assert.equal(extracted.totalVertices, 8);
  assert.equal(extracted.totalTriangles, 12);

  for (const fmt of EXPORT_FORMATS) {
    const conv = convertGlbToFormat(glb, fmt, { name: "custom-cabinet" });
    assert.equal(conv.ok, true, `convert ${fmt} must succeed`);
    assert.ok(conv.buffer.length > 20);
    if (fmt === "gltf") {
      const doc = JSON.parse(conv.buffer.toString("utf8"));
      assert.equal(doc.asset.version, "2.0");
      assert.ok(doc.buffers[0].uri.startsWith("data:application/octet-stream;base64,"));
      assert.equal(doc.materials[0].name, "custom-cabinet-pbr");
    } else if (fmt === "obj") {
      const txt = conv.buffer.toString("utf8");
      const vLines = txt.split("\n").filter((l) => l.startsWith("v "));
      const fLines = txt.split("\n").filter((l) => l.startsWith("f "));
      assert.equal(vLines.length, 8);
      assert.equal(fLines.length, 12);
      assert.ok(conv.limitations.length > 0);
    } else if (fmt === "stl") {
      assert.equal(conv.buffer.readUInt32LE(80), 12);
      assert.equal(conv.buffer.length, 84 + 12 * 50);
    } else if (fmt === "ply") {
      const txt = conv.buffer.toString("utf8");
      assert.ok(txt.includes("element vertex 8"));
      assert.ok(txt.includes("element face 12"));
    }
  }

  // Transform scale x2 and override metallicFactor
  const scaled = transformGlbGeometry(glb, {
    scaleMultiplier: 2.0,
    materialOverride: { metallicFactor: 0.85, roughnessFactor: 0.2 },
  });
  assert.equal(scaled.ok, true);
  const scaledGeom = extractGlbGeometry(scaled.glbBuffer);
  assert.equal(scaledGeom.ok, true);
  assert.ok(Math.abs(scaledGeom.gltf.accessors[0].max[0] - 1.2) < 1e-4);
  assert.ok(Math.abs(scaledGeom.gltf.materials[0].pbrMetallicRoughness.metallicFactor - 0.85) < 1e-4);
});

test("Phase 2 & 4: RENO server mounts /api/3d/*, /3d-viewer, refine/batch/capabilities, and /furnishing-3d", async () => {
  const adapter = createAsset3dAdapter({
    enabled: true,
    founderApproved: true,
    localOnly: true,
    maxConcurrentJobs: 2,
    environment: {
      os: "linux",
      hasNvidiaGpu: true,
      vramGb: 24,
      freeDiskGb: 80,
      cudaVersion: "12.4",
      pythonVersion: "3.11",
      helperLicensesAccepted: true,
      cachedModelKeys: ["trellis-2-4b"], weightsCachedLocally: true,
    },
    provider: async ({ assetName }) => ({
      glbBuffer: buildMinimalGlb({
        name: assetName || "sofa",
        widthMeters: 2.0,
        heightMeters: 0.8,
        depthMeters: 0.9,
      }),
      modelId: "microsoft/TRELLIS.2-4B",
      codeLicense: "MIT",
      weightsLicense: "MIT",
      commercialUseAllowed: true,
    }),
  });

  const server = createRenovisionServer({
    authenticate: async (req) => {
      const tok = req.headers?.authorization;
      if (tok === "Bearer tok-alpha") return { authenticated: true, id: "op-1", tenantId: "tenant-alpha", roles: ["operator", "reviewer"], propertyIds: ["prop-1"], roomIds: ["living"] };
      if (tok === "Bearer tok-beta") return { authenticated: true, id: "op-2", tenantId: "tenant-beta", roles: ["operator"] };
      return null;
    },
    evidenceStorage: createMemoryEvidenceStorage({ authorize: () => true }),
    asset3dOptions: { adapter },
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const alphaHeaders = { authorization: "Bearer tok-alpha", "content-type": "application/json" };
  const betaHeaders = { authorization: "Bearer tok-beta", "content-type": "application/json" };

  try {
    // 1. Viewer route
    const viewerRes = await fetch(`${baseUrl}/3d-viewer`);
    assert.equal(viewerRes.status, 200);
    assert.ok((await viewerRes.text()).includes("RENOVISION AI — 3D Asset Studio"));

    // 2. Unauthenticated /api/3d/* fails closed (401)
    assert.equal((await fetch(`${baseUrl}/api/3d/capabilities`)).status, 401);

    // 3. Capabilities
    const caps = await (await fetch(`${baseUrl}/api/3d/capabilities`, { headers: alphaHeaders })).json();
    assert.equal(caps.ok, true);
    assert.deepEqual(caps.exportFormats, EXPORT_FORMATS);

    // 4. Concurrency limit on batch / queued jobs (maxConcurrentJobs = 2)
    const bRes = await fetch(`${baseUrl}/api/3d/batches`, {
      method: "POST",
      headers: alphaHeaders,
      body: JSON.stringify({
        requests: [
          { consumer: "reno", category: "sofa_sectional", mimeType: "image/png", imageBase64: VALID_PNG_B64 },
          { consumer: "reno", category: "dining_table", mimeType: "image/png", imageBase64: VALID_PNG_B64 },
          { consumer: "reno", category: "chair_seating", mimeType: "image/png", imageBase64: VALID_PNG_B64 },
        ],
      }),
    });
    assert.equal(bRes.status, 202);
    const bJson = await bRes.json();
    assert.equal(bJson.acceptedCount, 2);
    assert.equal(bJson.rejectedCount, 1);
    assert.equal(bJson.results[2].code, "concurrency_limit_exceeded");

    // Cancel the 2 queued batch jobs to free concurrency slots
    for (const r of bJson.results.slice(0, 2)) {
      const cRes = await fetch(`${baseUrl}/api/3d/jobs/${r.job.jobId}/cancel`, {
        method: "POST",
        headers: alphaHeaders,
        body: JSON.stringify({}),
      });
      assert.equal(cRes.status, 200);
    }

    // 5. Generate & refine 3D furniture asset
    const jobRes = await fetch(`${baseUrl}/api/3d/jobs`, {
      method: "POST",
      headers: alphaHeaders,
      body: JSON.stringify({
        consumer: "reno",
        category: "sofa_sectional",
        assetName: "reno-sofa",
        mimeType: "image/png",
        imageBase64: VALID_PNG_B64,
        processImmediately: true,
      }),
    });
    assert.equal(jobRes.status, 201);
    const { job } = await jobRes.json();

    const refRes = await fetch(`${baseUrl}/api/3d/jobs/${job.jobId}/refine`, {
      method: "POST",
      headers: alphaHeaders,
      body: JSON.stringify({ scaleMultiplier: 0.9, materialOverride: { roughnessFactor: 0.7 } }),
    });
    assert.equal(refRes.status, 201);
    const refJson = await refRes.json();
    assert.equal(refJson.job.versionOf, job.jobId);
    assert.equal(refJson.job.versionNumber, 2);
    assert.equal(refJson.job.result.dimensionsVerified, false);

    // Cross-tenant isolation on RENO server /api/3d/*
    assert.equal((await fetch(`${baseUrl}/api/3d/jobs/${refJson.job.jobId}`, { headers: betaHeaders })).status, 404);

    // 6. RENO project + spatial furnishing-3d check
    const projRes = await fetch(`${baseUrl}/api/renovision/projects`, {
      method: "POST",
      headers: alphaHeaders,
      body: JSON.stringify({ projectId: "reno-3d-1", propertyId: "prop-1", roomId: "living" }),
    });
    assert.equal(projRes.status, 201);

    // Register capture evidence, capture manifest, and capture-review (accept)
    const evRes = await fetch(`${baseUrl}/api/renovision/projects/reno-3d-1/evidence`, {
      method: "POST",
      headers: alphaHeaders,
      body: JSON.stringify({
        contentBase64: VALID_PNG_B64,
        mimeType: "image/png",
        captureId: "capture-1",
      }),
    });
    assert.equal(evRes.status, 201);
    const { receipt } = await evRes.json();
    const manifest = {
      tenantId: "tenant-alpha",
      propertyId: "prop-1",
      roomId: "living",
      captureId: "capture-1",
      operatorId: "op-1",
      deviceModel: "laser-x",
      coordinateFrame: "local",
      capturedAt: "2026-11-16T10:00:00Z",
      platform: "web",
      calibrationStatus: "calibrated",
      coverageGaps: [],
      artifacts: [{ id: receipt.storageRef, kind: "photo", digest: receipt.digest, byteLength: receipt.byteLength }],
    };
    const capRes = await fetch(`${baseUrl}/api/renovision/projects/reno-3d-1/captures`, {
      method: "POST",
      headers: alphaHeaders,
      body: JSON.stringify({ manifest, qualityInput: { blurScore: 0.1, depthCoverageFraction: 0.5, deviceClass: "browser" } }),
    });
    assert.equal(capRes.status, 200);
    const revRes = await fetch(`${baseUrl}/api/renovision/projects/reno-3d-1/capture-review`, {
      method: "POST",
      headers: alphaHeaders,
      body: JSON.stringify({ decision: "accept" }),
    });
    assert.equal(revRes.status, 200);
    const evidenceRef = receipt.digest;

    // Add verified room measurements & lock geometry
    for (const [featureId, value] of [["width", 5.0], ["depth", 4.5], ["height", 2.7]]) {
      const mRes = await fetch(`${baseUrl}/api/renovision/projects/reno-3d-1/measurements`, {
        method: "POST",
        headers: alphaHeaders,
        body: JSON.stringify({
          record: {
            propertyId: "prop-1",
            roomId: "living",
            measurementId: `m-${featureId}`,
            featureId,
            captureId: "capture-1",
            deviceModel: "laser-x",
            platform: "web",
            timestamp: "2026-11-16T10:00:00Z",
            coordinateFrame: "local",
            evidenceRef,
            semanticType: "wall",
            method: "manual_laser",
            value,
            unit: "m",
            uncertainty: 0.02,
            calibrationStatus: "calibrated",
            verificationStatus: "verified",
            verifiedBy: "verifier-1",
            verifiedAt: "2026-11-16T10:05:00Z",
            geometryState: "EXISTING",
            fieldMeasured: true,
          },
        }),
      });
      assert.equal(mRes.status, 201);
    }

    const lockRes = await fetch(`${baseUrl}/api/renovision/projects/reno-3d-1/lock`, {
      method: "POST",
      headers: alphaHeaders,
      body: JSON.stringify({}),
    });
    assert.equal(lockRes.status, 200);

    // AI-estimated dimensions must be blocked
    const fitBlocked = await (await fetch(`${baseUrl}/api/renovision/projects/reno-3d-1/furnishing-3d`, {
      method: "POST",
      headers: alphaHeaders,
      body: JSON.stringify({
        assets: [{
          id: refJson.job.assetId,
          estimatedDimensionsMeters: refJson.job.result.estimatedDimensionsMeters,
          x: 1.0,
          y: 1.0,
        }],
      }),
    })).json();
    assert.equal(fitBlocked.ok, true);
    assert.equal(fitBlocked.plan.items[0].verdict, "blocked_unverified_dimensions");

    // Calibrated/verified SKU dimensions pass
    const fitVerified = await (await fetch(`${baseUrl}/api/renovision/projects/reno-3d-1/furnishing-3d`, {
      method: "POST",
      headers: alphaHeaders,
      body: JSON.stringify({
        assets: [{
          id: refJson.job.assetId,
          productId: "SKU-SOFA-180",
          calibratedDimensions: {
            widthMeters: 1.8,
            depthMeters: 0.85,
            heightMeters: 0.8,
            dimensionsVerified: true,
            dimensionSource: "manufacturer-spec-sheet",
            uncertaintyMeters: 0.02,
          },
          x: 1.0,
          y: 1.0,
          clearance: 0.75,
        }],
      }),
    })).json();
    assert.equal(fitVerified.ok, true);
    assert.equal(fitVerified.plan.items[0].verdict, "fits_with_uncertainty_margin");
  } finally {
    await new Promise((r) => server.close(r));
  }
});
