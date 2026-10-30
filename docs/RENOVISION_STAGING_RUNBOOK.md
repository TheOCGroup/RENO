# RENOVISION — Staging Deployment, Acceptance, Rollback, Teardown Runbook

**Status: PREPARED, NOT EXECUTED.** Every step below runs only after the
founder's separate, explicit authorization to provision and deploy
staging (the $15 planned limit approval, comment 6503007807, does NOT
authorize any step here). Operator: founder's authenticated desktop
session (`gocasiorealtor@gmail.com`, project `ocg-pipeline`,
us-central1). Time-box: the whole sequence, including teardown, inside
the 14-day bounded acceptance window (staging plan §8a).

## 0. Preconditions (all must be verified, in order)

1. Desktop verification pack transcript reviewed clean: identity gate
   PASS, billing enabled, four collision probes NOT_FOUND,
   authenticated plan exactly 8 adds / 0 changes / 0 destroys.
2. QUINCEY certification stands for the exact code head being deployed
   (see `docs/RENOVISION_RELEASE_PACKAGE.md` §3).
3. Identity Platform / Firebase Auth enabled in `ocg-pipeline` with the
   issuer `https://securetoken.google.com/ocg-pipeline`; demo auth is
   NOT used in cloud deployment under any circumstance.
4. Founder apply authorization recorded for this exact run.

## 1. Build and push the image (Cloud Build, from the desktop)

```powershell
cd <repo>
gcloud builds submit --project ocg-pipeline `
  --tag us-central1-docker.pkg.dev/ocg-pipeline/cloud-run-source-deploy/renovision:3162ce51 .
```

(Repository root Dockerfile builds the certified image. Record the
build id and the resulting image digest in the run evidence.)

## 2. Provision (Terraform apply — the authorized moment)

```powershell
cd infra\gcp
terraform init            # local state for staging; see state note
terraform plan -var-file="staging.tfvars" -input=false   # must still read 8/0/0
terraform apply -var-file="staging.tfvars"               # founder-authorized step
```

Private-access grant (beta requirement — the service is never public):
after apply, grant the Cloud Run invoker role ONLY to the founder and
each explicitly named tester account, and verify no `allUsers` /
`allAuthenticatedUsers` binding exists:

```powershell
gcloud run services add-iam-policy-binding renovision --project ocg-pipeline --region us-central1 `
  --member "user:<founder-or-tester-email>" --role roles/run.invoker
gcloud run services get-iam-policy renovision --project ocg-pipeline --region us-central1
```

(The explicit `--project` on every call is deliberate: this project's
workstation history includes quota/consumer-project routing surprises,
so no command in this runbook relies on ambient session routing.)

State note: staging uses a LOCAL state file on the operator workstation
for this bounded run (no remote backend is configured in the Terraform;
a shared/remote backend is a production-hardening decision for the
founder, recorded in the Terraform validation report). The state file
stays on the desktop; teardown (step 6) runs from the same directory.

## 3. Smoke — identity and access (fail-closed checks)

1. `gcloud run services describe renovision --region us-central1` —
   record URL, latest revision, ingress setting, env identity values.
2. Unauthenticated request to the service → must be rejected (401/403
   at the Cloud Run IAM layer). Any 200 is a STOP condition.
3. Mint a test-operator token with claims from
   `docs/RENOVISION_GCP_IDENTITY_PREP.md` §2 (tenant `tenant-staging-a`,
   roles `["operator"]`, properties as listed) via the Identity
   Platform test user; authenticated `GET /health` → 200 with the
   identity mode reported as production token auth (never demo).

## 4. Acceptance battery (record every result; any FAIL stops escalation)

1. **GCS persistence:** create a project via the API; register a real
   evidence file (a phone photo of the test room); confirm the object
   exists in `gs://ocg-renovision-evidence-staging` with the tenant
   prefix; restart-equivalence: fetch it back in a new session.
2. **Full workflow:** capture → evidence → review → 8 measurements →
   correction → geometry lock → renovation → furnishing → comparison →
   approval (second identity, approver role) → review packet → export;
   verify the export package digest locally.
3. **Cross-tenant isolation:** second tenant token (tenant-staging-b)
   reads the first tenant's project → 404; same project id created
   under both tenants stays independent.
4. **Token security:** expired token → 401; token with a claim edited
   after signing → 401; user disabled in Identity Platform → next
   request rejected per the documented revocation model (short token
   lifetime + optional single-use mode are the live mitigations;
   in-process jti revocation is library-level and covered by automated
   tests, stated honestly in the evidence).
5. **Backup/recovery drill:** export the project; download the evidence
   objects list; delete nothing — simulate loss by pointing a local
   copy of the app at an empty store and restoring from the backup CLI
   exactly as in the automated restore tests.
6. **Dry-run days:** up to 3 days of LOW-intensity operator use inside
   the window; daily cost check against the $15 planned limit
   (`gcloud billing` reports in Console; alerts are notifications only).

## 5. Rollback (if any acceptance step fails materially)

```powershell
# Shift all traffic back to the previous revision (or, on first deploy,
# to zero by removing the service via step 6 teardown):
gcloud run services update-traffic renovision --region us-central1 `
  --to-revisions <previous-revision>=100
```

Code rollback = redeploy the prior certified image tag with the same
procedure. Data is additive (append-only event store; versioned bucket),
so rollback never requires data deletion.

## 6. Teardown (end of window, or immediately on founder order)

```powershell
cd infra\gcp
terraform destroy -var-file="staging.tfvars"   # founder-authorized step
gcloud storage buckets list --project ocg-pipeline   # bucket gone
gcloud run services list --project ocg-pipeline --region us-central1  # service gone
gcloud kms keys list --keyring renovision --location us-central1 --project ocg-pipeline  # keys scheduled for destruction (30-day KMS window is a Google default; note residual state)
```

## 7. Residual verification (7 days after teardown)

- Console billing report for `ocg-pipeline` filtered to the staging
  labels/resources: confirm charges stop; record the final total
  against the $15 planned limit.
- Confirm no RENOVISION resources remain (re-run the four collision
  probes from the verification pack — all must again read NOT_FOUND,
  except KMS keys inside their scheduled-destruction window).
- File the complete evidence set (transcripts, plan/apply outputs,
  battery results, cost screenshots) against PR #3.

## Evidence checklist (the run is complete only when every box is filled)

- [ ] Verification-pack transcript (clean)  - [ ] Plan output 8/0/0
- [ ] Cloud Build id + image digest  - [ ] Apply output
- [ ] Smoke results (unauth rejected; health 200 w/ token)
- [ ] Battery results 1–6 with raw outputs  - [ ] Rollback drill result
- [ ] Destroy output  - [ ] 7-day residual charge confirmation
- [ ] Final spend total vs the $15 planned limit
