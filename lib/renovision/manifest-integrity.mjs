/** Verify every manifest artifact against supplied private evidence bytes. */
import {validateEvidenceManifest} from "./evidence-manifest-validation.mjs";
import {verifyEvidenceBytes,MAX_EVIDENCE_BYTES} from "./frame-evidence.mjs";
export async function verifyManifestArtifacts({manifest,loadArtifact,cryptoApi}={}) {
 const structural=validateEvidenceManifest(manifest);
 if(!structural.valid) return {verified:false,errors:structural.errors,checked:0};
 if(typeof loadArtifact!=="function") return {verified:false,errors:["private artifact loader required"],checked:0};
 const errors=[];let checked=0;
 for(const artifact of manifest.artifacts) {
   let blob;
   try {blob=await loadArtifact({tenantId:manifest.tenantId,propertyId:manifest.propertyId,captureId:manifest.captureId,artifactId:artifact.id});}
   catch {errors.push("artifact unavailable: "+artifact.id);continue;}
   if(!blob||!Number.isSafeInteger(blob.size)||blob.size!==artifact.byteLength||blob.size>MAX_EVIDENCE_BYTES) {
     errors.push("artifact size mismatch: "+artifact.id);continue;
   }
   if(!await verifyEvidenceBytes(blob,artifact.digest,cryptoApi)) {errors.push("artifact integrity mismatch: "+artifact.id);continue;}
   checked++;
 }
 return {verified:errors.length===0&&checked===manifest.artifacts.length,checked,errors,fieldVerified:false};
}
