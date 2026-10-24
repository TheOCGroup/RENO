/** Validate minimum evidence required before any visual result is described as accurate. */
const text=x=>typeof x==="string"&&x.trim().length>0;
export function assessVisualClaim({mode,sourceEvidenceRef,geometryLocked,measuredDimensions,generatedImageRef,hasIndependentBenchmark=false}={}) {
 const errors=[];
 if(!["renovate","furnish"].includes(mode)) errors.push("supported mode required");
 if(!text(sourceEvidenceRef)||!text(generatedImageRef)) errors.push("source and generated evidence references required");
 if(geometryLocked!==true) errors.push("geometry lock required");
 if(!Array.isArray(measuredDimensions)||measuredDimensions.length<2||measuredDimensions.some(d=>!text(d?.featureId)||typeof d?.meters!=="number"||!Number.isFinite(d.meters)||d.meters<=0||d.fieldVerified!==true)) errors.push("at least two field-verified dimensions required");
 return {eligibleForAccuracyClaim:errors.length===0&&hasIndependentBenchmark===true,previewAllowed:errors.length===0,requiresIndependentBenchmark:hasIndependentBenchmark!==true,errors,certified:false};
}
