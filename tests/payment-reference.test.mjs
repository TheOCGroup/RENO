import test from 'node:test';
import assert from 'node:assert/strict';
import { RenovationLedger } from '../src/renovationLedger.mjs';

test('payment references are unique across invoices and survive snapshot restore', () => {
  const ledger = new RenovationLedger({projectId:'pay-1'});
  const contractor = ledger.addContractor({name:'Painter',trade:'paint'});
  const first = ledger.addInvoice({contractorId:contractor.id,reference:'A',total:200});
  const second = ledger.addInvoice({contractorId:contractor.id,reference:'B',total:200});
  ledger.decideInvoice({invoiceId:first.id,decision:'approved',rationale:'verified'});
  ledger.decideInvoice({invoiceId:second.id,decision:'approved',rationale:'verified'});
  ledger.recordPayment({invoiceId:first.id,amountPaid:100,paymentReference:'bank-123'});
  assert.throws(()=>ledger.recordPayment({invoiceId:first.id,amountPaid:100,paymentReference:'bank-123'}),/duplicate_payment_reference/);
  assert.throws(()=>ledger.recordPayment({invoiceId:second.id,amountPaid:100,paymentReference:'bank-123'}),/duplicate_payment_reference/);
  const restored = new RenovationLedger({projectId:'pay-1',state:ledger.snapshot()});
  assert.throws(()=>restored.recordPayment({invoiceId:second.id,amountPaid:100,paymentReference:'bank-123'}),/duplicate_payment_reference/);
  assert.equal(restored.snapshot().financials.paid,100);
});
