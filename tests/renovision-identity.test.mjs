import test from "node:test";
import assert from "node:assert/strict";
import {generateKeyPairSync, createSign} from "node:crypto";
import {parseIdToken, verifyIdToken, createTokenAuthenticator} from "../lib/renovision/identity.mjs";
const {publicKey, privateKey} = generateKeyPairSync("rsa", {modulusLength: 2048});
const other = generateKeyPairSync("rsa", {modulusLength: 2048});
const jwk = {...publicKey.export({format: "jwk"}), kid: "key-1", alg: "RS256", use: "sig"};
const jwks = {keys: [jwk]};
const ISSUER = "https://issuer.example.com";
const AUDIENCE = "renovision-api";
const nowSec = 1_800_000_000;
const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString("base64url");
function sign(payload, {key = privateKey, kid = "key-1", alg = "RS256"} = {}) {
 const input = b64({alg, kid, typ: "JWT"}) + "." + b64(payload);
 const signer = createSign("RSA-SHA256"); signer.update(input); signer.end();
 return input + "." + signer.sign(key).toString("base64url");
}
const claims = (extra = {}) => ({sub: "operator-1", iss: ISSUER, aud: AUDIENCE, iat: nowSec - 60, exp: nowSec + 3600, jti: "token-1", tenant_id: "tenant-a", roles: ["operator"], property_ids: ["property-1"], ...extra});
const verify = (token, overrides = {}) => verifyIdToken({token, jwks, audience: AUDIENCE, issuer: ISSUER, nowSeconds: () => nowSec, ...overrides});
test("a correctly signed token with valid claims verifies", () => {
 const result = verify(sign(claims()));
 assert.equal(result.verified, true);
 assert.equal(result.claims.sub, "operator-1");
});
test("forged signatures and tampered payloads are rejected", () => {
 assert.equal(verify(sign(claims(), {key: other.privateKey})).verified, false);
 const [h, , s] = sign(claims()).split(".");
 assert.equal(verify(h + "." + b64(claims({tenant_id: "tenant-b"})) + "." + s).verified, false);
});
test("expired, future, wrong-issuer and wrong-audience tokens are rejected", () => {
 assert.equal(verify(sign(claims({exp: nowSec - 10}))).verified, false);
 assert.equal(verify(sign(claims({iat: nowSec + 7200, exp: nowSec + 10800}))).verified, false);
 assert.equal(verify(sign(claims({iss: "https://evil.example.com"}))).verified, false);
 assert.equal(verify(sign(claims({aud: "other-api"}))).verified, false);
});
test("non-RS256 and unknown-key tokens are rejected", () => {
 assert.equal(verify(sign(claims(), {alg: "none"})).verified, false);
 assert.equal(verify(sign(claims(), {kid: "key-unknown"})).verified, false);
 assert.equal(verifyIdToken({token: sign(claims()), jwks, audience: "", issuer: ISSUER}).verified, false);
});
test("authenticator trusts only the bearer token and ignores spoofed tenant headers", async () => {
 const auth = createTokenAuthenticator({jwksUrl: "https://issuer.example.com/jwks", fetchImpl: async () => ({ok: true, json: async () => jwks}), audience: AUDIENCE, issuer: ISSUER, clock: () => nowSec * 1000});
 const req = {headers: {authorization: "Bearer " + sign(claims()), "x-actor-id": "attacker", "x-tenant-id": "tenant-b"}};
 const actor = await auth.authenticate(req);
 assert.equal(actor.id, "operator-1");
 assert.equal(actor.tenantId, "tenant-a");
 assert.deepEqual(actor.roles, ["operator"]);
 const noToken = await auth.authenticate({headers: {"x-actor-id": "operator-1", "x-tenant-id": "tenant-a"}});
 assert.equal(noToken, null);
});
test("revoked tokens and pre-cutoff subject tokens are rejected", async () => {
 const auth = createTokenAuthenticator({jwksUrl: "https://issuer.example.com/jwks", fetchImpl: async () => ({ok: true, json: async () => jwks}), audience: AUDIENCE, issuer: ISSUER, clock: () => nowSec * 1000});
 const token = sign(claims());
 assert.ok(await auth.authenticate({headers: {authorization: "Bearer " + token}}));
 auth.revokeToken("token-1");
 assert.equal(await auth.authenticate({headers: {authorization: "Bearer " + token}}), null);
 const auth2 = createTokenAuthenticator({jwksUrl: "https://issuer.example.com/jwks", fetchImpl: async () => ({ok: true, json: async () => jwks}), audience: AUDIENCE, issuer: ISSUER, clock: () => nowSec * 1000});
 auth2.revokeSubjectBefore("operator-1", nowSec);
 assert.equal(await auth2.authenticate({headers: {authorization: "Bearer " + sign(claims({jti: "token-2"}))}}), null);
});
test("unconfigured authenticator fails closed", async () => {
 const auth = createTokenAuthenticator({});
 assert.equal(auth.configured, false);
 assert.equal(await auth.authenticate({headers: {authorization: "Bearer " + sign(claims())}}), null);
});
test("tokens without tenant entitlement claims never authenticate", async () => {
 const auth = createTokenAuthenticator({jwksUrl: "https://issuer.example.com/jwks", fetchImpl: async () => ({ok: true, json: async () => jwks}), audience: AUDIENCE, issuer: ISSUER, clock: () => nowSec * 1000});
 const noTenant = claims(); delete noTenant.tenant_id;
 assert.equal(await auth.authenticate({headers: {authorization: "Bearer " + sign(noTenant)}}), null);
});
test("parseIdToken rejects malformed tokens", () => {
 assert.equal(parseIdToken("not-a-token"), null);
 assert.equal(parseIdToken(""), null);
});
