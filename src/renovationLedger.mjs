import { randomUUID } from 'node:crypto';

// Pure domain layer. Persistence and authorization are enforced by the calling service.
const STATES = new Set(['requested','scheduled','passed','failed','canceled']);
const INVOICE_STATES = new Set(['received','disputed','approved','partially_paid','paid','void']);
const TASK_STATES = new Set(['planned','blocked','in_progress','completed','canceled']);
const amount = value => { if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new Error('invalid_amount'); return Math.round(value * 100) / 100; };
const required = (v, error) => { if (typeof v !== 'string' || !v.trim()) throw new Error(error); return v.trim(); };
const date = v => { const d = new Date(v); if (!v || Number.isNaN(d.getTime())) throw new Error('invalid_date'); return d.toISOString(); };

export class RenovationLedger {
  constructor({ projectId, state = null } = {}) {
    this.projectId = required(projectId, 'project_required');
    this.contractors = structuredClone(state?.contractors || []);
    this.invoices = structuredClone(state?.invoices || []);
    this.payments = structuredClone(state?.payments || []);
    this.drawAllocations = structuredClone(state?.drawAllocations || []);
    this.inspections = structuredClone(state?.inspections || []);
    this.tasks = structuredClone(state?.tasks || []);
    this.events = structuredClone(state?.events || []);
  }
  event(type, actor, id) { this.events.push({ id: randomUUID(), type, actor: required(actor,'actor_required'), subjectId: id, at: new Date().toISOString() }); }
  addContractor({ name, trade, actor = 'operator', licenseStatus = 'unverified' }) {
    const record = { id: randomUUID(), name: required(name,'contractor_name_required'), trade: required(trade,'trade_required'), licenseStatus };
    this.contractors.push(record); this.event('contractor_added', actor, record.id); return structuredClone(record);
  }
  addInvoice({ contractorId, reference, total, actor = 'operator' }) {
    if (!this.contractors.some(c => c.id === contractorId)) throw new Error('contractor_not_found');
    const ref = required(reference,'invoice_reference_required');
    if (this.invoices.some(i => i.contractorId === contractorId && i.reference === ref)) throw new Error('duplicate_invoice');
    const record = { id: randomUUID(), contractorId, reference: ref, total: amount(total), paid: 0, status: 'received' };
    this.invoices.push(record); this.event('invoice_received',actor,record.id); return structuredClone(record);
  }
  decideInvoice({ invoiceId, decision, actor = 'operator', rationale }) {
    if (!['approved','disputed','void'].includes(decision)) throw new Error('invalid_invoice_decision');
    required(rationale,'rationale_required');
    const invoice = this.invoices.find(i => i.id === invoiceId);
    if (!invoice) throw new Error('invoice_not_found');
    if (!['received','disputed'].includes(invoice.status)) throw new Error('invoice_decision_not_allowed');
    invoice.status = decision; this.event('invoice_decided',actor,invoice.id); return structuredClone(invoice);
  }
  recordPayment({ invoiceId, amountPaid, actor = 'operator', paymentReference }) {
    const reference = required(paymentReference,'payment_reference_required');
    if (this.payments.some(p => p.reference === reference)) throw new Error('duplicate_payment_reference');
    const invoice = this.invoices.find(i => i.id === invoiceId);
    if (!invoice) throw new Error('invoice_not_found');
    if (!['approved','partially_paid'].includes(invoice.status)) throw new Error('invoice_not_approved');
    const value = amount(amountPaid);
    if (value <= 0 || value > Math.round((invoice.total-invoice.paid)*100)/100) throw new Error('invalid_payment');
    invoice.paid = Math.round((invoice.paid + value)*100)/100;
    invoice.status = invoice.paid === invoice.total ? 'paid' : 'partially_paid';
    this.payments.push({id:randomUUID(),invoiceId:invoice.id,reference,amount:value,actor:required(actor,'actor_required'),at:new Date().toISOString()});
    this.event('payment_recorded',actor,invoice.id);
    return structuredClone(invoice);
  }
  addInspection({ type, dueAt, actor = 'operator' }) {
    const record = { id: randomUUID(), type: required(type,'inspection_type_required'), dueAt: date(dueAt), status: 'requested' };
    this.inspections.push(record); this.event('inspection_added',actor,record.id); return structuredClone(record);
  }
  updateInspection({ inspectionId, status, actor = 'operator', evidenceRef }) {
    if (!STATES.has(status)) throw new Error('invalid_inspection_status');
    const item = this.inspections.find(i => i.id === inspectionId);
    if (!item) throw new Error('inspection_not_found');
    if (['passed','failed'].includes(status)) item.evidenceRef = required(evidenceRef,'inspection_evidence_required');
    item.status = status; this.event('inspection_updated',actor,item.id); return structuredClone(item);
  }
  addTask({ title, startAt, dueAt, dependencies = [], actor = 'operator' }) {
    const start = date(startAt), due = date(dueAt);
    if (due < start) throw new Error('invalid_task_window');
    if (!Array.isArray(dependencies) || dependencies.some(id => !this.tasks.some(t => t.id === id))) throw new Error('invalid_dependencies');
    const record = { id: randomUUID(), title: required(title,'task_title_required'), startAt:start, dueAt:due, dependencies:[...new Set(dependencies)], status:'planned' };
    this.tasks.push(record); this.event('task_added',actor,record.id); return structuredClone(record);
  }
  updateTask({ taskId, status, actor = 'operator', evidenceRef }) {
    if (!TASK_STATES.has(status)) throw new Error('invalid_task_status');
    const task = this.tasks.find(t => t.id === taskId);
    if (!task) throw new Error('task_not_found');
    if (['in_progress','completed'].includes(status) && task.dependencies.some(id => this.tasks.find(t => t.id === id)?.status !== 'completed')) throw new Error('task_dependency_incomplete');
    if (status === 'completed') task.evidenceRef = required(evidenceRef,'completion_evidence_required');
    task.status = status; this.event('task_updated',actor,task.id); return structuredClone(task);
  }
  allocateDraw({drawId,invoiceId,amount:allocationAmount,actor='operator'}) {
    const draw=required(drawId,'draw_required');
    const invoice=this.invoices.find(i=>i.id===invoiceId);
    if (!invoice) throw new Error('invoice_not_found');
    if (!['approved','partially_paid','paid'].includes(invoice.status)) throw new Error('invoice_not_approved');
    const value=amount(allocationAmount);
    if (value<=0) throw new Error('invalid_draw_amount');
    if (this.drawAllocations.some(a=>a.drawId===draw && a.invoiceId===invoiceId)) throw new Error('duplicate_draw_allocation');
    const allocated=this.drawAllocations.filter(a=>a.invoiceId===invoiceId).reduce((s,a)=>s+a.amount,0);
    if (Math.round((allocated+value)*100)>Math.round(invoice.total*100)) throw new Error('draw_exceeds_invoice_balance');
    const record={id:randomUUID(),drawId:draw,invoiceId,amount:value,actor:required(actor,'actor_required'),at:new Date().toISOString()};
    this.drawAllocations.push(record);
    this.event('draw_allocated',actor,invoiceId);
    return structuredClone(record);
  }  reconcilePayments({ bankRecords }) {
    if (!Array.isArray(bankRecords)) throw new Error('bank_records_required');
    const seen = new Set();
    const bank = bankRecords.map(item => {
      const reference = required(item?.reference,'bank_reference_required');
      if (seen.has(reference)) throw new Error('duplicate_bank_reference');
      seen.add(reference);
      return {reference, amount:amount(item.amount)};
    });
    const ledgerByReference = new Map(this.payments.map(item => [item.reference,item]));
    const bankByReference = new Map(bank.map(item => [item.reference,item]));
    const matched = [], amountMismatches = [], unmatchedBank = [], unmatchedLedger = [];
    for (const entry of bank) {
      const local = ledgerByReference.get(entry.reference);
      if (!local) unmatchedBank.push(entry);
      else if (Math.round(local.amount*100) !== Math.round(entry.amount*100)) amountMismatches.push({reference:entry.reference,ledgerAmount:local.amount,bankAmount:entry.amount});
      else matched.push({reference:entry.reference,invoiceId:local.invoiceId,amount:local.amount});
    }
    for (const entry of this.payments) if (!bankByReference.has(entry.reference)) unmatchedLedger.push({reference:entry.reference,invoiceId:entry.invoiceId,amount:entry.amount});
    return {matched,amountMismatches,unmatchedBank,unmatchedLedger,reconciledPaid:Math.round(matched.reduce((s,p)=>s+p.amount,0)*100)/100,verified:amountMismatches.length===0 && unmatchedBank.length===0 && unmatchedLedger.length===0};
  }  snapshot() {
    return structuredClone({ projectId:this.projectId, contractors:this.contractors, invoices:this.invoices, payments:this.payments, drawAllocations:this.drawAllocations, inspections:this.inspections, tasks:this.tasks, events:this.events,
      financials:{ drawAllocated:Math.round(this.drawAllocations.reduce((s,a)=>s+a.amount,0)*100)/100, invoiced: Math.round(this.invoices.filter(i=>i.status!=='void').reduce((s,i)=>s+i.total,0)*100)/100,
        paid: Math.round(this.invoices.reduce((s,i)=>s+i.paid,0)*100)/100 } });
  }
}
