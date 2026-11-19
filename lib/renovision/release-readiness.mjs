/** Fail-closed release readiness report. Only trusted independent evidence may satisfy gates. */
const required=["deviceCapture","privateDurableStorage","authenticatedTenantIsolation","physicalRoomBenchmark","independentQA","releaseApproval"];
export function evaluateRenovisionReleaseReadiness(evidence={}) {
 const gates=required.map(id=>{
   const entry=evidence?.[id];
   const passed=entry?.status==="pass"&&entry?.independentlyVerified===true&&typeof entry?.evidenceRef==="string"&&entry.evidenceRef.trim().length>0;
   return {id,passed,reason:passed?null:"verified passing evidence required"};
 });
 return {ready:gates.every(g=>g.passed),gates,missing:gates.filter(g=>!g.passed).map(g=>g.id),productionAuthorized:false};
}
