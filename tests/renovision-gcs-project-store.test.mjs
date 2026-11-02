import test from "node:test";
import assert from "node:assert/strict";
import {createGcsProjectStore} from "../lib/renovision/gcs-project-store.mjs";
const record={projectId:"p1",tenantId:"tenant-a",rooms:[]};
function harness(){
 const objects=new Map();
 const calls=[];
 const fetchImpl=async(url,options={})=>{
  calls.push({url,method:options.method??"GET"});
  const u=new URL(url), name=u.searchParams.get("name")??decodeURIComponent(u.pathname.split("/o/")[1]??"");
  if(u.pathname.includes("/upload/")){
   const existing=objects.get(name),expected=u.searchParams.get("ifGenerationMatch");
   if(expected!==String(existing?.generation??0)) return {ok:false,status:412};
   const generation=(existing?.generation??0)+1;
   objects.set(name,{generation,record:JSON.parse(options.body)});
   return {ok:true,status:200};
  }
  if(u.pathname.endsWith("/o")){
   const prefix=u.searchParams.get("prefix")??"";
   return {ok:true,json:async()=>({items:[...objects.keys()].filter(name=>name.startsWith(prefix)).map(name=>({name}))})};
  }
  const item=objects.get(name);
  if(!item)return {ok:false,status:404};
  if(u.searchParams.get("alt")==="media")return {ok:true,json:async()=>item.record};
  return {ok:true,json:async()=>({generation:String(item.generation)})};
 };
 return {objects,calls,store:createGcsProjectStore({bucket:"test-bucket",getAccessToken:async()=>"test",fetchImpl})};
}
test("project save/load/list scoped to tenant",async()=>{
 const {store}=harness();
 assert.deepEqual(await store.save("p1",record),{saved:true,projectId:"p1"});
 assert.deepEqual(await store.load("p1","tenant-a"),record);
 assert.equal(await store.load("p1","tenant-b"),null);
 assert.deepEqual(await store.list("tenant-a"),["p1"]);
 assert.deepEqual(await store.list("tenant-b"),[]);
});
test("project updates use generation match",async()=>{
 const {store,calls}=harness();
 await store.save("p1",record);
 await store.save("p1",{...record,rooms:["room-1"]});
 assert.ok(calls.some(x=>x.url.includes("ifGenerationMatch=0")));
 assert.ok(calls.some(x=>x.url.includes("ifGenerationMatch=1")));
});
test("rejects malformed and cross-tenant records",async()=>{
 const {store}=harness();
 await assert.rejects(()=>store.save("../bad",record),/invalid/);
 await assert.rejects(()=>store.save("p1",{...record,projectId:"p2"}),/invalid/);
});
test("rejects stale concurrent generation writes",async()=>{
 const {store,objects}=harness();
 await store.save("p1",record);
 const [name,item]=[...objects.entries()][0];
 // Simulate a competing writer changing the generation after metadata GET.
 const competingFetch=async(url,options={})=>{
   const u=new URL(url);
   if(u.pathname.includes("/upload/")) return {ok:false,status:412};
   if(u.searchParams.get("alt")==="media") return {ok:true,json:async()=>item.record};
   return {ok:true,status:200,json:async()=>({generation:String(item.generation)})};
 };
 const racing=createGcsProjectStore({bucket:"test-bucket",getAccessToken:async()=>"test",fetchImpl:competingFetch});
 await assert.rejects(()=>racing.save("p1",{...record,rooms:["conflict"]}),/conflict/);
 assert.deepEqual(await store.load("p1","tenant-a"),record);
});

test("list uses tenant-specific object prefix, not bucket-wide enumeration",async()=>{
 const {store,calls}=harness();
 await store.save("p1",record);
 await store.save("p2",{projectId:"p2",tenantId:"tenant-b"});
 assert.deepEqual(await store.list("tenant-a"),["p1"]);
 const listCalls=calls.filter(c=>new URL(c.url).pathname.endsWith("/o"));
 assert.equal(listCalls.length,1);
 const prefix=new URL(listCalls[0].url).searchParams.get("prefix");
 assert.equal(prefix.startsWith("renovision-projects/"),true);
 assert.equal(prefix.endsWith("/"),true);
 assert.equal(prefix.split("/")[1].length,64);
 assert.ok(!prefix.includes("tenant-a"));
 assert.deepEqual(await store.list("tenant-b"),["p2"]);
});
