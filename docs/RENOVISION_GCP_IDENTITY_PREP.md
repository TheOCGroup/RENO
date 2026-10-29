# RENOVISION — GCP Project & Identity Preparation (read-only findings)

Prepared 2026-10-29 under the founder's preparation-only authorization.
Nothing was created, linked, or provisioned.

## 1. Project identification

**Identified project: `ocg-pipeline`** — evidence:
- The development environment's gcloud configuration names
  `project = ocg-pipeline` (account `muse-certifier@ocg-pipeline.iam.gserviceaccount.com`).
- OCG's prior GCP staging work (2026-10-23) executed in `ocg-pipeline`,
  region **us-central1**: a runtime service account and an Artifact
  Registry repository were created and verified there at that time.

**Live verification status: SUPERSEDED IN PART (2026-10-29).** The
founder's connected desktop verified (PR #3 comment 6503007807):
project `ocg-pipeline`, `billingEnabled: true`, billing account linked,
active CLI identity `gocasiorealtor@gmail.com`. Remaining live items
(APIs, IAM, resource inventory, authenticated plan) run through
`docs/RENOVISION_DESKTOP_VERIFICATION_PACK.md`. From THIS build
environment, live verification remains impossible: the only
available GCP credential (the certifier service account) is revoked —
read-only probes on 2026-10-29 fail with
`invalid_grant: Invalid JWT Signature`. Project lifecycle state and
enabled services therefore cannot be confirmed from here.
**Founder console checks before any apply decision (billing item
already satisfied by the 6503007807 desktop verification):**
1. Console → project `ocg-pipeline`: confirm it is the intended staging home.
2. ~~Console → Billing linkage~~ — VERIFIED 2026-10-29 via the founder
   desktop session (billingEnabled: true, account linked).
3. Console → APIs: note which of run/storage/kms/artifactregistry/
   identitytoolkit APIs are already enabled (enabling happens at apply
   preparation, not now).

**Region:** us-central1 (matches all prior OCG GCP work and the
Terraform default; Tier 1 Cloud Run pricing).

## 2. Identity provider recommendation

**Firebase Authentication / Google Identity Platform in `ocg-pipeline`.**
It issues the RS256 ID tokens this service already verifies:
- Issuer: `https://securetoken.google.com/ocg-pipeline`
- JWKS: `https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com`
- Audience: the Firebase project id (`ocg-pipeline`) — set
  `RENOVISION_TOKEN_AUDIENCE` accordingly, or configure a custom audience
  mapping if the founder prefers `renovision-api`.

## 3. Custom claims — exact preparation (founder/IdP-admin step, NOT done)

The service reads `tenant_id`, `roles`, `property_ids` (and optional
`room_ids`) from verified tokens. Claims are set with the Firebase Admin
SDK by a founder-controlled process — never by clients. Test-operator
claim payloads to prepare:

```json
// operator (tenant-a, property-1)
{"tenant_id": "tenant-a", "roles": ["operator"], "property_ids": ["property-1"]}
// approver
{"tenant_id": "tenant-a", "roles": ["approver"], "property_ids": ["property-1"]}
// viewer
{"tenant_id": "tenant-a", "roles": ["viewer"], "property_ids": ["property-1"]}
// second-tenant operator (isolation checks)
{"tenant_id": "tenant-b", "roles": ["operator"], "property_ids": ["property-1"]}
```

## 4. Fail-closed verification checklist (run at staging smoke)

All are already enforced in code and covered by automated tests; re-run
against the live staging URL before acceptance:
- No token → 401. Expired token → 401. Wrong audience/issuer → 401.
- Service refuses to start without JWKS/issuer/audience configuration.
- Cross-tenant project read → 404; unentitled property → 403.
- Viewer write attempt → 403; evidence read by another tenant → denied.
- Health endpoint reports `identityMode: "token"` (never `demo`).

## 5. What was NOT done

No identities created, no claims set, no APIs enabled, no buckets,
services, secrets, or resources created; no billing linked or changed.
