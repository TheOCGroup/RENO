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

test('rejects unauthorized existing environment value changes without disclosing them',()=>{
 const p=plan();
 const before=p.resource_changes[0].change.before.template[0].containers[0].env;
 const after=p.resource_changes[0].change.after.template[0].containers[0].env;
 before.pop(); // authorized browser key addition
 after[0].value='unauthorized-different-bucket';
 assert.equal(inspectRenovisionPlan(p,digest).ok,false);
});
test('rejects value_source drift on an existing environment entry',()=>{
 const p=plan();
 const before=p.resource_changes[0].change.before.template[0].containers[0].env;
 const after=p.resource_changes[0].change.after.template[0].containers[0].env;
 before.pop();
 before[0]={name:'RENOVISION_GCS_BUCKET',value_source:{secret_key_ref:{secret:'source-a',version:'1'}}};
 after[0]={name:'RENOVISION_GCS_BUCKET',value_source:{secret_key_ref:{secret:'source-b',version:'1'}}};
 assert.equal(inspectRenovisionPlan(p,digest).ok,false);
});
test('allows the browser key addition when all existing env values are unchanged',()=>{
 const p=plan();
 p.resource_changes[0].change.before.template[0].containers[0].env.pop();
 assert.equal(inspectRenovisionPlan(p,digest).ok,true);
});

test('fails closed on unknown Terraform planned values',()=>{
 for (const unknown of [
   {template:[{containers:[{image:true}]}]},
   {template:[{containers:[{env:[{value:true}]}]}]},
   {ingress:true}
 ]) {
   const p=plan();
   p.resource_changes[0].change.before.template[0].containers[0].env.pop();
   p.resource_changes[0].change.after_unknown=unknown;
   assert.deepEqual(inspectRenovisionPlan(p,digest),{ok:false,reason:'unknown_planned_values'});
 }
});
