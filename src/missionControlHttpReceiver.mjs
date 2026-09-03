import { timingSafeEqual } from 'node:crypto';
import { receiveClosedAcquisition } from './missionControlIntake.mjs';

async function readJson(req){const chunks=[];for await(const chunk of req)chunks.push(Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk));const raw=Buffer.concat(chunks).toString('utf8');if(!raw.trim())throw new Error('empty_request_body');return JSON.parse(raw);}
function send(res,status,body){const text=JSON.stringify(body);res.writeHead(status,{'content-type':'application/json; charset=utf-8','content-length':Buffer.byteLength(text)});res.end(text);}
function authorized(req,secret){if(!secret)return false;const h=String(req.headers.authorization||'');if(!h.startsWith('Bearer '))return false;const supplied=Buffer.from(h.slice(7));const expected=Buffer.from(String(secret));return supplied.length===expected.length&&timingSafeEqual(supplied,expected);}

export function createMissionControlHandoffHandler({repository,secret}){
 return async function handle(req,res){
  const url=new URL(req.url,'http://mission-control.local');
  if(url.pathname!=='/api/v1/integrations/pipeline/acquisition-handoff')return false;
  if(req.method!=='POST'){send(res,405,{ok:false,error:'method_not_allowed'});return true;}
  if(!authorized(req,secret)){send(res,401,{ok:false,error:'unauthorized'});return true;}
  try{
   const body=await readJson(req);
   const handoffId=String(body.handoffId||'').trim();
   if(!handoffId){send(res,400,{ok:false,error:'missing_handoffId'});return true;}
   const result=receiveClosedAcquisition({handoffId,payload:body.payload,repository});
   send(res,result.duplicate?200:201,{ok:true,data:result});return true;
  }catch(err){
   if(err instanceof SyntaxError){send(res,400,{ok:false,error:'invalid_json'});return true;}
   const known=new Set(['empty_request_body','invalid_handoff_payload','missing_contractVersion','missing_sourceSystem','missing_targetSystem','missing_opportunityId','missing_closedAt','missing_acquisition','missing_underwriting','missing_renovationSeed','unsupported_handoff_contract','invalid_handoff_source','invalid_handoff_target','field_scope_validation_required','invalid_project_seed_status','mission_control_repository_required']);
   if(known.has(err.message)){send(res,400,{ok:false,error:err.message});return true;}
   send(res,500,{ok:false,error:'mission_control_intake_failed'});return true;
  }
 };
}
