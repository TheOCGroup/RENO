import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createMissionControlHandoffHandler } from '../src/missionControlHttpReceiver.mjs';

const payload={contractVersion:'1.0',sourceSystem:'pipeline',targetSystem:'mission-control',opportunityId:'opp-1',closedAt:'2026-09-25T16:00:00Z',acquisition:{purchasePrice:145000,strategyType:'cash_purchase'},underwriting:{sourceSystem:'deal-scout',sourceUnderwritingId:'victor-1',arv:235000,rehab:30000,mao:155000,confidence:.9},renovationSeed:{scopeStatus:'needs_field_validation',projectStatus:'intake_ready',budgetBaseline:30000}};
function repo(){const rows=new Map();return{findBySourceHandoffId:id=>[...rows.values()].find(x=>x.sourceHandoffId===id)||null,insert:p=>{rows.set(p.id,p);return p;}};}
async function start(handler){const server=createServer(async(req,res)=>{if(!await handler(req,res)){res.writeHead(404);res.end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));return{server,base:`http://127.0.0.1:${server.address().port}`};}

test('receiver fails closed, accepts canonical handoff, and is idempotent',async t=>{
 const handler=createMissionControlHandoffHandler({repository:repo(),secret:'top-secret'});
 const {server,base}=await start(handler);t.after(()=>server.close());
 let res=await fetch(`${base}/api/v1/integrations/pipeline/acquisition-handoff`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({handoffId:'handoff-1',payload})});
 assert.equal(res.status,401);
 res=await fetch(`${base}/api/v1/integrations/pipeline/acquisition-handoff`,{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer top-secret'},body:JSON.stringify({handoffId:'handoff-1',payload})});
 assert.equal(res.status,201);let body=await res.json();assert.equal(body.ok,true);assert.equal(body.data.duplicate,false);assert.equal(body.data.project.sourceOpportunityId,'opp-1');assert.equal(body.data.project.scopeStatus,'field_scope_required');assert.equal(body.data.acknowledgment.eventType,'acknowledged');
 res=await fetch(`${base}/api/v1/integrations/pipeline/acquisition-handoff`,{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer top-secret'},body:JSON.stringify({handoffId:'handoff-1',payload})});
 assert.equal(res.status,200);body=await res.json();assert.equal(body.data.duplicate,true);
});
