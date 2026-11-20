import { createAsset3dServer } from "./asset3dServer.mjs";
import { createAsset3dAdapter } from "../lib/renovision/asset3d-adapter.mjs";
import { createTrellisSubprocessProvider } from "../lib/renovision/trellis-provider.mjs";

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

const isCli = process.argv[1] && import.meta.url.endsWith(process.argv[1].replaceAll("\\", "/").split("/").pop());
if (isCli) {
  const { port, host, enabled, founderApproved } = resolveAsset3dServerConfig(process.env);
  const provider = enabled && founderApproved ? createTrellisSubprocessProvider() : null;
  const adapter = createAsset3dAdapter({ enabled, founderApproved, provider, environment: process.env });
  const server = createAsset3dServer({ environment: process.env, adapter });
  server.listen(port, host, () => {
    console.log(`OCG 3D ENGINE listening on http://${host}:${port} (enabled=${enabled}, founderApproved=${founderApproved})`);
  });
}
