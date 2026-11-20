/** OCG Adaptive Inference Engine (OCG-owned, inspired by Budget3D).
 * Implements compute-adaptive octree tokenization, latent variance estimation,
 * bisection-balanced spatial token merging, Wiener high-frequency skip gain,
 * dynamic quality profiles, compute-aware scheduling, and Gaussian splat optimization.
 * Performs NO network calls, NO paid API calls, and NO fabricated GPU timings. */

import { createModelRouter3d } from "./model-router-3d.mjs";
import { validateCommercialTrellisConfig } from "./trellis-provider.mjs";

export const N_SOBOL = 8192;
export const N_CELL = 4096;
export const N_CUBE = 512;
export const SCORE_SCALE = 0.08;
export const DEFAULT_THRESHOLDS = Object.freeze({ tau4: 2.1, tau2: 1.5 });

export const QUALITY_PROFILES = Object.freeze({
  draft: Object.freeze({
    id: "draft",
    label: "Draft (Fastest Preview Target)",
    targetTokens: 2048,
    tokenBudgetRatio: 0.25,
    samplingSteps: 5,
    guidanceFree: true,
    resolution: 512,
    splatKeepRatio: 0.35,
  }),
  balanced: Object.freeze({
    id: "balanced",
    label: "Balanced (Speed & Fidelity Target)",
    targetTokens: 4096,
    tokenBudgetRatio: 0.5,
    samplingSteps: 20,
    guidanceFree: false,
    resolution: 1024,
    splatKeepRatio: 0.65,
  }),
  high: Object.freeze({
    id: "high",
    label: "High Quality",
    targetTokens: 6554,
    tokenBudgetRatio: 0.8,
    samplingSteps: 35,
    guidanceFree: false,
    resolution: 1024,
    splatKeepRatio: 0.85,
  }),
  maximum: Object.freeze({
    id: "maximum",
    label: "Maximum Fidelity",
    targetTokens: 8192,
    tokenBudgetRatio: 1.0,
    samplingSteps: 50,
    guidanceFree: false,
    resolution: 1536,
    splatKeepRatio: 1.0,
  }),
});

export function snapRealizableTokens(nTokens) {
  const n = Math.round(Number(nTokens));
  if (!Number.isFinite(n) || n <= N_CUBE) return N_CUBE;
  if (n >= N_SOBOL) return N_SOBOL;
  if (n > 512 && n < 519) return n - 512 < 519 - n ? 512 : 519;
  return n;
}

export function k4Bounds(nTokens) {
  const n = snapRealizableTokens(nTokens);
  const k4Min = Math.max(0, Math.ceil((n - N_CUBE) / 15));
  const k4Max = Math.min(N_CUBE, Math.floor((n - N_CUBE) / 7));
  return { k4Min, k4Max, targetTokens: n };
}

/** Log-bit salience score: log2(1 + sqrt(v + 1e-8) / SCORE_SCALE). */
export function varianceToSalienceScore(variance) {
  const v = Math.max(0, Number(variance) || 0);
  return Math.log2(1 + Math.sqrt(v + 1e-8) / SCORE_SCALE);
}

/** Computes per-cell (4096) and per-cube (512) salience scores from 8192 Sobol point latents. */
export function computeOctreeSalienceScores(pointValues) {
  if (!pointValues || pointValues.length !== N_SOBOL) {
    throw new Error(`pointValues must have length ${N_SOBOL}`);
  }
  const score2 = new Float64Array(N_CELL);
  const cellMeans = new Float64Array(N_CELL);
  for (let c = 0; c < N_CELL; c++) {
    const a = Number(pointValues[c * 2]);
    const b = Number(pointValues[c * 2 + 1]);
    if (!Number.isFinite(a) || !Number.isFinite(b)) {
      throw new Error(`non-finite latent value at cell ${c}`);
    }
    const mean = (a + b) * 0.5;
    cellMeans[c] = mean;
    const var2 = ((a - mean) ** 2 + (b - mean) ** 2) * 0.5;
    score2[c] = varianceToSalienceScore(var2);
  }

  const score4 = new Float64Array(N_CUBE);
  for (let q = 0; q < N_CUBE; q++) {
    const base = q * 16;
    let sum = 0;
    for (let i = 0; i < 16; i++) sum += Number(pointValues[base + i]);
    const mean = sum / 16;
    let varSum = 0;
    for (let i = 0; i < 16; i++) varSum += (Number(pointValues[base + i]) - mean) ** 2;
    score4[q] = varianceToSalienceScore(varSum / 16);
  }

  return { score4, score2, cellMeans };
}

/** Bisects shared threshold offset delta in [-16, 16] to realize exact token budget N = 512 + 7*k4 + k2. */
export function buildAdaptiveTokenLayout(
  score4,
  score2,
  requestedTokens,
  { tau4 = DEFAULT_THRESHOLDS.tau4, tau2 = DEFAULT_THRESHOLDS.tau2, iters = 24 } = {}
) {
  if (!score4 || score4.length !== N_CUBE || !score2 || score2.length !== N_CELL) {
    throw new Error("score4 (512) and score2 (4096) are required");
  }
  const targetN = snapRealizableTokens(requestedTokens);
  if (targetN === N_CUBE) {
    return {
      targetTokens: N_CUBE,
      realizedTokens: N_CUBE,
      k4: 0,
      k2: 0,
      n4: N_CUBE,
      n2: 0,
      n1: 0,
      delta: 16,
      split4Indices: [],
      split2Indices: [],
      highDetailRetentionRatio: 1,
    };
  }
  if (targetN === N_SOBOL) {
    const split4Indices = Array.from({ length: N_CUBE }, (_, i) => i);
    const split2Indices = Array.from({ length: N_CELL }, (_, i) => i);
    return {
      targetTokens: N_SOBOL,
      realizedTokens: N_SOBOL,
      k4: N_CUBE,
      k2: N_CELL,
      n4: 0,
      n2: 0,
      n1: N_SOBOL,
      delta: -16,
      split4Indices,
      split2Indices,
      highDetailRetentionRatio: 1,
    };
  }

  let lo = -16;
  let hi = 16;
  for (let iter = 0; iter < iters; iter++) {
    const mid = (lo + hi) * 0.5;
    let count = N_CUBE;
    for (let q = 0; q < N_CUBE; q++) {
      if (score4[q] > tau4 + mid) {
        count += 7;
        const cellStart = q * 8;
        for (let j = 0; j < 8; j++) {
          if (score2[cellStart + j] > tau2 + mid) count += 1;
        }
      }
    }
    if (count > targetN) lo = mid;
    else hi = mid;
  }
  const delta = (lo + hi) * 0.5;

  const { k4Min, k4Max } = k4Bounds(targetN);
  const ranked4 = Array.from({ length: N_CUBE }, (_, idx) => ({ idx, s: score4[idx] })).sort((a, b) => b.s - a.s);
  let k4 = ranked4.filter((x) => x.s > tau4 + delta).length;
  k4 = Math.max(k4Min, Math.min(k4Max, k4));
  const k2 = targetN - N_CUBE - 7 * k4;

  const split4Set = new Set(ranked4.slice(0, k4).map((x) => x.idx));
  const eligibleCells = [];
  for (let q of split4Set) {
    const base = q * 8;
    for (let j = 0; j < 8; j++) {
      const cid = base + j;
      eligibleCells.push({ idx: cid, s: score2[cid] });
    }
  }
  eligibleCells.sort((a, b) => b.s - a.s);
  const split2Indices = eligibleCells.slice(0, k2).map((x) => x.idx);
  const split4Indices = [...split4Set];

  // Measure how much of the top-quartile high-variance cubes were preserved at fine resolution
  const topQuartileCount = Math.max(1, Math.floor(N_CUBE * 0.25));
  const topCubes = new Set(ranked4.slice(0, topQuartileCount).map((x) => x.idx));
  let preservedTop = 0;
  for (const q of topCubes) if (split4Set.has(q)) preservedTop += 1;

  const n4 = N_CUBE - k4;
  const n2 = 8 * k4 - k2;
  const n1 = 2 * k2;
  return {
    targetTokens: targetN,
    realizedTokens: n4 + n2 + n1,
    k4,
    k2,
    n4,
    n2,
    n1,
    delta,
    split4Indices,
    split2Indices,
    highDetailRetentionRatio: Number((preservedTop / topQuartileCount).toFixed(4)),
  };
}

/** High-frequency Wiener skip gain: t / max(t^2 + rho^2 * (1 - t)^2, 1e-6). */
export function wienerHighFrequencyGain(t, rho = 0.25) {
  const tt = Math.max(0, Math.min(1, Number(t) || 0));
  const denom = Math.max(tt * tt + rho * rho * (1 - tt) * (1 - tt), 1e-6);
  return tt / denom;
}

/** Compute-aware inference scheduler combining quality profiles, VRAM/hardware preflight, and commercial guards. */
export function scheduleInferenceJob({
  qualityProfile = "balanced",
  mode = "image_to_3d",
  environment = {},
  backgroundRemover = "u2net",
  enabledExtensions = [],
  dinov3AttributionPresent = true,
  allowPaid = false,
} = {}) {
  const profile = QUALITY_PROFILES[qualityProfile];
  if (!profile) {
    return {
      scheduled: false,
      errors: [`unknown qualityProfile: ${String(qualityProfile)}`],
    };
  }

  const licenseCheck = validateCommercialTrellisConfig({
    backgroundRemover,
    enabledExtensions,
    dinov3AttributionPresent,
  });

  const router = createModelRouter3d({ allowPaid });
  const routerTier = qualityProfile === "high" || qualityProfile === "maximum" ? "high" : "standard";
  const selection = router.selectModel({
    mode,
    qualityTier: routerTier,
    environment,
    allowModelDownload: false,
  });

  return {
    scheduled: selection.selected && licenseCheck.cleared,
    profile,
    licenseCheck,
    selection,
    budgetConfig: {
      targetTokens: profile.targetTokens,
      samplingSteps: profile.samplingSteps,
      guidanceFree: profile.guidanceFree,
      resolution: profile.resolution,
      splatKeepRatio: profile.splatKeepRatio,
    },
    costUsd: 0,
  };
}

/** Optimizes 3D Gaussian splats: filters NaN/low-opacity splats, merges spatially proximate
 * splats on a quantized voxel grid, enforces splatKeepRatio, and emits compact ASCII PLY. */
export function optimizeGaussianSplats(
  splats,
  {
    keepRatio = 0.65,
    minOpacity = 0.05,
    mergeVoxelSize = 0.02,
  } = {}
) {
  if (!Array.isArray(splats) || splats.length === 0) {
    throw new Error("splats array must be non-empty");
  }
  const ratio = Math.max(0.05, Math.min(1, Number(keepRatio) || 1));
  const targetCount = Math.max(1, Math.round(splats.length * ratio));

  const valid = [];
  for (const s of splats) {
    if (
      !s ||
      !Number.isFinite(s.x) ||
      !Number.isFinite(s.y) ||
      !Number.isFinite(s.z) ||
      !Number.isFinite(s.opacity) ||
      s.opacity < minOpacity
    ) {
      continue;
    }
    valid.push({
      x: s.x,
      y: s.y,
      z: s.z,
      opacity: Math.max(0, Math.min(1, s.opacity)),
      scale: Number.isFinite(s.scale) && s.scale > 0 ? s.scale : 0.01,
    });
  }

  // Merge spatially proximate splats when budget requires compression
  let merged = valid;
  if (ratio < 1 && valid.length > 1 && mergeVoxelSize > 0) {
    const buckets = new Map();
    for (const s of valid) {
      const gx = Math.round(s.x / mergeVoxelSize);
      const gy = Math.round(s.y / mergeVoxelSize);
      const gz = Math.round(s.z / mergeVoxelSize);
      const key = `${gx}:${gy}:${gz}`;
      const acc = buckets.get(key);
      if (!acc) {
        buckets.set(key, { wx: s.x * s.opacity, wy: s.y * s.opacity, wz: s.z * s.opacity, w: s.opacity, maxOp: s.opacity, scaleSum: s.scale, n: 1 });
      } else {
        acc.wx += s.x * s.opacity;
        acc.wy += s.y * s.opacity;
        acc.wz += s.z * s.opacity;
        acc.w += s.opacity;
        acc.maxOp = Math.max(acc.maxOp, s.opacity);
        acc.scaleSum += s.scale;
        acc.n += 1;
      }
    }
    merged = [...buckets.values()].map((b) => ({
      x: Number((b.wx / b.w).toFixed(5)),
      y: Number((b.wy / b.w).toFixed(5)),
      z: Number((b.wz / b.w).toFixed(5)),
      opacity: Number(b.maxOp.toFixed(4)),
      scale: Number(((b.scaleSum / b.n) * Math.sqrt(b.n)).toFixed(5)),
    }));
  }

  // Keep highest-opacity splats up to targetCount
  merged.sort((a, b) => b.opacity - a.opacity);
  const optimized = merged.slice(0, targetCount);

  const header = [
    "ply",
    "format ascii 1.0",
    `element vertex ${optimized.length}`,
    "property float x",
    "property float y",
    "property float z",
    "property float opacity",
    "property float scale_0",
    "end_header",
  ];
  const rows = optimized.map((s) => `${s.x} ${s.y} ${s.z} ${s.opacity} ${s.scale}`);
  const plyBuffer = Buffer.from([...header, ...rows].join("\n") + "\n", "utf8");

  return {
    inputCount: splats.length,
    validCount: valid.length,
    outputCount: optimized.length,
    compressionRatio: Number((optimized.length / splats.length).toFixed(4)),
    splats: optimized,
    plyBuffer,
  };
}
