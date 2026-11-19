# RENOVISION — Terraform Validation & Offline Plan Report

Executed 2026-10-29 under the founder's preparation-only authorization
(PR #3 comment 6479502753). Tooling: Terraform **1.9.8** installed locally
in the development environment (no cloud account used, no charges).
Configuration: `infra/gcp/` at the reviewed head.

## Results

| Step | Result |
|---|---|
| `terraform fmt -check -diff` | **PASS** (exit 0, no diffs) |
| `terraform init -backend=false` | **PASS** (providers hashicorp/google + google-beta 5.45.2 installed from the public registry) |
| `terraform validate` | **PASS** — "Success! The configuration is valid." |
| `terraform plan -refresh=false` (offline, dummy credentials) | **PASS** — `Plan: 8 to add, 0 to change, 0 to destroy`, no errors |

## Defect found and fixed by this validation

The first offline plan failed on `google_project_service_identity.storage`:
the `google-beta` provider had no explicit `project`/`region` configuration.
Fixed by adding an explicit `google-beta` provider block (one file,
`infra/gcp/main.tf`); fmt/validate/plan all pass after the fix. The fix is
part of the delta under QUINCEY review.

## Planned resources (8)

1. `google_service_account.renovision_runtime` — least-privilege runtime identity.
2. `google_kms_key_ring.renovision` + 3. `google_kms_crypto_key.evidence` (90-day rotation).
4. `google_project_service_identity.storage` + 5. `google_kms_crypto_key_iam_member.storage_cmek` (storage service agent: encrypter/decrypter on this key only).
6. `google_storage_bucket.evidence` — private, uniform access, public-access prevention enforced, versioning, CMEK, lifecycle backstop.
7. `google_storage_bucket_iam_member.runtime_object_admin` — runtime SA, this bucket only.
8. `google_cloud_run_v2_service.renovision` — ingress internal+LB (default), scaling min 0 / max 2, token identity env, GCS evidence env.

## What a real plan/apply still requires (founder-session items)

- **Credentials + project IAM:** a real `terraform plan` against the
  project needs an authenticated principal with read access; `apply`
  needs write IAM for the resource types above. This environment's only
  GCP credential is revoked (see the GCP/identity preparation doc), so the
  live plan is a founder-session step.
- **Backend:** the configuration declares **no remote backend** — state
  would be local by default. Before any apply, the founder should decide
  the state location (recommended: a dedicated GCS state bucket with
  locking, created in the founder session) — local-only state on one
  machine is a loss risk.
- **No remote API calls were made** by the offline plan: it used a
  locally generated dummy credential and `-refresh=false`; nothing was
  read from or written to any GCP project, and nothing was provisioned.
