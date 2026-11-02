# RENOVISION Founder Beta — Cloud Acceptance Blockers (2026-11-02)

Status: **HOLD — not certified / not authorized for public launch**. This note documents verified findings, not completed remediation.

## Verified live (read-only gcloud)
- Project `ocg-pipeline`, Cloud Run `renovision`, region `us-central1`, ready revision `renovision-00001-pvj`.
- Service invoker IAM lists only `user:gocasiorealtor@gmail.com`. Current CLI identity is `ocglabsict@gmail.com`; these identities must not be silently conflated or IAM expanded.
- Runtime service account: `renovision-runtime@ocg-pipeline.iam.gserviceaccount.com`.
- `identitytoolkit.googleapis.com` enabled; backend initialization and real founder login **not verified**.
- Token environment points to issuer `https://securetoken.google.com/ocg-pipeline`, audience `ocg-pipeline`, Google Secure Token JWKS. These values do not prove working login.

## Source defects requiring remediation
1. `src/renovisionUi.mjs` currently accepts manually pasted bearer tokens and has no production login flow. Implement a founder-authenticated sign-in path, keep authorization claims server-verified, and do not put privileged credentials or service-account keys in browser code.
2. `src/renovisionMain.mjs` configures Google Cloud Storage for evidence only. Project records use `createFileProjectStore`; spatial events use `createDurableSpatialEventStore`. Both write to local disk and are unsuitable for Cloud Run cross-instance persistence. Implement shared durable stores with atomic compare-and-append semantics and tenant scoping; do not silently weaken conflict or authorization checks.
3. Cloud Run invoker IAM and browser identity are distinct security boundaries. Test the actual founder browser flow end to end without making the service publicly invokable as a workaround.

## Release gates
- Confirm Identity Platform initialization and provider setup via authenticated Google Cloud API/console; no assumption based solely on enabled API.
- Verify founder can sign in and invoke private service; negative tests for missing/expired/wrong-issuer tokens, cross-tenant access, unauthorized writes.
- Verify create/open/list projects and spatial events across process restarts and concurrent requests; fail closed on conflicting writes.
- Run automated test suite and browser acceptance on exact candidate SHA, then independent QUINCEY review.
- Benchmark 30 physical measurement cases and retain evidence; no unsupported accuracy claims.
- Preserve existing infrastructure, no duplicate projects, no public rollout, no new paid resources; founder approval for merge/deployment/IAM changes.
