/** Build a manifest from an already persisted capture; do not claim calibration or field measurement. */
import {validateEvidenceManifest} from "./evidence-manifest-validation.mjs";
export function createPersistedCaptureManifest({capture,receipt,tenantId,operatorId,deviceModel,coordinateFrame="local",platform="web",calibrationStatus="pending",coverageGaps=[]}={}) {
 if(capture?.ok!==true||receipt?.stored!==true||typeof receipt.storageRef!=="string"||!receipt.storageRef.trim()||receipt.digest!==capture.artifact?.digest||receipt.storageRef.length>128||!Number.isSafeInteger(capture.artifact?.byteLength)||capture.artifact.byteLength!==capture.blob?.size)
  return {ok:false,errors:["matching persisted capture and receipt required"]};
 const a=capture.artifact;
 const manifest={tenantId,propertyId:a.propertyId,roomId:a.roomId,captureId:a.captureId,operatorId,deviceModel,coordinateFrame,capturedAt:a.capturedAt,platform,calibrationStatus,coverageGaps,artifacts:[{id:receipt.storageRef,kind:a.kind,digest:a.digest,byteLength:a.byteLength}]};
 const check=validateEvidenceManifest(manifest);
 return check.valid?{ok:true,manifest,fieldVerified:false,errors:[]}:{ok:false,errors:check.errors};
}
