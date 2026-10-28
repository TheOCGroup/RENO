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
