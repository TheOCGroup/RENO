/** Shared model-agnostic 3D generation adapter for OCG LAB, RENO, and NOVA.
 * Supports image-to-3D (and multi-view/mesh-cleanup contracts), asynchronous job
 * status tracking, GLB/PBR mesh inspection, provenance & license metadata,
 * local-only execution, and conservative dimensional disclosures.
 * Paid APIs and model downloads remain disabled unless explicitly approved. */
import {randomUUID, createHash} from "node:crypto";
import {parseGlb, inspectGlbFile} from "./glb-inspector.mjs";
import {evaluateTrellisPreflight} from "./trellis-provider.mjs";

export const ASSET3D_CONSUMERS = Object.freeze(["reno", "nova", "ocg-lab"]);
export const ASSET3D_CATEGORIES = Object.freeze([
  "furniture",
  "interior_fixture",
  "room_prop",
  "character",
  "prop",
  "environment",
]);
export const ASSET3D_MODES = Object.freeze(["image_to_3d", "multi_view_to_3d", "mesh_cleanup"]);
export const ASSET3D_DISCLOSURE =
  "AI-generated 3D asset — dimensions are unverified estimates. Measured calibration or verified SKU dimensions are required before physical fit or construction claims.";

const VALID_IMAGE_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const text = (x) => typeof x === "string" && x.trim().length > 0;

export function createAsset3dAdapter({
  enabled = false,
  founderApproved = false,
  localOnly = true,
  allowPaidApi = false,
  allowModelDownload = false,
  environment = {},
  modelKey = "trellis-2-4b",
  resolution = 1024,
  provider = null,
  now = () => new Date().toISOString(),
} = {}) {
  const jobs = new Map();
  const active = enabled === true && founderApproved === true && typeof provider === "function";

  function status() {
    const preflight = evaluateTrellisPreflight({
      modelKey,
      resolution,
      environment: { ...environment, allowModelDownload },
    });
    return {
      enabled: active,
      flagEnabled: enabled === true,
      founderApproved: founderApproved === true,
      localOnly: localOnly === true,
      allowPaidApi: allowPaidApi === true,
      allowModelDownload: allowModelDownload === true,
      providerConfigured: typeof provider === "function",
      providerName: active ? provider.name || "injected-local" : null,
      modelKey,
      preflight,
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
      if (!VALID_IMAGE_MIME.has(req.mimeType)) errors.push("valid image mimeType required (jpeg/png/webp)");
      if (!text(req.imageBase64) && !text(req.localImagePath)) {
        errors.push("imageBase64 or localImagePath required");
      }
      if (text(req.localImagePath) && /^https?:\/\//i.test(req.localImagePath.trim())) {
        errors.push("remote HTTP URLs not permitted for localImagePath");
      }
    }
    return errors;
  }

  function submitJob(req) {
    const errors = validateRequest(req);
    if (errors.length) {
      return { accepted: false, errors };
    }
    const jobId = `asset3d_${randomUUID()}`;
    const createdAt = now();
    const job = {
      jobId,
      tenantId: req.tenantId.trim(),
      consumer: req.consumer,
      category: req.category,
      mode: req.mode ?? "image_to_3d",
      propertyId: text(req.propertyId) ? req.propertyId.trim() : null,
      roomId: text(req.roomId) ? req.roomId.trim() : null,
      assetName: text(req.assetName) ? req.assetName.trim() : jobId,
      status: "queued",
      createdAt,
      updatedAt: createdAt,
      completedAt: null,
      errors: [],
      result: null,
    };
    jobs.set(jobId, job);
    return { accepted: true, job: structuredClone(job) };
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
      return { ok: true, job: structuredClone(job) };
    }

    job.status = "preflight";
    job.updatedAt = now();

    if (!active) {
      job.status = "blocked";
      job.errors = [
        "3D generation disabled (feature flag, founder approval, and local provider are all required)",
      ];
      job.updatedAt = now();
      return { ok: false, errors: job.errors, job: structuredClone(job) };
    }

    const preflight = evaluateTrellisPreflight({
      modelKey,
      resolution,
      environment: { ...environment, allowModelDownload },
    });
    if (!preflight.ready) {
      job.status = "blocked";
      job.errors = preflight.blockers;
      job.updatedAt = now();
      return { ok: false, errors: job.errors, job: structuredClone(job) };
    }

    job.status = "running";
    job.updatedAt = now();

    try {
      const out = await provider({
        jobId: job.jobId,
        tenantId: job.tenantId,
        consumer: job.consumer,
        category: job.category,
        mode: job.mode,
        assetName: job.assetName,
        modelKey,
        resolution,
      });

      if (!out || !Buffer.isBuffer(out.glbBuffer)) {
        job.status = "failed";
        job.errors = ["provider did not return a binary GLB buffer"];
        job.updatedAt = now();
        return { ok: false, errors: job.errors, job: structuredClone(job) };
      }

      const glbCheck = inspectGlbFile(out.glbBuffer);
      if (!glbCheck.passed) {
        job.status = "failed";
        job.errors = glbCheck.errors;
        job.updatedAt = now();
        return { ok: false, errors: job.errors, job: structuredClone(job) };
      }

      const parsed = parseGlb(out.glbBuffer);
      const glbDigest = "sha256:" + createHash("sha256").update(out.glbBuffer).digest("hex");

      job.status = "completed";
      job.completedAt = now();
      job.updatedAt = job.completedAt;
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
        dimensionsSource: "ai_estimated",
        dimensionsVerified: false,
        accuracyClaimAuthorized: false,
        disclosure: ASSET3D_DISCLOSURE,
        provenance: {
          modelId: out.modelId ?? preflight.modelId,
          modelVersion: out.modelVersion ?? modelKey,
          codeLicense: out.codeLicense ?? preflight.codeLicense,
          weightsLicense: out.weightsLicense ?? preflight.weightsLicense,
          commercialUseAllowed: out.commercialUseAllowed ?? preflight.commercialUseAllowed,
          executionMode: localOnly ? "local_gpu" : "custom",
          costUsd: 0,
          generatedAt: job.completedAt,
        },
      };
      return { ok: true, job: structuredClone(job) };
    } catch {
      job.status = "failed";
      job.errors = ["3D generation provider execution failed"];
      job.updatedAt = now();
      return { ok: false, errors: job.errors, job: structuredClone(job) };
    }
  }

  function getJob(jobId, { tenantId } = {}) {
    if (!text(tenantId)) return null;
    const job = jobs.get(jobId);
    if (!job || job.tenantId !== tenantId) return null;
    return structuredClone(job);
  }

  function listJobs({ tenantId, category = null } = {}) {
    if (!text(tenantId)) return [];
    const out = [];
    for (const job of jobs.values()) {
      if (job.tenantId !== tenantId) continue;
      if (category && job.category !== category) continue;
      out.push(structuredClone(job));
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
    job.updatedAt = now();
    return { ok: true, job: structuredClone(job) };
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
