/** Production identity boundary: OIDC ID-token verification (RS256 via JWKS),
 * compatible with Google/Firebase-style identity providers on the approved GCP
 * architecture. The authenticator reads ONLY the Authorization: Bearer header —
 * caller-supplied tenant/operator headers are never trusted. Tenant, roles and
 * property entitlements come from verified token claims (or an injected server
 * side resolver), never from the request. Fails closed on any defect: missing
 * configuration, unknown key, bad signature, wrong issuer/audience, expiry,
 * revocation. No claim data is logged by this module. */
import {createPublicKey, verify as cryptoVerify} from "node:crypto";
const text = (x) => typeof x === "string" && x.trim().length > 0;
const b64urlJson = (part) => JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
export function parseIdToken(token) {
 if (!text(token)) return null;
 const parts = token.split(".");
 if (parts.length !== 3) return null;
 try { return {header: b64urlJson(parts[0]), payload: b64urlJson(parts[1]), signingInput: parts[0] + "." + parts[1], signature: Buffer.from(parts[2], "base64url")}; } catch { return null; }
}
export function verifyIdToken({token, jwks, audience, issuer, nowSeconds = () => Math.floor(Date.now() / 1000), clockSkewSeconds = 60} = {}) {
 const errors = [];
 if (!text(audience) || !text(issuer)) return {verified: false, errors: ["identity configuration required"]};
 const parsed = parseIdToken(token);
 if (!parsed) return {verified: false, errors: ["malformed token"]};
 const {header, payload} = parsed;
 if (header.alg !== "RS256" || !text(header.kid)) errors.push("RS256 token with key id required");
 const jwk = Array.isArray(jwks?.keys) ? jwks.keys.find((k) => k.kid === header.kid && k.kty === "RSA") : null;
 if (!jwk) errors.push("unknown signing key");
 if (errors.length) return {verified: false, errors};
 let signatureOk = false;
 try { signatureOk = cryptoVerify("RSA-SHA256", Buffer.from(parsed.signingInput), createPublicKey({key: jwk, format: "jwk"}), parsed.signature); } catch { signatureOk = false; }
 if (!signatureOk) return {verified: false, errors: ["signature verification failed"]};
 const now = nowSeconds();
 if (!text(payload.sub)) errors.push("subject required");
 if (payload.iss !== issuer) errors.push("issuer mismatch");
 const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
 if (!audiences.includes(audience)) errors.push("audience mismatch");
 if (typeof payload.exp !== "number" || payload.exp <= now - 0) errors.push("token expired");
 if (typeof payload.iat === "number" && payload.iat > now + clockSkewSeconds) errors.push("token issued in the future");
 if (typeof payload.nbf === "number" && payload.nbf > now + clockSkewSeconds) errors.push("token not yet valid");
 if (errors.length) return {verified: false, errors};
 return {verified: true, claims: payload, errors: []};
}
export function createTokenAuthenticator({jwksUrl, fetchImpl, audience, issuer, tenantClaim = "tenant_id", rolesClaim = "roles", propertyIdsClaim = "property_ids", roomIdsClaim = "room_ids", resolveEntitlements, onActor, clock = () => Date.now(), jwksCacheMs = 600_000} = {}) {
 const configured = text(jwksUrl) && typeof fetchImpl === "function" && text(audience) && text(issuer);
 let jwksCache = null, jwksFetchedAt = 0;
 const revokedJti = new Set();
 const subjectCutoffs = new Map();
 const fetchJwks = async (force = false) => {
   if (!force && jwksCache && clock() - jwksFetchedAt < jwksCacheMs) return jwksCache;
   const res = await fetchImpl(jwksUrl, {method: "GET", headers: {accept: "application/json"}});
   if (!res || res.ok !== true || typeof res.json !== "function") throw Error("jwks unavailable");
   jwksCache = await res.json(); jwksFetchedAt = clock();
   return jwksCache;
 };
 const authenticate = async (req) => {
   if (!configured) return null;
   const header = req?.headers?.authorization;
   if (typeof header !== "string" || !header.startsWith("Bearer ")) return null;
   const token = header.slice("Bearer ".length).trim();
   if (!token) return null;
   let result;
   try {
     result = verifyIdToken({token, jwks: await fetchJwks(), audience, issuer, nowSeconds: () => Math.floor(clock() / 1000)});
     if (!result.verified && result.errors.includes("unknown signing key")) {
       result = verifyIdToken({token, jwks: await fetchJwks(true), audience, issuer, nowSeconds: () => Math.floor(clock() / 1000)});
     }
   } catch { return null; }
   if (!result.verified) return null;
   const claims = result.claims;
   if (claims.jti && revokedJti.has(claims.jti)) return null;
   const cutoff = subjectCutoffs.get(claims.sub);
   if (cutoff !== undefined && (typeof claims.iat !== "number" || claims.iat < cutoff)) return null;
   let entitlements = {tenantId: claims[tenantClaim], roles: claims[rolesClaim], propertyIds: claims[propertyIdsClaim], roomIds: claims[roomIdsClaim]};
   if (typeof resolveEntitlements === "function") {
     try { entitlements = await resolveEntitlements(claims); } catch { return null; }
   }
   if (!text(entitlements?.tenantId) || !Array.isArray(entitlements?.roles)) return null;
   const actor = {id: claims.sub, tenantId: entitlements.tenantId, roles: entitlements.roles, propertyIds: Array.isArray(entitlements.propertyIds) ? entitlements.propertyIds : [], roomIds: Array.isArray(entitlements.roomIds) ? entitlements.roomIds : [], email: typeof claims.email === "string" ? claims.email : null, authenticated: true, jti: claims.jti ?? null, tokenExpiresAt: claims.exp};
   if (typeof onActor === "function") onActor(actor);
   return actor;
 };
 return {
   authenticate,
   revokeToken(jti) { if (text(jti)) revokedJti.add(jti); },
   revokeSubjectBefore(sub, epochSeconds) { if (text(sub) && Number.isFinite(epochSeconds)) subjectCutoffs.set(sub, epochSeconds); },
   get configured() { return configured; },
   get revokedCount() { return revokedJti.size; }
 };
}
