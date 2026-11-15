/** Model-agnostic 3D generation router for OCG 3D ENGINE.
 * Detects available hardware and compatible local models, validates licenses
 * and dependencies, selects the least-resource suitable model by default,
 * escalates to higher-quality models when requested, and refuses paid fallback. */
import {TRELLIS_MODELS, evaluateTrellisPreflight} from "./trellis-provider.mjs";

export function createModelRouter3d({
  customModels = [],
  allowPaid = false,
  hasLicensedLocalImageGenerator = false,
} = {}) {
  const registry = new Map();

  // Register built-in Microsoft TRELLIS.2 and TRELLIS v1 specs
  for (const [key, spec] of Object.entries(TRELLIS_MODELS)) {
    registry.set(key, {
      key,
      ...spec,
      supportsDirectTextTo3d: false,
      supportsTextToImageTo3d: true,
      qualityRank: key === "trellis-2-4b" ? 2 : 1,
      minVramGb: key === "trellis-2-4b" ? 12 : 16,
      paidProvider: false,
    });
  }

  for (const m of customModels) {
    if (m && typeof m.key === "string" && m.key.trim()) {
      registry.set(m.key.trim(), { ...m });
    }
  }

  function registerModel(spec) {
    if (!spec || typeof spec.key !== "string" || !spec.key.trim()) {
      throw new Error("model spec key required");
    }
    registry.set(spec.key.trim(), { ...spec });
  }

  function listModels() {
    return [...registry.values()].map((m) => structuredClone(m));
  }

  function selectModel({
    mode = "image_to_3d",
    qualityTier = "standard",
    requestedModelKey = null,
    environment = {},
    allowModelDownload = false,
  } = {}) {
    const candidates = requestedModelKey
      ? (registry.has(requestedModelKey) ? [registry.get(requestedModelKey)] : [])
      : [...registry.values()];

    if (candidates.length === 0) {
      return {
        selected: false,
        model: null,
        errors: [requestedModelKey ? `unknown modelKey: ${requestedModelKey}` : "no models registered"],
        rejected: [],
        costUsd: 0,
      };
    }

    const rejected = [];
    const eligible = [];

    for (const model of candidates) {
      const reasons = [];

      if (model.paidProvider === true && allowPaid !== true) {
        reasons.push("paid provider forbidden by $0 budget policy");
      }
      if (model.commercialUseAllowed !== true) {
        reasons.push(`model license not verified for commercial use (${model.weightsLicense ?? "unknown"})`);
      }

      if (mode === "text_to_3d" && model.supportsDirectTextTo3d !== true) {
        reasons.push(`${model.modelId} does not support direct text-to-3D`);
      } else if (mode === "text_to_image_to_3d") {
        if (model.supportsTextToImageTo3d !== true) {
          reasons.push(`${model.modelId} does not support text-to-image-to-3D`);
        } else if (hasLicensedLocalImageGenerator !== true) {
          reasons.push("text-to-image-to-3D requires a licensed local image generator");
        }
      } else if (
        mode === "image_to_3d" &&
        Array.isArray(model.supportedModes) &&
        !model.supportedModes.includes("image_to_3d")
      ) {
        reasons.push(`${model.modelId} does not support image_to_3d`);
      }

      // Run hardware/dependency preflight
      if (TRELLIS_MODELS[model.key]) {
        const res = qualityTier === "high" || qualityTier === "production" ? 1536 : 512;
        const pf = evaluateTrellisPreflight({
          modelKey: model.key,
          resolution: res,
          environment: { ...environment, allowModelDownload },
        });
        if (!pf.ready) {
          reasons.push(...pf.blockers);
        }
      } else {
        if (model.requiresGpu !== false && environment.hasNvidiaGpu !== true) {
          reasons.push("NVIDIA GPU required");
        }
        const vram = typeof environment.vramGb === "number" ? environment.vramGb : 0;
        if (typeof model.minVramGb === "number" && vram < model.minVramGb) {
          reasons.push(`insufficient VRAM: ${vram}GB < ${model.minVramGb}GB`);
        }
      }

      if (reasons.length > 0) {
        rejected.push({ key: model.key, modelId: model.modelId, reasons });
      } else {
        eligible.push(model);
      }
    }

    if (eligible.length === 0) {
      return {
        selected: false,
        model: null,
        errors: ["no compatible local model available for current hardware/mode/license constraints"],
        rejected,
        costUsd: 0,
      };
    }

    // Sort: standard -> lowest VRAM/cost first; high/production -> highest qualityRank first
    eligible.sort((a, b) => {
      if (qualityTier === "high" || qualityTier === "production") {
        return (b.qualityRank ?? 0) - (a.qualityRank ?? 0);
      }
      return (a.minVramGb ?? 0) - (b.minVramGb ?? 0) || (a.qualityRank ?? 0) - (b.qualityRank ?? 0);
    });

    const chosen = eligible[0];
    return {
      selected: true,
      model: structuredClone(chosen),
      rationale:
        qualityTier === "high" || qualityTier === "production"
          ? `escalated to highest-quality compatible local model (${chosen.modelId})`
          : `selected least-resource compatible local model (${chosen.modelId})`,
      rejected,
      costUsd: 0,
    };
  }

  return {
    registerModel,
    listModels,
    selectModel,
  };
}
