# RENOVISION — Desktop Live-Verification Pack (read-only)

**Why this exists.** The build environment holds no usable Google Cloud
credential (its only service-account key is revoked; founder rule: never
reuse or repair it, no credentials through chat). All live GCP reads
therefore run under the founder's own authenticated desktop session on
`DESKTOP-5E83JLJ` (account `gocasiorealtor@gmail.com`, project
`ocg-pipeline`, Cloud SDK 580.0.0) — the same pattern as the founder
V1–V6 verification of 2026-10-25. Nothing in this pack creates, modifies,
or deletes a cloud resource; there is no apply step.

**Already verified by the founder desktop (comment 6503007807,
2026-10-29):** active account `gocasiorealtor@gmail.com`; project
`ocg-pipeline`; `billingEnabled: true` with a linked billing account
(identifier intentionally not recorded). This supersedes the earlier
"billing NOT VERIFIED" status in older documents.

## The one command

From a clone of this repository on the desktop:

```powershell
powershell -ExecutionPolicy Bypass -File .\infra\gcp\RENOVISION-DESKTOP-VERIFY.ps1
```

Script: `infra/gcp/RENOVISION-DESKTOP-VERIFY.ps1`, SHA-256
`6325cc85cc2f5f67abacda7758a7d43415c941377296a8b8de90ff2f9b67ccf8`
(pure ASCII; workstation parser/execution status: NOT VERIFIED until
the transcript returns). It aborts before any inventory command if the
active account or project differs from the expected values. Prereq for
the Terraform section: Terraform 1.9.8 on PATH and a local
`staging.tfvars` (the script creates it from
`infra/gcp/staging.tfvars.example` on first run).

## What it collects (mission §3 items 1–12)

Active identity + project gate; project lifecycle state; billing
enabled (the billing-account identifier is never printed); enabled
APIs; Cloud Run services; bucket names/locations; Artifact Registry
repositories; KMS key rings; service accounts + project IAM bindings;
secret NAMES only (values are never read); budgets (names/amounts);
and four RENOVISION collision probes where **NOT_FOUND is the expected,
passing result**: Cloud Run service `renovision`, bucket
`ocg-renovision-evidence-staging`, service account
`renovision-runtime@`, KMS key ring `renovision` (all us-central1).
It finishes with `terraform fmt -check`, `init -backend=false`,
`validate`, and an **authenticated `terraform plan`** against
`staging.tfvars`.

**Expected plan result (hard stop if different):**
`Plan: 8 to add, 0 to change, 0 to destroy` — Cloud Run service, runtime
service account, evidence bucket + its CMEK/IAM, KMS key ring + crypto
key + storage service identity binding. Any destroy, any unexpected
resource, or any plan error stops the run: return the transcript; do
not attempt fixes under this authorization.

## Known inventory from prior verified records (to be reconciled
against the live transcript; dated, may have changed)

- Artifact Registry repo `cloud-run-source-deploy` exists (2026-10-23) —
  the staging image path in `staging.tfvars.example` reuses it; the
  Terraform creates no repository.
- Service account `agent-workspace-staging@ocg-pipeline` and 7
  `agent-workspace-staging-*` secrets exist (2026-10-23) — unrelated
  product; RENOVISION adds its own SA, no overlap expected.
- A Cloud SQL instance `agent-workspace-staging` existed STOPPED
  (2026-10-23) — unrelated; RENOVISION uses no Cloud SQL.
- Budget "OCG GEO Dev — ocg-pipeline $25 monthly" exists (2026-10-25) —
  it is a different product's alert and must be preserved untouched;
  RENOVISION staging alerts (if any) are separate and are notifications,
  not spending limits.
- Identity Platform / Firebase Auth configuration state in
  `ocg-pipeline`: NOT previously recorded — the enabled-APIs section of
  the transcript settles whether `identitytoolkit.googleapis.com` is
  already enabled; enabling it is NOT part of this read-only pack.

## Return evidence

The transcript file `renovision-verify-<timestamp>.txt` in the desktop
user's home directory. Return it (or its full text) to the requesting
lane. Review checklist on receipt: gate PASS; billingEnabled true; all
four collision probes NOT_FOUND; plan summary exactly 8/0/0; no ERROR
lines unexplained. Until that review completes, live inventory and the
authenticated plan are recorded as **PREPARED, NOT EXECUTED**.
