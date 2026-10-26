# RENOVISION AI — Implementation Status

Last updated: 2026-10-26 (implementation handoff on PR #3). This document is the
honest status record for the end-to-end build. Statuses: WORKING (implemented +
automated tests), PARTIAL (working with stated limits), UNTESTED (implemented,
no live verification), BLOCKED (needs founder decision/authorization).

## What already existed (unchanged, certified work preserved)

Thirty-two contract/policy modules under `lib/renovision/` covering spatial
validation, capture planning/quality/privacy, frame evidence with SHA-256
digests, manifest validation + integrity verification, approval gating,
authorized + transactional change logs, benchmark provenance/attestation,
furniture fit/clearance engines, preview disclosure and visual claim policy,
release readiness, and the QUINCEY packet builder — plus in-memory test
adapters for evidence and spatial events. 296 tests passed at the handoff
baseline commit `375b1045`.

## What was missing (the integration gap)

- No orchestrator connected the modules into a product workflow.
- No durable storage: both adapters were explicitly ephemeral/test-only.
- No room model or geometry lock derived from measurements.
- No measurement correction flow, no visualization output, no furnishing plan.
- No HTTP service and no user interface of any kind.
- No benchmark runner; the QUINCEY package was a protocol document only.

## What this handoff added

| Area | Status | Evidence |
| --- | --- | --- |
| Project workflow orchestrator (`lib/renovision/project-workflow.mjs`): capture → review → measurement → lock → approved proposal → preview → furnishing → comparison → QUINCEY packet, tenant-checked at every step | WORKING | `tests/renovision-project-workflow.test.mjs` (8 tests incl. full E2E, self-approval rejection, tampered-evidence rejection, cross-tenant rejection) |
| Room model + geometry lock with SHA-256 geometry digest (`room-model.mjs`) | WORKING | `tests/renovision-room-model.test.mjs` |
| Append-only measurement correction; originals preserved; corrections cannot self-verify; post-lock correction unlocks geometry (`measurement-correction.mjs`) | WORKING | `tests/renovision-measurement-correction.test.mjs` + workflow test |
| Deterministic visualization: dimensioned SVG floor plans (existing vs proposed) with openings, obstruction marker, uncertainty labels, embedded CONCEPT disclosure (`renovation-preview.mjs`) | WORKING | `tests/renovision-renovation-preview.test.mjs` |
| Comparison: per-feature added/modified/removed/unchanged diff; unapproved structural changes flagged | WORKING | preview + workflow + server tests |
| Dimension-aware furnishing plan combining all three existing fit engines; verdicts `fits_with_uncertainty_margin` / `fits_nominal_only` / `does_not_fit` / `blocked_unverified_dimensions`; never a verified fit (`furnishing-plan.mjs`) | WORKING | `tests/renovision-furnishing-plan.test.mjs` |
| Durable filesystem evidence storage, same contract as the memory adapter, scope-checked reads, retention expiry, traversal-safe refs (`durable-evidence-storage.mjs`) | WORKING | `tests/renovision-durable-evidence-storage.test.mjs` incl. persistence across instances |
| Google Cloud Storage evidence adapter for the approved GCP architecture: injected bucket/token/transport, tenant scope metadata re-verified on read, fails closed unconfigured (`gcs-evidence-storage.mjs`) | PARTIAL — code-complete, UNTESTED against a real bucket; **no resources provisioned** | `tests/renovision-gcs-evidence-storage.test.mjs` (fake transport) |
| Durable spatial event store implementing the transactional compare-and-append contract (`durable-spatial-event-store.mjs`) | WORKING | `tests/renovision-durable-spatial-event-store.test.mjs` |
| HTTP service + operator UI: capture review, measurement correction, visualization, comparison, furnishing, approvals registry, QUINCEY packet (`src/renovisionServer.mjs`, `src/renovisionUi.mjs`, `src/renovisionMain.mjs`) | WORKING (demo auth) | `tests/renovision-server.test.mjs` (full HTTP E2E) + manual smoke run |
| Physical benchmark runner + synthetic fixture (`scripts/renovision-benchmark-runner.mjs`) | WORKING (tool); physical benchmark itself NOT RUN | `tests/renovision-benchmark-runner.test.mjs` |
| Device-testing + benchmark package for QUINCEY (`docs/RENOVISION_DEVICE_TEST_PACKAGE.md`) | WORKING (document) | This package; QUINCEY review NOT PERFORMED |

## Preserved invariants

- Geometry locks, measurement uncertainty and source provenance flow through
  every new surface; previews bind to the lock's geometry digest.
- Evidence integrity is digest-verified before a capture can be registered;
  cross-tenant and anonymous access fail closed at every layer.
- Proposed changes require the existing trusted approval gate (no
  self-approval without explicit delegation) and the transactional change log.
- Conservative disclosures are structural: previews are always CONCEPT,
  `authorizeAccuracyClaim` still never authorizes, furnishing verdicts are
  never "verified", and release readiness still fails without independent
  evidence. No survey-grade claim exists anywhere in the new code or UI.

## Run it

```bash
npm test                                   # full suite
npm run start:renovision                   # http://localhost:8787 (demo auth)
RENOVISION_DATA_DIR=/path/to/data npm run start:renovision   # durable location
node scripts/renovision-benchmark-runner.mjs <fixture.json> [report.json]
```

## GCP activation (founder approval required — NOT executed)

1. Founder approves creating a **private** bucket (uniform bucket-level access,
   public access prevention enforced) in the approved GCP project/region.
2. Founder approves the runtime identity (service account) with
   `storage.objectAdmin` scoped to that bucket only; no keys on disk — the
   adapter takes tokens from the metadata server / token URL.
3. Deploy the service with `RENOVISION_GCS_BUCKET=<bucket>` set; the adapter
   activates automatically and `/health` reports `durable-gcs`.
4. QUINCEY verifies tenant isolation, retention deletion and digest integrity
   against the real bucket before any production claim.

No bucket, identity, or paid resource has been created by this handoff.

## Remaining blockers / founder decisions

- Production identity provider to replace demo header auth (BLOCKED on
  founder choice).
- GCP bucket + identity provisioning approval (BLOCKED, see above).
- Physical room benchmark + real-device matrix: NOT RUN — needs a consenting
  room, two operators, calibrated instrument and devices (package prepared).
- Photorealistic renovation rendering: no image model connected; paid models
  require separate founder authorization. The deterministic floor-plan preview
  is the working visualization until then.
- Project snapshot restore on service restart (evidence/events are durable;
  project state export exists, restore is future work).
- QUINCEY independent review of the exact handoff commit: PENDING.
