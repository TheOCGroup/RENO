import { timingSafeEqual } from 'node:crypto';
import { receiveClosedAcquisition } from './missionControlIntake.mjs';

const DEFAULT_MAX_BODY_BYTES=1024*1024;
// L-2: the receiver's reader is stream-capped like the operator API's.
// Resolution order: maxBodyBytes option -> MISSION_CONTROL_MAX_BODY_BYTES
// env -> 1 MiB default (the same env the operator server resolves, so
// one configured cap governs both readers). Past the cap, chunks are
// discarded instead of buffered and the body is refused 413.
function resolveMaxBodyBytes(optionValue){const raw=optionValue??process.env.MISSION_CONTROL_MAX_BODY_BYTES;const parsed=Number(raw);return Number.isFinite(parsed)&&parsed>0?Math.floor(parsed):DEFAULT_MAX_BODY_BYTES;}
async function readJson(req,maxBodyBytes){const chunks=[];let received=0;let overflow=false;for await(const chunk of req){const buf=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);received+=buf.length;if(received>maxBodyBytes){overflow=true;continue;}chunks.push(buf);}if(overflow)throw new Error('body_too_large');const raw=Buffer.concat(chunks).toString('utf8');if(!raw.trim())throw new Error('empty_request_body');return JSON.parse(raw);}
function send(res,status,body){const text=JSON.stringify(body);res.writeHead(status,{'content-type':'application/json; charset=utf-8','content-length':Buffer.byteLength(text)});res.end(text);}
function authorized(req,secret){if(!secret)return false;const h=String(req.headers.authorization||'');if(!h.startsWith('Bearer '))return false;const supplied=Buffer.from(h.slice(7));const expected=Buffer.from(String(secret));return supplied.length===expected.length&&timingSafeEqual(supplied,expected);}

export function createMissionControlHandoffHandler({repository,secret,maxBodyBytes}){
 const bodyCap=resolveMaxBodyBytes(maxBodyBytes);
 return async function handle(req,res){
  const url=new URL(req.url,'http://mission-control.local');
  if(url.pathname!=='/api/v1/integrations/pipeline/acquisition-handoff')return false;
  if(req.method!=='POST'){send(res,405,{ok:false,error:'method_not_allowed'});return true;}
  if(!authorized(req,secret)){send(res,401,{ok:false,error:'unauthorized'});return true;}
  try{
   const body=await readJson(req,bodyCap);
   const handoffId=String(body.handoffId||'').trim();
   if(!handoffId){send(res,400,{ok:false,error:'missing_handoffId'});return true;}
   const result=receiveClosedAcquisition({handoffId,payload:body.payload,repository});
   send(res,result.duplicate?200:201,{ok:true,data:result});return true;
  }catch(err){
   if(err instanceof SyntaxError){send(res,400,{ok:false,error:'invalid_json'});return true;}
   if(err.message==='body_too_large'){send(res,413,{ok:false,error:'body_too_large'});return true;}
   const known=new Set(['empty_request_body','invalid_handoff_payload','missing_contractVersion','missing_sourceSystem','missing_targetSystem','missing_opportunityId','missing_closedAt','missing_acquisition','missing_underwriting','missing_renovationSeed','unsupported_handoff_contract','invalid_handoff_source','invalid_handoff_target','field_scope_validation_required','invalid_project_seed_status','invalid_field_type','mission_control_repository_required']);
   if(known.has(err.message)){send(res,400,{ok:false,error:err.message});return true;}
   send(res,500,{ok:false,error:'mission_control_intake_failed'});return true;
  }
 };
}
