# RENOVISION — Design Platform Release Package

Status: RELEASE-READY CANDIDATE — NOT MERGED, NOT DEPLOYED. Nothing in this
package authorizes a merge, a deployment, a provider activation, or an
accuracy claim. Exact approvals still required are listed in section 7.

## 1. Candidate identity

- Repository: `TheOCGroup/RENO`, draft PR #3, branch
  `research/renovision-accuracy-contract-20261022`.
- Certified PR candidate head: `a969e9c6970109e0e5823a4db166edfd55e71014`
  (QUINCEY CERTIFIED WITH NOTES, PR comment `6962434529`). It is NOT
  directly mergeable: main advanced, and the verified reconciliation
  (`7c45127`, QUINCEY-verified, comment `6963153356`) plus all completion
  work below exist on a local dev branch only, under a founder HOLD
  (2026-11-17): nothing pushed, merged, or deployed.
- Completion candidate: the dev branch head recorded in the handoff that
  accompanies this package (verify with `git rev-parse HEAD`;
  certifications attach to exact heads — any later commit, including
  documentation, creates a new candidate). Release path: founder lifts
  the HOLD naming the dev head → it is pushed to PR #3 → QUINCEY certifies
  that exact pushed head → merge only on a further authorization naming
  it.
- Lineage: certified Founder Beta (`cf22707f`, deployed) → design platform
  (`380b944c`, QUINCEY CERTIFIED WITH NOTES) → remediation (`2694251b`,
  C-1 discharged) → C-2 repairs + U-6 (`a969e9c6`, certified) → main
  reconciliation (`7c45127`, verified) → completion workstreams
  (concept history, accessibility, CX, reliability — section 2).

## 2. What the candidate adds over the deployed Founder Beta

- Interactive 2D room designer: openings with conservative door-swing zones,
  window zones, walkways, obstacles; drag/rotate/duplicate/undo; named
  layouts (save/switch/duplicate/delete/compare); collision, swing-intrusion,
  window-block and walkway diagnostics. Advisory only — never certified
  clearances.
- Design library: 20 styles, 17 materials, 13 categories, 8 palettes,
  6 room collections; browse/search/compare; selections persist.
- Product catalog: provenance-first records (source kind/label/timestamp,
  7-day freshness, dimension source required for "verified", HTTPS-only
  retailer links, integer cents). Zero seeded products — no fabricated
  inventory, prices, or availability anywhere in the platform.
- Project budget: 15 categories, allocations, estimated vs actual lines,
  shopping-list import, option comparison; all totals fail closed,
  including at safe-integer overflow (U-1/U-6 remediated and re-verified).
- Design workspace: layouts + products + budget + library selections +
  notes persisted in the existing project record on the existing durable
  stores; validated on save and on restore (corruption fails closed);
  tenant-isolated.
- Planner interaction repairs found by browser acceptance (section 3).
- **Durable AI concept history** (completion workstream): every generated
  concept is recorded on the project (prompt, selections, provider +
  simulated flag, mandatory disclosure, revision chain, retention) with
  image bytes in tenant-authorized evidence storage — digest-verified
  write before record, integrity-verified read, storage failure leaves no
  record, cross-tenant access 404, deletion supported, 100/project cap
  refuses rather than drops. Simulated output is labeled end-to-end;
  `verified` is structurally always false. QUINCEY CERTIFIED WITH NOTES
  (comment `6965150232`); his concurrency finding (parallel saves could
  silently lose records) is remediated by per-project write serialization
  with a parallel-save regression test.
- **Accessibility remediation** (completion workstream): WCAG 2.2 AA audit
  of studio + operator — axe 0 violations in all five states after
  remediation (contrast palette, 57 operator labels associated,
  focus-visible, reduced motion); audit in
  `docs/RENOVISION_ACCESSIBILITY_AUDIT.md`. QUINCEY CERTIFIED WITH NOTES
  (comment `6965631584`). Automated scans alone do not establish
  conformance; a screen-reader walkthrough was NOT performed.
- **Customer-experience guidance** (completion workstream): the Generate
  control names the exact blocker in every state (sign in / open a
  project / add a photo / ready), and a five-step journey progress strip
  tracks real project state.

## 3. Verification evidence

- Automated suite: **656/656 PASS** on the completion candidate
  (`npm test`).
- QUINCEY independent certifications: design platform comments
  `6904442931` / `6904545592` / `6962434529` (final, C-2 discharged, U-6
  closed); concept history `6965150232` (CERTIFIED WITH NOTES, 9/9
  claims); accessibility + benchmark readiness `6965631584` (CERTIFIED
  WITH NOTES). A delta review of the remediation + CX commits is the
  final pre-release certification step.
- **C-2 browser acceptance: 36 PASS / 0 FAIL / 1 NOTE**, re-run on the
  completion candidate (three consecutive clean runs), in Chromium
  (Playwright) against the candidate server in production token-auth mode
  with a local JWKS: project create/reopen, planner add/drag/rotate/
  duplicate/undo, collision + zone diagnostics, named layouts, library,
  catalog provenance + shopping totals, budget allocations/lines/import,
  workspace save, **server-restart persistence**, cross-tenant UI
  isolation, session expiry, sign-out, honest photo gate, tablet/mobile
  layouts (no horizontal overflow), keyboard movement, demo-mode safety.
  Concept-history browser acceptance separately: **9 PASS / 0 FAIL**
  including restart survival. Security/reliability probes (auth boundary,
  tenant isolation, role enforcement, hostile inputs, write-lock
  robustness): **14 PASS / 0 FAIL**.
  - Real defects found and fixed by this pass: (a) mouse click-to-select
    was suppressed by the drag handler's `preventDefault()` — Rotate,
    Duplicate and arrow keys appeared broken for mouse users; (b) focus
    was lost on every plan redraw, breaking keyboard movement after mouse
    interaction. Both fixed and re-verified in the same harness.
  - NOTE: reopening an existing project returns HTTP 409 by design; the
    studio handles it by opening the existing project (no user error).
- Benchmark tooling: the physical-benchmark runner executes end-to-end on
  a synthetic fixture (errors computed; certification correctly NOT
  granted). This proves the harness only — it is not measurement evidence.

## 4. Security verification summary

- Production auth: verified ID tokens (JWKS/issuer/audience), tenant,
  roles and property entitlements from claims; unauthenticated API calls
  return 401; cross-tenant projects resolve to 404 (suite + QUINCEY +
  browser).
- Demo auth: header-actor mode binds 127.0.0.1 only, is refused on Cloud
  Run (`K_SERVICE`/`K_REVISION` present → exit 1), and can never be a
  production mechanism (all three proven in C-2).
- Sessions: studio enforces expiry (auto sign-out with message, proven in
  browser); sign-out clears token and project state.
- Password reset: Identity Platform `sendOobCode` flow with
  enumeration-safe messaging; unavailable state disclosed when sign-in is
  not configured.
- Writes: invalid workspace writes return 422 and never clobber stored
  state; stored-workspace corruption fails closed on restore; approvals
  are single-use, create-only registrations (Founder Beta certification).
- No secrets in the candidate; the web API key is a public client
  identifier delivered by server config, never committed.

## 5. Deployment plan (requires separate founder authorization)

1. Founder lifts the HOLD naming the completion dev head; push it to
   PR #3; QUINCEY certifies that exact pushed head; then confirm the
   merge authorization naming it.
2. Build the container from the merged tree exactly as for the Founder
   Beta; deploy as a NEW Cloud Run revision of `renovision` in
   `ocg-pipeline` / `us-central1`, initially at 0% traffic.
3. Preserve the full existing environment set (read back, merge, never
   replace partially). `RENOVISION_WEB_API_KEY` must be present on the
   new revision. All renderer flags remain OFF
   (`RENOVISION_VERTEX_PHOTO_ENABLED`, `RENOVISION_PHOTOREAL_ENABLED`
   absent/0) — no paid provider activation.
4. Verify: `/health`, unauthenticated 403, IAM invoker list unchanged
   (founder only), studio loads, authenticated smoke (create project →
   save workspace → reload persists → design-workspace round-trip).
5. Shift 100% traffic only after the smoke passes; record the revision
   name in the release record on PR #3.

## 6. Rollback plan

- Immediate: shift 100% traffic back to `renovision-00007-4ts` (the
  certified Founder Beta revision, image `sha256:fc37a62d…`).
- **Asymmetry warning:** older revisions `00006-b5c` and `00002-tpc` do
  NOT carry `RENOVISION_WEB_API_KEY` — never route traffic to them
  without re-adding it, or browser sign-in breaks.
- Data: design workspaces and concept-history records live inside
  existing project records (concept image bytes in the existing evidence
  storage); the Founder Beta code ignores the new fields, so rollback
  loses no data — workspaces and history become visible again on
  re-deploy. No migration exists or is needed.

## 7. Known gaps and approvals still required

Gaps (honest, none blocking the candidate's certified scope):
- **Physical benchmark + 30-case device matrix: NOT EXECUTED.** They
  require the physical kit and human roles in
  `docs/RENOVISION_DEVICE_TEST_PACKAGE.md` (LiDAR device, depth device,
  calibrated laser meter, consented room, independent reference
  measurer). Execution readiness is QUINCEY CERTIFIED WITH NOTES
  (comment `6965631584`); no accuracy claim is made or implied until the
  benchmark runs and QUINCEY reviews the evidence.
- **Screen-reader / assistive-technology walkthrough: NOT VERIFIED.**
  Accessibility evidence is automated scans plus manual contrast, focus,
  label, and reflow checks (section 2); no WCAG conformance claim is made.
- Founder interactive acceptance (sign-in + real-property session) remains
  founder-performed per `FOUNDER-ACCEPTANCE-RUNBOOK.md`.

Approvals required, each separate and naming its subject:
1. Merge of PR #3 naming the exact candidate head.
2. Deployment of the merged tree (section 5), if desired after merge.
3. Any renderer/provider activation (Vertex photo or photoreal) — paid.
4. Founder acceptance after personal testing.
5. Commercial preparation / public launch — a later, separate decision.
