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
import { createGpuScheduler, resolveGpuSchedulerConfig } from "./gpu-scheduler.mjs";

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

/** Runtime variables the Python worker genuinely needs (CUDA driver libraries,
 * the TRELLIS.2 source tree, offline model caches, GPU selection). Everything else
 * — notably OCG_3D_ENGINE_TOKEN, OIDC secrets, cloud credentials and the
 * Runpod API key — is deliberately NOT forwarded to the inference subprocess. */
export const TRELLIS_WORKER_ENV_ALLOWLIST = Object.freeze([
  "PATH",
  "SYSTEMROOT",
  "HOME",
  "LANG",
  "LC_ALL",
  "TMPDIR",
  "PYTHONPATH",
  "LD_LIBRARY_PATH",
  "CUDA_HOME",
  "CUDA_VISIBLE_DEVICES",
  "NVIDIA_VISIBLE_DEVICES",
  "NVIDIA_DRIVER_CAPABILITIES",
  "PYTORCH_CUDA_ALLOC_CONF",
  "HF_HOME",
  "HF_HUB_CACHE",
  "HF_HUB_OFFLINE",
  "TRANSFORMERS_OFFLINE",
  "TORCH_HOME",
  "XDG_CACHE_HOME",
  "U2NET_HOME",
  "ATTN_BACKEND",
  "SPARSE_ATTN_BACKEND",
  "SPCONV_ALGO",
]);

export const TRELLIS_TIMEOUT_BOUNDS_MS = Object.freeze({ min: 30_000, max: 900_000, default: 600_000 });

export function resolveTrellisTimeoutMs(raw = process.env.OCG_TRELLIS_TIMEOUT_MS) {
  const n = Number(raw);
  if (raw === undefined || raw === null || raw === "" || !Number.isFinite(n)) return TRELLIS_TIMEOUT_BOUNDS_MS.default;
  return Math.min(TRELLIS_TIMEOUT_BOUNDS_MS.max, Math.max(TRELLIS_TIMEOUT_BOUNDS_MS.min, Math.trunc(n)));
}

export function buildTrellisWorkerEnv(sourceEnv = process.env, overrides = {}) {
  const env = {};
  for (const key of TRELLIS_WORKER_ENV_ALLOWLIST) {
    if (typeof sourceEnv[key] === "string" && sourceEnv[key] !== "") env[key] = sourceEnv[key];
  }
  if (!env.PATH) env.PATH = "";
  if (!env.SYSTEMROOT) env.SYSTEMROOT = "";
  return { ...env, ...overrides };
}

function touchActivityFile(activityFile) {
  if (!activityFile) return;
  try {
    const t = new Date();
    if (fs.existsSync(activityFile)) fs.utimesSync(activityFile, t, t);
    else fs.writeFileSync(activityFile, "");
  } catch {
    /* activity heartbeat is best-effort; the watchdog's max-runtime cap still applies */
  }
}

export function createTrellisSubprocessProvider({
  workerPath = process.env.OCG_TRELLIS_WORKER_PATH || path.resolve(process.cwd(), "infra/trellis2/trellis2_worker.py"),
  pythonBin = process.env.OCG_PYTHON_BIN || "python3",
  timeoutMs = resolveTrellisTimeoutMs(),
  bgRemover = process.env.OCG_BG_REMOVER || "u2net",
  cacheDir = process.env.OCG_TRELLIS_LOCAL_CACHE_DIR || "",
  enabledExtensions = [],
  dinov3AttributionPresent = true,
  briaCommercialLicensed = false,
  nvdiffrastCommercialLicensed = process.env.OCG_NVDIFFRAST_COMMERCIAL_LICENSED === "true",
  // Commercial-safe default: geometry-only (nvdiffrast is never installed). Matches
  // the /api/3d/capabilities default so the API never advertises a mode that fails.
  glbExportMode = process.env.OCG_TEXTURED_GLB_MODE || "geometry_only",
  scheduler = createGpuScheduler(resolveGpuSchedulerConfig(process.env)),
  activityFile = process.env.OCG_ACTIVITY_FILE || "",
  sourceEnv = process.env,
  execFileImpl = execFileAsync,
} = {}) {
  timeoutMs = Math.min(TRELLIS_TIMEOUT_BOUNDS_MS.max, Math.max(TRELLIS_TIMEOUT_BOUNDS_MS.min, Number(timeoutMs) || TRELLIS_TIMEOUT_BOUNDS_MS.default));
  const commercialCheck = validateCommercialTrellisConfig({
    backgroundRemover: bgRemover,
    enabledExtensions,
    dinov3AttributionPresent,
    briaCommercialLicensed,
    nvdiffrastCommercialLicensed,
  });

  async function trellisSubprocessProvider({ imageBase64, mimeType, signal = null }) {
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
    // Sequential GPU scheduling: wait for the shared GPU slot/lease (cancellable).
    const release = await scheduler.acquire({ signal });
    let tmpDir = null;
    const startedMs = Date.now();

    try {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ocg-trellis-req-"));
      const inputPath = path.join(tmpDir, `input.${ext}`);
      const outputPath = path.join(tmpDir, "output.glb");
      if (signal?.aborted) throw new Error("JOB_CANCELLED: job cancelled before GPU execution");
      touchActivityFile(activityFile);
      fs.writeFileSync(inputPath, Buffer.from(imageBase64, "base64"));
      await execFileImpl(pythonBin, [workerPath, inputPath, outputPath], {
        timeout: timeoutMs,
        // SIGKILL so a hung CUDA process cannot ignore the timeout/cancel and keep the GPU busy.
        killSignal: "SIGKILL",
        ...(signal ? { signal } : {}),
        maxBuffer: 4 * 1024 * 1024,
        env: buildTrellisWorkerEnv(sourceEnv, {
          OCG_BG_REMOVER: bgRemover,
          OCG_DINOV3_ATTRIBUTION: DINOV3_ATTRIBUTION_TEXT,
          OCG_TRELLIS_LOCAL_CACHE_DIR: cacheDir,
          OCG_TEXTURED_GLB_MODE: glbExportMode,
          OCG_NVDIFFRAST_COMMERCIAL_LICENSED: nvdiffrastCommercialLicensed ? "true" : "false",
          OCG_BRIA_COMMERCIAL_LICENSED: briaCommercialLicensed ? "true" : "false",
        }),
      }).catch((err) => {
        if (signal?.aborted || err?.name === "AbortError") {
          throw new Error("JOB_CANCELLED: TRELLIS worker terminated by cancellation");
        }
        if (err?.killed === true || err?.signal === "SIGKILL") {
          throw new Error(`WORKER_TIMEOUT: TRELLIS worker exceeded ${timeoutMs}ms and was killed`);
        }
        throw err;
      });
      if (!fs.existsSync(outputPath)) {
        throw new Error("TRELLIS worker exited without producing output.glb");
      }
      return {
        resourceUsage: { vramPeakGb: null, ramPeakMb: null, wallClockMs: Date.now() - startedMs, timeoutMs },
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
      if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
      touchActivityFile(activityFile);
      release();
    }
  }

  trellisSubprocessProvider.scheduler = scheduler;
  trellisSubprocessProvider.timeoutMs = timeoutMs;
  return trellisSubprocessProvider;
}
