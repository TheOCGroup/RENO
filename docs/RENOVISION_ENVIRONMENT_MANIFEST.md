# RENOVISION — Environment Configuration Manifest

Single source of truth for service configuration. Secrets are never stored in
the repository; identity secrets live with the identity provider, and the
service holds no signing keys (it verifies tokens against the provider JWKS).

| Variable | Required | Meaning |
|---|---|---|
| `PORT` | no (default 8787) | HTTP listen port. |
| `RENOVISION_DATA_DIR` | no (default `./data/renovision`) | Durable filesystem root: `evidence/`, `events/`, `projects/` subdirectories. |
| `RENOVISION_DEMO_AUTH` | local dev only | `1` selects demo header identity with admin entitlement. **Never set in a deployed environment.** When unset and token config is absent, the process refuses to start. |
| `RENOVISION_JWKS_URL` | production | JWKS endpoint of the OIDC identity provider. |
| `RENOVISION_TOKEN_ISSUER` | production | Expected `iss` claim. |
| `RENOVISION_TOKEN_AUDIENCE` | production | Expected `aud` claim. |
| `RENOVISION_TENANT_CLAIM` | no (default `tenant_id`) | Claim carrying the tenant id. Roles/property claims default to `roles` / `property_ids` / `room_ids`. |
| `RENOVISION_TOKEN_SINGLE_USE` | no | `1` enables single-use token ids: each `jti` authenticates exactly once (tokens without a `jti` are rejected in this mode). Off by default — see replay limitations below. |
| `RENOVISION_GCS_BUCKET` | GCP mode | Existing private bucket for evidence. Setting it switches evidence storage to GCS; nothing is provisioned by the app. |
| `RENOVISION_GCS_TOKEN_URL` | no | Override for the metadata-server token URL (GCE/Cloud Run default when unset). |
| `RENOVISION_PHOTOREAL_ENABLED` | no | `1` arms the photoreal render flag — rendering still requires founder approval flag + injected provider. |
| `RENOVISION_PHOTOREAL_FOUNDER_APPROVED` | no | `1` records founder approval for the render provider. Paid activation remains a separate founder billing decision. |

## Identity claim contract (production)

Tokens must be RS256 ID tokens from the configured issuer containing:
`sub` (operator id), `exp`, `iat`, `jti` (for revocation), the tenant claim,
and entitlement claims — or the deployment injects a server-side
`resolveEntitlements` resolver. Roles: `viewer`, `operator`, `approver`,
`admin` (see `lib/renovision/access-control.mjs`). Entitlements bound every
property/room the operator may touch; there is no cross-tenant access path.

## Token replay — safeguards and limitations

Bearer ID tokens are replayable by design inside their validity window:
anyone holding a valid token can present it until it expires. Safeguards
implemented: expiry is enforced on every request; individual tokens can be
revoked by `jti` and all of a subject's earlier tokens by a revocation
cutoff (operator action via the authenticator); and the optional
single-use mode (`RENOVISION_TOKEN_SINGLE_USE=1`) makes each token id
single-authentication. Limitations: single-use mode requires clients to
mint a fresh token per request, which standard IdP client flows do not do,
so it suits machine-to-machine staging checks rather than interactive
operators; revocation state is in-process (a restart clears it — production
deployments should back revocation with the IdP's own token revocation and
short token lifetimes, recommended ≤ 15 minutes for operator tokens).
Transport security (HTTPS at the ingress) is assumed and required.

## Logging rule

The service never logs tokens, claims or credentials. Operational logs contain
only the startup mode lines (identity mode, storage class, data paths).

## Browser-to-private-Cloud-Run acceptance gate (Founder Beta)

**Status: BLOCKED / not independently verified.** The existing UI requests
`/` and `/auth-config` before the user signs in. It subsequently obtains an
Identity Platform ID token and sends that token as an application API bearer
token. Cloud Run's private invocation IAM is a **different** authentication
boundary: an application ID token is not automatically a Cloud Run invocation
identity token. Successful service-account CLI smoke tests do not prove that a
normal browser can load the UI or call its APIs.

### Required architecture before release

Keep the RENOVISION Cloud Run service private. Select and implement an
explicitly authorized browser-facing entry point (for example, an existing
organization-approved gateway or a new *separately approved* identity-aware
proxy). That entry point must authenticate the browser, enforce allowed users,
supply its own IAM-authorized invocation to the private backend, and preserve
the application's independently verified tenant/role authorization. Do **not**
pass the gateway's service identity to the app as if it were the end-user's
tenant identity. Never make the backend public or enable demo header auth to
work around the issue. Any new gateway, IAM grant, domain, or spend requires
separate founder authorization.

### Acceptance evidence (all required)

1. Record the exact approved public browser entry URL, backend service URL,
   project, region, ingress mode, gateway identity, and least-privilege IAM
   bindings without publishing secrets.
2. From an ordinary clean browser profile with **no** gcloud credentials,
   load the UI and `/auth-config`; capture status codes and screenshots.
3. Sign in using an authorized test user; confirm the app token's issuer,
   audience, tenant, role, expiry and permitted property scope **server-side**.
   Never record passwords, raw bearer tokens or refresh tokens.
4. Verify an authorized API operation and subsequent session refresh through
   the gateway. Confirm sign-out removes the browser session.
5. Verify anonymous, expired, forged-header, wrong-tenant and unauthorized-role
   requests are rejected at the correct boundary; capture sanitized results.
6. Confirm direct unauthenticated access to the private backend remains denied,
   and verify security headers in the *actual browser entry point*.
7. Record CI commit, gateway configuration version, timestamped evidence,
   rollback instructions, and independent QUINCEY review.

**Release decision:** keep the browser access gate and production authorization
closed until all evidence above is independently verified. Source tests and
CLI-only Cloud Run smoke tests do not substitute for this acceptance.

### Staging gateway implementation evidence — 2026-11-08

- Gateway source: `infra/gcp/gateway/server.mjs`; container: `infra/gcp/gateway/Dockerfile`; tests: `tests/renovision-gateway.test.mjs`.
- Staging service: `renovision-gateway-staging`, project `ocg-pipeline`, region `us-central1`, URL `https://renovision-gateway-staging-438680341626.us-central1.run.app`.
- Gateway service account: `renovision-gateway@ocg-pipeline.iam.gserviceaccount.com`, granted `roles/run.invoker` on private `renovision` backend. Existing founder binding preserved; no `allUsers` backend invoker binding.
- Gateway is intentionally browser-invokable (Cloud Run `allUsers` invoker) to serve the login screen. It forwards a separate Cloud Run invocation token using `X-Serverless-Authorization`, while retaining the application's `Authorization` header for backend user/tenant checks. **The gateway does not itself authenticate browser users before serving the UI**; API authorization remains exclusively the backend's responsibility.
- Live unauthenticated smoke: `GET /` 200, `GET /auth-config` 200, `GET /health` 200, `GET /api/renovision/projects` 401; direct backend `GET /` 403; forged actor/tenant headers 401; forged bearer 401; unexpected API query 404. These do not establish valid-user, wrong-tenant or real-browser acceptance.
- CI for Dockerfile commit `2fb62059a1f6e2b5dcfbdef2fb11ca18669f036e`: both Mission Control Gate and RENOVISION Spatial Validation CI PASS.
- Staging capacity configured with minimum instances 0 and maximum instances 1. This is **not** a verified dollar spend or budget-enforcement mechanism. Review Cloud Billing before further scale-up.
- **HOLD**: no real user sign-in, token refresh, cross-tenant E2E, mobile capture, physical benchmark, or independent QUINCEY signoff verified. No production promotion authorized by these smoke results.
