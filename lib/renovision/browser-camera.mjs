/** Browser capability probe: reports only observed APIs, never physical sensor accuracy. */
export async function probeBrowserCapture({mediaDevices,permissions,platformHint="web"}={}) {
  const cameraApiAvailable=typeof mediaDevices?.getUserMedia==="function";
  let cameraPermission="unknown";
  if (typeof permissions?.query==="function") {
    try {
      const status=await permissions.query({name:"camera"});
      if (["granted","denied","prompt"].includes(status?.state)) cameraPermission=status.state;
    } catch { cameraPermission="unknown"; }
  }
  return {
    platformHint,
    cameraApiAvailable,
    cameraPermission,
    roomPlanSupported:false,
    depthSupported:false,
    sensorAccuracyVerified:false,
    notes:["Browser API presence is not proof of LiDAR, RoomPlan, ARCore depth, or calibration","Do not request camera access during capability probing"]
  };
}
export async function requestCameraStream(mediaDevices,consent) {
  if (consent !== true) return {ok:false,reason:"explicit consent required"};
  if (typeof mediaDevices?.getUserMedia!=="function") return {ok:false,reason:"camera API unavailable"};
  try {
    const stream=await mediaDevices.getUserMedia({video:{facingMode:{ideal:"environment"}},audio:false});
    return {ok:true,stream};
  } catch(e) {
    return {ok:false,reason:["NotAllowedError","NotFoundError","NotReadableError","OverconstrainedError"].includes(e?.name)?e.name:"camera request failed"};
  }
}
export function stopCameraStream(stream) {
  if (!stream || typeof stream.getTracks!=="function") return false;
  for (const track of stream.getTracks()) if (typeof track.stop==="function") track.stop();
  return true;
}
