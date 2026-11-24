import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createAsset3dServer } from "../src/asset3dServer.mjs";
import { createAsset3dAdapter } from "../lib/renovision/asset3d-adapter.mjs";
import { createTrellisSubprocessProvider } from "../lib/renovision/trellis-provider.mjs";
import { runLiveAcceptanceSuite } from "../scripts/live_3d_acceptance.mjs";

function makeTenantAuth() {
  return async (req) => {
    const auth = req.headers.authorization;
    if (auth === "Bearer tenant-a-token") {
      return { authenticated: true, tenantId: "tenant-a", id: "user-a", roles: ["operator"] };
    }
    if (auth === "Bearer tenant-b-token") {
      return { authenticated: true, tenantId: "tenant-b", id: "user-b", roles: ["operator"] };
    }
    return null;
  };
}

test("GET /health returns unauthenticated non-sensitive liveness while /api/3d/health stays authenticated", async () => {
  // /ready now requires engine readiness too (Phase 9.2 fix): supply an
  // enabled adapter whose model preflight passes on CPU-contract env data.
  const readyAdapter = createAsset3dAdapter({
    enabled: true,
    founderApproved: true,
    provider: async () => ({ glbBuffer: fs.readFileSync(path.resolve("assets/samples/accent-chair.glb")) }),
    environment: {
      os: "linux", hasNvidiaGpu: true, vramGb: 24, freeDiskGb: 60, cudaVersion: "12.4",
      pythonVersion: "3.10", helperLicensesAccepted: true,
      cachedModelKeys: ["trellis-2-4b"], weightsCachedLocally: true,
    },
  });
  const server = createAsset3dServer({ authenticate: makeTenantAuth(), adapter: readyAdapter });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;
  try {
    const healthRes = await fetch(`${baseUrl}/health`);
    assert.equal(healthRes.status, 200);
    const health = await healthRes.json();
    assert.deepEqual(health, { ok: true, status: "live", service: "ocg-3d-engine" });

    const readyRes = await fetch(`${baseUrl}/ready`);
    assert.equal(readyRes.status, 200);
    const ready = await readyRes.json();
    assert.equal(ready.ok, true);
    assert.equal(ready.status, "ready");
    assert.equal(ready.readyForInference, true);
    assert.equal(ready.components.auth.ready, true);
    assert.equal(ready.components.engine.enabled, true);
    assert.equal(ready.components.engine.preflightReady, true);

    const apiHealthUnauth = await fetch(`${baseUrl}/api/3d/health`);
    assert.equal(apiHealthUnauth.status, 401);

    const apiHealthAuth = await fetch(`${baseUrl}/api/3d/health`, {
      headers: { authorization: "Bearer tenant-a-token" },
    });
    assert.equal(apiHealthAuth.status, 200);
  } finally {
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  }
});

test("trellis2_worker.py uses valid from_pretrained(cache_dir) signature without local_files_only and clears rembg_model", () => {
  const py = fs.readFileSync(path.resolve("infra/trellis2/trellis2_worker.py"), "utf8");
  assert.ok(!py.includes("local_files_only="), "from_pretrained in upstream TRELLIS.2 does not accept local_files_only");
  assert.ok(py.includes('os.path.join(cache_dir, "pipeline.json")'));
  assert.ok(py.includes("pipe.rembg_model = None"));
  assert.ok(py.includes("EMPTY_MESH_OUTPUT"));
});

test("CPU contract: strengthened runLiveAcceptanceSuite verifies auth, tenant isolation, exports, cancel, and telemetry", async () => {
  const sampleGlb = fs.readFileSync(path.resolve("assets/samples/accent-chair.glb"));
  const provider = createTrellisSubprocessProvider({
    glbExportMode: "geometry_only",
    execFileImpl: async (_bin, args) => {
      fs.writeFileSync(args[2], sampleGlb);
      return { stdout: '{"ok":true}', stderr: "" };
    },
  });
  const adapter = createAsset3dAdapter({
    enabled: true,
    founderApproved: true,
    provider,
    environment: {
      os: "linux",
      hasNvidiaGpu: true,
      vramGb: 24,
      freeDiskGb: 60,
      cudaVersion: "12.4",
      pythonVersion: "3.10",
      helperLicensesAccepted: true,
      cachedModelKeys: ["trellis-2-4b"], weightsCachedLocally: true,
    },
  });
  const server = createAsset3dServer({ authenticate: makeTenantAuth(), adapter });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;
  try {
    const result = await runLiveAcceptanceSuite({
      engineUrl: baseUrl,
      engineToken: "tenant-a-token",
      crossTenantToken: "tenant-b-token",
      modeLabel: "CPU CONTRACT TESTED",
    });
    // Phase 9.2 fix: a CPU-contract run must NOT be labelled LIVE.
    assert.equal(result.status, "CPU_CONTRACT_VERIFIED");
    assert.equal(result.classification, "CPU CONTRACT TESTED");
    assert.ok(result.triangleCount > 0);
    assert.equal(result.glbExportMode, "geometry_only");
    assert.equal(result.texturedGlbSupported, false);
    assert.equal(result.cancelVerified, true);
    assert.equal(result.budgetUsd, 0);
    for (const fmt of ["glb", "gltf", "obj", "stl", "ply"]) {
      assert.ok(result.exportSizes[fmt] > 0, `expected non-zero ${fmt} export`);
    }
  } finally {
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  }
});
