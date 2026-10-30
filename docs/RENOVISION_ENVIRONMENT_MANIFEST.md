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
