/** One-shot in-memory capture session coordinator. Not a UI or persistent service. */
import {requestCameraStream,stopCameraStream} from "./browser-camera.mjs";
import {captureFrameEvidence} from "./frame-evidence.mjs";
import {persistFrameEvidence} from "./evidence-repository.mjs";
export async function captureAndPersistFrame({mediaDevices,consent,video,canvas,cryptoApi,storage,actorId,propertyId,roomId,captureId,retentionDays=30}={}) {
 if(consent!==true) return {ok:false,stage:"consent",errors:["explicit consent required"]};
 if(!video||typeof video!=="object") return {ok:false,stage:"input",errors:["video element required"]};
 const validId=x=>typeof x==="string"&&x.trim().length>0&&!/[\\/]/.test(x);
 if(![actorId,propertyId,roomId,captureId].every(validId)||typeof storage?.put!=="function"||!cryptoApi?.subtle||!canvas||typeof canvas.getContext!=="function") return {ok:false,stage:"input",errors:["capture identity, evidence dependencies or storage invalid"]};
 if(!Number.isInteger(retentionDays)||retentionDays<1||retentionDays>365) return {ok:false,stage:"input",errors:["retention period invalid"]};
 const camera=await requestCameraStream(mediaDevices,true);
 if(!camera.ok) return {ok:false,stage:"camera",errors:[camera.reason]};
 let attached=false;
 try {
   video.srcObject=camera.stream;attached=true;
   if(typeof video.play==="function") await video.play();
   if(!Number.isInteger(video.videoWidth)||video.videoWidth<=0||!Number.isInteger(video.videoHeight)||video.videoHeight<=0) return {ok:false,stage:"frame",errors:["video frame not ready"]};
   const frame=await captureFrameEvidence({video,canvas,cryptoApi,propertyId,roomId,captureId});
   if(!frame.ok) return {ok:false,stage:"frame",errors:frame.errors};
   const receipt=await persistFrameEvidence(frame,{storage,cryptoApi,actorId,retentionDays});
   if(!receipt.stored) return {ok:false,stage:"storage",errors:receipt.errors};
   return {ok:true,stage:"complete",storageRef:receipt.storageRef,digest:receipt.digest,fieldVerified:false};
 } catch {return {ok:false,stage:"capture",errors:["capture session failed"]};}
 finally {
   stopCameraStream(camera.stream);
   if(attached) {try{video.srcObject=null;}catch{/* read-only video surface */}}
 }
}
