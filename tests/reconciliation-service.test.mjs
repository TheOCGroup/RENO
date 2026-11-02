import test from 'node:test';
import assert from 'node:assert/strict';
import { MissionControlStateStore } from '../src/missionControlStateStore.mjs';
import { MissionControlService } from '../src/missionControlService.mjs';
import { RenovationWorkflow } from '../src/renovationWorkflow.mjs';

test('draw allocation service rejects unauthorized, stale and unapproved requests', () => {
  const store=new MissionControlStateStore({databasePath:':memory:',tenantId:'ocg'});
  const operator={id:'staff',role:'operator'}, viewer={id:'viewer',role:'viewer'};
  const service=new MissionControlService({store,authorize:({actor})=>actor.role==='operator'});
  service.initialize({actor:operator,projectId:'draw-project',workflowSnapshot:new RenovationWorkflow({id:'draw-project'}).snapshot()});
  const request={projectId:'draw-project',expectedVersion:1,drawId:'not-approved',invoiceId:'none',amount:100};
  assert.throws(()=>service.executeDrawAllocation({actor:viewer,...request}),/forbidden/);
  assert.throws(()=>service.executeDrawAllocation({actor:operator,...request,expectedVersion:2}),/state_version_conflict/);
  assert.throws(()=>service.executeDrawAllocation({actor:operator,...request}),/draw_not_approved/);
  assert.equal(service.get({actor:operator,projectId:'draw-project'}).version,1);
  store.close();
});

test('reconciliation is authorized, read-only and refuses draw allocation without approval integration', () => {
  const store=new MissionControlStateStore({databasePath:':memory:',tenantId:'ocg'});
  const service=new MissionControlService({store,authorize:({actor,action})=>actor.role==='operator' && action!=='allocateDraw'});
  const operator={id:'staff',role:'operator'},viewer={id:'viewer',role:'viewer'};
  const workflow=new RenovationWorkflow({id:'project-1'});
  service.initialize({actor:operator,projectId:'project-1',workflowSnapshot:workflow.snapshot()});
  assert.throws(()=>service.reconcilePayments({actor:viewer,projectId:'project-1',bankRecords:[]}),/forbidden/);
  const result=service.reconcilePayments({actor:operator,projectId:'project-1',bankRecords:[]});
  assert.equal(result.version,1);
  assert.equal(result.report.verified,false);
  assert.equal(service.get({actor:operator,projectId:'project-1'}).version,1);
  assert.throws(()=>service.execute({actor:operator,projectId:'project-1',expectedVersion:1,operation:'allocateDraw',args:{drawId:'fake',invoiceId:'fake',amount:1}}),/operation_not_allowed/);
  store.close();
});
