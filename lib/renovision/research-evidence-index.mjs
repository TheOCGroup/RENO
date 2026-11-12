/** Prepare an evidence bundle manifest without embedding customer images or secrets. */
const text=x=>typeof x==="string"&&x.trim().length>0;
export function buildResearchEvidenceIndex({commitSha,studyId,artifacts=[],failures=[],costEntries=[]}={}) {
 const errors=[];
 if(!/^[a-f0-9]{40}$/.test(commitSha??"")) errors.push("full git commit SHA required");
 if(!text(studyId)) errors.push("studyId required");
 if(!Array.isArray(artifacts)||!Array.isArray(failures)||!Array.isArray(costEntries)) return {valid:false,errors:["arrays required"]};
 const seen=new Set(),entries=[];
 for(const a of artifacts) {
   if(!text(a?.id)||seen.has(a.id)||!text(a?.kind)||!/^sha256:[a-f0-9]{64}$/i.test(a?.digest??"")||!text(a?.privateEvidenceRef)) {errors.push("artifact evidence metadata invalid");continue;}
   seen.add(a.id);entries.push({id:a.id,kind:a.kind,digest:a.digest.toLowerCase(),privateEvidenceRef:a.privateEvidenceRef});
 }
 let totalCostUsd=0;
 for(const c of costEntries) {
   if(typeof c?.usd!=="number"||!Number.isFinite(c.usd)||c.usd<0||!text(c?.purpose)) {errors.push("cost entry invalid");continue;}
   totalCostUsd+=c.usd;
 }
 if(!Number.isFinite(totalCostUsd)) errors.push("cost total overflow");
 for(const f of failures) if(!text(f?.id)||!text(f?.description)) errors.push("failure entry invalid");
 return {valid:errors.length===0,studyId,commitSha,artifacts:entries,failureCount:failures.length,totalCostUsd,independentlyAudited:false,errors};
}
