/** Pure furnishing clearance estimate. Does not certify accessibility, egress, or code compliance. */
const valid=n=>typeof n==="number"&&Number.isFinite(n)&&n>=0;
export function evaluateFurnitureClearance({room,items,minimumClearanceMeters=0.75}={}) {
 const errors=[];
 if(!room||!valid(room.widthMeters)||!valid(room.depthMeters)||room.widthMeters===0||room.depthMeters===0) errors.push("valid room rectangle required");
 if(!Array.isArray(items)) errors.push("items array required");
 if(!valid(minimumClearanceMeters)) errors.push("invalid clearance threshold");
 if(errors.length) return {valid:false,errors};
 const boxes=[];
 for(const item of items) {
   if(typeof item?.id!=="string"||!item.id.trim()||!["xMeters","yMeters","widthMeters","depthMeters"].every(k=>valid(item[k]))||item.widthMeters===0||item.depthMeters===0) {errors.push("invalid item rectangle");continue;}
   const b={id:item.id,left:item.xMeters,right:item.xMeters+item.widthMeters,top:item.yMeters,bottom:item.yMeters+item.depthMeters};
   if(b.right>room.widthMeters||b.bottom>room.depthMeters) errors.push("item outside room: "+item.id);
   if(boxes.some(x=>x.id===item.id)) errors.push("duplicate item: "+item.id);
   boxes.push(b);
 }
 if(errors.length) return {valid:false,errors};
 const overlaps=[];
 for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++) {
   const a=boxes[i],b=boxes[j];
   if(a.left<b.right&&b.left<a.right&&a.top<b.bottom&&b.top<a.bottom) overlaps.push([a.id,b.id]);
 }
 const wallClearances=boxes.map(b=>({id:b.id,minimumMeters:Math.min(b.left,room.widthMeters-b.right,b.top,room.depthMeters-b.bottom)}));
 return {valid:true,overlaps,wallClearances,minimumClearanceMeters,clearanceAdvisoryOnly:true,verified:false,fitWithoutOverlap:overlaps.length===0,errors:[]};
}
