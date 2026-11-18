/** Trusted approval gate. The resolver must be server-side and authenticate the actor independently. */
const text=x=>typeof x==="string"&&x.trim().length>0;
const iso=x=>text(x)&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(x)&&Number.isFinite(Date.parse(x));
export async function authorizeSpatialChange({change,actor,resolveApproval,now=()=>Date.now()}={}) {
 const errors=[];
 if(!change||typeof change!=="object"||Array.isArray(change)) errors.push("change required");
 if(!actor||typeof actor!=="object"||actor.authenticated!==true||!text(actor.id)||!text(actor.tenantId)) errors.push("authenticated actor context required");
 if(typeof resolveApproval!=="function") errors.push("trusted approval resolver required");
 for(const key of ["propertyId","roomId","featureId","approvedScopeItemId","approvalRef"]) if(!text(change?.[key])) errors.push(key+" required");
 if(errors.length) return {authorized:false,errors};
 let approval;
 try {approval=await resolveApproval({approvalRef:change.approvalRef,tenantId:actor.tenantId,propertyId:change.propertyId});}
 catch {return {authorized:false,errors:["approval lookup failed"]};}
 if(!approval||approval.status!=="approved"||approval.revoked===true) errors.push("active approval required");
 if(approval?.tenantId!==actor.tenantId||approval?.propertyId!==change.propertyId||approval?.roomId!==change.roomId||approval?.featureId!==change.featureId||approval?.scopeItemId!==change.approvedScopeItemId||approval?.approvalRef!==change.approvalRef) errors.push("approval scope mismatch");
 if(!iso(approval?.approvedAt)||!text(approval?.approvedBy)) errors.push("approval audit evidence invalid");
 if(iso(approval?.approvedAt) && Date.parse(approval.approvedAt)>now()) errors.push("approval timestamp is in the future");
 if(approval?.expiresAt!==undefined && (!iso(approval.expiresAt)||Date.parse(approval.expiresAt)<=now())) errors.push("approval expired or expiry invalid");
 if(approval?.allowedActorIds!==undefined && (!Array.isArray(approval.allowedActorIds)||!approval.allowedActorIds.includes(actor.id))) errors.push("actor not approved for change");
 if(approval?.allowedActorIds===undefined && approval?.approvedBy===actor.id) errors.push("self-approved change requires explicit actor delegation");
 return {authorized:errors.length===0,errors};
}
