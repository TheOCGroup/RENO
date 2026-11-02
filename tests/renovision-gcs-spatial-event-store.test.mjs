import test from "node:test";
import assert from "node:assert/strict";
import {createGcsSpatialEventStore} from "../lib/renovision/gcs-spatial-event-store.mjs";
const scope={tenantId:"tenant-a",propertyId:"property-1",roomId:"room-1",featureId:"wall-1",actor:{id:"founder"}};
const event={propertyId:"property-1",roomId:"room-1",featureId:"wall-1",type:"measurement"};
function harness(){
 const objects=new Map();
 const fetchImpl=async(url,options={})=>{
   const u=new URL(url);
   const n=u.searchParams.get("name")??decodeURIComponent(u.pathname.split("/o/")[1]??"");
   const current=objects.get(n);
   if(u.pathname.includes("/upload/")){
     if(String(current?.generation??0)!==u.searchParams.get("ifGenerationMatch"))return {ok:false,status:412};
     objects.set(n,{generation:(current?.generation??0)+1,data:JSON.parse(options.body)});
     return {ok:true,status:200};
   }
   if(!current)return {ok:false,status:404};
   if(u.searchParams.get("alt")==="media"){
     if(u.searchParams.get("ifGenerationMatch")!==String(current.generation))return {ok:false,status:412};
     return {ok:true,status:200,json:async()=>current.data};
   }
   return {ok:true,status:200,json:async()=>({generation:String(current.generation)})};
 };
 const create=(authorize=async()=>true)=>createGcsSpatialEventStore({bucket:"bucket",getAccessToken:async()=>"token",fetchImpl,authorize});
 return {objects,create};
}
test("append, read, and reject stale revisions",async()=>{
 const {create}=harness(),store=create();
 assert.deepEqual(await store.readFeatureEvents(scope),{revision:0,events:[]});
 assert.deepEqual(await store.compareAndAppend({...scope,expectedRevision:0,event}),{committed:true,revision:1});
 assert.deepEqual(await store.readFeatureEvents(scope),{revision:1,events:[event]});
 assert.deepEqual(await store.compareAndAppend({...scope,expectedRevision:0,event}),{committed:false});
});
test("rejects cross-scope event and unauthorized access",async()=>{
 const {create}=harness(),store=create();
 assert.deepEqual(await store.compareAndAppend({...scope,expectedRevision:0,event:{...event,roomId:"other"}}),{committed:false});
 const denied=create(async()=>false);
 await assert.rejects(()=>denied.readFeatureEvents(scope),/access denied/);
 await assert.rejects(()=>denied.compareAndAppend({...scope,expectedRevision:0,event}),/access denied/);
});
test("GCS generation conflict fails closed",async()=>{
 const {create,objects}=harness();
 const store=create();
 await store.compareAndAppend({...scope,expectedRevision:0,event});
 const [key,item]=[...objects.entries()][0];
 // Revision is unchanged but generation changed externally; simulated stale write fails.
 objects.set(key,{...item,generation:item.generation+1});
 assert.deepEqual(await store.compareAndAppend({...scope,expectedRevision:0,event}),{committed:false});
});

test("two concurrent writers across store instances yield exactly one commit",async()=>{
 const {create}=harness();
 const a=create(),b=create();
 const results=await Promise.all([
  a.compareAndAppend({...scope,expectedRevision:0,event}),
  b.compareAndAppend({...scope,expectedRevision:0,event})
 ]);
 assert.equal(results.filter(r=>r.committed).length,1);
 assert.equal(results.filter(r=>!r.committed).length,1);
 assert.deepEqual(await a.readFeatureEvents(scope),{revision:1,events:[event]});
});

test("simultaneous GCS writers using the same observed generation cannot both commit",async()=>{
 const objects=new Map();
 let uploads=0;
 let release;
 const bothReady=new Promise(resolve=>{release=resolve;});
 const fetchImpl=async(url,options={})=>{
  const u=new URL(url);
  const n=u.searchParams.get("name")??decodeURIComponent(u.pathname.split("/o/")[1]??"");
  if(u.pathname.includes("/upload/")){
   uploads++;
   if(uploads===2)release();
   await bothReady;
   const current=objects.get(n);
   if(u.searchParams.get("ifGenerationMatch")!==String(current?.generation??0))return {ok:false,status:412};
   objects.set(n,{generation:(current?.generation??0)+1,data:JSON.parse(options.body)});
   return {ok:true,status:200};
  }
  const current=objects.get(n);
  if(!current)return {ok:false,status:404};
  if(u.searchParams.get("alt")==="media")return {ok:true,status:200,json:async()=>current.data};
  return {ok:true,status:200,json:async()=>({generation:String(current.generation)})};
 };
 const create=()=>createGcsSpatialEventStore({bucket:"bucket",getAccessToken:async()=>"token",fetchImpl,authorize:async()=>true});
 const [a,b]=[create(),create()];
 const results=await Promise.all([
  a.compareAndAppend({...scope,expectedRevision:0,event}),
  b.compareAndAppend({...scope,expectedRevision:0,event})
 ]);
 assert.equal(uploads,2);
 assert.equal(results.filter(x=>x.committed).length,1);
 assert.equal(results.filter(x=>!x.committed).length,1);
 assert.deepEqual(await a.readFeatureEvents(scope),{revision:1,events:[event]});
});
