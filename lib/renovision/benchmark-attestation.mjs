/** Require a trusted source of attestation rather than accepting a self-declared benchmark flag. */
const text=x=>typeof x==="string"&&x.trim().length>0;
export async function verifyBenchmarkAttestation({attestationId,tenantId,propertyId,roomId,actor,resolveAttestation}={}) {
 if(![attestationId,tenantId,propertyId,roomId].every(text)||actor?.authenticated!==true||!text(actor.id)||actor.tenantId!==tenantId||typeof resolveAttestation!=="function")
  return {verified:false,errors:["authenticated scoped attestation resolver required"]};
 let record;
 try {record=await resolveAttestation({attestationId,tenantId,propertyId,roomId,actor});}
 catch {return {verified:false,errors:["attestation unavailable"]};}
 if(!record||record.attestationId!==attestationId||record.tenantId!==tenantId||record.propertyId!==propertyId||record.roomId!==roomId)
  return {verified:false,errors:["attestation scope mismatch"]};
 if(record.reviewerId!==undefined && (!text(record.reviewerId)||record.reviewerId===actor.id)) return {verified:false,errors:["independent reviewer identity invalid"]};
 if(record.status!=="passed"||record.revoked===true||record.independentReviewerVerified!==true||!text(record.evidenceRef)||!text(record.commitSha)||!/^[a-f0-9]{40}$/.test(record.commitSha))
  return {verified:false,errors:["independent attestation evidence incomplete"]};
 return {verified:true,evidenceRef:record.evidenceRef,commitSha:record.commitSha,errors:[],physicalSurveyCertified:false};
}
