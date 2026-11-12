/** Cross-instance GCS spatial event store with generation-conditional append.
 * Authorization is required for every read/write. No infrastructure provisioned.
 */
import {createHash} from "node:crypto";
const API="https://storage.googleapis.com";
const text=x=>typeof x==="string"&&x.trim().length>0;
export function createGcsSpatialEventStore({bucket,getAccessToken,fetchImpl,authorize,prefix="renovision-events"}={}){
 if(!text(bucket)||typeof getAccessToken!=="function"||typeof fetchImpl!=="function"||typeof authorize!=="function") throw Error("GCS spatial event store configuration required");
 const root=prefix.replace(/^\/+|\/+$/g,"")+"/";
 const name=s=>root+createHash("sha256").update(JSON.stringify([s.tenantId,s.propertyId,s.roomId,s.featureId])).digest("hex")+".json";
 const url=n=>API+"/storage/v1/b/"+encodeURIComponent(bucket)+"/o/"+encodeURIComponent(n);
 const request=async(u,opts={})=>fetchImpl(u,{...opts,headers:{authorization:"Bearer "+await getAccessToken(),...opts.headers}});
 const validScope=s=>s&&[s.tenantId,s.propertyId,s.roomId,s.featureId].every(text);
 const load=async s=>{
   const u=url(name(s));
   const meta=await request(u);
   if(meta.status===404)return {generation:"0",revision:0,events:[]};
   if(!meta.ok)throw Error("spatial metadata read failed");
   const m=await meta.json();
   if(!/^\d+$/.test(String(m.generation??"")))throw Error("invalid event generation");
   const data=await request(u+"?alt=media&ifGenerationMatch="+m.generation);
   if(data.status===412||data.status===404)throw Error("spatial read conflict");
   if(!data.ok)throw Error("spatial read failed");
   const record=await data.json();
   if(!Number.isSafeInteger(record?.revision)||record.revision<0||!Array.isArray(record.events)||record.revision!==record.events.length)throw Error("corrupt event record");
   return {...record,generation:String(m.generation)};
 };
 return {
  async readFeatureEvents(scope){
    if(!validScope(scope)||!await authorize({...scope,action:"read"}))throw Error("access denied");
    const r=await load(scope);
    return {revision:r.revision,events:structuredClone(r.events)};
  },
  async compareAndAppend(scope){
    if(!validScope(scope)||!await authorize({...scope,action:"write"}))throw Error("access denied");
    if(!Number.isSafeInteger(scope.expectedRevision)||scope.expectedRevision<0) return {committed:false};
    if(scope.event?.propertyId!==scope.propertyId||scope.event?.roomId!==scope.roomId||scope.event?.featureId!==scope.featureId)return {committed:false};
    const current=await load(scope);
    if(current.revision!==scope.expectedRevision)return {committed:false};
    const next={revision:current.revision+1,events:[...current.events,structuredClone(scope.event)]};
    const u=API+"/upload/storage/v1/b/"+encodeURIComponent(bucket)+"/o?uploadType=media&name="+encodeURIComponent(name(scope))+"&ifGenerationMatch="+current.generation;
    const res=await request(u,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(next)});
    if(res.status===412)return {committed:false};
    if(!res.ok)throw Error("spatial write failed");
    return {committed:true,revision:next.revision};
  },
  get storageClass(){return "durable-gcs";}
 };
}
