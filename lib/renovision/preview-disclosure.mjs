/** Preview labels cannot overstate unverified model output. */
export function describeRenovisionPreview({mode,geometryLocked=false,physicalBenchmarkPassed=false,fieldMeasurementsVerified=false}={}) {
 if(!["renovate","furnish"].includes(mode)) return {valid:false,errors:["supported mode required"]};
 const warnings=[];
 if(!geometryLocked) warnings.push("Geometry may differ from actual property");
 if(!fieldMeasurementsVerified) warnings.push("Dimensions are estimates requiring field verification");
 if(!physicalBenchmarkPassed) warnings.push("Physical accuracy has not been independently benchmarked");
 return {valid:true,title:mode==="renovate"?"Renovation concept preview":"Furniture concept preview",warnings,verified:false,claim:"Concept visualization only — not a construction drawing, measured survey, or code-compliance determination",errors:[]};
}
