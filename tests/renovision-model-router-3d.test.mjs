import test from "node:test";
import assert from "node:assert/strict";
import {createModelRouter3d} from "../lib/renovision/model-router-3d.mjs";

const GPU_ENV = {
  os: "linux",
  hasNvidiaGpu: true,
  vramGb: 24,
  freeDiskGb: 60,
  cudaVersion: "12.4",
  pythonVersion: "3.10",
  helperLicensesAccepted: true,
  weightsCachedLocally: true,
};

test("model router selects least-resource compatible local model by default and escalates on high quality", () => {
  const router = createModelRouter3d();

  const std = router.selectModel({
    mode: "image_to_3d",
    qualityTier: "standard",
    environment: GPU_ENV,
  });
  assert.equal(std.selected, true);
  assert.equal(std.model.key, "trellis-1"); // lowest published minimum: v1 16GB < TRELLIS.2 24GB
  assert.equal(std.costUsd, 0);

  const high = router.selectModel({
    mode: "image_to_3d",
    qualityTier: "high",
    environment: GPU_ENV,
  });
  assert.equal(high.selected, true);
  assert.equal(high.model.key, "trellis-2-4b");
  assert.match(high.rationale, /escalated/);
});

test("model router rejects direct text_to_3d for TRELLIS and requires licensed local image generator for text_to_image_to_3d", () => {
  const noImgRouter = createModelRouter3d({ hasLicensedLocalImageGenerator: false });
  const direct = noImgRouter.selectModel({ mode: "text_to_3d", environment: GPU_ENV });
  assert.equal(direct.selected, false);
  assert.ok(direct.rejected.some((r) => r.reasons.some((msg) => /does not support direct text-to-3D/.test(msg))));

  const t2iBlocked = noImgRouter.selectModel({ mode: "text_to_image_to_3d", environment: GPU_ENV });
  assert.equal(t2iBlocked.selected, false);

  const withImgRouter = createModelRouter3d({ hasLicensedLocalImageGenerator: true });
  const t2iOk = withImgRouter.selectModel({ mode: "text_to_image_to_3d", environment: GPU_ENV });
  assert.equal(t2iOk.selected, true);
});

test("model router refuses paid providers and supports custom OCG local model registration", () => {
  const router = createModelRouter3d();
  router.registerModel({
    key: "paid-cloud-3d",
    modelId: "vendor/paid-3d",
    commercialUseAllowed: true,
    weightsLicense: "Commercial",
    paidProvider: true,
    requiresGpu: false,
    supportedModes: ["image_to_3d"],
  });

  const paidRes = router.selectModel({
    mode: "image_to_3d",
    requestedModelKey: "paid-cloud-3d",
    environment: { hasNvidiaGpu: false },
  });
  assert.equal(paidRes.selected, false);
  assert.match(paidRes.rejected[0].reasons[0], /paid provider forbidden/);

  router.registerModel({
    key: "ocg-cpu-light",
    modelId: "ocg/light-3d-v1",
    commercialUseAllowed: true,
    weightsLicense: "Apache-2.0",
    paidProvider: false,
    requiresGpu: false,
    minVramGb: 0,
    qualityRank: 1,
    supportedModes: ["image_to_3d"],
  });
  const cpuRes = router.selectModel({
    mode: "image_to_3d",
    environment: { hasNvidiaGpu: false },
  });
  assert.equal(cpuRes.selected, true);
  assert.equal(cpuRes.model.key, "ocg-cpu-light");
});
