/** Compute field measurement completeness without inventing missing dimensions. */
const requiredFeatures=["width","depth","height","door_width","door_offset","window_width","window_offset","obstruction_offset"];
export function assessRoomSurveyCompleteness({measurements,coverageGaps=[]}={}) {
 if(!Array.isArray(measurements)||!Array.isArray(coverageGaps)) return {complete:false,errors:["measurement and coverage arrays required"]};
 const errors=[],seen=new Set(),present=[];
 for(const m of measurements) {
   if(!m||typeof m.featureId!=="string"||!m.featureId.trim()||seen.has(m.featureId)) {errors.push("invalid or duplicate feature");continue;}
   seen.add(m.featureId);
   if(typeof m.value!=="number"||!Number.isFinite(m.value)||m.value<0||!["m","cm","mm","ft","in"].includes(m.unit)) {errors.push("invalid measurement: "+m.featureId);continue;}
   if(m.sourceEvidenceVerified!==true||m.fieldMeasured!==true) continue;
   present.push(m.featureId);
 }
 const missing=requiredFeatures.filter(id=>!present.includes(id));
 return {complete:errors.length===0&&missing.length===0&&coverageGaps.length===0,missing,coverageGapCount:coverageGaps.length,present,errors,fieldCertified:false};
}
