import test from 'node:test';
import assert from 'node:assert/strict';
import { RenovationLedger } from '../src/renovationLedger.mjs';

test('payment reconciliation identifies recorded payment totals and unmatched evidence', () => {
  const ledger=new RenovationLedger({projectId:'reconcile-1'});
  const c=ledger.addContractor({name:'Contractor',trade:'HVAC'});
  const i=ledger.addInvoice({contractorId:c.id,reference:'INV-100',total:800});
  ledger.decideInvoice({invoiceId:i.id,decision:'approved',rationale:'approved invoice'});
  ledger.recordPayment({invoiceId:i.id,amountPaid:300,paymentReference:'BANK-1'});
  const report=ledger.reconcilePayments({bankRecords:[{reference:'BANK-1',amount:300},{reference:'BANK-2',amount:150}]});
  assert.equal(report.matched.length,1);
  assert.equal(report.unmatchedBank.length,1);
  assert.equal(report.unmatchedLedger.length,0);
  assert.equal(report.reconciledPaid,300);
  assert.equal(report.verified,false);
});
test('payment reconciliation rejects incorrect amount and repeated bank reference', () => {
  const ledger=new RenovationLedger({projectId:'reconcile-2'});
  const c=ledger.addContractor({name:'Contractor',trade:'paint'});
  const i=ledger.addInvoice({contractorId:c.id,reference:'INV-101',total:400});
  ledger.decideInvoice({invoiceId:i.id,decision:'approved',rationale:'approved invoice'});
  ledger.recordPayment({invoiceId:i.id,amountPaid:200,paymentReference:'BANK-3'});
  const report=ledger.reconcilePayments({bankRecords:[{reference:'BANK-3',amount:150}]});
  assert.equal(report.amountMismatches.length,1);
  assert.equal(report.verified,false);
  assert.throws(()=>ledger.reconcilePayments({bankRecords:[{reference:'BANK-3',amount:200},{reference:'BANK-3',amount:200}]}),/duplicate_bank_reference/);
});
