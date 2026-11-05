import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectRenovisionPlan} from '../scripts/renovision-terraform-plan-guard.mjs';
const digest='sha256:'+'a'.repeat(64);
const service=()=>({name:'renovision',ingress:'INGRESS_TRAFFIC_ALL',template:[{service_account:'renovision-runtime@example.test',containers:[{image:'repo/renovision@'+digest,env:[{name:'RENOVISION_GCS_BUCKET',value:'bucket'},{name:'RENOVISION_WEB_API_KEY',value:'synthetic-test-only'}]}]}]});
const plan=()=>({resource_changes:[{address:'google_cloud_run_v2_service.renovision',change:{actions:['update'],before:service(),after:service()}}]});
test('accepts only a key-only reconciliation without disclosing value',()=>{
 const p=plan();p.resource_changes[0].change.before.template[0].containers[0].env.pop();
 assert.deepEqual(inspectRenovisionPlan(p,digest),{ok:true,reason:'single_service_key_reconciliation'});
});
test('rejects missing key, empty key, image drift, ingress drift, extra resources and destruction',()=>{
 for(const change of [
   p=>p.resource_changes[0].change.after.template[0].containers[0].env.pop(),
   p=>p.resource_changes[0].change.after.template[0].containers[0].env[1].value='',
   p=>p.resource_changes[0].change.after.template[0].containers[0].image='repo/renovision@sha256:'+'b'.repeat(64),
   p=>p.resource_changes[0].change.after.ingress='INGRESS_TRAFFIC_INTERNAL_ONLY',
   p=>p.resource_changes.push({address:'google_storage_bucket.evidence',change:{actions:['delete']}}),
   p=>p.resource_changes[0].change.actions=['delete'],
 ]) {const p=plan();change(p);assert.equal(inspectRenovisionPlan(p,digest).ok,false);}
});
