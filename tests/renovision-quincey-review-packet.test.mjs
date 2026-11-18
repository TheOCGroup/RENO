import test from "node:test";
import assert from "node:assert/strict";
import {buildQuinceyReviewPacket} from "../lib/renovision/quincey-review-packet.mjs";
const base={commitSha:"a".repeat(40),prUrl:"https://github.com/TheOCGroup/RENO/pull/3",studyId:"spatial",testCount:213,ciRuns:[{workflow:"spatial",status:"success"}]};
test("valid packet is neither submitted nor certified",()=>{const r=buildQuinceyReviewPacket(base);assert.equal(r.valid,true);assert.equal(r.reviewRequested,false);assert.equal(r.approved,false);});
test("partial commit SHA rejected",()=>assert.equal(buildQuinceyReviewPacket({...base,commitSha:"abc"}).valid,false));
test("non-GitHub PR URL rejected",()=>assert.equal(buildQuinceyReviewPacket({...base,prUrl:"https://example.com/3"}).valid,false));
test("malformed CI run rejected",()=>assert.equal(buildQuinceyReviewPacket({...base,ciRuns:[{workflow:"spatial",status:"unknown"}]}).valid,false));
test("empty benchmark remains explicitly unverified",()=>{const r=buildQuinceyReviewPacket(base);assert.equal(r.benchmarkRef,null);assert.equal(r.physicalBenchmarkVerified,false);});
