# OCG 3D ENGINE — QUINCEY Independent Certification Submission

Date: 2026-11-14  
Execution Owner: HYDROGEN  
Program Oversight: TED  
Technical Governance: ARCHER  
Independent QA: QUINCEY  
Repository: `TheOCGroup/RENO`  
Branch: `feature/ocg-3d-engine-adapter-20261114` (based on `research/renovision-accuracy-contract-20261022` / PR #3)  
Tracking Issue: `TheOCGroup/RENO#2`

---

## 1. Milestone Classification

- **Current Status:** `ENGINEERING COMPLETE — CPU-VERIFIED`
- **Live GPU Inference Status:** `BLOCKED` (current VM has no NVIDIA GPU / CUDA; 7.8 GiB RAM; 19 GB free disk).
- **Independent Certification Status:** `PENDING QUINCEY REVIEW` (HYDROGEN does not self-certify).

---

## 2. Recovered vs. Newly Implemented Components

### Recovered from Commit `4c8e31a` (verified against `pr-3` / `f055b8d`)
- `docs/OCG_3D_ENGINE_AUDIT_AND_PLAN.md`
- `lib/renovision/glb-inspector.mjs` (upgraded in this pass)
- `lib/renovision/trellis-provider.mjs`
- `lib/renovision/asset3d-adapter.mjs` (upgraded in this pass)
- `lib/renovision/asset3d-furnishing-bridge.mjs`
- 4 initial test files (expanded in this pass)

### Newly Implemented by HYDROGEN
- `lib/renovision/model-router-3d.mjs` — Model-agnostic 3D model router (hardware/VRAM/license validation, least-resource default, quality escalation, zero paid fallback, extensible `registerModel`).
- `lib/renovision/asset3d-viewer.mjs` — Self-contained interactive 3D Asset Preview & Inspection Studio (client-side binary GLB parser, 3D orbit/zoom/rotation/wireframe Canvas renderer, PBR material & texture inspector, metadata/provenance panel, error banner, local `.glb` upload, multi-format export).
- `src/asset3dServer.mjs` & `src/asset3dMain.mjs` — Local-only (`127.0.0.1`) HTTP server with security headers, sample catalog, `/api/3d/inspect`, `/api/3d/models`, `/api/3d/samples/:id.<fmt>`, and `/api/3d/jobs`.
- `scripts/generate-sample-3d-assets.mjs` & `assets/samples/*.glb` — 5 deterministic, inspected interior-design sample GLBs (`sofa-sectional.glb`, `dining-table.glb`, `accent-chair.glb`, `kitchen-cabinet.glb`, `pendant-light.glb`).
- `tests/renovision-model-router-3d.test.mjs` & `tests/renovision-asset3d-viewer-server.test.mjs`.

---

## 3. Working Local Engine & Preview Instructions

```bash
# Run full test suite
npm test

# Generate deterministic sample GLB assets into assets/samples/
node scripts/generate-sample-3d-assets.mjs

# Start the local-only 3D Preview & Inspection Studio (http://127.0.0.1:8788)
node src/asset3dMain.mjs
```

---

## 4. Supported Models, Formats & Commercial Licensing

- **Model Providers (Local-Only, $0 Inference):**
  - `microsoft/TRELLIS.2-4B` — **MIT** code & weights (`supportsDirectTextTo3d: false`, `text_to_image_to_3d` supported only with licensed local image generator). Gated helpers (`DINOv3`, `RMBG-2.0`) require one-time HF license acceptance before offline caching.
  - `microsoft/TRELLIS-image-large` — **MIT** code & weights.
  - Custom local OCG/open-source models via `registerModel(spec)`. Paid providers are blocked by policy.
- **Supported Export Formats (all verified by unit & HTTP tests):**
  - `glb` (primary, glTF 2.0 binary)
  - `gltf` (glTF 2.0 JSON with embedded base64 buffer)
  - `obj` (Wavefront OBJ)
  - `stl` (Binary STL)
  - `ply` (ASCII PLY)

---

## 5. Security, Privacy & Operating Cost Review

- **Security Controls:** Magic-byte image verification (PNG/JPEG/WebP), 15 MB upload limit, path traversal rejection (`..` and `http(s)://` blocked on `localImagePath`), `127.0.0.1` loopback binding, `nosniff`/`DENY`/`no-referrer`/`no-store` headers, tenant-isolated job lookup, NaN/Infinity vertex & accessor bounds checks on GLB input, zero embedded credentials, zero external network transfers.
- **Operating Cost:** **$0** (zero paid APIs, zero cloud GPU provisioning, zero weight downloads on this CPU-only VM).

---

## 6. Future RENO / NOVA Integration Contract (Not Yet Integrated)

- **RENO:** Calls `createAsset3dAdapter({ consumer: "reno" })` -> `evaluateAsset3dFurnishingFit(...)` -> `evaluateFurnishingPlan(...)`. AI-estimated dimensions (`ai_estimated`) are structurally blocked until calibrated/verified SKU dimensions (`independently_verified`) are provided.
- **NOVA / OCG MEDIA:** Calls `createAsset3dAdapter({ consumer: "nova", category: "character" | "prop" | "environment" })` and consumes exported `.glb` + PBR metadata without duplicating RENO spatial validation.
