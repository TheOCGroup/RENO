import test from 'node:test';
import assert from 'node:assert/strict';
import { RenovationLedger } from '../src/renovationLedger.mjs';

test('contractor invoice approvals, partial payments and double-spend guard', () => {
  const ledger = new RenovationLedger({ projectId: 'p1' });
  const contractor = ledger.addContractor({ name:'ABC Roofing', trade:'roofing' });
  const invoice = ledger.addInvoice({ contractorId:contractor.id, reference:'INV-1', total:1200 });
  assert.throws(() => ledger.recordPayment({invoiceId:invoice.id,amountPaid:100,paymentReference:'pay-0'}),/invoice_not_approved/);
  assert.throws(() => ledger.addInvoice({contractorId:contractor.id,reference:'INV-1',total:1200}),/duplicate_invoice/);
  ledger.decideInvoice({invoiceId:invoice.id,decision:'approved',rationale:'verified'});
  assert.equal(ledger.recordPayment({invoiceId:invoice.id,amountPaid:200,paymentReference:'pay-1'}).status,'partially_paid');
  assert.throws(() => ledger.recordPayment({invoiceId:invoice.id,amountPaid:1100,paymentReference:'pay-2'}),/invalid_payment/);
  assert.equal(ledger.recordPayment({invoiceId:invoice.id,amountPaid:1000,paymentReference:'pay-2'}).status,'paid');
  assert.deepEqual(ledger.snapshot().financials,{invoiced:1200,paid:1200});
});
test('inspection requires evidence before marking passed', () => {
  const ledger = new RenovationLedger({projectId:'p2'});
  const inspection = ledger.addInspection({type:'electrical rough-in',dueAt:'2026-11-12'});
  assert.throws(() => ledger.updateInspection({inspectionId:inspection.id,status:'passed'}),/inspection_evidence_required/);
  assert.equal(ledger.updateInspection({inspectionId:inspection.id,status:'passed',evidenceRef:'inspection-doc-1'}).status,'passed');
});
test('task dependencies block premature work and completion requires evidence', () => {
  const ledger = new RenovationLedger({projectId:'p3'});
  const first = ledger.addTask({title:'Electrical',startAt:'2026-11-10',dueAt:'2026-11-12'});
  const second = ledger.addTask({title:'Drywall',startAt:'2026-11-13',dueAt:'2026-11-16',dependencies:[first.id]});
  assert.throws(() => ledger.updateTask({taskId:second.id,status:'in_progress'}),/task_dependency_incomplete/);
  assert.throws(() => ledger.updateTask({taskId:first.id,status:'completed'}),/completion_evidence_required/);
  ledger.updateTask({taskId:first.id,status:'completed',evidenceRef:'photo-1'});
  assert.equal(ledger.updateTask({taskId:second.id,status:'in_progress'}).status,'in_progress');
});
test('snapshots restore independent ledger records', () => {
  const ledger = new RenovationLedger({projectId:'p4'});
  ledger.addContractor({name:'Contractor',trade:'paint'});
  const copy = new RenovationLedger({projectId:'p4',state:ledger.snapshot()});
  assert.equal(copy.contractors.length,1);
  assert.equal(copy.contractors[0].trade,'paint');
});
