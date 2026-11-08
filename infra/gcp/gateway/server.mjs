import {createServer} from "node:http";

const backend = process.env.RENOVISION_BACKEND_URL;
if (!backend || !/^https:\/\/[a-z0-9.-]+\.run\.app\/?$/.test(backend)) throw new Error("RENOVISION_BACKEND_URL must be an explicit Cloud Run HTTPS origin");
const origin = backend.replace(/\/$/, "");
const metadata = "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity?audience=" + encodeURIComponent(origin) + "&format=full";
const maxBytes = 32_000_000;
const allowed = (method, path) => (method === "GET" && (path === "/" || path === "/auth-config" || path === "/health")) ||
  (/^\/api\/renovision\/(projects|approvals)(\/|$)/.test(path) && ["GET","POST","PUT","PATCH","DELETE"].includes(method));
const headers = {
  "cache-control":"no-store",
  "x-content-type-options":"nosniff",
  "referrer-policy":"no-referrer",
  "x-frame-options":"DENY",
  "strict-transport-security":"max-age=31536000"
};
const respond = (res, status, message) => {res.writeHead(status, {...headers,"content-type":"application/json"});res.end(JSON.stringify({ok:false,error:message}));};
export function createGateway({getIdentityToken = async () => {
  const r = await fetch(metadata,{headers:{"Metadata-Flavor":"Google"},signal:AbortSignal.timeout(5000)});
  if (!r.ok) throw new Error("gateway_identity_unavailable");
  return (await r.text()).trim();
}, fetchImpl = fetch} = {}) {
  return createServer(async (req,res) => {
    try {
      const u = new URL(req.url,"http://localhost");
      if (!allowed(req.method,u.pathname) || (u.search && u.pathname !== "/") || req.headers.upgrade) return respond(res,404,"route_not_found");
      if (req.method !== "GET" && req.method !== "HEAD" && !/^application\/json(?:;|$)/i.test(req.headers["content-type"] || "")) return respond(res,415,"json_required");
      const parts=[];let size=0;
      for await (const part of req) {size+=part.length;if(size>maxBytes) return respond(res,413,"payload_too_large");parts.push(part);}
      const token = await getIdentityToken();
      if (!token) throw new Error("gateway_identity_unavailable");
      const outgoing = {"X-Serverless-Authorization":"Bearer "+token};
      if (req.headers.authorization) outgoing.Authorization=req.headers.authorization;
      if (req.headers["content-type"]) outgoing["Content-Type"]=req.headers["content-type"];
      const upstream = await fetchImpl(origin+u.pathname,{method:req.method,headers:outgoing,body:parts.length?Buffer.concat(parts):undefined,redirect:"manual",signal:AbortSignal.timeout(30000)});
      const responseHeaders={...headers};
      const type=upstream.headers.get("content-type");
      if (type) responseHeaders["content-type"]=type;
      if (upstream.status>=300 && upstream.status<400) return respond(res,502,"upstream_redirect_denied");
      res.writeHead(upstream.status,responseHeaders);
      const body=Buffer.from(await upstream.arrayBuffer());
      if(body.length>maxBytes) return res.destroy();
      res.end(body);
    } catch {if(!res.headersSent) respond(res,502,"gateway_upstream_unavailable");else res.destroy();}
  });
}
if (process.argv[1] && import.meta.url === new URL("file://"+process.argv[1].replace(/\\/g,"/")).href) {
  createGateway().listen(Number(process.env.PORT||8080),"0.0.0.0");
}
