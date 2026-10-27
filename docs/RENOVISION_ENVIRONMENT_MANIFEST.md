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

## Logging rule

The service never logs tokens, claims or credentials. Operational logs contain
only the startup mode lines (identity mode, storage class, data paths).
