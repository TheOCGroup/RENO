/** Reproducible Budget3D & Unified 3D Engine Benchmark Harness ($0 CPU mode).
 * Measures real CPU adaptive tokenization, splat optimization, GLB inspection,
 * and 5-format export across draft / balanced / high / maximum profiles with a
 * deterministic seed. Explicitly marks live GPU inference as BLOCKED when absent. */

import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import {
  N_SOBOL,
  QUALITY_PROFILES,
  buildAdaptiveTokenLayout,
  computeOctreeSalienceScores,
  optimizeGaussianSplats,
  wienerHighFrequencyGain,
} from "../lib/renovision/ocg-adaptive-inference.mjs";
import { inspectGlbFile, convertGlbToFormat } from "../lib/renovision/glb-inspector.mjs";

function seededRandom(seed = 42) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

export function runBudget3dBenchmark({ seed = 42 } = {}) {
  const rand = seededRandom(seed);
  // Deterministic 8192-point latent field with localized high-variance detail regions
  const latents = new Float64Array(N_SOBOL);
  for (let i = 0; i < N_SOBOL; i++) {
    const isDetailRegion = (i >= 1024 && i < 2048) || (i >= 5120 && i < 5632);
    latents[i] = (rand() - 0.5) * (isDetailRegion ? 2.4 : 0.08);
  }

  // Deterministic 4096-splat Gaussian cloud
  const splats = Array.from({ length: 4096 }, (_, i) => ({
    x: Number(((rand() - 0.5) * 2).toFixed(4)),
    y: Number(((rand() - 0.5) * 2).toFixed(4)),
    z: Number(((rand() - 0.5) * 2).toFixed(4)),
    opacity: i % 10 === 0 ? 0.02 : Number((0.15 + rand() * 0.85).toFixed(4)),
    scale: Number((0.008 + rand() * 0.03).toFixed(4)),
  }));

  const sampleGlb = fs.readFileSync(path.resolve("assets/samples/sofa-sectional.glb"));
  const results = [];

  for (const profileId of ["draft", "balanced", "high", "maximum"]) {
    const profile = QUALITY_PROFILES[profileId];

    const tTok0 = performance.now();
    const { score4, score2 } = computeOctreeSalienceScores(latents);
    const layout = buildAdaptiveTokenLayout(score4, score2, profile.targetTokens);
    const tokenMs = +(performance.now() - tTok0).toFixed(3);

    const tSplat0 = performance.now();
    const splatOut = optimizeGaussianSplats(splats, { keepRatio: profile.splatKeepRatio });
    const splatMs = +(performance.now() - tSplat0).toFixed(3);

    const tExp0 = performance.now();
    const inspected = inspectGlbFile(sampleGlb);
    const exportBytes = {};
    for (const fmt of ["glb", "gltf", "obj", "stl", "ply"]) {
      exportBytes[fmt] = convertGlbToFormat(sampleGlb, fmt).buffer.length;
    }
    const exportMs = +(performance.now() - tExp0).toFixed(3);

    results.push({
      profile: profileId,
      targetTokens: profile.targetTokens,
      realizedTokens: layout.realizedTokens,
      tokenCompressionRatio: +(layout.realizedTokens / N_SOBOL).toFixed(4),
      highDetailRetentionRatio: layout.highDetailRetentionRatio,
      wienerGainAtMidT: +wienerHighFrequencyGain(0.5).toFixed(4),
      splatInputCount: splatOut.inputCount,
      splatOutputCount: splatOut.outputCount,
      splatPlyBytes: splatOut.plyBuffer.length,
      glbValid: inspected.passed,
      exportBytes,
      timingsMs: { tokenMs, splatMs, exportMs, totalCpuMs: +(tokenMs + splatMs + exportMs).toFixed(3) },
    });
  }

  const mem = process.memoryUsage();
  return {
    seed,
    gpuStatus: "BLOCKED (no NVIDIA GPU on host; CPU optimization & export pipeline measured only)",
    rssMb: +(mem.rss / 1048576).toFixed(2),
    heapUsedMb: +(mem.heapUsed / 1048576).toFixed(2),
    profiles: results,
  };
}

const isCli = process.argv[1] && import.meta.url.endsWith(process.argv[1].replaceAll("\\", "/").split("/").pop());
if (isCli) {
  console.log(JSON.stringify(runBudget3dBenchmark({ seed: 42 }), null, 2));
}
