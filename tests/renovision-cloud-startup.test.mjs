import test from "node:test";
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {resolve,dirname} from "node:path";

test("Cloud Run refuses insecure demo-header authentication at startup",()=>{
 const entry=resolve(dirname(fileURLToPath(import.meta.url)),"../src/renovisionMain.mjs");
 const result=spawnSync(process.execPath,[entry],{
  env:{...process.env,RENOVISION_DEMO_AUTH:"1",K_SERVICE:"renovision",PORT:"0"},
  encoding:"utf8",timeout:10000
 });
 assert.equal(result.status,1);
 assert.match(result.stderr,/RENOVISION_DEMO_AUTH is forbidden in Cloud Run/);
});
