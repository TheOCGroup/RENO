// Phase 9 remediation — regression tests for QUINCEY finding UF-Q9-1 (plus
// the UF-Q9-2 / UF-Q9-5 Low fold-ins).
//
// UF-Q9-1: the production entrypoint (src/asset3dMain.mjs, the Dockerfile
// CMD) built the adapter with `environment: process.env`, whose string
// values can never satisfy the preflight's structured requirements, and no
// production code built the structured fields — the deployed engine could
// never reach /ready 200. These tests drive the ENTRYPOINT's own
// construction (`buildAsset3dServer`) with stubbed probe IO and with this
// machine's real probe, and unit-test the probe itself. Everything runs
// offline on CPU at $0; the "ready" machine is a SIMULATED probe source —
// no GPU inference is claimed or exercised.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  probeAsset3dEnvironment,
  parseNvidiaSmiGpuCsv,
  parseNvidiaSmiCudaVersion,
  parsePythonVersion,
  scanCachedModelKeys,
} from "../lib/renovision/environment-probe.mjs";
import { buildAsset3dServer } from "../src/asset3dMain.mjs";
import { createAsset3dServer } from "../src/asset3dServer.mjs";
import { createAsset3dAdapter } from "../lib/renovision/asset3d-adapter.mjs";
import { createTrellisSubprocessProvider } from "../lib/renovision/trellis-provider.mjs";
import { runLiveAcceptanceSuite } from "../scripts/live_3d_acceptance.mjs";

const A40_CSV = "NVIDIA A40, 46068, 550.54.14\n";
const A40_HEADER = [
  "+-----------------------------------------------------------------------------+",
  "| NVIDIA-SMI 550.54.14    Driver Version: 550.54.14    CUDA Version: 12.4     |",
  "+-----------------------------------------------------------------------------+",
].join("\n");

const TOK_A = ["tenant", "a", "token"].join("-");
const TOK_B = ["tenant", "b", "token"].join("-");
const BEARER_A = "Bearer " + TOK_A;
const BEARER_B = "Bearer " + TOK_B;

function makeTenantAuth() {
  return async (req) => {
    const auth = req.headers.authorization;
    if (auth === BEARER_A) return { authenticated: true, tenantId: "tenant-a", id: "user-a", roles: ["operator"] };
    if (auth === BEARER_B) return { authenticated: true, tenantId: "tenant-b", id: "user-b", roles: ["operator"] };
    return null;
  };
}

/** Probe IO simulating a ready GPU machine (A40-class) entirely on CPU. */
function makeReadyProbeIo(cacheDir) {
  return {
    execFileImpl: async (bin, args) => {
      if (bin === "nvidia-smi" && args.length > 0) return { stdout: A40_CSV, stderr: "" };
      if (bin === "nvidia-smi") return { stdout: A40_HEADER, stderr: "" };
      return { stdout: "Python 3.10.12", stderr: "" };
    },
    statfsImpl: async () => ({ bavail: Math.floor((80 * 1024 ** 3) / 4096), bsize: 4096 }),
    readFileImpl: async () => "MemTotal:       33554432 kB\n",
    existsImpl: (p) => p === path.join(cacheDir, "pipeline.json"),
    readdirImpl: () => { throw new Error("ENOENT"); },
    platformImpl: () => "linux",
    totalmemImpl: () => 32 * 1024 ** 3,
  };
}

/** Probe IO simulating a machine with no NVIDIA GPU (nvidia-smi absent). */
function makeGpuLessProbeIo(cacheDir) {
  const io = makeReadyProbeIo(cacheDir);
  io.execFileImpl = async (bin, args) => {
    if (bin === "nvidia-smi") {
      const err = new Error("spawn nvidia-smi ENOENT");
      err.code = "ENOENT";
      throw err;
    }
    return { stdout: "Python 3.10.12", stderr: "" };
  };
  return io;
}

const READY_ENTRY_ENV = {
  OCG_3D_ENABLED: "true",
  OCG_3D_FOUNDER_APPROVED: "true",
  OCG_3D_HELPER_LICENSES_ACCEPTED: "true",
};

async function withBuiltServer(buildOpts, fn) {
  const { server, adapter, probe } = await buildAsset3dServer(buildOpts);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    return await fn(baseUrl, { adapter, probe });
  } finally {
    server.closeAllConnections?.();
    await new Promise((r) => server.close(r));
  }
}

function tmpCacheDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "ocg-probe-cache-"));
}

// ---------------------------------------------------------------- parsers

test("probe parsers: nvidia-smi CSV / CUDA header / python version fixtures", () => {
  const gpus = parseNvidiaSmiGpuCsv(A40_CSV);
  assert.equal(gpus.length, 1);
  assert.equal(gpus[0].name, "NVIDIA A40");
  assert.equal(gpus[0].vramGb, 44); // floor(46068 MiB / 1024)
  assert.deepEqual(parseNvidiaSmiGpuCsv(""), []);
  assert.deepEqual(parseNvidiaSmiGpuCsv("garbage,line\n"), []);
  assert.deepEqual(parseNvidiaSmiGpuCsv(null), []);
  assert.equal(parseNvidiaSmiCudaVersion(A40_HEADER), "12.4");
  assert.equal(parseNvidiaSmiCudaVersion("no cuda here"), null);
  assert.equal(parsePythonVersion("Python 3.10.12"), "3.10");
  assert.equal(parsePythonVersion("Python 3.12.3"), "3.12");
  assert.equal(parsePythonVersion("not python"), null);
});

// ------------------------------------------------------------------- probe

test("probe: simulated ready machine yields structured env with honest source labels", async () => {
  const cacheDir = tmpCacheDir();
  const { environment, fieldSources, gpus, probeErrors } = await probeAsset3dEnvironment({
    env: { OCG_TRELLIS_LOCAL_CACHE_DIR: cacheDir, OCG_3D_HELPER_LICENSES_ACCEPTED: "true" },
    io: makeReadyProbeIo(cacheDir),
  });
  assert.deepEqual(probeErrors, []);
  assert.equal(gpus.length, 1);
  assert.equal(environment.hasNvidiaGpu, true);
  assert.equal(environment.gpuModel, "NVIDIA A40");
  assert.equal(environment.vramGb, 44);
  assert.equal(environment.cudaVersion, "12.4");
  assert.equal(environment.cudaAvailable, true);
  assert.equal(environment.pythonVersion, "3.10");
  assert.equal(environment.freeDiskGb, 80);
  assert.equal(environment.ramGb, 32);
  assert.deepEqual(environment.cachedModelKeys, ["trellis-2-4b"]);
  assert.equal(environment.weightsCachedLocally, true);
  assert.equal(environment.helperLicensesAccepted, true);
  // Source labels: machine facts probed; license acceptance attested only.
  assert.equal(fieldSources.hasNvidiaGpu, "probed");
  assert.equal(fieldSources.vramGb, "probed");
  assert.equal(fieldSources.cudaVersion, "probed");
  assert.equal(fieldSources.freeDiskGb, "probed");
  assert.equal(fieldSources.cachedModelKeys, "probed");
  assert.equal(fieldSources.helperLicensesAccepted, "attested");
});

test("probe: absent nvidia-smi honestly reports no GPU (never fabricated)", async () => {
  const cacheDir = tmpCacheDir();
  const { environment, fieldSources } = await probeAsset3dEnvironment({
    env: { OCG_TRELLIS_LOCAL_CACHE_DIR: cacheDir },
    io: makeGpuLessProbeIo(cacheDir),
  });
  assert.equal(environment.hasNvidiaGpu, false);
  assert.equal(environment.gpuModel, null);
  assert.equal(environment.vramGb, 0);
  assert.equal(environment.cudaVersion, null);
  assert.equal(environment.cudaAvailable, false);
  assert.equal(fieldSources.hasNvidiaGpu, "probed");
  // No attestation supplied → fail-closed false.
  assert.equal(environment.helperLicensesAccepted, false);
});

test("probe: real probe on this host reports this host honestly (no GPU)", async () => {
  const { environment } = await probeAsset3dEnvironment({ env: {} });
  // This VM has no nvidia-smi and no GPU; the probe must say so.
  assert.equal(environment.hasNvidiaGpu, false);
  assert.equal(environment.vramGb, 0);
  assert.equal(environment.cudaAvailable, false);
  assert.equal(environment.os, "linux");
  assert.match(environment.pythonVersion, /^3\.\d+$/);
  assert.ok(environment.freeDiskGb > 0);
  assert.ok(environment.ramGb > 0);
  assert.ok(Array.isArray(environment.cachedModelKeys));
});

test("probe: cache scan recognizes pipeline.json layouts and empty caches", () => {
  const root = tmpCacheDir();
  assert.deepEqual(scanCachedModelKeys([root]), []);

  // Worker layout: the configured cache dir itself holds pipeline.json.
  fs.writeFileSync(path.join(root, "pipeline.json"), "{}");
  assert.deepEqual(scanCachedModelKeys([root]), ["trellis-2-4b"]);
  fs.rmSync(path.join(root, "pipeline.json"));

  // Per-model subdirectory layout.
  fs.mkdirSync(path.join(root, "trellis-1"));
  fs.writeFileSync(path.join(root, "trellis-1", "pipeline.json"), "{}");
  assert.deepEqual(scanCachedModelKeys([root]), ["trellis-1"]);
  fs.rmSync(path.join(root, "trellis-1"), { recursive: true });

  // Hugging Face hub layout.
  const snap = path.join(root, "hub", "models--microsoft--TRELLIS.2-4B", "snapshots", "abc123");
  fs.mkdirSync(snap, { recursive: true });
  fs.writeFileSync(path.join(snap, "pipeline.json"), "{}");
  assert.deepEqual(scanCachedModelKeys([root]), ["trellis-2-4b"]);

  // Missing roots are ignored, not errors.
  assert.deepEqual(scanCachedModelKeys(["/nonexistent/ocg-probe", "", null]), []);
});

// ------------------------------------------------------- entrypoint wiring

test("entrypoint path: buildAsset3dServer reaches /ready 200 with a simulated ready probe (CPU)", async () => {
  const cacheDir = tmpCacheDir();
  await withBuiltServer(
    {
      env: { ...READY_ENTRY_ENV, OCG_TRELLIS_LOCAL_CACHE_DIR: cacheDir },
      probeOptions: { io: makeReadyProbeIo(cacheDir) },
      authenticate: makeTenantAuth(),
    },
    async (baseUrl, { adapter, probe }) => {
      assert.equal(probe.environment.hasNvidiaGpu, true); // simulated probe source
      assert.equal(adapter.status().preflight.ready, true);
      const res = await fetch(`${baseUrl}/ready`);
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.readyForInference, true);
      assert.equal(body.status, "ready");
      assert.deepEqual(body.components.engine.blockers, []);
    },
  );
});

test("entrypoint path: buildAsset3dServer stays 503 with honest blockers when the probe finds no GPU", async () => {
  const cacheDir = tmpCacheDir();
  await withBuiltServer(
    {
      env: { ...READY_ENTRY_ENV, OCG_TRELLIS_LOCAL_CACHE_DIR: cacheDir },
      probeOptions: { io: makeGpuLessProbeIo(cacheDir) },
      authenticate: makeTenantAuth(),
    },
    async (baseUrl, { adapter }) => {
      const status = adapter.status();
      assert.equal(status.preflight.ready, false);
      // The specific honest reasons (GPU / VRAM / CUDA) ride in the
      // preflight's per-model rejection reasons.
      const reasons = status.preflight.rejected.flatMap((r) => r.reasons);
      assert.ok(reasons.some((b) => /GPU/i.test(b)), `expected a GPU blocker, got: ${reasons.join(" | ")}`);
      assert.ok(reasons.some((b) => /VRAM/i.test(b)));
      const res = await fetch(`${baseUrl}/ready`);
      assert.equal(res.status, 503);
      const body = await res.json();
      assert.equal(body.readyForInference, false);
      assert.equal(body.components.engine.enabled, true);
      assert.equal(body.components.engine.preflightReady, false);
      assert.ok(body.components.engine.blockers.length > 0);
    },
  );
});

test("entrypoint path: buildAsset3dServer with this host's REAL probe is honestly not ready (GPU-less VM)", async () => {
  await withBuiltServer(
    { env: { ...READY_ENTRY_ENV }, authenticate: makeTenantAuth() },
    async (baseUrl, { probe }) => {
      assert.equal(probe.environment.hasNvidiaGpu, false);
      const res = await fetch(`${baseUrl}/ready`);
      assert.equal(res.status, 503);
      const body = await res.json();
      assert.equal(body.readyForInference, false);
      assert.ok(body.components.engine.blockers.length > 0);
    },
  );
});

test("entrypoint source: adapter is built from the probe, never raw process.env (UF-Q9-1 regression guard)", () => {
  const mainSrc = fs.readFileSync("src/asset3dMain.mjs", "utf8");
  assert.ok(mainSrc.includes("probeAsset3dEnvironment"));
  assert.ok(mainSrc.includes("environment: probe.environment"));
  assert.ok(!mainSrc.includes("environment: process.env"));
});

// ------------------------------------------------------------- UF-Q9-2 / 5

test("UF-Q9-2: acceptance suite with NO explicit mode label can never emit LIVE_INFERENCE_VERIFIED", async () => {
  const sampleGlb = fs.readFileSync(path.resolve("assets/samples/accent-chair.glb"));
  const provider = createTrellisSubprocessProvider({
    glbExportMode: "geometry_only",
    execFileImpl: async (_bin, args) => { fs.writeFileSync(args[2], sampleGlb); return { stdout: '{"ok":true}', stderr: "" }; },
  });
  const adapter = createAsset3dAdapter({
    enabled: true, founderApproved: true, provider,
    environment: {
      os: "linux", hasNvidiaGpu: true, vramGb: 24, freeDiskGb: 60, cudaVersion: "12.4",
      pythonVersion: "3.10", helperLicensesAccepted: true,
      cachedModelKeys: ["trellis-2-4b"], weightsCachedLocally: true,
    },
  });
  const server = createAsset3dServer({ authenticate: makeTenantAuth(), adapter });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    // No modeLabel passed at all — the old default would have claimed LIVE.
    const result = await runLiveAcceptanceSuite({
      engineUrl: baseUrl, engineToken: TOK_A, crossTenantToken: TOK_B,
    });
    assert.notEqual(result.status, "LIVE_INFERENCE_VERIFIED");
    assert.equal(result.status, "CONTRACT_VERIFIED_NOT_LIVE");
    assert.equal(result.classification, "UNDECLARED MODE");
  } finally {
    server.closeAllConnections?.();
    await new Promise((r) => server.close(r));
  }
});

test("UF-Q9-2: acceptance CLI requires explicit opt-in for the REAL GPU label", () => {
  const src = fs.readFileSync("scripts/live_3d_acceptance.mjs", "utf8");
  assert.ok(src.includes("--real-gpu-executed"));
  assert.ok(!src.includes('modeLabel = "REAL GPU EXECUTED"'));
});

test("UF-Q9-5: Dockerfile o-voxel install fails the build loudly when the directory is missing", () => {
  const dockerfile = fs.readFileSync("infra/trellis2/Dockerfile.trellis2", "utf8");
  const line = dockerfile.split("\n").find((l) => l.includes("o-voxel") && l.startsWith("RUN"));
  assert.ok(line, "o-voxel RUN line present");
  assert.ok(line.includes("else"), "o-voxel RUN has an else branch");
  assert.ok(line.includes("exit 1"), "o-voxel RUN else branch exits 1");
});
