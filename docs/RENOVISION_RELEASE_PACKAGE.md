# RENOVISION AI — Consolidated Release Package

**Repository:** TheOCGroup/RENO · **PR:** #3 (Draft — merge NOT authorized)
**Certified baseline:** `75c94ff853522eb34548a98ac2ef2bf43213e46e`
**Code head certified by the QUINCEY delta verdict:** `3162ce518b011687a92e25fc0589a9a7fc004ad8`
**Final head (certified code + additive tests/docs):** local `bcf3208f7c190750d48c718f7bf0f1d7f83aa835`, tree `18d9ecc58b6fc2c3750fb6d1899b094a4e8b61df` (published SHA differs — the Git Data API assigns its own commit ids; tree equality is asserted at publication and recorded in the final report).

## 1. Exact code state

- Remediation delta commits (published): `8ef214da` (Q-OBS-1…4 code),
  `398f885d` (Q-OBS-5 Terraform), `e018039f` (staging/docs),
  `3162ce51` (google-beta provider fix found by Terraform validation).
- Final head: local commit `bcf3208f`, tree `18d9ecc58b6fc2c3750fb6d1899b094a4e8b61df`.
- Post-review additions are tests and documentation only
  (`tests/renovision-acceptance.test.mjs`, this package, validation /
  identity / staging documents). No product code changes after `3162ce51`.

## 2. Automated test totals and CI evidence

- Full suite at final head: **388/388 pass** (381 originally certified +
  4 remediation + 3 consolidated acceptance tests), Node v24.22.1.
- CI (GitHub Actions) on `3162ce51`: RENOVISION Spatial Validation CI
  SUCCESS, Mission Control Gate SUCCESS. CI on the final head is
  re-verified after publication and recorded in the final report.
- Acceptance coverage: full HTTP chain (capture → evidence → review →
  measurements → correction → geometry lock → renovation → furnishing →
  comparison → approval → review packet → digest-verified export),
  tenant isolation, RBAC, JWT/JWKS attacks, revocation, single-use
  tokens, concurrency conflicts (typed 409), persistence, backup/restore,
  restart recovery, tamper detection (evidence, audit chain, export).

## 3. Independent QUINCEY verdict

Delta review of `9c3b3a10..3162ce51` performed by a separate reviewer
agent session (fresh clone, self-run tests and 23 adversarial probes of
its own, Terraform independently installed and validated; identity and
environment disclosed in the verdict itself):
**PASS WITH CONDITIONS** — PR #3 comment **6499261795** (with the
reviewer's own correction comment 6499275908: the delta touches 16
files, not 17 as first stated). No blocking defects. The reviewer
reproduced 385/385 tests at the final code head, CI SUCCESS, all five
observation closures, and the Terraform validate + offline plan result.
Production readiness remains NOT CERTIFIED: GCP unprovisioned, physical
benchmark and device matrix not executed.

## 4. Terraform validation and plan results

Terraform 1.9.8 (local, nonbillable): `fmt -check` PASS ·
`init -backend=false` PASS · `validate` **SUCCESS** · offline plan
(dummy credentials, `-refresh=false`): **8 to add, 0 to change, 0 to
destroy**. Full detail: `docs/RENOVISION_TERRAFORM_VALIDATION_REPORT.md`.
A live plan requires founder-session credentials; no remote backend is
configured (state-location decision documented there).

## 5. GCP project and identity recommendation

Project **`ocg-pipeline`**, region **us-central1** (identified from
records + local configuration; live verification impossible from the
build environment — the only credential is revoked, billing linkage
NOT VERIFIED). IdP: **Firebase Authentication / Google Identity
Platform**; issuer/JWKS values, exact custom-claim payloads
(`tenant_id`, `roles`, `property_ids`), and the fail-closed smoke
checklist: `docs/RENOVISION_GCP_IDENTITY_PREP.md`.

## 6. Verified staging cost estimate

Source-backed rates (Google published pricing, retrieved 2026-10-28):
LOW ≈ **$0.35/mo** · NORMAL ≈ **$12.90/mo** · STRESS ≈ **$185/mo**.
Reconciled against the exact 8 Terraform resources. Bounded acceptance
workload (14-day window): expected **$6–8**, worst credible ≈ **$13** →
the proposed **$15 total is sufficient for that workload only**.
Budget alerts are notifications, not hard limits. Detail + charges
outside the estimate + teardown/residual-charge verification:
`docs/RENOVISION_STAGING_PLAN.md` §8a.

## 7. Staging acceptance and rollback procedure

Staging plan §4 (deployment), §6 (rollback: traffic shift to prior
revision / redeploy prior certified image; teardown: export → destroy →
verify $0 residual for 7 days). Acceptance battery: health identity
mode check, negative security checks (identity prep doc §4), full
operator workflow, export verification, backup/restore drill.

## 8. Physical benchmark and device-testing requirements

`docs/RENOVISION_DEVICE_TEST_PACKAGE.md` (§4: 30-case matrix across 5
platform classes × 6 conditions; §5: benchmark protocol; §5a: exact
hardware kit, four roles, evidence-bundle manifest) and
`docs/RENOVISION_PHYSICAL_BENCHMARK_PROTOCOL.md`. **Status: prepared,
NOT EXECUTED. No synthetic measurement is represented as real-world
spatial accuracy.**

## 9. Exact remaining founder approvals

1. ~~Decide the $15 staging cap~~ — **DECIDED 2026-10-29**: the founder
   approved a $15 *planned spending limit* for the bounded workload
   (PR #3 comment 6503007807). That approval is a budget boundary, NOT
   authorization to spend, provision, or apply — those remain item 3.
2. **Verify in Console:** `ocg-pipeline` billing linkage + intended
   staging home; choose the state backend; supply founder-session GCP
   access for a live plan.
3. **Approve `terraform apply`** for staging (separate from the cap).
4. **Approve the physical benchmark + device sessions** (hardware kit +
   two operators + room) so the 30-case matrix and benchmark can execute.
5. **Merge PR #3** — separate decision, still HOLD.
