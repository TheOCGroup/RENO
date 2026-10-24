/** Audit-safe deterministic spatial change log. Not a substitute for authenticated approval. */
const allowedStates=new Set(["EXISTING","PROPOSED","ALTERNATE","AS_BUILT"]);
const isText=x=>typeof x==="string"&&x.trim().length>0;
export function appendSpatialEvent(events,event) {
 if (!Array.isArray(events) || !event || typeof event!=="object" || Array.isArray(event)) return {ok:false,errors:["events array and event object required"]};
 const errors=[];
 for(const key of ["eventId","propertyId","roomId","featureId","actorId","occurredAt","reason"]) if(!isText(event[key])) errors.push(key+" required");
 if(!allowedStates.has(event.fromState)||!allowedStates.has(event.toState)) errors.push("state invalid");
 if(event.fromState==="EXISTING" && event.toState==="EXISTING") errors.push("existing state cannot be overwritten");
 if(events.some(x=>x?.eventId===event.eventId)) errors.push("duplicate eventId");
 if(event.fromState!=="EXISTING" && !events.some(x=>x?.featureId===event.featureId&&x?.toState===event.fromState)) errors.push("previous feature state not established");
 if(["PROPOSED","ALTERNATE","AS_BUILT"].includes(event.toState) && (!isText(event.scopeItemId)||!isText(event.approvalRef))) errors.push("scope and approval reference required");
 if(errors.length) return {ok:false,errors};
 const entry=Object.freeze({...event});
 return {ok:true,events:[...events,entry],errors:[]};
}
export function getLatestFeatureState(events,featureId) {
 if(!Array.isArray(events)||!isText(featureId)) return {found:false};
 const history=events.filter(e=>e?.featureId===featureId);
 return history.length?{found:true,state:history[history.length-1].toState,eventId:history[history.length-1].eventId}:{found:false};
}
