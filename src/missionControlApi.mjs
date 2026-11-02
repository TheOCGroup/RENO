import { timingSafeEqual } from 'node:crypto';

// Server-side identity comes from a trusted bearer-token lookup, never a client role header.
// This is a handler factory; the host must supply the token registry and the tenant-scoped service.
function send(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, {'content-type':'application/json; charset=utf-8','content-length':Buffer.byteLength(data),'cache-control':'no-store'});
  res.end(data);
}
function tokenMatch(a,b) {
  const left = Buffer.from(a), right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left,right);
}
async function readBody(req) {
  const chunks=[]; let size=0;
  for await (const chunk of req) {
    size+=chunk.length;
    if (size > 65536) throw new Error('body_too_large');
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new Error('invalid_json'); }
}
export function createMissionControlApiHandler({ service, tokenRegistry }) {
  if (!service?.get || !service?.execute || !Array.isArray(tokenRegistry)) throw new Error('api_configuration_required');
  return async function handle(req,res) {
    const url = new URL(req.url,'http://mission-control.local');
    const match = /^\/api\/v1\/mission-control\/projects\/([a-zA-Z0-9_-]{1,128})(?:\/(?:operations|payment-reconciliation))?$/.exec(url.pathname);
    if (!match) return false;
    const header=String(req.headers.authorization||'');
    const token=header.startsWith('Bearer ') ? header.slice(7) : '';
    const principal=token ? tokenRegistry.find(entry => entry.token && tokenMatch(token,entry.token)) : null;
    if (!principal?.actor?.id) { send(res,401,{ok:false,error:'unauthorized'}); return true; }
    const projectId=match[1], isOperation=url.pathname.endsWith('/operations');
    const isReconciliation=url.pathname.endsWith('/payment-reconciliation');
    if ((!isOperation && !isReconciliation && req.method!=='GET') || ((isOperation || isReconciliation) && req.method!=='POST')) {
      send(res,405,{ok:false,error:'method_not_allowed'}); return true;
    }
    try {
      if (isReconciliation) {
        const body=await readBody(req);
        const result=service.reconcilePayments({actor:principal.actor,projectId,bankRecords:body?.bankRecords});
        send(res,200,{ok:true,data:result});
      } else if (!isOperation) {
        const result=service.get({actor:principal.actor,projectId});
        send(res,result?200:404,result?{ok:true,data:result}:{ok:false,error:'project_not_found'});
      } else {
        const body=await readBody(req);
        const result=service.execute({actor:principal.actor,projectId,expectedVersion:body.expectedVersion,operation:body.operation,args:body.args});
        send(res,200,{ok:true,data:result});
      }
    } catch (error) {
      const status = error.message==='forbidden' ? 403 : error.message==='project_not_found' ? 404 : error.message==='state_version_conflict' ? 409 : ['invalid_json','body_too_large','expected_version_required','operation_not_allowed'].includes(error.message) ? 400 : 422;
      send(res,status,{ok:false,error:status===422?'operation_rejected':error.message});
    }
    return true;
  };
}
