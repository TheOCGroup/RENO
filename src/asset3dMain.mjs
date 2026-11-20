import { createAsset3dServer } from "./asset3dServer.mjs";
import { createTrellisSubprocessProvider } from "../lib/renovision/trellis-provider.mjs";

const port = Number(process.env.OCG_3D_PORT || 8788);
const host = "127.0.0.1";

const enabled = process.env.OCG_3D_ENABLED === "true";
const founderApproved = process.env.OCG_3D_FOUNDER_APPROVED === "true";
const provider = enabled && founderApproved ? createTrellisSubprocessProvider() : null;

const server = createAsset3dServer({ enabled, founderApproved, provider });
server.listen(port, host, () => {
  console.log(`OCG 3D ENGINE listening on http://${host}:${port} (enabled=${enabled}, founderApproved=${founderApproved})`);
});
