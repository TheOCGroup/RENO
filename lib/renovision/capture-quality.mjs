/** Flag unreliable room estimates based on capture conditions; never infer a pass from missing signals. */
const text=x=>typeof x==="string"&&x.trim().length>0;
export function assessCaptureQuality({calibrationStatus,coverageGaps,blurScore,depthCoverageFraction,deviceClass}={}) {
 const errors=[];
 if(!["calibrated","pending","uncalibrated","failed"].includes(calibrationStatus)) errors.push("calibration status required");
 if(!Array.isArray(coverageGaps)) errors.push("coverage gaps array required");
 if(typeof blurScore!=="number"||!Number.isFinite(blurScore)||blurScore<0||blurScore>1) errors.push("blur score 0-1 required");
 if(typeof depthCoverageFraction!=="number"||!Number.isFinite(depthCoverageFraction)||depthCoverageFraction<0||depthCoverageFraction>1) errors.push("depth coverage 0-1 required");
 if(!text(deviceClass)) errors.push("device class required");
 if(errors.length) return {valid:false,quality:"unknown",errors,verified:false};
 const flags=[];
 if(calibrationStatus!=="calibrated") flags.push("calibration incomplete");
 if(coverageGaps.length) flags.push("coverage gaps");
 if(blurScore>0.3) flags.push("blur threshold exceeded");
 if(depthCoverageFraction<0.8) flags.push("depth coverage insufficient");
 return {valid:true,quality:flags.length?"review_required":"candidate_acceptable",flags,verified:false,physicalBenchmarkRequired:true,errors:[]};
}
