import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { resolveAsset3dServerConfig } from "../src/asset3dMain.mjs";
import { createAsset3dServer } from "../src/asset3dServer.mjs";
import { createTrellisSubprocessProvider } from "../lib/renovision/trellis-provider.mjs";
import { buildProceduralObjectPng256 } from "../scripts/live_3d_acceptance.mjs";

function makeTestAuth() {
  return async (req) => {
    if (req.headers.authorization === "Bearer valid-phase7-token") {
      return { authenticated: true, tenantId: "t-p7", id: "user-1", roles: ["operator"] };
    }
    return null;
  };
}

test("resolveAsset3dServerConfig preserves 127.0.0.1 default and supports Cloud Run OCG_3D_HOST=0.0.0.0 + PORT", () => {
  const localCfg = resolveAsset3dServerConfig({});
  assert.equal(localCfg.host, "127.0.0.1");
  assert.equal(localCfg.port, 8788);
  assert.equal(localCfg.enabled, false);
  assert.equal(localCfg.founderApproved, false);

  const cloudCfg = resolveAsset3dServerConfig({
    OCG_3D_HOST: "0.0.0.0",
    PORT: "8080",
    OCG_3D_ENABLED: "true",
    OCG_3D_FOUNDER_APPROVED: "true",
  });
  assert.equal(cloudCfg.host, "0.0.0.0");
  assert.equal(cloudCfg.port, 8080);
  assert.equal(cloudCfg.enabled, true);
  assert.equal(cloudCfg.founderApproved, true);

  assert.throws(() => resolveAsset3dServerConfig({ OCG_3D_PORT: "not-a-port" }), /Invalid OCG_3D_PORT/);
});

test("service.3d-engine-gpu.yaml sets OCG_3D_HOST=0.0.0.0, geometry_only mode, and OCG_TRELLIS_LOCAL_CACHE_DIR", () => {
  const yaml = fs.readFileSync("infra/gcp/service.3d-engine-gpu.yaml", "utf8");
  assert.match(yaml, /OCG_3D_HOST[\s\S]*value:\s*"0\.0\.0\.0"/);
  assert.match(yaml, /OCG_TEXTURED_GLB_MODE[\s\S]*value:\s*geometry_only/);
  assert.match(yaml, /OCG_TRELLIS_LOCAL_CACHE_DIR[\s\S]*value:\s*\/models\/trellis2-4b/);
  assert.match(yaml, /OCG_3D_ENABLED[\s\S]*value:\s*"false"/);
});

test("createTrellisSubprocessProvider reports explicit geometryOnly capability disclosure", async () => {
  const sampleGlb = fs.readFileSync(path.resolve("assets/samples/accent-chair.glb"));
  const provider = createTrellisSubprocessProvider({
    glbExportMode: "geometry_only",
    execFileImpl: async (_bin, args) => {
      fs.writeFileSync(args[2], sampleGlb);
      return { stdout: '{"ok":true}', stderr: "" };
    },
  });
  const out = await provider({
    imageBase64: buildProceduralObjectPng256().toString("base64"),
    mimeType: "image/png",
  });
  assert.equal(out.geometryOnly, true);
  assert.equal(out.texturedOutput, false);
  assert.match(out.exportCapabilityDisclosure, /Geometry-only GLB export active/);
});

test("asset3dServer exposes unified 6-subsystem capabilities and authenticated /api/3d/unified/evaluate", async () => {
  const server = createAsset3dServer({ authenticate: makeTestAuth() });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // Unauthenticated requests fail closed
    const unauthCap = await fetch(`${baseUrl}/api/3d/capabilities`);
    assert.equal(unauthCap.status, 401);

    const unauthEval = await fetch(`${baseUrl}/api/3d/unified/evaluate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ subsystem: "motion" }),
    });
    assert.equal(unauthEval.status, 401);

    // Authenticated capabilities
    const capRes = await fetch(`${baseUrl}/api/3d/capabilities`, {
      headers: { authorization: "Bearer valid-phase7-token" },
    });
    assert.equal(capRes.status, 200);
    const cap = await capRes.json();
    assert.deepEqual(cap.unifiedSubsystems, ["geometry", "world", "reality", "fourD", "motion", "adaptiveInference"]);
    assert.deepEqual(cap.qualityProfiles, ["draft", "balanced", "high", "maximum"]);
    assert.equal(cap.glbExportMode, "geometry_only");
    assert.equal(cap.texturedGlbSupported, false);

    // Authenticated evaluations for world, reality, fourD, motion, adaptiveInference
    for (const [subsystem, payload] of [
      ["world", { subsystem: "world", sceneId: "s1", nodes: [{ nodeId: "n1", positionMeters: [0, 0, 0] }], startMeters: [0, 0, 0], goalMeters: [1, 0, 1] }],
      ["reality", { subsystem: "reality", params: { assetBoundsMeters: { width: 1, height: 0.8, depth: 1 } } }],
      ["fourD", { subsystem: "fourD", params: { keyframes: [{ position: [0, 1, 2], lookAt: [0, 0, 0] }, { position: [2, 1, 0], lookAt: [0, 0, 0] }], durationSec: 1, fps: 5 } }],
      ["motion", { subsystem: "motion", params: { primitive: "walk_cycle", durationSec: 1, fps: 5 }, targetJoints: ["root", "pelvis"] }],
      ["adaptiveInference", { subsystem: "adaptiveInference", params: { qualityProfile: "draft" } }],
    ]) {
      const evRes = await fetch(`${baseUrl}/api/3d/unified/evaluate`, {
        method: "POST",
        headers: { authorization: "Bearer valid-phase7-token", "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      assert.equal(evRes.status, 200);
      const evData = await evRes.json();
      assert.equal(evData.ok, true);
      assert.equal(evData.subsystem, subsystem);
    }
  } finally {
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  }
});
