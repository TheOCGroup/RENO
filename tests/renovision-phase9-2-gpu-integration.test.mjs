// Phase 9.2 — shared-GPU integration, cancellation, scheduling and spend-guard acceptance.
// Everything here runs on CPU at $0: no GPU, no network, no Runpod API calls.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync, spawn, execFile } from "node:child_process";
import { promisify } from "node:util";

import {
  createTrellisSubprocessProvider,
  buildTrellisWorkerEnv,
  resolveTrellisTimeoutMs,
  TRELLIS_TIMEOUT_BOUNDS_MS,
} from "../lib/renovision/trellis-provider.mjs";
import { createGpuScheduler, resolveGpuSchedulerConfig, GPU_SCHEDULER_ERRORS } from "../lib/renovision/gpu-scheduler.mjs";
import { createAsset3dAdapter } from "../lib/renovision/asset3d-adapter.mjs";
import {
  estimateSessionCost,
  evaluateActivationGate,
  shutdownAndConfirm,
  reconcileSession,
  writeSessionState,
  readSessionState,
  costAlerts,
  HARD_CEILING_DISCLOSURE,
} from "../lib/renovision/runpod-spend-guard.mjs";
import { main as guardMain } from "../scripts/gpu_session_guard.mjs";
import { buildProceduralObjectPng256 } from "../scripts/live_3d_acceptance.mjs";

const execFileAsync = promisify(execFile);
const SAMPLE_GLB = fs.readFileSync(path.resolve("assets/samples/accent-chair.glb"));
const PNG_B64 = buildProceduralObjectPng256().toString("base64");
const READY_ENV = {
  os: "linux",
  hasNvidiaGpu: true,
  vramGb: 48,
  freeDiskGb: 60,
  cudaVersion: "12.4",
  pythonVersion: "3.10",
  helperLicensesAccepted: true,
  weightsCachedLocally: true,
  cachedModelKeys: ["trellis-2-4b"],
};
const tmp = (p) => fs.mkdtempSync(path.join(os.tmpdir(), p));

// ---------- worker environment ----------

test("worker env forwards CUDA/Python runtime paths but never secrets", () => {
  const env = buildTrellisWorkerEnv({
    PATH: "/usr/bin",
    PYTHONPATH: "/opt/trellis2",
    LD_LIBRARY_PATH: "/usr/local/nvidia/lib64",
    HF_HUB_OFFLINE: "1",
    CUDA_VISIBLE_DEVICES: "0",
    OCG_3D_ENGINE_TOKEN: "secret-token",
    RUNPOD_API_KEY: "rpa_secret",
    GOOGLE_APPLICATION_CREDENTIALS: "/secrets/sa.json",
    OCG_OIDC_CLIENT_SECRET: "x",
  });
  assert.equal(env.PYTHONPATH, "/opt/trellis2");
  assert.equal(env.LD_LIBRARY_PATH, "/usr/local/nvidia/lib64");
  assert.equal(env.HF_HUB_OFFLINE, "1");
  assert.equal(env.CUDA_VISIBLE_DEVICES, "0");
  for (const secret of ["OCG_3D_ENGINE_TOKEN", "RUNPOD_API_KEY", "GOOGLE_APPLICATION_CREDENTIALS", "OCG_OIDC_CLIENT_SECRET"]) {
    assert.equal(env[secret], undefined, `${secret} must not reach the worker`);
  }
});

test("provider passes PYTHONPATH, SIGKILL timeout and commercial geometry_only default to the worker", async () => {
  const saved = process.env.OCG_TEXTURED_GLB_MODE;
  delete process.env.OCG_TEXTURED_GLB_MODE;
  try {
    let seen = null;
    const provider = createTrellisSubprocessProvider({
      sourceEnv: { PATH: "/usr/bin", PYTHONPATH: "/opt/trellis2", LD_LIBRARY_PATH: "/usr/local/nvidia/lib64", RUNPOD_API_KEY: "rpa" },
      scheduler: createGpuScheduler(),
      execFileImpl: async (_bin, args, opts) => {
        seen = opts;
        fs.writeFileSync(args[2], SAMPLE_GLB);
        return { stdout: "{}", stderr: "" };
      },
    });
    const outp = await provider({ imageBase64: PNG_B64, mimeType: "image/png" });
    assert.equal(outp.geometryOnly, true);
    assert.equal(seen.env.OCG_TEXTURED_GLB_MODE, "geometry_only");
    assert.equal(seen.env.PYTHONPATH, "/opt/trellis2");
    assert.equal(seen.env.LD_LIBRARY_PATH, "/usr/local/nvidia/lib64");
    assert.equal(seen.env.RUNPOD_API_KEY, undefined);
    assert.equal(seen.killSignal, "SIGKILL");
    assert.equal(seen.timeout, TRELLIS_TIMEOUT_BOUNDS_MS.default);
  } finally {
    if (saved !== undefined) process.env.OCG_TEXTURED_GLB_MODE = saved;
  }
});

test("worker timeout is bounded to [30s, 900s] with a 600s default", () => {
  assert.equal(resolveTrellisTimeoutMs(undefined), 600_000);
  assert.equal(resolveTrellisTimeoutMs("5"), 30_000);
  assert.equal(resolveTrellisTimeoutMs("99999999"), 900_000);
  assert.equal(resolveTrellisTimeoutMs("abc"), 600_000);
  const p = createTrellisSubprocessProvider({ timeoutMs: 10, scheduler: createGpuScheduler(), execFileImpl: async () => {} });
  assert.equal(p.timeoutMs, 30_000);
});

// ---------- GPU scheduler ----------

test("GPU scheduler defaults to sequential (concurrency 1) and clamps env", () => {
  assert.equal(resolveGpuSchedulerConfig({}).maxConcurrency, 1);
  assert.equal(resolveGpuSchedulerConfig({ OCG_GPU_MAX_CONCURRENCY: "99" }).maxConcurrency, 4);
  assert.equal(resolveGpuSchedulerConfig({ OCG_GPU_MAX_CONCURRENCY: "0" }).maxConcurrency, 1);
});

test("provider never runs two TRELLIS workers on the GPU at once", async () => {
  let active = 0;
  let peak = 0;
  const provider = createTrellisSubprocessProvider({
    scheduler: createGpuScheduler({ maxConcurrency: 1 }),
    execFileImpl: async (_b, args) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 30));
      fs.writeFileSync(args[2], SAMPLE_GLB);
      active -= 1;
      return {};
    },
  });
  await Promise.all([1, 2, 3, 4].map(() => provider({ imageBase64: PNG_B64, mimeType: "image/png" })));
  assert.equal(peak, 1);
  assert.equal(provider.scheduler.stats().granted, 4);
  assert.equal(provider.scheduler.stats().running, 0);
});

test("GPU queue rejects when full and times out waiting", async () => {
  const s = createGpuScheduler({ maxConcurrency: 1, maxQueueDepth: 1, queueTimeoutMs: 50 });
  const release = await s.acquire();
  const waiting = s.acquire();
  await assert.rejects(s.acquire(), (e) => e.code === GPU_SCHEDULER_ERRORS.QUEUE_FULL);
  await assert.rejects(waiting, (e) => e.code === GPU_SCHEDULER_ERRORS.QUEUE_TIMEOUT);
  release();
  assert.equal(s.stats().running, 0);
});

test("cancelling a queued job removes it before it reaches the GPU", async () => {
  const s = createGpuScheduler({ maxConcurrency: 1 });
  const release = await s.acquire();
  const ac = new AbortController();
  const waiting = s.acquire({ signal: ac.signal });
  ac.abort();
  await assert.rejects(waiting, (e) => e.code === GPU_SCHEDULER_ERRORS.CANCELLED);
  assert.equal(s.stats().queued, 0);
  release();
});

test("cross-process lease file serialises RENO and NOVA workloads and reclaims stale leases", async () => {
  const dir = tmp("ocg-lease-");
  const leaseFile = path.join(dir, "gpu.lease");
  const reno = createGpuScheduler({ leaseFile, owner: "reno-trellis2", leasePollMs: 10, queueTimeoutMs: 2_000 });
  const nova = createGpuScheduler({ leaseFile, owner: "nova-comfyui", leasePollMs: 10, queueTimeoutMs: 2_000 });
  const releaseReno = await reno.acquire();
  assert.equal(JSON.parse(fs.readFileSync(leaseFile, "utf8")).owner, "reno-trellis2");
  let novaGranted = false;
  const novaWait = nova.acquire().then((rel) => {
    novaGranted = true;
    return rel;
  });
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(novaGranted, false, "NOVA must wait while RENO holds the GPU lease");
  releaseReno();
  const releaseNova = await novaWait;
  assert.equal(JSON.parse(fs.readFileSync(leaseFile, "utf8")).owner, "nova-comfyui");
  releaseNova();
  assert.equal(fs.existsSync(leaseFile), false);

  fs.writeFileSync(leaseFile, JSON.stringify({ owner: "crashed", token: "x", expiresAt: Date.now() - 1 }));
  const rel = await reno.acquire();
  assert.equal(reno.stats().staleLeasesReclaimed, 1);
  rel();

  const holder = createGpuScheduler({ leaseFile, owner: "nova-comfyui", leaseTtlMs: 60_000 });
  const relH = await holder.acquire();
  const blocked = createGpuScheduler({ leaseFile, leasePollMs: 10, queueTimeoutMs: 1_000 });
  await assert.rejects(blocked.acquire(), (e) => e.code === GPU_SCHEDULER_ERRORS.LEASE_HELD);
  relH();
  fs.rmSync(dir, { recursive: true, force: true });
});

// ---------- adapter cancellation ----------

function cancellableProvider(onStart) {
  return createTrellisSubprocessProvider({
    scheduler: createGpuScheduler(),
    execFileImpl: (_b, _args, opts) =>
      new Promise((_resolve, reject) => {
        onStart?.();
        opts.signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })), { once: true });
      }),
  });
}

test("cancelling a running job kills the worker, frees the GPU and cannot be overwritten as completed", async () => {
  let started;
  const startedP = new Promise((r) => (started = r));
  const provider = cancellableProvider(started);
  const adapter = createAsset3dAdapter({ enabled: true, founderApproved: true, provider, environment: READY_ENV });
  const sub = adapter.submitJob({ tenantId: "t1", consumer: "reno", category: "furniture", mimeType: "image/png", imageBase64: PNG_B64 });
  const processing = adapter.processJob(sub.job.jobId, { tenantId: "t1" });
  await startedP;
  assert.equal(adapter.getJob(sub.job.jobId, { tenantId: "t1" }).status, "running");
  assert.equal(adapter.cancelJob(sub.job.jobId, { tenantId: "t2" }).ok, false, "other tenant cannot cancel");
  assert.equal(adapter.cancelJob(sub.job.jobId, { tenantId: "t1" }).ok, true);
  const res = await processing;
  assert.equal(res.ok, false);
  assert.equal(res.job.status, "cancelled");
  assert.equal(adapter.getJob(sub.job.jobId, { tenantId: "t1" }).status, "cancelled");
  assert.equal(provider.scheduler.stats().running, 0);
});

test("a provider that ignores cancellation still cannot resurrect a cancelled job", async () => {
  let finish;
  const provider = async () =>
    new Promise((r) => {
      finish = () => r({ glbBuffer: SAMPLE_GLB });
    });
  const adapter = createAsset3dAdapter({ enabled: true, founderApproved: true, provider, environment: READY_ENV });
  const sub = adapter.submitJob({ tenantId: "t1", consumer: "nova", category: "furniture", mimeType: "image/png", imageBase64: PNG_B64 });
  const processing = adapter.processJob(sub.job.jobId, { tenantId: "t1" });
  await new Promise((r) => setTimeout(r, 10));
  adapter.cancelJob(sub.job.jobId, { tenantId: "t1" });
  finish();
  const res = await processing;
  assert.equal(res.job.status, "cancelled");
  assert.equal(res.job.result, null);
});

test("duplicate concurrent processJob calls are refused", async () => {
  let finish;
  const provider = async () => new Promise((r) => (finish = () => r({ glbBuffer: SAMPLE_GLB })));
  const adapter = createAsset3dAdapter({ enabled: true, founderApproved: true, provider, environment: READY_ENV });
  const sub = adapter.submitJob({ tenantId: "t1", consumer: "reno", category: "furniture", mimeType: "image/png", imageBase64: PNG_B64 });
  const first = adapter.processJob(sub.job.jobId, { tenantId: "t1" });
  await new Promise((r) => setTimeout(r, 10));
  const second = await adapter.processJob(sub.job.jobId, { tenantId: "t1" });
  assert.equal(second.ok, false);
  assert.match(second.errors[0], /already processing/);
  finish();
  assert.equal((await first).job.status, "completed");
});

test("real OS subprocess is killed on cancel (node stand-in for the python worker)", async () => {
  const dir = tmp("ocg-kill-");
  const pidFile = path.join(dir, "pid");
  const fake = path.join(dir, "hang.mjs");
  fs.writeFileSync(fake, `import fs from "node:fs"; fs.writeFileSync(${JSON.stringify(pidFile)}, String(process.pid)); setInterval(() => {}, 1000);`);
  const provider = createTrellisSubprocessProvider({
    pythonBin: process.execPath,
    workerPath: fake,
    scheduler: createGpuScheduler(),
    execFileImpl: execFileAsync,
  });
  const ac = new AbortController();
  const run = provider({ imageBase64: PNG_B64, mimeType: "image/png", signal: ac.signal });
  for (let i = 0; i < 100 && !fs.existsSync(pidFile); i += 1) await new Promise((r) => setTimeout(r, 50));
  const pid = Number(fs.readFileSync(pidFile, "utf8"));
  ac.abort();
  await assert.rejects(run, /JOB_CANCELLED/);
  await new Promise((r) => setTimeout(r, 200));
  let alive = true;
  try {
    process.kill(pid, 0);
  } catch {
    alive = false;
  }
  assert.equal(alive, false, "worker process must be gone after cancellation");
  assert.equal(provider.scheduler.stats().running, 0);
  fs.rmSync(dir, { recursive: true, force: true });
});

// ---------- container spec ----------

test("Dockerfile targets A40 (sm_86) and L4 (sm_89), Node 24, geometry-only, and caches CUDA layers before app source", () => {
  const df = fs.readFileSync("infra/trellis2/Dockerfile.trellis2", "utf8");
  assert.match(df, /TORCH_CUDA_ARCH_LIST="8\.6;8\.9\+PTX"/);
  assert.match(df, /setup_24\.x/);
  assert.match(df, /OCG_TEXTURED_GLB_MODE=geometry_only/);
  assert.match(df, /OCG_GPU_MAX_CONCURRENCY=1/);
  assert.ok(df.indexOf("o-voxel") < df.indexOf("COPY --chown=ocg:ocg src"), "o-voxel compile must precede app source COPY");
  const codeLines = df.split(/\r?\n/).filter((l) => !l.trim().startsWith("#")).join("\n");
  assert.doesNotMatch(codeLines, /nvdiffrast/i);
  const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
  assert.equal(pkg.engines.node, ">=24");
});

// ---------- in-pod watchdog ----------

const hasSh = spawnSync("sh", ["-c", "exit 0"]).status === 0;

test("pod watchdog requests shutdown at max runtime and when the limit is missing (dry run)", { skip: !hasSh && "sh unavailable" }, () => {
  const dir = tmp("ocg-wd-");
  const base = { ...process.env, OCG_WATCHDOG_DRY_RUN: "1", OCG_ACTIVITY_FILE: path.join(dir, "act"), OCG_WATCHDOG_POLL_SECONDS: "1" };
  const r1 = spawnSync("sh", ["infra/trellis2/pod_watchdog.sh"], { env: { ...base, OCG_POD_MAX_RUNTIME_SECONDS: "0" }, encoding: "utf8", timeout: 20_000 });
  assert.equal(r1.status, 0);
  assert.match(r1.stderr, /SHUTDOWN_REQUESTED reason=max_runtime_exceeded/);
  const env2 = { ...base };
  delete env2.OCG_POD_MAX_RUNTIME_SECONDS;
  const r2 = spawnSync("sh", ["infra/trellis2/pod_watchdog.sh"], { env: env2, encoding: "utf8", timeout: 20_000 });
  assert.match(r2.stderr, /FATAL OCG_POD_MAX_RUNTIME_SECONDS missing/);
  assert.match(r2.stderr, /SHUTDOWN_REQUESTED/);
  const r3 = spawnSync("sh", ["infra/trellis2/pod_watchdog.sh"], { env: { ...base, OCG_POD_MAX_RUNTIME_SECONDS: "999999" }, encoding: "utf8", timeout: 3_000 });
  assert.match(r3.stderr, /clamping to 3600/);
  fs.rmSync(dir, { recursive: true, force: true });
});

// ---------- spend guard ----------

function fakeRunpod({ desiredStatus = "EXITED", costPerHr = 0.44, balance = 9.95, stopConfirms = true, stopThrows = false } = {}) {
  const calls = [];
  const state = { desiredStatus, runtime: null };
  return {
    calls,
    state,
    async account() {
      calls.push("account");
      return { clientBalance: balance, spendLimit: 80, currentSpendPerHr: 0 };
    },
    async pod(id) {
      calls.push("pod");
      if (state.desiredStatus === "GONE") return null;
      return { id, name: "appalling_apricot_lark", desiredStatus: state.desiredStatus, costPerHr, runtime: state.runtime };
    },
    async resume() {
      calls.push("resume");
      state.desiredStatus = "RUNNING";
      state.runtime = { uptimeInSeconds: 1 };
      return { desiredStatus: "RUNNING" };
    },
    async stop() {
      calls.push("stop");
      if (stopThrows) throw new Error("network down");
      if (stopConfirms) {
        state.desiredStatus = "EXITED";
        state.runtime = null;
      }
      return { desiredStatus: "EXITED" };
    },
    async terminate() {
      calls.push("terminate");
      state.desiredStatus = "GONE";
      return { desiredStatus: "TERMINATED" };
    },
  };
}

test("activation gate refuses without explicit approval, bounds runtime/cost, and always discloses no hard ceiling", () => {
  const costEstimate = estimateSessionCost({ costPerHr: 0.44, maxRuntimeMinutes: 30 });
  assert.equal(costEstimate.plannedCostUsd, 0.22);
  assert.equal(costEstimate.worstCaseCostUsd, 0.26);
  const base = { maxRuntimeMinutes: 30, maxCostUsd: 1, acknowledgeNoHardCeiling: true, costEstimate, account: { clientBalance: 9.95 }, pod: { desiredStatus: "EXITED" } };
  assert.equal(evaluateActivationGate({ ...base }).allowed, false);
  assert.equal(evaluateActivationGate({ ...base, approvalIdFromEnv: "A", approvalIdFromArgs: "B" }).allowed, false);
  assert.equal(evaluateActivationGate({ ...base, approvalIdFromEnv: "A", approvalIdFromArgs: "A" }).allowed, true);
  assert.equal(evaluateActivationGate({ ...base, approvalIdFromEnv: "A", approvalIdFromArgs: "A", maxRuntimeMinutes: 61 }).allowed, false);
  assert.equal(evaluateActivationGate({ ...base, approvalIdFromEnv: "A", approvalIdFromArgs: "A", maxCostUsd: 0.1 }).allowed, false);
  assert.equal(evaluateActivationGate({ ...base, approvalIdFromEnv: "A", approvalIdFromArgs: "A", acknowledgeNoHardCeiling: false }).allowed, false);
  assert.equal(evaluateActivationGate({ ...base, approvalIdFromEnv: "A", approvalIdFromArgs: "A", pod: { desiredStatus: "RUNNING" } }).allowed, false);
  assert.match(evaluateActivationGate(base).disclosure, /No hard spending ceiling/);
  assert.equal(estimateSessionCost({ costPerHr: null, maxRuntimeMinutes: 30 }).ok, false);
});

test("CLI start is refused (no resume call) without founder approval id", async () => {
  const fake = fakeRunpod();
  const dir = tmp("ocg-guard-");
  const write = process.stdout.write;
  process.stdout.write = () => true;
  try {
    const code = await guardMain(["start", "--pod", "t3nvfiodzwardv", "--max-minutes", "30", "--max-cost-usd", "1", "--acknowledge-no-hard-ceiling"], {
      env: { OCG_GPU_SESSION_STATE_FILE: path.join(dir, "s.json") },
      client: fake,
    });
    assert.equal(code, 2);
  } finally {
    process.stdout.write = write;
  }
  assert.ok(!fake.calls.includes("resume"));
  assert.equal(fs.existsSync(path.join(dir, "s.json")), false);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("failed resume triggers an immediate safety stop and persists the session", async () => {
  const fake = fakeRunpod();
  fake.resume = async () => {
    fake.calls.push("resume");
    throw new Error("no GPU available");
  };
  const dir = tmp("ocg-guard-");
  const stateFile = path.join(dir, "s.json");
  const write = process.stdout.write;
  const err = process.stderr.write;
  process.stdout.write = () => true;
  process.stderr.write = () => true;
  try {
    await guardMain(
      ["start", "--pod", "t3nvfiodzwardv", "--max-minutes", "10", "--max-cost-usd", "1", "--approval-id", "FOUNDER-1", "--acknowledge-no-hard-ceiling"],
      { env: { OCG_GPU_SESSION_STATE_FILE: stateFile, OCG_GPU_ACTIVATION_APPROVAL_ID: "FOUNDER-1" }, client: fake, sleep: async () => {} },
    );
  } finally {
    process.stdout.write = write;
    process.stderr.write = err;
    process.removeAllListeners("SIGINT");
    process.removeAllListeners("SIGTERM");
    process.exitCode = undefined;
  }
  assert.deepEqual(fake.calls.filter((c) => c === "resume" || c === "stop"), ["resume", "stop"]);
  const st = readSessionState(stateFile);
  assert.equal(st.status, "closed");
  assert.equal(st.closedBy, "resume_failed_safety_stop");
  fs.rmSync(dir, { recursive: true, force: true });
});

test("shutdown is confirmed by polling, and escalates stop -> terminate when stop never confirms", async () => {
  const ok = fakeRunpod({ desiredStatus: "RUNNING" });
  ok.state.runtime = { uptimeInSeconds: 5 };
  const r1 = await shutdownAndConfirm(ok, "p1", { sleep: async () => {} });
  assert.equal(r1.confirmed, true);

  let t = 0;
  const stuck = fakeRunpod({ desiredStatus: "RUNNING", stopConfirms: false });
  stuck.state.runtime = { uptimeInSeconds: 5 };
  const r2 = await shutdownAndConfirm(stuck, "p2", { sleep: async () => (t += 60_000), nowImpl: () => t, allowTerminateEscalation: true });
  assert.equal(r2.confirmed, true);
  assert.deepEqual(r2.attempts.map((a) => a.action), ["stop", "terminate"]);

  t = 0;
  const down = fakeRunpod({ desiredStatus: "RUNNING", stopThrows: true });
  down.state.runtime = { uptimeInSeconds: 5 };
  const r3 = await shutdownAndConfirm(down, "p3", { sleep: async () => (t += 60_000), nowImpl: () => t });
  assert.equal(r3.confirmed, false);
  assert.match(r3.note, /SHUTDOWN NOT CONFIRMED/);
});

test("reconcile recovers a disconnected session: stops an overdue pod, leaves an in-window pod alone", async () => {
  const dir = tmp("ocg-rec-");
  const stateFile = path.join(dir, "s.json");
  const fake = fakeRunpod({ desiredStatus: "RUNNING" });
  fake.state.runtime = { uptimeInSeconds: 999 };
  writeSessionState(stateFile, { podId: "p1", status: "open", deadlineMs: Date.now() + 60_000 });
  assert.equal((await reconcileSession(fake, stateFile)).action, "none");
  assert.ok(!fake.calls.includes("stop"));
  writeSessionState(stateFile, { podId: "p1", status: "open", deadlineMs: Date.now() - 1 });
  const res = await reconcileSession(fake, stateFile, { sleep: async () => {} });
  assert.equal(res.action, "shutdown");
  assert.equal(res.confirmed, true);
  assert.equal(readSessionState(stateFile).status, "closed");
  fs.rmSync(dir, { recursive: true, force: true });
});

test("cost alerts fire once each at 50/80/100% of the approved budget", () => {
  const a = costAlerts({ costPerHr: 0.6, elapsedMs: 3_600_000, approvedCostUsd: 1 });
  assert.deepEqual(a.newAlerts, [0.5]);
  const b = costAlerts({ costPerHr: 0.6, elapsedMs: 6_100_000, approvedCostUsd: 1, alreadyRaised: [0.5] });
  assert.deepEqual(b.newAlerts, [0.8, 1.0]);
  assert.match(HARD_CEILING_DISCLOSURE, /prepaid Runpod balance/);
});
 
test("status outage cannot confirm termination or close a guarded session", async () => {
  let t = 0;
  const client = { stop: async () => ({}), terminate: async () => ({}), pod: async () => { throw new Error("offline"); } };
  const result = await shutdownAndConfirm(client, "p", { action: "terminate", nowImpl: () => t, sleep: async () => { t += 100; }, confirmTimeoutMs: 100 });
  assert.equal(result.confirmed, false);
  const dir = tmp("ocg-outage-");
  const stateFile = path.join(dir, "s.json");
  try {
    writeSessionState(stateFile, { podId: "p", status: "open", deadlineMs: 0 });
    assert.equal((await reconcileSession(client, stateFile, { nowImpl: () => t, sleep: async () => { t += 100; }, confirmTimeoutMs: 100 })).action, "unconfirmed");
    assert.equal(readSessionState(stateFile).status, "open");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("GraphQL HTTP 200 errors are rejected by the spend guard transport", async () => {
  const { createRunpodGraphqlTransport, createRunpodClient } = await import("../lib/renovision/runpod-spend-guard.mjs");
  const query = createRunpodGraphqlTransport({ apiKey: "mock-only", fetchImpl: async () => ({ ok: true, json: async () => ({ errors: [{ message: "stop rejected" }] }) }) });
  await assert.rejects(query("mock"), /RUNPOD_API_ERROR: stop rejected/);

  const emptyDataQuery = createRunpodGraphqlTransport({ apiKey: "mock-only", fetchImpl: async () => ({ ok: true, json: async () => ({}) }) });
  await assert.rejects(emptyDataQuery("mock"), /RUNPOD_API_ERROR: missing or invalid GraphQL data object/);

  const nullStopClient = createRunpodClient(createRunpodGraphqlTransport({ apiKey: "mock-only", fetchImpl: async () => ({ ok: true, json: async () => ({ data: { podStop: null } }) }) }));
  await assert.rejects(nullStopClient.stop("p1"), /RUNPOD_API_ERROR: ambiguous podStop response/);

  const missingTermClient = createRunpodClient(createRunpodGraphqlTransport({ apiKey: "mock-only", fetchImpl: async () => ({ ok: true, json: async () => ({ data: {} }) }) }));
  await assert.rejects(missingTermClient.terminate("p1"), /RUNPOD_API_ERROR: ambiguous podTerminate response/);
});

test("ambiguous terminate response never confirms termination even when pod() returns null", async () => {
  let t = 0;
  const ambiguousClient = {
    stop: async () => ({}),
    terminate: async () => ({}),
    pod: async () => null,
  };
  const res = await shutdownAndConfirm(ambiguousClient, "p-ambig", {
    action: "terminate",
    nowImpl: () => t,
    sleep: async () => { t += 100; },
    confirmTimeoutMs: 100,
  });
  assert.equal(res.confirmed, false);
  assert.equal(res.attempts[0].accepted, false);
});

test("overdue reconcile still attempts safe shutdown when initial status query fails", async () => {
  const dir = tmp("ocg-overdue-outage-");
  const stateFile = path.join(dir, "s.json");
  try {
    let podCalls = 0;
    const calls = [];
    const transientClient = {
      async pod(id) {
        podCalls += 1;
        calls.push("pod");
        if (podCalls === 1) throw new Error("transient status outage");
        return { id, desiredStatus: "EXITED", runtime: null };
      },
      async stop(id) {
        calls.push("stop");
        return { id, desiredStatus: "EXITED" };
      },
      async terminate() {
        calls.push("terminate");
        return { id: "p1", desiredStatus: "TERMINATED" };
      },
    };
    writeSessionState(stateFile, { podId: "p1", status: "open", deadlineMs: 0 });
    const res = await reconcileSession(transientClient, stateFile, { sleep: async () => {} });
    assert.equal(res.action, "shutdown");
    assert.equal(res.confirmed, true);
    assert.ok(calls.includes("stop"), "overdue reconcile must attempt stop even after initial pod() failure");
    assert.equal(readSessionState(stateFile).status, "closed");

    const persistentOutageCalls = [];
    let t = 0;
    const outageClient = {
      async pod() { persistentOutageCalls.push("pod"); throw new Error("offline"); },
      async stop() { persistentOutageCalls.push("stop"); throw new Error("offline"); },
      async terminate() { persistentOutageCalls.push("terminate"); throw new Error("offline"); },
    };
    writeSessionState(stateFile, { podId: "p2", status: "open", deadlineMs: 0 });
    const r2 = await reconcileSession(outageClient, stateFile, {
      nowImpl: () => t,
      sleep: async () => { t += 100; },
      confirmTimeoutMs: 100,
    });
    assert.equal(r2.action, "unconfirmed");
    assert.ok(persistentOutageCalls.includes("stop"), "overdue reconcile must still attempt stop on persistent outage");
    assert.equal(readSessionState(stateFile).status, "open");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("CLI refuses destructive --terminate and --allow-terminate-escalation without OCG_POD_TERMINATION_APPROVED=1", async () => {
  const fake = fakeRunpod({ desiredStatus: "RUNNING" });
  const dir = tmp("ocg-term-gate-");
  const write = process.stdout.write;
  const captured = [];
  process.stdout.write = (chunk) => { captured.push(String(chunk)); return true; };
  try {
    const c1 = await guardMain(["stop", "--pod", "p1", "--terminate"], {
      env: { OCG_GPU_SESSION_STATE_FILE: path.join(dir, "s.json") },
      client: fake,
    });
    assert.equal(c1, 2);
    const c2 = await guardMain(["stop", "--pod", "p1", "--allow-terminate-escalation"], {
      env: { OCG_GPU_SESSION_STATE_FILE: path.join(dir, "s.json") },
      client: fake,
    });
    assert.equal(c2, 2);
    const c3 = await guardMain(["start", "--pod", "p1", "--max-minutes", "10", "--max-cost-usd", "1", "--approval-id", "A", "--acknowledge-no-hard-ceiling", "--allow-terminate-escalation"], {
      env: { OCG_GPU_SESSION_STATE_FILE: path.join(dir, "s.json"), OCG_GPU_ACTIVATION_APPROVAL_ID: "A" },
      client: fake,
    });
    assert.equal(c3, 2);
  } finally {
    process.stdout.write = write;
    fs.rmSync(dir, { recursive: true, force: true });
  }
  assert.deepEqual(fake.calls, [], "no Runpod API calls may occur when destructive termination is not approved");
  assert.match(captured.join("\n"), /DESTRUCTIVE_TERMINATION_NOT_APPROVED/);
});

test("in-pod watchdog rejects GraphQL errors and null podStop responses and accepts valid stop response", async (t) => {
  if (spawnSync("sh", ["-c", "command -v curl >/dev/null && (command -v python3 >/dev/null || command -v python >/dev/null)"]).status !== 0) {
    return t.skip("sh/curl/python not available");
  }
  const http = await import("node:http");
  const dir = tmp("ocg-wd-gql-");
  let mode = "errors";
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    if (mode === "errors") res.end(JSON.stringify({ errors: [{ message: "unauthorized" }] }));
    else if (mode === "nullStop") res.end(JSON.stringify({ data: { podStop: null } }));
    else res.end(JSON.stringify({ data: { podStop: { id: "pod-test", desiredStatus: "EXITED" } } }));
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address();
  const baseEnv = {
    ...process.env,
    OCG_WATCHDOG_DRY_RUN: "0",
    OCG_POD_MAX_RUNTIME_SECONDS: "0",
    OCG_WATCHDOG_POLL_SECONDS: "1",
    OCG_WATCHDOG_RETRY_SLEEP_SECONDS: "0",
    OCG_ACTIVITY_FILE: path.join(dir, "act"),
    RUNPOD_POD_ID: "pod-test",
    RUNPOD_API_KEY: "mock-only",
    OCG_RUNPOD_GRAPHQL_ENDPOINT: `http://127.0.0.1:${port}/graphql`,
  };
  const runWatchdog = (env) =>
    new Promise((resolve, reject) => {
      const child = spawn("sh", ["infra/trellis2/pod_watchdog.sh"], { env, stdio: ["ignore", "pipe", "pipe"] });
      let stderr = "";
      child.stderr.on("data", (d) => { stderr += d.toString(); });
      const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error("watchdog test timeout")); }, 20_000);
      child.on("close", (status) => { clearTimeout(timer); resolve({ status, stderr }); });
      child.on("error", (err) => { clearTimeout(timer); reject(err); });
    });
  try {
    mode = "errors";
    const rErr = await runWatchdog(baseEnv);
    assert.equal(rErr.status, 4);
    assert.match(rErr.stderr, /all stop attempts failed/);

    mode = "nullStop";
    const rNull = await runWatchdog(baseEnv);
    assert.equal(rNull.status, 4);
    assert.match(rNull.stderr, /all stop attempts failed/);

    mode = "ok";
    const rOk = await runWatchdog(baseEnv);
    assert.equal(rOk.status, 0);
    assert.match(rOk.stderr, /API stop request accepted/);
  } finally {
    server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
