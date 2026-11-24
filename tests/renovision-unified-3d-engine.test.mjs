import test from "node:test";
import assert from "node:assert/strict";
import {
  N_CUBE,
  N_SOBOL,
  QUALITY_PROFILES,
  buildAdaptiveTokenLayout,
  computeOctreeSalienceScores,
  optimizeGaussianSplats,
  scheduleInferenceJob,
  snapRealizableTokens,
  wienerHighFrequencyGain,
} from "../lib/renovision/ocg-adaptive-inference.mjs";
import {
  create4dCameraTrajectory,
  createMotionSmartPrimitive,
  createUnified3dEngine,
  createWorldSceneGraph,
  computeRealityComposite,
  retargetMotionClip,
} from "../lib/renovision/ocg-unified-engine.mjs";
import { runBudget3dBenchmark } from "../scripts/benchmark_budget3d.mjs";

test("Budget3D-inspired Adaptive Token Engine hits exact realizable token budgets and preserves high-variance regions", () => {
  assert.equal(snapRealizableTokens(515), 512);
  assert.equal(snapRealizableTokens(517), 519);

  const latents = new Float64Array(N_SOBOL);
  for (let i = 0; i < N_SOBOL; i++) {
    // Concentrate high variance in first 1024 points (64 cubes)
    latents[i] = i < 1024 ? (i % 2 === 0 ? 1.5 : -1.5) : 0.01 * (i % 3);
  }
  const { score4, score2 } = computeOctreeSalienceScores(latents);

  for (const id of Object.keys(QUALITY_PROFILES)) {
    const target = QUALITY_PROFILES[id].targetTokens;
    const layout = buildAdaptiveTokenLayout(score4, score2, target);
    assert.equal(layout.realizedTokens, layout.n4 + layout.n2 + layout.n1);
    assert.equal(layout.realizedTokens, snapRealizableTokens(target));
    assert.ok(layout.highDetailRetentionRatio >= 0.99 || target === N_CUBE);
  }

  assert.ok(wienerHighFrequencyGain(0.5) > 1.0);
});

test("Gaussian Splat Optimizer culls NaN/low-opacity splats, merges proximate voxels, and emits valid ASCII PLY", () => {
  const splats = [
    { x: 0, y: 0, z: 0, opacity: 0.9, scale: 0.02 },
    { x: 0.001, y: 0, z: 0, opacity: 0.8, scale: 0.02 },
    { x: 0.5, y: 0.5, z: 0.5, opacity: 0.01, scale: 0.02 }, // culled (< 0.05)
    { x: Number.NaN, y: 0, z: 0, opacity: 0.9, scale: 0.02 }, // culled (NaN)
    { x: 1.0, y: 0.2, z: -0.4, opacity: 0.7, scale: 0.03 },
  ];
  const res = optimizeGaussianSplats(splats, { keepRatio: 0.5, minOpacity: 0.05, mergeVoxelSize: 0.02 });
  assert.equal(res.validCount, 3);
  assert.ok(res.outputCount <= 2);
  const ply = res.plyBuffer.toString("utf8");
  assert.ok(ply.startsWith("ply\nformat ascii 1.0\n"));
  assert.ok(ply.includes(`element vertex ${res.outputCount}`));
});

test("Compute-Aware Scheduler enforces $0 budget, commercial licenses, and GPU preflight", () => {
  const blockedNoGpu = scheduleInferenceJob({
    qualityProfile: "draft",
    environment: { os: "linux", hasNvidiaGpu: false },
  });
  assert.equal(blockedNoGpu.scheduled, false);

  const blockedLicense = scheduleInferenceJob({
    qualityProfile: "balanced",
    backgroundRemover: "briaai/RMBG-2.0",
    environment: {
      os: "linux", hasNvidiaGpu: true, vramGb: 24, freeDiskGb: 60,
      cudaVersion: "12.4", pythonVersion: "3.10", helperLicensesAccepted: true, cachedModelKeys: ["trellis-2-4b"], weightsCachedLocally: true,
    },
  });
  assert.equal(blockedLicense.scheduled, false);
  assert.equal(blockedLicense.licenseCheck.cleared, false);

  const ok = scheduleInferenceJob({
    qualityProfile: "balanced",
    backgroundRemover: "u2net",
    dinov3AttributionPresent: true,
    environment: {
      os: "linux", hasNvidiaGpu: true, vramGb: 24, freeDiskGb: 60,
      cudaVersion: "12.4", pythonVersion: "3.10", helperLicensesAccepted: true, cachedModelKeys: ["trellis-2-4b"], weightsCachedLocally: true,
    },
  });
  assert.equal(ok.scheduled, true);
  assert.equal(ok.costUsd, 0);
});

test("Unified 6-Subsystem Engine: World, Reality AR, 4D Camera, and Motion Intelligence Smart Primitives", () => {
  const engine = createUnified3dEngine();
  assert.ok(engine.subsystems.geometry);
  assert.ok(engine.subsystems.adaptiveInference);

  // World Intelligence
  const world = createWorldSceneGraph({ sceneId: "living-room-01" });
  assert.equal(world.addNode({ nodeId: "sofa", positionMeters: [0, 0, 0] }).placed, true);
  assert.equal(world.addNode({ nodeId: "oob", positionMeters: [99, 0, 0] }).placed, false);
  const nav = world.planNavigationPath([0, 0, 0], [2, 0, 1], 4);
  assert.equal(nav.waypointCount, 5);

  // Reality Engine (Simulon-style AR placement)
  const ar = computeRealityComposite({
    assetBoundsMeters: { width: 1, height: 0.8, depth: 1 },
    dimensionsVerified: false,
  });
  assert.equal(ar.placementPositionMeters[1], 0.4);
  assert.equal(ar.calibrationRequired, true);

  // 4D Engine (Reshoot-4D-style virtual camera trajectory)
  const traj = create4dCameraTrajectory({
    keyframes: [
      { position: [0, 1.5, 4], lookAt: [0, 0.5, 0], fovDeg: 45 },
      { position: [3, 1.8, 2], lookAt: [0, 0.5, 0], fovDeg: 35 },
    ],
    durationSec: 1,
    fps: 10,
  });
  assert.equal(traj.totalFrames, 10);
  assert.equal(traj.frames[9].fovDeg, 35);

  // Motion Intelligence (MotionBricks-style Smart Primitives & retargeting)
  const walk = createMotionSmartPrimitive({ primitive: "walk_cycle", durationSec: 1, fps: 10 });
  assert.equal(walk.frameCount, 10);
  const retargeted = retargetMotionClip({ clip: walk, targetJoints: ["root", "pelvis", "custom_joint"] });
  assert.equal(retargeted.mappedJoints, 2);
  assert.deepEqual(retargeted.frames[0].pose.custom_joint, { rx: 0, ry: 0, rz: 0 });
});

test("Budget3D benchmark harness runs deterministically across all 4 profiles and marks GPU BLOCKED", () => {
  const report = runBudget3dBenchmark({ seed: 42 });
  assert.equal(report.profiles.length, 4);
  assert.match(report.gpuStatus, /BLOCKED/);
  for (const p of report.profiles) {
    assert.equal(p.glbValid, true);
    assert.ok(p.timingsMs.totalCpuMs >= 0);
  }
});
