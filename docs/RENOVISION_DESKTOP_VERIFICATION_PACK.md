# RENOVISION — Desktop Live-Verification Pack (read-only)

**Why this exists.** The build environment holds no usable Google Cloud
credential (its only service-account key is revoked; founder rule: never
reuse or repair it, no credentials through chat). All live GCP reads
therefore run under the founder's own authenticated desktop session on
`DESKTOP-5E83JLJ` (account `gocasiorealtor@gmail.com`, Cloud SDK
580.0.0) — the same pattern as the founder V1–V6 verification of
2026-10-25. Nothing in this pack creates, modifies, or deletes a cloud
resource, and nothing in it can enable an API.

**Already verified by the founder desktop (comment 6503007807,
2026-10-29):** active account `gocasiorealtor@gmail.com`; project
`ocg-pipeline`; `billingEnabled: true` with a linked billing account
(identifier intentionally not recorded).

## KMS project-routing — root-cause investigation (2026-10-29)

**Live facts (founder desktop verification):** active account
`gocasiorealtor@gmail.com`; configured project `ocg-pipeline`;
`cloudkms.googleapis.com` is **not** among `ocg-pipeline`'s enabled
services; and `gcloud kms keyrings describe renovision
--project=ocg-pipeline --location=us-central1 --quiet` nevertheless
returned `SERVICE_DISABLED` naming **`ocg-media-acceptance`**. Three
other probes (Cloud Run service, bucket, runtime SA) returned NOT
FOUND for `ocg-pipeline`. The KMS outcome is **UNKNOWN**.

**Mechanism (the distinction that explains it):** a `SERVICE_DISABLED`
error names the **API consumer / quota project**, which is a separate
routing layer from the requested resource project. The quota project
is resolved from the `billing/quota_project` configuration property,
the `CLOUDSDK_BILLING_QUOTA_PROJECT` / `GOOGLE_CLOUD_QUOTA_PROJECT`
environment variables, or the ADC `quota_project_id` — in that
precedence family — and an explicit `--project` flag does **not**
override it. `ocg-media-acceptance` is the OCG MEDIA acceptance
project whose workstation execution ran on this same desktop on
2026-10-28; a leftover quota-project setting from that work attributes
this desktop's API consumption to it, so the KMS enablement check was
evaluated against `ocg-media-acceptance` (where KMS is also disabled)
even though the resource project was correctly `ocg-pipeline`.

**Proof instrument (falsifiable):**
`infra/gcp/RENOVISION-KMS-ROUTING-DIAG.ps1` (SHA-256
`b2d5a4fa13f17bc57bee9eb65e4dc7e3fe8f384795a7fafd6ef062c62b0dc938`)
prints the ambient quota property, the related env vars, the ADC
`quota_project_id`, the staging API-enablement table, and then runs
the identical describe three ways: ambient, quota pinned to
`ocg-pipeline` (session env only), core+quota pinned. **Prediction:**
probe B/C return `SERVICE_DISABLED` naming `ocg-pipeline` — at which
point routing is demonstrated, not asserted. If they still name
`ocg-media-acceptance`, the transcript's ADC/quota lines identify the
remaining layer. The root cause is recorded as CONFIRMED only when
that transcript returns; until then it stands as the mechanism that
fits every observed fact, with its test attached.

**Consequences, stated plainly:**
1. Key-ring absence in `ocg-pipeline` stays **UNKNOWN** — and would
   stay UNKNOWN even with perfect routing, because
   `cloudkms.googleapis.com` is disabled in `ocg-pipeline` itself. A
   disabled API proves nothing about existence.
2. **Terraform apply would fail on the KMS resources** for the same
   reason: `cloudkms.googleapis.com` must be enabled in
   `ocg-pipeline` first. That enablement is a **separate, narrow
   founder authorization** (per the founder's boundary: never bundled
   with apply/deployment approval). The authenticated plan may still
   complete (the offline plan required no live KMS reads); the desktop
   run settles that empirically.
3. The verify script (v2.2) now pins the quota project alongside the
   core project for the whole session, so every future transcript
   evaluates consumption against `ocg-pipeline` itself.

## The one command

```powershell
powershell -ExecutionPolicy Bypass -File .\infra\gcp\RENOVISION-DESKTOP-VERIFY.ps1
```

Script: `infra/gcp/RENOVISION-DESKTOP-VERIFY.ps1` **v2.1**, SHA-256
`ef3336ea932dea82e67e97d7a0de1c442f68e9400d293791e85d02c632cb4029`
(pure ASCII; no dynamic command execution; workstation parser/execution
status: NOT VERIFIED until the transcript returns). It aborts if the
active account is not `gocasiorealtor@gmail.com` or the pinned project
cannot be read. Review history: v2 (`df7350a4…`) received a QUINCEY
delta PASS WITH NOTES (PR comment 6504316341) with one LOW note — the
billing-account lookup's stdout could still reach the transcript;
v2.1 closes it by capturing that single lookup with output withheld,
so the billing identifier is never written anywhere, transcript
included.

## Terraform on the desktop (install, §4 of the closeout order)

The desktop lacks Terraform on PATH. Install is local developer
tooling only: download `terraform_1.9.8_windows_amd64.zip` from
`https://releases.hashicorp.com/terraform/1.9.8/`, verify
**SHA-256 `2667de56106bc6707968286357e29c20f8dbbb2f429ef57099b04994f82d9684`**
(official `terraform_1.9.8_SHA256SUMS`, retrieved first-hand
2026-10-29) with `Get-FileHash`, extract, add to PATH. The script
detects absence and reports TERRAFORM-NOT-FOUND without failing the
inventory sections.

## What the script collects

Diagnostics; identity gate; billing enabled (identifier never
printed); enabled APIs; Cloud Run services; bucket names/locations;
Artifact Registry repositories; KMS key rings; service accounts +
project IAM bindings; secret NAMES only; budgets (names/amounts); the
four collision probes with classified outcomes; then
`terraform fmt -check`, `init -backend=false`, `validate`, and an
**authenticated `terraform plan`** against `staging.tfvars` (created
from `infra/gcp/staging.tfvars.example` on first run).

**Expected plan result (hard stop if different):**
`Plan: 8 to add, 0 to change, 0 to destroy`. Any destroy, unexpected
resource, or plan error: return the transcript; attempt no fixes under
this authorization.

## Known inventory from prior verified records (to reconcile against
the transcript; dated, may have changed)

- Artifact Registry repo `cloud-run-source-deploy` exists (2026-10-23) —
  the staging image path reuses it; Terraform creates no repository.
- SA `agent-workspace-staging@ocg-pipeline` and 7
  `agent-workspace-staging-*` secrets exist (2026-10-23) — unrelated
  product; no overlap expected.
- Cloud SQL instance `agent-workspace-staging` existed STOPPED
  (2026-10-23) — unrelated; RENOVISION uses no Cloud SQL.
- Budget "OCG GEO Dev — ocg-pipeline $25 monthly" exists (2026-10-25) —
  a different product's alert; preserve untouched. RENOVISION alerts,
  if any, are separate and are notifications, not spending limits.
- Founder-reported (2026-10-29 closeout order): RENOVISION Cloud Run
  service, evidence bucket, and runtime SA = NOT FOUND in
  `ocg-pipeline`; KMS key ring = **UNKNOWN** (see root cause above).

## Return evidence

The transcript `renovision-verify-<timestamp>.txt` in the desktop
user's home directory. Review checklist on receipt: gate PASS;
diagnostics explain the ambient routing; billingEnabled true; probes
classified (KMS may legitimately read UNKNOWN if the API is disabled —
that is an honest result, not a failure of the pack); plan summary
exactly 8/0/0; exit codes recorded for every command. Until that review
completes, live inventory and the authenticated plan are recorded as
**PREPARED, NOT EXECUTED**.
