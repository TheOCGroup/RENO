import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { MissionControlStateStore } from '../src/missionControlStateStore.mjs';
import { MissionControlService } from '../src/missionControlService.mjs';
import { RenovationWorkflow } from '../src/renovationWorkflow.mjs';
import { createMissionControlApiHandler } from '../src/missionControlApi.mjs';

test('HTTP API requires server-issued identity, enforces roles and versions', async () => {
  const store=new MissionControlStateStore({databasePath:':memory:',tenantId:'tenant-a'});
  const operator={id:'operator-1',role:'operator'};
  const viewer={id:'viewer-1',role:'viewer'};
  const service=new MissionControlService({store,authorize:({actor,action})=>actor.role==='operator' || action==='project:read'});
  service.initialize({actor:operator,projectId:'p1',workflowSnapshot:new RenovationWorkflow({id:'p1'}).snapshot()});
  const handler=createMissionControlApiHandler({service,tokenRegistry:[{token:'secure-token-operator',actor:operator},{token:'secure-token-viewer',actor:viewer}]});
  const server=createServer(async (req,res)=>{if(!(await handler(req,res))){res.writeHead(404);res.end();}});
  server.listen(0,'127.0.0.1'); await once(server,'listening');
  const base='http://127.0.0.1:'+server.address().port+'/api/v1/mission-control/projects/p1';
  async function call(path,token,method='GET',body) {
    const res=await fetch(base+path,{method,headers:{...(token?{authorization:'Bearer '+token}:{}),...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
    return {status:res.status,data:await res.json()};
  }
  try {
    assert.equal((await call('')).status,401);
    assert.equal((await call('','secure-token-viewer')).status,200);
    assert.equal((await call('/operations','secure-token-viewer','POST',{expectedVersion:1,operation:'addContractor',args:{name:'X',trade:'roof'}})).status,403);
    const accepted=await call('/operations','secure-token-operator','POST',{expectedVersion:1,operation:'addContractor',args:{name:'X',trade:'roof'}});
    assert.equal(accepted.status,200);
    assert.equal(accepted.data.data.version,2);
    assert.equal((await call('/operations','secure-token-operator','POST',{expectedVersion:1,operation:'addContractor',args:{name:'Y',trade:'paint'}})).status,409);
    assert.equal((await call('','secure-token-operator')).data.data.state.ledger.contractors.length,1);
    assert.equal((await call('/operations','secure-token-operator','POST',{expectedVersion:2,operation:'unknown',args:{}})).status,400);
    assert.equal((await call('/payment-reconciliation',null,'POST',{bankRecords:[]})).status,401);
    assert.equal((await call('/payment-reconciliation','secure-token-viewer','POST',{bankRecords:[]})).status,403);
    assert.equal((await call('/payment-reconciliation','secure-token-operator','GET')).status,405);
    const report=await call('/payment-reconciliation','secure-token-operator','POST',{bankRecords:[]});
    assert.equal(report.status,200);
    assert.equal(report.data.data.report.verified,false);
    assert.equal(report.data.data.version,2);
    assert.equal((await call('/payment-reconciliation','secure-token-operator','POST',{bankRecords:'invalid'})).status,400);
    assert.equal((await call('/payment-reconciliation','secure-token-operator','POST',[])).status,400);
    assert.equal((await call('/operations','secure-token-operator','POST',[])).status,400);
    assert.equal((await call('/operations','secure-token-operator','POST',{expectedVersion:2,operation:'addContractor',args:[]})).status,400);
    assert.equal((await call('/operations','secure-token-operator','POST',{expectedVersion:2,operation:'addContractor',args:null})).status,400);
    assert.equal((await call('','secure-token-operator')).data.data.version,2);
  } finally { server.close(); await once(server,'close'); store.close(); }
});
