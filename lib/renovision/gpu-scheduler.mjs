/** Shared-GPU scheduler for the OCG 3D ENGINE (Phase 9.2).
 *
 * Two layers of mutual exclusion so RENOVISION (TRELLIS.2) and NOVA (ComfyUI)
 * never contend for the same GPU unless measured capacity proves it is safe:
 *
 *  1. In-process FIFO semaphore (default concurrency 1 = sequential scheduling)
 *     with bounded queue depth, queue-wait timeout, and AbortSignal cancellation.
 *  2. Optional cross-process lease file (OCG_GPU_LEASE_FILE) on the shared pod
 *     filesystem. Any co-tenant workload (e.g. NOVA's ComfyUI wrapper) honours the
 *     same lease protocol: create the file exclusively ("wx"), write
 *     {owner, token, pid, acquiredAt, expiresAt}, delete it on release. A lease
 *     whose expiresAt has passed is considered stale and may be reclaimed.
 *
 * Performs NO network calls and starts NO paid resources. */
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

export const GPU_SCHEDULER_ERRORS = Object.freeze({
  QUEUE_FULL: "GPU_QUEUE_FULL",
  QUEUE_TIMEOUT: "GPU_QUEUE_TIMEOUT",
  CANCELLED: "JOB_CANCELLED",
  LEASE_HELD: "GPU_LEASE_HELD_BY_OTHER_WORKLOAD",
});

function schedulerError(code, message) {
  return Object.assign(new Error(`${code}: ${message}`), { code });
}

function clampInt(value, { min, max, fallback }) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

export function resolveGpuSchedulerConfig(env = process.env) {
  return {
    maxConcurrency: clampInt(env.OCG_GPU_MAX_CONCURRENCY, { min: 1, max: 4, fallback: 1 }),
    maxQueueDepth: clampInt(env.OCG_GPU_MAX_QUEUE_DEPTH, { min: 0, max: 64, fallback: 8 }),
    queueTimeoutMs: clampInt(env.OCG_GPU_QUEUE_TIMEOUT_MS, { min: 1_000, max: 1_800_000, fallback: 600_000 }),
    leaseFile: typeof env.OCG_GPU_LEASE_FILE === "string" && env.OCG_GPU_LEASE_FILE.trim() ? env.OCG_GPU_LEASE_FILE.trim() : null,
    leaseTtlMs: clampInt(env.OCG_GPU_LEASE_TTL_MS, { min: 10_000, max: 3_600_000, fallback: 960_000 }),
    owner: (env.OCG_GPU_LEASE_OWNER || "reno-trellis2").trim() || "reno-trellis2",
  };
}

export function createGpuScheduler({
  maxConcurrency = 1,
  maxQueueDepth = 8,
  queueTimeoutMs = 600_000,
  leaseFile = null,
  leaseTtlMs = 960_000,
  leasePollMs = 500,
  owner = "reno-trellis2",
  fsImpl = fs,
  nowImpl = Date.now,
} = {}) {
  if (leaseFile && maxConcurrency !== 1) {
    throw new Error("cross-process GPU lease requires maxConcurrency=1 (sequential scheduling)");
  }
  let running = 0;
  const waiters = [];
  const counters = { granted: 0, rejectedQueueFull: 0, timedOut: 0, cancelled: 0, staleLeasesReclaimed: 0 };

  function readLease() {
    try {
      return JSON.parse(fsImpl.readFileSync(leaseFile, "utf8"));
    } catch {
      return null;
    }
  }

  function tryAcquireLease(token) {
    const now = nowImpl();
    const record = { owner, token, pid: process.pid, acquiredAt: new Date(now).toISOString(), expiresAt: now + leaseTtlMs };
    try {
      fsImpl.mkdirSync(path.dirname(leaseFile), { recursive: true });
      fsImpl.writeFileSync(leaseFile, JSON.stringify(record), { flag: "wx" });
      return { ok: true };
    } catch (err) {
      if (err?.code !== "EEXIST") throw err;
      const held = readLease();
      if (!held || typeof held.expiresAt !== "number" || held.expiresAt <= now) {
        try {
          fsImpl.unlinkSync(leaseFile);
          counters.staleLeasesReclaimed += 1;
        } catch {
          /* another process reclaimed it first */
        }
        return { ok: false, retryNow: true, holder: held };
      }
      return { ok: false, retryNow: false, holder: held };
    }
  }

  function releaseLease(token) {
    const held = readLease();
    if (held && held.token === token) {
      try {
        fsImpl.unlinkSync(leaseFile);
      } catch {
        /* already gone */
      }
    }
  }

  async function waitForLease(token, { signal, deadline }) {
    for (;;) {
      if (signal?.aborted) throw schedulerError(GPU_SCHEDULER_ERRORS.CANCELLED, "job cancelled while waiting for GPU lease");
      const res = tryAcquireLease(token);
      if (res.ok) return;
      if (res.retryNow) continue;
      if (nowImpl() >= deadline) {
        throw schedulerError(
          GPU_SCHEDULER_ERRORS.LEASE_HELD,
          `GPU lease held by ${res.holder?.owner ?? "unknown"} until ${new Date(res.holder?.expiresAt ?? 0).toISOString()}`,
        );
      }
      await new Promise((r) => setTimeout(r, leasePollMs));
    }
  }

  function dispatch() {
    while (running < maxConcurrency && waiters.length > 0) {
      const next = waiters.shift();
      running += 1;
      next.grant();
    }
  }

  async function acquire({ signal = null } = {}) {
    if (signal?.aborted) {
      counters.cancelled += 1;
      throw schedulerError(GPU_SCHEDULER_ERRORS.CANCELLED, "job cancelled before GPU scheduling");
    }
    const deadline = nowImpl() + queueTimeoutMs;
    if (running >= maxConcurrency) {
      if (waiters.length >= maxQueueDepth) {
        counters.rejectedQueueFull += 1;
        throw schedulerError(GPU_SCHEDULER_ERRORS.QUEUE_FULL, `GPU queue depth ${maxQueueDepth} reached`);
      }
      await new Promise((resolve, reject) => {
        const waiter = { grant: null };
        const cleanup = () => {
          clearTimeout(timer);
          signal?.removeEventListener?.("abort", onAbort);
        };
        const remove = () => {
          const idx = waiters.indexOf(waiter);
          if (idx >= 0) waiters.splice(idx, 1);
        };
        const timer = setTimeout(() => {
          remove();
          cleanup();
          counters.timedOut += 1;
          reject(schedulerError(GPU_SCHEDULER_ERRORS.QUEUE_TIMEOUT, `waited ${queueTimeoutMs}ms for a GPU slot`));
        }, queueTimeoutMs);
        const onAbort = () => {
          remove();
          cleanup();
          counters.cancelled += 1;
          reject(schedulerError(GPU_SCHEDULER_ERRORS.CANCELLED, "job cancelled while queued for GPU"));
        };
        waiter.grant = () => {
          cleanup();
          resolve();
        };
        signal?.addEventListener?.("abort", onAbort, { once: true });
        waiters.push(waiter);
      });
    } else {
      running += 1;
    }

    const token = randomUUID();
    if (leaseFile) {
      try {
        await waitForLease(token, { signal, deadline });
      } catch (err) {
        running -= 1;
        dispatch();
        if (err.code === GPU_SCHEDULER_ERRORS.CANCELLED) counters.cancelled += 1;
        throw err;
      }
    }
    counters.granted += 1;
    let released = false;
    return function release() {
      if (released) return;
      released = true;
      if (leaseFile) releaseLease(token);
      running -= 1;
      dispatch();
    };
  }

  function stats() {
    return { running, queued: waiters.length, maxConcurrency, maxQueueDepth, queueTimeoutMs, leaseFile, ...counters };
  }

  return { acquire, stats };
}
