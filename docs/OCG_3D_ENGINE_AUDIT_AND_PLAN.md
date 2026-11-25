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

---

## Lane 05 — Enterprise Reconciliation Addendum (2026-11-23)

**Authority / source of truth:** [TheOCGroup/chatbot#226](https://github.com/TheOCGroup/chatbot/issues/226), Lane 05. This dated addendum supersedes contradictory 2026-11-14 inventory, resource requirements, access-gap statements and status claims above; historical text is retained for traceability. **Owner:** Lane 05, shared OCG Unified 3D Engine. **Boundaries:** ORION/NOVA owns media motion, worlds, characters, creative studio and film delivery; Hosting OS owns hosting; Lane 06 owns storage/Runpod census. **Release:** HOLD; PR #20 remains unmerged. GPU stopped. No new repository, model download, paid service, merge or deployment.

### Verified canonical inventory / status (classify by evidence)

| Capability | Existing source and evidence | Verified classification |
| --- | --- | --- |
| Shared six-subsystem facade (geometry, world, reality, 4D, motion, adaptive inference) | `lib/renovision/ocg-unified-engine.mjs`, `ocg-adaptive-inference.mjs` and `tests/renovision-unified-3d-engine.test.mjs` | CODED; CPU TESTED, **not live world simulation** |
| Real geometry inspection and multi-format export | `glb-inspector.mjs`, `asset3d-adapter.mjs`, sample fixtures and tests | CPU TESTED with existing GLBs, **not proof of GPU-generated mesh** |
| TRELLIS.2 / TRELLIS v1 routing and commercial guards | `model-router-3d.mjs`, `trellis-provider.mjs`, `infra/trellis2/trellis2_worker.py` | CPU TESTED (preflight, fail-closed). Weights, real CUDA imports and GLB inference **not verified** |
| Linux CUDA image | `infra/trellis2/Dockerfile.trellis2`, PR #20 | 13/13 build steps previously passed; final image export failed (disk exhaustion). **No image ID, no container acceptance** |
| NOVA shared API consumption | `TheOCGroup/nova` `src/lib/ocg-3d-engine.ts`, `nova-3d-handlers.ts`, `tests/nova-3d-engine.test.mjs` | CODED / CPU TESTED; live 3D backend not configured or accepted |
| OCG LAB OS 3D studio | `TheOCGroup/ocg-lab-site` `cloudrun/asset3dMount.mts`, `os/source/src/components/Asset3dStudioPanel.tsx` | CODED / CPU TESTED; offline GLB inspection; live generation requires shared endpoint |
| NOVA world/scene & motion product layer | NOVA issues [#128](https://github.com/TheOCGroup/nova/issues/128), [#130](https://github.com/TheOCGroup/nova/issues/130), [#131](https://github.com/TheOCGroup/nova/issues/131), [#132](https://github.com/TheOCGroup/nova/issues/132); `src/lib/sceneEngine.mjs` | Contracts / scene infrastructure present; genuine MotionBricks model runtime, Blender parity, photorealistic 60-sec film, interactive world and NAVI integration **not certified** |
| GPU / Runpod | [NOVA #152](https://github.com/TheOCGroup/nova/issues/152) | Existing A40 identified, stopped at the recorded baseline. Live GPU job **HOLD** until independent spend cutoff |

**Exact repository bases inspected:** RENO `main` `4428ef4e405f2debc363e11af96b031b6b3b0065`; NOVA `main` `335e272305f3644be1563174b2e2afe309d43cfa`; OCG LAB `main` `44d5da3fb871dedfe784e134be1eca44ce85b6c0`. RENO PR #19 is merged. PR #20 continues the existing `fix/phase9-dockerfile-trellis2-pythonpath-ovoxel-20261120` branch; no parallel engine branch was created.

### Reference technology reconciliation — do not conflate a design target with an installed model

| Technology | Reuse decision | License/access/risk | Current OCG verification |
| --- | --- | --- | --- |
| **Hyper3D Rodin** | Competitive API capability reference for image/text-to-3D; **not** an OCG-owned model and **not** a free local inference route | Hosted proprietary API and credits; commercial terms and live cost require checking before any external call. https://docs.hyper3d.ai/en | RESEARCH; no enabled paid connector or certified parity |
| **TRELLIS.2-4B** | Primary shared RENO GPU geometry generator; explicit model selection | MIT core code/weights; upstream Linux, >=24GB VRAM, recommended CUDA 12.4. DINOv3 access/license conditions; BRIA RMBG-2.0 and NVIDIA noncommercial rasterizer concerns. Geometry-only mode until independently cleared. https://github.com/microsoft/TRELLIS.2 | CPU TESTED; genuine GPU generation BLOCKED |
| **TRELLIS v1** | Lower-VRAM fallback only if corresponding weights actually cached/licensed | Upstream >=16GB NVIDIA GPU, model-specific compatibility unverified. https://github.com/microsoft/TRELLIS | Router specification only; weights not inventoried |
| **Simulon 2.0** | Reference for mobile AR placement, tracking, lighting and compositing; do not copy proprietary app | Consumer mobile software and separate service terms, not evidence of reusable open weights. https://simulon.com/ | Simplified OCG `computeRealityComposite` coded; no AR feature parity claim |
| **HunyuanWorld-1.0** | Separate world-model research candidate; connect via the same scene/GLB contract if licensed and affordable | Tencent HunyuanWorld community license has conditions; code/weights size, hashes, minimum GPU and use rights **not measured**. https://github.com/Tencent-Hunyuan/HunyuanWorld-1.0 | RESEARCH ONLY; no installed verified weights |
| **HY-WorldPlay / HY-World 1.5** | NOVA world/video research, **not** a RENO geometry-provider substitution | Tencent custom community license; upstream AR distilled pipeline quotes single-GPU `sp=1` **72 GB** (A40 48 GB insufficient for this published mode), multi-GPU modes 28/34 GB per GPU require additional GPUs and are not authorized. Distinct 5B variant is not validated. https://github.com/Tencent-Hunyuan/HY-WorldPlay | RESEARCH ONLY; no certified runtime |
| **Genie 3 / Project Genie / Genie 4** | External interactive-world experience benchmark; not locally runnable under shared TRELLIS container | Google-hosted access; as of 2026-11-18 Genie 4 announced in Project Genie. API/plan terms must be verified before any integration. https://blog.google/innovation-and-ai/models-and-research/google-deepmind/genie-4-now-available-project-genie/ | RESEARCH ONLY, no OCG licensed model installation |
| **MotionBricks SOMA** | NOVA motion-layer adapter; share mesh/scene assets, not separate geometry engine | NVIDIA Apache-2.0 code; SOMA/G1 weights NVIDIA Open Model Agreement; example motion datasets evaluation-only. TensorRT 10.8 ONNX runtime GPU required. https://github.com/NVlabs/motionbricks | Existing OCG procedural joint primitives are **not** genuine SOMA inference. NOVA #130 acceptance unproven |
| **Blender-class studio** | NOVA UX/editor goal; optional headless Blender subprocess for authorized export/render jobs | Blender GPL/code redistribution analysis required; do not claim browser feature parity or assume process separation settles license. https://www.blender.org/about/license/ | Existing editor/GLB tools are partial; no verified Blender-class acceptance |

**Evidence integrity correction:** The older table above cited unverified TRELLIS.2 8/12/16GB resolution floors. Upstream states **at least 24 GB** for the 4B model, without validated resolution-by-resolution peaks. Phase 9 CPU remediation sets a conservative 24GB lower bound at all tiers and the router accordingly. This is a minimum, **not** a guarantee that high resolution fits in 24GB. Docker `TORCH_CUDA_ARCH_LIST` now targets **8.6;8.9** for existing A40 SM 8.6 and proposed L4 SM 8.9, subject to actual GPU compilation/inference testing. No GPU was started to validate that binary.

### Storage / VRAM / images / spend — explicit preflight gate

- Existing Runpod A40: 48GB physical VRAM, compute capability SM 8.6 (NVIDIA documentation); nominal historical GPU rate **$0.59/hr**, **not a current billing quote**. Existing 10GB volume historically ~$1.40/month, balance $9.95 reported in NOVA #152, **not fresh measurements**. Preserve NOVA assets and secrets; do not infer free capacity from nominal volume size.
- TRELLIS.2: upstream **>=24GB VRAM**; RENO **>=40GB free disk** is a *project preflight planning threshold*, not an upstream certified weight footprint. A prior ~22GB CUDA build failed during Docker image export with no image ID. **Actual pinned checkpoint bytes, SHA256 hashes, helper-model weights, compressed/uncompressed layer sizes, persistent/container free disk and peak VRAM are UNVERIFIED.** No downloads to estimate sizes.
- A40's 48GB VRAM meets the upstream *minimum*, but Microsoft reports verifying A100/H100 rather than this A40. Compiler-architecture and runtime compatibility must therefore be proven live.
- The 10GB persistent volume cannot by itself satisfy the RENO 40GB-free-disk threshold. A separately sized container disk could possibly meet it: **measure actual locations and free bytes** first. Do not resize volume, assume 30GB sufficient, delete NOVA files, create another Pod or buy GPU time.
- Charge formula once authorized: `compute_hours × current GPU $/hr + storage/container cost + transfers if billed`. The historical 15-minute GPU-compute-only estimate at $0.59/hr is **$0.1475**, not a hard spend ceiling. **Current independent $1 cutoff remains unproven** in NOVA #152; timers/stop API requests alone do not enforce it.

### One consolidated GPU batch — **PREPARED, NOT AUTHORIZED TO EXECUTE**

**P0 CPU / offline first (no rental):** Verify current branches/PRs, run Node tests, `py_compile`, pin source/weight manifest, compare SHA256 of present files, read license/terms and cache inventories, measure actual Docker/Runpod volumes via Lane 06, negotiate no-cost independent cutoff with NOVA #152, confirm export-mode geometry-only without NC dependencies. No model cache claim without bytes and hash.

**Gate to START (all required):** (a) founder's **new explicit activation authorization**; (b) independent tested provisioning-to-shutdown ceiling with retry and billing reconciliation, per NOVA #152; (c) no conflict with NOVA usage; (d) sufficient separately measured container/persistent disk and >=40GB free for the RENO configured preflight; (e) accepted DINOv3 terms and licensed available helper weights; (f) deterministic GPU build/install plan, exact checksum manifest, data isolation, rollback and non-exposed admin ports.

**GPU batch A — shared TRELLIS geometry (one startup):**
1. Record Pod id, image digest, free persistent and ephemeral bytes, `nvidia-smi` GPU/driver, `torch.cuda.get_device_capability()`, CUDA/Python versions, and model/extension hashes. Expected A40 SM 8.6; reject mismatches.
2. Complete the **existing** container artifact export (or reuse a matching image digest); `python -c` imports of torch, TRELLIS, `o_voxel` and in-process minimal CUDA kernel; no duplicate weights or unapproved third-party extensions.
3. Run `/health`, `/ready`, authenticated `/api/3d/health`; reject unauthenticated and cross-tenant mutation; explicit `trellis-2-4b` 512³ single 256×256 procedural object input. No sample GLB passed off as inference.
4. Verify generated mesh vertices/triangles/nonzero geometric bounds, geometry-only GLB provenance and SHA256, file decode and five-format GLB/glTF/OBJ/STL/PLY exports; measure peak resident VRAM, disk usage, wall time, charged USD, cleanup and refusal paths.
5. Exercise NOVA and OCG LAB API consumers against the **same** endpoint with isolated authorized identities; verify static/unrigged/unmeasured disclosures. Do not reinterpret OCG procedural motion or a mock GLB as live model generation.
6. STOP, confirm billed GPU $0/hr and reconcile exact charges; independent QUINCEY reproduces source + output identity and records PASS/FAIL/HOLD.

**GPU batch B (NOT part of automatic A):** MotionBricks licensed model and motion/rig acceptance, HunyuanWorld/WorldPlay world tests, Blender batch renders, NOVA cinematic film and NAVI geospatial route acceptance each require their own model/rights/storage/GPU cost and acceptance gate. **Do not auto-download or chain them into batch A.** A40 is insufficient for published single-GPU 72GB WorldPlay AR 8B configuration.

### CPU proof / CI / independent review

- Phase 9 A40+VRAM source patch: commit `07af07982b5dc17a5217cfe52880cdb46c2b51a9`, tree `01ffedc1bd03724909d203d26d4d1480d25a6dd3`; corrected Docker SM 8.6/8.9, 24GB minimum and model router.
- [RENOVISION Spatial Validation CI](https://github.com/TheOCGroup/RENO/actions/runs/45288119255): **789/789 Node tests PASS**; includes new A40 architecture and 24GB preflight regression checks. [Mission Control Gate](https://github.com/TheOCGroup/RENO/actions/runs/45288119332) success. These are CPU/repository checks, **not CUDA image or runtime validation**. Existing external Netlify preview status failed and must not be treated as production acceptance.
- Prior independent QUINCEY [PR #20 Phase 9.1 review](https://github.com/TheOCGroup/RENO/pull/20#issuecomment-7055831306) applies to **old** head `062b4ca0`, not the new changes. **Current independent QUINCEY certification: PENDING**, not self-approved.

**Estimated remaining execution (estimate, not verified schedule):** CPU review / static manifest + provider reconciliation **0.5–2 engineer-days**; safe disk/host readiness and spending cutoff **unknown until Lane 03/06 and NOVA #152 resolve**; bounded real TRELLIS build/acceptance **1–3 engineer-days after prerequisites**; consumer end-to-end and QUINCEY review **1–2 engineer-days**. Other world/motion/Blender goals are separate nontrivial backlog, not included in this estimate.

**Hard release conditions:** No merge, deployment, GPU activation, paid model/downloads, claim of 3D production parity or closure of issue #226 until current SHA, tested real artifacts, measured resources and independent QUINCEY evidence are accepted.
