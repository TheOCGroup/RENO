# RENOVISION AI — QUINCEY Independent Review Request

**From:** MUSE (implementation lane) · **To:** QUINCEY (independent QA)
**Subject:** TheOCGroup/RENO, draft PR #3, branch
`research/renovision-accuracy-contract-20261022`. The exact commit SHA under
review is recorded in the PR comment carrying this request and in
`docs/RENOVISION_RELEASE_CANDIDATE.md`. If the head moves after this request,
the request is void for the new head — review only the named commit.

**MUSE does not certify this build.** This request asks for the independent
verdict the release gate requires.

## Scope of review requested

1. Architecture and security — identity boundary (JWKS/RS256 verification,
   fail-closed startup), RBAC + tenant/property/room entitlements, forged
   header and replay handling, no credentials in logs.
2. Tenant isolation — API, evidence storage, event store, project store;
   horizontal escalation attempts.
3. Evidence integrity — digest binding from frame → manifest → registration;
   corrupt/tampered evidence behavior; export package digest + audit chain.
4. Geometry preservation — lock digest binding, post-lock correction unlock,
   preview binding to the lock, comparison surfacing unapproved structural
   changes.
5. Approval enforcement — trusted approval gate, no self-approval without
   delegation, transactional log outcomes (committed/conflict/denied paths).
6. UI and API integration — full operator workflow over HTTP incl. restart
   recovery and resumable sessions.
7. Storage durability — atomic writes, concurrent puts, retention purge on
   both adapters, backup/verify/restore evidence.
8. Test coverage and CI — 381 automated tests (296 contract baseline
   untouched + 85 added across the two implementation passes); both GitHub
   workflows on the named commit.
9. Device and physical benchmark readiness — harness, schemas and procedures
   in `docs/RENOVISION_DEVICE_TEST_PACKAGE.md`. The device matrix and the
   physical room benchmark are **NOT RUN**; readiness review only, no accuracy
   verdict is requested or implied.
10. Release and rollback controls — `docs/RENOVISION_RELEASE_CANDIDATE.md`,
    `infra/gcp/README.md` (rollback + backup procedures).

## Known limitations (declared up front)

- GCS adapter is verified only against injected fake transports — no real
  bucket exists (provisioning is founder-gated).
- Demo identity mode exists for local development behind an explicit env
  flag; production mode is token-only and the process refuses to start
  unconfigured.
- Approvals registry in the demo entry is in-memory; the approval *gate*
  semantics are the certified modules', the registry is a deployment choice.
- Photorealistic rendering is disabled (flag + founder approval + provider
  all absent by design).
- The three failing Netlify App checks on the PR are a pre-existing site
  deploy-preview failure (since 2026-10-22, identical on baseline); evidence
  and disposition are in `docs/RENOVISION_IMPLEMENTATION_STATUS.md`.

## Evidence index

- Status record: `docs/RENOVISION_IMPLEMENTATION_STATUS.md`
- Environment manifest: `docs/RENOVISION_ENVIRONMENT_MANIFEST.md`
- Device/benchmark package: `docs/RENOVISION_DEVICE_TEST_PACKAGE.md`
- Release candidate: `docs/RENOVISION_RELEASE_CANDIDATE.md`
- Spatial accuracy contract: `RENOVISION_SPATIAL_ACCURACY_CONTRACT.md`
