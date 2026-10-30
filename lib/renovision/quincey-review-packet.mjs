/** Evidence handoff is intentionally a review request, not a fabricated certification. */
const text=x=>typeof x==="string"&&x.trim().length>0;
export function buildQuinceyReviewPacket({commitSha,prUrl,studyId,benchmarkRef,artifactRefs=[],testCount,ciRuns=[]}={}) {
 const errors=[];
 if(!/^[a-f0-9]{40}$/.test(commitSha??"")) errors.push("full commit SHA required");
 if(!text(prUrl)||!/^https:\/\/github\.com\//.test(prUrl)) errors.push("GitHub PR URL required");
 if(!text(studyId)) errors.push("study ID required");
 if(!Number.isSafeInteger(testCount)||testCount<1) errors.push("positive test count required");
 if(!Array.isArray(artifactRefs)||artifactRefs.some(x=>!text(x))) errors.push("artifact refs invalid");
 if(!Array.isArray(ciRuns)||ciRuns.some(x=>!text(x?.workflow)||!["success","failure","pending"].includes(x.status))) errors.push("CI run statuses invalid");
 if(errors.length)return {valid:false,errors};
 return {valid:true,errors:[],reviewer:"QUINCEY",commitSha,prUrl,studyId,benchmarkRef:text(benchmarkRef)?benchmarkRef:null,artifactRefs,testCount,ciRuns,reviewRequested:false,reviewPerformed:false,approved:false,physicalBenchmarkVerified:false};
}
