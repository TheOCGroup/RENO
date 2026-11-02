import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MissionControlRepository } from '../src/missionControlRepository.mjs';
import { receiveClosedAcquisition } from '../src/missionControlIntake.mjs';

const payload = {
  contractVersion: '1.0', sourceSystem: 'pipeline', targetSystem: 'mission-control',
  opportunityId: 'opp-test', closedAt: '2026-10-01T00:00:00Z',
  acquisition: { purchasePrice: 100000 }, underwriting: { arv: null },
  renovationSeed: { scopeStatus: 'needs_field_validation', projectStatus: 'intake_ready' }
};
test('durable intake survives reopen, deduplicates handoff and isolates tenants', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mission-control-'));
  const databasePath = join(dir, 'projects.sqlite');
  try {
    const a = new MissionControlRepository({ databasePath, tenantId: 'tenant-a' });
    const first = receiveClosedAcquisition({ handoffId: 'handoff-1', payload, repository: a });
    assert.equal(first.duplicate, false);
    assert.equal(a.list().length, 1);
    a.close();
    const reopened = new MissionControlRepository({ databasePath, tenantId: 'tenant-a' });
    const second = receiveClosedAcquisition({ handoffId: 'handoff-1', payload, repository: reopened });
    assert.equal(second.duplicate, true);
    assert.equal(second.project.id, first.project.id);
    reopened.close();
    const other = new MissionControlRepository({ databasePath, tenantId: 'tenant-b' });
    assert.equal(other.list().length, 0);
    assert.equal(other.findBySourceHandoffId('handoff-1'), null);
    assert.equal(receiveClosedAcquisition({ handoffId: 'handoff-1', payload, repository: other }).duplicate, false);
    other.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test('repository refuses missing tenant configuration', () => {
  assert.throws(() => new MissionControlRepository({ databasePath: ':memory:' }), /repository_configuration_required/);
});
