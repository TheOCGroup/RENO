/** Orchestrates trusted approval lookup before writing a proposed spatial event. */
import {authorizeSpatialChange} from "./approval-gate.mjs";
import {appendSpatialEvent,getLatestFeatureState} from "./spatial-change-log.mjs";
export async function appendAuthorizedSpatialEvent({events,event,actor,resolveApproval,expectedLastEventId=null}={}) {
 if(!Array.isArray(events)||!event||typeof event!=="object") return {ok:false,errors:["events and event required"]};
 const current=getLatestFeatureState(events,event.featureId);
 if (expectedLastEventId !== (current.found ? current.eventId : null)) return {ok:false,errors:["feature version conflict"]};
 if(current.found && event.fromState!==current.state) return {ok:false,errors:["stale feature state"]};
 if(!current.found && event.fromState!=="EXISTING") return {ok:false,errors:["initial feature state must be EXISTING"]};
 const decision=await authorizeSpatialChange({
   actor,resolveApproval,
   change:{propertyId:event.propertyId,roomId:event.roomId,featureId:event.featureId,approvedScopeItemId:event.scopeItemId,approvalRef:event.approvalRef}
 });
 if(!decision.authorized) return {ok:false,errors:decision.errors};
 if(event.actorId!==actor.id) return {ok:false,errors:["event actor mismatch"]};
 return appendSpatialEvent(events,event);
}
