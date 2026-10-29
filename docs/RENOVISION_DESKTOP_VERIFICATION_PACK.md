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

## KMS project-mismatch — root cause and resolution (2026-10-29)

**Observed:** three collision probes (Cloud Run service, evidence
bucket, runtime service account) returned NOT FOUND for `ocg-pipeline`,
but the KMS key-ring probe produced an interactive prompt offering to
enable the Cloud KMS API in **`ocg-media-acceptance`** — a different
project.

**Root cause (evidence-based):** an API-enablement prompt names the
project gcloud resolved for that command, and it only appears in an
interactive shell when the API is disabled in the resolved project.
`ocg-media-acceptance` is the OCG MEDIA acceptance project whose
workstation execution ran on this same desktop on 2026-10-28 — the
desktop's ambient gcloud routing (active configuration and/or a
`CLOUDSDK_CORE_PROJECT`-style override in that shell) pointed at it when
the KMS probe ran, outside the pinned context the other checks used.
The prompt is therefore evidence of **command routing**, not of
anything about `ocg-pipeline`. Two consequences, stated plainly:

1. The KMS result is **UNKNOWN**, not "absent": a disabled-API or
   permission outcome can never prove a resource does not exist.
2. Whether `cloudkms.googleapis.com` is enabled in `ocg-pipeline`
   itself is also unknown until the inventory runs — if it is disabled
   there too, key-ring absence stays UNKNOWN until enablement is
   separately authorized (Terraform's apply would surface an
   ALREADY_EXISTS error if a ring somehow existed; the plan does not
   depend on proven absence).

**Resolution (script v2):** routing is pinned for the whole session
(`CLOUDSDK_CORE_PROJECT=ocg-pipeline`) AND every call carries an
explicit `--project`; prompts are disabled
(`CLOUDSDK_CORE_DISABLE_PROMPTS=1`), so a disabled API fails closed
with an error instead of offering enablement; a diagnostics section
prints the ambient configuration/env state first, so any future
mismatch explains itself in the transcript; probe outcomes are
classified **PASS (absent) / FAIL (exists) / UNKNOWN (denied or
disabled — proves nothing)**; every command's exit code is recorded.

## The one command

```powershell
powershell -ExecutionPolicy Bypass -File .\infra\gcp\RENOVISION-DESKTOP-VERIFY.ps1
```

Script: `infra/gcp/RENOVISION-DESKTOP-VERIFY.ps1` **v2**, SHA-256
`df7350a42e31a9c2672fc842da2229d7ea0fc18212ab919ad4335bc932f0d260`
(pure ASCII; no dynamic command execution; workstation parser/execution
status: NOT VERIFIED until the transcript returns). It aborts if the
active account is not `gocasiorealtor@gmail.com` or the pinned project
cannot be read.

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
