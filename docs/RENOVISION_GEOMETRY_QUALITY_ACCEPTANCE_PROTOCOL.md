# RENOVISION — Geometry-Quality Acceptance Protocol

**Document status:** Ready to execute — founder directive 2026-11-24
**Applies to:** Repo `TheOCGroup/RENO`, 3D engine (TRELLIS.2), geometry-only GLB generation
**Certified baseline at drafting:** PR #20, branch `fix/phase9-dockerfile-trellis2-pythonpath-ovoxel-20261120`, head `d9cce87f291b74dfea742865dd56eeb3b75a94d3`, tree `21f1aff25566b1189913c3afdc1369bbdeb51b5f` — QUINCEY ACCEPTED WITH NOTES, comment record in `QUINCEY-PHASE9-DELTA2-CERTIFICATION-2026-11-24.md`
**Execution venue:** Existing RunPod NVIDIA A40 (48 GB) pod only. No other GPU, no other provider, no new rental.
**Authority rule:** This protocol is documentation and procedure only. It authorizes nothing by itself. No step in this protocol may be executed until Section 2, Precondition 2.1, is satisfied in writing by the founder for that specific session.

---

## 1. Purpose & Scope

### 1.1 What this protocol certifies

This protocol certifies, for **one specific generated file bound to one specific generation record**, whether genuine TRELLIS.2 geometry output from a real reference photograph is of commercial quality. A successful run produces exactly one of the QUINCEY verdicts defined in Section 8.4, bound to:

1. The exact SHA-256 of the generated GLB (Section 4.8).
2. The exact generation record produced in Section 4.
3. The exact reference image, identified by SHA-256 (Section 3.6).

Specifically, this protocol certifies:

- That the GLB was produced by a real TRELLIS.2 inference run on the recorded pod, image, weights, and parameters — not by a mock, fixture, pass-through, or deterministic provider.
- That the geometry passes the five quality checks in Section 5: (a) recognizable object shape, (b) proportions vs. source image, (c) silhouette match, (d) mesh integrity, (e) geometric detail level.
- That the GLB renders from matched camera angles (Section 6) and loads, orbits, and round-trips through the repo's asset3d viewer (Section 7).
- That the capability disclosure for the run is honest: `texturedGlbSupported=false` and `glbExportMode="geometry_only"` as reported by `GET /api/3d/capabilities` on the running engine, unless a separate founder-approved license record for textured output is deposited in the evidence package (see Section 9.6).

### 1.2 What this protocol does **not** certify

- Textured, coloured, PBR-material, or UV-mapped output of any kind. The certified engine configuration is geometry-only: `OCG_TEXTURED_GLB_MODE=geometry_only`, `texturedGlbSupported=false`, `glbExportMode="geometry_only"`. Texture quality is out of scope and must not be claimed from a pass under this protocol.
- Verified real-world dimensions, scale accuracy in metres/inches, weight, manufacturability, structural safety, or fitness for fabrication, 3D printing, or construction.
- Room-scale reconstruction, multi-object scene reconstruction, or interior layout accuracy. Section 3 restricts the test subject to a single furniture/room object.
- Performance, cost-efficiency, throughput, uptime, or production readiness of the GPU service. Duration and VRAM are recorded (Section 4) as provenance, not certified as benchmarks.
- The Docker image build, except as recorded under Precondition 2.3. As of the Phase 9 delta-2 certification the Docker image build was **NOT VERIFIED** (no container runtime on the certifying VM; the o-voxel guard fix was static-verified only). If the session image has not been build-verified on the pod itself, QUINCEY records that fact as a note; it does not convert this protocol into an image-build certification.
- Any code change, merge, deployment, or public launch. Production HOLD remains in force regardless of the verdict under this protocol. A CERTIFIED verdict certifies geometry quality of one artifact; it is not release authority.

### 1.3 Explicit exclusion — the deterministic-sample artifact

The existing artifact `geometry-only-export.glb` is **excluded as quality evidence under this protocol, in full, without exception**:

- Identity, as independently parsed by QUINCEY in the Phase 9 certification (Claim 5): 1,040 bytes; GLB magic `glTF`, version 2, length field 1,040 = actual 1,040 bytes; JSON chunk 844 bytes; 1 mesh / 1 node; **8 vertices / 36 indices = 12 triangles**; no textures; MD5 beginning `eafa358d`.
- Provenance: the artifact is byte-identical to the repo sample fixture `assets/samples/accent-chair.glb`. The mocked TRELLIS provider passes that fixture through unchanged. Its `modelId` is `deterministic-sample`.
- What it proved, and only what it proved: the export contract — job lifecycle → provider contract → GLB inspection → capability disclosure — on a CPU-contract run, honestly labelled `CPU_CONTRACT_VERIFIED`, never `LIVE_INFERENCE_VERIFIED`.
- What it did **not** prove: mesh generation, mesh richness, shape fidelity, or any commercial quality property. Per QUINCEY unlisted finding UF-Q9-8, its "counts preserved" property is trivially true of a pass-through and must never be cited as evidence of generation quality.
- Rule for executors and reviewers: if the GLB submitted for certification under this protocol is byte-identical to `assets/samples/accent-chair.glb`, or carries `modelId` `deterministic-sample`, or was produced with a mocked/deterministic provider in the generation record, the run is an automatic FAIL under Section 9.7 and QUINCEY must return REJECTED — GEOMETRY NOT COMMERCIAL without proceeding to the quality checks.

---

## 2. Preconditions

All preconditions must be satisfied and recorded in the evidence package (Section 10) **before** the pod is resumed. If any precondition fails, the session does not start; the executor records the failed precondition, leaves the pod stopped, and reports the blocker. No precondition may be waived by the executor or by QUINCEY — only the founder may amend a precondition, in writing, in the session authorization.

### 2.1 GPU session authorization reference

- A written founder authorization exists for this session that names: (i) this protocol, (ii) the existing RunPod A40 (48 GB) pod as the only venue, (iii) a single session of ≤ 60 minutes, (iv) a spend exposure cap of ≤ $5, (v) stop-only shutdown (termination only under Section 2.6), and (vi) the exact code head to be run (commit SHA on branch `fix/phase9-dockerfile-trellis2-pythonpath-ovoxel-20261120` or a successor head the authorization names explicitly).
- The executor copies the authorization verbatim into evidence artifact `00-authorization.md`, including its date/time and the approval identifier the spend guard will check. The spend guard's activation gate requires an approval-ID match; a mismatched or missing ID must refuse with exit code 2 and **zero spend-creating calls** (no resume, stop, or terminate mutations; read-only account/pod queries performed to evaluate the gate are permitted and must be logged as such, per UF-Q9-4 corrected wording).

### 2.2 Pod identity recording

Before resume, the executor queries the RunPod API (read-only) and records in `01-pod-identity.json`:

- Pod ID, pod name, machine/GPU type string as reported by RunPod (must report an NVIDIA A40 with 48 GB VRAM; any other GPU is a failed precondition), pod state before resume (must be stopped/exited — a pod found already running is a failed precondition and the session aborts), volume ID and volume size, image name exactly as configured on the pod, and the account balance at session start.
- After resume, the executor records pod state, assigned host/port mapping for engine port 8788, and the resume timestamp (America/Chicago and UTC).

### 2.3 Image digest

- The engine runs from `infra/trellis2/Dockerfile.trellis2` in the authorized head: base `nvidia/cuda:12.4.1`, torch `2.6.0+cu124` / torchvision `0.21.0+cu124`, `TORCH_CUDA_ARCH_LIST="8.6;8.9+PTX"` (sm_86 covers the A40), TRELLIS.2 cloned at its pinned commit with `submodule update --init --recursive`, `PYTHONPATH=/opt/trellis2`, weights **not** baked into the image, `HF_HUB_OFFLINE=1`, non-root user `ocg`, `HEALTHCHECK` against `http://127.0.0.1:8788/health`.
- On the pod, before any generation job is submitted, the executor records in `02-image-identity.txt`: the image ID/digest as reported by the pod runtime (`docker images --digests` or the RunPod image identifier, whichever the pod exposes), the output of `nvidia-smi` (GPU name, driver version, CUDA version, total VRAM), `python3 --version`, and `python3 -c "import torch; print(torch.__version__, torch.version.cuda, torch.cuda.is_available())"` showing CUDA available = `True`.

### 2.4 Weights cache SHA-256 manifest

- Weights are supplied from the pod-local cache at `OCG_TRELLIS_LOCAL_CACHE_DIR=/models/trellis2-4b`; nothing is downloaded from Hugging Face during the session (`HF_HUB_OFFLINE=1` remains set).
- The executor generates `03-weights-manifest.sha256` on the pod before generation:

  ```bash
  cd /models/trellis2-4b && find . -type f -print0 | sort -z | xargs -0 sha256sum > /evidence/03-weights-manifest.sha256
  sha256sum /evidence/03-weights-manifest.sha256
  ```

- The manifest must include the TRELLIS.2 `pipeline.json` whose presence the worker's cache gate checks; a cache lacking `pipeline.json` refuses with `WEIGHTS_NOT_CACHED` and the session aborts at this precondition. The manifest's own SHA-256 is recorded in the generation record (Section 4.3). Any file in the cache that changes between this manifest and the end of the session invalidates the run.

### 2.5 `/ready` 200 via the real environment probe

- The engine is started exactly as the image specifies: entrypoint `src/asset3dMain.mjs`, which must populate the structured preflight environment through the real environment probe (`lib/renovision/environment-probe.mjs`) — the UF-Q9-1 remediation — and feed it to `createAsset3dAdapter`. Hand-built, injected, or test-only structured environments do not satisfy this precondition.
- The probe must populate, from actual host inspection, every field `evaluateTrellisPreflight` (model router) requires: `hasNvidiaGpu === true` (strict boolean), numeric `vramGb`, numeric `freeDiskGb`, `cudaVersion`, `pythonVersion`, `helperLicensesAccepted === true`, and `cachedModelKeys` (array, populated from the Section 2.4 cache). Free disk must meet the engine's preflight threshold; the executor records the probed values verbatim.
- Acceptance test for this precondition, executed against the running engine and saved as `04-ready-probe.json`:

  ```bash
  curl -sS -w '\nHTTP %{http_code}\n' http://127.0.0.1:8788/health
  curl -sS -w '\nHTTP %{http_code}\n' -H "Authorization: Bearer $OCG_3D_TOKEN" http://127.0.0.1:8788/ready
  curl -sS -w '\nHTTP %{http_code}\n' -H "Authorization: Bearer $OCG_3D_TOKEN" http://127.0.0.1:8788/api/3d/capabilities
  ```

  Required results: `/health` HTTP 200; `/ready` **HTTP 200** with `readyForInference:true` and an empty blockers list, where the 200 is produced by the probed environment on the real entrypoint path; `/api/3d/capabilities` HTTP 200 reporting `texturedGlbSupported:false`, `glbExportMode:"geometry_only"`, and `budgetUsd:0` (or the session's guard-reported budget, which must be ≤ $5 per Section 2.6). A `/ready` 503, a 200 obtained with the probe bypassed, or a capabilities payload claiming textured support without a Section 9.6 license record each fail this precondition. Unauthenticated `/api/3d/*` requests must return 401 (auth configured) — the executor records one unauthenticated probe response in the same file.
- The in-pod watchdog `pod_watchdog.sh` is launched explicitly at engine start (the Dockerfile `CMD` runs only the Node server; per UF-Q9-7 the first-session procedure must start the watchdog itself), with its hard clamp at 3,600 seconds. The launch command and watchdog PID are recorded in `05-session-guard-arming.txt`.

### 2.6 Spend guard + session guard armed

- Spend guard armed before resume, with the founder approval ID from Section 2.1, session cap ≤ 60 minutes, exposure cap ≤ $5, worst-case cost (including the stop-confirmation window) evaluated against the recorded account balance, and the session deadline **persisted before** the pod resume call is made.
- Session guard / scheduler configured for sequential execution only: GPU scheduler maximum concurrency = 1. Lease mode is used if the run configuration supports it (lease mode constructor-forces concurrency exactly 1). Since the UF-Q9-3 fix (Phase 9.5), the env-facing scheduler config resolver **refuses** any `OCG_GPU_MAX_CONCURRENCY` value above 1 outright (`GPU_CONCURRENCY_REFUSED`); a startup that hits that refusal is a failed precondition, and the value must be corrected to 1 — never worked around.
- Cost alerts armed at 50% / 80% / 100% of the $5 cap. The guard's honest limit is recorded verbatim in `05-session-guard-arming.txt`: the guard provides alerting and deadline enforcement, not a provider-side hard billing ceiling.
- Shutdown plan recorded before resume: stop-only on completion or deadline; shutdown must poll to a confirmed `EXITED`/`TERMINATED` state; an unconfirmed shutdown leaves the session state `shutdown_unconfirmed` and the reconcile path exits with code 4 (DEF-01). Termination is prohibited unless `OCG_POD_TERMINATION_APPROVED=1` is set under a separate founder approval naming termination; the executor does not set that variable under this protocol.

---

## 3. Reference-Image Selection Criteria

The executor selects exactly one primary reference image for the certified generation. Additional images may be generated in the same session for information, but QUINCEY certification under Section 8 is issued for the primary image's GLB only.

### 3.1 Object class

- A single, real furniture or room object: for example an accent chair, side table, floor lamp, bookshelf, cabinet, or sofa. One object, whole and complete in frame. The first certified subject should be an object with a rigid, well-defined form (a chair or table), not a soft/deformable object (curtains, bedding, plants) and not a whole room.
- Not permitted as the primary subject: a person or any part of a person, a pet, a vehicle, a screenshot or product-catalogue render, an AI-generated image, a collage, or an image whose object is a brand-logo showcase. The image must be a photograph of a physical object.

### 3.2 Unambiguous silhouette

- The object's outer contour is fully visible: no part of the object is cropped by the frame edge, occluded by another object, or merged with a same-coloured background.
- The object is separable from its background by contour alone in a grayscale view: the executor verifies this by desaturating a copy of the image (ImageMagick `convert input.jpg -colorspace Gray silhouette-check.png`) and confirming the full outline remains traceable; the check image is deposited as evidence.
- Distinctive structural features that define the object class are visible: for a chair, legs/supports, seat, and backrest; for a table, top and all supports; for a lamp, base, stem, and shade. If a defining feature is hidden by the camera angle, the image is rejected and another is selected.

### 3.3 Lighting requirements

- Even, diffuse lighting; the whole object is lit. No blown-out highlights covering a structural feature, no shadow so deep that a feature's shape cannot be judged, no strong backlighting that reduces the object to a black silhouette, and no reflective surface glare that erases a contour.
- The background is a real room or plain backdrop visibly different in tone from the object on every edge of the silhouette.

### 3.4 Angle requirements

- Three-quarter view: the camera sees the front and one side of the object, at roughly 30–45° off the object's front axis, at approximately object mid-height. A pure front elevation, pure side elevation, top-down view, or worm's-eye view is not acceptable as the primary image, because the generation and the Section 6 comparison both depend on depth cues in the source.
- The object occupies 50–85% of the frame height. The photograph is in focus across the whole object (no depth-of-field blur on any structural part) and at least 1024 px on its longest edge.

### 3.5 Provenance

- The executor records who took/owns the photograph, where it came from, and that RENOVISION has the right to use it as a generation input and to retain it as evidence. Customer photographs, if ever used, require the customer's recorded consent; the default for the first certified run is a founder-owned or executor-taken photograph of a physical object the executor can also photograph again for Section 6 if needed.

### 3.6 Archiving as an evidence artifact

- The selected image is copied, unmodified and un-recompressed, to evidence artifact `06-reference-image.<ext>` and hashed on the machine that will submit it:

  ```bash
  sha256sum 06-reference-image.<ext> | tee 06-reference-image.sha256
  ```

- The generation record (Section 4.2) carries this SHA-256. Any resize, crop, or re-encode after hashing requires re-hashing and a new generation record; the image submitted to the engine must be byte-identical to the archived evidence image. If the engine pipeline itself performs background removal or preprocessing, that transformed input is also saved (`06b-preprocessed-input.png`) with its own SHA-256 and the transform named (tool, version, settings); an undisclosed preprocessing step is a Section 9.8 fail condition.

---

## 4. Generation Record

The executor creates `07-generation-record.json` during the run — fields are filled as each event occurs, never reconstructed afterwards from memory — and completes it before the pod is stopped. The record is the provenance spine of the certification; a missing field makes the run BLOCKED — INSUFFICIENT EVIDENCE under Section 8.4.

### 4.1 Session binding

`session.authorizationRef` (pointer to `00-authorization.md`), `session.podId`, `session.imageDigest` (from `02-image-identity.txt`), `session.codeHead` (full commit SHA of the engine code running on the pod), `session.startedAt` / `session.endedAt` (UTC ISO-8601), `session.executor` (name/role of the person or agent lane that ran the session).

### 4.2 Input

`input.imageFile` (`06-reference-image.<ext>`), `input.imageSha256` (from Section 3.6), `input.preprocessedFile` and `input.preprocessedSha256` (or the literal string `"none"` if no preprocessing occurred), `input.imageDimensionsPx` (width × height).

### 4.3 Model / checkpoint identity

`model.name` = `TRELLIS.2`, `model.checkpoint` = the exact checkpoint/model key the router selected (as reported by the engine, verbatim), `model.weightsManifestSha256` (SHA-256 of `03-weights-manifest.sha256`), `model.cacheDir` = `/models/trellis2-4b`, `model.provider` = the engine's reported provider identity, which must be the real local TRELLIS provider — the strings `mocked`, `deterministic`, `deterministic-sample`, or `sample` anywhere in the provider or model identity void the run under Section 9.7.

### 4.4 Parameters

`params.seed` (integer actually used; if the engine samples a seed, the sampled value as reported by the engine), `params.resolutionTier` / quality profile exactly as named in the capabilities payload, `params.glbExportMode` = `"geometry_only"`, `params.texturedGlbSupported` = `false`, plus every non-default engine parameter set for the run as a name/value list. Defaults left in force are recorded as `"defaults"` for the parameter group, not omitted.

### 4.5 Execution measurements

`run.jobId` (engine job identifier), `run.submittedAt`, `run.startedAt`, `run.finishedAt`, `run.durationSeconds` (finished − started, from engine timestamps), `run.status` (must be the engine's success state; any other state ends the protocol as a failed run), `run.peakVramGb` — measured on the pod during inference by sampling `nvidia-smi --query-gpu=memory.used --format=csv,noheader` at 1-second intervals for the job's duration into `08-nvidia-smi-samples.csv`; the peak value in that file is the recorded value. `run.gpuName` from the same samples' header capture (`nvidia-smi -L` output saved at the top of the CSV as comment lines).

### 4.6 Engine transcript

The full job transcript — submission request, engine log lines for the job, and completion response — is saved unedited as `09-engine-transcript.log`. The live acceptance harness `scripts/live_3d_acceptance.mjs` is run against the pod engine after generation with an explicit non-default mode label supplied by the executor naming the session; its output is saved as `10-live-acceptance-output.json`. Executors note UF-Q9-2: the harness result's classification maps to `LIVE_INFERENCE_VERIFIED` only for the exact label `REAL GPU EXECUTED`; the executor records the label actually used in the generation record (`run.acceptanceModeLabel`) and does not treat the harness classification, by itself, as geometry certification — only Section 8 does that.

### 4.7 Capability snapshot

The authenticated `GET /api/3d/capabilities` response captured in Section 2.5 is copied into the record as `capabilities` (verbatim JSON), and re-fetched after generation into `10-live-acceptance-output.json`. Any change in `texturedGlbSupported` or `glbExportMode` between the two fetches is a Section 9.6 fail condition.

### 4.8 Output

`output.glbFile` = `11-generated.glb`, `output.glbBytes` (byte size), and `output.glbSha256`, computed on the pod immediately at export and again after download to the evidence machine:

```bash
sha256sum 11-generated.glb | tee 11-generated.sha256
```

The two hashes must match; a mismatch means the evidence file is not the generated file and the run is BLOCKED — INSUFFICIENT EVIDENCE. The GLB is also parsed at capture time by the repo's GLB inspector (Section 5.5 tooling) and the inspector's raw output (header magic/version/length, JSON chunk, mesh/node counts, vertex count, index count, triangle count) is saved as `12-glb-inspector-output.json`.

---

## 5. The Five Quality Checks

Each check is performed twice: once by the executor during the session (results in `13-quality-checks-executor.md`) and once independently by QUINCEY (Section 8). Every check returns PASS or FAIL against the criteria stated here; "looks fine" is not a result. Checks 5.1–5.3 are judged on the Section 6 renders against the Section 3 reference image; checks 5.4–5.5 are computed from `11-generated.glb` itself.

### 5.1 Check (a) — Recognizable object shape

- **Method:** Three raters (the executor, QUINCEY, and one person or agent lane who has not seen the reference image) are each shown only the front and three-quarter renders from Section 6, with no filename, caption, or context, and asked: "What object is this?" Each answer is recorded verbatim in the check sheet.
- **PASS:** All three raters name the correct object class (e.g., "accent chair" for a chair subject; the correct class word — chair, table, lamp, shelf, cabinet, sofa — must appear in every answer), and no rater names a different object class.
- **FAIL:** Any rater names a different object class, answers "unrecognizable"/equivalent, or can only describe abstract geometry ("a blob", "some triangles"). A FAIL here is a Section 9.1 fail condition and ends certification as REJECTED regardless of all other checks.

### 5.2 Check (b) — Proportions vs. source image

- **Method:** On the reference image and on the matched three-quarter render (Section 6.2), the executor measures, in pixels, with an image editor's ruler/measurement tool (GIMP Measure tool or equivalent named in the check sheet): (i) overall width W and overall height H of the object's bounding box; (ii) for a chair: seat height ÷ total height, backrest height ÷ total height, seat width ÷ total width; for a table: top thickness ÷ total height, leg height ÷ total height, top width ÷ top depth; for a lamp: shade height ÷ total height, base width ÷ total width; for other classes, the three analogous principal-part ratios are defined by the executor in the check sheet **before** measuring the render, and QUINCEY re-derives them independently.
- **PASS:** The render's W:H ratio differs from the source's W:H ratio by ≤ 10% relative, **and** each of the three principal-part ratios differs by ≤ 15% relative. Measurements (source px, render px, computed ratios, relative differences) are tabulated in the check sheet.
- **FAIL:** Any one of the four comparisons exceeds its tolerance. Perspective differences are not an excuse after Section 6 angle matching; if the executor believes a measurement is corrupted by angle mismatch, the remedy is to re-render under Section 6 and re-measure once, recording both attempts.

### 5.3 Check (c) — Silhouette match

- **Method:** The executor extracts the object's silhouette mask from the reference image (the Section 3.2 desaturated check is the starting point; the mask is produced with ImageMagick thresholding plus manual cleanup, saved as `14-silhouette-source.png`) and the silhouette mask of the three-quarter render at the matched angle (render background thresholded, saved as `15-silhouette-render.png`). Both masks are scaled to a common 512 × 512 canvas, aligned by bounding-box centre and height, and compared with ImageMagick:

  ```bash
  compare -metric AE 14-silhouette-source.png 15-silhouette-render.png null: 2>&1
  ```

  The intersection-over-union (IoU) is computed from the two masks (intersection pixel count ÷ union pixel count, via `compare`-produced difference mask or a Python/Pillow one-liner recorded verbatim in the check sheet) and recorded as a decimal.
- **PASS:** IoU ≥ 0.75, **and** a visual overlay (`16-silhouette-overlay.png`: source mask in red at 50% opacity over render mask in cyan at 50% opacity) shows no missing or extra principal part — every leg/support, arm, back, shade, or shelf present in the source silhouette is present in the render silhouette and vice versa.
- **FAIL:** IoU < 0.75, or any principal part missing/extra in the overlay regardless of IoU. A FAIL here is a Section 9.2 fail condition.

### 5.4 Check (d) — Mesh integrity

- **Method — two independent toolchains, both mandatory:**
  1. **Repo GLB inspector:** the repository's GLB inspector (the inspector exercised by the repo's `glb-inspector` test suite and used for the Phase 9 GLB proof) is run against `11-generated.glb`. It must validate: GLB header magic `glTF`, version 2, length field equal to actual byte size; JSON chunk parses; and it reports mesh count, node count, vertex count, index count, and triangle count. Output saved as `12-glb-inspector-output.json` (Section 4.8).
  2. **trimesh check in the worker environment:** inside the engine/worker environment on the pod (the TRELLIS.2 worker's Python environment, where torch and the worker dependencies already exist), with `trimesh` installed into that environment if absent (`pip install trimesh` recorded in the transcript), the executor runs a check script saved as evidence (`17-trimesh-check.py`) that loads the GLB and prints a JSON report (`18-trimesh-report.json`) containing: `is_watertight`, `is_winding_consistent`, vertex count, face count, count of degenerate/zero-area faces (faces whose area is exactly 0 or < 1e-12 in model units), degenerate-face ratio (degenerate ÷ total faces), count of non-manifold edges (edges shared by more than two faces, from `trimesh`'s edge grouping), number of connected components / split bodies, and the mesh bounding-box extents.
- **PASS (all must hold):**
  - Inspector: header, version, length, and JSON all valid; vertex count > 0 and triangle count > 0 (and, per Section 5.5, far above the 8-vertex / 12-triangle sample scale).
  - `is_watertight` is `true`. If `false`, see the tolerance rule below.
  - Degenerate/zero-area faces: ratio ≤ 0.5% of total faces.
  - Non-manifold edges: 0.
  - Winding consistent: `true`.
  - Connected components: 1 body, unless the object class genuinely consists of separate rigid parts (e.g., a table with a separate shelf board), in which case the component count and the identity of each component are recorded and QUINCEY judges the count against the object; an unexplained extra component is a FAIL.
  - **Watertightness tolerance:** a non-watertight result is tolerated only if **all** of the following hold: the non-manifold edge count is 0, the degenerate ratio is ≤ 0.5%, the mesh has exactly the expected component count, and the openings are confined to the object's underside/base plane (verified visually in the Section 7 viewer inspection and described in the check sheet). Any other non-watertight result is a FAIL under Section 9.3.
- **FAIL:** Any PASS condition above not met, either toolchain failing to load/parse the file, or the two toolchains disagreeing on vertex or face counts by more than the GLB's own accessor counts explain (any disagreement must be resolved and explained in the check sheet; unresolved disagreement is a FAIL).

### 5.5 Check (e) — Geometric detail level

- **Method:** From `18-trimesh-report.json` and `12-glb-inspector-output.json`, record total triangle count and vertex count. Then, on the Section 6 renders at 1024 × 1024, the executor and QUINCEY each list the object's defining features from the reference image (for a chair, minimum list: each leg/support as a distinct form, seat slab, backrest, backrest uprights or panel shaping, arms if present in the source) and mark each feature **present and shaped**, **present but crude** (recognizable mass, wrong shaping), or **absent** in the renders.
- **PASS (both must hold):**
  - Triangle count meets the floor for the object class: chair ≥ 5,000 triangles; table ≥ 3,000; floor lamp ≥ 3,000; bookshelf/cabinet ≥ 5,000; sofa ≥ 8,000; any other class ≥ 3,000. (For scale: the excluded sample artifact has 12 triangles — three orders of magnitude below every floor.)
  - No defining feature is marked **absent**, and at most one defining feature is marked **present but crude**, by either rater. If the two raters disagree on a feature's mark, the lower mark stands.
- **FAIL:** Triangle count below the class floor, any defining feature absent, or two or more features crude. A mesh that passes integrity (5.4) but is a smooth, featureless approximation of the object FAILs here — integrity is not detail.

---

## 6. Visual Comparison Method

### 6.1 Renderer

Renders are produced from `11-generated.glb` by one named route, recorded in `19-render-log.txt` (tool, version, command line):

- **Route A (preferred):** the repo's asset3d viewer (`lib/renovision/asset3d-viewer.mjs`, served by the asset3d server from the authorized head), GLB loaded per Section 7, camera set per Section 6.2, canvas captured as PNG screenshots at 1024 × 1024.
- **Route B (headless fallback):** Blender (installed build) in background mode with a saved script (`20-render-script.py` deposited as evidence) importing the GLB, placing the camera per Section 6.2, rendering with the Workbench engine, flat shading, uniform light-grey material override (geometry-only output has no textures; renders must not invent colour or materials beyond a single neutral material), transparent-free solid neutral background (#808080), output 1024 × 1024 PNG.

Whichever route is used, the same route, settings, material, and background are used for all three angles and for QUINCEY's independent re-render (Section 8.2). Route A screenshots that capture viewer UI chrome are cropped to the canvas only.

### 6.2 Camera angles

The model is centred at its bounding-box centre, normalized so its bounding-box height fills 80% of frame height, camera at bounding-box-centre height unless stated:

1. **Front:** camera on the object's front axis (azimuth matching the front direction established from the reference image), elevation 0°.
2. **Three-quarter (matched angle):** azimuth rotated 30–45° from front toward the same side visible in the reference image, elevation matched to the reference (approximately object mid-height; if the reference was taken slightly above mid-height, elevation +10°). This is the comparison angle for Sections 5.2 and 5.3; the executor records the exact azimuth/elevation used.
3. **Top:** camera directly above the object (elevation 90°), front direction pointing down-frame.

Outputs: `21-render-front.png`, `22-render-three-quarter.png`, `23-render-top.png`.

### 6.3 Side-by-side panels

For each of the front and three-quarter angles, the executor builds a side-by-side panel with ImageMagick, left = reference image (for three-quarter) or a front reference crop if one exists (for front; if no front photograph exists, the front panel pairs the render with the three-quarter reference and is labelled as such), right = render, both scaled to the same height, with a 4 px white separator and a label strip naming the GLB SHA-256 (first 12 characters) and the angle:

```bash
convert 06-reference-image.<ext> -resize x1024 ref-scaled.png
convert 22-render-three-quarter.png -resize x1024 render-scaled.png
convert ref-scaled.png render-scaled.png +append -bordercolor white -border 2 24-panel-three-quarter.png
```

Outputs: `24-panel-three-quarter.png` and `25-panel-front.png`. Panels are evidence, not marketing material: no retouching, smoothing, or re-rendering with different settings is permitted after the panels are built; any re-render restarts Section 6 and both panel files are rebuilt and re-hashed.

---

## 7. Interactive Viewer Checks

Performed by the executor with the repo's asset3d viewer served from the authorized head (locally or against the pod engine), loading `11-generated.glb` by file selection — not a sample, not a URL to any other model. Results recorded in `26-viewer-checks.md` with a screenshot of the loaded model (`27-viewer-loaded.png`) showing the viewer's model metadata (name, and the viewer's "Dimensions: Unverified" badge state — dimensions must remain badged unverified; any verified-dimension claim is a Section 9.6 fail condition).

1. **Load:** the GLB loads with no error banner; the displayed vertex/triangle metadata, if the viewer shows it, matches `12-glb-inspector-output.json`. The known headless limitation from the delta-2 certification (UF-Q9D2-3: sample-model rendering NOT VERIFIED in headless Chromium, metadata stuck at "—" with no error) means these checks are performed in a real (non-headless) browser session; a headless run that cannot render is recorded as NOT RUN for this section, not as a pass, and QUINCEY repeats the check in a real browser under Section 8.
2. **Rotate:** drag horizontally and vertically; the model orbits smoothly in both axes and remains centred; no gimbal flip, disappearance, or clipping through the camera at default zoom.
3. **Zoom:** mouse-wheel/pinch zooms in until a single defining feature fills the frame without the mesh dissolving into visible holes, and out until the whole object fits with margin.
4. **Pan:** right-drag/two-finger pan moves the model in both axes; a double-click or the viewer's reset control (if present) returns to the default view — if no reset control exists, that fact is recorded, not treated as a failure.
5. **Underside inspection:** rotate to view the base/underside; record whether openings exist there (feeds the Section 5.4 watertightness tolerance judgment).
6. **Export/download round-trip:** using the viewer's or engine's export/download route for this model, download the GLB afresh as `28-roundtrip.glb` and hash it:

   ```bash
   sha256sum 28-roundtrip.glb
   ```

   **PASS** if either (i) the round-trip SHA-256 is byte-identical to `output.glbSha256` in the generation record, or (ii) it differs and the round-trip file is re-validated in full — repo GLB inspector plus the Section 5.4 trimesh script — with both reports deposited (`29-roundtrip-inspector.json`, `30-roundtrip-trimesh.json`) and the byte difference explained (e.g., re-serialization) in `26-viewer-checks.md`. An unexplained difference, or a round-trip file that fails re-validation, is a FAIL for this section and a Section 9.8 fail condition.

---

## 8. QUINCEY Geometry-Certification Procedure

QUINCEY is an independent lane: QUINCEY did not build the candidate, did not run the GPU session, and does not accept the executor's files, renders, measurements, or conclusions on trust. A check that cannot fail a claim is scored NOT VERIFIED for that claim.

### 8.1 Intake and identity verification

1. QUINCEY receives the Section 10 evidence package and first verifies identity before judging quality: recompute SHA-256 of `11-generated.glb`, `06-reference-image.<ext>`, and `03-weights-manifest.sha256`; all three must match the generation record (`07-generation-record.json`) exactly. Any mismatch stops the review: verdict BLOCKED — INSUFFICIENT EVIDENCE, naming the mismatched artifact.
2. QUINCEY confirms the exclusion screen: the GLB is not byte-identical to `assets/samples/accent-chair.glb` (compare against the fixture in a fresh checkout of the authorized head), its size/counts are not the sample's 1,040 bytes / 8 vertices / 12 triangles, and the generation record's provider/model identity contains no mock/deterministic marker. A hit on any of these is an automatic REJECTED — GEOMETRY NOT COMMERCIAL under Section 9.7.
3. QUINCEY confirms the authorization reference, pod identity (A40 48 GB), image digest, `/ready` evidence, and guard-arming records are present and internally consistent (timestamps ordered: authorization → manifest → ready → job → export → shutdown confirmation). Inconsistency is recorded as a finding with severity; a missing shutdown confirmation is at minimum a note on any verdict and, if the pod is found still running, an immediate escalation to the founder outside this protocol.

### 8.2 Independent re-execution

Working from QUINCEY's **own download** of `11-generated.glb` (fetched from the evidence package location, hash re-verified after download):

1. **Mesh integrity re-run:** QUINCEY runs the repo GLB inspector and QUINCEY's own copy of the trimesh check (same checks and thresholds as Section 5.4, run in QUINCEY's environment) and compares every reported value against the executor's `12-glb-inspector-output.json` and `18-trimesh-report.json`. Vertex and face counts must agree exactly; watertightness, winding, degenerate ratio, and non-manifold counts must agree exactly or the disagreement is itself a finding and Section 5.4 is scored FAIL until resolved.
2. **Independent renders:** QUINCEY re-renders the GLB using the Section 6 route and settings recorded in `19-render-log.txt` (obtaining the render script from the evidence package for Route B), at front, three-quarter (recorded azimuth/elevation), and top, and builds QUINCEY's own side-by-side panel against the reference image.
3. **Independent visual judgment:** QUINCEY performs checks 5.1 (as one of the three raters, and collects the blind rater's answer independently), 5.2 (own measurements), 5.3 (own IoU computation from QUINCEY's own masks), and 5.5 (own feature list and marks), recording QUINCEY's numbers beside the executor's in the certification report. Divergences beyond the stated tolerances are resolved in favour of the stricter result.
4. **Viewer spot-check:** QUINCEY loads the GLB in the asset3d viewer in a real browser and repeats Section 7 items 1–4 (load, rotate, zoom, pan) and the underside inspection. The round-trip check (Section 7 item 6) is accepted from executor evidence if the byte-identical hash is present; if the executor relied on re-validation, QUINCEY re-runs the inspector on `28-roundtrip.glb` instead of repeating the download.
5. **Honesty sweep:** QUINCEY greps the generation record, transcripts, and any session-produced UI copy or summary for overclaims: textured/PBR/colour claims for this geometry-only output, verified-dimension claims, "production-ready"/"live-verified" language beyond the exact acceptance-status mapping (only the exact label `REAL GPU EXECUTED` maps to `LIVE_INFERENCE_VERIFIED`), and any presentation of the Section 1.3 sample artifact as generation evidence. Each hit is a finding; a hit in a customer-facing claim is a Section 9.6 fail condition.
6. **Adversarial pass:** beyond the claims above, QUINCEY performs an open-scope pass over the evidence package (substituted files, edited transcripts, timestamp anomalies, a GLB whose internal metadata contradicts the record) and reports an explicit "unlisted findings" section, including when it is empty.

### 8.3 Certification report

QUINCEY issues a written report (`QUINCEY-GEOMETRY-CERTIFICATION-<date>.md`, deposited with the evidence package) containing: subject identity (GLB SHA-256, generation-record hash, reference-image SHA-256, code head, pod ID, session date); per-check results for Sections 5.1–5.5, 6, and 7 with QUINCEY's own measured values; severity-counted findings (Critical / High / Medium / Low / Info); the unlisted-findings section; and the verdict.

### 8.4 Verdict scale

Exactly one verdict, using exactly these wordings:

- **CERTIFIED** — All five quality checks PASS on QUINCEY's independent re-execution, viewer checks PASS, evidence package complete, no Critical/High/Medium findings. The geometry of this one artifact is commercially acceptable as geometry-only output.
- **CERTIFIED WITH NOTES** — All five quality checks PASS and viewer checks PASS, but Low/Info findings or tolerated items exist (e.g., watertightness tolerated under the Section 5.4 underside rule, one feature marked crude under Section 5.5, Docker build still NOT VERIFIED, a non-blocking evidence blemish). Every note is enumerated; a note is never a failed check in disguise — if a check failed, this verdict is unavailable.
- **REJECTED — GEOMETRY NOT COMMERCIAL** — Any quality check FAILs, any Section 9 fail condition is met, or the artifact is a mock/deterministic substitute. The report names each failed check with its measured values. This verdict is about the artifact, not the code candidate.
- **BLOCKED — INSUFFICIENT EVIDENCE** — The evidence package is incomplete, hashes do not bind, the generation record is missing fields, or QUINCEY could not execute an independent check (e.g., viewer rendering unavailable in a real browser). BLOCKED is not a quality judgment and must not be reported as one; the report lists exactly which artifacts or accesses would unblock the review.

### 8.5 Binding

The verdict binds **only** to the exact GLB SHA-256 and generation record named in the report. A regenerated GLB (even from the same image, seed, and settings), a re-export, a repaired mesh, or a different reference image is a new subject requiring a new run of Sections 5–8. The verdict certifies geometry quality only, within the Section 1.2 exclusions, and confers no merge, deployment, launch, or spend authority. Production HOLD remains.

---

## 9. Explicit FAIL Conditions

Any one of the following, established at any point by the executor or QUINCEY, fails the run. Fail conditions 9.1, 9.2, and 9.7 produce REJECTED — GEOMETRY NOT COMMERCIAL; fail conditions concerning evidence integrity produce BLOCKED — INSUFFICIENT EVIDENCE unless they also establish a quality failure, in which case REJECTED governs.

1. **9.1 Unrecognizable shape.** Check 5.1 FAILs: any of the three blind raters names a different object class or cannot identify the object.
2. **9.2 Silhouette mismatch.** Check 5.3 FAILs: IoU < 0.75 against the matched-angle source silhouette, or any principal part missing from, or extra in, the render silhouette on the overlay comparison.
3. **9.3 Non-watertight beyond tolerance.** Check 5.4: `is_watertight` is `false` and the Section 5.4 tolerance rule is not fully satisfied (openings outside the underside/base plane, or tolerance invoked alongside any non-manifold edge, excess degenerate faces, or unexpected components).
4. **9.4 Degenerate-face ratio above threshold.** Degenerate/zero-area faces exceed **0.5%** of total faces in either the executor's or QUINCEY's trimesh report.
5. **9.5 Non-manifold or incoherent mesh.** Non-manifold edge count > 0, winding inconsistent, GLB header/JSON invalid per the repo inspector, or the mesh fails to load in either toolchain or in the asset3d viewer.
6. **9.6 Dishonest capability claims.** Any claim — in the capabilities payload during the session, session UI copy, transcripts presented as results, or any summary of the run — that the output is textured, coloured, PBR, or dimension-verified, where `texturedGlbSupported=false` and `glbExportMode="geometry_only"` are the operative disclosures and no separate founder-approved textured-output license record (naming the licensed dependency, e.g. `OCG_NVDIFFRAST_COMMERCIAL_LICENSED=true` set under that approval) is deposited in the evidence package. A change in the capabilities payload between the Section 2.5 and Section 4.7 fetches is also a 9.6 fail.
7. **9.7 Mock or deterministic substitution.** The submitted GLB is byte-identical to `assets/samples/accent-chair.glb` (the `geometry-only-export.glb` sample, 1,040 bytes, 8 vertices / 12 triangles, MD5 beginning `eafa358d`), carries `modelId` `deterministic-sample`, or the generation record/transcript shows a mocked, deterministic, fixture, or pass-through provider produced the output. No quality check may rescue a 9.7 fail.
8. **9.8 Provenance breaks.** The output GLB's pod-side and evidence-side SHA-256 values differ; the submitted reference image differs from the archived hashed image; an undisclosed preprocessing transform was applied to the input; the weights cache changed after the Section 2.4 manifest; or the Section 7 round-trip GLB differs from the certified GLB without the required re-validation and explanation.
9. **9.9 Guard or authorization breach.** The session ran without a matching founder approval ID, exceeded 60 minutes or the $5 cap, ran with scheduler concurrency > 1, resumed any pod other than the authorized existing A40 pod, downloaded weights during the session contrary to `HF_HUB_OFFLINE=1`, or terminated the pod without the separate termination approval. A 9.9 breach fails the run regardless of geometry quality and is reported to the founder as a process finding, not only a certification result.
10. **9.10 Detail floor not met.** Check 5.5 FAILs: triangle count below the object-class floor, any defining feature absent, or two or more defining features crude — including the case of a watertight, well-formed mesh that is merely a smooth approximation of the object.

---

## 10. Evidence Package Checklist

The executor deposits the complete package in a single directory named `geometry-acceptance-<YYYYMMDD>-<glbSha256 first 12 chars>/` and does not invoke QUINCEY until every item below is present. QUINCEY's first act (Section 8.1) is to verify this checklist; a missing item returns BLOCKED — INSUFFICIENT EVIDENCE naming the item. File names below are the deposit names; renames require a manifest amendment note in `00-authorization.md`.

**Authorization & session identity**

- [ ] `00-authorization.md` — founder session authorization verbatim (Section 2.1), with approval ID.
- [ ] `01-pod-identity.json` — pod ID, A40 48 GB GPU string, pre-resume stopped state, volume, image name, starting balance, post-resume state and port mapping, timestamps (Section 2.2).
- [ ] `02-image-identity.txt` — image ID/digest, `nvidia-smi` output, Python version, torch/CUDA availability output (Section 2.3).
- [ ] `03-weights-manifest.sha256` — full SHA-256 manifest of `/models/trellis2-4b`, including `pipeline.json`, plus the manifest's own SHA-256 recorded in the generation record (Section 2.4).
- [ ] `04-ready-probe.json` — `/health` 200, authenticated `/ready` 200 with `readyForInference:true` via the real environment probe (probed structured values included), authenticated capabilities payload (`texturedGlbSupported:false`, `glbExportMode:"geometry_only"`), one unauthenticated 401 probe (Section 2.5).
- [ ] `05-session-guard-arming.txt` — spend guard settings (approval ID, ≤ 60 min, ≤ $5, persisted deadline), scheduler concurrency = 1 / lease mode, cost alerts 50/80/100%, watchdog launch command + PID + 3,600 s clamp, stop-only shutdown plan (Section 2.6).
- [ ] `31-shutdown-confirmation.txt` — post-session pod state polled to confirmed stopped/`EXITED`, final balance, actual session duration and cost as reported by the guard, reconcile result (no exit code 4 outstanding).

**Input**

- [ ] `06-reference-image.<ext>` — the unmodified source photograph (Section 3).
- [ ] `06-reference-image.sha256` — its SHA-256.
- [ ] `06b-preprocessed-input.png` + its SHA-256 + named transform — or the generation record's explicit `"none"` for preprocessing (Section 3.6).
- [ ] Silhouette-check image from Section 3.2 (desaturated copy) and the selection notes naming the object class and the defining features used in Sections 5.1/5.5.

**Generation**

- [ ] `07-generation-record.json` — complete per Section 4 (all subsections; no missing fields).
- [ ] `08-nvidia-smi-samples.csv` — 1-second VRAM samples across the job, with `nvidia-smi -L` header; peak value matches the record.
- [ ] `09-engine-transcript.log` — unedited submission-to-completion transcript.
- [ ] `10-live-acceptance-output.json` — `scripts/live_3d_acceptance.mjs` output against the pod engine, with the mode label used recorded in the generation record.
- [ ] `11-generated.glb` — the generated geometry-only GLB.
- [ ] `11-generated.sha256` — pod-side and evidence-side SHA-256 values, matching.
- [ ] `12-glb-inspector-output.json` — repo GLB inspector raw output (header, JSON, mesh/node/vertex/index/triangle counts).

**Quality checks & renders**

- [ ] `13-quality-checks-executor.md` — executor's results for Sections 5.1–5.5 with all measurements, ratios, and the three blind-rater answers verbatim.
- [ ] `14-silhouette-source.png`, `15-silhouette-render.png`, `16-silhouette-overlay.png` — masks and overlay, with the computed IoU recorded in the check sheet.
- [ ] `17-trimesh-check.py` — the exact trimesh script run in the worker environment.
- [ ] `18-trimesh-report.json` — watertight, winding, degenerate count/ratio, non-manifold edges, components, extents.
- [ ] `19-render-log.txt` — renderer route (viewer or Blender), tool/version, exact commands/settings, camera azimuth/elevation per angle.
- [ ] `20-render-script.py` — required if Route B (headless Blender) was used.
- [ ] `21-render-front.png`, `22-render-three-quarter.png`, `23-render-top.png` — 1024 × 1024 renders.
- [ ] `24-panel-three-quarter.png`, `25-panel-front.png` — labelled side-by-side comparison panels.

**Viewer**

- [ ] `26-viewer-checks.md` — Section 7 results item by item (load, rotate, zoom, pan, reset behaviour, underside inspection), performed in a real browser, or explicitly NOT RUN with the reason.
- [ ] `27-viewer-loaded.png` — screenshot of the generated GLB loaded in the asset3d viewer, showing model metadata and the "Dimensions: Unverified" badge.
- [ ] `28-roundtrip.glb` — viewer/engine round-trip download.
- [ ] `29-roundtrip-inspector.json` and `30-roundtrip-trimesh.json` — required only if the round-trip hash is not byte-identical to `11-generated.glb`; if byte-identical, the matching SHA-256 line is recorded in `26-viewer-checks.md` instead.

**Certification (added by QUINCEY, completing the package)**

- [ ] `QUINCEY-GEOMETRY-CERTIFICATION-<date>.md` — QUINCEY's independent report and verdict per Section 8, bound to the GLB SHA-256 and generation record in `07-generation-record.json`.

---

*End of protocol. Execution requires the founder authorization described in Section 2.1; this document alone authorizes no GPU session, no spend, and no code change.*
