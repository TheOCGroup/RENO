# RENOVISION Founder Beta — Cloud Acceptance Blockers (2026-11-02)

Status: **HOLD — not certified / not authorized for public launch**. This is a living acceptance register. Source changes described below are present in PR #3 only, not the deployed Cloud Run revision.

## Verified live (read-only gcloud)
- Project `ocg-pipeline`, Cloud Run `renovision`, region `us-central1`, ready revision `renovision-00001-pvj`.
- Service invoker IAM lists only `user:gocasiorealtor@gmail.com`. Current CLI identity is `ocglabsict@gmail.com`; these identities must not be silently conflated or IAM expanded.
- Runtime service account: `renovision-runtime@ocg-pipeline.iam.gserviceaccount.com`.
- `identitytoolkit.googleapis.com` enabled; backend initialization and real founder login **not verified**.
- Token environment points to issuer `https://securetoken.google.com/ocg-pipeline`, audience `ocg-pipeline`, Google Secure Token JWKS. These values do not prove working login.

## Source defects requiring remediation
1. `src/renovisionUi.mjs` currently accepts manually pasted bearer tokens and has no production login flow. Implement a founder-authenticated sign-in path, keep authorization claims server-verified, and do not put privileged credentials or service-account keys in browser code.
2. **Implemented in PR #3, live acceptance outstanding:** `src/renovisionMain.mjs` now selects `createGcsProjectStore` and `createGcsSpatialEventStore` when `RENOVISION_GCS_BUCKET` is set. Project writes use GCS generation preconditions and typed 409 conflicts; spatial event append uses generation preconditions and tenant-scoped object keys. Simulated simultaneous-writer tests pass. Existing deployed revision has not been promoted to this source; real GCS read/write, restart, and concurrency acceptance are still mandatory.
3. Cloud Run invoker IAM and browser identity are distinct security boundaries. Test the actual founder browser flow end to end without making the service publicly invokable as a workaround.

## Verification updates (2026-11-02)
- PR #3 candidate `875898a385b21da06d2ca8de3e59bbac92f474e9`: 400/400 local tests passed; RENOVISION Spatial Validation CI and Mission Control Gate both succeeded.
- Live Cloud Run revision remains `renovision-00001-pvj`; bucket `ocg-renovision-evidence-staging` exists and runtime service account has `roles/storage.objectAdmin`. Configuration inspection is **not** a live adapter test.
- Read-only Identity Toolkit project configuration request using `ocglabsict@gmail.com` returned HTTP 403. Provider configuration remains **unverified**, not necessarily absent.
- Cloud Run invoker IAM remains restricted to `user:gocasiorealtor@gmail.com`. No IAM, deployment, or storage mutations performed.

## Release gates
- Confirm Identity Platform initialization and provider setup via authenticated Google Cloud API/console; no assumption based solely on enabled API.
- Verify founder can sign in and invoke private service; negative tests for missing/expired/wrong-issuer tokens, cross-tenant access, unauthorized writes.
- Verify create/open/list projects and spatial events across process restarts and concurrent requests; fail closed on conflicting writes.
- Run automated test suite and browser acceptance on exact candidate SHA, then independent QUINCEY review.
- Benchmark 30 physical measurement cases and retain evidence; no unsupported accuracy claims.
- Preserve existing infrastructure, no duplicate projects, no public rollout, no new paid resources; founder approval for merge/deployment/IAM changes.
