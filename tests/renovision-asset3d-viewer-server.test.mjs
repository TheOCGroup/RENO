import test from "node:test";
import assert from "node:assert/strict";
import {generateKeyPairSync, sign as cryptoSign} from "node:crypto";
import {createAsset3dServer} from "../src/asset3dServer.mjs";
import {createTokenAuthenticator} from "../lib/renovision/identity.mjs";
import {buildMinimalGlb, EXPORT_FORMATS} from "../lib/renovision/glb-inspector.mjs";

const ISSUER = "https://accounts.ocg.test";
const AUDIENCE = "ocg-3d-engine";
const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const publicJwk = { ...publicKey.export({ format: "jwk" }), kid: "k1", use: "sig", alg: "RS256" };

function signToken(claims) {
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT", kid: "k1" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const sig = cryptoSign("RSA-SHA256", Buffer.from(`${header}.${payload}`), privateKey).toString("base64url");
  return `${header}.${payload}.${sig}`;
}

function makeTestAuthenticator() {
  return createTokenAuthenticator({
    jwksUrl: "https://jwks.ocg.test/keys",
    fetchImpl: async () => ({ ok: true, json: async () => ({ keys: [publicJwk] }) }),
    issuer: ISSUER,
    audience: AUDIENCE,
  });
}

function tokenFor(tenantId, sub = "user-1") {
  const nowSec = Math.floor(Date.now() / 1000);
  return signToken({
    iss: ISSUER,
    aud: AUDIENCE,
    sub,
    tenant_id: tenantId,
    roles: ["operator"],
    iat: nowSec - 10,
    exp: nowSec + 300,
  });
}

async function startServer(opts = {}) {
  const authenticator = opts.authenticator ?? makeTestAuthenticator();
  const server = createAsset3dServer({ authenticator, ...opts });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

test("viewer HTML serves with security headers, zero external URLs, and valid inline JavaScript", async () => {
  const srv = await startServer();
  try {
    const res = await fetch(`${srv.baseUrl}/`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("x-content-type-options"), "nosniff");
    assert.equal(res.headers.get("x-frame-options"), "DENY");
    assert.equal(res.headers.get("referrer-policy"), "no-referrer");
    const html = await res.text();
    assert.ok(!/https?:\/\//i.test(html), "viewer HTML must not contain external URLs");
    const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
    assert.ok(scriptMatch, "inline script must exist");
    assert.doesNotThrow(() => new Function(scriptMatch[1]));
  } finally {
    await srv.close();
  }
});

test("server exposes authenticated health, models, sample GLB catalog, and all 5 export formats", async () => {
  const srv = await startServer();
  const headers = { authorization: `Bearer ${tokenFor("tenant-alpha")}` };
  try {
    const health = await (await fetch(`${srv.baseUrl}/api/3d/health`, { headers })).json();
    assert.equal(health.ok, true);
    assert.equal(health.budgetUsd, 0);
    assert.equal(health.tenantId, "tenant-alpha");
    assert.deepEqual(health.supportedExportFormats, EXPORT_FORMATS);

    const samples = await (await fetch(`${srv.baseUrl}/api/3d/samples`, { headers })).json();
    assert.ok(samples.samples.length >= 5);

    for (const fmt of EXPORT_FORMATS) {
      const r = await fetch(`${srv.baseUrl}/api/3d/samples/sofa-sectional.${fmt}`, { headers });
      assert.equal(r.status, 200, `export format ${fmt} should return 200`);
      const buf = Buffer.from(await r.arrayBuffer());
      assert.ok(buf.length > 20, `export format ${fmt} should be non-empty`);
    }
  } finally {
    await srv.close();
  }
});

test("server inspects valid and invalid GLB uploads and enforces OIDC tenant isolation on jobs", async () => {
  const srv = await startServer();
  const alphaHeaders = { authorization: `Bearer ${tokenFor("tenant-alpha", "user-alpha")}` };
  const betaHeaders = { authorization: `Bearer ${tokenFor("tenant-beta", "user-beta")}` };
  try {
    const validGlb = buildMinimalGlb({ name: "chair", widthMeters: 0.7, heightMeters: 0.8, depthMeters: 0.7 });
    const okRes = await fetch(`${srv.baseUrl}/api/3d/inspect`, {
      method: "POST",
      headers: alphaHeaders,
      body: validGlb,
    });
    assert.equal(okRes.status, 200);
    const okJson = await okRes.json();
    assert.equal(okJson.passed, true);
    assert.equal(okJson.inspection.boundingBoxMeters.width, 0.7);

    const badRes = await fetch(`${srv.baseUrl}/api/3d/inspect`, {
      method: "POST",
      headers: alphaHeaders,
      body: Buffer.from("corrupt-glb"),
    });
    assert.equal(badRes.status, 400);
    const badJson = await badRes.json();
    assert.equal(badJson.passed, false);

    // Valid PNG magic bytes
    const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0,0,0,1, 0,0,0,1, 8, 6, 0, 0, 0]).toString("base64");
    const jobRes = await fetch(`${srv.baseUrl}/api/3d/jobs`, {
      method: "POST",
      headers: { ...alphaHeaders, "content-type": "application/json" },
      body: JSON.stringify({
        consumer: "reno",
        category: "sofa_sectional",
        mimeType: "image/png",
        imageBase64: pngBytes,
      }),
    });
    assert.equal(jobRes.status, 202);
    const { job } = await jobRes.json();
    assert.equal(job.tenantId, "tenant-alpha");

    const sameTenant = await fetch(`${srv.baseUrl}/api/3d/jobs/${job.jobId}`, { headers: alphaHeaders });
    assert.equal(sameTenant.status, 200);

    const crossTenant = await fetch(`${srv.baseUrl}/api/3d/jobs/${job.jobId}`, { headers: betaHeaders });
    assert.equal(crossTenant.status, 404);

    // Malformed JSON -> 400
    const badJsonCancel = await fetch(`${srv.baseUrl}/api/3d/jobs/${job.jobId}/cancel`, {
      method: "POST",
      headers: { ...alphaHeaders, "content-type": "application/json" },
      body: "{bad",
    });
    assert.equal(badJsonCancel.status, 400);

    // Cross-tenant cancel -> 404
    const crossCancel = await fetch(`${srv.baseUrl}/api/3d/jobs/${job.jobId}/cancel`, {
      method: "POST",
      headers: { ...betaHeaders, "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.equal(crossCancel.status, 404);

    // Nonexistent job -> 404
    const missingCancel = await fetch(`${srv.baseUrl}/api/3d/jobs/asset3d_missing/cancel`, {
      method: "POST",
      headers: { ...alphaHeaders, "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.equal(missingCancel.status, 404);

    // Authorized cancel -> 200 & repeated cancel remains safe
    const okCancel = await fetch(`${srv.baseUrl}/api/3d/jobs/${job.jobId}/cancel`, {
      method: "POST",
      headers: { ...alphaHeaders, "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.equal(okCancel.status, 200);
    const okCancelJson = await okCancel.json();
    assert.equal(okCancelJson.job.status, "cancelled");

    const repeatCancel = await fetch(`${srv.baseUrl}/api/3d/jobs/${job.jobId}/cancel`, {
      method: "POST",
      headers: { ...alphaHeaders, "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.equal(repeatCancel.status, 200);
  } finally {
    await srv.close();
  }
});
