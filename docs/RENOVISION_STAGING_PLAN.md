# RENOVISION AI — GCP Staging Plan, Cost Estimate, and Founder Decision Package

**Status: PREPARATION ONLY.** Nothing in this document has been executed. No
Terraform apply, no provisioning, no deployment, no charges. The proposed
$15 spending cap is **NOT APPROVED** — it is a founder decision (see §6).

Region basis: `us-central1` (Cloud Run Tier 1 pricing). Rates retrieved
2026-10-28 from Google's published pricing pages (sources in §7). Prices
change; re-verify at activation.

## 1. What staging would run

Exactly the Terraform in `infra/gcp/`: one Cloud Run service (1 vCPU /
512 MiB assumed, min instances 0, **max instances 2**), one private CMEK
evidence bucket (versioning on, lifecycle delete backstop), one runtime
service account (objectAdmin on that bucket only), one KMS key ring/key,
Artifact Registry for the container image, Secret Manager available if
needed (the service itself needs no stored secrets — identity is token
verification against the IdP JWKS), Identity Platform / Firebase Auth as
the token issuer (founder's project choice), Cloud Logging/Monitoring
defaults.

## 2. Unit rates used (Google published, retrieved 2026-10-28)

| Item | Rate | Free allowance |
|---|---|---|
| Cloud Run CPU (request-based, Tier 1) | $0.000024 / vCPU-second | 180,000 vCPU-s / month |
| Cloud Run memory | $0.0000025 / GiB-second | 360,000 GiB-s / month |
| Cloud Run requests | $0.40 / million | 2,000,000 / month |
| GCS Standard storage (regional) | $0.020 / GB-month | 5 GB (Always Free, US regions) |
| GCS Class A ops (writes) | $0.005 / 1,000 | 5,000 / month |
| GCS Class B ops (reads) | $0.004 / 10,000 | 50,000 / month |
| Internet egress | $0.12 / GB (first 1 TB) | uploads free; same-region GCP traffic free |
| Artifact Registry | $0.10 / GB-month | 0.5 GB |
| Secret Manager | $0.06 / active version-month; $0.03 / 10k accesses | 6 versions; 10k accesses |
| Cloud KMS | $0.06 / key-version-month; $0.03 / 10k crypto ops | — |
| Cloud Logging ingestion | $0.50 / GiB | 50 GiB / project / month |
| Cloud Monitoring | $0 for native GCP metrics at this scale | — |
| Identity Platform | $0 at staging scale (handful of test users, within free MAU allowances — re-verify plan terms at activation) | — |
| Cloud Build | $0.003 / build-minute | 120 build-minutes / day |

## 3. Scenario estimates (per 30-day month)

Assumptions: request-based billing; average billed request duration as
stated; a concurrency factor converts requests × duration into billed
instance-seconds (overlapping requests share an instance).

**LOW — smoke tests only** (20k requests, 150 ms avg, 2 GB evidence,
~1 GB egress): Cloud Run $0.00 (inside free tier) · GCS $0.28 · AR $0.00 ·
KMS/Secrets ≈ $0.06 · Logging $0.00 → **≈ $0.35 / month**

**NORMAL — active staging** (3M requests, 250 ms avg, concurrency factor
0.6 → 450k billed vCPU-s; 50 GB evidence; 1M storage ops; 20 GB egress;
2 GB images): Cloud Run $6.88 (CPU $6.48 + requests $0.40, memory inside
free tier) · GCS $5.64 · AR $0.15 · KMS/Secrets ≈ $0.25 · Logging $0.00
(under 50 GiB) → **≈ $12.90 / month**

**STRESS — deliberate load-test week** (20M requests, 300 ms avg, factor
0.7 → 4.2M billed vCPU-s; 500 GB evidence; 10M storage ops; 200 GB egress;
80 GiB logs): Cloud Run $108.03 · GCS $61.00 · AR $0.95 · Logging $15.00 ·
KMS/Secrets ≈ $0.50 → **≈ $185 / month**. A stress event is scheduled and
supervised, never steady state; see the structural bound in §5.

One-time items: container builds ≈ $0 (inside the daily free build
minutes). Backup copies live in the same bucket/region (versioning) — no
separate backup service cost at staging scale; an optional second backup
bucket would add its storage at the same $0.020/GB-month rate.

## 4. Deployment instructions (execute ONLY after founder approval)

1. Founder approves: the spending cap (§6), the GCP project, and the IdP.
2. Configure IdP custom claims for test operators (`tenant_id`, `roles`,
   `property_ids`) per `docs/RENOVISION_ENVIRONMENT_MANIFEST.md`.
3. `cd infra/gcp && terraform init && terraform plan -var-file=staging.tfvars`
   — review the plan output line by line before any apply.
4. `terraform apply` (creates bucket + KMS + service account + Cloud Run).
5. Build + push the container image to Artifact Registry; set
   `container_image`; apply again.
6. Smoke (service is internal-ingress by default): use an authorized
   `gcloud run services proxy` session or the load-balancer path —
   `GET /health` must show `identityMode: "token"` and
   `evidenceStorageClass: "durable-gcs"`; then run the negative checks in
   `docs/RENOVISION_DEVICE_TEST_PACKAGE.md` (cross-tenant 404, viewer 403,
   expired token 401) and one full capture→export workflow.
7. QUINCEY live-environment review of the deployed staging before any
   production conversation.

## 5. Safeguards (structural, not aspirational)

- **Scale ceiling:** Terraform pins `min_instance_count = 0`,
  `max_instance_count = 2`. Even pinned busy 24×7 for 30 days, two
  instances bound Cloud Run compute to ≈ **$131/month**; realistic staging
  sits far below.
- **Budget alerts:** create a billing budget at the approved cap with
  alerts at 50% / 90% / 100% to the founder before apply.
- **Ingress:** internal + load balancer only (Terraform default); no
  public unauthenticated path is created.
- **Retention:** bucket lifecycle backstop + adapter retention purge bound
  storage growth.
- **Time-box:** staging is a validation window, not a standing
  environment; teardown (§6 of `infra/gcp/README.md` + below) runs at the
  end of the window.

## 6. Rollback and teardown

- Rollback: shift Cloud Run traffic to the previous revision
  (`gcloud run services update-traffic --to-revisions`), or redeploy the
  previous certified image. Application data format is unchanged by this
  remediation pass for evidence/events; project records written by newer
  code remain readable by the certified baseline (additive fields).
- Teardown: export any needed project packages (digest-bound export),
  `terraform destroy` (bucket deletion additionally requires emptying the
  bucket — `force_destroy = false` by design), delete the Artifact
  Registry images, disable the IdP test users. Verify $0 residual
  resources in the console.

## 7. Proposed spending cap — FOUNDER DECISION REQUIRED

**Proposal (NOT approved): $15 for the staging validation window.**
Basis: NORMAL scenario ≈ $12.90/month; LOW ≈ $0.35. The cap covers a
normal staging month with headroom, does NOT cover a stress event
(≈ $185) — load testing beyond smoke level needs a separate approval.
Safeguards above (max instances, budget alerts, time-box, teardown) are
the enforcement package for the cap.

## 8a. Reconciliation against the exact Terraform (2026-10-29)

The validated Terraform plans exactly **8 resources** (see
`docs/RENOVISION_TERRAFORM_VALIDATION_REPORT.md`): Cloud Run service,
evidence bucket, runtime service account + one bucket IAM binding, KMS
key ring + key + one service-agent grant + storage service identity.
Every estimate line maps to one of these: Cloud Run (service), GCS
(bucket), KMS (key), Artifact Registry (image storage — created at build
time, not in this Terraform), Secret Manager ($0 — no secrets are stored;
identity is token verification), Logging/Monitoring (platform defaults),
Identity Platform ($0 at test scale). No database, no load balancer, no
VPC connector is in scope or in the estimate.

**Bounded staging acceptance workload (the workload the $15 proposal is
judged against):** apply → smoke checks → the full HTTP operator battery +
negative security checks from the identity preparation doc → up to 3 days
of intermittent team/device dry-run traffic at or below LOW intensity →
export/backup verification → teardown, all inside a **14-day window**.

**$15 adequacy verdict:** expected cost for that workload ≈ **$6–8**
(run-rate at LOW ≈ $0.35/mo prorated, plus builds, KMS/secrets ≈ $0.30,
headroom for NORMAL-intensity days ≈ $0.43/day). Worst credible case —
the full 14 days at NORMAL intensity — ≈ **$13**, still inside $15.
**$15 is sufficient for the bounded acceptance workload.** It is NOT
sufficient for: a full month at NORMAL ($12.90 — marginal), any STRESS
load (≈ $185/mo run-rate), or an un-torn-down environment left running
(the run-rate continues until teardown).

**Charges that could fall outside the estimate:** taxes; Cloud Logging
beyond 50 GiB if request logging is verbose during debugging; egress
spikes from repeated evidence downloads; KMS operations at load-test
volume; any support plan; costs from a delayed teardown.

**Budget alerts — limitation stated plainly:** Google Cloud budgets send
notifications (and can trigger Pub/Sub) at threshold percentages of
actual or forecasted spend. They are **not hard limits**: billing data
lags by hours, alerts do not stop resources by themselves, and an
automatic shutoff requires a separate budget→Pub/Sub→function automation
that is **not** in this Terraform and would need its own founder
approval. The real cost controls here are structural: max 2 instances,
scale-to-zero, internal ingress, the 14-day time-box, and teardown.

**Time-boxed shutdown + residual-charge verification:** at window end —
traffic to zero (delete the Cloud Run service or `terraform destroy`),
empty + delete the evidence bucket, delete Artifact Registry images,
disable test IdP users, then verify for 7 days: (1) billing report for
the project shows no new RENOVISION line items after teardown day;
(2) console inventory shows zero of the 8 resources; (3) KMS key
scheduled for destruction (30-day crypto-shredding window is free of
storage charges once scheduled — confirm state in console).

## 8. Sources

- Cloud Run pricing — cloud.google.com/run/pricing (Tier 1 request-based
  rates + free tier), retrieved 2026-10-28.
- Cloud Storage pricing — cloud.google.com/storage/pricing (Standard
  regional storage, Class A/B operations, egress tiers), 2026-10-28.
- Artifact Registry pricing — cloud.google.com/artifact-registry/pricing
  ($0.10/GB-month, 0.5 GB free), 2026-10-28.
- Secret Manager pricing — cloud.google.com/secret-manager/pricing
  ($0.06/version-month, $0.03/10k accesses, free allowances), 2026-10-28.
- Cloud KMS pricing — cloud.google.com/kms/pricing ($0.06/key-version,
  $0.03/10k operations), 2026-10-28.
- Cloud Logging pricing — cloud.google.com/logging/pricing ($0.50/GiB,
  50 GiB free), 2026-10-28.
