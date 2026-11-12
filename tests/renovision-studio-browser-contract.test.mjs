import {readFileSync} from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {RENOVISION_STUDIO_HTML} from "../src/renovisionStudio.mjs";

test("customer studio inline JavaScript parses and does not contain escaped line separators",()=>{
 const script=RENOVISION_STUDIO_HTML.split("<script>")[1]?.split("</script>")[0];
 assert.ok(script,"studio must have script");
 assert.doesNotThrow(()=>new vm.Script(script));
 assert.doesNotMatch(script,/\\n(?=fetch\(|\$\(')/);
});
test("studio offers actual original-versus-concept comparison and project creation",()=>{
 for(const id of ["file","photo","resultPanel","resultPhoto","downloadResult","showOriginal","showResult","createProject","signIn","generate"]){
  assert.match(RENOVISION_STUDIO_HTML,new RegExp('id="'+id+'"'));
 }
 assert.match(RENOVISION_STUDIO_HTML,/AI-generated renovation concept|AI renovation concept/);
 assert.match(RENOVISION_STUDIO_HTML,/architecture|Architectural/);
});
test("studio never claims a concept is a verified measured drawing",()=>{
 assert.match(RENOVISION_STUDIO_HTML,/not construction drawings/);
 assert.match(RENOVISION_STUDIO_HTML,/No photo selected/);
});

test("customer session has explicit sign-out and expires without storing credentials",()=>{
 assert.match(RENOVISION_STUDIO_HTML,/id="signOut"/);
 assert.match(RENOVISION_STUDIO_HTML,/sessionExpiresAt/);
 assert.match(RENOVISION_STUDIO_HTML,/Session expired\. Sign in again/);
 assert.match(RENOVISION_STUDIO_HTML,/\$\('renderPassword'\)\.value=''/);
 assert.doesNotMatch(RENOVISION_STUDIO_HTML,/localStorage|sessionStorage/);
});

test("material inspiration is selectable and comparison uses actual source and generated images",()=>{
 for(const id of ["materialTitle","comparison","comparisonOriginal","comparisonConcept","comparisonRange","comparisonDivider"]){assert.match(RENOVISION_STUDIO_HTML,new RegExp('id="'+id+'"'));}
 assert.match(RENOVISION_STUDIO_HTML,/data-material="Natural oak flooring/);
 assert.match(RENOVISION_STUDIO_HTML,/comparisonOriginal'\)\.src=photoUrl/);
 assert.match(RENOVISION_STUDIO_HTML,/comparisonConcept'\)\.src=resultUrl/);
 assert.match(RENOVISION_STUDIO_HTML,/updateComparison\(\)/);
 assert.match(RENOVISION_STUDIO_HTML,/illustrative swatches, not product samples/);
});

test("room journeys select the matching brief and paid rendering stays fail-closed",()=>{
 for(const room of ["Kitchen","Bathroom","Living room","Bedroom"]) assert.match(RENOVISION_STUDIO_HTML,new RegExp('data-room="'+room+'"'));
 assert.match(RENOVISION_STUDIO_HTML,/function syncRoomJourney\(\)/);
 assert.match(RENOVISION_STUDIO_HTML,/\$\('room'\)\.value=c\.dataset\.room/);
 assert.match(RENOVISION_STUDIO_HTML,/refreshGenerateButton\(\)/);
 assert.match(RENOVISION_STUDIO_HTML,/Project details changed; create or open to continue/);
});

test("renovation scope planning remains local and is exported in design brief",()=>{
 assert.match(RENOVISION_STUDIO_HTML,/id="scopeGrid"/);
 assert.match(RENOVISION_STUDIO_HTML,/const roomScopes=/);
 assert.match(RENOVISION_STUDIO_HTML,/Kitchen:\['Cabinetry'/);
 assert.match(RENOVISION_STUDIO_HTML,/Bathroom:\['Tile and shower'/);
 assert.match(RENOVISION_STUDIO_HTML,/renovationPriorities:\[\.\.\.\(scopeSelections\.get/);
 assert.match(RENOVISION_STUDIO_HTML,/not a contractor estimate/);
});

test("render prompt includes renovation scope and cannot re-enable after failure",()=>{
 assert.match(RENOVISION_STUDIO_HTML,/Renovation priorities: /);
 assert.match(RENOVISION_STUDIO_HTML,/finally\{renderInFlight=false;refreshGenerateButton\(\)/);
 assert.match(RENOVISION_STUDIO_HTML,/for\(const id of \['projectId','propertyId','roomId'\]\)/);
});

test("development header-auth server binds only to loopback",()=>{
 const source=readFileSync(new URL("../src/renovisionMain.mjs",import.meta.url),"utf8");
 assert.match(source,/identityMode === "demo" \? "127\.0\.0\.1"/);
 assert.match(source,/server\.listen\(port, listenHost,/);
});

test("material direction is reversible and does not overwrite user notes",()=>{
 assert.match(RENOVISION_STUDIO_HTML,/let selectedMaterial=''/);
 assert.match(RENOVISION_STUDIO_HTML,/selectedMaterial=wasSelected\?'':card\.dataset\.material/);
 assert.match(RENOVISION_STUDIO_HTML,/materialDirection:selectedMaterial\|\|null/);
 assert.match(RENOVISION_STUDIO_HTML,/selectedMaterial,\$\('changes'\)\.value/);
});

test("changing design direction invalidates stale generated comparisons",()=>{
 assert.match(RENOVISION_STUDIO_HTML,/function invalidateConcept\(\{keepRefinement=false\}/);
 assert.match(RENOVISION_STUDIO_HTML,/URL\.revokeObjectURL\(resultUrl\)/);
 assert.match(RENOVISION_STUDIO_HTML,/function syncRoomJourney\(\)\{invalidateConcept\(\)/);
 assert.match(RENOVISION_STUDIO_HTML,/input\.addEventListener\('change',\(\)=>\{invalidateConcept\(\)/);
 assert.match(RENOVISION_STUDIO_HTML,/selectedMaterial=wasSelected\?'':card\.dataset\.material;invalidateConcept\(\)/);
 assert.match(RENOVISION_STUDIO_HTML,/if\(palette!==b\.dataset\.color\)invalidateConcept\(\)/);
 assert.match(RENOVISION_STUDIO_HTML,/\['style','changes'\]/);
});

test("late AI responses are discarded after design or authorization changes",()=>{
 assert.match(RENOVISION_STUDIO_HTML,/let designRevision=0/);
 assert.match(RENOVISION_STUDIO_HTML,/const renderCurrent=\(\)=>requestedRevision===designRevision&&requestedProject===activeProjectId&&requestedToken===idToken/);
 assert.match(RENOVISION_STUDIO_HTML,/Outdated result discarded/);
 assert.match(RENOVISION_STUDIO_HTML,/function clearPhoto\(\)\{designRevision\+\+/);
});

test("refinement notes preserve the selected source image",()=>{
 assert.match(RENOVISION_STUDIO_HTML,/keepRefinement:id==='changes'/);
 assert.match(RENOVISION_STUDIO_HTML,/if\(!keepRefinement\)refinementSource=null/);
 assert.match(RENOVISION_STUDIO_HTML,/refinementSource=resultBlob;refreshGenerateButton\(\)/);
});

test("invalidating a visible concept restores the original photo",()=>{
 assert.match(RENOVISION_STUDIO_HTML,/if\(\$\('photo'\)\.getAttribute\('src'\)===resultUrl\)/);
 assert.match(RENOVISION_STUDIO_HTML,/if\(photoUrl\)\$\('photo'\)\.src=photoUrl/);
});

test("account and project changes invalidate generated concepts",()=>{
 assert.match(RENOVISION_STUDIO_HTML,/signOut'\)\.onclick=\(\)=>\{authAttempt\+\+;invalidateConcept\(\)/);
 assert.match(RENOVISION_STUDIO_HTML,/if\(activeProjectId!==projectId\)\{invalidateConcept\(\);resetEstimateWorksheet\(\)\}/);
 assert.match(RENOVISION_STUDIO_HTML,/addEventListener\('input',\(\)=>\{invalidateConcept\(\);resetEstimateWorksheet\(\);activeProjectId=null/);
});

test("late project-open responses cannot rebind edited projects or changed accounts",()=>{
 assert.match(RENOVISION_STUDIO_HTML,/const requestCurrent=\(\)=>requestedRevision===designRevision&&requestedToken===idToken/);
 assert.match(RENOVISION_STUDIO_HTML,/if\(!requestCurrent\(\)\)\{\$\('projectState'\)\.textContent='Project details or session changed/);
 assert.match(RENOVISION_STUDIO_HTML,/catch\(e\)\{if\(requestCurrent\(\)\)/);
});

test("late sign-in responses are ignored after sign-out or credential edits",()=>{
 assert.match(RENOVISION_STUDIO_HTML,/const attempt=\+\+authAttempt/);
 assert.match(RENOVISION_STUDIO_HTML,/if\(attempt!==authAttempt\)return;if\(!r.ok\)/);
 assert.match(RENOVISION_STUDIO_HTML,/signOut'\)\.onclick=\(\)=>\{authAttempt\+\+/);
});

test("in-flight generation remains exclusive even when design changes",()=>{
 assert.match(RENOVISION_STUDIO_HTML,/if\(renderInFlight\)return;if\(!renderingAvailable\)/);
 assert.match(RENOVISION_STUDIO_HTML,/!renderInFlight&&renderingAvailable/);
 assert.match(RENOVISION_STUDIO_HTML,/finally\{renderInFlight=false;refreshGenerateButton\(\)/);
});

test("stale render work cannot dispatch or overwrite status with late failures",()=>{
 assert.match(RENOVISION_STUDIO_HTML,/if\(!renderCurrent\(\)\)return;const response=await fetch/);
 assert.match(RENOVISION_STUDIO_HTML,/authorization:'Bearer '\+requestedToken/);
 assert.match(RENOVISION_STUDIO_HTML,/catch\(e\)\{if\(renderCurrent\(\)\)\$\('status'\)/);
});

test("clearing the original photo also clears any retained refinement image",()=>{
 assert.match(RENOVISION_STUDIO_HTML,/function clearPhoto\(\)\{designRevision\+\+;refinementSource=null/);
});

test("existing project must match selected property and room before activation",()=>{
 assert.match(RENOVISION_STUDIO_HTML,/resolvedProject=existing.project/);
 assert.match(RENOVISION_STUDIO_HTML,/resolvedProject.propertyId!==propertyId\|\|resolvedProject.roomId!==roomId/);
 assert.match(RENOVISION_STUDIO_HTML,/Existing project does not match the selected property and room/);
});

test("downloaded design brief carries verified project scope and version metadata",()=>{
 assert.match(RENOVISION_STUDIO_HTML,/formatVersion:2,createdAt:new Date\(\)\.toISOString\(\)/);
 assert.match(RENOVISION_STUDIO_HTML,/project:activeProjectId\?\{projectId:activeProjectId,propertyId:\$\('propertyId'\)\.value\.trim\(\),roomId:\$\('roomId'\)\.value\.trim\(\)\}:null/);
});

test("contractor scope draft exports selected work without invented estimates",()=>{
 assert.match(RENOVISION_STUDIO_HTML,/id="downloadScope"/);
 assert.match(RENOVISION_STUDIO_HTML,/type:'contractor-scope-draft'/);
 assert.match(RENOVISION_STUDIO_HTML,/items:selected.map/);
 assert.match(RENOVISION_STUDIO_HTML,/quantity:null,unit:null,materialsCost:null,laborCost:null,contractorEstimate:null/);
 assert.match(RENOVISION_STUDIO_HTML,/estimateStatus:'not-estimated',totalCost:null/);
});

test("manual contractor estimate worksheet withholds totals for incomplete items",()=>{
 assert.match(RENOVISION_STUDIO_HTML,/id="reviewScope"/);
 assert.match(RENOVISION_STUDIO_HTML,/id="exportEstimate"/);
 assert.match(RENOVISION_STUDIO_HTML,/const complete=items.every/);
 assert.match(RENOVISION_STUDIO_HTML,/const totalCost=complete\?/);
 assert.match(RENOVISION_STUDIO_HTML,/estimateStatus:complete\?'entered-unverified':'incomplete'/);
});

test("contractor worksheet clears estimates on scope and identity changes",()=>{
 assert.match(RENOVISION_STUDIO_HTML,/function resetEstimateWorksheet\(\)\{scopeEstimateInputs.clear\(\)/);
 assert.match(RENOVISION_STUDIO_HTML,/input.addEventListener\('change',\(\)=>\{invalidateConcept\(\);resetEstimateWorksheet\(\)/);
 assert.match(RENOVISION_STUDIO_HTML,/\$\('signOut'\)\.onclick=\(\)=>\{authAttempt\+\+;invalidateConcept\(\);resetEstimateWorksheet\(\)/);
 assert.match(RENOVISION_STUDIO_HTML,/Materials total \(\$\)/);
 assert.match(RENOVISION_STUDIO_HTML,/Labor total \(\$\)/);
});
