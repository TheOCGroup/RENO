import test from 'node:test';
import assert from 'node:assert/strict';
import { MissionControlStateStore } from '../src/missionControlStateStore.mjs';
import { MissionControlService } from '../src/missionControlService.mjs';
import { RenovationWorkflow } from '../src/renovationWorkflow.mjs';
import { RenovationLedger } from '../src/renovationLedger.mjs';

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

test('authorized allocation persists and stale replay is rejected', () => {
  const store=new MissionControlStateStore({databasePath:':memory:',tenantId:'ocg'});
  const actor={id:'operator',role:'operator'};
  const service=new MissionControlService({store,authorize:({actor})=>actor.role==='operator'});
  const projectId='allocation-project';
  const initial=service.initialize({actor,projectId,workflowSnapshot:new RenovationWorkflow({id:projectId}).snapshot()});
  const ledger=new RenovationLedger({projectId,state:initial.state.ledger});
  const contractor=ledger.addContractor({name:'Roof Co',trade:'roof'});
  const invoice=ledger.addInvoice({contractorId:contractor.id,reference:'R-1',total:200});
  ledger.decideInvoice({invoiceId:invoice.id,decision:'approved',rationale:'Checked'});
  ledger.registerApprovedDraw({drawId:'approved-draw',approvedAmount:150,invoiceRefs:['R-1']});
  const version=store.save({projectId,expectedVersion:1,state:{...initial.state,ledger:ledger.snapshot()}});
  const request={actor,projectId,expectedVersion:version,drawId:'approved-draw',invoiceId:invoice.id,amount:150};
  const result=service.executeDrawAllocation(request);
  assert.equal(result.version,version+1);
  assert.equal(service.get({actor,projectId}).state.ledger.drawAllocations[0].amount,150);
  assert.throws(()=>service.executeDrawAllocation(request),/state_version_conflict/);
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
