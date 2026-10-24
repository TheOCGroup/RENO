/** No public accuracy claim without trusted attestation and explicit non-revoked evidence. */
import {verifyBenchmarkAttestation} from "./benchmark-attestation.mjs";
export async function authorizeAccuracyClaim({attestation,previewEvidenceRef,sourceEvidenceRef,geometryLocked=false,dimensionsFieldVerified=false}={}) {
 if(typeof previewEvidenceRef!=="string"||!previewEvidenceRef.trim()||typeof sourceEvidenceRef!=="string"||!sourceEvidenceRef.trim()||geometryLocked!==true||dimensionsFieldVerified!==true)
  return {authorized:false,errors:["verified preview inputs required"]};
 const result=await verifyBenchmarkAttestation(attestation);
 if(!result.verified) return {authorized:false,errors:result.errors};
 return {authorized:false,errors:["production trust anchor and independent evidence validation not connected"],attestationEvidenceRef:result.evidenceRef};
}
