/** Transactional append contract: caller provides a durable atomic compare-and-swap store. */
import {appendAuthorizedSpatialEvent} from "./authorized-change-log.mjs";
const isText=x=>typeof x==="string"&&x.trim().length>0;
export async function commitSpatialEvent({store,actor,resolveApproval,event,expectedRevision}={}) {
 if(!store||typeof store.readFeatureEvents!=="function"||typeof store.compareAndAppend!=="function") return {committed:false,errors:["transactional store required"]};
 if(!Number.isSafeInteger(expectedRevision)||expectedRevision<0) return {committed:false,errors:["nonnegative expected revision required"]};
 if(actor?.authenticated!==true||!isText(actor?.id)) return {committed:false,errors:["authenticated actor required"]};
 if(!isText(actor?.tenantId)||!isText(event?.propertyId)||!isText(event?.roomId)||!isText(event?.featureId)) return {committed:false,errors:["tenant/property/feature required"]};
 const scope={tenantId:actor.tenantId,propertyId:event.propertyId,roomId:event.roomId,featureId:event.featureId};
 let snapshot;
 try {snapshot=await store.readFeatureEvents({...scope,actor});}
 catch {return {committed:false,errors:["snapshot read failed"]};}
 if(!snapshot||!Array.isArray(snapshot.events)||snapshot.revision!==expectedRevision) return {committed:false,errors:["revision conflict"]};
 if(snapshot.events.some(e=>e?.propertyId!==event.propertyId||e?.roomId!==event.roomId||e?.featureId!==event.featureId)) return {committed:false,errors:["snapshot contains events outside feature scope"]};
 if(snapshot.revision!==snapshot.events.length) return {committed:false,errors:["snapshot revision and event count mismatch"]};
 if(new Set(snapshot.events.map(e=>e?.eventId)).size!==snapshot.events.length || snapshot.events.some(e=>!isText(e?.eventId))) return {committed:false,errors:["invalid or duplicate snapshot event IDs"]};
 const latest=snapshot.events.length?snapshot.events[snapshot.events.length-1]:null;
 const result=await appendAuthorizedSpatialEvent({events:snapshot.events,event,actor,resolveApproval,expectedLastEventId:latest?.eventId??null});
 if(!result.ok) return {committed:false,errors:result.errors};
 try {
   const receipt=await store.compareAndAppend({...scope,actor,expectedRevision,event:result.events[result.events.length-1]});
   if(!receipt||receipt.committed!==true||receipt.revision!==expectedRevision+1) return {committed:false,errors:["atomic append conflict or invalid receipt"]};
   return {committed:true,revision:receipt.revision,eventId:event.eventId,errors:[]};
 } catch {return {committed:false,errors:["atomic append failed"]};}
}
