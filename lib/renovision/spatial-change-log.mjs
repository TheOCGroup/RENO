/** Audit-safe deterministic spatial change log. Not a substitute for authenticated approval. */
const allowedStates=new Set(["EXISTING","PROPOSED","ALTERNATE","AS_BUILT"]);
const isText=x=>typeof x==="string"&&x.trim().length>0;
const isTimestamp=x=>isText(x)&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(x)&&Number.isFinite(Date.parse(x));
export function appendSpatialEvent(events,event) {
 if (!Array.isArray(events) || !event || typeof event!=="object" || Array.isArray(event)) return {ok:false,errors:["events array and event object required"]};
 const errors=[];
 for(const key of ["eventId","propertyId","roomId","featureId","actorId","occurredAt","reason"]) if(!isText(event[key])) errors.push(key+" required");
 if(!allowedStates.has(event.fromState)||!allowedStates.has(event.toState)) errors.push("state invalid");
 if(event.fromState==="EXISTING" && event.toState==="EXISTING") errors.push("existing state cannot be overwritten");
 if(!isTimestamp(event.occurredAt)) errors.push("valid ISO event timestamp required");
 if(events.some(x=>x?.eventId===event.eventId)) errors.push("duplicate eventId");
 const history=events.filter(x=>x?.propertyId===event.propertyId&&x?.roomId===event.roomId&&x?.featureId===event.featureId);
 const latest=history.at(-1);
 if(latest && event.fromState!==latest.toState) errors.push("previous feature state mismatch");
 if(latest && (!isTimestamp(latest.occurredAt)||isTimestamp(event.occurredAt)&&Date.parse(event.occurredAt)<Date.parse(latest.occurredAt))) errors.push("event timestamp precedes feature history");
 if(!latest && event.fromState!=="EXISTING") errors.push("previous feature state not established");
 if(["PROPOSED","ALTERNATE","AS_BUILT"].includes(event.toState) && (!isText(event.scopeItemId)||!isText(event.approvalRef))) errors.push("scope and approval reference required");
 if(errors.length) return {ok:false,errors};
 const entry=Object.freeze({...event});
 return {ok:true,events:[...events,entry],errors:[]};
}
export function getLatestFeatureState(events,featureId,propertyId,roomId) {
 if(!Array.isArray(events)||!isText(featureId)) return {found:false};
 const history=events.filter(e=>e?.featureId===featureId && (propertyId===undefined || e?.propertyId===propertyId) && (roomId===undefined || e?.roomId===roomId));
 return history.length?{found:true,state:history[history.length-1].toState,eventId:history[history.length-1].eventId}:{found:false};
}
