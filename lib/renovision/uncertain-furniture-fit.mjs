/** Conservative fit estimate including explicit measurement uncertainty. */
const finite=x=>typeof x==="number"&&Number.isFinite(x)&&x>=0;
export function assessUncertainFurnitureFit({room,object,clearanceMeters=0.1}={}) {
 const errors=[];
 for(const [name,dimension] of [["room.width",room?.width],["room.depth",room?.depth],["object.width",object?.width],["object.depth",object?.depth]]) {
   if(!dimension||!finite(dimension.meters)||dimension.meters<=0||!finite(dimension.uncertaintyMeters)) errors.push(name+" requires positive dimension and nonnegative uncertainty");
 }
 if(!finite(clearanceMeters)) errors.push("clearance must be nonnegative");
 if(errors.length) return {valid:false,errors,verified:false};
 const availableWidth=room.width.meters-room.width.uncertaintyMeters;
 const availableDepth=room.depth.meters-room.depth.uncertaintyMeters;
 const neededWidth=object.width.meters+object.width.uncertaintyMeters+2*clearanceMeters;
 const neededDepth=object.depth.meters+object.depth.uncertaintyMeters+2*clearanceMeters;
 const normal=neededWidth<=availableWidth&&neededDepth<=availableDepth;
 const rotated=neededDepth<=availableWidth&&neededWidth<=availableDepth;
 return {valid:true,fit:normal||rotated,normal,rotated,availableWidth,availableDepth,neededWidth,neededDepth,verified:false,fieldVerificationRequired:true,errors:[]};
}
