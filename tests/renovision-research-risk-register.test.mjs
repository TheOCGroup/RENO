import test from "node:test";
import assert from "node:assert/strict";
import {assessResearchRisks} from "../lib/renovision/research-risk-register.mjs";
const pass={status:"pass",independentlyVerified:true,evidenceRef:"review"};
test("all risk areas open without independent evidence",()=>{const r=assessResearchRisks();assert.equal(r.ready,false);assert.equal(r.openCount,6);});
test("one asserted verified area reduces open count",()=>{const r=assessResearchRisks({evidence:{capture:pass}});assert.equal(r.openCount,5);});
test("status pass without independent evidence remains open",()=>assert.equal(assessResearchRisks({evidence:{capture:{...pass,independentlyVerified:false}}}).openCount,6));
test("empty evidence reference remains open",()=>assert.equal(assessResearchRisks({evidence:{capture:{...pass,evidenceRef:""}}}).openCount,6));
test("all asserted areas still never authorize release",()=>{
 const evidence=Object.fromEntries(["capture","integrity","authorization","physicalBenchmark","independentQA","privacy"].map(k=>[k,pass]));
 const r=assessResearchRisks({evidence});assert.equal(r.ready,true);assert.equal(r.releaseAuthorized,false);
});
