import { createAsset3dServer } from "./asset3dServer.mjs";
import { createAsset3dAdapter } from "../lib/renovision/asset3d-adapter.mjs";
import { createTrellisSubprocessProvider } from "../lib/renovision/trellis-provider.mjs";
import { probeAsset3dEnvironment } from "../lib/renovision/environment-probe.mjs";

export function resolveAsset3dServerConfig(env = process.env) {
  const portRaw = env.OCG_3D_PORT || env.PORT || "8788";
  const port = Number(portRaw);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`Invalid OCG_3D_PORT/PORT: ${portRaw}`);
  }
  const host = (env.OCG_3D_HOST || "127.0.0.1").trim() || "127.0.0.1";
  const enabled = env.OCG_3D_ENABLED === "true";
  const founderApproved = env.OCG_3D_FOUNDER_APPROVED === "true";
  return { port, host, enabled, founderApproved };
}

/** Build the production 3D-engine server exactly as the CLI entrypoint does.
 *
 * Phase 9 remediation (UF-Q9-1): the adapter is constructed from the
 * STRUCTURED environment produced by the environment probe
 * (`probeAsset3dEnvironment`) — real machine state with per-field source
 * labels — never from raw `process.env`, whose string values can never
 * satisfy the preflight's structured requirements. Probe failures degrade
 * to honest not-ready blockers (fail-closed); nothing is fabricated.
 *
 * `probeOptions` is forwarded to the probe (tests inject a stubbed probe IO
 * through this path — the construction under test is the entrypoint's own).
 * `authenticate` is an optional passthrough to the server's auth wiring,
 * unused by the CLI path (production auth is the OIDC authenticator). */
export async function buildAsset3dServer({ env = process.env, probeOptions = {}, authenticate = null } = {}) {
  const { enabled, founderApproved } = resolveAsset3dServerConfig(env);
  const probe = await probeAsset3dEnvironment({ env, ...probeOptions });
  const provider = enabled && founderApproved ? createTrellisSubprocessProvider() : null;
  const adapter = createAsset3dAdapter({ enabled, founderApproved, provider, environment: probe.environment });
  const server = createAsset3dServer({ environment: env, adapter, authenticate });
  return { server, adapter, probe };
}

const isCli = process.argv[1] && import.meta.url.endsWith(process.argv[1].replaceAll("\\", "/").split("/").pop());
if (isCli) {
  const { port, host, enabled, founderApproved } = resolveAsset3dServerConfig(process.env);
  const { server, probe } = await buildAsset3dServer({ env: process.env });
  server.listen(port, host, () => {
    console.log(`OCG 3D ENGINE listening on http://${host}:${port} (enabled=${enabled}, founderApproved=${founderApproved})`);
    console.log(`environment probe: ${JSON.stringify({ environment: probe.environment, fieldSources: probe.fieldSources, probeErrors: probe.probeErrors })}`);
  });
}
