/** Validate capture manifest fields before private persistence. */
const isText=x=>typeof x==="string"&&x.trim().length>0;
export const MAX_MANIFEST_ARTIFACTS=32;
export const MAX_MANIFEST_TOTAL_BYTES=100_000_000;
const iso=x=>isText(x)&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(x)&&Number.isFinite(Date.parse(x));
export function validateEvidenceManifest(manifest) {
 const errors=[];
 if(!manifest||typeof manifest!=="object"||Array.isArray(manifest)) return {valid:false,errors:["manifest object required"]};
 for(const key of ["tenantId","propertyId","roomId","captureId","operatorId","deviceModel","coordinateFrame"]) if(!isText(manifest[key])) errors.push(key+" required");
 if(!iso(manifest.capturedAt)) errors.push("valid timestamp required");
 if(!["ios","android","web","manual"].includes(manifest.platform)) errors.push("platform invalid");
 if(!["uncalibrated","pending","calibrated","failed"].includes(manifest.calibrationStatus)) errors.push("calibration status invalid");
 if(!Array.isArray(manifest.coverageGaps)) errors.push("coverageGaps array required");
 if(!Array.isArray(manifest.artifacts)||manifest.artifacts.length===0) errors.push("nonempty artifacts required");
 else {
   if(manifest.artifacts.length>MAX_MANIFEST_ARTIFACTS) errors.push("too many artifacts");
   let totalBytes=0;
   const seen=new Set();
   for(const artifact of manifest.artifacts) {
     if(!isText(artifact?.id)||seen.has(artifact.id)) errors.push("missing or duplicate artifact id");
     else seen.add(artifact.id);
     if(!["photo","video","depth","floorplan","measurement"].includes(artifact?.kind)) errors.push("artifact kind invalid");
     if(typeof artifact?.digest!=="string"||!/^sha256:[a-fA-F0-9]{64}$/.test(artifact.digest)) errors.push("artifact digest invalid");
     if(!Number.isSafeInteger(artifact?.byteLength)||artifact.byteLength<=0||artifact.byteLength>20_000_000) errors.push("artifact byte length invalid");
     else totalBytes+=artifact.byteLength;
   }
   if(totalBytes>MAX_MANIFEST_TOTAL_BYTES) errors.push("manifest byte budget exceeded");
 }
 return {valid:errors.length===0,errors,fieldVerified:false};
}
