import test from 'node:test';
import assert from 'node:assert/strict';
import { RenovationLedger } from '../src/renovationLedger.mjs';

test('ledger rejects restoration from another project', () => {
  const source = new RenovationLedger({projectId:'source'});
  assert.throws(() => new RenovationLedger({projectId:'target',state:source.snapshot()}), /ledger_project_mismatch/);
});

test('draw approval rejects ambiguous invoice references across contractors', () => {
  const ledger = new RenovationLedger({projectId:'ambiguous'});
  for (const name of ['Alpha','Beta']) {
    const contractor=ledger.addContractor({name,trade:'roof'});
    const invoice=ledger.addInvoice({contractorId:contractor.id,reference:'SAME-REF',total:100});
    ledger.decideInvoice({invoiceId:invoice.id,decision:'approved',rationale:'Reviewed'});
  }
  assert.throws(()=>ledger.registerApprovedDraw({drawId:'draw-x',approvedAmount:100,invoiceRefs:['SAME-REF']}),/ambiguous_invoice_reference/);
  assert.equal(ledger.snapshot().drawApprovals.length,0);
});

test('approved draw authority persists and constrains invoice allocation', () => {
  const ledger=new RenovationLedger({projectId:'draw-persist'});
  const contractor=ledger.addContractor({name:'Contractor',trade:'roof'});
  const invoice=ledger.addInvoice({contractorId:contractor.id,reference:'INV-P',total:1000});
  ledger.decideInvoice({invoiceId:invoice.id,decision:'approved',rationale:'Reviewed'});
  ledger.registerApprovedDraw({drawId:'draw-p',approvedAmount:700,invoiceRefs:['INV-P']});
  assert.throws(()=>ledger.allocateDraw({drawId:'draw-p',invoiceId:invoice.id,amount:701}),/draw_exceeds_approved_amount/);
  const restored=new RenovationLedger({projectId:'draw-persist',state:ledger.snapshot()});
  restored.allocateDraw({drawId:'draw-p',invoiceId:invoice.id,amount:700});
  assert.equal(restored.snapshot().drawApprovals[0].allocatedAmount,700);
  assert.throws(()=>restored.allocateDraw({drawId:'draw-p',invoiceId:invoice.id,amount:1}),/duplicate_draw_allocation/);
});

test('draw reconciliation prevents unsupported and duplicate invoice allocations', () => {
  const ledger=new RenovationLedger({projectId:'draw-1'});
  const c=ledger.addContractor({name:'Contractor',trade:'roof'});
  const invoice=ledger.addInvoice({contractorId:c.id,reference:'INV-1',total:1000});
  ledger.decideInvoice({invoiceId:invoice.id,decision:'approved',rationale:'verified'});
  assert.throws(()=>ledger.allocateDraw({drawId:'draw-1',invoiceId:invoice.id,amount:100}),/draw_not_approved/);
  ledger.registerApprovedDraw({drawId:'draw-1',approvedAmount:600,invoiceRefs:['INV-1']});
  assert.throws(()=>ledger.allocateDraw({drawId:'draw-1',invoiceId:invoice.id,amount:1200}),/draw_exceeds_invoice_balance/);
  ledger.allocateDraw({drawId:'draw-1',invoiceId:invoice.id,amount:600});
  ledger.registerApprovedDraw({drawId:'draw-over',approvedAmount:500,invoiceRefs:['INV-1']});
  assert.throws(()=>ledger.allocateDraw({drawId:'draw-over',invoiceId:invoice.id,amount:500}),/draw_exceeds_invoice_balance/);
  assert.throws(()=>ledger.allocateDraw({drawId:'draw-1',invoiceId:invoice.id,amount:100}),/duplicate_draw_allocation/);
  ledger.registerApprovedDraw({drawId:'draw-2',approvedAmount:400,invoiceRefs:['INV-1']});
  ledger.allocateDraw({drawId:'draw-2',invoiceId:invoice.id,amount:400});
  assert.equal(ledger.snapshot().financials.drawAllocated,1000);
  assert.equal(ledger.snapshot().drawAllocations.length,2);
});
