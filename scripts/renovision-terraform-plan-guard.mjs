// Fail-closed inspection of `terraform show -json <saved-plan>`.
// Reads plan JSON from stdin; never prints plan content or secret values.
import {readFileSync} from 'node:fs';

export function inspectRenovisionPlan(plan, expectedDigest) {
  const reject = reason => ({ok:false, reason});
  if (!/^sha256:[a-f0-9]{64}$/.test(expectedDigest ?? '')) return reject('expected_digest_invalid');
  if (!plan || !Array.isArray(plan.resource_changes)) return reject('resource_changes_missing');
  const changes = plan.resource_changes.filter(c => !c.change?.actions?.every(a => a === 'no-op'));
  if (changes.length !== 1) return reject('unexpected_change_count');
  const [change] = changes;
  if (change.address !== 'google_cloud_run_v2_service.renovision' ||
      JSON.stringify(change.change?.actions) !== JSON.stringify(['update'])) return reject('unexpected_resource_or_action');
  // Terraform may omit unknown planned values from `after`. Never certify a
  // plan with unresolved fields, including unknown image or environment values.
  const hasUnknown = value => value === true || (value && typeof value === 'object' &&
    Object.values(value).some(hasUnknown));
  if (hasUnknown(change.change.after_unknown)) return reject('unknown_planned_values');
  const before = change.change.before;
  const after = change.change.after;
  if (!before || !after) return reject('resource_snapshot_missing');
  const getContainer = service => service.template?.[0]?.containers?.[0] ?? service.template?.containers?.[0];
  const oldContainer = getContainer(before);
  const newContainer = getContainer(after);
  if (!oldContainer || !newContainer) return reject('container_missing');
  if (!newContainer.image?.endsWith('@'+expectedDigest)) return reject('image_digest_mismatch');
  if (oldContainer.image !== newContainer.image) return reject('image_changed');
  const env = newContainer.env;
  if (!Array.isArray(env)) return reject('planned_env_missing');
  const names = env.map(e=>e.name);
  if (names.length !== new Set(names).size) return reject('duplicate_env_names');
  const key = env.find(e=>e.name==='RENOVISION_WEB_API_KEY');
  if (!key || typeof key.value !== 'string' || !key.value.trim()) return reject('web_api_key_absent_or_empty');
  const priorNames = (oldContainer.env ?? []).map(e=>e.name);
  if (priorNames.some(name=>!names.includes(name))) return reject('existing_env_removed');
  // Clone without redacting: redaction would hide unauthorized changes to existing
  // environment variable values. Never print or return the snapshots.
  const oldShape = structuredClone(before);
  const newShape = structuredClone(after);
  // Allow only a web API key env addition or reconciliation; no image, IAM, scaling or ingress drift.
  const oldEnv = getContainer(oldShape).env ?? [];
  const newEnv = getContainer(newShape).env ?? [];
  getContainer(oldShape).env = oldEnv.filter(e=>e.name!=='RENOVISION_WEB_API_KEY').sort((a,b)=>a.name.localeCompare(b.name));
  getContainer(newShape).env = newEnv.filter(e=>e.name!=='RENOVISION_WEB_API_KEY').sort((a,b)=>a.name.localeCompare(b.name));
  if (JSON.stringify(oldShape)!==JSON.stringify(newShape)) return reject('unrelated_service_drift');
  return {ok:true, reason:'single_service_key_reconciliation'};
}

if (process.argv[1] && import.meta.url === new URL('file://' + process.argv[1].replaceAll('\\','/')).href) {
  try {
    const digest = process.argv[2];
    const plan = JSON.parse(readFileSync(0,'utf8'));
    const verdict = inspectRenovisionPlan(plan,digest);
    process.stdout.write(verdict.ok ? 'PLAN_GUARD_PASS\n' : `PLAN_GUARD_FAIL:${verdict.reason}\n`);
    if (!verdict.ok) process.exitCode=1;
  } catch {
    process.stderr.write('PLAN_GUARD_FAIL:invalid_plan_input\n');
    process.exitCode=1;
  }
}
