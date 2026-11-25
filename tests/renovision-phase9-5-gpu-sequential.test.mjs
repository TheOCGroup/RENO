// Phase 9.5 — UF-Q9-3 regression: the shared-GPU sequential guarantee must hold
// regardless of the OCG_GPU_MAX_CONCURRENCY env value. The env-facing config
// resolver feeds exactly one production consumer — the TRELLIS provider on the
// GPU shared with NOVA — so a request for concurrency above 1 is REFUSED with a
// disclosed reason, never silently honoured or clamped upward.
// Everything runs on CPU at $0: no GPU, no network, no Runpod API calls.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { createGpuScheduler, resolveGpuSchedulerConfig, GPU_SCHEDULER_ERRORS } from "../lib/renovision/gpu-scheduler.mjs";
import { createTrellisSubprocessProvider } from "../lib/renovision/trellis-provider.mjs";
import { buildProceduralObjectPng256 } from "../scripts/live_3d_acceptance.mjs";

const SAMPLE_GLB = fs.readFileSync(path.resolve("assets/samples/accent-chair.glb"));
const PNG_B64 = buildProceduralObjectPng256().toString("base64");

function withEnv(overrides, fn) {
  const saved = {};
  for (const k of Object.keys(overrides)) {
    saved[k] = process.env[k];
    if (overrides[k] === undefined) delete process.env[k];
    else process.env[k] = overrides[k];
  }
  try {
    return fn();
  } finally {
    for (const k of Object.keys(overrides)) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
}

test("UF-Q9-3: env requests for concurrency above 1 are refused with a disclosed reason", () => {
  for (const raw of ["2", "3", "4", "99"]) {
    assert.throws(
      () => resolveGpuSchedulerConfig({ OCG_GPU_MAX_CONCURRENCY: raw }),
      (e) => e.code === GPU_SCHEDULER_ERRORS.CONCURRENCY_REFUSED && /sequentially/.test(e.message) && e.message.includes(raw),
      `OCG_GPU_MAX_CONCURRENCY=${raw} must be refused, not honoured`,
    );
  }
});

test("UF-Q9-3: refusal also applies when the shared lease file is configured", () => {
  assert.throws(
    () => resolveGpuSchedulerConfig({ OCG_GPU_MAX_CONCURRENCY: "4", OCG_GPU_LEASE_FILE: "/tmp/gpu.lease" }),
    (e) => e.code === GPU_SCHEDULER_ERRORS.CONCURRENCY_REFUSED,
  );
});

test("UF-Q9-3: legitimate sequential config keeps working (1, 0, garbage, unset)", () => {
  assert.equal(resolveGpuSchedulerConfig({}).maxConcurrency, 1);
  assert.equal(resolveGpuSchedulerConfig({ OCG_GPU_MAX_CONCURRENCY: "1" }).maxConcurrency, 1);
  assert.equal(resolveGpuSchedulerConfig({ OCG_GPU_MAX_CONCURRENCY: "0" }).maxConcurrency, 1);
  assert.equal(resolveGpuSchedulerConfig({ OCG_GPU_MAX_CONCURRENCY: "abc" }).maxConcurrency, 1);
  const s = createGpuScheduler(resolveGpuSchedulerConfig({ OCG_GPU_LEASE_FILE: "/tmp/gpu.lease" }));
  assert.equal(s.stats().maxConcurrency, 1);
});

test("UF-Q9-3: the provider's default env path refuses to start under a concurrency override", () => {
  withEnv({ OCG_GPU_MAX_CONCURRENCY: "4", OCG_GPU_LEASE_FILE: undefined }, () => {
    assert.throws(
      () => createTrellisSubprocessProvider({ execFileImpl: async () => ({}) }),
      (e) => e.code === GPU_SCHEDULER_ERRORS.CONCURRENCY_REFUSED,
    );
  });
});

test("UF-Q9-3: two parallel provider jobs never run TRELLIS workers concurrently (default scheduler)", async () => {
  await withEnv({ OCG_GPU_MAX_CONCURRENCY: undefined, OCG_GPU_LEASE_FILE: undefined }, async () => {
    let active = 0;
    let peak = 0;
    const provider = createTrellisSubprocessProvider({
      execFileImpl: async (_b, args) => {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((r) => setTimeout(r, 30));
        fs.writeFileSync(args[2], SAMPLE_GLB);
        active -= 1;
        return {};
      },
    });
    await Promise.all([1, 2, 3].map(() => provider({ imageBase64: PNG_B64, mimeType: "image/png" })));
    assert.equal(peak, 1);
    assert.equal(provider.scheduler.stats().granted, 3);
    assert.equal(provider.scheduler.stats().running, 0);
  });
});
