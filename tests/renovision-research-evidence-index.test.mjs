import test from "node:test";
import assert from "node:assert/strict";
import {buildResearchEvidenceIndex} from "../lib/renovision/research-evidence-index.mjs";
const base={commitSha:"a".repeat(40),studyId:"study1",artifacts:[{id:"frame1",kind:"photo",digest:"sha256:"+"b".repeat(64),privateEvidenceRef:"private-ref"}],failures:[{id:"f1",description:"denied camera"}],costEntries:[{purpose:"compute",usd:0.15}]};
test("builds index without copying raw image bytes",()=>{
 const r=buildResearchEvidenceIndex(base);assert.equal(r.valid,true);assert.equal(r.totalCostUsd,0.15);assert.equal(r.independentlyAudited,false);
});
test("rejects noncanonical commit",()=>assert.equal(buildResearchEvidenceIndex({...base,commitSha:"abc"}).valid,false));
test("rejects duplicate evidence IDs",()=>assert.equal(buildResearchEvidenceIndex({...base,artifacts:[base.artifacts[0],base.artifacts[0]]}).valid,false));
test("rejects missing private evidence reference",()=>assert.equal(buildResearchEvidenceIndex({...base,artifacts:[{...base.artifacts[0],privateEvidenceRef:""}]}).valid,false));
test("rejects negative costs",()=>assert.equal(buildResearchEvidenceIndex({...base,costEntries:[{purpose:"compute",usd:-1}]}).valid,false));
test("requires recorded failure descriptions",()=>assert.equal(buildResearchEvidenceIndex({...base,failures:[{id:"f1"}]}).valid,false));
