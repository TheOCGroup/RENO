import test from "node:test";
import assert from "node:assert/strict";
import {once} from "node:events";
process.env.RENOVISION_BACKEND_URL ||= "https://renovision-rsazfnmlja-uc.a.run.app";
const {createGateway} = await import("../src/renovisionGateway.mjs");
const backend = process.env.RENOVISION_BACKEND_URL || "https://renovision-rsazfnmlja-uc.a.run.app";
async function serve(t, fake) {
 const server=createGateway({getIdentityToken:async()=>"gateway-iam-token",fetchImpl:fake});
 server.listen(0,"127.0.0.1");await once(server,"listening");
 t.after(()=>server.close());
 return "http://127.0.0.1:"+server.address().port;
}
test("gateway retains user authorization separately from Cloud Run IAM invocation",async t=>{
 let seen;
 const base=await serve(t,async(url,init)=>{seen={url,init};return new Response(JSON.stringify({ok:true}),{status:200,headers:{"content-type":"application/json"}})});
 const r=await fetch(base+"/api/renovision/projects",{headers:{Authorization:"Bearer user-id-token"}});
 assert.equal(r.status,200);
 assert.equal(seen.init.headers.Authorization,"Bearer user-id-token");
 assert.equal(seen.init.headers["X-Serverless-Authorization"],"Bearer gateway-iam-token");
 assert.equal(seen.url,backend+"/api/renovision/projects");
 assert.equal(seen.init.headers["x-tenant-id"],undefined);
});
test("gateway rejects unexpected paths, query parameters, and unsupported content types",async t=>{
 let calls=0;
 const base=await serve(t,async()=>{calls++;return new Response("ok")});
 assert.equal((await fetch(base+"/other")).status,404);
 assert.equal((await fetch(base+"/api/renovision/projects?redirect=https://example.com")).status,404);
 assert.equal((await fetch(base+"/api/renovision/projects",{method:"POST",headers:{"content-type":"text/plain"},body:"x"})).status,415);
 assert.equal(calls,0);
});
test("gateway fails closed when IAM token acquisition fails",async t=>{
 const server=createGateway({getIdentityToken:async()=>{throw Error("no identity")},fetchImpl:async()=>{throw Error("should not forward")}});
 server.listen(0,"127.0.0.1");await once(server,"listening");t.after(()=>server.close());
 const r=await fetch("http://127.0.0.1:"+server.address().port+"/auth-config");
 assert.equal(r.status,502);
 assert.equal((await r.json()).error,"gateway_upstream_unavailable");
});
