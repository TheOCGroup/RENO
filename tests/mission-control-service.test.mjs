import test from 'node:test';
import assert from 'node:assert/strict';
import { MissionControlStateStore } from '../src/missionControlStateStore.mjs';
import { MissionControlService } from '../src/missionControlService.mjs';
import { RenovationWorkflow } from '../src/renovationWorkflow.mjs';

test('service enforces authorization, persists ledger actions and rejects stale writes', () => {
  const store = new MissionControlStateStore({databasePath:':memory:',tenantId:'ocg'});
  const service = new MissionControlService({store,authorize:({actor,action})=>actor.role==='operator' && action!=='recordPayment'});
  const operator = {id:'staff-1',role:'operator'};
  const viewer = {id:'staff-2',role:'viewer'};
  const workflow = new RenovationWorkflow({id:'p-1'});
  assert.throws(()=>service.initialize({actor:viewer,projectId:'p-1',workflowSnapshot:workflow.snapshot()}),/forbidden/);
  const created = service.initialize({actor:operator,projectId:'p-1',workflowSnapshot:workflow.snapshot()});
  assert.equal(created.version,1);
  assert.throws(()=>service.get({actor:viewer,projectId:'p-1'}),/forbidden/);
  const added = service.execute({actor:operator,projectId:'p-1',expectedVersion:1,operation:'addContractor',args:{name:'Contractor A',trade:'roofing'}});
  assert.equal(added.version,2);
  assert.equal(service.get({actor:operator,projectId:'p-1'}).state.ledger.contractors.length,1);
  assert.throws(()=>service.execute({actor:operator,projectId:'p-1',expectedVersion:1,operation:'addContractor',args:{name:'Contractor B',trade:'paint'}}),/state_version_conflict/);
  assert.throws(()=>service.execute({actor:operator,projectId:'p-1',expectedVersion:2,operation:'recordPayment',args:{}}),/forbidden/);
  assert.throws(()=>service.execute({actor:operator,projectId:'p-1',expectedVersion:2,operation:'deleteProject',args:{}}),/operation_not_allowed/);
  assert.equal(service.get({actor:operator,projectId:'p-1'}).version,2);
  store.close();
});
test('service refuses a missing authorization function and mismatched workflow', () => {
  const store = new MissionControlStateStore({databasePath:':memory:',tenantId:'ocg'});
  assert.throws(()=>new MissionControlService({store}),/service_configuration_required/);
  const service = new MissionControlService({store,authorize:()=>true});
  assert.throws(()=>service.initialize({actor:{id:'staff'},projectId:'p1',workflowSnapshot:{project:{id:'p2'}}}),/workflow_project_mismatch/);
  store.close();
});
