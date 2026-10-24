/** In-memory compare-and-append fixture. No persistent audit or production guarantees. */
export function createMemorySpatialEventStore({authorize}={}) {
 if(typeof authorize!=="function") throw new TypeError("authorization callback required");
 const rows=new Map();
 const key=({tenantId,propertyId,roomId,featureId})=>JSON.stringify([tenantId,propertyId,roomId,featureId]);
 return {
   async readFeatureEvents(scope) {
     if(!await authorize({...scope,action:"read"})) throw Error("access denied");
     const record=rows.get(key(scope))??{revision:0,events:[]};
     return {revision:record.revision,events:record.events.map(e=>({...e}))};
   },
   async compareAndAppend(scope) {
     if(!await authorize({...scope,action:"write"})) throw Error("access denied");
     const k=key(scope),record=rows.get(k)??{revision:0,events:[]};
     if(record.revision!==scope.expectedRevision)return {committed:false};
     if(scope.event?.propertyId!==scope.propertyId||scope.event?.roomId!==scope.roomId||scope.event?.featureId!==scope.featureId) return {committed:false};
     const next={revision:record.revision+1,events:[...record.events,{...scope.event}]};
     rows.set(k,next);
     return {committed:true,revision:next.revision};
   },
   get storageClass(){return "ephemeral-test-only";}
 };
}
