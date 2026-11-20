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
    minVramGbByResolution: {
      256: 8,
      512: 12,
      1024: 16,
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
