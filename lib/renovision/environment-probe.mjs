/** Production environment probe for the OCG 3D ENGINE entrypoint (Phase 9
 * remediation of QUINCEY finding UF-Q9-1).
 *
 * The adapter preflight (`evaluateTrellisPreflight`) requires a STRUCTURED
 * environment: strict booleans (`hasNvidiaGpu === true`), numbers
 * (`vramGb`, `freeDiskGb`), version strings (`cudaVersion`, `pythonVersion`),
 * and a `cachedModelKeys` array. `process.env` is a string map and can never
 * supply those, so the previous entrypoint wiring (`environment: process.env`)
 * could never pass preflight on any host. This module builds the structured
 * environment from the actual machine state instead.
 *
 * Honesty rules (fail-closed, no fabricated facts):
 *  - Every field carries a source label: "probed" (measured on this host),
 *    "attested" (operator assertion from config — used ONLY for facts that
 *    cannot be probed, i.e. license acceptance), or "default" (a declared
 *    fallback used when probing is impossible, e.g. RAM when /proc/meminfo
 *    is unreadable). Attested/default values are never presented as probed.
 *  - A missing `nvidia-smi` binary means `hasNvidiaGpu: false` — never an
 *    assumed GPU. Unparseable probe output degrades to the honest negative
 *    (no GPU / no version), never to an invented positive.
 *  - If a probe step throws, the field falls back to its fail-closed value
 *    and the failure is recorded in `probeErrors`; preflight then reports
 *    the resulting blockers. The probe itself never throws.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { TRELLIS_MODELS } from "./trellis-provider.mjs";

const execFileAsync = promisify(execFile);

export const PROBE_SOURCE_PROBED = "probed";
export const PROBE_SOURCE_ATTESTED = "attested";
export const PROBE_SOURCE_DEFAULT = "default";

/** Parse `nvidia-smi --query-gpu=name,memory.total,driver_version --format=csv,noheader,nounits`
 * output. Returns [] for empty/unparseable output (honest "no GPU"). */
export function parseNvidiaSmiGpuCsv(stdout) {
  if (typeof stdout !== "string") return [];
  const gpus = [];
  for (const line of stdout.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parts = trimmed.split(",").map((p) => p.trim());
    if (parts.length < 3) continue;
    const memoryMiB = Number(parts[1]);
    if (!parts[0] || !Number.isFinite(memoryMiB) || memoryMiB <= 0) continue;
    gpus.push({
      name: parts[0],
      memoryMiB,
      vramGb: Math.floor(memoryMiB / 1024),
      driverVersion: parts[2] || null,
    });
  }
  return gpus;
}

/** Parse the CUDA version out of `nvidia-smi` header output
 * ("... CUDA Version: 12.4 ..."). Returns null when absent. */
export function parseNvidiaSmiCudaVersion(stdout) {
  if (typeof stdout !== "string") return null;
  const m = stdout.match(/CUDA Version:\s*(\d+\.\d+)/);
  return m ? m[1] : null;
}

/** Parse a `python --version` string ("Python 3.10.12") to "3.10". */
export function parsePythonVersion(text) {
  if (typeof text !== "string") return null;
  const m = text.match(/Python\s+(\d+)\.(\d+)/);
  return m ? `${m[1]}.${m[2]}` : null;
}

function hfHubDirName(modelId) {
  return `models--${String(modelId).replaceAll("/", "--")}`;
}

function dirHasPipelineJson(dir) {
  try {
    return fs.existsSync(path.join(dir, "pipeline.json"));
  } catch {
    return false;
  }
}

/** Scan cache roots for locally cached TRELLIS weights. A model key counts as
 * cached only when a `pipeline.json` exists in one of the layouts the worker /
 * HF hub actually use:
 *  - `<root>/pipeline.json`            → the configured worker cache dir
 *    (`OCG_TRELLIS_LOCAL_CACHE_DIR`), which the Python worker loads as the
 *    TRELLIS.2-4B weights dir;
 *  - `<root>/<modelKey>/pipeline.json` → per-model subdirectory layout;
 *  - `<root>/[hub/]models--<org>--<name>/snapshots/<rev>/pipeline.json`
 *    → Hugging Face hub cache layout.
 * Pure filesystem inspection — no network, no downloads. */
export function scanCachedModelKeys(cacheRoots, { existsImpl = fs.existsSync, readdirImpl = fs.readdirSync } = {}) {
  const found = new Set();
  const keys = Object.keys(TRELLIS_MODELS);
  const safeReaddir = (dir) => {
    try {
      return readdirImpl(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
    } catch {
      return [];
    }
  };
  const safeHas = (p) => {
    try {
      return existsImpl(p);
    } catch {
      return false;
    }
  };

  for (const root of cacheRoots) {
    if (typeof root !== "string" || !root.trim()) continue;
    const base = root.trim();
    // The worker's configured cache dir IS the TRELLIS.2-4B weights dir.
    if (safeHas(path.join(base, "pipeline.json"))) found.add("trellis-2-4b");
    for (const key of keys) {
      if (safeHas(path.join(base, key, "pipeline.json"))) found.add(key);
      const hubName = hfHubDirName(TRELLIS_MODELS[key].modelId);
      for (const hubBase of [path.join(base, hubName), path.join(base, "hub", hubName)]) {
        for (const rev of safeReaddir(path.join(hubBase, "snapshots"))) {
          if (safeHas(path.join(hubBase, "snapshots", rev, "pipeline.json"))) found.add(key);
        }
      }
    }
  }
  return [...found].sort();
}

/** Resolve the cache roots the probe scans, from the process environment. */
export function resolveTrellisCacheRoots(env = process.env) {
  const roots = [];
  const push = (v) => {
    if (typeof v === "string" && v.trim() && !roots.includes(v.trim())) roots.push(v.trim());
  };
  push(env.OCG_TRELLIS_LOCAL_CACHE_DIR);
  push(env.HF_HUB_CACHE);
  if (typeof env.HF_HOME === "string" && env.HF_HOME.trim()) push(path.join(env.HF_HOME.trim(), "hub"));
  push(path.join(os.homedir(), ".cache", "huggingface", "hub"));
  return roots;
}

/** Default probe IO: real subprocess / filesystem access. Tests inject fakes
 * through the same shape, so the entrypoint path itself is what gets tested. */
export function createSystemProbeIo() {
  return {
    execFileImpl: (bin, args) => execFileAsync(bin, args, { timeout: 10_000, maxBuffer: 1024 * 1024 }),
    statfsImpl: (target) => fs.promises.statfs(target),
    readFileImpl: (target, enc) => fs.promises.readFile(target, enc),
    existsImpl: fs.existsSync,
    readdirImpl: fs.readdirSync,
    platformImpl: () => os.platform(),
    totalmemImpl: () => os.totalmem(),
  };
}

const numOrNull = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/**
 * Build the structured preflight environment from actual machine state.
 *
 * @param {object} [options]
 * @param {object} [options.env] process-environment string map (config source:
 *   cache dir, python binary, disk path, attestation flags).
 * @param {object} [options.io] probe IO overrides (see createSystemProbeIo).
 * @param {object} [options.attestation] operator-attestation config. The ONLY
 *   field taken from attestation is `helperLicensesAccepted` — whether the
 *   operator has accepted the gated helper-model licenses is a legal fact
 *   about the operator, not a measurable property of the machine, so it
 *   cannot be probed. It defaults to false (fail-closed).
 * @returns {Promise<{environment: object, fieldSources: object, gpus: object[],
 *   cacheRoots: string[], probeErrors: string[]}>} `environment` is the
 *   structured object the adapter/router preflight consumes.
 */
export async function probeAsset3dEnvironment({ env = process.env, io = createSystemProbeIo(), attestation = {} } = {}) {
  const probeErrors = [];
  const fieldSources = {};
  const environment = {};

  // --- OS (probed) ---
  try {
    environment.os = io.platformImpl();
    fieldSources.os = PROBE_SOURCE_PROBED;
  } catch {
    environment.os = "unknown";
    fieldSources.os = PROBE_SOURCE_DEFAULT;
    probeErrors.push("os probe failed");
  }

  // --- GPU / VRAM / CUDA (probed via nvidia-smi; absent binary = no GPU) ---
  let gpus = [];
  let cudaVersion = null;
  try {
    const query = await io.execFileImpl("nvidia-smi", [
      "--query-gpu=name,memory.total,driver_version",
      "--format=csv,noheader,nounits",
    ]);
    gpus = parseNvidiaSmiGpuCsv(query?.stdout ?? "");
  } catch {
    gpus = []; // nvidia-smi missing or failed → honestly no GPU detected
  }
  if (gpus.length > 0) {
    try {
      const header = await io.execFileImpl("nvidia-smi", []);
      cudaVersion = parseNvidiaSmiCudaVersion(header?.stdout ?? "");
    } catch {
      cudaVersion = null;
    }
  }
  environment.hasNvidiaGpu = gpus.length > 0;
  fieldSources.hasNvidiaGpu = PROBE_SOURCE_PROBED;
  environment.gpuModel = gpus[0]?.name ?? null;
  fieldSources.gpuModel = PROBE_SOURCE_PROBED;
  environment.vramGb = gpus.length > 0 ? Math.max(...gpus.map((g) => g.vramGb)) : 0;
  fieldSources.vramGb = PROBE_SOURCE_PROBED;
  environment.cudaVersion = cudaVersion;
  fieldSources.cudaVersion = cudaVersion ? PROBE_SOURCE_PROBED : PROBE_SOURCE_DEFAULT;
  environment.cudaAvailable = gpus.length > 0 && cudaVersion !== null;
  fieldSources.cudaAvailable = PROBE_SOURCE_PROBED;

  // --- Python version (probed) ---
  const pythonBin = (typeof env.OCG_PYTHON_BIN === "string" && env.OCG_PYTHON_BIN.trim()) || "python3";
  try {
    const out = await io.execFileImpl(pythonBin, ["--version"]);
    environment.pythonVersion = parsePythonVersion(`${out?.stdout ?? ""} ${out?.stderr ?? ""}`);
  } catch {
    environment.pythonVersion = null;
    probeErrors.push(`python version probe failed (${pythonBin} --version)`);
  }
  fieldSources.pythonVersion = environment.pythonVersion ? PROBE_SOURCE_PROBED : PROBE_SOURCE_DEFAULT;

  // --- Free disk on the cache volume (probed via statfs) ---
  const cacheRoots = resolveTrellisCacheRoots(env);
  // Measure the cache volume; if the cache dir does not exist yet, fall back
  // to the home volume (same filesystem on the target deployments) rather
  // than reporting a fabricated or zero value.
  let diskMeasured = false;
  for (const target of [cacheRoots[0], os.homedir()]) {
    if (!target || diskMeasured) continue;
    try {
      const st = await io.statfsImpl(target);
      const freeBytes = Number(st.bavail) * Number(st.bsize);
      if (Number.isFinite(freeBytes)) {
        environment.freeDiskGb = Math.floor(freeBytes / (1024 ** 3));
        diskMeasured = true;
      }
    } catch { /* try the next target */ }
  }
  if (diskMeasured) {
    fieldSources.freeDiskGb = PROBE_SOURCE_PROBED;
  } else {
    environment.freeDiskGb = 0;
    fieldSources.freeDiskGb = PROBE_SOURCE_DEFAULT;
    probeErrors.push(`disk probe failed (statfs ${cacheRoots[0] ?? os.homedir()})`);
  }
  environment.cacheDir = cacheRoots[0] ?? null;

  // --- RAM (probed; /proc/meminfo preferred, os.totalmem fallback) ---
  try {
    let totalBytes = numOrNull(io.totalmemImpl());
    if (environment.os === "linux") {
      try {
        const meminfo = await io.readFileImpl("/proc/meminfo", "utf8");
        const m = String(meminfo).match(/MemTotal:\s*(\d+)\s*kB/);
        if (m) totalBytes = Number(m[1]) * 1024;
      } catch { /* fall back to os.totalmem() */ }
    }
    environment.ramGb = totalBytes ? Math.floor(totalBytes / (1024 ** 3)) : 0;
    fieldSources.ramGb = PROBE_SOURCE_PROBED;
  } catch {
    environment.ramGb = 0;
    fieldSources.ramGb = PROBE_SOURCE_DEFAULT;
    probeErrors.push("ram probe failed");
  }

  // --- Cached model weights (probed by filesystem scan) ---
  try {
    environment.cachedModelKeys = scanCachedModelKeys(cacheRoots, { existsImpl: io.existsImpl, readdirImpl: io.readdirImpl });
  } catch {
    environment.cachedModelKeys = [];
    probeErrors.push("model cache scan failed");
  }
  fieldSources.cachedModelKeys = PROBE_SOURCE_PROBED;
  environment.weightsCachedLocally = environment.cachedModelKeys.length > 0;

  // --- Gated helper licenses (ATTESTED — cannot be probed) ---
  const attested = attestation.helperLicensesAccepted === true || env.OCG_3D_HELPER_LICENSES_ACCEPTED === "true";
  environment.helperLicensesAccepted = attested;
  fieldSources.helperLicensesAccepted = PROBE_SOURCE_ATTESTED;

  return { environment, fieldSources, gpus, cacheRoots, probeErrors };
}
