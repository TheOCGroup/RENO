/** Capture benchmark report. Reference dimensions must be independently measured. */
import {compareMeasurements,normalizeLength} from "./measurement-math.mjs";
export function evaluateRoomBenchmark({roomId,referenceMeasurements,candidateMeasurements,toleranceMeters=0.05}={}) {
 const errors=[];
 if(typeof roomId!=="string"||!roomId.trim()) errors.push("roomId required");
 if(!Array.isArray(referenceMeasurements)||!Array.isArray(candidateMeasurements)||referenceMeasurements.length===0) errors.push("nonempty reference and candidate arrays required");
 if(typeof toleranceMeters!=="number"||!Number.isFinite(toleranceMeters)||toleranceMeters<=0) errors.push("positive finite tolerance required");
 if(errors.length) return {valid:false,errors};
 const candidates=new Map();
 for(const c of candidateMeasurements) {
   if(typeof c?.featureId!=="string"||!c.featureId.trim()||candidates.has(c.featureId)) errors.push("invalid or duplicate candidate feature");
   else candidates.set(c.featureId,c);
 }
 const seen=new Set(),results=[];
 for(const ref of referenceMeasurements) {
   if(typeof ref?.featureId!=="string"||!ref.featureId.trim()||seen.has(ref.featureId)) {errors.push("invalid or duplicate reference feature");continue;}
   seen.add(ref.featureId);
   if(ref.independentlyMeasured!==true) {errors.push("independent reference evidence required: "+ref.featureId);continue;}
   const candidate=candidates.get(ref.featureId);
   if(!candidate) {errors.push("missing candidate: "+ref.featureId);continue;}
   const a=normalizeLength(ref),b=normalizeLength(candidate);
   if(!a.valid||!b.valid) {errors.push("invalid dimension: "+ref.featureId);continue;}
   const differenceMeters=Math.abs(a.meters-b.meters);
   results.push({featureId:ref.featureId,differenceMeters,withinTolerance:differenceMeters<=toleranceMeters,reportedUncertainty:compareMeasurements(ref,candidate).withinReportedUncertainty});
 }
 if(candidates.size!==seen.size) errors.push("candidate/reference feature mismatch");
 if(errors.length) return {valid:false,errors,results};
 const maxErrorMeters=Math.max(...results.map(r=>r.differenceMeters));
 const meanErrorMeters=results.reduce((s,r)=>s+r.differenceMeters,0)/results.length;
 return {valid:true,roomId,referenceCount:results.length,maxErrorMeters,meanErrorMeters,withinTolerance:results.every(r=>r.withinTolerance),fieldCertified:false,results,errors:[]};
}
