import { RenovationLedger } from './renovationLedger.mjs';

// Authorization is explicit and mandatory for every service operation.
// The service persists state only after domain validation succeeds.
export class MissionControlService {
  constructor({ store, authorize }) {
    if (!store?.load || !store?.save || typeof authorize !== 'function') throw new Error('service_configuration_required');
    this.store = store;
    this.authorize = authorize;
  }
  check({ actor, action, projectId }) {
    if (!actor?.id) throw new Error('forbidden');
    const permitted = this.authorize({ actor, action, projectId });
    if (permitted !== true) throw new Error('forbidden');
  }
  initialize({ actor, projectId, workflowSnapshot }) {
    this.check({actor,action:'project:create',projectId});
    if (!workflowSnapshot?.project || workflowSnapshot.project.id !== projectId) throw new Error('workflow_project_mismatch');
    const ledger = new RenovationLedger({projectId});
    const state = {workflow:structuredClone(workflowSnapshot),ledger:ledger.snapshot()};
    return {version:this.store.save({projectId,state,expectedVersion:0}),state};
  }
  get({ actor, projectId }) {
    this.check({actor,action:'project:read',projectId});
    return this.store.load(projectId);
  }
  reconcilePayments({ actor, projectId, bankRecords }) {
    this.check({actor,action:'payments:reconcile',projectId});
    const current = this.store.load(projectId);
    if (!current) throw new Error('project_not_found');
    const ledger = new RenovationLedger({projectId,state:current.state.ledger});
    return {version:current.version,report:ledger.reconcilePayments({bankRecords})};
  }
  execute({ actor, projectId, expectedVersion, operation, args = {} }) {
    if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1) throw new Error('expected_version_required');
    const allowed = new Set(['addContractor','addInvoice','decideInvoice','recordPayment','addInspection','updateInspection','addTask','updateTask']);
    if (!allowed.has(operation)) throw new Error('operation_not_allowed');
    this.check({actor,action:operation,projectId});
    const current = this.store.load(projectId);
    if (!current) throw new Error('project_not_found');
    if (current.version !== expectedVersion) throw new Error('state_version_conflict');
    const ledger = new RenovationLedger({projectId,state:current.state.ledger});
    const result = ledger[operation]({...args,actor:actor.id});
    const state = {...current.state,ledger:ledger.snapshot()};
    const version = this.store.save({projectId,state,expectedVersion});
    return {version,result,state};
  }
}
