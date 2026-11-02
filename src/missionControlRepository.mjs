import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export class MissionControlRepository {
  constructor({ databasePath, tenantId }) {
    if (!databasePath || !String(tenantId || '').trim()) throw new Error('repository_configuration_required');
    if (databasePath !== ':memory:') mkdirSync(dirname(databasePath), { recursive: true });
    this.tenantId = String(tenantId);
    this.db = new DatabaseSync(databasePath);
    this.db.exec('CREATE TABLE IF NOT EXISTS mission_projects (tenant_id TEXT NOT NULL, project_id TEXT NOT NULL, handoff_id TEXT NOT NULL, payload_json TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY (tenant_id, project_id), UNIQUE (tenant_id, handoff_id))');
  }
  findBySourceHandoffId(id) {
    const row = this.db.prepare('SELECT payload_json FROM mission_projects WHERE tenant_id=? AND handoff_id=?').get(this.tenantId, String(id));
    return row ? JSON.parse(row.payload_json) : null;
  }
  insert(project) {
    if (!project?.id || !project?.sourceHandoffId) throw new Error('invalid_project');
    this.db.prepare('INSERT INTO mission_projects (tenant_id,project_id,handoff_id,payload_json,created_at) VALUES (?,?,?,?,?)').run(this.tenantId, project.id, project.sourceHandoffId, JSON.stringify(project), new Date().toISOString());
    return structuredClone(project);
  }
  list() {
    return this.db.prepare('SELECT payload_json FROM mission_projects WHERE tenant_id=? ORDER BY created_at, project_id').all(this.tenantId).map(row => JSON.parse(row.payload_json));
  }
  close() { this.db.close(); }
}
