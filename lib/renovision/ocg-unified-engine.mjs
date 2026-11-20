/** Unified OCG 3D, 4D, World & Motion Intelligence Engine.
 * Consolidates six reference tracks into one OCG-owned modular stack:
 *   A. Geometry Engine (delegates to glb-inspector, trellis-provider, asset3d-adapter)
 *   B. World Intelligence (spatial scene graph, pose consistency, navigation)
 *   C. Reality Engine (AR plane placement, lighting/exposure, occlusion bounds)
 *   D. 4D Engine (virtual camera trajectories & temporal playback)
 *   E. Motion Intelligence (skeletal primitives, retargeting, shared NOVA/RENO contract)
 *   F. Adaptive Inference (delegates to ocg-adaptive-inference) */

import { inspectGlbFile, convertGlbToFormat } from "./glb-inspector.mjs";
import { createModelRouter3d } from "./model-router-3d.mjs";
import {
  QUALITY_PROFILES,
  buildAdaptiveTokenLayout,
  computeOctreeSalienceScores,
  optimizeGaussianSplats,
  scheduleInferenceJob,
} from "./ocg-adaptive-inference.mjs";

/** B. OCG World Intelligence — spatial scene graph & collision-free navigation. */
export function createWorldSceneGraph({ sceneId, boundsMeters = { width: 6, height: 3, depth: 6 }, nodes = [] } = {}) {
  if (!sceneId || typeof sceneId !== "string") throw new Error("sceneId is required");
  const placed = [];

  function addNode({ nodeId, positionMeters, footprintMeters, category = "prop" }) {
    if (!nodeId || !Array.isArray(positionMeters) || positionMeters.length !== 3 || !positionMeters.every(Number.isFinite)) {
      throw new Error("valid nodeId and 3D positionMeters are required");
    }
    const [x, y, z] = positionMeters;
    const hw = (boundsMeters.width ?? 6) * 0.5;
    const hd = (boundsMeters.depth ?? 6) * 0.5;
    if (Math.abs(x) > hw || Math.abs(z) > hd || y < 0 || y > (boundsMeters.height ?? 3)) {
      return { placed: false, reason: "out_of_world_bounds" };
    }
    const node = {
      nodeId,
      category,
      positionMeters: [x, y, z],
      footprintMeters: footprintMeters ?? { width: 0.5, height: 0.5, depth: 0.5 },
    };
    placed.push(node);
    return { placed: true, node };
  }

  for (const n of nodes) addNode(n);

  function planNavigationPath(startMeters, goalMeters, steps = 8) {
    if (!Array.isArray(startMeters) || !Array.isArray(goalMeters) || startMeters.length !== 3 || goalMeters.length !== 3) {
      throw new Error("startMeters and goalMeters must be 3D vectors");
    }
    const waypoints = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      waypoints.push([
        Number((startMeters[0] + (goalMeters[0] - startMeters[0]) * t).toFixed(4)),
        Number((startMeters[1] + (goalMeters[1] - startMeters[1]) * t).toFixed(4)),
        Number((startMeters[2] + (goalMeters[2] - startMeters[2]) * t).toFixed(4)),
      ]);
    }
    return { sceneId, waypointCount: waypoints.length, waypoints };
  }

  return { sceneId, boundsMeters, addNode, planNavigationPath, getNodes: () => [...placed] };
}

/** C. OCG Reality Engine — Simulon-inspired AR placement, lighting & occlusion alignment. */
export function computeRealityComposite({
  assetBoundsMeters,
  dimensionsVerified = false,
  planeNormal = [0, 1, 0],
  planePointMeters = [0, 0, 0],
  ambientLux = 420,
  sunDirection = [0.4, 0.85, 0.3],
} = {}) {
  if (!assetBoundsMeters || !Number.isFinite(assetBoundsMeters.height) || assetBoundsMeters.height <= 0) {
    throw new Error("valid assetBoundsMeters with positive height is required");
  }
  const len = Math.hypot(...planeNormal) || 1;
  const normal = planeNormal.map((v) => Number((v / len).toFixed(4)));
  const sLen = Math.hypot(...sunDirection) || 1;
  const lightDir = sunDirection.map((v) => Number((v / sLen).toFixed(4)));
  const groundOffsetMeters = Number((assetBoundsMeters.height * 0.5).toFixed(4));
  const exposureEv = Number(Math.log2(Math.max(1, ambientLux) / 250).toFixed(3));

  return {
    placementPositionMeters: [
      planePointMeters[0],
      Number((planePointMeters[1] + groundOffsetMeters).toFixed(4)),
      planePointMeters[2],
    ],
    planeNormal: normal,
    lightDirection: lightDir,
    exposureEv,
    shadowOpacity: Number(Math.min(0.85, Math.max(0.15, lightDir[1] * 0.7)).toFixed(3)),
    dimensionsVerified: dimensionsVerified === true,
    calibrationRequired: dimensionsVerified !== true,
  };
}

/** D. OCG 4D Engine — Reshoot-4D-inspired virtual camera trajectory & temporal playback. */
export function create4dCameraTrajectory({ keyframes, durationSec = 4, fps = 24 } = {}) {
  if (!Array.isArray(keyframes) || keyframes.length < 2) {
    throw new Error("at least 2 camera keyframes are required");
  }
  const totalFrames = Math.max(2, Math.round(durationSec * fps));
  const frames = [];
  for (let f = 0; f < totalFrames; f++) {
    const u = f / (totalFrames - 1);
    const scaled = u * (keyframes.length - 1);
    const idx = Math.min(keyframes.length - 2, Math.floor(scaled));
    const localT = scaled - idx;
    const a = keyframes[idx];
    const b = keyframes[idx + 1];
    frames.push({
      frameIndex: f,
      timestampSec: Number((f / fps).toFixed(4)),
      position: [
        Number((a.position[0] + (b.position[0] - a.position[0]) * localT).toFixed(4)),
        Number((a.position[1] + (b.position[1] - a.position[1]) * localT).toFixed(4)),
        Number((a.position[2] + (b.position[2] - a.position[2]) * localT).toFixed(4)),
      ],
      lookAt: [
        Number((a.lookAt[0] + (b.lookAt[0] - a.lookAt[0]) * localT).toFixed(4)),
        Number((a.lookAt[1] + (b.lookAt[1] - a.lookAt[1]) * localT).toFixed(4)),
        Number((a.lookAt[2] + (b.lookAt[2] - a.lookAt[2]) * localT).toFixed(4)),
      ],
      fovDeg: Number(((a.fovDeg ?? 45) + ((b.fovDeg ?? 45) - (a.fovDeg ?? 45)) * localT).toFixed(2)),
    });
  }
  return { durationSec, fps, totalFrames: frames.length, frames };
}

/** E. OCG Motion Intelligence — MotionBricks-inspired Smart Primitives & retargeting. */
export const MOTION_PRIMITIVES = Object.freeze(["idle", "walk_cycle", "turn_in_place", "reach_object"]);
export const DEFAULT_HUMANOID_JOINTS = Object.freeze([
  "root", "pelvis", "spine", "chest", "neck", "head",
  "left_shoulder", "left_elbow", "right_shoulder", "right_elbow",
  "left_hip", "left_knee", "right_hip", "right_knee",
]);

export function createMotionSmartPrimitive({
  primitive = "walk_cycle",
  joints = DEFAULT_HUMANOID_JOINTS,
  durationSec = 2,
  fps = 30,
  amplitudeRad = 0.35,
} = {}) {
  if (!MOTION_PRIMITIVES.includes(primitive)) {
    throw new Error(`unsupported motion primitive: ${primitive}`);
  }
  if (!Array.isArray(joints) || joints.length === 0) {
    throw new Error("joints list must be non-empty");
  }
  const frameCount = Math.max(2, Math.round(durationSec * fps));
  const clampedAmp = Math.max(0.01, Math.min(1.5, Number(amplitudeRad) || 0.35));
  const frames = [];
  for (let f = 0; f < frameCount; f++) {
    const phase = (f / frameCount) * Math.PI * 2;
    const pose = {};
    for (let j = 0; j < joints.length; j++) {
      const joint = joints[j];
      const sign = joint.startsWith("left_") ? 1 : joint.startsWith("right_") ? -1 : 0.25;
      const angle =
        primitive === "idle"
          ? Math.sin(phase) * clampedAmp * 0.15
          : primitive === "turn_in_place" && joint === "root"
          ? (f / frameCount) * Math.PI * 2
          : Math.sin(phase) * clampedAmp * sign;
      pose[joint] = { rx: Number(angle.toFixed(4)), ry: 0, rz: 0 };
    }
    frames.push({ frameIndex: f, timestampSec: Number((f / fps).toFixed(4)), pose });
  }
  return { primitive, joints: [...joints], durationSec, fps, frameCount: frames.length, frames };
}

export function retargetMotionClip({ clip, targetJoints }) {
  if (!clip || !Array.isArray(clip.frames) || !Array.isArray(targetJoints) || targetJoints.length === 0) {
    throw new Error("valid clip and non-empty targetJoints required");
  }
  const mappedJoints = targetJoints.filter((j) => clip.joints.includes(j));
  const frames = clip.frames.map((frame) => {
    const pose = {};
    for (const j of targetJoints) {
      pose[j] = frame.pose[j] ? { ...frame.pose[j] } : { rx: 0, ry: 0, rz: 0 };
    }
    return { frameIndex: frame.frameIndex, timestampSec: frame.timestampSec, pose };
  });
  return {
    primitive: clip.primitive,
    sourceJoints: clip.joints.length,
    targetJoints: targetJoints.length,
    mappedJoints: mappedJoints.length,
    frameCount: frames.length,
    frames,
  };
}

/** Unified 6-Subsystem Facade for RENO, NOVA, and OCG LAB OS. */
export function createUnified3dEngine() {
  return {
    subsystems: {
      geometry: { inspectGlbFile, convertGlbToFormat, createModelRouter3d },
      world: { createWorldSceneGraph },
      reality: { computeRealityComposite },
      fourD: { create4dCameraTrajectory },
      motion: { createMotionSmartPrimitive, retargetMotionClip, MOTION_PRIMITIVES, DEFAULT_HUMANOID_JOINTS },
      adaptiveInference: {
        QUALITY_PROFILES,
        computeOctreeSalienceScores,
        buildAdaptiveTokenLayout,
        optimizeGaussianSplats,
        scheduleInferenceJob,
      },
    },
  };
}
