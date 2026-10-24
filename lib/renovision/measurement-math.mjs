/** Normalize dimension records into meters without claiming measurement verification. */
const units={m:1,cm:0.01,mm:0.001,in:0.0254,ft:0.3048};
export function normalizeLength({value,unit,uncertainty=0}={}) {
 if (typeof value!=="number" || !Number.isFinite(value) || value<=0 || !(unit in units) || typeof uncertainty!=="number" || !Number.isFinite(uncertainty) || uncertainty<0) return {valid:false,errors:["invalid length, unit or uncertainty"]};
 return {valid:true,meters:value*units[unit],uncertaintyMeters:uncertainty*units[unit],sourceUnit:unit,errors:[]};
}
export function compareMeasurements(a,b,{sigmaMultiplier=2}={}) {
 const x=normalizeLength(a),y=normalizeLength(b);
 if (!x.valid || !y.valid || typeof sigmaMultiplier!=="number" || !Number.isFinite(sigmaMultiplier) || sigmaMultiplier<0) return {comparable:false,errors:["invalid measurement comparison"]};
 const differenceMeters=Math.abs(x.meters-y.meters);
 const combinedUncertaintyMeters=Math.hypot(x.uncertaintyMeters,y.uncertaintyMeters);
 const toleranceMeters=sigmaMultiplier*combinedUncertaintyMeters;
 return {comparable:true,withinReportedUncertainty:differenceMeters<=toleranceMeters,differenceMeters,toleranceMeters,errors:[]};
}
export function summarizeRoomDimensions({width,depth,height}={}) {
 const dimensions=[width,depth,height].map(normalizeLength);
 if (dimensions.some(x=>!x.valid)) return {valid:false,errors:["width, depth and height require positive finite lengths"]};
 const [w,d,h]=dimensions;
 return {valid:true,widthMeters:w.meters,depthMeters:d.meters,heightMeters:h.meters,areaSquareMeters:w.meters*d.meters,volumeCubicMeters:w.meters*d.meters*h.meters,verified:false,geometryAssumption:"rectangular-prism-estimate",errors:[]};
}
