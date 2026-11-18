import {createAsset3dServer} from "./asset3dServer.mjs";

const port = Number(process.env.OCG_3D_PORT || 8788);
const host = "127.0.0.1";

const server = createAsset3dServer();
server.listen(port, host, () => {
  console.log(`OCG 3D ENGINE listening on http://${host}:${port} (local-only, $0 budget)`);
});
