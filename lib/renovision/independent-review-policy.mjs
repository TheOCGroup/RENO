/** Independent review evidence policy: records an outcome, not a review itself. */
const text=x=>typeof x==="string"&&x.trim().length>0;
export function evaluateIndependentReview({authorId,reviewerId,commitSha,reviewedCommitSha,checks=[],decision,reviewEvidenceRef}={}) {
 const errors=[];
 if(!text(authorId)||!text(reviewerId)||authorId===reviewerId) errors.push("distinct author and reviewer required");
 if(!/^[a-f0-9]{40}$/.test(commitSha??"")||commitSha!==reviewedCommitSha) errors.push("exact reviewed commit required");
 if(!Array.isArray(checks)||!checks.length||checks.some(c=>!text(c?.name)||!["pass","fail","not_run"].includes(c.status))) errors.push("valid review checks required");
 if(!["pass","fail","blocked"].includes(decision)) errors.push("review decision required");
 if(!text(reviewEvidenceRef)) errors.push("review evidence reference required");
 const passed=errors.length===0&&decision==="pass"&&checks.every(c=>c.status==="pass");
 return {valid:errors.length===0,passed,errors,independentlyVerified:false};
}
