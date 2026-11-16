import test from "node:test";
import assert from "node:assert/strict";
import {evaluateTrellisPreflight, TRELLIS_MODELS} from "../lib/renovision/trellis-provider.mjs";

test("TRELLIS.2 and TRELLIS v1 specs record MIT licenses and $0 local inference cost", () => {
  assert.equal(TRELLIS_MODELS["trellis-2-4b"].codeLicense, "MIT");
  assert.equal(TRELLIS_MODELS["trellis-2-4b"].weightsLicense, "MIT");
  assert.equal(TRELLIS_MODELS["trellis-2-4b"].commercialUseAllowed, true);
  assert.equal(TRELLIS_MODELS["trellis-2-4b"].localInferenceCostUsd, 0);
  assert.equal(TRELLIS_MODELS["trellis-1"].codeLicense, "MIT");
  assert.equal(TRELLIS_MODELS["trellis-1"].weightsLicense, "MIT");
});

test("evaluateTrellisPreflight blocks CPU-only / low-disk / uncached environments", () => {
  const res = evaluateTrellisPreflight({
    modelKey: "trellis-2-4b",
    resolution: 1024,
    environment: {
      os: "linux",
      hasNvidiaGpu: false,
      vramGb: 0,
      freeDiskGb: 19,
      cudaVersion: null,
      pythonVersion: "3.11",
      helperLicensesAccepted: false,
      weightsCachedLocally: false,
      allowModelDownload: false,
    },
  });
  assert.equal(res.ready, false);
  assert.ok(res.blockers.some((b) => /NVIDIA GPU/.test(b)));
  assert.ok(res.blockers.some((b) => /insufficient VRAM/.test(b)));
  assert.ok(res.blockers.some((b) => /insufficient free disk/.test(b)));
  assert.ok(res.blockers.some((b) => /CUDA >= 12\.4/.test(b)));
  assert.ok(res.blockers.some((b) => /gated helper/.test(b)));
  assert.ok(res.blockers.some((b) => /model downloads are disabled/.test(b)));
});

test("evaluateTrellisPreflight passes when GPU, VRAM, disk, CUDA, Python, licenses, and cache are satisfied", () => {
  const res = evaluateTrellisPreflight({
    modelKey: "trellis-2-4b",
    resolution: 1024,
    environment: {
      os: "linux",
      hasNvidiaGpu: true,
      vramGb: 24,
      freeDiskGb: 60,
      cudaVersion: "12.4",
      pythonVersion: "3.10",
      helperLicensesAccepted: true,
      weightsCachedLocally: true,
      allowModelDownload: false,
    },
  });
  assert.equal(res.ready, true);
  assert.equal(res.blockers.length, 0);
  assert.equal(res.localInferenceCostUsd, 0);
});
