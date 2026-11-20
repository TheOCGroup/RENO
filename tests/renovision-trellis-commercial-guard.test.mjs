import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import {
  APPROVED_COMMERCIAL_BG_REMOVERS,
  DINOV3_ATTRIBUTION_TEXT,
  validateCommercialTrellisConfig,
} from "../lib/renovision/trellis-provider.mjs";

test("commercial guard blocks briaai/RMBG-2.0, nvdiffrast, nvdiffrec, and missing DINOv3 attribution", () => {
  const rmb = validateCommercialTrellisConfig({
    backgroundRemover: "briaai/RMBG-2.0",
    dinov3AttributionPresent: true,
  });
  assert.equal(rmb.cleared, false);
  assert.ok(rmb.blockers.some((b) => b.includes("CC-BY-NC-4.0")));

  const nvd = validateCommercialTrellisConfig({
    backgroundRemover: "u2net",
    enabledExtensions: ["nvdiffrast", "nvdiffrec"],
    dinov3AttributionPresent: true,
  });
  assert.equal(nvd.cleared, false);
  assert.ok(nvd.blockers.some((b) => b.includes("nvdiffrast")));
  assert.ok(nvd.blockers.some((b) => b.includes("nvdiffrec")));

  const noAttr = validateCommercialTrellisConfig({
    backgroundRemover: "u2net",
    dinov3AttributionPresent: false,
  });
  assert.equal(noAttr.cleared, false);
  assert.ok(noAttr.blockers.some((b) => b.includes(DINOV3_ATTRIBUTION_TEXT)));
});

test("commercial guard passes with u2net/isnet-general-use and Built with DINOv3 attribution", () => {
  for (const bg of APPROVED_COMMERCIAL_BG_REMOVERS) {
    const ok = validateCommercialTrellisConfig({
      backgroundRemover: bg,
      enabledExtensions: ["cumesh", "o-voxel", "flexgemm"],
      dinov3AttributionPresent: true,
    });
    assert.equal(ok.cleared, true);
    assert.deepEqual(ok.blockers, []);
    assert.equal(ok.attribution, DINOV3_ATTRIBUTION_TEXT);
  }
});

test("live_3d_acceptance.mjs fails closed (BLOCKED, exit 2) when OCG_3D_ENGINE_URL is unset", () => {
  const res = spawnSync(process.execPath, ["scripts/live_3d_acceptance.mjs"], {
    env: { ...process.env, OCG_3D_ENGINE_URL: "", OCG_3D_ENGINE_TOKEN: "" },
    encoding: "utf8",
  });
  assert.equal(res.status, 2);
  assert.match(res.stderr, /"status":"BLOCKED"/);
});

test("trellis2 container and Cloud Run GPU manifests exclude restricted components and enforce scale-to-zero maxScale=1", () => {
  const reqs = fs.readFileSync("infra/trellis2/requirements.trellis2.txt", "utf8");
  assert.doesNotMatch(reqs, /^nvdiffrast/m);
  assert.doesNotMatch(reqs, /^nvdiffrec/m);
  assert.doesNotMatch(reqs, /^briaai/m);

  const gpuYaml = fs.readFileSync("infra/gcp/service.3d-engine-gpu.yaml", "utf8");
  assert.match(gpuYaml, /minScale:\s*"0"/);
  assert.match(gpuYaml, /maxScale:\s*"1"/);
  assert.match(gpuYaml, /containerConcurrency:\s*1/);
  assert.match(gpuYaml, /nvidia\.com\/gpu:\s*"1"/);
  assert.match(gpuYaml, /nvidia-l4/);
  assert.match(gpuYaml, /OCG_BG_REMOVER[\s\S]*u2net/);
});
