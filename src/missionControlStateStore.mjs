import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

// Persisted, tenant-scoped snapshots for existing workflow and ledger domain objects.
// No HTTP or payment permissions are granted by this storage adapter.
export class MissionControlStateStore {
  constructor({ databasePath, tenantId }) {
    if (!databasePath || !String(tenantId || '').trim()) throw new Error('store_configuration_required');
    if (databasePath !== ':memory:') mkdirSync(dirname(databasePath), { recursive: true });
    this.tenantId = String(tenantId);
    this.db = new DatabaseSync(databasePath);
    this.db.exec('CREATE TABLE IF NOT EXISTS mission_state (tenant_id TEXT NOT NULL, project_id TEXT NOT NULL, version INTEGER NOT NULL, state_json TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY(tenant_id, project_id))');
  }
  load(projectId) {
    const row = this.db.prepare('SELECT version, state_json FROM mission_state WHERE tenant_id=? AND project_id=?').get(this.tenantId, String(projectId));
    return row ? { version: row.version, state: JSON.parse(row.state_json) } : null;
  }
  save({ projectId, state, expectedVersion = 0 }) {
    if (!String(projectId || '').trim() || !state || typeof state !== 'object' || Array.isArray(state)) throw new Error('invalid_state');
    if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0) throw new Error('invalid_expected_version');
    const json = JSON.stringify(state);
    const now = new Date().toISOString();
    if (expectedVersion === 0) {
      const result = this.db.prepare('INSERT OR IGNORE INTO mission_state(tenant_id,project_id,version,state_json,updated_at) VALUES(?,?,1,?,?)').run(this.tenantId,projectId,json,now);
      if (result.changes !== 1) throw new Error('state_version_conflict');
      return 1;
    }
    const result = this.db.prepare('UPDATE mission_state SET version=version+1,state_json=?,updated_at=? WHERE tenant_id=? AND project_id=? AND version=?').run(json,now,this.tenantId,projectId,expectedVersion);
    if (result.changes !== 1) throw new Error('state_version_conflict');
    return expectedVersion + 1;
  }
  list() {
    return this.db.prepare('SELECT project_id,version,updated_at FROM mission_state WHERE tenant_id=? ORDER BY project_id').all(this.tenantId);
  }
  close() { this.db.close(); }
}
