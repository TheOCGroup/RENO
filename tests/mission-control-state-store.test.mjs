import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MissionControlStateStore } from '../src/missionControlStateStore.mjs';
import { RenovationLedger } from '../src/renovationLedger.mjs';
import { RenovationWorkflow } from '../src/renovationWorkflow.mjs';

test('renovation workflow and ledger snapshots survive restart with optimistic locking', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ocg-mission-state-'));
  const databasePath = join(dir, 'state.sqlite');
  try {
    const workflow = new RenovationWorkflow({ id: 'project-1', projectStatus:'intake' });
    const ledger = new RenovationLedger({ projectId:'project-1' });
    const contractor = ledger.addContractor({ name:'Electrician',trade:'electrical' });
    const invoice = ledger.addInvoice({ contractorId:contractor.id, reference:'E-1',total:350 });
    ledger.decideInvoice({ invoiceId:invoice.id,decision:'approved',rationale:'verified' });
    ledger.recordPayment({invoiceId:invoice.id,amountPaid:100,paymentReference:'bank-confirmation-1'});
    const inspection = ledger.addInspection({type:'rough-in',dueAt:'2026-11-20'});
    ledger.updateInspection({inspectionId:inspection.id,status:'passed',evidenceRef:'doc-1'});
    const task = ledger.addTask({title:'Rough-in',startAt:'2026-11-12',dueAt:'2026-11-18'});
    ledger.updateTask({taskId:task.id,status:'completed',evidenceRef:'photo-1'});
    const a = new MissionControlStateStore({databasePath,tenantId:'tenant-1'});
    assert.equal(a.save({projectId:'project-1',state:{workflow:workflow.snapshot(),ledger:ledger.snapshot()}}),1);
    a.close();
    const reopened = new MissionControlStateStore({databasePath,tenantId:'tenant-1'});
    const saved = reopened.load('project-1');
    assert.equal(saved.version,1);
    assert.equal(saved.state.workflow.project.id,'project-1');
    assert.equal(saved.state.ledger.financials.paid,100);
    assert.equal(saved.state.ledger.inspections[0].status,'passed');
    assert.equal(saved.state.ledger.tasks[0].status,'completed');
    assert.throws(()=>reopened.save({projectId:'project-1',state:saved.state,expectedVersion:0}),/state_version_conflict/);
    assert.equal(reopened.save({projectId:'project-1',state:saved.state,expectedVersion:1}),2);
    assert.throws(()=>reopened.save({projectId:'project-1',state:saved.state,expectedVersion:1}),/state_version_conflict/);
    reopened.close();
    const other = new MissionControlStateStore({databasePath,tenantId:'tenant-2'});
    assert.equal(other.load('project-1'),null);
    assert.equal(other.list().length,0);
    other.close();
  } finally { rmSync(dir,{recursive:true,force:true}); }
});
