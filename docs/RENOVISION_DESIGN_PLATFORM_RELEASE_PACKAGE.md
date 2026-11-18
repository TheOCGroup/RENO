# RENOVISION — Design Platform Release Package

Status: RELEASE-READY CANDIDATE — NOT MERGED, NOT DEPLOYED. Nothing in this
package authorizes a merge, a deployment, a provider activation, or an
accuracy claim. Exact approvals still required are listed in section 7.

## 1. Candidate identity

- Repository: `TheOCGroup/RENO`, draft PR #3, branch
  `research/renovision-accuracy-contract-20261022`.
- Candidate head: recorded in the handoff that accompanies this package
  (verify with `git rev-parse HEAD`; certifications attach to exact heads —
  any later commit, including documentation, creates a new candidate).
- Lineage: certified Founder Beta (`cf22707f`, deployed) → design platform
  (`380b944c`, QUINCEY CERTIFIED WITH NOTES) → remediation (`2694251b`,
  C-1 discharged) → C-2 repairs + U-6 (this candidate).

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

## 3. Verification evidence

- Automated suite: **644/644 PASS** on the candidate (`npm test`).
- QUINCEY independent certification of the design platform: PR #3 comments
  `6904442931` (CERTIFIED WITH NOTES, 10/10 claims) and `6904545592`
  (delta re-verification — C-1 DISCHARGED at `2694251b`).
- **C-2 browser acceptance: COMPLETE — 36 PASS / 0 FAIL / 1 NOTE**, run in
  Chromium (Playwright) against the candidate server in production
  token-auth mode with a local JWKS: project create/reopen, planner
  add/drag/rotate/duplicate/undo, collision + zone diagnostics, named
  layouts, library, catalog provenance + shopping totals, budget
  allocations/lines/import, workspace save, **server-restart persistence**,
  cross-tenant UI isolation, session expiry, sign-out, honest photo gate,
  tablet/mobile layouts (no horizontal overflow), keyboard movement,
  demo-mode safety. Evidence: screenshots + `c2-results.json` retained with
  the lane's C-2 evidence package; the harness is re-runnable.
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

1. Confirm PR #3 merge authorization naming the exact candidate head.
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
- Data: design workspaces live inside existing project records; the
  Founder Beta code ignores the new field, so rollback loses no data —
  workspaces become visible again on re-deploy. No migration exists or
  is needed.

## 7. Known gaps and approvals still required

Gaps (honest, none blocking the candidate's certified scope):
- **Durable photo-concept history: NOT IMPLEMENTED.** Photo concepts are
  session-scoped in the studio (invalidated on design change by design);
  the dimensional workflow's SVG previews are project-recorded. A durable
  photo history needs evidence-storage wiring + a read model and can only
  be exercised end-to-end once a renderer is enabled (founder-gated).
- **Physical benchmark + 30-case device matrix: NOT EXECUTED.** They
  require the physical kit and human roles in
  `docs/RENOVISION_DEVICE_TEST_PACKAGE.md` (LiDAR device, depth device,
  calibrated laser meter, consented room, independent reference measurer).
  No accuracy claim is made or implied until they run and QUINCEY reviews
  the evidence.
- Founder interactive acceptance (sign-in + real-property session) remains
  founder-performed per `FOUNDER-ACCEPTANCE-RUNBOOK.md`.

Approvals required, each separate and naming its subject:
1. Merge of PR #3 naming the exact candidate head.
2. Deployment of the merged tree (section 5), if desired after merge.
3. Any renderer/provider activation (Vertex photo or photoreal) — paid.
4. Founder acceptance after personal testing.
5. Commercial preparation / public launch — a later, separate decision.
