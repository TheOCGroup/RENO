# RENOVISION AI — Release Candidate Record

**Frozen engineering subject (as published on the branch):**
`75c94ff853522eb34548a98ac2ef2bf43213e46e`
(branch `research/renovision-accuracy-contract-20261022`, draft PR #3).
The commits were authored locally and published through the GitHub Git Data
API; the API assigns its own commit SHAs, so the published SHAs differ from
the local build SHAs while every commit's **tree is byte-identical** (tree
equality was asserted per commit during publication). Local → published:
identity `70f31759` → `1688ca7f`, persistence `d64f159d` → `394335fc`,
service `1f4aefc8` → `8270726a`, storage `ea630fde` → `65d14599`, furnishing
`d330edd8` → `73a15285`, docs/IaC `9d36c649` → `75c94ff8` (frozen subject).
This document and its SHA correction are documentation-only commits on top
of the frozen subject; they change no code. If any code file changes, the
subject is void and a new candidate must be frozen and re-reviewed.

## Test results (on the frozen subject)

- Full suite: **381/381 pass** (`npm test`, Node 24) — 296 pre-existing
  contract tests preserved + 51 (first implementation pass) + 34 (completion
  pass); every new test file also passes in isolation.
- Live smoke (two-process, demo identity mode, durable filesystem storage):
  health contract verified, project created, export package returned, process
  restarted, project recovered from the durable store and readable.
- Fail-closed smoke: with no identity configuration the process refuses to
  start.
- CI on the frozen subject: recorded in the PR #3 comment carrying the
  QUINCEY request (both repository workflows). The three Netlify App checks
  fail identically on the pre-candidate baseline — pre-existing deploy
  preview failure, adjudicated in
  `docs/RENOVISION_IMPLEMENTATION_STATUS.md`; not bypassed.

## Security verification record

- Verified RS256 ID tokens only (JWKS), issuer/audience/expiry/iat checks,
  per-token + per-subject revocation; only the `Authorization` header is read.
- RBAC (viewer/operator/approver/admin) + tenant/property/room entitlements
  enforced on every API route; tests cover forged headers, missing/expired/
  revoked tokens, cross-tenant invisibility (404), unentitled property (403),
  role boundaries (viewer read-only, operator cannot register approvals).
- Evidence: digest-verified at registration; storage scope-checked on read;
  retention enforced on read and by purge on both adapters; corrupt/tampered
  evidence and tampered audit trails are rejected (tests).
- No credentials are logged; the repository contains no secrets.

## Environment configuration

`docs/RENOVISION_ENVIRONMENT_MANIFEST.md` (complete variable contract,
identity claim contract, logging rule).

## GCP deployment plan

`infra/gcp/` Terraform + `infra/gcp/README.md` (apply procedure, smoke steps,
rollback). **NOT APPLIED** — founder authorization required.

## Rollback procedure

- Code: reset the branch to the previous candidate commit
  (`8e53b28bdbafc4d42f73f5c1dd8abfe94204713b` before this candidate) and
  redeploy; data directories are forward-compatible JSON — a rollback reads
  the same project/evidence/event records (older code ignores export/audit
  chain fields it does not know).
- Deployed (future): previous Cloud Run revision traffic shift; see
  `infra/gcp/README.md`.

## Backup and recovery evidence

`lib/renovision/backup.mjs` + `scripts/renovision-backup.mjs`; automated test
proves create → verify → restore round-trip on a live evidence store, digest
tamper detection, and refusal of non-empty restore targets
(`tests/renovision-storage-hardening.test.mjs`).

## Known limitations

- GCS adapter verified against fake transports only (no real bucket —
  founder-gated provisioning).
- Device matrix (30 cases) and physical room benchmark: **NOT RUN** —
  checklists below stay BLOCKED until real evidence exists.
- Approvals registry in the standalone entry is in-memory (deployment
  choice); gate semantics are the certified modules'.
- Photorealistic rendering disabled by design (flags + provider absent).
- Demo identity mode is local-development only (explicit env flag).

## Device acceptance checklist — BLOCKED (not run)

Per `docs/RENOVISION_DEVICE_TEST_PACKAGE.md` §4: iOS LiDAR, Android depth,
browser camera, photo-only and manual fallbacks, low-light / reflective /
occluded / interrupted captures on real hardware with a consenting space.

## Physical benchmark checklist — BLOCKED (not run)

Per `RENOVISION_PHYSICAL_BENCHMARK_PROTOCOL.md`: independent reference
measurements by a second operator with a calibrated instrument; results must
flow through `scripts/renovision-benchmark-runner.mjs`; synthetic fixture
results are never accuracy evidence.

## Independent QUINCEY verdict

**PENDING.** Request package: `docs/RENOVISION_QUINCEY_REVIEW_REQUEST.md`,
submitted via PR #3. MUSE does not self-certify. Release decision until the
verdict lands: **HOLD — ready for founder approval to proceed to QUINCEY
review and the founder-gated activations.**
