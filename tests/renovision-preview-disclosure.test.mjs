import test from "node:test";
import assert from "node:assert/strict";
import {describeRenovisionPreview} from "../lib/renovision/preview-disclosure.mjs";
test("default renovate preview has three warnings",()=>{const r=describeRenovisionPreview({mode:"renovate"});assert.equal(r.warnings.length,3);assert.equal(r.verified,false);});
test("furnishing preview uses distinct title",()=>assert.match(describeRenovisionPreview({mode:"furnish"}).title,/Furniture/));
test("geometry lock clears only geometry warning",()=>assert.equal(describeRenovisionPreview({mode:"renovate",geometryLocked:true}).warnings.length,2));
test("all caller flags cannot make concept a certified survey",()=>{const r=describeRenovisionPreview({mode:"furnish",geometryLocked:true,fieldMeasurementsVerified:true,physicalBenchmarkPassed:true});assert.equal(r.verified,false);assert.match(r.claim,/not a construction drawing/);});
test("invalid mode rejected",()=>assert.equal(describeRenovisionPreview({mode:"paint"}).valid,false));
