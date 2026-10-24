import test from "node:test";
import assert from "node:assert/strict";
import {assessRoomSurveyCompleteness} from "../lib/renovision/survey-completeness.mjs";
const ids=["width","depth","height","door_width","door_offset","window_width","window_offset","obstruction_offset"];
const rows=ids.map(featureId=>({featureId,value:1,unit:"m",sourceEvidenceVerified:true,fieldMeasured:true}));
test("all independently evidenced features with no gaps satisfy structural checklist",()=>{
 const r=assessRoomSurveyCompleteness({measurements:rows});assert.equal(r.complete,true);assert.equal(r.fieldCertified,false);
});
test("missing door measurement reported explicitly",()=>{
 const r=assessRoomSurveyCompleteness({measurements:rows.filter(x=>x.featureId!=="door_width")});
 assert.equal(r.complete,false);assert.ok(r.missing.includes("door_width"));
});
test("unverified measurements do not count",()=>{
 const r=assessRoomSurveyCompleteness({measurements:rows.map(x=>x.featureId==="width"?{...x,sourceEvidenceVerified:false}:x)});
 assert.ok(r.missing.includes("width"));
});
test("unresolved coverage gap prevents completion",()=>assert.equal(assessRoomSurveyCompleteness({measurements:rows,coverageGaps:["occluded corner"]}).complete,false));
test("duplicate feature fails",()=>assert.equal(assessRoomSurveyCompleteness({measurements:[...rows,rows[0]]}).complete,false));
test("invalid negative or nonfinite dimensions fail",()=>assert.equal(assessRoomSurveyCompleteness({measurements:[{...rows[0],value:Infinity}]}).complete,false));
