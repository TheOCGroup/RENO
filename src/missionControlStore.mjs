import { DatabaseSync } from "node:sqlite";
import { RenovationWorkflow } from "./renovationWorkflow.mjs";
import { RenovationOperations } from "./renovationOperations.mjs";

/**
 * Durable SQLite store for Mission Control.
 *
 * The domain classes (RenovationWorkflow / RenovationOperations) stay
 * in-memory; this store persists their state faithfully so a restart
 * resumes mid-lifecycle:
 *
 * - projects / handoffs / tenants are relational (tenant scoping and
 *   handoff uniqueness are enforced by the schema, not by callers).
 * - workflow + operations collections are JSON documents keyed by
 *   project, each guarded by a monotonically increasing `version`
 *   (optimistic locking: a stale writer fails with `version_conflict`).
 * - events live in an append-only table (UPDATE/DELETE blocked by
 *   triggers). Persist appends only the new tail of a stream's event
 *   history, inside the same transaction as the state save; presenting
 *   a shorter history than the stored one fails with
 *   `event_history_rewrite`.
 *
 * Tenant discipline: every row carries tenant_id and every query
 * filters by it. A cross-tenant read returns null/empty — never
 * another tenant's rows.
 */

export const DEFAULT_TENANT_ID = "default";

const MIGRATIONS = [
  {
    version: 1,
    name: "core_tables",
    up(db) {
      db.exec(`
        CREATE TABLE tenants (
          id TEXT PRIMARY KEY,
          name TEXT,
          created_at TEXT NOT NULL
        );
        CREATE TABLE projects (
          id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL REFERENCES tenants(id),
          source_handoff_id TEXT,
          project_json TEXT NOT NULL,
          stage TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE TABLE handoffs (
          tenant_id TEXT NOT NULL REFERENCES tenants(id),
          source_handoff_id TEXT NOT NULL,
          project_id TEXT NOT NULL REFERENCES projects(id),
          received_at TEXT NOT NULL,
          PRIMARY KEY (tenant_id, source_handoff_id)
        );
        CREATE TABLE workflow_state (
          project_id TEXT PRIMARY KEY REFERENCES projects(id),
          tenant_id TEXT NOT NULL REFERENCES tenants(id),
          version INTEGER NOT NULL,
          state_json TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE TABLE operations_state (
          project_id TEXT PRIMARY KEY REFERENCES projects(id),
          tenant_id TEXT NOT NULL REFERENCES tenants(id),
          version INTEGER NOT NULL,
          state_json TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE TABLE events (
          tenant_id TEXT NOT NULL REFERENCES tenants(id),
          project_id TEXT NOT NULL REFERENCES projects(id),
          stream TEXT NOT NULL CHECK (stream IN ('workflow', 'operations')),
          seq INTEGER NOT NULL,
          id TEXT NOT NULL,
          type TEXT NOT NULL,
          actor TEXT,
          detail_json TEXT,
          occurred_at TEXT NOT NULL,
          PRIMARY KEY (project_id, stream, seq)
        );
        CREATE TRIGGER trg_events_no_update
        BEFORE UPDATE ON events
        BEGIN SELECT RAISE(ABORT, 'events_append_only'); END;
        CREATE TRIGGER trg_events_no_delete
        BEFORE DELETE ON events
        BEGIN SELECT RAISE(ABORT, 'events_append_only'); END;
      `);
    },
  },
  {
    version: 2,
    name: "query_indexes",
    up(db) {
      db.exec(`
        CREATE INDEX idx_projects_tenant_stage ON projects(tenant_id, stage);
        CREATE INDEX idx_events_project_stream ON events(project_id, stream, seq);
        CREATE INDEX idx_workflow_state_tenant ON workflow_state(tenant_id);
        CREATE INDEX idx_operations_state_tenant ON operations_state(tenant_id);
      `);
    },
  },
  {
    version: 3,
    name: "financial_governance",
    up(db) {
      db.exec(`
        CREATE TABLE tenant_roles (
          tenant_id TEXT NOT NULL REFERENCES tenants(id),
          actor_id TEXT NOT NULL,
          role TEXT NOT NULL CHECK (role IN ('operator', 'approver', 'admin')),
          created_at TEXT NOT NULL,
          PRIMARY KEY (tenant_id, actor_id)
        );
        CREATE TABLE invoices (
          id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL REFERENCES tenants(id),
          project_id TEXT NOT NULL REFERENCES projects(id),
          contractor TEXT NOT NULL,
          external_number TEXT NOT NULL,
          total REAL NOT NULL,
          line_items_json TEXT NOT NULL,
          evidence_refs_json TEXT NOT NULL,
          status TEXT NOT NULL CHECK (status IN ('submitted', 'under_review', 'approved', 'rejected')),
          submitted_by TEXT NOT NULL,
          reviewed_by TEXT,
          review_rationale TEXT,
          reviewed_at TEXT,
          version INTEGER NOT NULL DEFAULT 1,
          prior_invoice_id TEXT REFERENCES invoices(id),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          UNIQUE (tenant_id, project_id, contractor, external_number, version)
        );
        CREATE TABLE governed_draws (
          id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL REFERENCES tenants(id),
          project_id TEXT NOT NULL REFERENCES projects(id),
          requested_by TEXT NOT NULL,
          requested_amount REAL NOT NULL,
          approved_amount REAL NOT NULL DEFAULT 0,
          percent_complete REAL NOT NULL,
          retainage_pct REAL NOT NULL,
          evidence_refs_json TEXT NOT NULL,
          invoice_ids_json TEXT NOT NULL,
          reason TEXT NOT NULL,
          status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected', 'reversed')),
          idempotency_key TEXT,
          created_at TEXT NOT NULL,
          UNIQUE (tenant_id, project_id, idempotency_key)
        );
        CREATE TABLE draw_decisions (
          id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL REFERENCES tenants(id),
          project_id TEXT NOT NULL REFERENCES projects(id),
          draw_id TEXT NOT NULL REFERENCES governed_draws(id),
          actor TEXT NOT NULL,
          decision TEXT NOT NULL CHECK (decision IN ('approved', 'rejected', 'reversal')),
          approved_amount REAL,
          rationale TEXT NOT NULL,
          reverses_decision_id TEXT REFERENCES draw_decisions(id),
          created_at TEXT NOT NULL
        );
        CREATE TRIGGER trg_draw_decisions_no_update
        BEFORE UPDATE ON draw_decisions
        BEGIN SELECT RAISE(ABORT, 'draw_decisions_append_only'); END;
        CREATE TRIGGER trg_draw_decisions_no_delete
        BEFORE DELETE ON draw_decisions
        BEGIN SELECT RAISE(ABORT, 'draw_decisions_append_only'); END;
        CREATE TABLE draw_allocations (
          id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL REFERENCES tenants(id),
          project_id TEXT NOT NULL REFERENCES projects(id),
          draw_id TEXT NOT NULL REFERENCES governed_draws(id),
          decision_id TEXT NOT NULL REFERENCES draw_decisions(id),
          invoice_id TEXT NOT NULL REFERENCES invoices(id),
          amount REAL NOT NULL,
          reverses_allocation_id TEXT REFERENCES draw_allocations(id),
          created_at TEXT NOT NULL
        );
        CREATE TABLE payments (
          id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL REFERENCES tenants(id),
          project_id TEXT NOT NULL REFERENCES projects(id),
          draw_id TEXT NOT NULL REFERENCES governed_draws(id),
          amount REAL NOT NULL,
          payment_ref TEXT NOT NULL,
          method TEXT,
          recorded_by TEXT NOT NULL,
          paid_at TEXT NOT NULL,
          idempotency_key TEXT,
          created_at TEXT NOT NULL,
          UNIQUE (tenant_id, payment_ref),
          UNIQUE (tenant_id, project_id, idempotency_key)
        );
        CREATE TABLE reconciliations (
          id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL REFERENCES tenants(id),
          project_id TEXT NOT NULL REFERENCES projects(id),
          payment_id TEXT NOT NULL REFERENCES payments(id),
          caller_record_json TEXT NOT NULL,
          caller_amount REAL NOT NULL,
          payment_amount REAL NOT NULL,
          state TEXT NOT NULL CHECK (state IN ('reconciled', 'mismatch')),
          source TEXT NOT NULL DEFAULT 'caller_reported' CHECK (source = 'caller_reported'),
          bank_verified INTEGER NOT NULL DEFAULT 0 CHECK (bank_verified = 0),
          recorded_by TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
        CREATE TABLE financial_audit (
          tenant_id TEXT NOT NULL REFERENCES tenants(id),
          project_id TEXT NOT NULL REFERENCES projects(id),
          seq INTEGER NOT NULL,
          id TEXT NOT NULL,
          event_type TEXT NOT NULL,
          actor TEXT,
          entity_type TEXT NOT NULL,
          entity_id TEXT NOT NULL,
          payload_json TEXT NOT NULL,
          prev_hash TEXT NOT NULL,
          hash TEXT NOT NULL,
          created_at TEXT NOT NULL,
          PRIMARY KEY (project_id, seq)
        );
        CREATE INDEX idx_invoices_project ON invoices(tenant_id, project_id, status);
        CREATE INDEX idx_governed_draws_project ON governed_draws(tenant_id, project_id, status);
        CREATE INDEX idx_draw_allocations_invoice ON draw_allocations(invoice_id);
        CREATE INDEX idx_payments_draw ON payments(draw_id);
        CREATE INDEX idx_financial_audit_project ON financial_audit(project_id, seq);
      `);
    },
  },
  {
    version: 4,
    name: "operations_completion",
    up(db) {
      db.exec(`
        CREATE TABLE inspections (
          id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL REFERENCES tenants(id),
          project_id TEXT NOT NULL REFERENCES projects(id),
          type TEXT NOT NULL,
          scheduled_for TEXT NOT NULL,
          inspector_ref TEXT NOT NULL,
          status TEXT NOT NULL CHECK (status IN ('scheduled', 'passed', 'corrections_required', 'corrections_complete', 'cancelled')),
          outcome TEXT CHECK (outcome IN ('passed', 'failed')),
          outcome_evidence_ref TEXT,
          outcome_recorded_by TEXT,
          outcome_at TEXT,
          supersedes_id TEXT REFERENCES inspections(id),
          version INTEGER NOT NULL DEFAULT 1,
          created_by TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE TABLE inspection_corrections (
          id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL REFERENCES tenants(id),
          project_id TEXT NOT NULL REFERENCES projects(id),
          inspection_id TEXT NOT NULL REFERENCES inspections(id),
          description TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'complete')),
          evidence_ref TEXT,
          completed_by TEXT,
          completed_at TEXT,
          created_at TEXT NOT NULL
        );
        CREATE TABLE permits (
          id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL REFERENCES tenants(id),
          project_id TEXT NOT NULL REFERENCES projects(id),
          jurisdiction TEXT NOT NULL,
          permit_number TEXT NOT NULL,
          type TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'recorded' CHECK (status IN ('recorded', 'applied', 'issued', 'expired', 'closed', 'unknown')),
          issued_on TEXT,
          expires_on TEXT,
          evidence_ref TEXT,
          version INTEGER NOT NULL DEFAULT 1,
          created_by TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE TABLE materials (
          id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL REFERENCES tenants(id),
          project_id TEXT NOT NULL REFERENCES projects(id),
          scope_item_id TEXT,
          description TEXT NOT NULL,
          quantity REAL NOT NULL,
          unit TEXT NOT NULL,
          unit_cost REAL,
          status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'ordered', 'received', 'returned')),
          evidence_ref TEXT,
          created_by TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE TABLE schedule_tasks (
          id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL REFERENCES tenants(id),
          project_id TEXT NOT NULL REFERENCES projects(id),
          title TEXT NOT NULL,
          stage TEXT,
          starts_on TEXT NOT NULL,
          due_on TEXT NOT NULL,
          depends_on_json TEXT NOT NULL DEFAULT '[]',
          status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'done', 'blocked')),
          version INTEGER NOT NULL DEFAULT 1,
          completed_at TEXT,
          created_by TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE TABLE contractors (
          id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL REFERENCES tenants(id),
          name TEXT NOT NULL,
          trades_json TEXT NOT NULL DEFAULT '[]',
          contact_json TEXT,
          scorecard_name TEXT NOT NULL,
          created_by TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          UNIQUE (tenant_id, name)
        );
        CREATE TABLE contractor_compliance (
          id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL REFERENCES tenants(id),
          contractor_id TEXT NOT NULL REFERENCES contractors(id),
          kind TEXT NOT NULL,
          ref TEXT NOT NULL,
          expires_on TEXT,
          recorded_by TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
        CREATE INDEX idx_inspections_project ON inspections(tenant_id, project_id, status);
        CREATE INDEX idx_corrections_inspection ON inspection_corrections(inspection_id);
        CREATE INDEX idx_permits_project ON permits(tenant_id, project_id);
        CREATE INDEX idx_materials_project ON materials(tenant_id, project_id);
        CREATE INDEX idx_schedule_tasks_project ON schedule_tasks(tenant_id, project_id);
        CREATE INDEX idx_contractors_tenant ON contractors(tenant_id);
        CREATE INDEX idx_compliance_contractor ON contractor_compliance(tenant_id, contractor_id);
      `);
    },
  },
];

export const CURRENT_SCHEMA_VERSION = MIGRATIONS.at(-1).version;
export const SCHEMA_MIGRATIONS = Object.freeze(MIGRATIONS.map(({ version, name }) => Object.freeze({ version, name })));

const isoNow = () => new Date().toISOString();

export class MissionControlStore {
  #db;
  #workflowTenants = new WeakMap();
  #workflowVersions = new WeakMap();
  #operationsTenants = new WeakMap();
  #operationsVersions = new WeakMap();

  constructor(path, { tenantId = DEFAULT_TENANT_ID } = {}) {
    if (!path) throw new Error("store_path_required");
    this.path = path;
    this.defaultTenantId = tenantId;
    this.#db = new DatabaseSync(path);
    try {
      this.#db.exec("PRAGMA foreign_keys = ON");
      this.#migrate();
      this.ensureTenant(this.defaultTenantId);
    } catch (err) {
      // Construction failed after the database handle was opened: close it
      // before rethrowing, or the handle leaks until GC and the file stays
      // locked (on Windows a later cleanup delete then fails with EPERM).
      try { this.#db.close(); } catch { /* never mask the original error */ }
      throw err;
    }
  }

  close() {
    this.#db.close();
  }

  get db() {
    return this.#db;
  }

  schemaVersion() {
    const row = this.#db.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get();
    return row ? Number(row.value) : 0;
  }

  #migrate() {
    this.#db.exec("CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
    let current = this.schemaVersion();
    for (const migration of MIGRATIONS) {
      if (migration.version <= current) continue;
      this.#db.exec("BEGIN");
      try {
        migration.up(this.#db);
        this.#db.prepare("INSERT INTO meta (key, value) VALUES ('schema_version', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(String(migration.version));
        this.#db.exec("COMMIT");
        current = migration.version;
      } catch (error) {
        this.#db.exec("ROLLBACK");
        throw error;
      }
    }
  }

  #tx(fn) {
    this.#db.exec("BEGIN");
    try {
      const result = fn();
      this.#db.exec("COMMIT");
      return result;
    } catch (error) {
      this.#db.exec("ROLLBACK");
      throw error;
    }
  }

  // --- tenants -----------------------------------------------------------

  ensureTenant(tenantId, name = null) {
    if (!String(tenantId || "").trim()) throw new Error("tenant_id_required");
    this.#db.prepare("INSERT INTO tenants (id, name, created_at) VALUES (?, ?, ?) ON CONFLICT(id) DO NOTHING").run(tenantId, name, isoNow());
    return tenantId;
  }

  // --- projects & handoffs (intake repository contract) ------------------

  /**
   * The repository contract missionControlIntake expects:
   *   findBySourceHandoffId(id) -> project|null
   *   insert(project) -> persisted project
   * bound to one tenant.
   */
  intakeRepository(tenantId = this.defaultTenantId) {
    const store = this;
    return {
      findBySourceHandoffId(id) { return store.findProjectBySourceHandoffId(id, tenantId); },
      insert(project) { return store.createProject(project, tenantId); },
    };
  }

  createProject(seed, tenantId = this.defaultTenantId) {
    if (!seed?.id) throw new Error("project_required");
    this.ensureTenant(tenantId);
    const now = isoNow();
    return this.#tx(() => {
      try {
        this.#db.prepare("INSERT INTO projects (id, tenant_id, source_handoff_id, project_json, stage, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
          .run(seed.id, tenantId, seed.sourceHandoffId || null, JSON.stringify(seed), seed.stage || seed.projectStatus || "intake", seed.createdAt || now, now);
      } catch (error) {
        if (/UNIQUE constraint failed: projects\.id/.test(error.message)) throw new Error("duplicate_project");
        throw error;
      }
      if (seed.sourceHandoffId) {
        try {
          this.#db.prepare("INSERT INTO handoffs (tenant_id, source_handoff_id, project_id, received_at) VALUES (?, ?, ?, ?)")
            .run(tenantId, seed.sourceHandoffId, seed.id, now);
        } catch (error) {
          if (/UNIQUE constraint failed/.test(error.message)) throw new Error("duplicate_source_handoff");
          throw error;
        }
      }
      this.#db.prepare("INSERT INTO workflow_state (project_id, tenant_id, version, state_json, updated_at) VALUES (?, ?, 1, ?, ?)")
        .run(seed.id, tenantId, JSON.stringify({ scopeItems: [], bids: [], changeOrders: [], punchItems: [] }), now);
      return structuredClone(seed);
    });
  }

  getProject(projectId, tenantId = this.defaultTenantId) {
    const row = this.#db.prepare("SELECT project_json FROM projects WHERE id = ? AND tenant_id = ?").get(projectId, tenantId);
    return row ? JSON.parse(row.project_json) : null;
  }

  listProjects(tenantId = this.defaultTenantId) {
    return this.#db.prepare("SELECT project_json FROM projects WHERE tenant_id = ? ORDER BY created_at, id").all(tenantId)
      .map(row => JSON.parse(row.project_json));
  }

  findProjectBySourceHandoffId(sourceHandoffId, tenantId = this.defaultTenantId) {
    const row = this.#db.prepare("SELECT project_id FROM handoffs WHERE tenant_id = ? AND source_handoff_id = ?").get(tenantId, sourceHandoffId);
    return row ? this.getProject(row.project_id, tenantId) : null;
  }

  // --- generic versioned-document save (the optimistic-locking core) -----

  #saveState({ table, stream, projectId, tenantId, state, expectedVersion, collections }) {
    const projectRow = this.#db.prepare("SELECT tenant_id FROM projects WHERE id = ?").get(projectId);
    if (!projectRow) throw new Error("project_not_found");
    if (projectRow.tenant_id !== tenantId) throw new Error("project_not_found");
    return this.#tx(() => {
      const existing = this.#db.prepare(`SELECT version FROM ${table} WHERE project_id = ? AND tenant_id = ?`).get(projectId, tenantId);
      let newVersion;
      if (!existing) {
        if (expectedVersion !== 0) throw new Error("version_conflict");
        newVersion = 1;
        this.#db.prepare(`INSERT INTO ${table} (project_id, tenant_id, version, state_json, updated_at) VALUES (?, ?, 1, ?, ?)`)
          .run(projectId, tenantId, JSON.stringify(collections), isoNow());
      } else {
        if (expectedVersion !== existing.version) throw new Error("version_conflict");
        newVersion = existing.version + 1;
        const result = this.#db.prepare(`UPDATE ${table} SET version = ?, state_json = ?, updated_at = ? WHERE project_id = ? AND tenant_id = ? AND version = ?`)
          .run(newVersion, JSON.stringify(collections), isoNow(), projectId, tenantId, existing.version);
        if (result.changes !== 1) throw new Error("version_conflict");
      }
      this.#appendEvents(projectId, tenantId, stream, state.events || []);
      // keep the projects row's document + stage in step with the workflow save
      if (table === "workflow_state") {
        this.#db.prepare("UPDATE projects SET project_json = ?, stage = ?, updated_at = ? WHERE id = ? AND tenant_id = ?")
          .run(JSON.stringify(state.project), state.project.stage || state.project.projectStatus || "intake", isoNow(), projectId, tenantId);
      }
      return newVersion;
    });
  }

  #appendEvents(projectId, tenantId, stream, events) {
    const row = this.#db.prepare("SELECT COUNT(*) AS c FROM events WHERE project_id = ? AND stream = ?").get(projectId, stream);
    const stored = row.c;
    if (events.length < stored) throw new Error("event_history_rewrite");
    const insert = this.#db.prepare("INSERT INTO events (tenant_id, project_id, stream, seq, id, type, actor, detail_json, occurred_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
    for (let i = stored; i < events.length; i++) {
      const event = events[i];
      insert.run(tenantId, projectId, stream, i + 1, event.id, event.type, event.actor ?? null, event.detail === undefined ? null : JSON.stringify(event.detail), event.occurredAt);
    }
  }

  #loadEvents(projectId, stream) {
    return this.#db.prepare("SELECT id, type, actor, detail_json, occurred_at FROM events WHERE project_id = ? AND stream = ? ORDER BY seq")
      .all(projectId, stream)
      .map(row => ({ id: row.id, type: row.type, actor: row.actor, detail: row.detail_json === null ? null : JSON.parse(row.detail_json), occurredAt: row.occurred_at }));
  }

  // --- workflow state ------------------------------------------------------

  /**
   * Low-level versioned save. `state` is { project, scopeItems, bids,
   * changeOrders, punchItems, events }; returns the new version.
   * Throws `version_conflict` when expectedVersion is stale.
   */
  saveWorkflowState(projectId, state, expectedVersion, tenantId = this.defaultTenantId) {
    if (!state?.project?.id || state.project.id !== projectId) throw new Error("project_required");
    const { scopeItems = [], bids = [], changeOrders = [], punchItems = [] } = state;
    return this.#saveState({ table: "workflow_state", stream: "workflow", projectId, tenantId, state, expectedVersion, collections: { scopeItems, bids, changeOrders, punchItems } });
  }

  loadWorkflowState(projectId, tenantId = this.defaultTenantId) {
    const row = this.#db.prepare("SELECT version, state_json FROM workflow_state WHERE project_id = ? AND tenant_id = ?").get(projectId, tenantId);
    if (!row) return null;
    const project = this.getProject(projectId, tenantId);
    if (!project) return null;
    const collections = JSON.parse(row.state_json);
    return { version: row.version, state: { project, ...collections, events: this.#loadEvents(projectId, "workflow") } };
  }

  workflowVersion(projectId, tenantId = this.defaultTenantId) {
    const row = this.#db.prepare("SELECT version FROM workflow_state WHERE project_id = ? AND tenant_id = ?").get(projectId, tenantId);
    return row ? row.version : 0;
  }

  // --- operations state ----------------------------------------------------

  /**
   * Low-level versioned save. `state` is { progressUpdates, drawRequests,
   * contractorScorecards, events }; returns the new version.
   */
  saveOperationsState(projectId, state, expectedVersion, tenantId = this.defaultTenantId) {
    const { progressUpdates = [], drawRequests = [], contractorScorecards = [] } = state || {};
    return this.#saveState({ table: "operations_state", stream: "operations", projectId, tenantId, state: state || {}, expectedVersion, collections: { progressUpdates, drawRequests, contractorScorecards } });
  }

  loadOperationsState(projectId, tenantId = this.defaultTenantId) {
    const row = this.#db.prepare("SELECT version, state_json FROM operations_state WHERE project_id = ? AND tenant_id = ?").get(projectId, tenantId);
    if (!row) return null;
    return { version: row.version, state: { ...JSON.parse(row.state_json), events: this.#loadEvents(projectId, "operations") } };
  }

  operationsVersion(projectId, tenantId = this.defaultTenantId) {
    const row = this.#db.prepare("SELECT version FROM operations_state WHERE project_id = ? AND tenant_id = ?").get(projectId, tenantId);
    return row ? row.version : 0;
  }

  // --- domain-class round-trip --------------------------------------------

  /**
   * Persist a RenovationWorkflow instance. Version resolution order:
   * explicit `expectedVersion` option, then the version tracked when
   * this store created/restored/last persisted the instance, then —
   * only when no row exists yet — a first save (the project row is
   * created from workflow.project if necessary). An untracked instance
   * over an existing row fails with `version_untracked`.
   */
  persistWorkflow(workflow, { tenantId, expectedVersion } = {}) {
    if (!workflow?.project?.id) throw new Error("renovation_workflow_required");
    const projectId = workflow.project.id;
    const tenant = tenantId || this.#workflowTenants.get(workflow) || this.defaultTenantId;
    let expected = expectedVersion;
    if (expected === undefined) {
      const tracked = this.#workflowVersions.get(workflow);
      if (tracked !== undefined) expected = tracked;
      else if (this.workflowVersion(projectId, tenant) > 0) throw new Error("version_untracked");
      else {
        if (!this.getProject(projectId, tenant)) this.createProject(structuredClone(workflow.project), tenant);
        expected = this.workflowVersion(projectId, tenant);
      }
    }
    const state = {
      project: structuredClone(workflow.project),
      scopeItems: structuredClone(workflow.scopeItems),
      bids: structuredClone(workflow.bids),
      changeOrders: structuredClone(workflow.changeOrders),
      punchItems: structuredClone(workflow.punchItems),
      events: structuredClone(workflow.events),
    };
    const version = this.saveWorkflowState(projectId, state, expected, tenant);
    this.#workflowTenants.set(workflow, tenant);
    this.#workflowVersions.set(workflow, version);
    return version;
  }

  restoreWorkflow(projectId, { tenantId } = {}) {
    const tenant = tenantId || this.defaultTenantId;
    const loaded = this.loadWorkflowState(projectId, tenant);
    if (!loaded) return null;
    const { state } = loaded;
    const workflow = new RenovationWorkflow(structuredClone(state.project));
    workflow.scopeItems = structuredClone(state.scopeItems);
    workflow.bids = structuredClone(state.bids);
    workflow.changeOrders = structuredClone(state.changeOrders);
    workflow.punchItems = structuredClone(state.punchItems);
    workflow.events = structuredClone(state.events);
    this.#workflowTenants.set(workflow, tenant);
    this.#workflowVersions.set(workflow, loaded.version);
    return workflow;
  }

  persistOperations(operations, { tenantId, expectedVersion } = {}) {
    if (!operations?.workflow?.project?.id) throw new Error("renovation_operations_required");
    const projectId = operations.workflow.project.id;
    const tenant = tenantId || this.#operationsTenants.get(operations) || this.#workflowTenants.get(operations.workflow) || this.defaultTenantId;
    if (!this.getProject(projectId, tenant)) throw new Error("project_not_found");
    let expected = expectedVersion;
    if (expected === undefined) {
      const tracked = this.#operationsVersions.get(operations);
      if (tracked !== undefined) expected = tracked;
      else if (this.operationsVersion(projectId, tenant) > 0) throw new Error("version_untracked");
      else expected = 0;
    }
    const state = {
      progressUpdates: structuredClone(operations.progressUpdates),
      drawRequests: structuredClone(operations.drawRequests),
      contractorScorecards: structuredClone(operations.contractorScorecards),
      events: structuredClone(operations.events),
    };
    const version = this.saveOperationsState(projectId, state, expected, tenant);
    this.#operationsTenants.set(operations, tenant);
    this.#operationsVersions.set(operations, version);
    return version;
  }

  restoreOperations(workflow, { tenantId } = {}) {
    if (!workflow?.project?.id) throw new Error("renovation_workflow_required");
    const tenant = tenantId || this.#workflowTenants.get(workflow) || this.defaultTenantId;
    const operations = new RenovationOperations(workflow);
    const loaded = this.loadOperationsState(workflow.project.id, tenant);
    if (loaded) {
      operations.progressUpdates = structuredClone(loaded.state.progressUpdates);
      operations.drawRequests = structuredClone(loaded.state.drawRequests);
      operations.contractorScorecards = structuredClone(loaded.state.contractorScorecards);
      operations.events = structuredClone(loaded.state.events);
    }
    this.#operationsTenants.set(operations, tenant);
    this.#operationsVersions.set(operations, loaded ? loaded.version : 0);
    return operations;
  }
}
