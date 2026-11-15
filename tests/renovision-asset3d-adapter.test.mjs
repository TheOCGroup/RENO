import test from "node:test";
import assert from "node:assert/strict";
import {
  createAsset3dAdapter,
  inspectImageBuffer,
  classifyDimensionProvenance,
  ASSET3D_DISCLOSURE,
} from "../lib/renovision/asset3d-adapter.mjs";
import {buildMinimalGlb} from "../lib/renovision/glb-inspector.mjs";

// Minimal valid 1x1 RGBA PNG (has alpha channel)
const VALID_RGBA_PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00,
]).toString("base64");

const VALID_JPEG = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
]).toString("base64");

test("inspectImageBuffer validates magic bytes, detects PNG alpha, and rejects spoofed headers", () => {
  const pngCheck = inspectImageBuffer(Buffer.from(VALID_RGBA_PNG, "base64"), "image/png");
  assert.equal(pngCheck.valid, true);
  assert.equal(pngCheck.hasAlphaChannel, true);
  assert.equal(pngCheck.transparentBackgroundReady, true);

  const spoofed = inspectImageBuffer(Buffer.from(VALID_JPEG, "base64"), "image/png");
  assert.equal(spoofed.valid, false);
  assert.match(spoofed.errors[0], /do not match PNG signature/);
});

test("classifyDimensionProvenance enforces 4-tier accuracy rule", () => {
  assert.equal(classifyDimensionProvenance("ai_estimated").verified, false);
  assert.equal(classifyDimensionProvenance("manufacturer_provided").verified, false);
  assert.equal(classifyDimensionProvenance("manually_measured").verified, false);
  assert.equal(classifyDimensionProvenance("independently_verified").verified, true);
});

test("adapter stays disabled by default, rejects path traversal, paid APIs, and external transfers", async () => {
  const adapter = createAsset3dAdapter();
  assert.equal(adapter.status().enabled, false);

  const paid = adapter.submitJob({
    tenantId: "tenant-a",
    consumer: "reno",
    category: "sofa_sectional",
    mimeType: "image/png",
    imageBase64: VALID_RGBA_PNG,
    usePaidApi: true,
  });
  assert.equal(paid.accepted, false);
  assert.match(paid.errors[0], /paid 3D APIs disabled/);

  const traversal = adapter.submitJob({
    tenantId: "tenant-a",
    consumer: "reno",
    category: "chair_seating",
    mimeType: "image/png",
    localImagePath: "../etc/passwd",
  });
  assert.equal(traversal.accepted, false);
  assert.match(traversal.errors[0], /path traversal/);

  const ext = adapter.submitJob({
    tenantId: "tenant-a",
    consumer: "nova",
    category: "character",
    mimeType: "image/png",
    imageBase64: VALID_RGBA_PNG,
    allowExternalTransfer: true,
  });
  assert.equal(ext.accepted, false);
  assert.match(ext.errors[0], /external data transfer forbidden/);

  const queued = adapter.submitJob({
    tenantId: "tenant-a",
    consumer: "reno",
    category: "sofa_sectional",
    mimeType: "image/png",
    imageBase64: VALID_RGBA_PNG,
  });
  assert.equal(queued.accepted, true);
  const blocked = await adapter.processJob(queued.job.jobId, { tenantId: "tenant-a" });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.job.status, "blocked");
});

test("adapter processes local image-to-3D, background removal, text-to-image-to-3D, and cancellation", async () => {
  const adapter = createAsset3dAdapter({
    enabled: true,
    founderApproved: true,
    localOnly: true,
    qualityTier: "high",
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
    backgroundRemover: async ({ imageBase64 }) => ({ imageBase64 }),
    imageGenerator: async () => ({ imageBase64: VALID_RGBA_PNG }),
    provider: async ({ assetName }) => ({
      glbBuffer: buildMinimalGlb({ name: assetName, widthMeters: 1.8, heightMeters: 0.75, depthMeters: 0.9 }),
      resourceUsage: { vramPeakGb: 14.2, ramPeakMb: 4200 },
    }),
  });

  const sub = adapter.submitJob({
    tenantId: "tenant-reno",
    consumer: "reno",
    category: "dining_table",
    assetName: "oak-dining-table",
    mimeType: "image/png",
    imageBase64: VALID_RGBA_PNG,
    removeBackground: true,
  });
  assert.equal(sub.accepted, true);

  const res = await adapter.processJob(sub.job.jobId, { tenantId: "tenant-reno" });
  assert.equal(res.ok, true);
  assert.equal(res.job.status, "completed");
  assert.equal(res.job.progressPercent, 100);
  assert.equal(res.job.result.dimensionsVerified, false);
  assert.equal(res.job.result.dimensionProvenance, "ai_estimated");
  assert.equal(res.job.result.disclosure, ASSET3D_DISCLOSURE);
  assert.equal(res.job.result.preprocessing.backgroundRemoved, true);
  assert.equal(res.job.result.preprocessing.transparentBackgroundInput, true);
  assert.equal(res.job.result.provenance.codeLicense, "MIT");
  assert.equal(res.job.result.provenance.costUsd, 0);
  assert.match(res.job.result.glbDigest, /^sha256:[a-f0-9]{64}$/);

  // Optional text-to-image-to-3D workflow
  const t2iSub = adapter.submitJob({
    tenantId: "tenant-nova",
    consumer: "nova",
    category: "character",
    mode: "text_to_image_to_3d",
    prompt: "stylized ceramic robot prop",
  });
  assert.equal(t2iSub.accepted, true);
  const t2iRes = await adapter.processJob(t2iSub.job.jobId, { tenantId: "tenant-nova" });
  assert.equal(t2iRes.ok, true);

  // Cancellation
  const cancelSub = adapter.submitJob({
    tenantId: "tenant-nova",
    consumer: "nova",
    category: "prop",
    mimeType: "image/jpeg",
    imageBase64: VALID_JPEG,
  });
  const cancelled = adapter.cancelJob(cancelSub.job.jobId, { tenantId: "tenant-nova" });
  assert.equal(cancelled.ok, true);
  assert.equal(cancelled.job.status, "cancelled");
  const procCancelled = await adapter.processJob(cancelSub.job.jobId, { tenantId: "tenant-nova" });
  assert.equal(procCancelled.ok, false);
});
