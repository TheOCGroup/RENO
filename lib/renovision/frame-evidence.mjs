/** Camera frame evidence: dependency-injected canvas and SHA-256, no upload or persistent storage. */
export const MAX_FRAME_PIXELS=16_000_000;
export const MAX_EVIDENCE_BYTES=20_000_000;
export async function captureFrameEvidence({video,canvas,cryptoApi,now=()=>new Date().toISOString(),captureId,propertyId,roomId}) {
  const errors=[];
  if (!video || !Number.isInteger(video.videoWidth) || video.videoWidth<=0 || !Number.isInteger(video.videoHeight) || video.videoHeight<=0) errors.push("video frame unavailable");
  if (video && Number.isInteger(video.videoWidth) && Number.isInteger(video.videoHeight) && video.videoWidth>0 && video.videoHeight>0 && video.videoWidth*video.videoHeight>MAX_FRAME_PIXELS) errors.push("frame pixel limit exceeded");
  if (!canvas || typeof canvas.getContext!=="function" || typeof canvas.toBlob!=="function") errors.push("canvas unavailable");
  if (!cryptoApi?.subtle || typeof cryptoApi.subtle.digest!=="function") errors.push("SHA-256 API unavailable");
  for (const [key,value] of Object.entries({captureId,propertyId,roomId})) if (typeof value!=="string" || !value.trim()) errors.push(key+" required");
  if (errors.length) return {ok:false,errors};
  canvas.width=video.videoWidth;canvas.height=video.videoHeight;
  const context=canvas.getContext("2d");
  if (!context || typeof context.drawImage!=="function") return {ok:false,errors:["2D drawing context unavailable"]};
  try {
    context.drawImage(video,0,0,canvas.width,canvas.height);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/png"));
    if (!blob || typeof blob.arrayBuffer!=="function" || blob.size<=0 || blob.size>MAX_EVIDENCE_BYTES) return {ok:false,errors:["frame encoding failed"]};
    const digestBytes=new Uint8Array(await cryptoApi.subtle.digest("SHA-256",await blob.arrayBuffer()));
    const digest="sha256:"+Array.from(digestBytes,b=>b.toString(16).padStart(2,"0")).join("");
    if (!/^sha256:[a-f0-9]{64}$/.test(digest)) return {ok:false,errors:["digest generation failed"]};
    return {ok:true,blob,artifact:{kind:"photo",digest,mimeType:"image/png",byteLength:blob.size,width:canvas.width,height:canvas.height,capturedAt:now(),captureId,propertyId,roomId},storageStatus:"not_persisted",verified:false};
  } catch {
    return {ok:false,errors:["frame capture failed"]};
  }
}
export async function verifyEvidenceBytes(blob,expectedDigest,cryptoApi) {
  if (!blob || typeof blob.arrayBuffer!=="function" || !Number.isSafeInteger(blob.size) || blob.size<=0 || blob.size>MAX_EVIDENCE_BYTES || !cryptoApi?.subtle?.digest || !/^sha256:[a-fA-F0-9]{64}$/.test(expectedDigest??"")) return false;
  try {
    const bytes=new Uint8Array(await cryptoApi.subtle.digest("SHA-256",await blob.arrayBuffer()));
    return "sha256:"+Array.from(bytes,b=>b.toString(16).padStart(2,"0")).join("")===expectedDigest.toLowerCase();
  } catch {return false;}
}
