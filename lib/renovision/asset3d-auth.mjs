/** OIDC authentication and tenant-isolation middleware for the OCG 3D ENGINE.
 * Reuses RENO's verified OIDC token authenticator (lib/renovision/identity.mjs).
 * Fails closed when authentication is unavailable or invalid. Never trusts
 * caller-supplied tenant IDs from headers, query parameters, or request bodies.
 * Rejects custom authenticate overrides and unverified authenticator stubs in production. */
import {createTokenAuthenticator} from "./identity.mjs";

const text = (x) => typeof x === "string" && x.trim().length > 0;

function isVerifiedAuthenticatorShape(authObj) {
  return Boolean(
    authObj &&
    typeof authObj === "object" &&
    authObj.configured === true &&
    typeof authObj.authenticate === "function" &&
    typeof authObj.revokeToken === "function" &&
    typeof authObj.revokeSubjectBefore === "function"
  );
}

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
  nodeEnv = process.env.NODE_ENV ?? "development",
  clock = () => Date.now(),
} = {}) {
  const isProduction = String(nodeEnv).toLowerCase() === "production";

  // Q-2: Custom authenticate overrides are forbidden in production.
  const customAuthenticateRejected = isProduction && typeof authenticate === "function";
  // Q-2: Externally injected authenticator must expose the full OIDC authenticator contract.
  const injectedAuthenticatorRejected = Boolean(authenticator && !isVerifiedAuthenticatorShape(authenticator));

  let tokenAuth = !injectedAuthenticatorRejected ? authenticator : null;
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
    if (customAuthenticateRejected || injectedAuthenticatorRejected) return false;
    if (!isProduction && typeof authenticate === "function") return true;
    return isVerifiedAuthenticatorShape(tokenAuth);
  };

  async function requireAuth(req) {
    if (!isConfigured()) {
      return {
        ok: false,
        status: 503,
        error: "auth_unavailable",
        message: customAuthenticateRejected || injectedAuthenticatorRejected
          ? "Authentication override or unverified authenticator rejected; failing closed."
          : "OIDC authentication is not configured; failing closed.",
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
      actor = !isProduction && typeof authenticate === "function"
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
