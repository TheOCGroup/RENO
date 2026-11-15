/** Shared model-agnostic 3D generation adapter for OCG 3D ENGINE (RENO, NOVA, OCG LAB).
 * Supports image-to-3D, optional text-to-image-to-3D (when licensed local image
 * generator is configured), magic-byte image validation, transparent-background
 * detection, background-removal hook, model routing, async job progress &
 * cancellation, GLB/PBR inspection, provenance & license metadata, and 4-tier
 * dimensional accuracy classification. */
import {randomUUID, createHash} from "node:crypto";
import {parseGlb, inspectGlbFile} from "./glb-inspector.mjs";
import {createModelRouter3d} from "./model-router-3d.mjs";

export const ASSET3D_CONSUMERS = Object.freeze(["reno", "nova", "ocg-lab"]);
export const ASSET3D_CATEGORIES = Object.freeze([
  // Interior design prioritized categories
  "sofa_sectional",
  "chair_seating",
  "dining_table",
  "bed",
  "cabinet",
  "lighting_fixture",
  "decorative_object",
  "kitchen_fixture",
  "bathroom_fixture",
  "architectural_prop",
  // General & NOVA categories
  "furniture",
  "interior_fixture",
  "room_prop",
  "character",
  "prop",
  "environment",
]);
export const ASSET3D_MODES = Object.freeze([
  "image_to_3d",
  "multi_view_to_3d",
  "text_to_3d",
  "text_to_image_to_3d",
  "mesh_cleanup",
]);
export const DIMENSION_PROVENANCE_TIERS = Object.freeze([
  "ai_estimated",
  "manufacturer_provided",
  "manually_measured",
  "independently_verified",
]);
export const ASSET3D_DISCLOSURE =
  "AI-generated 3D asset — dimensions are unverified estimates. Measured calibration or verified SKU dimensions are required before physical fit or construction claims.";

export const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const VALID_IMAGE_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const text = (x) => typeof x === "string" && x.trim().length > 0;

/** Verifies image magic bytes against declared mimeType and detects PNG alpha. */
export function inspectImageBuffer(buf, declaredMime) {
  if (!Buffer.isBuffer(buf) || buf.length < 12) {
    return { valid: false, errors: ["image buffer too small or missing"] };
  }
  if (buf.length > MAX_IMAGE_BYTES) {
    return { valid: false, errors: [`image exceeds ${MAX_IMAGE_BYTES} byte upload limit`] };
  }

  const isPng =
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
    buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a;
  const isJpeg = buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  const isWebp =
    buf.subarray(0, 4).toString("ascii") === "RIFF" &&
    buf.subarray(8, 12).toString("ascii") === "WEBP";

  if (declaredMime === "image/png" && !isPng) {
    return { valid: false, errors: ["image bytes do not match PNG signature"] };
  }
  if (declaredMime === "image/jpeg" && !isJpeg) {
    return { valid: false, errors: ["image bytes do not match JPEG signature"] };
  }
  if (declaredMime === "image/webp" && !isWebp) {
    return { valid: false, errors: ["image bytes do not match WebP signature"] };
  }
  if (!isPng && !isJpeg && !isWebp) {
    return { valid: false, errors: ["unsupported or unrecognized image signature"] };
  }

  // PNG colorType at byte 25: 4 (grayscale+alpha) or 6 (RGBA) indicates alpha channel
  let hasAlphaChannel = false;
  if (isPng && buf.length >= 26) {
    const colorType = buf[25];
    hasAlphaChannel = colorType === 4 || colorType === 6;
  }

  return {
    valid: true,
    errors: [],
    byteLength: buf.length,
    detectedFormat: isPng ? "png" : isJpeg ? "jpeg" : "webp",
    hasAlphaChannel,
    transparentBackgroundReady: hasAlphaChannel,
  };
}

export function classifyDimensionProvenance(tier) {
  if (!DIMENSION_PROVENANCE_TIERS.includes(tier)) {
    return { valid: false, tier: "ai_estimated", verified: false };
  }
  return {
    valid: true,
    tier,
    verified: tier === "independently_verified",
  };
}

export function createAsset3dAdapter({
  enabled = false,
  founderApproved = false,
  localOnly = true,
  allowPaidApi = false,
  allowModelDownload = false,
  environment = {},
  modelRouter = null,
  modelKey = null,
  qualityTier = "standard",
  resolution = 1024,
  provider = null,
  backgroundRemover = null,
  imageGenerator = null,
  now = () => new Date().toISOString(),
} = {}) {
  const jobs = new Map();
  const router =
    modelRouter ??
    createModelRouter3d({
      allowPaid: false,
      hasLicensedLocalImageGenerator: typeof imageGenerator === "function",
    });
  const active = enabled === true && founderApproved === true && typeof provider === "function";

  function status() {
    const selection = router.selectModel({
      mode: "image_to_3d",
      qualityTier,
      requestedModelKey: modelKey,
      environment,
      allowModelDownload,
    });
    return {
      enabled: active,
      flagEnabled: enabled === true,
      founderApproved: founderApproved === true,
      localOnly: localOnly === true,
      allowPaidApi: allowPaidApi === true,
      allowModelDownload: allowModelDownload === true,
      providerConfigured: typeof provider === "function",
      backgroundRemoverConfigured: typeof backgroundRemover === "function",
      imageGeneratorConfigured: typeof imageGenerator === "function",
      providerName: active ? provider.name || "injected-local" : null,
      modelKey: selection.selected ? selection.model.key : modelKey,
      preflight: {
        ready: selection.selected,
        blockers: selection.selected ? [] : selection.errors,
        rejected: selection.rejected,
      },
    };
  }

  function validateRequest(req) {
    const errors = [];
    if (!req || typeof req !== "object") return ["request object required"];
    if (!text(req.tenantId)) errors.push("tenantId required");
    if (!ASSET3D_CONSUMERS.includes(req.consumer)) {
      errors.push(`consumer must be one of: ${ASSET3D_CONSUMERS.join(", ")}`);
    }
    if (!ASSET3D_CATEGORIES.includes(req.category)) {
      errors.push(`category must be one of: ${ASSET3D_CATEGORIES.join(", ")}`);
    }
    const mode = req.mode ?? "image_to_3d";
    if (!ASSET3D_MODES.includes(mode)) {
      errors.push(`mode must be one of: ${ASSET3D_MODES.join(", ")}`);
    }
    if (localOnly === true && req.allowExternalTransfer === true) {
      errors.push("external data transfer forbidden in localOnly mode");
    }
    if (allowPaidApi !== true && req.usePaidApi === true) {
      errors.push("paid 3D APIs disabled by policy");
    }
    if (mode === "image_to_3d") {
      if (!VALID_IMAGE_MIME.has(req.mimeType)) {
        errors.push("valid image mimeType required (jpeg/png/webp)");
      }
      if (!text(req.imageBase64) && !text(req.localImagePath)) {
        errors.push("imageBase64 or localImagePath required");
      }
      if (text(req.localImagePath)) {
        const p = req.localImagePath.trim();
        if (/^https?:\/\//i.test(p)) errors.push("remote HTTP URLs not permitted for localImagePath");
        if (p.includes("..")) errors.push("path traversal not permitted in localImagePath");
      }
      if (text(req.imageBase64) && VALID_IMAGE_MIME.has(req.mimeType)) {
        const raw = Buffer.from(req.imageBase64, "base64");
        const imgCheck = inspectImageBuffer(raw, req.mimeType);
        if (!imgCheck.valid) errors.push(...imgCheck.errors);
      }
    } else if (mode === "text_to_3d" || mode === "text_to_image_to_3d") {
      if (!text(req.prompt) || req.prompt.trim().length < 4) {
        errors.push("text prompt (min 4 chars) required");
      }
    }
    return errors;
  }

  function submitJob(req) {
    const errors = validateRequest(req);
    if (errors.length) {
      return { accepted: false, errors };
    }
    const mode = req.mode ?? "image_to_3d";
    const jobId = `asset3d_${randomUUID()}`;
    const createdAt = now();
    let imageMeta = null;
    if (mode === "image_to_3d" && text(req.imageBase64)) {
      imageMeta = inspectImageBuffer(Buffer.from(req.imageBase64, "base64"), req.mimeType);
    }
    const job = {
      jobId,
      tenantId: req.tenantId.trim(),
      consumer: req.consumer,
      category: req.category,
      mode,
      prompt: text(req.prompt) ? req.prompt.trim() : null,
      qualityTier: req.qualityTier ?? qualityTier,
      requestedModelKey: req.modelKey ?? modelKey,
      propertyId: text(req.propertyId) ? req.propertyId.trim() : null,
      roomId: text(req.roomId) ? req.roomId.trim() : null,
      assetName: text(req.assetName) ? req.assetName.trim() : jobId,
      imageMeta,
      status: "queued",
      stage: "queued",
      progressPercent: 0,
      createdAt,
      updatedAt: createdAt,
      completedAt: null,
      executionTimeMs: null,
      errors: [],
      result: null,
      _inputPayload: {
        mimeType: req.mimeType ?? null,
        imageBase64: req.imageBase64 ?? null,
        removeBackground: req.removeBackground === true,
      },
    };
    jobs.set(jobId, job);
    return { accepted: true, job: sanitizeJob(job) };
  }

  function sanitizeJob(job) {
    const clone = structuredClone(job);
    delete clone._inputPayload;
    return clone;
  }

  async function processJob(jobId, { tenantId } = {}) {
    const job = jobs.get(jobId);
    if (!job || (text(tenantId) && job.tenantId !== tenantId)) {
      return { ok: false, errors: ["job not found"] };
    }
    if (job.status === "cancelled") {
      return { ok: false, errors: ["job was cancelled"] };
    }
    if (job.status === "completed") {
      return { ok: true, job: sanitizeJob(job) };
    }

    const startMs = Date.now();
    job.status = "preflight";
    job.stage = "preflight";
    job.progressPercent = 10;
    job.updatedAt = now();

    if (!active) {
      job.status = "blocked";
      job.stage = "blocked";
      job.errors = [
        "3D generation disabled (feature flag, founder approval, and local provider are all required)",
      ];
      job.updatedAt = now();
      return { ok: false, errors: job.errors, job: sanitizeJob(job) };
    }

    const selection = router.selectModel({
      mode: job.mode,
      qualityTier: job.qualityTier,
      requestedModelKey: job.requestedModelKey,
      environment,
      allowModelDownload,
    });
    if (!selection.selected) {
      job.status = "blocked";
      job.stage = "blocked";
      job.errors = selection.rejected.flatMap((r) => r.reasons);
      if (job.errors.length === 0) job.errors = selection.errors;
      job.updatedAt = now();
      return { ok: false, errors: job.errors, job: sanitizeJob(job) };
    }

    try {
      let workingImageBase64 = job._inputPayload.imageBase64;
      let backgroundRemoved = false;

      if (job.mode === "text_to_image_to_3d") {
        job.stage = "text_to_image";
        job.progressPercent = 25;
        job.updatedAt = now();
        if (typeof imageGenerator !== "function") {
          throw new Error("licensed local image generator not configured");
        }
        const imgOut = await imageGenerator({ prompt: job.prompt, category: job.category });
        if (!imgOut || !text(imgOut.imageBase64)) {
          throw new Error("image generator returned no image");
        }
        workingImageBase64 = imgOut.imageBase64;
      }

      if (job._inputPayload.removeBackground && typeof backgroundRemover === "function" && workingImageBase64) {
        job.stage = "preprocessing";
        job.progressPercent = 35;
        job.updatedAt = now();
        const bgOut = await backgroundRemover({ imageBase64: workingImageBase64 });
        if (bgOut && text(bgOut.imageBase64)) {
          workingImageBase64 = bgOut.imageBase64;
          backgroundRemoved = true;
        }
      }

      job.status = "running";
      job.stage = "generating";
      job.progressPercent = 50;
      job.updatedAt = now();

      const out = await provider({
        jobId: job.jobId,
        tenantId: job.tenantId,
        consumer: job.consumer,
        category: job.category,
        mode: job.mode,
        prompt: job.prompt,
        assetName: job.assetName,
        modelKey: selection.model.key,
        modelId: selection.model.modelId,
        resolution,
        imageBase64: workingImageBase64,
      });

      if (!out || !Buffer.isBuffer(out.glbBuffer)) {
        job.status = "failed";
        job.stage = "failed";
        job.errors = ["provider did not return a binary GLB buffer"];
        job.executionTimeMs = Date.now() - startMs;
        job.updatedAt = now();
        return { ok: false, errors: job.errors, job: sanitizeJob(job) };
      }

      job.stage = "inspecting";
      job.progressPercent = 85;
      job.updatedAt = now();

      const glbCheck = inspectGlbFile(out.glbBuffer);
      if (!glbCheck.passed) {
        job.status = "failed";
        job.stage = "failed";
        job.errors = glbCheck.errors;
        job.executionTimeMs = Date.now() - startMs;
        job.updatedAt = now();
        return { ok: false, errors: job.errors, job: sanitizeJob(job) };
      }

      const parsed = parseGlb(out.glbBuffer);
      const glbDigest = "sha256:" + createHash("sha256").update(out.glbBuffer).digest("hex");
      const provenanceTier = classifyDimensionProvenance("ai_estimated");

      job.status = "completed";
      job.stage = "completed";
      job.progressPercent = 100;
      job.completedAt = now();
      job.updatedAt = job.completedAt;
      job.executionTimeMs = Date.now() - startMs;
      job._inputPayload.imageBase64 = null; // release input bytes after completion

      job.result = {
        glbBuffer: out.glbBuffer,
        glbDigest,
        glbByteLength: out.glbBuffer.length,
        inspection: glbCheck.inspection,
        estimatedDimensionsMeters: parsed.boundingBoxMeters
          ? {
              width: parsed.boundingBoxMeters.width,
              depth: parsed.boundingBoxMeters.depth,
              height: parsed.boundingBoxMeters.height,
            }
          : null,
        dimensionProvenance: provenanceTier.tier,
        dimensionsSource: provenanceTier.tier,
        dimensionsVerified: provenanceTier.verified,
        accuracyClaimAuthorized: false,
        disclosure: ASSET3D_DISCLOSURE,
        preprocessing: {
          backgroundRemoved,
          transparentBackgroundInput: job.imageMeta?.transparentBackgroundReady ?? false,
        },
        resourceUsage: out.resourceUsage ?? { vramPeakGb: null, ramPeakMb: null },
        provenance: {
          modelKey: selection.model.key,
          modelId: out.modelId ?? selection.model.modelId,
          modelVersion: out.modelVersion ?? selection.model.key,
          selectionRationale: selection.rationale,
          codeLicense: out.codeLicense ?? selection.model.codeLicense,
          weightsLicense: out.weightsLicense ?? selection.model.weightsLicense,
          commercialUseAllowed: out.commercialUseAllowed ?? selection.model.commercialUseAllowed,
          executionMode: localOnly ? "local_gpu" : "custom",
          costUsd: 0,
          generatedAt: job.completedAt,
        },
      };
      return { ok: true, job: sanitizeJob(job) };
    } catch (err) {
      job.status = "failed";
      job.stage = "failed";
      job.errors = [err?.message ? `3D generation failed: ${err.message}` : "3D generation provider execution failed"];
      job.executionTimeMs = Date.now() - startMs;
      job._inputPayload.imageBase64 = null;
      job.updatedAt = now();
      return { ok: false, errors: job.errors, job: sanitizeJob(job) };
    }
  }

  function getJob(jobId, { tenantId } = {}) {
    if (!text(tenantId)) return null;
    const job = jobs.get(jobId);
    if (!job || job.tenantId !== tenantId) return null;
    return sanitizeJob(job);
  }

  function listJobs({ tenantId, category = null } = {}) {
    if (!text(tenantId)) return [];
    const out = [];
    for (const job of jobs.values()) {
      if (job.tenantId !== tenantId) continue;
      if (category && job.category !== category) continue;
      out.push(sanitizeJob(job));
    }
    return out;
  }

  function cancelJob(jobId, { tenantId } = {}) {
    if (!text(tenantId)) return { ok: false, errors: ["tenantId required"] };
    const job = jobs.get(jobId);
    if (!job || job.tenantId !== tenantId) return { ok: false, errors: ["job not found"] };
    if (job.status === "completed" || job.status === "failed") {
      return { ok: false, errors: [`cannot cancel job in status ${job.status}`] };
    }
    job.status = "cancelled";
    job.stage = "cancelled";
    job._inputPayload.imageBase64 = null;
    job.updatedAt = now();
    return { ok: true, job: sanitizeJob(job) };
  }

  return {
    status,
    submitJob,
    processJob,
    getJob,
    listJobs,
    cancelJob,
  };
}
