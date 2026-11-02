import test from 'node:test';
import assert from 'node:assert/strict';
import { RenovationLedger } from '../src/renovationLedger.mjs';

test('ledger rejects restoration from another project', () => {
  const source = new RenovationLedger({projectId:'source'});
  assert.throws(() => new RenovationLedger({projectId:'target',state:source.snapshot()}), /ledger_project_mismatch/);
});

test('draw reconciliation prevents unsupported and duplicate invoice allocations', () => {
  const ledger=new RenovationLedger({projectId:'draw-1'});
  const c=ledger.addContractor({name:'Contractor',trade:'roof'});
  const invoice=ledger.addInvoice({contractorId:c.id,reference:'INV-1',total:1000});
  ledger.decideInvoice({invoiceId:invoice.id,decision:'approved',rationale:'verified'});
  assert.throws(()=>ledger.allocateDraw({drawId:'draw-1',invoiceId:invoice.id,amount:1200}),/draw_exceeds_invoice_balance/);
  ledger.allocateDraw({drawId:'draw-1',invoiceId:invoice.id,amount:600});
  assert.throws(()=>ledger.allocateDraw({drawId:'draw-over',invoiceId:invoice.id,amount:500}),/draw_exceeds_invoice_balance/);
  assert.throws(()=>ledger.allocateDraw({drawId:'draw-1',invoiceId:invoice.id,amount:100}),/duplicate_draw_allocation/);
  ledger.allocateDraw({drawId:'draw-2',invoiceId:invoice.id,amount:400});
  assert.equal(ledger.snapshot().financials.drawAllocated,1000);
  assert.equal(ledger.snapshot().drawAllocations.length,2);
});
