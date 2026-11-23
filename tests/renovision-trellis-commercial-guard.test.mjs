import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  APPROVED_COMMERCIAL_BG_REMOVERS,
  DINOV3_ATTRIBUTION_TEXT,
  PINNED_TRELLIS2_COMMIT,
  createTrellisSubprocessProvider,
  validateCommercialTrellisConfig,
} from "../lib/renovision/trellis-provider.mjs";
import { createAsset3dAdapter } from "../lib/renovision/asset3d-adapter.mjs";
import { renderAsset3dViewerHtml } from "../lib/renovision/asset3d-viewer.mjs";
import { buildProceduralObjectPng256 } from "../scripts/live_3d_acceptance.mjs";

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

test("createTrellisSubprocessProvider blocks textured nvdiffrast mode without commercial license", async () => {
  const provider = createTrellisSubprocessProvider({
    glbExportMode: "textured",
    nvdiffrastCommercialLicensed: false,
  });
  await assert.rejects(
    () => provider({ imageBase64: buildProceduralObjectPng256().toString("base64"), mimeType: "image/png" }),
    /NONCOMMERCIAL_DEPENDENCY_BLOCKED/
  );
});

test("worker-to-API integration: createAsset3dAdapter -> createTrellisSubprocessProvider -> GLB -> temp cleanup", async () => {
  const sampleGlb = fs.readFileSync(path.resolve("assets/samples/accent-chair.glb"));
  let capturedTmpDir = null;
  let capturedEnvKeys = null;

  const provider = createTrellisSubprocessProvider({
    glbExportMode: "geometry_only",
    execFileImpl: async (_bin, args, opts) => {
      const [workerPath, inputPath, outputPath] = args;
      assert.match(workerPath, /trellis2_worker\.py$/);
      assert.ok(fs.existsSync(inputPath));
      capturedTmpDir = path.dirname(inputPath);
      capturedEnvKeys = Object.keys(opts.env);
      assert.equal(opts.env.OCG_BG_REMOVER, "u2net");
      assert.equal(opts.env.OCG_DINOV3_ATTRIBUTION, DINOV3_ATTRIBUTION_TEXT);
      fs.writeFileSync(outputPath, sampleGlb);
      return { stdout: '{"ok":true}', stderr: "" };
    },
  });

  const adapter = createAsset3dAdapter({
    enabled: true,
    founderApproved: true,
    provider,
    environment: {
      os: "linux",
      hasNvidiaGpu: true,
      vramGb: 24,
      freeDiskGb: 60,
      cudaVersion: "12.4",
      pythonVersion: "3.10",
      helperLicensesAccepted: true,
      weightsCachedLocally: true,
    },
  });

  const submitted = await adapter.submitJob({
    tenantId: "t-worker-test",
    consumer: "nova",
    mode: "image_to_3d",
    category: "furniture",
    assetName: "chair-256",
    mimeType: "image/png",
    imageBase64: buildProceduralObjectPng256().toString("base64"),
  });
  assert.ok(submitted.job?.jobId);
  const completed = await adapter.processJob(submitted.job.jobId, { tenantId: "t-worker-test" });
  assert.equal(completed.ok, true);
  assert.equal(completed.job.status, "completed");
  assert.equal(completed.job.result.inspection.triangleCount, 12);
  assert.equal(fs.existsSync(capturedTmpDir), false);
  assert.ok(!capturedEnvKeys.includes("OCG_3D_ENGINE_TOKEN"));
});

test("viewer UI displays Built with DINOv3 attribution and asset3dMain wires subprocess provider", () => {
  const html = renderAsset3dViewerHtml();
  assert.ok(html.includes(DINOV3_ATTRIBUTION_TEXT));

  const mainSrc = fs.readFileSync("src/asset3dMain.mjs", "utf8");
  assert.ok(mainSrc.includes("createTrellisSubprocessProvider"));
  assert.ok(mainSrc.includes("OCG_3D_ENABLED"));
  assert.ok(mainSrc.includes("OCG_3D_FOUNDER_APPROVED"));
});

test("live_3d_acceptance.mjs builds a 256x256 PNG and fails closed (BLOCKED, exit 2) when unconfigured", () => {
  const png = buildProceduralObjectPng256();
  assert.equal(png.readUInt32BE(16), 256);
  assert.equal(png.readUInt32BE(20), 256);

  const res = spawnSync(process.execPath, ["scripts/live_3d_acceptance.mjs"], {
    env: { ...process.env, OCG_3D_ENGINE_URL: "", OCG_3D_ENGINE_TOKEN: "" },
    encoding: "utf8",
  });
  assert.equal(res.status, 2);
  assert.match(res.stderr, /"status":"BLOCKED"/);
});

test("Dockerfile.trellis2 pins upstream TRELLIS.2 commit, uses o_voxel.postprocess.to_glb in worker, and excludes restricted deps", () => {
  const dockerfile = fs.readFileSync("infra/trellis2/Dockerfile.trellis2", "utf8");
  assert.ok(dockerfile.includes(PINNED_TRELLIS2_COMMIT));
  assert.ok(dockerfile.includes("HEALTHCHECK"));
  assert.ok(dockerfile.includes("USER ocg"));

  const worker = fs.readFileSync("infra/trellis2/trellis2_worker.py", "utf8");
  assert.ok(worker.includes("Trellis2ImageTo3DPipeline.from_pretrained"));
  assert.ok(worker.includes("o_voxel.postprocess.to_glb"));

  const reqs = fs.readFileSync("infra/trellis2/requirements.trellis2.txt", "utf8");
  assert.doesNotMatch(reqs, /^nvdiffrast/m);
  assert.doesNotMatch(reqs, /^nvdiffrec/m);
  assert.doesNotMatch(reqs, /^briaai/m);

  const gpuYaml = fs.readFileSync("infra/gcp/service.3d-engine-gpu.yaml", "utf8");
  assert.match(gpuYaml, /minScale:\s*"0"/);
  assert.match(gpuYaml, /maxScale:\s*"1"/);
  assert.match(gpuYaml, /containerConcurrency:\s*1/);
  assert.match(gpuYaml, /nvidia-l4/);
});

test("CUDA native extension build targets existing A40 sm_86 and proposed L4 sm_89", () => {
  const dockerfile = fs.readFileSync("infra/trellis2/Dockerfile.trellis2", "utf8");
  const archList = dockerfile.match(/TORCH_CUDA_ARCH_LIST="([^"]+)"/)?.[1];
  assert.ok(archList, "CUDA architecture list must be explicit");
  assert.deepEqual(archList.split(";"), ["8.6", "8.9"]);
});

test("TRELLIS provider defaults to geometry-only without a commercial rasterizer license", async () => {
  const previous = process.env.OCG_TEXTURED_GLB_MODE;
  delete process.env.OCG_TEXTURED_GLB_MODE;
  try {
    const provider = createTrellisSubprocessProvider({
      nvdiffrastCommercialLicensed: false,
      execFileImpl: async (_bin, args, opts) => {
        assert.equal(opts.env.OCG_TEXTURED_GLB_MODE, "geometry_only");
        fs.copyFileSync("assets/samples/accent-chair.glb", args[2]);
      },
    });
    const result = await provider({ imageBase64: buildProceduralObjectPng256().toString("base64"), mimeType: "image/png" });
    assert.equal(result.geometryOnly, true);
    assert.equal(result.texturedOutput, false);
  } finally {
    if (previous === undefined) delete process.env.OCG_TEXTURED_GLB_MODE;
    else process.env.OCG_TEXTURED_GLB_MODE = previous;
  }
});
