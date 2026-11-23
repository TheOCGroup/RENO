/** TRELLIS / TRELLIS.2 compatibility & preflight evaluator.
 * Encodes verified hardware, VRAM, storage, CUDA, license, and local-only
 * execution requirements for Microsoft TRELLIS.2 and TRELLIS v1.
 * Performs NO network calls, NO model downloads, and NO paid execution. */

export const TRELLIS_MODELS = Object.freeze({
  "trellis-2-4b": {
    modelId: "microsoft/TRELLIS.2-4B",
    repoUrl: "https://github.com/microsoft/TRELLIS.2",
    codeLicense: "MIT",
    weightsLicense: "MIT",
    commercialUseAllowed: true,
    gatedHelpers: [
      {
        id: "facebook/dinov3-vitl16-pretrain-lvd1689m",
        license: "DINOv3-Gated",
        commercialUseAllowed: false,
        note: "Requires Hugging Face license acceptance and commercial-eligibility verification before use",
      },
      {
        id: "briaai/RMBG-2.0",
        license: "CC-BY-NC-4.0",
        commercialUseAllowed: false,
        approvedCommercialAlternatives: ["u2net (Apache-2.0/MIT)", "isnet-general-use (Apache-2.0)"],
        note: "Non-commercial by default; blocked in commercial mode unless BRIA commercial license or MIT/Apache-2.0 replacement is configured",
      },
    ],
    supportedModes: ["image_to_3d"],
    multiViewSupported: false,
    outputs: ["glb", "obj", "ply", "stl", "pbr_textures"],
    pbrMaps: ["baseColor", "metallic", "roughness", "opacity"],
    // Upstream TRELLIS.2 requires at least 24 GB for the model as a whole.
    // These are necessary lower bounds, NOT tested per-resolution VRAM peaks.
    minVramGbByResolution: {
      256: 24,
      512: 24,
      1024: 24,
      1536: 24,
    },
    recommendedVramGb: 24,
    minFreeDiskGb: 40,
    minCudaVersion: "12.4",
    minPythonVersion: "3.10",
    localInferenceCostUsd: 0,
  },
  "trellis-1": {
    modelId: "microsoft/TRELLIS-image-large",
    repoUrl: "https://github.com/microsoft/TRELLIS",
    codeLicense: "MIT",
    weightsLicense: "MIT",
    commercialUseAllowed: true,
    gatedHelpers: [],
    supportedModes: ["image_to_3d"],
    multiViewSupported: false,
    outputs: ["glb", "ply_gaussian", "radiance_field"],
    pbrMaps: ["baseColor"],
    minVramGbByResolution: {
      512: 16,
    },
    recommendedVramGb: 16,
    minFreeDiskGb: 20,
    minCudaVersion: "11.8",
    minPythonVersion: "3.8",
    localInferenceCostUsd: 0,
  },
});

function parseSemverTuple(v) {
  if (typeof v !== "string") return null;
  const m = v.trim().match(/^(\d+)\.(\d+)/);
  if (!m) return null;
  return [Number(m[1]), Number(m[2])];
}

function gteVersion(actual, minimum) {
  const a = parseSemverTuple(actual);
  const b = parseSemverTuple(minimum);
  if (!a || !b) return false;
  return a[0] > b[0] || (a[0] === b[0] && a[1] >= b[1]);
}

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const PINNED_TRELLIS2_REPO = "https://github.com/microsoft/TRELLIS.2.git";
export const PINNED_TRELLIS2_COMMIT = "75fbf0183001ed9876c8dbb35de6b68552ee08bd";
export const APPROVED_COMMERCIAL_BG_REMOVERS = Object.freeze(["u2net", "isnet-general-use"]);
export const RESTRICTED_NONCOMMERCIAL_COMPONENTS = Object.freeze(["briaai/RMBG-2.0", "nvdiffrast", "nvdiffrec"]);
export const DINOV3_ATTRIBUTION_TEXT = "Built with DINOv3";

export function validateCommercialTrellisConfig({
  backgroundRemover = "u2net",
  enabledExtensions = [],
  dinov3AttributionPresent = false,
  briaCommercialLicensed = false,
  nvdiffrastCommercialLicensed = false,
} = {}) {
  const blockers = [];
  const bg = String(backgroundRemover ?? "").trim();
  const exts = Array.isArray(enabledExtensions) ? enabledExtensions.map((x) => String(x).trim()) : [];

  if (bg === "briaai/RMBG-2.0" && briaCommercialLicensed !== true) {
    blockers.push("briaai/RMBG-2.0 is CC-BY-NC-4.0 and blocked for commercial use without a BRIA commercial license");
  } else if (!APPROVED_COMMERCIAL_BG_REMOVERS.includes(bg) && !(bg === "briaai/RMBG-2.0" && briaCommercialLicensed === true)) {
    blockers.push(`unapproved backgroundRemover "${bg}"; approved commercial options: ${APPROVED_COMMERCIAL_BG_REMOVERS.join(", ")}`);
  }

  for (const restricted of ["nvdiffrast", "nvdiffrec"]) {
    if (exts.includes(restricted) && nvdiffrastCommercialLicensed !== true) {
      blockers.push(`${restricted} carries a non-commercial NVIDIA license and must be excluded unless separately licensed`);
    }
  }

  if (dinov3AttributionPresent !== true) {
    blockers.push(`Meta DINOv3 License requires "${DINOV3_ATTRIBUTION_TEXT}" attribution in product UI`);
  }

  return {
    cleared: blockers.length === 0,
    backgroundRemover: bg,
    attribution: DINOV3_ATTRIBUTION_TEXT,
    blockers,
  };
}

export function evaluateTrellisPreflight({
  modelKey = "trellis-2-4b",
  resolution = 1024,
  environment = {},
} = {}) {
  const spec = TRELLIS_MODELS[modelKey];
  if (!spec) {
    return {
      ready: false,
      modelKey,
      blockers: [`unknown TRELLIS modelKey: ${String(modelKey)}`],
      spec: null,
    };
  }

  const blockers = [];
  const warnings = [];
  const env = environment ?? {};

  if (env.os && env.os !== "linux") {
    warnings.push(`official TRELLIS.2 target is Linux; observed os=${env.os}`);
  }
  if (env.hasNvidiaGpu !== true) {
    blockers.push("NVIDIA GPU with CUDA required for local TRELLIS inference (no GPU detected)");
  }

  const requiredVramGb = spec.minVramGbByResolution[resolution] ?? spec.recommendedVramGb;
  const vramGb = typeof env.vramGb === "number" && Number.isFinite(env.vramGb) ? env.vramGb : 0;
  if (vramGb < requiredVramGb) {
    blockers.push(`insufficient VRAM for ${spec.modelId} at ${resolution}: ${vramGb}GB < ${requiredVramGb}GB required`);
  }

  const freeDiskGb = typeof env.freeDiskGb === "number" && Number.isFinite(env.freeDiskGb) ? env.freeDiskGb : 0;
  if (freeDiskGb < spec.minFreeDiskGb) {
    blockers.push(`insufficient free disk space: ${freeDiskGb}GB < ${spec.minFreeDiskGb}GB required`);
  }

  if (!gteVersion(env.cudaVersion, spec.minCudaVersion)) {
    blockers.push(`CUDA >= ${spec.minCudaVersion} required (observed: ${env.cudaVersion ?? "none"})`);
  }

  if (!gteVersion(env.pythonVersion, spec.minPythonVersion)) {
    blockers.push(`Python >= ${spec.minPythonVersion} required (observed: ${env.pythonVersion ?? "none"})`);
  }

  if (spec.gatedHelpers.length > 0 && env.helperLicensesAccepted !== true) {
    blockers.push("gated helper model licenses must be accepted and cached before offline local execution");
  }

  if (env.weightsCachedLocally !== true && env.allowModelDownload !== true) {
    blockers.push("model weights not cached locally and model downloads are disabled by policy");
  }

  return {
    ready: blockers.length === 0,
    modelKey,
    modelId: spec.modelId,
    resolution,
    requiredVramGb,
    requiredDiskGb: spec.minFreeDiskGb,
    codeLicense: spec.codeLicense,
    weightsLicense: spec.weightsLicense,
    commercialUseAllowed: spec.commercialUseAllowed,
    localInferenceCostUsd: spec.localInferenceCostUsd,
    blockers,
    warnings,
  };
}

export function createTrellisSubprocessProvider({
  workerPath = path.resolve(process.cwd(), "infra/trellis2/trellis2_worker.py"),
  pythonBin = process.env.OCG_PYTHON_BIN || "python3",
  timeoutMs = 240_000,
  bgRemover = process.env.OCG_BG_REMOVER || "u2net",
  cacheDir = process.env.OCG_TRELLIS_LOCAL_CACHE_DIR || "",
  enabledExtensions = [],
  dinov3AttributionPresent = true,
  briaCommercialLicensed = false,
  nvdiffrastCommercialLicensed = process.env.OCG_NVDIFFRAST_COMMERCIAL_LICENSED === "true",
  glbExportMode = process.env.OCG_TEXTURED_GLB_MODE || "textured",
  execFileImpl = execFileAsync,
} = {}) {
  const commercialCheck = validateCommercialTrellisConfig({
    backgroundRemover: bgRemover,
    enabledExtensions,
    dinov3AttributionPresent,
    briaCommercialLicensed,
    nvdiffrastCommercialLicensed,
  });

  async function trellisSubprocessProvider({ imageBase64, mimeType }) {
    if (!commercialCheck.cleared) {
      throw new Error(`COMMERCIAL_GUARD_BLOCKED: ${commercialCheck.blockers.join("; ")}`);
    }
    if (glbExportMode !== "geometry_only" && nvdiffrastCommercialLicensed !== true) {
      throw new Error(
        "NONCOMMERCIAL_DEPENDENCY_BLOCKED: o_voxel.postprocess.to_glb requires nvdiffrast (NVIDIA Non-Commercial) unless OCG_NVDIFFRAST_COMMERCIAL_LICENSED=true or OCG_TEXTURED_GLB_MODE=geometry_only"
      );
    }
    if (!imageBase64 || typeof imageBase64 !== "string") {
      throw new Error("imageBase64 input is required for TRELLIS.2 image_to_3d inference");
    }

    const ext = mimeType === "image/jpeg" ? "jpg" : mimeType === "image/webp" ? "webp" : "png";
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ocg-trellis-req-"));
    const inputPath = path.join(tmpDir, `input.${ext}`);
    const outputPath = path.join(tmpDir, "output.glb");

    try {
      fs.writeFileSync(inputPath, Buffer.from(imageBase64, "base64"));
      await execFileImpl(pythonBin, [workerPath, inputPath, outputPath], {
        timeout: timeoutMs,
        maxBuffer: 4 * 1024 * 1024,
        env: {
          PATH: process.env.PATH || "",
          SYSTEMROOT: process.env.SYSTEMROOT || "",
          OCG_BG_REMOVER: bgRemover,
          OCG_DINOV3_ATTRIBUTION: DINOV3_ATTRIBUTION_TEXT,
          OCG_TRELLIS_LOCAL_CACHE_DIR: cacheDir,
          OCG_TEXTURED_GLB_MODE: glbExportMode,
          OCG_NVDIFFRAST_COMMERCIAL_LICENSED: nvdiffrastCommercialLicensed ? "true" : "false",
          OCG_BRIA_COMMERCIAL_LICENSED: briaCommercialLicensed ? "true" : "false",
        },
      });
      if (!fs.existsSync(outputPath)) {
        throw new Error("TRELLIS worker exited without producing output.glb");
      }
      return {
        glbBuffer: fs.readFileSync(outputPath),
        modelId: "microsoft/TRELLIS.2-4B",
        modelVersion: PINNED_TRELLIS2_COMMIT,
        codeLicense: "MIT",
        weightsLicense: "MIT",
        commercialUseAllowed: true,
        geometryOnly: glbExportMode === "geometry_only",
        texturedOutput: glbExportMode !== "geometry_only",
        exportCapabilityDisclosure:
          glbExportMode === "geometry_only"
            ? "Geometry-only GLB export active (nvdiffrast excluded; no raster PBR textures)"
            : "Textured GLB export active (commercial nvdiffrast license asserted)",
      };
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }

  return trellisSubprocessProvider;
}
