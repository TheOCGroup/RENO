/** Google Vertex AI image-editing adapter. No network or spend unless explicitly enabled. */
const supported = new Set(["image/jpeg","image/png","image/webp"]);
export function createVertexPhotoRenderer({enabled=false, approved=false, projectId, model="gemini-2.5-flash-image", location="global", getAccessToken, fetchImpl=fetch}={}){
 const configured=Boolean(projectId && typeof getAccessToken==="function");
 const active=enabled===true && approved===true && configured;
 return {
  status(){return {enabled:active, configured, founderApproved:approved===true, model:active?model:null};},
  async render({mimeType,imageBase64,prompt}={}){
   if(!active)return {ok:false,errors:["photo_rendering_not_enabled"]};
   if(!supported.has(mimeType)||typeof imageBase64!=="string"||imageBase64.length>14_000_000||!/^[A-Za-z0-9+/]+={0,2}$/.test(imageBase64))return {ok:false,errors:["invalid_source_image"]};
   if(typeof prompt!=="string"||prompt.trim().length<8||prompt.length>2000)return {ok:false,errors:["invalid_design_prompt"]};
   const endpoint=`https://aiplatform.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/locations/${encodeURIComponent(location)}/publishers/google/models/${encodeURIComponent(model)}:generateContent`;
   try{
    const token=await getAccessToken();
    const res=await fetchImpl(endpoint,{method:"POST",headers:{authorization:"Bearer "+token,"content-type":"application/json"},body:JSON.stringify({contents:[{role:"user",parts:[{text:"Edit this exact room photograph into a photorealistic RENOVATION CONCEPT. Preserve camera angle, architecture, room geometry, doors and windows. Do not invent structural changes or claim measured accuracy. Requested design: "+prompt.trim()},{inlineData:{mimeType,data:imageBase64}}]}],generationConfig:{responseModalities:["TEXT","IMAGE"]}}),signal:AbortSignal.timeout(90000)});
    if(!res.ok)return {ok:false,errors:["vertex_generation_failed"],httpStatus:res.status};
    const payload=await res.json();
    const part=payload.candidates?.flatMap(c=>c.content?.parts??[]).find(p=>p.inlineData?.data&&supported.has(p.inlineData.mimeType));
    if(!part)return {ok:false,errors:["vertex_returned_no_image"]};
    return {ok:true,imageBase64:part.inlineData.data,mimeType:part.inlineData.mimeType,status:"concept",verified:false,disclosure:"AI-generated design concept only. Not a measured survey, construction drawing, or guarantee of feasibility."};
   }catch{return {ok:false,errors:["vertex_generation_unavailable"]};}
  }
 };
}
