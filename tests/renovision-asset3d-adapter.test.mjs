import test from "node:test";
import assert from "node:assert/strict";
import {createAsset3dAdapter, ASSET3D_DISCLOSURE} from "../lib/renovision/asset3d-adapter.mjs";
import {buildMinimalGlb} from "../lib/renovision/glb-inspector.mjs";

const SAMPLE_IMG = Buffer.from("fake-png-bytes").toString("base64");

test("adapter stays disabled by default and blocks paid APIs or external transfers", async () => {
  const adapter = createAsset3dAdapter();
  assert.equal(adapter.status().enabled, false);

  const paid = adapter.submitJob({
    tenantId: "tenant-a",
    consumer: "reno",
    category: "furniture",
    mimeType: "image/png",
    imageBase64: SAMPLE_IMG,
    usePaidApi: true,
  });
  assert.equal(paid.accepted, false);
  assert.match(paid.errors[0], /paid 3D APIs disabled/);

  const ext = adapter.submitJob({
    tenantId: "tenant-a",
    consumer: "nova",
    category: "character",
    mimeType: "image/png",
    imageBase64: SAMPLE_IMG,
    allowExternalTransfer: true,
  });
  assert.equal(ext.accepted, false);
  assert.match(ext.errors[0], /external data transfer forbidden/);

  const queued = adapter.submitJob({
    tenantId: "tenant-a",
    consumer: "reno",
    category: "furniture",
    mimeType: "image/png",
    imageBase64: SAMPLE_IMG,
  });
  assert.equal(queued.accepted, true);
  const blocked = await adapter.processJob(queued.job.jobId, { tenantId: "tenant-a" });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.job.status, "blocked");
});

test("adapter processes local image-to-3D job for RENO and NOVA with GLB inspection, provenance, and tenant isolation", async () => {
  const adapter = createAsset3dAdapter({
    enabled: true,
    founderApproved: true,
    localOnly: true,
    modelKey: "trellis-2-4b",
    resolution: 1024,
    environment: {
      os: "linux",
      hasNvidiaGpu: true,
      vramGb: 24,
      freeDiskGb: 80,
      cudaVersion: "12.4",
      pythonVersion: "3.10",
      helperLicensesAccepted: true,
      weightsCachedLocally: true,
    },
    provider: async ({ assetName }) => ({
      glbBuffer: buildMinimalGlb({ name: assetName, widthMeters: 1.8, heightMeters: 0.75, depthMeters: 0.9 }),
    }),
  });

  const sub = adapter.submitJob({
    tenantId: "tenant-reno",
    consumer: "reno",
    category: "furniture",
    assetName: "oak-dining-table",
    mimeType: "image/png",
    imageBase64: SAMPLE_IMG,
  });
  assert.equal(sub.accepted, true);

  const res = await adapter.processJob(sub.job.jobId, { tenantId: "tenant-reno" });
  assert.equal(res.ok, true);
  assert.equal(res.job.status, "completed");
  assert.equal(res.job.result.dimensionsVerified, false);
  assert.equal(res.job.result.accuracyClaimAuthorized, false);
  assert.equal(res.job.result.dimensionsSource, "ai_estimated");
  assert.equal(res.job.result.disclosure, ASSET3D_DISCLOSURE);
  assert.equal(res.job.result.provenance.codeLicense, "MIT");
  assert.equal(res.job.result.provenance.weightsLicense, "MIT");
  assert.equal(res.job.result.provenance.commercialUseAllowed, true);
  assert.equal(res.job.result.provenance.costUsd, 0);
  assert.equal(res.job.result.estimatedDimensionsMeters.width, 1.8);
  assert.match(res.job.result.glbDigest, /^sha256:[a-f0-9]{64}$/);

  // Tenant isolation check
  assert.equal(adapter.getJob(sub.job.jobId, { tenantId: "tenant-other" }), null);
  assert.equal(adapter.listJobs({ tenantId: "tenant-other" }).length, 0);

  // NOVA character job shares the exact same adapter contract
  const novaSub = adapter.submitJob({
    tenantId: "tenant-nova",
    consumer: "nova",
    category: "character",
    assetName: "narrator-avatar",
    mimeType: "image/webp",
    imageBase64: SAMPLE_IMG,
  });
  assert.equal(novaSub.accepted, true);
  const novaRes = await adapter.processJob(novaSub.job.jobId, { tenantId: "tenant-nova" });
  assert.equal(novaRes.ok, true);
  assert.equal(novaRes.job.consumer, "nova");
  assert.equal(novaRes.job.category, "character");
});
