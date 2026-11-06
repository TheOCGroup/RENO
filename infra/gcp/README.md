# RENOVISION on Google Cloud — deployment plan (PREPARED, NOT APPLIED)

**Status: NOT PROVISIONED.** Founder authorization is required before any step
that creates resources or incurs cost. No Vercel, Base44 or Floot anywhere in
this path.

## What this creates (on approval)

1. `renovision-runtime` service account — least privilege.
2. One private evidence bucket: uniform bucket-level access, public access
   prevention enforced, versioning on, lifecycle delete backstop
   (`evidence_retention_days`), and **CMEK** via a dedicated KMS key
   (90-day rotation; the Cloud Storage service agent holds
   encrypter/decrypter on that key only). The runtime account gets
   `roles/storage.objectAdmin` on this bucket only.
3. Cloud Run service `renovision` running the repository's server with token
   identity configured (issuer/audience/JWKS from the founder's identity
   provider — Firebase / Google Identity Platform fits the approved
   architecture). **Ingress defaults to internal + load balancer**
   (`var.run_ingress`); public ingress is a deliberate founder choice, not
   a default. Scaling is pinned `min 0 / max var.max_instances (2)` as a
   cost safeguard. Smoke tests run through an authorized
   `gcloud run services proxy` session or the load-balancer path.

## Apply procedure (founder-approved session only)

1. `terraform init && terraform plan -var-file=founder.tfvars` — review plan.
2. `terraform apply` — creates bucket, account, IAM, service.
3. Point the service: `RENOVISION_GCS_BUCKET` is wired from the bucket;
   identity claims must carry `tenant_id`, `roles`, `property_ids`
   (custom claims set by the founder's provisioning process).
4. Smoke: `GET /health` → `identityMode: "token"`, `evidenceStorageClass:
   "durable-gcs"`; run the negative checks in
   `docs/RENOVISION_DEVICE_TEST_PACKAGE.md` against the deployed URL.
5. Independent QUINCEY review of the deployed configuration before any
   production traffic.

## Rollback

- Application: redeploy the previous container image revision
  (`gcloud run services update-traffic` to the prior revision), or roll back
  the Git branch to the previous certified commit and rebuild.
- Infrastructure: `terraform destroy` removes the service and IAM; bucket
  deletion is blocked by `force_destroy = false` — evidence must be exported
  (project export packages) and the founder must explicitly approve bucket
  removal.

## Backup / recovery

Job data (filesystem mode) and bucket contents: use
`node scripts/renovision-backup.mjs` for data directories; bucket versioning
protects against accidental object deletion inside the retention window.

## Current private Founder Beta — configuration preservation gate (2026-11-05)

The original PREPARED/NOT PROVISIONED text above is historical and does not describe the deployed private Founder Beta. The last reported serving revision is `renovision-00007-4ts`; independently confirm live state before every change.

The canonical Terraform source includes `web_api_key_enabled` (default `false`) and sensitive `web_api_key` (default empty). **Those defaults are not safe for a live browser-authenticated deployment.** A fresh operator directory or a repo-refreshed deployment without both operator-local settings can remove `RENOVISION_WEB_API_KEY` and break sign-in, even when the Terraform plan shows only one in-place Cloud Run service change. A plan count alone is NOT an adequate gate.

Before any authorized plan or apply, verify without printing values:

1. The secured operator tfvars explicitly set `web_api_key_enabled = true` and a nonempty `web_api_key`. Keep tfvars/state/backups outside Git and protect access.
2. Inspect the JSON plan and assert the Cloud Run service's *planned* environment names contain `RENOVISION_WEB_API_KEY`, that its value is not empty, and that the planned image digest, ingress, service account, IAM and other resources remain authorized. Do not print or persist sensitive plan fields in logs.
3. Stop before apply on any mismatch. After apply, verify browser sign-in and run a fresh plan requiring `No changes`.
4. Existing rollback revisions are not equivalent for sign-in: `00006-b5c` and `00002-tpc` were reported without the browser API key; recheck any rollback candidate's config before routing traffic.

No deploy, apply, or PR merge is authorized by this documentation. Physical accuracy validation and founder interactive sign-in remain separate acceptance gates.

### Optional fail-closed plan inspection (no apply)

For the narrow one-service key-reconciliation case only, save the Terraform plan securely and run:

```sh
terraform show -json secured.plan | node scripts/renovision-terraform-plan-guard.mjs sha256:<64-character-approved-image-digest>
```

Run this command from the repository root. The inspector checks for exactly one Cloud Run service update, the approved unchanged image digest, a nonempty web key, and no unrelated service-field drift; it prints only PASS or a generic failure reason. **It does not authorize apply**, and it intentionally rejects normal image upgrades or a no-change plan. Keep plan files private because `terraform show -json` can contain sensitive values. Never upload plan JSON to CI or commit it.
