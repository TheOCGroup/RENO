/** Shared Google Cloud Storage project records for Cloud Run.
 * Uses generation preconditions to avoid lost updates across instances.
 * The HTTP layer must authenticate and authorize tenant access before calling this store.
 */
import {createHash} from "node:crypto";
const API="https://storage.googleapis.com";
const ID=/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const valid=x=>typeof x==="string"&&x.trim().length>0;
export function createGcsProjectStore({bucket,getAccessToken,fetchImpl,prefix="renovision-projects"}={}) {
 if(!valid(bucket)||typeof getAccessToken!=="function"||typeof fetchImpl!=="function") throw Error("GCS project store configuration required");
 const root=prefix.replace(/^\/+|\/+$/g,"")+"/";
 const tenantRoot=tenantId=>root+createHash("sha256").update(tenantId).digest("hex")+"/";
 const name=(tenantId,projectId)=>tenantRoot(tenantId)+createHash("sha256").update(tenantId+"\n"+projectId).digest("hex")+".json";
 const url=n=>API+"/storage/v1/b/"+encodeURIComponent(bucket)+"/o/"+encodeURIComponent(n);
 const headers=async()=>({authorization:"Bearer "+await getAccessToken()});
 const request=async(u,options={})=>fetchImpl(u,{...options,headers:{...await headers(),...options.headers}});
 const decode=async(r,projectId,tenantId)=>{
   const record=await r.json();
   if(record?.projectId!==projectId||record?.tenantId!==tenantId||record?.data?.projectId!==projectId||record?.data?.tenantId!==tenantId) throw Error("invalid stored project");
   return record.data;
 };
 return {
   async save(projectId,data){
     if(!ID.test(projectId??"")||data?.projectId!==projectId||!valid(data?.tenantId)) throw Error("invalid project record");
     const n=name(data.tenantId,projectId), u=url(n);
     const current=await request(u);
     if(current.status!==404&&!current.ok) throw Error("project metadata read failed");
     let generation="0";
     if(current.ok){const meta=await current.json();if(!/^\d+$/.test(String(meta.generation??""))) throw Error("invalid object generation");generation=String(meta.generation);}
     const body=JSON.stringify({projectId,tenantId:data.tenantId,savedAt:new Date().toISOString(),data});
     const target=API+"/upload/storage/v1/b/"+encodeURIComponent(bucket)+"/o?uploadType=media&name="+encodeURIComponent(n)+"&ifGenerationMatch="+generation;
     const res=await request(target,{method:"POST",headers:{"content-type":"application/json"},body});
     if(res.status===412) throw Error("project write conflict");
     if(!res.ok) throw Error("project write failed");
     return {saved:true,projectId};
   },
   async load(projectId,tenantId){
     if(!ID.test(projectId??"")||!valid(tenantId)) return null;
     const r=await request(url(name(tenantId,projectId))+"?alt=media");
     if(r.status===404) return null;
     if(!r.ok) throw Error("project read failed");
     return decode(r,projectId,tenantId);
   },
   async list(tenantId){
     if(!valid(tenantId)) throw Error("tenant required");
     const ids=[],seen=new Set();let pageToken;
     do{
       const query=new URLSearchParams({prefix:tenantRoot(tenantId),fields:"nextPageToken,items(name)"});
       if(pageToken) query.set("pageToken",pageToken);
       const r=await request(API+"/storage/v1/b/"+encodeURIComponent(bucket)+"/o?"+query);
       if(!r.ok) throw Error("project listing failed");
       const page=await r.json();
       for(const item of page.items??[]){
         if(!item.name?.startsWith(tenantRoot(tenantId))||!item.name.endsWith(".json")) continue;
         const obj=await request(url(item.name)+"?alt=media");
         if(!obj.ok) throw Error("project list read failed");
         const record=await obj.json();
         if(record?.tenantId===tenantId&&ID.test(record.projectId??"")&&record.data?.tenantId===tenantId&&record.data?.projectId===record.projectId&&!seen.has(record.projectId)){seen.add(record.projectId);ids.push(record.projectId);}
       }
       pageToken=page.nextPageToken;
     }while(pageToken);
     return ids.sort();
   },
   get storageClass(){return "durable-gcs";}
 };
}
