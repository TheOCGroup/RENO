/** RENOVISION operator interface (single-file, no build step, no external assets).
 * Covers capture review, measurement correction, visualization and comparison.
 * The accuracy disclosure banner is permanent UI, not an optional label. */
export const RENOVISION_APP_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>RENOVISION AI — Renovation &amp; Furniture Visualization</title>
<style>
body{font-family:system-ui,sans-serif;margin:0;background:#F5F9FC;color:#17375B}
header{background:#17375B;color:#fff;padding:14px 20px;display:flex;gap:14px;align-items:center;flex-wrap:wrap}
header h1{font-size:18px;margin:0}.badge{background:#13A989;color:#fff;border-radius:10px;padding:2px 9px;font-size:12px}
.banner{background:#fff3cd;border-bottom:2px solid #e6a800;padding:9px 20px;font-size:13px}
main{max-width:1180px;margin:0 auto;padding:16px;display:grid;gap:16px}
section{background:#fff;border:1px solid #d7e3ee;border-radius:10px;padding:14px 16px}
h2{font-size:15px;margin:0 0 10px}label{font-size:12px;display:block;margin:6px 0 2px}
input,select,textarea{width:100%;padding:6px;border:1px solid #b9c9d8;border-radius:6px;font-size:13px;box-sizing:border-box}
button{background:#1769E0;color:#fff;border:0;border-radius:6px;padding:7px 13px;font-size:13px;cursor:pointer;margin:4px 4px 4px 0}
button.alt{background:#13A989}button.warn{background:#b3261e}button:disabled{opacity:.5}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:10px}
table{border-collapse:collapse;width:100%;font-size:12.5px}th,td{border:1px solid #d7e3ee;padding:5px 7px;text-align:left}
pre{background:#0f2233;color:#cfe8ff;padding:10px;border-radius:8px;overflow:auto;font-size:11.5px;max-height:230px}
.svgs{display:grid;grid-template-columns:1fr 1fr;gap:12px}.svgs img{width:100%;border:1px solid #d7e3ee;border-radius:8px;background:#fff}
.small{font-size:12px;color:#486581}.bad{color:#b3261e;font-weight:600}.ok{color:#0b5c48;font-weight:600}
</style></head><body>
<header><h1>RENOVISION AI</h1><span class="badge" id="stageBadge">no project</span><span class="small" style="color:#cfe8ff">Renovation &amp; furniture visualization</span></header>
<div class="banner"><strong>Concept visualization only</strong> — not a construction drawing, measured survey, or code-compliance determination. Dimensions are estimates requiring field verification unless explicitly marked field-verified. No survey-grade accuracy is claimed.</div>
<main>
<section><h2>1 · Project &amp; session</h2>
<div class="grid">
<div><label>Actor ID (demo header auth)</label><input id="actorId" value="operator-1"></div>
<div><label>Tenant ID</label><input id="tenantId" value="tenant-a"></div>
<div><label>Project ID</label><input id="projectId" value="reno-demo-1"></div>
<div><label>Property ID</label><input id="propertyId" value="property-1"></div>
<div><label>Room ID</label><input id="roomId" value="room-1"></div>
<div><label>Bearer ID token (production identity mode; leave empty in demo mode)</label><input id="bearerToken" type="password" value=""></div>
</div>
<button id="btnCreate">Create project</button><button id="btnOpen" class="alt">Open project</button>
<span class="small" id="sessionMsg"></span></section>

<section><h2>2 · Capture review</h2>
<div class="grid">
<div><label>Platform</label><select id="capPlatform"><option>web</option><option>ios</option><option>android</option><option>manual</option></select></div>
<div><label>Camera permission</label><select id="capPerm"><option value="true">granted</option><option value="false">denied</option></select></div>
<div><label>Depth supported</label><select id="capDepth"><option value="false">no</option><option value="true">yes</option></select></div>
<div><label>RoomPlan supported</label><select id="capRoomplan"><option value="false">no</option><option value="true">yes</option></select></div>
<div><label>Manual measurement available</label><select id="capManual"><option value="true">yes</option><option value="false">no</option></select></div>
</div>
<button id="btnPlan">Plan capture</button> <span class="small" id="planMsg"></span>
<div class="grid">
<div><label>Evidence photo (stored with SHA-256 digest)</label><input type="file" id="evidenceFile" accept="image/*"></div>
<div><label>Capture ID</label><input id="captureId" value="capture-1"></div>
<div><label>Device model</label><input id="deviceModel" value="browser-device"></div>
<div><label>Calibration status</label><select id="calStatus"><option>pending</option><option>uncalibrated</option><option>calibrated</option><option>failed</option></select></div>
<div><label>Coverage gaps (comma separated)</label><input id="coverageGaps" value=""></div>
<div><label>Blur score 0–1</label><input id="blurScore" value="0.1"></div>
<div><label>Depth coverage 0–1</label><input id="depthCov" value="0.5"></div>
</div>
<button id="btnEvidence">Upload evidence</button> <span class="small" id="evidenceMsg"></span>
<label>Capture manifest (JSON) — built from the evidence receipt, editable before registering</label>
<textarea id="manifestJson" rows="7"></textarea>
<button id="btnRegister">Register capture &amp; verify integrity</button>
<button id="btnAccept" class="alt">Accept capture</button>
<button id="btnReject" class="warn">Reject capture</button>
<input id="rejectReason" placeholder="Rejection reason (required to reject)" style="margin-top:6px">
<div class="small" id="captureMsg"></div></section>

<section><h2>3 · Measurements &amp; correction</h2>
<table><thead><tr><th>Feature</th><th>Value</th><th>±</th><th>Method</th><th>Status</th><th>State</th></tr></thead><tbody id="measBody"><tr><td colspan="6" class="small">No measurements yet</td></tr></tbody></table>
<div class="grid">
<div><label>Feature</label><select id="mFeature"><option>width</option><option>depth</option><option>height</option><option>door_width</option><option>door_offset</option><option>window_width</option><option>window_offset</option><option>obstruction_offset</option></select></div>
<div><label>Measurement ID</label><input id="mId" value="meas-width"></div>
<div><label>Value</label><input id="mValue" value="3.6"></div>
<div><label>Unit</label><select id="mUnit"><option>m</option><option>cm</option><option>mm</option><option>ft</option><option>in</option></select></div>
<div><label>Uncertainty</label><input id="mUnc" value="0.02"></div>
<div><label>Method</label><select id="mMethod"><option>manual_laser</option><option>manual_tape</option><option>roomplan_lidar</option><option>arcore_depth</option><option>photogrammetry</option><option>imported_plan</option></select></div>
<div><label>Calibration</label><select id="mCal"><option>calibrated</option><option>uncalibrated</option><option>not_applicable</option></select></div>
<div><label>Verification</label><select id="mVer"><option>estimated</option><option>verified</option></select></div>
<div><label>Verified by (if verified)</label><input id="mVerifiedBy" value=""></div>
<div><label>Semantic type</label><select id="mType"><option>wall</option><option>floor</option><option>ceiling</option><option>opening</option><option>obstruction</option></select></div>
<div><label>Field measured</label><select id="mField"><option value="true">yes</option><option value="false">no</option></select></div>
</div>
<button id="btnAddMeas">Add measurement</button> <span class="small">Evidence digest is taken from the uploaded capture evidence.</span>
<h2 style="margin-top:14px">Correct a measurement (append-only — the original is preserved)</h2>
<div class="grid">
<div><label>Target measurement ID</label><input id="cTarget" value="meas-width"></div>
<div><label>New measurement ID</label><input id="cNewId" value="meas-width-corr-1"></div>
<div><label>Corrected value</label><input id="cValue" value="3.62"></div>
<div><label>Reason</label><input id="cReason" value="Re-measured with laser on site"></div>
</div>
<button id="btnCorrect" class="alt">Apply correction</button>
<button id="btnLock">Lock geometry</button> <span class="small" id="lockMsg"></span>
<div class="small" id="measMsg"></div></section>

<section><h2>4 · Approved design proposal</h2>
<div class="grid">
<div><label>Approval ref</label><input id="aRef" value="approval-1"></div>
<div><label>Approved by (must differ from proposer)</label><input id="aBy" value="founder"></div>
<div><label>Feature ID</label><input id="pFeature" value="floor-main"></div>
<div><label>Semantic type</label><select id="pType"><option>floor</option><option>wall</option><option>ceiling</option><option>opening</option><option>obstruction</option></select></div>
<div><label>Scope item ID</label><input id="pScope" value="scope-floor-1"></div>
<div><label>Label / finish</label><input id="pLabel" value="White oak flooring"></div>
<div><label>Reason</label><input id="pReason" value="Approved renovation scope"></div>
</div>
<button id="btnApproval">Register approval</button>
<button id="btnPropose" class="alt">Propose change (approval-gated)</button>
<div class="small" id="propMsg"></div></section>

<section><h2>5 · Visualization — existing vs proposed</h2>
<button id="btnPreview">Generate concept preview</button> <span class="small" id="previewMsg"></span>
<div class="small" id="claimMsg"></div>
<div class="svgs"><div><strong>Existing</strong><img id="svgExisting" alt="Existing floor plan"></div>
<div><strong>Proposed</strong><img id="svgProposed" alt="Proposed floor plan"></div></div>
<div class="small" id="warnMsg"></div></section>

<section><h2>6 · Dimension-aware furnishing</h2>
<div class="grid">
<div><label>Item ID</label><input id="fId" value="sofa-1"></div>
<div><label>Product ID</label><input id="fProduct" value="sofa-3seat-001"></div>
<div><label>Dimension source</label><input id="fSource" value="manufacturer-spec-sheet"></div>
<div><label>Dimensions verified</label><select id="fDimsVer"><option value="true">yes</option><option value="false">no</option></select></div>
<div><label>Width (m)</label><input id="fW" value="2.1"></div>
<div><label>Depth (m)</label><input id="fD" value="0.95"></div>
<div><label>X (m)</label><input id="fX" value="0.4"></div>
<div><label>Y (m)</label><input id="fY" value="0.4"></div>
<div><label>Uncertainty (m)</label><input id="fUnc" value="0.01"></div>
<div><label>Clearance (m)</label><input id="fClear" value="0.3"></div>
</div>
<button id="btnFurnish">Evaluate furnishing plan</button>
<table><thead><tr><th>Item</th><th>Verdict</th><th>Notes</th></tr></thead><tbody id="furnBody"><tr><td colspan="3" class="small">Not evaluated</td></tr></tbody></table>
<div class="small" id="furnMsg"></div></section>

<section><h2>7 · Comparison &amp; QUINCEY handoff</h2>
<button id="btnCompare">Build comparison</button>
<table><thead><tr><th>Feature</th><th>Change</th><th>Approval</th></tr></thead><tbody id="cmpBody"><tr><td colspan="3" class="small">No comparison yet</td></tr></tbody></table>
<div class="grid">
<div><label>Commit SHA (40 hex)</label><input id="qSha" value=""></div>
<div><label>PR URL</label><input id="qPr" value="https://github.com/TheOCGroup/RENO/pull/3"></div>
<div><label>Study ID</label><input id="qStudy" value="renovision-e2e-001"></div>
<div><label>Test count</label><input id="qTests" value=""></div>
</div>
<button id="btnPacket" class="alt">Build QUINCEY review packet</button>
<button id="btnExport">Export evidence package (digest-bound)</button>
<button id="btnAudit" class="alt">Show audit trail</button>
<div class="small">The packet is a review request, not a certification. Release readiness remains blocked until device capture, durable private storage, a physical room benchmark and independent QUINCEY review have verified passing evidence.</div>
<pre id="out">Session output appears here.</pre></section>
</main>
<script>
var $=function(id){return document.getElementById(id)};
var state={receipt:null,project:null};
function headers(){var h={'content-type':'application/json','x-actor-id':$('actorId').value,'x-tenant-id':$('tenantId').value};var t=$('bearerToken').value.trim();if(t){h['authorization']='Bearer '+t}return h}
function projectPath(sub){return '/api/renovision/projects/'+encodeURIComponent($('projectId').value)+(sub?'/'+sub:'')}
function show(x){$('out').textContent=typeof x==='string'?x:JSON.stringify(x,null,2)}
function call(method,path,body){return fetch(path,{method:method,headers:headers(),body:body?JSON.stringify(body):undefined}).then(function(r){return r.json().then(function(j){return {status:r.status,body:j}})})}
function refreshProject(){return call('GET',projectPath('')).then(function(r){if(r.body.project){state.project=r.body.project;$('stageBadge').textContent=r.body.project.stage;renderMeasurements(r.body.project)}show(r.body);return r})}
function renderMeasurements(p){var rows=(p.activeMeasurements||[]).map(function(m){return '<tr><td>'+m.featureId+'</td><td>'+m.value+' '+m.unit+'</td><td>'+m.uncertainty+'</td><td>'+m.method+'</td><td>'+m.verificationStatus+'</td><td>active</td></tr>'}).join('');var sup=(p.measurements||[]).filter(function(m){return m.supersededBy}).map(function(m){return '<tr><td>'+m.featureId+'</td><td>'+m.value+' '+m.unit+'</td><td>'+m.uncertainty+'</td><td>'+m.method+'</td><td>'+m.verificationStatus+'</td><td class="bad">superseded by '+m.supersededBy+'</td></tr>'}).join('');$('measBody').innerHTML=(rows+sup)||'<tr><td colspan="6" class="small">No measurements yet</td></tr>'}
$('btnCreate').onclick=function(){call('POST','/api/renovision/projects',{projectId:$('projectId').value,propertyId:$('propertyId').value,roomId:$('roomId').value}).then(function(r){$('sessionMsg').textContent=r.status===201?'created':'error';refreshProject()})};
$('btnOpen').onclick=function(){refreshProject()};
$('btnPlan').onclick=function(){var d={platform:$('capPlatform').value,cameraPermission:$('capPerm').value==='true',depthSupported:$('capDepth').value==='true',roomPlanSupported:$('capRoomplan').value==='true',manualMeasurementAvailable:$('capManual').value==='true'};call('POST',projectPath('capture-plan'),{deviceProfile:d}).then(function(r){$('planMsg').textContent=r.body.plan?('mode: '+r.body.plan.mode+' — estimated, field verification required'):(r.body.errors||[]).join('; ');show(r.body)})};
$('btnEvidence').onclick=function(){var f=$('evidenceFile').files[0];if(!f){$('evidenceMsg').textContent='choose a file first';return}var rd=new FileReader();rd.onload=function(){var b64=String(rd.result).split(',')[1];call('POST',projectPath('evidence'),{contentBase64:b64,mimeType:f.type||'image/png',kind:'photo',captureId:$('captureId').value}).then(function(r){if(r.body.receipt){state.receipt=r.body.receipt;$('evidenceMsg').textContent='stored: '+r.body.receipt.storageRef+' digest '+r.body.receipt.digest;buildManifest()}else{$('evidenceMsg').textContent=(r.body.errors||[]).join('; ')}show(r.body)})};rd.readAsDataURL(f)};
function buildManifest(){if(!state.receipt)return;var gaps=$('coverageGaps').value.split(',').map(function(s){return s.trim()}).filter(Boolean);var m={tenantId:$('tenantId').value,propertyId:$('propertyId').value,roomId:$('roomId').value,captureId:$('captureId').value,operatorId:$('actorId').value,deviceModel:$('deviceModel').value,coordinateFrame:'local',capturedAt:new Date().toISOString(),platform:$('capPlatform').value==='ios'||$('capPlatform').value==='android'?$('capPlatform').value:'web',calibrationStatus:$('calStatus').value,coverageGaps:gaps,artifacts:[{id:state.receipt.storageRef,kind:'photo',digest:state.receipt.digest,byteLength:state.receipt.byteLength||0}]};if(!m.artifacts[0].byteLength){delete m.artifacts[0].byteLength}$('manifestJson').value=JSON.stringify(m,null,2)}
$('btnRegister').onclick=function(){var m;try{m=JSON.parse($('manifestJson').value)}catch(e){$('captureMsg').textContent='manifest JSON invalid';return}if(m.artifacts&&m.artifacts[0]&&!m.artifacts[0].byteLength&&state.receipt){/* byte length is verified server-side against stored bytes via digest */}call('POST',projectPath('captures'),{manifest:m,qualityInput:{blurScore:Number($('blurScore').value),depthCoverageFraction:Number($('depthCov').value),deviceClass:'operator-device'}}).then(function(r){$('captureMsg').textContent=r.body.project?'integrity verified — stage: capture_review':(r.body.errors||[]).join('; ');refreshProject()})};
$('btnAccept').onclick=function(){call('POST',projectPath('capture-review'),{decision:'accept'}).then(function(r){refreshProject()})};
$('btnReject').onclick=function(){call('POST',projectPath('capture-review'),{decision:'reject',reason:$('rejectReason').value}).then(function(r){refreshProject()})};
$('btnAddMeas').onclick=function(){if(!state.receipt){$('measMsg').textContent='upload evidence first — its digest is the measurement evidence reference';return}var rec={propertyId:$('propertyId').value,roomId:$('roomId').value,measurementId:$('mId').value,featureId:$('mFeature').value,captureId:$('captureId').value,deviceModel:$('deviceModel').value,platform:$('capPlatform').value==='manual'?'manual':'web',timestamp:new Date().toISOString(),coordinateFrame:'local',evidenceRef:state.receipt.digest,semanticType:$('mType').value,method:$('mMethod').value,value:Number($('mValue').value),unit:$('mUnit').value,uncertainty:Number($('mUnc').value),calibrationStatus:$('mCal').value,verificationStatus:$('mVer').value,geometryState:'EXISTING',fieldMeasured:$('mField').value==='true'};if(rec.verificationStatus==='verified'){rec.verifiedBy=$('mVerifiedBy').value;rec.verifiedAt=new Date().toISOString()}call('POST',projectPath('measurements'),{record:rec}).then(function(r){$('measMsg').textContent=r.body.result?('added — verified: '+r.body.result.verified):(r.body.errors||[]).join('; ');refreshProject()})};
$('btnCorrect').onclick=function(){var c={targetMeasurementId:$('cTarget').value,newMeasurementId:$('cNewId').value,value:Number($('cValue').value),reason:$('cReason').value,evidenceRef:state.receipt?state.receipt.digest:'',timestamp:new Date().toISOString()};call('POST',projectPath('corrections'),{correction:c}).then(function(r){$('measMsg').textContent=r.body.result?'correction applied (original preserved)':(r.body.errors||[]).join('; ');refreshProject()})};
$('btnLock').onclick=function(){call('POST',projectPath('lock'),{}).then(function(r){$('lockMsg').textContent=r.body.lock?('locked · digest '+r.body.lock.geometryDigest+' · fieldVerified: '+r.body.lock.fieldVerified):(r.body.errors||[]).join('; ');refreshProject()})};
$('btnApproval').onclick=function(){var rec={approvalRef:$('aRef').value,tenantId:$('tenantId').value,propertyId:$('propertyId').value,roomId:$('roomId').value,featureId:$('pFeature').value,scopeItemId:$('pScope').value,status:'approved',approvedBy:$('aBy').value,approvedAt:new Date().toISOString(),allowedActorIds:[$('actorId').value]};call('POST','/api/renovision/approvals',rec).then(function(r){$('propMsg').textContent=r.status===201?'approval registered':(r.body.errors||[]).join('; ');show(r.body)})};
$('btnPropose').onclick=function(){var ch={featureId:$('pFeature').value,semanticType:$('pType').value,scopeItemId:$('pScope').value,approvalRef:$('aRef').value,eventId:'evt-'+Date.now(),reason:$('pReason').value,baseline:{featureId:$('pFeature').value,semanticType:$('pType').value,label:'Existing condition'},proposed:{label:$('pLabel').value}};call('POST',projectPath('proposals'),{change:ch}).then(function(r){$('propMsg').textContent=r.body.result?'change proposed under approval gate':(r.body.errors||[]).join('; ');refreshProject()})};
$('btnPreview').onclick=function(){call('POST',projectPath('preview'),{mode:'renovate'}).then(function(r){if(r.body.preview){$('svgExisting').src=projectPath('preview/existing.svg');$('svgProposed').src=projectPath('preview/proposed.svg');$('previewMsg').textContent=r.body.preview.disclosure.title+' — CONCEPT';$('claimMsg').innerHTML='Accuracy claim: <span class="bad">NOT AUTHORIZED</span> · preview allowed: '+r.body.preview.claim.previewAllowed;$('warnMsg').textContent=(r.body.preview.disclosure.warnings||[]).join(' · ')}else{$('previewMsg').textContent=(r.body.errors||[]).join('; ')}show(r.body)})};
$('btnFurnish').onclick=function(){var item={id:$('fId').value,productId:$('fProduct').value,dimensionSource:$('fSource').value,dimensionsVerified:$('fDimsVer').value==='true',width:Number($('fW').value),depth:Number($('fD').value),x:Number($('fX').value),y:Number($('fY').value),uncertaintyMeters:Number($('fUnc').value),clearance:Number($('fClear').value)};call('POST',projectPath('furnishing'),{items:[item]}).then(function(r){if(r.body.plan){$('furnBody').innerHTML=r.body.plan.items.map(function(i){return '<tr><td>'+i.id+'</td><td>'+i.verdict+'</td><td>'+(i.reasons||[]).join('; ')+'</td></tr>'}).join('');$('furnMsg').textContent=r.body.plan.disclosure}else{$('furnMsg').textContent=(r.body.errors||[]).join('; ')}show(r.body)})};
$('btnCompare').onclick=function(){call('POST',projectPath('comparison'),{}).then(function(r){if(r.body.comparison){$('cmpBody').innerHTML=r.body.comparison.diff.entries.map(function(e){return '<tr><td>'+e.featureId+'</td><td>'+e.change+'</td><td>'+(e.unapproved?'<span class="bad">UNAPPROVED</span>':'approved / n/a')+'</td></tr>'}).join('');}show(r.body)})};
$('btnPacket').onclick=function(){call('POST',projectPath('quincey-packet'),{commitSha:$('qSha').value,prUrl:$('qPr').value,studyId:$('qStudy').value,testCount:Number($('qTests').value)||undefined,ciRuns:[{workflow:'RENOVISION Spatial Validation CI',status:'pending'}]}).then(function(r){show(r.body)})};
$('btnExport').onclick=function(){call('GET',projectPath('export')).then(function(r){if(r.body.export){show('Export digest: '+r.body.export.digest+'\\nAudit entries: '+(r.body.export.content.project.audit||[]).length+'\\nStage: '+r.body.export.content.project.stage+'\\n\\n'+JSON.stringify(r.body.export,null,2))}else{show(r.body)}})};
$('btnAudit').onclick=function(){call('GET',projectPath('')).then(function(r){if(r.body.project){show((r.body.project.audit||[]).map(function(a){return a.seq+' · '+a.action+' · '+a.actorId+' · '+a.at+' · '+String(a.hash||'').slice(0,12)}).join('\\n')||'no audit entries')}else{show(r.body)}})};
</script></body></html>`;
