# RENOVISION AI — Private Founder Beta Package

**Governing directive (founder, 2026-10-30):** the release target is a
PRIVATE FOUNDER BETA. Commercial launch follows only after founder
acceptance, under separate authorization. Execution order:
BUILD → VERIFY → PRIVATE DEPLOYMENT → FOUNDER TESTING → FIXES →
FOUNDER ACCEPTANCE → COMMERCIAL PREPARATION → PUBLIC LAUNCH
(separately authorized). This package covers the beta phases. Nothing
here authorizes public release, subscriptions, customer billing, or
production marketing claims — none of those exist in the product, and
none may be added under the beta.

## 1. Where the phases stand

- **BUILD — COMPLETE.** The full platform (capture, evidence,
  measurements, corrections, geometry lock, RENOVATE, FURNISH,
  comparison, approval, review packet, export, persistence,
  backup/restore) is implemented and certified: QUINCEY PASS WITH
  CONDITIONS on `3162ce51`, extended to candidate `c24e09dc`; suite
  388/388; both CI workflows green at head `bb6641ef`.
- **VERIFY — COMPLETE except two named gates.** Live Cloud Shell
  verification 2026-10-30: authenticated Terraform plan
  **8 to add / 0 to change / 0 to destroy** (QUINCEY PASS WITH NOTES,
  comment 6526832899, plan independently reproduced). Remaining:
  (a) the KMS key-ring existence check is UNKNOWN because
  `cloudkms.googleapis.com` is disabled in `ocg-pipeline` — apply
  itself will fail on the KMS resources until it is enabled;
  (b) the physical benchmark + 30-case device matrix are NOT EXECUTED —
  they run as part of founder testing (§4), on real rooms.
- **PRIVATE DEPLOYMENT — prepared, gated on §6.** Runbook:
  `docs/RENOVISION_STAGING_RUNBOOK.md` (the staging environment IS the
  beta environment: same project, same $15 planned limit discipline
  for the acceptance window; ongoing beta run-rate is the staging
  NORMAL estimate ≈ $12.90/mo while the beta runs, scale-to-zero when
  idle — the founder sees actuals in the billing console).

## 2. Beta access model (private by construction, two layers)

1. **Google layer.** Cloud Run with IAM invoker granted ONLY to the
   founder's account and each explicitly named tester account.
   Unauthenticated requests are rejected by Google before reaching the
   app. Ingress choice at apply time (a declared Terraform variable):
   internal (default, most restrictive; access via authenticated
   proxy) or `INGRESS_TRAFFIC_ALL` + IAM invoker restriction (usable
   directly in desktop/mobile browsers; still no public access). The
   reviewed plan used the internal default; choosing ALL changes one
   attribute of one resource and is recorded as a named founder choice
   in the deployment evidence.
2. **Application layer.** Firebase Authentication accounts are created
   BY THE FOUNDER in the Firebase console for himself and each tester
   — there is no public registration, and self-sign-up stays disabled.
   Each account receives custom claims (`tenant_id`, `roles`,
   `property_ids`) per `docs/RENOVISION_GCP_IDENTITY_PREP.md`; the app
   verifies every token server-side and fails closed. Demo
   authentication is never enabled in the cloud deployment.
3. **Data layer.** Tenant isolation, property/room-level authorization,
   CMEK-encrypted private evidence bucket, hash-chained audit — all
   certified behavior, unchanged for the beta.

## 3. What the founder tests (real properties, real rooms)

The beta is the complete product, not a demo: the founder runs real
rooms end-to-end on desktop and phone — capture with the phone,
evidence upload, measurements (with laser/tape reference values kept
for the accuracy comparison), corrections, geometry lock, a RENOVATE
proposal, FURNISH with real furniture dimensions, before/after
comparison, approval from a second tester identity, export with local
digest verification, and a persistence check across a service restart.
Accuracy and measurement-uncertainty disclosures are shown in the UI
throughout; no screen claims survey-grade or guaranteed accuracy.

## 4. Physical acceptance inside the beta

The prepared benchmark protocol and 30-case device matrix
(`docs/RENOVISION_DEVICE_TEST_PACKAGE.md`,
`docs/RENOVISION_PHYSICAL_BENCHMARK_PROTOCOL.md`) execute during
founder testing with the §5a kit (LiDAR phone, Android depth device,
calibrated laser meter + steel tape, consented furnished room) and
roles. Results are recorded as measured — the beta readiness statement
covers only what the evidence shows.

## 5. Defect loop

Defects are filed on the repository (issue or PR comment) with: beta
build/commit, device + browser, steps, expected vs actual, and
evidence (screenshot/export). Fixes land on the same branch; every fix
batch gets a QUINCEY delta review and a full-suite run; the founder
retests the exact failing case before it closes. Severity-1/2 defects
block founder acceptance until closed or explicitly waived by the
founder in writing on the PR.

## 6. Gates before PRIVATE DEPLOYMENT can execute

Two narrow API enablements in `ocg-pipeline`, each a separate founder
authorization (never bundled with each other or with deployment):

1. `cloudkms.googleapis.com` — required for apply to succeed (KMS
   resources) and to close the last UNKNOWN collision check.
   Command: `gcloud services enable cloudkms.googleapis.com --project=ocg-pipeline`
2. `identitytoolkit.googleapis.com` — required to create beta user
   accounts and mint the tokens the beta sign-in uses.
   Command: `gcloud services enable identitytoolkit.googleapis.com --project=ocg-pipeline`

On those two authorizations, deployment executes end-to-end under the
runbook (build image → apply the reviewed plan → smoke → founder
accounts + claims → beta opens), followed by founder testing, the fix
loop, QUINCEY verification of the running beta, and the founder's
acceptance decision. Commercial preparation does not begin before
that acceptance, and public launch remains a separate authorization
after it.
