/** Enforce a privacy-aware bounded research trial cost ceiling. */
const text=x=>typeof x==="string"&&x.trim().length>0;
export function evaluateResearchTrialBudget({estimatedUsd,limitUsd=0.5,studyId,provider,requiresPaidCall=false,founderApproved=false}={}) {
 const errors=[];
 if(!text(studyId)||!text(provider)) errors.push("study and provider required");
 if(typeof estimatedUsd!=="number"||!Number.isFinite(estimatedUsd)||estimatedUsd<0) errors.push("valid estimate required");
 if(typeof limitUsd!=="number"||!Number.isFinite(limitUsd)||limitUsd<=0) errors.push("positive limit required");
 const within=errors.length===0&&estimatedUsd<=limitUsd;
 const allowed=within&&(!requiresPaidCall||founderApproved===true);
 return {allowed,withinLimit:within,requiresApproval:requiresPaidCall&&founderApproved!==true,limitUsd,estimatedUsd,errors,spentUsd:0,charged:false};
}
