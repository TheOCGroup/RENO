# RENOVISION — Device Testing & Physical Benchmark Package (for QUINCEY)

> **STATUS NOTE — 2026-11-06 (private Founder Beta):** Sections 3 and 8 below retain historical prototype instructions and limitations; they are **not** authoritative descriptions of the currently deployed Cloud Run service. The private Founder Beta has a separately documented token-authenticated, GCS-backed deployment (see PR #3 operational evidence). The most recently directly checked serving revision was `renovision-00007-4ts` at 100% traffic. The current PR source is **not deployed** merely because its CI passes. Do not run the local demo-header smoke instructions against production or infer that physical accuracy is certified. The 30-case device matrix, physical benchmark, and interactive founder browser sign-in are **NOT VERIFIED**. Before production acceptance, revalidate the deployed revision, IAM, authenticated endpoints, evidence persistence, and browser login on the actual environment. No merge, apply, deploy, or production access change is authorized by this note.

Status: PREPARED FOR INDEPENDENT QA. Nothing in this package is a certification.
The implementation team (MUSE lane) built the software; QUINCEY performs
independent QA on an exact commit. Do not treat any result in this package as a
QUINCEY verdict.

## 1. Subject under test

- Repository: `TheOCGroup/RENO`, draft PR #3, branch
  `research/renovision-accuracy-contract-20261022`.
- Exact commit SHA: recorded in the handoff report that accompanies this package
  (verify with `git rev-parse HEAD` after checkout — the packet is invalid for
  any other commit).
- Scope added by the implementation handoff: end-to-end project workflow
  (capture → review → measurement → correction → geometry lock → approved
  proposal → concept preview → furnishing → comparison), durable evidence
  storage (filesystem + Google Cloud Storage adapters), durable spatial event
  store, operator UI, and this benchmark tooling. The pre-existing spatial
  accuracy contract modules are unchanged.

## 2. Automated checks (run first, exactly as CI does)

```bash
git checkout research/renovision-accuracy-contract-20261022
git rev-parse HEAD        # must equal the handed-off SHA
node --version            # >= 24
npm test                  # full suite: original contract tests + new integration tests
```

Expected: all tests pass, 0 failures. Record the exact test count from the run
output (it changes as tests are added; quote the run, not this document).

CI workflows that must be green on the exact commit:

- `RENOVISION Spatial Validation CI`
- `Mission Control Gate`

## 3. Local service smoke test

```bash
RENOVISION_DATA_DIR=/tmp/renovision-smoke PORT=8787 npm run start:renovision
# in a second terminal:
curl -s http://localhost:8787/health
# expect: accuracyClaimsAuthorized:false, evidenceStorageClass:durable-filesystem
```

Then open `http://localhost:8787/` and walk the full operator flow with
synthetic data only (no real property media):

1. Create a project; plan a capture (web / camera granted / no depth).
2. Upload a small synthetic image as evidence; confirm a `sha256:` digest and a
   `durable-evidence-…` storage reference are returned.
3. Register the generated manifest; confirm **integrity verified** and accept.
4. Add the eight survey measurements (width, depth, height, door width/offset,
   window width/offset, obstruction offset) as **estimated** first; confirm the
   survey is reported incomplete and the room is not field-verified.
5. Correct one measurement; confirm the original remains visible as superseded.
6. Lock geometry; record the geometry digest.
7. Register an approval (approver ≠ proposer) and propose a floor change;
   confirm a proposal **without** a registered approval is refused.
8. Generate the preview; confirm both floor plans are labeled CONCEPT, list the
   disclosure warnings, and state **Accuracy claim: NOT AUTHORIZED**.
9. Evaluate the sample sofa (2.1 m × 0.95 m, verified dimensions) and an
   oversized item; confirm conservative verdicts and **field verification
   required** on every verdict.
10. Build the comparison; confirm the floor change shows as modified/approved.
11. Correct a locked measurement; confirm geometry unlocks and the stage
    returns to measurement review.

Negative checks: repeat steps with a second tenant header — projects must be
invisible (404) and unauthenticated calls must return 401.

## 4. Device capture matrix (physical devices — NOT RUN by the build lane)

`buildCaptureQaMatrix()` in `lib/renovision/device-qa-matrix.mjs` defines 30
cases: platforms `ios-lidar`, `android-depth`, `browser-camera`, `photo-only`,
`manual` × conditions `normal-light`, `low-light`, `reflective-surface`,
`occluded-corner`, `permission-denied`, `camera-interrupted`.

For each case record: device model, OS version, app/build (commit SHA), sensor
support actually detected, permission outcome, coverage gaps, failure notes.
A case is `executed:false` until a real device run is logged — sandbox or
emulator results must be labeled as such and never counted as device evidence.

## 5. Physical room benchmark (follow the protocol, do not improvise)

Follow `docs/RENOVISION_PHYSICAL_BENCHMARK_PROTOCOL.md` exactly: consenting
ordinary room, two operators (reference measurer ≠ capture operator), calibrated
laser/tape, three repeats per dimension, instrument ID + calibration record,
pre-registered tolerances.

Produce a fixture JSON in the shape of
`tests/fixtures/renovision-benchmark-synthetic.json` (which is SYNTHETIC and
must never be quoted as a result), with real values for: `studyId`, `roomId`,
`provenance` (both operator IDs, instrument, calibration ref, capture commit =
the exact tested SHA, evidence SHA-256 of the private evidence bundle, three or
more reference repeats, failure log including rejected captures, compute cost),
at least 10 independently measured reference distances (room dimensions,
openings, ceiling height), and the candidate measurements produced by the
capture under test.

Run:

```bash
node scripts/renovision-benchmark-runner.mjs <fixture.json> <report.json>
```

The runner validates provenance, computes mean/max absolute error and
within-tolerance results, and prints **Certification: NOT GRANTED**. Exit code
2 means the inputs were invalid and no number may be quoted.

## 5a. Execution readiness — exact kit, roles, and evidence bundle (prepared, NOT EXECUTED)

**Hardware kit (founder supplies/approves):**
- iPhone with LiDAR (Pro model, iOS current) — `ios-lidar` cases.
- Android device with depth/ToF or ARCore depth support — `android-depth` cases.
- Any current phone or laptop browser — `browser-camera` / `photo-only` / `manual` cases.
- Laser distance meter with current calibration certificate (record instrument ID + certificate date), plus a steel tape as cross-check.
- The test room: one ordinary furnished room, owner's consent recorded, with at least one door, one window, and one obstruction.

**Roles (must be different people where the protocol requires):** reference measurer (never the capture operator), capture operator, evidence custodian (hashes + seals the evidence bundle), QUINCEY reviewer (independent scoring).

**Evidence bundle per case/benchmark:** raw captures (unaltered), manifest JSON with SHA-256 digests, device model + OS + build commit, detected sensor support, permission outcomes, coverage gaps, failure log including rejected captures, reference measurement sheet (three repeats per dimension, instrument ID, calibration reference), and the runner report. Any case without a complete bundle is recorded as NOT EXECUTED, never as passed.

## 5b. Execution readiness verification — 2026-11-17 (prepared, NOT EXECUTED)

Verified by document and code inspection on the completion dev branch. The
benchmark and the device matrix remain **NOT EXECUTED**: no physical
measurements exist, and nothing in this section may be quoted as a result.

**Checklist (founder directive §5):**
- Required measurement equipment — §5a kit (calibrated laser + certificate, steel tape cross-check). ✓ prepared
- Human testing roles — §5a (reference measurer ≠ capture operator, evidence custodian, QUINCEY). ✓ prepared
- Room and fixture measurement procedures — §5 + protocol (three capture positions incl. occluded corners; ≥10 independently measured reference distances in the executed fixture — the synthetic fixture's 4 are illustrative only). ✓ prepared
- Reference measurement methodology — protocol: three repeats per dimension, instrument ID + calibration record, uncertainty estimate, SHA-256-sealed evidence. ✓ prepared
- Acceptance thresholds (pre-registered) — the runner's enforced defaults: **absolute tolerance 0.05 m, relative tolerance 2%** (`toleranceMeters` / `relativeTolerance`). A dimension passes only when it is within **both** tolerances (the summary applies them conjunctively; an absolute-only figure also appears in per-dimension detail and is not the pass criterion). An executed fixture should declare both tolerances explicitly; whether declared or defaulted, the values recorded in the run's evidence bundle are the values of record, and QUINCEY verifies at evidence review that they equal the pre-registered thresholds — a run recorded with any other values is invalid (F2), not merely different. ✓ prepared
- Evidence capture instructions — §5a bundle + §6 handling rules. ✓ prepared
- Repeatability procedures — reference: three repeats per dimension; candidate: three independent captures per device case, with mean and maximum candidate error reported by the runner summary. A case counts only with a complete evidence bundle. ✓ prepared
- Failure classification — taxonomy below. ✓ prepared
- Final certification criteria — runner inputs valid AND all dimensions within tolerance AND QUINCEY's independent review of the sealed bundle against the exact executed commit. The runner prints "Certification: NOT GRANTED" by design; only QUINCEY's review of real evidence can change that. ✓ prepared
- Device matrix — `buildCaptureQaMatrix()` verified in code: exactly **30 cases** (5 platforms × 6 conditions), each `executed:false` until a real device run is logged. ✓ prepared

**Failure classification (record every occurrence; deleting failures invalidates the study):**
- F1 Instrument invalid — calibration missing/expired or cross-check (laser vs tape) disagrees beyond instrument spec: study pauses until resolved.
- F2 Provenance incomplete — missing operator, instrument, digest, or commit: runner inputs invalid (exit 2); no number may be quoted.
- F3 Platform blocked — sensor unsupported or permission denied: the case is recorded BLOCKED, never as a failed measurement.
- F4 Capture rejected/interrupted — kept in the failure log with reason; the case may be retried once, both attempts retained.
- F5 Coverage insufficient — gaps prevent a dimension from being measured: recorded as missing, never estimated into the report.
- F6 Out of tolerance — a candidate dimension outside the pre-registered thresholds: reported as measured; no re-measurement shopping.
- F7 Integrity failure — any digest mismatch in the bundle: the entire study is invalid.

**Execution prerequisites (founder-supplied, no spend authorized by this package):** the §5a kit, one consenting furnished room, and the four roles. Execute against a locally run build of the then-current QUINCEY-certified candidate; the executed commit SHA goes into the fixture provenance.

**Superseded limitations:** §8's statements that project state is process-held, that authentication is demo-only, and that no GCP resources exist were true of the prototype and are superseded by the Founder Beta record (durable project store with restart recovery; Identity Platform token authentication; GCS-backed deployment live-accepted 2026-11-04). The benchmark itself is unaffected: it runs locally against source, not against the production service.

## 6. Evidence handling rules

- Real capture media stays in private, tenant-isolated storage only — never in
  this repository, never in public fixtures.
- Every artifact is referenced by SHA-256 digest; verify digests independently
  (`verifyManifestArtifacts`) rather than trusting the manifest.
- Keep failures, outliers, rejected captures and interrupted sessions in the
  record. Deleting failures invalidates the package.
- Retention/deletion and encryption behavior of the production store must be
  demonstrated on the actual deployment before any release claim.

## 7. What QUINCEY is asked to verify

1. Exact-commit reproducibility of §2–§3 (tests, CI, smoke flow, negative
   tenant/auth checks) with an open-scope adversarial pass, including unlisted
   findings.
2. Claim discipline: no surface (UI, API, SVG, docs) states or implies
   survey-grade accuracy, verified fit, or certification without independent
   evidence — check the preview disclosure, furnishing verdicts and health
   endpoint.
3. Integrity: tampered evidence, cross-tenant access, self-approved changes,
   stale-revision commits and post-lock corrections all fail closed.
4. The physical benchmark (§5) on a real room and real devices (§4), reported
   separately from code-level results.
5. Release readiness via `evaluateRenovisionReleaseReadiness`: all six gates
   require verified passing evidence; expect **not ready** until device
   capture, durable private storage on the real deployment, the physical
   benchmark and this review exist.

## 8. Known limitations (stated in advance)

- Demo header authentication only; production identity provider integration is
  outstanding. Do not expose the demo server publicly.
- Project state is held by the service process; evidence and spatial events
  are durable, project snapshots are exportable but not yet restored on
  restart.
- Previews are deterministic dimensioned floor plans, not photorealistic
  renders; no paid image model is connected or authorized.
- Depth-mask functionality is unchanged and out of scope for this package.
- No GCP resources have been provisioned; the GCS adapter is code-complete and
  unit-tested with an injected transport, and is **UNTESTED** against a real
  bucket.
