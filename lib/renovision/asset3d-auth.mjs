/** OIDC authentication and tenant-isolation middleware for the OCG 3D ENGINE.
 * Reuses RENO's verified OIDC token authenticator (lib/renovision/identity.mjs).
 * Fails closed when authentication is unavailable or invalid. Never trusts
 * caller-supplied tenant IDs from headers, query parameters, or request bodies. */
import {createTokenAuthenticator} from "./identity.mjs";

const text = (x) => typeof x === "string" && x.trim().length > 0;

export function createAsset3dAuthMiddleware({
  authenticator = null,
  authenticate = null,
  jwksUrl = null,
  fetchImpl = null,
  audience = null,
  issuer = null,
  tenantClaim = "tenant_id",
  rolesClaim = "roles",
  resolveEntitlements = null,
  allowedRoles = null,
  clock = () => Date.now(),
} = {}) {
  let tokenAuth = authenticator;
  if (!tokenAuth && typeof authenticate !== "function") {
    if (text(jwksUrl) && typeof fetchImpl === "function" && text(audience) && text(issuer)) {
      tokenAuth = createTokenAuthenticator({
        jwksUrl,
        fetchImpl,
        audience,
        issuer,
        tenantClaim,
        rolesClaim,
        resolveEntitlements,
        clock,
      });
    }
  }

  const isConfigured = () => {
    if (typeof authenticate === "function") return true;
    return Boolean(tokenAuth && tokenAuth.configured === true && typeof tokenAuth.authenticate === "function");
  };

  async function requireAuth(req) {
    if (!isConfigured()) {
      return {
        ok: false,
        status: 503,
        error: "auth_unavailable",
        message: "OIDC authentication is not configured; failing closed.",
      };
    }

    const header = req?.headers?.authorization;
    if (typeof header !== "string" || !header.startsWith("Bearer ") || !text(header.slice(7))) {
      return {
        ok: false,
        status: 401,
        error: "unauthorized",
        message: "Valid Bearer OIDC token required.",
      };
    }

    let actor = null;
    try {
      actor = typeof authenticate === "function"
        ? await authenticate(req)
        : await tokenAuth.authenticate(req);
    } catch {
      actor = null;
    }

    if (!actor || actor.authenticated !== true || !text(actor.id) || !text(actor.tenantId)) {
      return {
        ok: false,
        status: 401,
        error: "unauthorized",
        message: "Invalid, expired, or untrusted OIDC token.",
      };
    }

    if (Array.isArray(allowedRoles) && allowedRoles.length > 0) {
      const actorRoles = Array.isArray(actor.roles) ? actor.roles : [];
      const permitted = allowedRoles.some((r) => actorRoles.includes(r));
      if (!permitted) {
        return {
          ok: false,
          status: 403,
          error: "forbidden",
          message: "Actor lacks required role for 3D engine access.",
        };
      }
    }

    return { ok: true, actor };
  }

  return {
    get configured() { return isConfigured(); },
    requireAuth,
  };
}
