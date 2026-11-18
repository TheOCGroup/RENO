/** Deterministic benchmark provenance checklist. Caller assertions are not attestation. */
const text=x=>typeof x==="string"&&x.trim().length>0;
export function validateBenchmarkProvenance(record) {
 const errors=[];
 if(!record||typeof record!=="object"||Array.isArray(record)) return {valid:false,errors:["record required"]};
 for(const key of ["propertyId","roomId","referenceOperatorId","captureOperatorId","instrumentId","instrumentCalibrationRef","captureCommit","evidenceDigest"]) if(!text(record[key])) errors.push(key+" required");
 if(record.referenceOperatorId===record.captureOperatorId) errors.push("reference and capture operators must differ");
 if(!/^sha256:[a-f0-9]{64}$/i.test(record.evidenceDigest??"")) errors.push("evidence digest syntax invalid");
 if(!Array.isArray(record.referenceRepeats)||record.referenceRepeats.length<3) errors.push("three or more reference repeats required");
 else if(record.referenceRepeats.some(x=>typeof x!=="number"||!Number.isFinite(x)||x<=0)) errors.push("reference repeat invalid");
 if(!Array.isArray(record.failureLog)) errors.push("failure log required, even if empty");
 if(typeof record.computeCostUsd!=="number"||!Number.isFinite(record.computeCostUsd)||record.computeCostUsd<0) errors.push("nonnegative compute cost required");
 return {valid:errors.length===0,errors,independentlyCertified:false};
}
