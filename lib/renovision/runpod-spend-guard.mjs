/** Out-of-pod Runpod spend guard for shared-GPU sessions (Phase 9.2).
 *
 * Layer 2 of the GPU shutdown safeguards (layer 1 is the in-pod watchdog
 * infra/trellis2/pod_watchdog.sh; layer 3 is the prepaid account balance).
 *
 * What this module CAN do:
 *   - read pod state, hourly cost, uptime, account balance and spend limit;
 *   - refuse activation unless an explicit founder approval id, a bounded runtime
 *     (<= 60 min) and a bounded cost estimate are all present;
 *   - persist a session deadline to disk BEFORE resuming the pod, so a crashed or
 *     disconnected control session can be recovered by `reconcile`;
 *   - request stop (or terminate) and POLL until Runpod reports the pod EXITED/
 *     terminated, escalating to terminate when stop is not confirmed;
 *   - emit cost alerts at 50% / 80% / 100% of the approved budget.
 *
 * What it CANNOT do (and never claims to):
 *   - guarantee a hard dollar ceiling. A stop request is not a billing cutoff;
 *     Runpod bills until the pod is actually stopped, a stopped pod still bills
 *     disk/volume storage, and Runpod offers no server-enforced stop-after
 *     deadline. The only hard monetary ceiling is the prepaid balance with
 *     auto-pay disabled (at $0 Runpod stops all pods).
 *
 * All network access goes through an injected `transport` so tests run at $0. */
import fs from "node:fs";
import path from "node:path";

export const SPEND_GUARD_LIMITS = Object.freeze({
  maxRuntimeMinutes: 60,
  maxApprovedCostUsd: 5,
  stopConfirmTimeoutMs: 300_000,
  pollIntervalMs: 10_000,
  alertThresholds: [0.5, 0.8, 1.0],
});

export const HARD_CEILING_DISCLOSURE =
  "No hard spending ceiling is enforceable by this guard: stop/terminate requests are not guaranteed billing cutoffs, stopped pods still bill storage, and Runpod has no server-enforced stop-after deadline. The only hard monetary ceiling is the prepaid Runpod balance with auto-pay disabled.";

const STOPPED_STATES = new Set(["EXITED", "TERMINATED", "STOPPED"]);

export function createRunpodGraphqlTransport({ apiKey, fetchImpl = globalThis.fetch, endpoint = "https://api.runpod.io/graphql" } = {}) {
  if (!apiKey) throw new Error("RUNPOD_API_KEY is required (read from the environment; never pass it on the command line)");
  return async function query(gql, variables = {}) {
    const res = await fetchImpl(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ query: gql, variables }),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok || !body || typeof body !== "object" || body.errors) {
      const msg = body?.errors?.map((e) => e.message).join("; ") || (!res.ok ? `HTTP ${res.status}` : "malformed or empty JSON response");
      throw new Error(`RUNPOD_API_ERROR: ${msg}`);
    }
    if (!body.data || typeof body.data !== "object" || Array.isArray(body.data)) {
      throw new Error("RUNPOD_API_ERROR: missing or invalid GraphQL data object");
    }
    return body.data;
  };
}

export function createRunpodClient(transport) {
  return {
    async account() {
      const d = await transport("query { myself { clientBalance spendLimit currentSpendPerHr } }");
      return d.myself;
    },
    async pod(podId) {
      const d = await transport(
        "query Pod($podId: String!) { pod(input: {podId: $podId}) { id name desiredStatus costPerHr gpuCount volumeInGb containerDiskInGb imageName machine { gpuDisplayName } runtime { uptimeInSeconds gpus { id } } } }",
        { podId },
      );
      return d.pod;
    },
    async listPods() {
      const d = await transport("query { myself { pods { id name desiredStatus costPerHr } } }");
      return d.myself?.pods ?? [];
    },
    async resume(podId) {
      const d = await transport(
        "mutation Resume($podId: String!) { podResume(input: {podId: $podId, gpuCount: 1}) { id desiredStatus costPerHr } }",
        { podId },
      );
      return d.podResume;
    },
    async stop(podId) {
      const d = await transport("mutation Stop($podId: String!) { podStop(input: {podId: $podId}) { id desiredStatus } }", { podId });
      if (!d?.podStop || typeof d.podStop !== "object" || typeof d.podStop.id !== "string" || !d.podStop.id) {
        throw new Error("RUNPOD_API_ERROR: ambiguous podStop response (missing podStop.id)");
      }
      return d.podStop;
    },
    async terminate(podId) {
      const d = await transport("mutation Term($podId: String!) { podTerminate(input: {podId: $podId}) }", { podId });
      if (!d || typeof d !== "object" || !Object.prototype.hasOwnProperty.call(d, "podTerminate") || d.podTerminate === false) {
        throw new Error("RUNPOD_API_ERROR: ambiguous podTerminate response (missing podTerminate field)");
      }
      return { id: podId, desiredStatus: "TERMINATED" };
    },
  };
}

export function estimateSessionCost({ costPerHr, maxRuntimeMinutes, stopConfirmMinutes = SPEND_GUARD_LIMITS.stopConfirmTimeoutMs / 60_000 }) {
  const rate = Number(costPerHr);
  if (!Number.isFinite(rate) || rate <= 0) return { ok: false, error: "unknown_hourly_rate" };
  const billableMinutes = maxRuntimeMinutes + stopConfirmMinutes; // worst case includes stop-confirmation window
  return {
    ok: true,
    costPerHr: rate,
    plannedMinutes: maxRuntimeMinutes,
    worstCaseBillableMinutes: billableMinutes,
    plannedCostUsd: round2((rate * maxRuntimeMinutes) / 60),
    worstCaseCostUsd: round2((rate * billableMinutes) / 60),
    excludes: ["network volume / disk storage billed monthly", "billing granularity rounding", "time before the guard observes RUNNING"],
  };
}

function round2(x) {
  return Math.ceil(x * 100) / 100;
}

/** Pure gate: decides whether a live activation may proceed. Never performs I/O. */
export function evaluateActivationGate({
  approvalIdFromEnv,
  approvalIdFromArgs,
  maxRuntimeMinutes,
  maxCostUsd,
  acknowledgeNoHardCeiling,
  costEstimate,
  account,
  pod,
} = {}) {
  const blockers = [];
  if (!approvalIdFromEnv || !approvalIdFromArgs || approvalIdFromEnv !== approvalIdFromArgs) {
    blockers.push("explicit founder activation approval id missing or mismatched (OCG_GPU_ACTIVATION_APPROVAL_ID vs --approval-id)");
  }
  if (!Number.isInteger(maxRuntimeMinutes) || maxRuntimeMinutes < 1 || maxRuntimeMinutes > SPEND_GUARD_LIMITS.maxRuntimeMinutes) {
    blockers.push(`--max-minutes must be an integer between 1 and ${SPEND_GUARD_LIMITS.maxRuntimeMinutes}`);
  }
  if (!Number.isFinite(maxCostUsd) || maxCostUsd <= 0 || maxCostUsd > SPEND_GUARD_LIMITS.maxApprovedCostUsd) {
    blockers.push(`--max-cost-usd must be > 0 and <= ${SPEND_GUARD_LIMITS.maxApprovedCostUsd}`);
  }
  if (acknowledgeNoHardCeiling !== true) {
    blockers.push("--acknowledge-no-hard-ceiling is required: " + HARD_CEILING_DISCLOSURE);
  }
  if (!costEstimate?.ok) {
    blockers.push("hourly rate unknown; cannot bound cost");
  } else if (Number.isFinite(maxCostUsd) && costEstimate.worstCaseCostUsd > maxCostUsd) {
    blockers.push(`worst-case cost $${costEstimate.worstCaseCostUsd} exceeds approved $${maxCostUsd}`);
  }
  if (!account || !Number.isFinite(Number(account.clientBalance))) {
    blockers.push("account balance unreadable");
  } else if (costEstimate?.ok && Number(account.clientBalance) < costEstimate.worstCaseCostUsd) {
    blockers.push("account balance below worst-case session cost");
  }
  if (!pod) {
    blockers.push("pod not found");
  } else if (!STOPPED_STATES.has(String(pod.desiredStatus))) {
    blockers.push(`pod must be stopped before a guarded session starts (observed ${pod.desiredStatus})`);
  }
  return { allowed: blockers.length === 0, blockers, disclosure: HARD_CEILING_DISCLOSURE };
}

export function readSessionState(stateFile) {
  try {
    return JSON.parse(fs.readFileSync(stateFile, "utf8"));
  } catch {
    return null;
  }
}

export function writeSessionState(stateFile, state) {
  fs.mkdirSync(path.dirname(stateFile), { recursive: true });
  const tmp = `${stateFile}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, stateFile);
}

/** Request shutdown and poll until Runpod confirms; escalate stop -> terminate. */
export async function shutdownAndConfirm(client, podId, {
  action = "stop",
  allowTerminateEscalation = false,
  confirmTimeoutMs = SPEND_GUARD_LIMITS.stopConfirmTimeoutMs,
  pollIntervalMs = SPEND_GUARD_LIMITS.pollIntervalMs,
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
  nowImpl = Date.now,
  log = () => {},
} = {}) {
  const attempts = [];
  const tryAction = async (act) => {
    try {
      const out = act === "terminate" ? await client.terminate(podId) : await client.stop(podId);
      const validAcceptance =
        out &&
        typeof out === "object" &&
        (act === "terminate"
          ? out.desiredStatus === "TERMINATED" || (typeof out.id === "string" && out.id.length > 0)
          : (typeof out.desiredStatus === "string" && out.desiredStatus.length > 0) || (typeof out.id === "string" && out.id.length > 0));
      if (!validAcceptance) {
        attempts.push({ action: act, accepted: false, error: "ambiguous API response" });
        log(`${act} request returned ambiguous response for ${podId}; not treating as accepted`);
        return false;
      }
      attempts.push({ action: act, accepted: true, desiredStatus: out.desiredStatus ?? null });
      log(`${act} request accepted for ${podId} (not yet a confirmed billing stop)`);
      return true;
    } catch (err) {
      attempts.push({ action: act, accepted: false, error: err.message });
      log(`${act} request failed for ${podId}: ${err.message}`);
      return false;
    }
  };

  const confirm = async () => {
    const deadline = nowImpl() + confirmTimeoutMs;
    for (;;) {
      let pod = undefined;
      try {
        pod = await client.pod(podId);
      } catch (err) {
        log(`status read failed: ${err.message}`);
      }
      if (pod === null && attempts.some((a) => a.action === "terminate" && a.accepted)) {
        return { confirmed: true, observedStatus: "TERMINATED (pod no longer listed)" };
      }
      if (pod && STOPPED_STATES.has(String(pod.desiredStatus)) && !pod.runtime) {
        return { confirmed: true, observedStatus: pod.desiredStatus };
      }
      if (nowImpl() >= deadline) return { confirmed: false, observedStatus: pod?.desiredStatus ?? "unknown" };
      await sleep(pollIntervalMs);
    }
  };

  await tryAction(action);
  let result = await confirm();
  if (!result.confirmed && action === "stop" && allowTerminateEscalation) {
    log("stop not confirmed within timeout; escalating to terminate");
    await tryAction("terminate");
    result = await confirm();
  }
  return {
    podId,
    confirmed: result.confirmed,
    observedStatus: result.observedStatus,
    attempts,
    note: result.confirmed
      ? "Runpod reports the pod stopped/terminated. Storage may continue to bill."
      : "SHUTDOWN NOT CONFIRMED — escalate manually in console.runpod.io immediately.",
  };
}

/** Recovery for disconnected/failed control sessions: stop any guarded pod whose deadline passed. */
export async function reconcileSession(client, stateFile, { nowImpl = Date.now, ...shutdownOpts } = {}) {
  const state = readSessionState(stateFile);
  if (!state || state.status === "closed") return { action: "none", reason: "no open guarded session" };
  let pod = undefined;
  let podError = null;
  try {
    pod = await client.pod(state.podId);
  } catch (err) {
    podError = err;
  }
  const overdue = nowImpl() >= state.deadlineMs;
  if (podError || !pod) {
    if (overdue) {
      const out = await shutdownAndConfirm(client, state.podId, {
        allowTerminateEscalation: state.allowTerminateEscalation === true,
        nowImpl,
        ...shutdownOpts,
      });
      if (out.confirmed) {
        writeSessionState(stateFile, { ...state, status: "closed", closedAt: new Date(nowImpl()).toISOString(), closedBy: "reconcile:deadline", shutdown: out });
        return { action: "shutdown", ...out };
      }
      writeSessionState(stateFile, { ...state, status: "open", lastReconcileAttemptAt: new Date(nowImpl()).toISOString(), shutdown: out });
      return {
        action: "unconfirmed",
        reason: podError ? "pod status unavailable; overdue shutdown attempted but unconfirmed" : "pod missing; overdue shutdown attempted but unconfirmed",
        ...out,
      };
    }
    return { action: "unconfirmed", reason: podError ? "pod status unavailable; session remains open" : "pod missing; shutdown not verified" };
  }
  const running = pod && !STOPPED_STATES.has(String(pod.desiredStatus));
  if (!running && !pod.runtime) {
    writeSessionState(stateFile, { ...state, status: "closed", closedAt: new Date(nowImpl()).toISOString(), closedBy: "reconcile:already-stopped" });
    return { action: "closed", reason: "pod already stopped" };
  }
  if (!overdue) {
    return { action: "none", reason: "session within approved window", remainingMs: state.deadlineMs - nowImpl() };
  }
  const out = await shutdownAndConfirm(client, state.podId, { allowTerminateEscalation: state.allowTerminateEscalation === true, nowImpl, ...shutdownOpts });
  writeSessionState(stateFile, { ...state, status: out.confirmed ? "closed" : "shutdown_unconfirmed", closedAt: new Date(nowImpl()).toISOString(), closedBy: "reconcile:deadline", shutdown: out });
  return { action: "shutdown", ...out };
}

export function costAlerts({ costPerHr, elapsedMs, approvedCostUsd, alreadyRaised = [] }) {
  const spent = (Number(costPerHr) * elapsedMs) / 3_600_000;
  const raised = [];
  for (const t of SPEND_GUARD_LIMITS.alertThresholds) {
    if (spent >= approvedCostUsd * t && !alreadyRaised.includes(t)) raised.push(t);
  }
  return { estimatedSpendUsd: round2(spent), newAlerts: raised };
}
