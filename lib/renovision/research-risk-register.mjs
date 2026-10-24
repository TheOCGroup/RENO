/** Risk register derived from explicit engineering evidence, never from assumed success. */
const required=["capture","integrity","authorization","physicalBenchmark","independentQA","privacy"];
export function assessResearchRisks({evidence={}}={}) {
 const risks=required.map(area=>{
   const item=evidence?.[area];
   const resolved=item?.status==="pass"&&item?.independentlyVerified===true&&typeof item?.evidenceRef==="string"&&item.evidenceRef.trim().length>0;
   return {area,status:resolved?"resolved":"open",reason:resolved?"verified evidence supplied":"missing independently verified passing evidence"};
 });
 return {ready:risks.every(x=>x.status==="resolved"),risks,openCount:risks.filter(x=>x.status==="open").length,releaseAuthorized:false};
}
