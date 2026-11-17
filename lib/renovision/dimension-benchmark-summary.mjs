/** Track reference-to-candidate dimension error without falsely certifying a benchmark. */
const valid=x=>typeof x==="number"&&Number.isFinite(x)&&x>0;
export function summarizeDimensionBenchmark(samples,{absoluteToleranceMeters=0.05,relativeTolerance=0.02}={}) {
 if(!Array.isArray(samples)||!samples.length||!Number.isFinite(absoluteToleranceMeters)||absoluteToleranceMeters<0||!Number.isFinite(relativeTolerance)||relativeTolerance<0) return {valid:false,errors:["samples and tolerances invalid"]};
 const errors=[],rows=[];
 for(const s of samples) {
   if(typeof s?.featureId!=="string"||!s.featureId.trim()||!valid(s.referenceMeters)||!valid(s.candidateMeters)) {errors.push("invalid sample");continue;}
   const absoluteErrorMeters=Math.abs(s.candidateMeters-s.referenceMeters);
   const relativeError=absoluteErrorMeters/s.referenceMeters;
   rows.push({featureId:s.featureId,absoluteErrorMeters,relativeError,withinTolerance:absoluteErrorMeters<=absoluteToleranceMeters&&relativeError<=relativeTolerance});
 }
 if(errors.length)return {valid:false,errors};
 const maeMeters=rows.reduce((n,x)=>n+x.absoluteErrorMeters,0)/rows.length;
 const maxAbsoluteErrorMeters=Math.max(...rows.map(x=>x.absoluteErrorMeters));
 return {valid:true,rows,maeMeters,maxAbsoluteErrorMeters,pass:rows.every(x=>x.withinTolerance),independentlyCertified:false,errors:[]};
}
