# OCG 3D ENGINE — Phase 2: Shared API, Security & Artifact Persistence Specification

**Date:** 2026-11-15  
**Execution Owner:** HYDROGEN  
**Program Oversight:** TED  
**Technical Lead:** ARCHER  
**Independent QA:** QUINCEY  
**Base Certified Commit:** `ccd2dd26425c797818cd0d870499ecc86499d253` (`TheOCGroup/RENO#8`, untouched)

---

## 1. Authentication Architecture (`lib/renovision/asset3d-auth.mjs`)

- **OIDC Verification:** Reuses `createTokenAuthenticator` (`lib/renovision/identity.mjs`) with RS256 JWKS signature verification, `iss` (issuer) check, `aud` (audience) check, `exp` / `iat` / `nbf` validation, and `jti` / subject revocation support.
- **Fail-Closed Posture:** Every `/api/3d/*` endpoint invokes `requireAuth(req)`.
  - Missing/unconfigured OIDC authenticator -> `503 auth_unavailable`.
  - Missing, malformed, expired, wrong-issuer, wrong-audience, or bad-signature Bearer token -> `401 unauthorized`.
  - Missing required role (when `allowedRoles` is configured) -> `403 forbidden`.
- **Trusted Tenant Derivation:** `tenantId` is derived exclusively from `actor.tenantId` (verified token claim `tenant_id` or server-side `resolveEntitlements`). Any `tenantId` in request bodies that mismatches `actor.tenantId` is rejected with `403 tenant_impersonation_denied`.

---

## 2. Shared Artifact Storage Interface (`lib/renovision/asset3d-storage.mjs`)

Both `createMemoryAsset3dStorage()` (default, `$0`) and `createGcsAsset3dStorage()` (disabled by default unless `enabled === true && approved === true` and verified `bucket`, `getAccessToken`, `fetchImpl` are supplied) implement:

- `putAsset({ assetId, tenantId, consumer, category, jobId, glbBuffer, metadata, provenance })`
- `getAsset({ assetId, tenantId, includeBuffer })` — enforces `tenantId` ownership and re-verifies SHA-256 digest + `inspectGlbFile` integrity on read (`corrupted_asset` on mismatch).
- `exportAsset({ assetId, tenantId, format })` — exports `glb`, `gltf`, `obj`, `stl`, `ply`.
- `deleteAsset({ assetId, tenantId })` — tenant-scoped safe deletion (`not_found` for missing/cross-tenant).
- `listAssets({ tenantId, consumer, category })` — tenant-scoped listing.

---

## 3. Shared HTTP API Contract (`src/asset3dServer.mjs`)

All `/api/3d/*` routes require `Authorization: Bearer <OIDC_JWT>`.

| Method & Path | Purpose | Key Responses |
| :--- | :--- | :--- |
| `GET /api/3d/health` | Authenticated service & adapter health | `200 { ok, service, tenantId, actorId, localOnly: true, budgetUsd: 0, supportedExportFormats, storageClass, adapterStatus }` |
| `GET /api/3d/models` | List local models & hardware preflight selection | `200 { models, selection }` |
| `GET /api/3d/samples` | List 5 deterministic sample assets | `200 { samples }` |
| `GET /api/3d/samples/:id.:fmt` | Export sample asset (`glb\|gltf\|obj\|stl\|ply`) | `200` binary/text with `nosniff`, `400`, `404` |
| `POST /api/3d/inspect` | Validate & inspect uploaded binary `.glb` (`<= 15 MiB`) | `200` / `400` inspection report, `413` if `> 15 MiB` |
| `POST /api/3d/jobs` | Submit async 3D job (`tenantId` bound from OIDC token) | `202` queued / `201` processed, `400`, `403` on impersonation, `413` |
| `GET /api/3d/jobs/:jobId` | Poll job status & persist completed GLB to storage | `200 { job }`, `404` (missing or cross-tenant) |
| `POST /api/3d/jobs/:jobId/cancel` | Cancel non-terminal job | `200`, `403`, `404`, `409` if terminal |
| `GET /api/3d/jobs/:jobId/export.:fmt` | Export completed job asset (`glb\|gltf\|obj\|stl\|ply`) | `200` exported bytes, `400`, `404`, `409` if incomplete |
| `GET /api/3d/assets` | List tenant-owned assets | `200 { assets }` |
| `GET /api/3d/assets/:assetId` | Retrieve asset metadata (`?download=1` for `.glb` bytes) | `200`, `404`, `422` (`corrupted_asset`), `503` (storage disabled) |
| `DELETE /api/3d/assets/:assetId` | Safe tenant-scoped asset deletion | `200`, `404` |

---

## 4. Consumer SDK & Contracts (`lib/renovision/asset3d-client.mjs`)

- `createRenoAsset3dClient({ baseUrl, getToken })`: `consumer: "reno"`, interior/renovation categories, plus `evaluateFurnishingFit` delegating to `lib/renovision/asset3d-furnishing-bridge.mjs` (never duplicating spatial validation).
- `createNovaAsset3dClient({ baseUrl, getToken })`: `consumer: "nova"`, `character | prop | environment | furniture | architectural_prop | decorative_object` categories (no RENO spatial validation).
- `createOcgLabAsset3dClient({ baseUrl, getToken })`: `consumer: "ocg-lab"`, full shared generation, inspection, 5-format export, and asset lifecycle management.

---

## 5. Cost & Infrastructure Assessment

- **Additional Operating Spend:** **$0.00**.
- No paid APIs, no cloud GPU provisioning, no new databases, no new repositories, and GCS remains disabled by default until an existing approved bucket and credentials are explicitly verified.
