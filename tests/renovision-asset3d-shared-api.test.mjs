import test from "node:test";
import assert from "node:assert/strict";
import {generateKeyPairSync, sign as cryptoSign} from "node:crypto";
import {createAsset3dServer} from "../src/asset3dServer.mjs";
import {createAsset3dAdapter} from "../lib/renovision/asset3d-adapter.mjs";
import {createTokenAuthenticator} from "../lib/renovision/identity.mjs";
import {createMemoryAsset3dStorage, createGcsAsset3dStorage} from "../lib/renovision/asset3d-storage.mjs";
import {
  createRenoAsset3dClient,
  createNovaAsset3dClient,
  createOcgLabAsset3dClient,
} from "../lib/renovision/asset3d-client.mjs";
import {buildMinimalGlb, EXPORT_FORMATS} from "../lib/renovision/glb-inspector.mjs";
import {buildRoomModel, lockRoomGeometry} from "../lib/renovision/room-model.mjs";

const ISSUER = "https://accounts.ocg.test";
const AUDIENCE = "ocg-3d-engine";
const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const { privateKey: roguePrivateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const publicJwk = { ...publicKey.export({ format: "jwk" }), kid: "k1", use: "sig", alg: "RS256" };

function signJwt(claims, key = privateKey, kid = "k1") {
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT", kid })).toString("base64url");
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const sig = cryptoSign("RSA-SHA256", Buffer.from(`${header}.${payload}`), key).toString("base64url");
  return `${header}.${payload}.${sig}`;
}

function makeAuthenticator() {
  return createTokenAuthenticator({
    jwksUrl: "https://jwks.ocg.test/keys",
    fetchImpl: async () => ({ ok: true, json: async () => ({ keys: [publicJwk] }) }),
    issuer: ISSUER,
    audience: AUDIENCE,
  });
}

function makeClaims(overrides = {}) {
  const nowSec = Math.floor(Date.now() / 1000);
  return {
    iss: ISSUER,
    aud: AUDIENCE,
    sub: "user-1",
    tenant_id: "tenant-alpha",
    roles: ["operator"],
    iat: nowSec - 10,
    exp: nowSec + 300,
    ...overrides,
  };
}

const VALID_PNG_B64 = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52,
  0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0,
]).toString("base64");

function makeActiveAdapter() {
  return createAsset3dAdapter({
    enabled: true,
    founderApproved: true,
    localOnly: true,
    environment: {
      os: "linux",
      hasNvidiaGpu: true,
      vramGb: 24,
      freeDiskGb: 80,
      cudaVersion: "12.4",
      pythonVersion: "3.11",
      helperLicensesAccepted: true,
      weightsCachedLocally: true,
    },
    provider: async ({ assetName }) => ({
      glbBuffer: buildMinimalGlb({
        name: assetName || "generated-asset",
        widthMeters: 1.8,
        heightMeters: 0.85,
        depthMeters: 0.9,
      }),
      modelId: "microsoft/TRELLIS.2-4B",
      modelVersion: "trellis-2-4b",
      codeLicense: "MIT",
      weightsLicense: "MIT",
      commercialUseAllowed: true,
    }),
  });
}

async function startServer(opts = {}) {
  const server = createAsset3dServer(opts);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

test("fail closed: all /api/3d/* endpoints return 503 when authentication is unavailable", async () => {
  const srv = await startServer({}); // no authenticator configured
  try {
    for (const [method, path] of [
      ["GET", "/api/3d/health"],
      ["GET", "/api/3d/models"],
      ["POST", "/api/3d/jobs"],
      ["GET", "/api/3d/jobs/job-1"],
      ["POST", "/api/3d/jobs/job-1/cancel"],
      ["GET", "/api/3d/jobs/job-1/export.glb"],
      ["GET", "/api/3d/assets/asset-1"],
    ]) {
      const r = await fetch(`${srv.baseUrl}${path}`, { method });
      assert.equal(r.status, 503, `${method} ${path} must fail closed with 503`);
    }
  } finally {
    await srv.close();
  }
});

test("rejects missing, invalid signature, expired, wrong-issuer, and wrong-audience tokens", async () => {
  const srv = await startServer({ authenticator: makeAuthenticator() });
  const nowSec = Math.floor(Date.now() / 1000);
  const badTokens = [
    ["missing", null],
    ["malformed", "not.a.jwt"],
    ["bad-signature", signJwt(makeClaims(), roguePrivateKey)],
    ["expired", signJwt(makeClaims({ exp: nowSec - 60 }))],
    ["wrong-issuer", signJwt(makeClaims({ iss: "https://evil.example" }))],
    ["wrong-audience", signJwt(makeClaims({ aud: "other-service" }))],
    ["missing-tenant", signJwt(makeClaims({ tenant_id: "" }))],
  ];
  try {
    for (const [label, tok] of badTokens) {
      const headers = tok ? { authorization: `Bearer ${tok}` } : {};
      const r = await fetch(`${srv.baseUrl}/api/3d/health`, { headers });
      assert.equal(r.status, 401, `token case '${label}' must return 401`);
    }
  } finally {
    await srv.close();
  }
});

test("rejects tenant impersonation, cross-tenant job access, cross-tenant cancel, and unauthorized export", async () => {
  const adapter = makeActiveAdapter();
  const storage = createMemoryAsset3dStorage();
  const srv = await startServer({ authenticator: makeAuthenticator(), adapter, storage });
  const alphaTok = signJwt(makeClaims({ tenant_id: "tenant-alpha", sub: "u-alpha" }));
  const betaTok = signJwt(makeClaims({ tenant_id: "tenant-beta", sub: "u-beta" }));
  try {
    // Impersonation attempt in POST /api/3d/jobs body
    const imp = await fetch(`${srv.baseUrl}/api/3d/jobs`, {
      method: "POST",
      headers: { authorization: `Bearer ${alphaTok}`, "content-type": "application/json" },
      body: JSON.stringify({
        tenantId: "tenant-beta",
        consumer: "reno",
        category: "sofa_sectional",
        mimeType: "image/png",
        imageBase64: VALID_PNG_B64,
      }),
    });
    assert.equal(imp.status, 403);

    // Legitimate job creation & immediate processing for tenant-alpha
    const created = await fetch(`${srv.baseUrl}/api/3d/jobs`, {
      method: "POST",
      headers: { authorization: `Bearer ${alphaTok}`, "content-type": "application/json" },
      body: JSON.stringify({
        consumer: "nova",
        category: "character",
        assetName: "hero-bot",
        mimeType: "image/png",
        imageBase64: VALID_PNG_B64,
        processImmediately: true,
      }),
    });
    assert.equal(created.status, 201);
    const { job } = await created.json();
    assert.equal(job.tenantId, "tenant-alpha");
    assert.ok(job.assetId);

    // Cross-tenant job read -> 404
    const crossJob = await fetch(`${srv.baseUrl}/api/3d/jobs/${job.jobId}`, {
      headers: { authorization: `Bearer ${betaTok}` },
    });
    assert.equal(crossJob.status, 404);

    // Cross-tenant export -> 404; unauthenticated export -> 401
    const crossExport = await fetch(`${srv.baseUrl}/api/3d/jobs/${job.jobId}/export.glb`, {
      headers: { authorization: `Bearer ${betaTok}` },
    });
    assert.equal(crossExport.status, 404);
    const unauthExport = await fetch(`${srv.baseUrl}/api/3d/jobs/${job.jobId}/export.glb`);
    assert.equal(unauthExport.status, 401);

    // Cross-tenant asset GET and DELETE -> 404
    const crossAsset = await fetch(`${srv.baseUrl}/api/3d/assets/${job.assetId}`, {
      headers: { authorization: `Bearer ${betaTok}` },
    });
    assert.equal(crossAsset.status, 404);
    const crossDelete = await fetch(`${srv.baseUrl}/api/3d/assets/${job.assetId}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${betaTok}` },
    });
    assert.equal(crossDelete.status, 404);

    // Authorized tenant can export all 5 formats
    for (const fmt of EXPORT_FORMATS) {
      const exp = await fetch(`${srv.baseUrl}/api/3d/jobs/${job.jobId}/export.${fmt}`, {
        headers: { authorization: `Bearer ${alphaTok}` },
      });
      assert.equal(exp.status, 200, `authorized export ${fmt} must succeed`);
      const buf = Buffer.from(await exp.arrayBuffer());
      assert.ok(buf.length > 20, `exported ${fmt} must be non-empty`);
    }

    // Authorized tenant can fetch asset metadata, download GLB, and safely delete
    const metaRes = await fetch(`${srv.baseUrl}/api/3d/assets/${job.assetId}`, {
      headers: { authorization: `Bearer ${alphaTok}` },
    });
    assert.equal(metaRes.status, 200);
    const metaJson = await metaRes.json();
    assert.equal(metaJson.asset.dimensionsVerified, false);
    assert.equal(metaJson.asset.provenance.weightsLicense, "MIT");

    const delRes = await fetch(`${srv.baseUrl}/api/3d/assets/${job.assetId}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${alphaTok}` },
    });
    assert.equal(delRes.status, 200);
    const afterDel = await fetch(`${srv.baseUrl}/api/3d/assets/${job.assetId}`, {
      headers: { authorization: `Bearer ${alphaTok}` },
    });
    assert.equal(afterDel.status, 404);
  } finally {
    await srv.close();
  }
});

test("storage failures: GCS disabled by default, corrupted asset detected, oversized upload rejected", async () => {
  // GCS disabled by default without explicit enabled + approved + bucket/token/fetch
  const gcsDisabled = createGcsAsset3dStorage();
  assert.equal(gcsDisabled.configured, false);
  const putRes = await gcsDisabled.putAsset({
    tenantId: "tenant-alpha",
    consumer: "reno",
    category: "cabinet",
    glbBuffer: buildMinimalGlb({ name: "cab" }),
  });
  assert.equal(putRes.ok, false);
  assert.equal(putRes.error, "gcs_disabled");

  // Corrupted asset detection via HTTP /api/3d/assets/:assetId
  const storage = createMemoryAsset3dStorage();
  const srv = await startServer({ authenticator: makeAuthenticator(), storage });
  const alphaTok = signJwt(makeClaims({ tenant_id: "tenant-alpha" }));
  try {
    await storage.putAsset({
      assetId: "asset_corrupt_test",
      tenantId: "tenant-alpha",
      consumer: "ocg-lab",
      category: "prop",
      glbBuffer: buildMinimalGlb({ name: "prop" }),
    });
    storage._corruptBlobForTest("asset_corrupt_test", Buffer.from("tampered-bytes"));

    const res = await fetch(`${srv.baseUrl}/api/3d/assets/asset_corrupt_test`, {
      headers: { authorization: `Bearer ${alphaTok}` },
    });
    assert.equal(res.status, 422);
    const json = await res.json();
    assert.equal(json.error, "corrupted_asset");

    // Large file > 15 MiB -> 413
    const huge = Buffer.alloc(15 * 1024 * 1024 + 64, 0x41);
    const bigRes = await fetch(`${srv.baseUrl}/api/3d/inspect`, {
      method: "POST",
      headers: { authorization: `Bearer ${alphaTok}` },
      body: huge,
    });
    assert.equal(bigRes.status, 413);
  } finally {
    await srv.close();
  }
});

test("consumer SDK contracts (RENO, NOVA, OCG LAB) work end-to-end and enforce boundaries", async () => {
  const adapter = makeActiveAdapter();
  const srv = await startServer({ authenticator: makeAuthenticator(), adapter });
  const tok = signJwt(makeClaims({ tenant_id: "tenant-ocg" }));
  const getToken = async () => tok;

  try {
    const reno = createRenoAsset3dClient({ baseUrl: srv.baseUrl, getToken });
    const nova = createNovaAsset3dClient({ baseUrl: srv.baseUrl, getToken });
    const ocgLab = createOcgLabAsset3dClient({ baseUrl: srv.baseUrl, getToken });

    // Category boundary enforcement
    const badRenoCat = await reno.submitJob({ category: "character", mimeType: "image/png", imageBase64: VALID_PNG_B64 });
    assert.equal(badRenoCat.ok, false);
    assert.equal(badRenoCat.error, "invalid_consumer_category");

    const badNovaCat = await nova.submitJob({ category: "kitchen_fixture", mimeType: "image/png", imageBase64: VALID_PNG_B64 });
    assert.equal(badNovaCat.ok, false);
    assert.equal(badNovaCat.error, "invalid_consumer_category");

    // RENO end-to-end job + furnishing bridge (ai_estimated remains blocked!)
    const renoJob = await reno.submitJob({
      category: "sofa_sectional",
      assetName: "linen-sofa",
      mimeType: "image/png",
      imageBase64: VALID_PNG_B64,
      processImmediately: true,
    });
    assert.equal(renoJob.ok, true);
    assert.equal(renoJob.job.result.dimensionsVerified, false);

    const room = buildRoomModel({
      propertyId: "prop-1",
      roomId: "living",
      measurements: [
        { measurementId: "m1", featureId: "width", value: 5.0, unit: "m", uncertainty: 0.02, verificationStatus: "verified", fieldMeasured: true, evidenceRef: "ev-1" },
        { measurementId: "m2", featureId: "depth", value: 4.0, unit: "m", uncertainty: 0.02, verificationStatus: "verified", fieldMeasured: true, evidenceRef: "ev-2" },
        { measurementId: "m3", featureId: "height", value: 2.7, unit: "m", uncertainty: 0.02, verificationStatus: "verified", fieldMeasured: true, evidenceRef: "ev-3" },
      ],
    });
    const lock = lockRoomGeometry({
      roomModel: room,
      manifestVerified: true,
      actor: { authenticated: true, id: "archer", tenantId: "tenant-ocg" },
    });
    const fitBlocked = reno.evaluateFurnishingFit({
      roomModel: room,
      lock,
      assets: [{
        id: renoJob.job.assetId,
        estimatedDimensionsMeters: renoJob.job.result.estimatedDimensionsMeters,
        x: 1,
        y: 1,
      }],
    });
    assert.equal(fitBlocked.items[0].verdict, "blocked_unverified_dimensions");

    // OCG LAB client can list models & export 5 formats
    const models = await ocgLab.listModels();
    assert.equal(models.ok, true);
    assert.ok(Array.isArray(models.models) && models.models.length >= 2);
    const stl = await ocgLab.exportJobAsset(renoJob.job.jobId, "stl");
    assert.equal(stl.ok, true);
    assert.ok(stl.buffer.length > 84);
  } finally {
    await srv.close();
  }
});

import {createAsset3dAuthMiddleware} from "../lib/renovision/asset3d-auth.mjs";

test("Q-1: memory storage rejects same-tenant, cross-tenant, and concurrent duplicate assetIds while preserving original", async () => {
  const storage = createMemoryAsset3dStorage();
  const glbA = buildMinimalGlb({ name: "original-sofa", widthMeters: 2.2, heightMeters: 0.8, depthMeters: 1.0 });
  const glbB = buildMinimalGlb({ name: "attacker-box", widthMeters: 0.5, heightMeters: 0.5, depthMeters: 0.5 });

  const first = await storage.putAsset({
    assetId: "dup_asset_1",
    tenantId: "tenant-alpha",
    consumer: "reno",
    category: "sofa_sectional",
    glbBuffer: glbA,
    metadata: { name: "Original Sofa" },
  });
  assert.equal(first.ok, true);

  // Same-tenant duplicate
  const sameTenantDup = await storage.putAsset({
    assetId: "dup_asset_1",
    tenantId: "tenant-alpha",
    consumer: "reno",
    category: "sofa_sectional",
    glbBuffer: glbB,
  });
  assert.equal(sameTenantDup.ok, false);
  assert.equal(sameTenantDup.error, "duplicate_asset_id");
  assert.equal(sameTenantDup.asset, undefined);

  // Cross-tenant duplicate (must not overwrite or disclose tenant-alpha's asset)
  const crossTenantDup = await storage.putAsset({
    assetId: "dup_asset_1",
    tenantId: "tenant-beta",
    consumer: "nova",
    category: "prop",
    glbBuffer: glbB,
  });
  assert.equal(crossTenantDup.ok, false);
  assert.equal(crossTenantDup.error, "duplicate_asset_id");
  assert.equal(crossTenantDup.asset, undefined);

  // Original asset bytes and metadata remain intact
  const got = await storage.getAsset({ assetId: "dup_asset_1", tenantId: "tenant-alpha", includeBuffer: true });
  assert.equal(got.ok, true);
  assert.equal(got.asset.name, "Original Sofa");
  assert.equal(got.asset.digest, first.asset.digest);
  assert.deepEqual(got.glbBuffer, glbA);

  // Concurrent duplicate writes
  const [c1, c2] = await Promise.all([
    storage.putAsset({ assetId: "concurrent_1", tenantId: "tenant-alpha", consumer: "reno", category: "cabinet", glbBuffer: glbA }),
    storage.putAsset({ assetId: "concurrent_1", tenantId: "tenant-beta", consumer: "nova", category: "prop", glbBuffer: glbB }),
  ]);
  const oks = [c1, c2].filter((r) => r.ok);
  const errs = [c1, c2].filter((r) => !r.ok);
  assert.equal(oks.length, 1);
  assert.equal(errs.length, 1);
  assert.equal(errs[0].error, "duplicate_asset_id");
});

test("Q-1: GCS storage enforces ifGenerationMatch=0 preconditions and cleans up partial writes", async () => {
  const calls = [];
  const glb = buildMinimalGlb({ name: "gcs-item" });

  // Case 1: 412 Precondition Failed -> duplicate_asset_id
  const gcsPrecond = createGcsAsset3dStorage({
    enabled: true,
    approved: true,
    bucket: "approved-bucket",
    getAccessToken: async () => "tok",
    fetchImpl: async (url, init) => {
      calls.push({ url, method: init.method });
      return { ok: false, status: 412 };
    },
  });
  const res1 = await gcsPrecond.putAsset({
    assetId: "gcs_dup_1",
    tenantId: "tenant-alpha",
    consumer: "reno",
    category: "cabinet",
    glbBuffer: glb,
  });
  assert.equal(res1.ok, false);
  assert.equal(res1.error, "duplicate_asset_id");
  assert.ok(calls[0].url.includes("ifGenerationMatch=0"));

  // Case 2: GLB succeeds, meta.json fails -> DELETE cleanup on GLB
  const ops = [];
  const gcsPartial = createGcsAsset3dStorage({
    enabled: true,
    approved: true,
    bucket: "approved-bucket",
    getAccessToken: async () => "tok",
    fetchImpl: async (url, init) => {
      ops.push({ url, method: init.method });
      if (init.method === "POST" && url.includes(".glb")) return { ok: true, status: 200 };
      if (init.method === "POST" && url.includes(".meta.json")) return { ok: false, status: 500 };
      if (init.method === "DELETE") return { ok: true, status: 200 };
      return { ok: false, status: 500 };
    },
  });
  const res2 = await gcsPartial.putAsset({
    assetId: "gcs_partial_1",
    tenantId: "tenant-alpha",
    consumer: "reno",
    category: "cabinet",
    glbBuffer: glb,
  });
  assert.equal(res2.ok, false);
  assert.equal(res2.error, "storage_write_failed");
  assert.ok(ops.some((o) => o.method === "DELETE" && o.url.includes("gcs_partial_1.glb")));
});

test("Q-2: production rejects custom authenticate overrides and unverified authenticator bypass stubs", async () => {
  const prodOverride = createAsset3dAuthMiddleware({
    nodeEnv: "production",
    authenticate: async () => ({ authenticated: true, id: "bypass", tenantId: "tenant-alpha" }),
  });
  assert.equal(prodOverride.configured, false);
  const r1 = await prodOverride.requireAuth({ headers: { authorization: "Bearer anything" } });
  assert.equal(r1.ok, false);
  assert.equal(r1.status, 503);

  const stubBypass = createAsset3dAuthMiddleware({
    nodeEnv: "production",
    authenticator: {
      configured: true,
      authenticate: async () => ({ authenticated: true, id: "stub", tenantId: "tenant-alpha" }),
    },
  });
  assert.equal(stubBypass.configured, false);
  const r2 = await stubBypass.requireAuth({ headers: { authorization: "Bearer anything" } });
  assert.equal(r2.ok, false);
  assert.equal(r2.status, 503);
});
