# RENOVISION AI — QUINCEY Observation Remediation Record

Certified baseline: `75c94ff853522eb34548a98ac2ef2bf43213e46e` (unchanged —
this pass is strictly additive on top of documentation HEAD `9c3b3a10`).
Findings source: QUINCEY verdict, PR #3 comment 6472161996
(PASS WITH CONDITIONS, 2026-10-28). This record is builder evidence for the
requested independent delta review; it is **not** a certification.

## Closure evidence

**Q-OBS-1 — Cross-tenant project-id enumeration (LOW) → CLOSED in code.**
Project ids are now a per-tenant namespace: the file project store keys
records by SHA-256(tenant + project id) and verifies the record's tenant on
load; the server keys its in-memory map per tenant and resolves through the
caller's tenant only. Creating a project with an id that exists in another
tenant now succeeds independently (no existence signal); a duplicate inside
the caller's own tenant still returns 409. Cross-tenant reads remain 404.
Regression: `tests/renovision-remediation.test.mjs` OBS-1 (two tenants,
same id, independent records, own-tenant duplicate 409) + persistence test
asserts cross-tenant `load` returns null.

**Q-OBS-2 — Generic concurrent-write error (LOW) → CLOSED in code.**
Workflow proposal failures from the transactional store are now classified:
revision/append conflicts throw a typed error
(`code: SPATIAL_EVENT_CONFLICT`, `errors: ["spatial_event_conflict", …]`),
and the HTTP layer maps them to **409 `{ok:false, conflict:true,
errors:["spatial_event_conflict"]}`**. Non-conflict failures keep their
existing 422 shape. Regression: OBS-2 test — two concurrent proposals
commit exactly one event; the loser receives the typed conflict.

**Q-OBS-3 — Bearer replay (NOTE) → safeguards implemented + limitations
documented.** The authenticator gains optional single-use token ids
(`singleUseJti`, enabled by `RENOVISION_TOKEN_SINGLE_USE=1`): each `jti`
authenticates exactly once; tokens without a `jti` are rejected in that
mode; seen ids expire with their tokens. Default remains standard bearer
behavior. `docs/RENOVISION_ENVIRONMENT_MANIFEST.md` now documents the
replay model, the safeguards, and the limitations (client flow friction,
in-process revocation state, recommended ≤ 15-minute operator token
lifetimes). Regression: OBS-3 test (replay rejected in strict mode, fresh
`jti` accepted, default mode unchanged).

**Q-OBS-4 — Filesystem evidence write authorization (NOTE) → CLOSED in
code.** Reviewer note refined during implementation: the filesystem
adapter already invoked its authorize callback on writes; the true gap was
that it accepted unscoped writes (tenant stored as null) where GCS fails
closed. `put` now requires a non-empty artifact tenant id
("tenant-scoped evidence required") before authorization, matching GCS.
Regression: OBS-4 test (unscoped write rejected; denied write rejected;
scoped authorized write accepted). Existing durable/storage suites updated
to tenant-scoped artifacts.

**Q-OBS-5 — Terraform ingress/CMEK (NOTE) → CLOSED in configuration.**
`infra/gcp`: Cloud Run ingress is now `var.run_ingress` defaulting to
`INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER`; scaling pinned min 0 /
max `var.max_instances` (2); the evidence bucket uses CMEK
(KMS key ring + key, 90-day rotation, Cloud Storage service agent granted
encrypter/decrypter on that key only); google-beta provider declared for
the service-identity resource. `terraform validate` was NOT RUN (no
Terraform binary in the build environment) — HCL was reviewed by
inspection; validation is a required pre-apply step.

## Verification

- Full suite after remediation: **385/385 pass** (381 certified baseline
  tests + 4 new remediation tests; existing tests updated only where the
  hardened contracts require scoped inputs).
- Isolated runs: remediation 4/4, identity 9/9, server-security 6/6,
  persistence 5/5, storage-hardening 5/5, durable-evidence 6/6,
  server 4/4.
- CI: recorded in the final report (both workflows on the new head).
- Device matrix + physical benchmark: prepared
  (`docs/RENOVISION_DEVICE_TEST_PACKAGE.md`), **NOT EXECUTED**.

## Staging preparation

`docs/RENOVISION_STAGING_PLAN.md`: source-backed cost estimate
(LOW ≈ $0.35/mo, NORMAL ≈ $12.90/mo, STRESS ≈ $185/mo), deployment
instructions, rollback, teardown, safeguards, and the proposed — **not
approved** — $15 spending cap for founder decision.
