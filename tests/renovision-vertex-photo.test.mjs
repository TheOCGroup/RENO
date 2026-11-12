import test from "node:test";
import assert from "node:assert/strict";
import {createVertexPhotoRenderer} from "../lib/renovision/vertex-photo-renderer.mjs";
const sample={mimeType:"image/png",imageBase64:Buffer.from("sample image").toString("base64"),prompt:"Make the kitchen modern with oak cabinets"};
test("provider fails closed with no explicit approval or flag",async()=>{
 for(const flags of [{},{enabled:true},{approved:true}]){
  let called=false;
  const p=createVertexPhotoRenderer({...flags,projectId:"example",getAccessToken:async()=>"token",fetchImpl:async()=>{called=true;}});
  assert.equal((await p.render(sample)).ok,false);
  assert.equal(called,false);
 }
});
test("provider rejects invalid images and prompts without network",async()=>{
 let called=false;
 const p=createVertexPhotoRenderer({enabled:true,approved:true,projectId:"example",getAccessToken:async()=>"token",fetchImpl:async()=>{called=true;}});
 assert.equal((await p.render({...sample,mimeType:"text/html"})).ok,false);
 assert.equal((await p.render({...sample,prompt:"x"})).ok,false);
 assert.equal(called,false);
});
test("provider sends source photo and prompt to Vertex and returns unverified concept",async()=>{
 const p=createVertexPhotoRenderer({enabled:true,approved:true,projectId:"example",getAccessToken:async()=>"token",fetchImpl:async(url,opts)=>{
  assert.match(url,/gemini-2.5-flash-image:generateContent$/);
  assert.equal(JSON.parse(opts.body).contents[0].parts[1].inlineData.data,sample.imageBase64);
  return {ok:true,json:async()=>({candidates:[{content:{parts:[{inlineData:{mimeType:"image/png",data:"aW1hZ2U="}}]}}]})};
 }});
 const result=await p.render(sample);
 assert.equal(result.ok,true);assert.equal(result.verified,false);assert.equal(result.mimeType,"image/png");
});
