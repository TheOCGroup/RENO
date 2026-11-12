/** Generate bounded, non-sensitive device capture QA scenario descriptors. */
const platforms=["ios-lidar","android-depth","browser-camera","photo-only","manual"];
const conditions=["normal-light","low-light","reflective-surface","occluded-corner","permission-denied","camera-interrupted"];
export function buildCaptureQaMatrix({maxCases=30}={}) {
 if(!Number.isSafeInteger(maxCases)||maxCases<1||maxCases>30) return {valid:false,cases:[],errors:["maxCases must be 1-30"]};
 const cases=[];
 for(const platform of platforms) for(const condition of conditions) {
   if(cases.length===maxCases) break;
   cases.push({id:platform+"--"+condition,platform,condition,requiresRealDevice:true,executed:false,passed:null,fieldVerified:false});
 }
 return {valid:true,cases,errors:[],realDeviceRuns:0};
}
