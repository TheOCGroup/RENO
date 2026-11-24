// Phase 9.2 completion — regression tests for the two Phase 8 Lows:
//  (a) /ready must reflect engine readiness, not only auth configuration.
//  (b) acceptance harness `status` must distinguish CPU-contract / mocked
//      runs from live GPU runs (no LIVE_INFERENCE_VERIFIED for CPU/mocked).
// Everything runs offline on CPU at $0.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createAsset3dServer } from "../src/asset3dServer.mjs";
import { createAsset3dAdapter } from "../lib/renovision/asset3d-adapter.mjs";
import { createTrellisSubprocessProvider } from "../lib/renovision/trellis-provider.mjs";
import { runLiveAcceptanceSuite, resolveAcceptanceStatus } from "../scripts/live_3d_acceptance.mjs";

function makeTenantAuth() {
  return async (req) => {
    const auth = req.headers.authorization;
    if (auth === "Bearer tenant-a-token") return { authenticated: true, tenantId: "tenant-a", id: "user-a", roles: ["operator"] };
    if (auth === "Bearer tenant-b-token") return { authenticated: true, tenantId: "tenant-b", id: "user-b", roles: ["operator"] };
    return null;
  };
}
const READY_ENV = {
  os: "linux", hasNvidiaGpu: true, vramGb: 24, freeDiskGb: 60, cudaVersion: "12.4",
  pythonVersion: "3.10", helperLicensesAccepted: true,
  cachedModelKeys: ["trellis-2-4b"], weightsCachedLocally: true,
};
async function withServer(opts, fn) {
  const server = createAsset3dServer(opts);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try { return await fn(baseUrl); } finally {
    server.closeAllConnections?.();
    await new Promise((r) => server.close(r));
  }
}

test("/ready: disabled engine is NOT ready-for-inference even with auth configured", async () => {
  await withServer({ authenticate: makeTenantAuth() }, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/ready`);
    assert.equal(res.status, 503);
    const body = await res.json();
    assert.equal(body.ok, false);
    assert.equal(body.status, "not_ready");
    assert.equal(body.readyForInference, false);
    assert.equal(body.components.auth.configured, true);
    assert.equal(body.components.engine.enabled, false);
  });
});

test("/ready: unconfigured auth stays fail-closed not-ready even with an enabled engine", async () => {
  const adapter = createAsset3dAdapter({
    enabled: true, founderApproved: true,
    provider: async () => ({ glbBuffer: Buffer.alloc(0) }),
    environment: READY_ENV,
  });
  await withServer({ adapter }, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/ready`);
    assert.equal(res.status, 503);
    const body = await res.json();
    assert.equal(body.readyForInference, false);
    assert.equal(body.components.auth.configured, false);
    assert.equal(body.components.engine.enabled, true);
  });
});

test("/ready: auth configured + engine enabled + preflight ready reports ready-for-inference", async () => {
  const adapter = createAsset3dAdapter({
    enabled: true, founderApproved: true,
    provider: async () => ({ glbBuffer: Buffer.alloc(0) }),
    environment: READY_ENV,
  });
  await withServer({ authenticate: makeTenantAuth(), adapter }, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/ready`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, "ready");
    assert.equal(body.readyForInference, true);
    assert.deepEqual(body.components.engine.blockers, []);
  });
});

test("/ready: enabled engine whose preflight fails is not ready-for-inference", async () => {
  const adapter = createAsset3dAdapter({
    enabled: true, founderApproved: true,
    provider: async () => ({ glbBuffer: Buffer.alloc(0) }),
    environment: { os: "linux", hasNvidiaGpu: false },
  });
  await withServer({ authenticate: makeTenantAuth(), adapter }, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/ready`);
    assert.equal(res.status, 503);
    const body = await res.json();
    assert.equal(body.readyForInference, false);
    assert.equal(body.components.engine.enabled, true);
    assert.equal(body.components.engine.preflightReady, false);
    assert.ok(body.components.engine.blockers.length > 0);
  });
});

test("acceptance status mapping: only REAL GPU EXECUTED may be LIVE_INFERENCE_VERIFIED", () => {
  assert.equal(resolveAcceptanceStatus("REAL GPU EXECUTED"), "LIVE_INFERENCE_VERIFIED");
  assert.equal(resolveAcceptanceStatus("CPU CONTRACT TESTED"), "CPU_CONTRACT_VERIFIED");
  assert.equal(resolveAcceptanceStatus("MOCKED PROVIDER"), "MOCKED_CONTRACT_VERIFIED");
  assert.equal(resolveAcceptanceStatus(""), "CONTRACT_VERIFIED_NOT_LIVE");
  assert.equal(resolveAcceptanceStatus(undefined), "CONTRACT_VERIFIED_NOT_LIVE");
  assert.notEqual(resolveAcceptanceStatus("CPU CONTRACT TESTED"), "LIVE_INFERENCE_VERIFIED");
});

test("CPU-contract acceptance run reports CPU_CONTRACT_VERIFIED, never LIVE", async () => {
  const sampleGlb = fs.readFileSync(path.resolve("assets/samples/accent-chair.glb"));
  const provider = createTrellisSubprocessProvider({
    glbExportMode: "geometry_only",
    execFileImpl: async (_bin, args) => { fs.writeFileSync(args[2], sampleGlb); return { stdout: '{"ok":true}', stderr: "" }; },
  });
  const adapter = createAsset3dAdapter({ enabled: true, founderApproved: true, provider, environment: READY_ENV });
  await withServer({ authenticate: makeTenantAuth(), adapter }, async (baseUrl) => {
    const result = await runLiveAcceptanceSuite({
      engineUrl: baseUrl, engineToken: "tenant-a-token", crossTenantToken: "tenant-b-token",
      modeLabel: "CPU CONTRACT TESTED",
    });
    assert.equal(result.status, "CPU_CONTRACT_VERIFIED");
    assert.equal(result.classification, "CPU CONTRACT TESTED");
  });
});
