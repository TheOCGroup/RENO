#!/usr/bin/env node
/** OCG shared-GPU session guard CLI (Phase 9.2).
 *
 *   node scripts/gpu_session_guard.mjs status    --pod <id>
 *   node scripts/gpu_session_guard.mjs plan      --pod <id> --max-minutes 30
 *   node scripts/gpu_session_guard.mjs start     --pod <id> --max-minutes 30 --max-cost-usd 1 \
 *                                                --approval-id <id> --acknowledge-no-hard-ceiling
 *   node scripts/gpu_session_guard.mjs stop      --pod <id> [--terminate] [--allow-terminate-escalation]
 *   node scripts/gpu_session_guard.mjs reconcile
 *
 * `status`, `plan` and `reconcile` (when nothing is overdue) are read-only.
 * `start` is the ONLY command that can create spend; it is refused unless
 * OCG_GPU_ACTIVATION_APPROVAL_ID (env, set by the founder) matches --approval-id
 * and every bound in evaluateActivationGate passes. RUNPOD_API_KEY is read from
 * the environment only. See lib/renovision/runpod-spend-guard.mjs for limits.
 */
import os from "node:os";
import path from "node:path";
import {
  createRunpodGraphqlTransport,
  createRunpodClient,
  estimateSessionCost,
  evaluateActivationGate,
  shutdownAndConfirm,
  reconcileSession,
  writeSessionState,
  readSessionState,
  costAlerts,
  HARD_CEILING_DISCLOSURE,
  SPEND_GUARD_LIMITS,
} from "../lib/renovision/runpod-spend-guard.mjs";

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const args = { command };
  for (let i = 0; i < rest.length; i += 1) {
    const a = rest[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = rest[i + 1];
    if (next === undefined || next.startsWith("--")) args[key] = true;
    else {
      args[key] = next;
      i += 1;
    }
  }
  return args;
}

const out = (obj) => process.stdout.write(JSON.stringify(obj, null, 2) + "\n");
const log = (msg) => process.stderr.write(`${new Date().toISOString()} gpu-guard ${msg}\n`);

export async function main(argv = process.argv.slice(2), { env = process.env, client: injected = null, sleep } = {}) {
  const args = parseArgs(argv);
  const stateFile = env.OCG_GPU_SESSION_STATE_FILE || path.join(os.homedir(), ".ocg", "gpu-session-state.json");
  const client = injected ?? createRunpodClient(createRunpodGraphqlTransport({ apiKey: env.RUNPOD_API_KEY }));
  const podId = typeof args.pod === "string" ? args.pod : readSessionState(stateFile)?.podId;

  switch (args.command) {
    case "status": {
      const [account, pod] = await Promise.all([client.account(), client.pod(podId)]);
      out({ podId, pod, account, disclosure: HARD_CEILING_DISCLOSURE });
      return 0;
    }
    case "plan":
    case "start": {
      const maxRuntimeMinutes = Number(args["max-minutes"]);
      const maxCostUsd = Number(args["max-cost-usd"]);
      const [account, pod] = await Promise.all([client.account(), client.pod(podId)]);
      const costEstimate = estimateSessionCost({ costPerHr: pod?.costPerHr, maxRuntimeMinutes });
      const gate = evaluateActivationGate({
        approvalIdFromEnv: env.OCG_GPU_ACTIVATION_APPROVAL_ID,
        approvalIdFromArgs: typeof args["approval-id"] === "string" ? args["approval-id"] : null,
        maxRuntimeMinutes,
        maxCostUsd,
        acknowledgeNoHardCeiling: args["acknowledge-no-hard-ceiling"] === true,
        costEstimate,
        account,
        pod,
      });
      if (args.command === "plan" || !gate.allowed) {
        out({ command: args.command, podId, costEstimate, account, gate, activated: false });
        return args.command === "plan" ? 0 : 2;
      }
      const startedMs = Date.now();
      const deadlineMs = startedMs + maxRuntimeMinutes * 60_000;
      // Persist the deadline BEFORE resuming, so `reconcile` can recover a lost session.
      writeSessionState(stateFile, {
        podId,
        status: "open",
        approvalId: args["approval-id"],
        startedAt: new Date(startedMs).toISOString(),
        deadlineMs,
        deadline: new Date(deadlineMs).toISOString(),
        costPerHr: costEstimate.costPerHr,
        approvedCostUsd: maxCostUsd,
        allowTerminateEscalation: args["allow-terminate-escalation"] === true,
      });
      let stopping = false;
      const finish = async (reason) => {
        if (stopping) return;
        stopping = true;
        log(`shutting down: ${reason}`);
        const res = await shutdownAndConfirm(client, podId, { allowTerminateEscalation: args["allow-terminate-escalation"] === true, log, ...(sleep ? { sleep } : {}) });
        writeSessionState(stateFile, { ...readSessionState(stateFile), status: res.confirmed ? "closed" : "shutdown_unconfirmed", closedBy: reason, shutdown: res });
        out({ command: "start", podId, reason, shutdown: res });
        process.exitCode = res.confirmed ? 0 : 4;
      };
      process.once("SIGINT", () => finish("operator_interrupt"));
      process.once("SIGTERM", () => finish("guard_terminated"));
      try {
        await client.resume(podId);
      } catch (err) {
        log(`resume failed: ${err.message}`);
        await finish("resume_failed_safety_stop");
        return process.exitCode;
      }
      const raised = [];
      while (!stopping) {
        const elapsed = Date.now() - startedMs;
        const alerts = costAlerts({ costPerHr: costEstimate.costPerHr, elapsedMs: elapsed, approvedCostUsd: maxCostUsd, alreadyRaised: raised });
        for (const t of alerts.newAlerts) {
          raised.push(t);
          log(`COST ALERT ${Math.round(t * 100)}% of approved $${maxCostUsd} (est. $${alerts.estimatedSpendUsd})`);
        }
        if (Date.now() >= deadlineMs || raised.includes(1.0)) {
          await finish(Date.now() >= deadlineMs ? "max_runtime_reached" : "approved_budget_reached");
          break;
        }
        await (sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms))))(Math.min(30_000, Math.max(1_000, deadlineMs - Date.now())));
      }
      return process.exitCode ?? 0;
    }
    case "stop": {
      if (!podId) throw new Error("--pod is required");
      const res = await shutdownAndConfirm(client, podId, {
        action: args.terminate === true ? "terminate" : "stop",
        allowTerminateEscalation: args["allow-terminate-escalation"] === true,
        log,
        ...(sleep ? { sleep } : {}),
      });
      out({ command: "stop", ...res });
      return res.confirmed ? 0 : 4;
    }
    case "reconcile": {
      const res = await reconcileSession(client, stateFile, { log, ...(sleep ? { sleep } : {}) });
      out({ command: "reconcile", ...res });
      return res.action === "shutdown" && !res.confirmed ? 4 : 0;
    }
    default:
      out({
        error: "unknown command",
        usage: "status | plan | start | stop | reconcile",
        limits: SPEND_GUARD_LIMITS,
        disclosure: HARD_CEILING_DISCLOSURE,
      });
      return 64;
  }
}

const isCli = process.argv[1] && import.meta.url.endsWith(process.argv[1].replaceAll("\\", "/").split("/").pop());
if (isCli) {
  main().then(
    (code) => {
      process.exitCode = code ?? process.exitCode ?? 0;
    },
    (err) => {
      log(`fatal: ${err.message}`);
      process.exitCode = 1;
    },
  );
}
