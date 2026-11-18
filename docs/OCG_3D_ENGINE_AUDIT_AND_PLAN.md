# OCG LAB — 3D ENGINE: Audit, TRELLIS Assessment & Implementation Plan

Date: 2026-11-14  
Owner: TED (Accountable) / ARCHER (Technical Lead)  
Independent QA: QUINCEY  
Tracking: `TheOCGroup/RENO#2` (extension of `research/renovision-accuracy-contract-20261022` / PR #3)

---

## 1. Verified Capability Inventory

### A. `TheOCGroup/RENO` (`main` + Draft PR #3)
- **Implemented & Tested (PR #3, 609 tests passing):**
  - Spatial Accuracy Contract & Policy (`docs/SPATIAL_PROPERTY_INTELLIGENCE.md`, `docs/RENOVISION_SPATIAL_ACCURACY_CONTRACT.md`)
  - Canonical Room Model & SHA-256 Geometry Lock (`lib/renovision/room-model.mjs`)
  - Spatial Validation, Clearance & Uncertainty-Adjusted Furnishing Plan (`lib/renovision/spatial-validation.mjs`, `furniture-clearance.mjs`, `uncertain-furniture-fit.mjs`, `furnishing-plan.mjs`)
  - Deterministic SVG Floor-Plan Preview (`lib/renovision/renovation-preview.mjs`)
  - Disabled-by-default Render Provider & Vertex Photo Renderer (`lib/renovision/render-provider.mjs`, `vertex-photo-renderer.mjs`)
  - Durable Evidence Storage, Spatial Event Store, Audit Chain, Export Package, Backup (`lib/renovision/durable-evidence-storage.mjs`, `export-package.mjs`, `audit-chain.mjs`, `backup.mjs`)
  - Production OIDC Identity, RBAC, HTTP Server & Studio UI (`lib/renovision/identity.mjs`, `access-control.mjs`, `src/renovisionServer.mjs`, `src/renovisionStudio.mjs`)
  - QUINCEY Review Packet & Benchmark Runner (`lib/renovision/quincey-review-packet.mjs`, `scripts/renovision-benchmark-runner.mjs`)
- **Partially Implemented:**
  - GCS storage & Cloud Run Terraform (`infra/gcp/`, `gcs-*.mjs`) — code-complete, tested with fake transport, not provisioned.
  - Physical room benchmark — runner implemented, real-property run pending.
- **Documented Only:**
  - Blender LTS canonical 3D cleanup/staging pipeline (`docs/SPATIAL_PROPERTY_INTELLIGENCE.md`)
  - SuperSplat / Gaussian splat inspection & browser 3D walkthrough viewer
- **Missing (Pre-Extension):**
  - Local 3D asset generation adapter (image-to-3D)
  - Binary glTF 2.0 / GLB mesh & PBR material inspection/export
  - Shared 3D asset contract for NOVA (characters, props, environments)
  - Hardware/VRAM/disk/license preflight for local 3D models (TRELLIS.2 / TRELLIS)

### B. `TheOCGroup/nova` & `TheOCGroup/ocg-lab-site`
- **Blocked (Access Gap):** Both repositories are private and returned `HTTP 403 Resource not accessible by integration` during this audit because they are not attached to the current project's GitHub App resource scope. No claims are made about their internal code until access is granted.
- **Public OCG Repos Checked:** `TheOCGroup/ocg-lab-website`, `TheOCGroup/public-media`, `TheOCGroup/PIPELINE`, `TheOCGroup/OCGICT.com`, `TheOCGroup/the-ocg-lab-report` — none contain a 3D mesh/GLB/TRELLIS/Blender generation engine.

---

## 2. Ownership Map (No Duplication)

| System | Owner | Responsibility |
| :--- | :--- | :--- |
| **RENO / Mission Control** | VICTOR / TED + ARCHER | Spatial source of truth, geometry lock, accuracy contract, measured furnishing fit, evidence/audit/export |
| **OCG LAB 3D Engine Adapter** | TED + ARCHER | Model-agnostic local 3D generation (`asset3d-adapter.mjs`), GLB/PBR inspection (`glb-inspector.mjs`), TRELLIS preflight (`trellis-provider.mjs`), furnishing bridge (`asset3d-furnishing-bridge.mjs`) |
| **NOVA / OCG MEDIA** | ORION / DEVIN / MARK | Consumes shared `asset3d-adapter` contract (`consumer: "nova"`) for `character`, `prop`, and `environment` assets without duplicating RENO spatial validation |
| **QUINCEY** | Independent QA | Independent verification of tests, sample GLB assets, cost ($0), security/privacy, and accuracy disclosures |

---

## 3. TRELLIS.2 & TRELLIS Compatibility Assessment

| Criterion | TRELLIS.2 (`microsoft/TRELLIS.2-4B`) | TRELLIS v1 (`microsoft/TRELLIS`) |
| :--- | :--- | :--- |
| **Code & Weights License** | MIT (commercially permissible) | MIT (commercially permissible) |
| **Gated Helper Dependencies** | DINOv3 & RMBG-2.0 require one-time HF license acceptance before offline cache | None documented for core weights |
| **VRAM Requirement** | 12 GB (512³), 16 GB (1024³), 24+ GB (1536³) | 16 GB+ recommended (8 GB w/ FP16 community forks) |
| **Disk Space** | ~18 GB checkpoints; >= 40 GB total recommended | >= 20 GB recommended |
| **OS / CUDA / Python** | Linux, CUDA >= 12.4, Python >= 3.10, PyTorch 2.6+ | Linux, CUDA >= 11.8, Python >= 3.8 |
| **Capabilities** | Single-image-to-3D, full PBR materials (baseColor, metallic, roughness, opacity), open surfaces, GLB/OBJ/PLY/STL | Single-image-to-3D, meshes, 3D Gaussians, radiance fields |
| **Local Operating Cost** | **$0** (local GPU) | **$0** (local GPU) |
| **Current VM Preflight** | **BLOCKED** (CPU-only, 0 GB VRAM, 7.8 GiB RAM, 19 GB free disk) | **BLOCKED** (CPU-only, 0 GB VRAM, 19 GB free disk) |

**Decision:** TRELLIS.2-4B (MIT) is the primary local 3D generation target for furniture, props, characters, and PBR materials. **Installation and weight downloads are intentionally NOT performed on this CPU-only VM** per preflight policy.

---

## 4. Gap Analysis & Implementation Plan

1. **Phase 1 (Implemented in this Draft PR):**
   - `lib/renovision/glb-inspector.mjs`: Pure-Node glTF 2.0 / GLB binary parser, PBR/mesh/bounds inspector, and deterministic sample GLB builder.
   - `lib/renovision/trellis-provider.mjs`: Hardware/VRAM/disk/CUDA/license preflight evaluator for TRELLIS.2 and TRELLIS v1.
   - `lib/renovision/asset3d-adapter.mjs`: Shared model-agnostic async job adapter for `reno`, `nova`, and `ocg-lab` (`localOnly: true`, paid APIs and downloads disabled by default, provenance + MIT license tracking, `dimensionsVerified: false` enforcement).
   - `lib/renovision/asset3d-furnishing-bridge.mjs`: Connects generated 3D assets to RENO's existing `evaluateFurnishingPlan` without duplicating fit/clearance/uncertainty math.
2. **Phase 2 (Requires GPU Host + Repo Access):**
   - Attach `TheOCGroup/nova` and `TheOCGroup/ocg-lab-site` to audit NOVA's existing asset pipeline and wire the `asset3d-adapter` consumer contract.
   - Provision/target a Linux NVIDIA GPU host (>= 24 GB VRAM, >= 60 GB free disk, CUDA 12.4+) to run live TRELLIS.2-4B + Blender LTS headless cleanup benchmarks.
3. **Phase 3 (QUINCEY Certification):**
   - Submit draft PR, test results, sample GLB assets, and cost report ($0) to QUINCEY for independent certification.
