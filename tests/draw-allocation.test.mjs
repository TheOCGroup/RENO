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

test('overlapping draw approvals cannot reserve more than invoice total', () => {
  const ledger=new RenovationLedger({projectId:'reservation-test'});
  const contractor=ledger.addContractor({name:'Builder',trade:'roof'});
  const invoice=ledger.addInvoice({contractorId:contractor.id,reference:'RES-1',total:100});
  ledger.decideInvoice({invoiceId:invoice.id,decision:'approved',rationale:'Reviewed'});
  ledger.registerApprovedDraw({drawId:'first',approvedAmount:80,invoiceRefs:['RES-1']});
  assert.throws(()=>ledger.registerApprovedDraw({drawId:'second',approvedAmount:30,invoiceRefs:['RES-1']}),/draw_exceeds_invoice_authority/);
  assert.equal(ledger.snapshot().drawApprovals.length,1);
});

test('outstanding draw reservation survives ledger restoration', () => {
  const ledger=new RenovationLedger({projectId:'reservation-restart'});
  const contractor=ledger.addContractor({name:'Builder',trade:'roof'});
  const invoice=ledger.addInvoice({contractorId:contractor.id,reference:'RESTART-1',total:100});
  ledger.decideInvoice({invoiceId:invoice.id,decision:'approved',rationale:'Reviewed'});
  ledger.registerApprovedDraw({drawId:'first',approvedAmount:80,invoiceRefs:['RESTART-1']});
  const restored=new RenovationLedger({projectId:'reservation-restart',state:ledger.snapshot()});
  assert.throws(()=>restored.registerApprovedDraw({drawId:'second',approvedAmount:30,invoiceRefs:['RESTART-1']}),/draw_exceeds_invoice_authority/);
  restored.registerApprovedDraw({drawId:'remaining',approvedAmount:20,invoiceRefs:['RESTART-1']});
  assert.equal(restored.snapshot().drawApprovals.length,2);
});

test('draw approval cannot exceed total remaining invoice authority', () => {
  const ledger=new RenovationLedger({projectId:'invoice-cap'});
  const contractor=ledger.addContractor({name:'Contractor',trade:'roof'});
  const invoice=ledger.addInvoice({contractorId:contractor.id,reference:'CAP-1',total:100});
  ledger.decideInvoice({invoiceId:invoice.id,decision:'approved',rationale:'Reviewed'});
  assert.throws(()=>ledger.registerApprovedDraw({drawId:'too-large',approvedAmount:101,invoiceRefs:['CAP-1']}),/draw_exceeds_invoice_authority/);
  assert.equal(ledger.snapshot().drawApprovals.length,0);
});

test('approved draw binds invoice identity even if another contractor reuses reference', () => {
  const ledger=new RenovationLedger({projectId:'identity'});
  const a=ledger.addContractor({name:'A',trade:'roof'});
  const first=ledger.addInvoice({contractorId:a.id,reference:'REF',total:100});
  ledger.decideInvoice({invoiceId:first.id,decision:'approved',rationale:'Reviewed'});
  ledger.registerApprovedDraw({drawId:'draw',approvedAmount:100,invoiceRefs:['REF']});
  const b=ledger.addContractor({name:'B',trade:'paint'});
  const second=ledger.addInvoice({contractorId:b.id,reference:'REF',total:100});
  ledger.decideInvoice({invoiceId:second.id,decision:'approved',rationale:'Reviewed'});
  assert.throws(()=>ledger.allocateDraw({drawId:'draw',invoiceId:second.id,amount:100}),/invoice_not_in_approved_draw/);
  ledger.allocateDraw({drawId:'draw',invoiceId:first.id,amount:100});
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
  assert.throws(()=>ledger.registerApprovedDraw({drawId:'draw-over',approvedAmount:500,invoiceRefs:['INV-1']}),/draw_exceeds_invoice_authority/);
  assert.throws(()=>ledger.allocateDraw({drawId:'draw-1',invoiceId:invoice.id,amount:100}),/duplicate_draw_allocation/);
  ledger.registerApprovedDraw({drawId:'draw-2',approvedAmount:400,invoiceRefs:['INV-1']});
  ledger.allocateDraw({drawId:'draw-2',invoiceId:invoice.id,amount:400});
  assert.equal(ledger.snapshot().financials.drawAllocated,1000);
  assert.equal(ledger.snapshot().drawAllocations.length,2);
});
