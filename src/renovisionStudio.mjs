/** Customer-facing visual studio. Local photo/brief editing is explicitly not AI rendering. */
export const RENOVISION_STUDIO_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>RENOVISION AI | Design Studio</title><link rel="icon" type="image/png" sizes="32x32" href="/brand/icon-32.png"><link rel="icon" type="image/png" sizes="16x16" href="/brand/icon-16.png"><link rel="apple-touch-icon" sizes="180x180" href="/brand/icon-180.png"><link rel="manifest" href="/brand/manifest.webmanifest">
<style>
/* ============ RENOVISION AI — Design System (UX replacement 2026-11-19) ============ */
:root{
  --paper:#faf8f3; --ivory:#f3eee5; --card:#fffdf9; --line:#e4ddcf; --line-soft:#ede7da;
  --ink:#211d18; --ink-2:#575046; --ink-3:#6e6656;
  --accent:#31536b; --accent-deep:#264256; --accent-tint:#e9eff3;
  --brand:#243c30;
  --warn:#8a5a16; --warn-bg:#f7ecd2; --danger:#8c3a30; --danger-bg:#f6e3de; --ok:#33624a; --ok-bg:#e6efe8;
  --shadow:0 1px 2px rgba(33,29,24,.04),0 14px 34px -18px rgba(33,29,24,.14);
  --r-card:16px; --r-ctl:10px;
  font-family:-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;
  color:var(--ink); background:var(--paper);
}
*{box-sizing:border-box}
html{scroll-behavior:smooth}
body{margin:0;background:var(--paper);color:var(--ink);font-size:14.5px;line-height:1.55;-webkit-font-smoothing:antialiased}
::placeholder{color:#71685a;opacity:1}
:focus-visible{outline:2px solid var(--accent);outline-offset:2px;border-radius:4px}
@media (prefers-reduced-motion: reduce){*{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important;scroll-behavior:auto!important}}
.hidden{display:none!important}
img{max-width:100%}

/* ---- Shell ---- */
header{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:14px clamp(20px,4vw,44px);background:rgba(250,248,243,.92);border-bottom:1px solid var(--line-soft);position:relative;z-index:40}
header h1{font-size:15px;letter-spacing:.22em;font-weight:700;margin:0}
header h1 img{border-radius:8px;margin-right:11px;vertical-align:middle}
header h1 span{color:var(--accent)!important}
header a{color:var(--ink-2);text-decoration:none;font-size:13px}
header a:hover{color:var(--accent)}
main{max-width:1240px;margin:0 auto;padding:0 clamp(18px,4vw,44px) 8px}

/* ---- Intro ---- */
.intro{display:grid;grid-template-columns:1.25fr .75fr;gap:26px;align-items:end;padding:38px 0 6px}
.eyebrow,.chapter{font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:var(--ink-3);font-weight:600}
.intro h2,.journey-heading{font-family:"Fraunces",Georgia,"Times New Roman",serif;font-weight:400;letter-spacing:-.02em}
.intro h2{font-size:clamp(38px,4.6vw,58px);line-height:1.04;margin:10px 0 0}
.intro h2 em{font-style:italic;color:var(--ink-2)}
.intro p{color:var(--ink-2);font-size:15px;margin:0}
.intro-meta{margin-top:14px;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--ink-3)}

/* ---- Journey rail (real navigation) ---- */
nav[aria-label="Design journey progress"]{position:sticky;top:0;z-index:35;background:rgba(250,248,243,.96);backdrop-filter:blur(6px);border-bottom:1px solid var(--line-soft);margin:14px calc(-1*clamp(18px,4vw,44px)) 0;padding:0 clamp(18px,4vw,44px)}
.journey{display:flex;flex-wrap:nowrap;gap:4px 26px;list-style:none;margin:0 auto;padding:11px 0;max-width:1240px;font-size:11.5px;letter-spacing:.13em;text-transform:uppercase;color:var(--ink-3);overflow-x:auto;scrollbar-width:none}
.journey::-webkit-scrollbar{display:none}
.journey li{white-space:nowrap;cursor:pointer;padding:2px 0;border-bottom:2px solid transparent;transition:color .16s ease,border-color .16s ease}
.journey li:hover{color:var(--accent)}
.journey li.done{color:var(--ok)}
.journey li.current{color:var(--ink);font-weight:700;border-bottom-color:var(--accent)}

/* ---- Stage scaffolding ---- */
.stage-block{max-width:1240px;margin:36px auto 0;padding:0 clamp(18px,4vw,44px)}
.stage-block,#stageProject,#stageVision,#stageConcept,#interiorPlanner{scroll-margin-top:58px}
.stage-head{display:flex;align-items:baseline;gap:14px;margin:0 0 6px}
.stage-head .stage-num{font-family:"Fraunces",Georgia,serif;font-style:italic;font-size:20px;color:var(--accent)}
.stage-head h2{font-family:"Fraunces",Georgia,"Times New Roman",serif;font-weight:400;font-size:clamp(24px,2.6vw,31px);letter-spacing:-.015em;margin:0}
.stage-head p{color:var(--ink-2);margin:0;font-size:13.5px}

/* ---- Cards & panels ---- */
.panel,.surface{background:var(--card);border:1px solid var(--line);border-radius:var(--r-card);box-shadow:var(--shadow);padding:26px}
.panel h3{font-family:"Fraunces",Georgia,"Times New Roman",serif;font-weight:400;font-size:23px;letter-spacing:-.01em;margin:0 0 8px}
.panel p{color:var(--ink-2)}
section.panel{margin-top:22px}
aside.panel{background:transparent;border:none;box-shadow:none;padding:0}
aside .panel,aside section{background:var(--card);border:1px solid var(--line);border-radius:var(--r-card);box-shadow:var(--shadow);padding:22px;margin-top:18px}
aside>.chapter{margin-top:4px}
.rail-title{font-family:"Fraunces",Georgia,serif;font-weight:400;font-size:20px;margin:0 0 6px}

/* ---- Room journey cards ---- */
.room-journeys{margin-top:30px;border-top:1px solid var(--line-soft);padding-top:26px}
.journey-heading{font-size:clamp(26px,3vw,36px);margin:8px 0 6px}
.journey-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-top:18px}
.journey-card{border:1px solid var(--line);background:var(--card);color:var(--ink);border-radius:14px;padding:18px 16px;text-align:left;min-height:124px;display:flex;flex-direction:column;justify-content:space-between;cursor:pointer;transition:border-color .16s ease,background .16s ease,transform .16s ease}
.journey-card strong{font-family:"Fraunces",Georgia,serif;font-size:21px;font-weight:400}
.journey-card small{color:var(--ink-3);font-size:11.5px;line-height:1.5}
.journey-card:hover{border-color:var(--accent);background:#fff}
.journey-card[aria-pressed="true"]{border-color:var(--accent);box-shadow:inset 0 0 0 1px var(--accent);background:var(--accent-tint)}

/* ---- Workspace (photo + rail) ---- */
.layout{display:grid;grid-template-columns:1fr 1fr;gap:18px}
.workspace{display:grid;grid-template-columns:minmax(0,1.62fr) minmax(300px,.88fr);gap:22px;align-items:start;margin-top:26px}
.workspace .surface{padding:0;overflow:hidden}
.studio-kicker{display:flex;justify-content:space-between;gap:12px;padding:15px 20px;border-bottom:1px solid var(--line-soft);font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--ink-3)}
.studio-kicker strong{color:var(--ink);font-weight:700}
.stage{background:var(--ivory);min-height:430px;display:flex;align-items:center;justify-content:center;position:relative}
.stage img#photo{width:100%;height:100%;max-height:560px;object-fit:contain;display:block}
.empty{text-align:center;color:var(--ink-2);padding:38px 26px;max-width:420px}
.empty svg{width:44px;height:44px;color:var(--ink-3);margin-bottom:10px}
.empty strong{display:block;font-family:"Fraunces",Georgia,serif;font-size:22px;font-weight:400;color:var(--ink);margin-bottom:6px}
.empty p{margin:0 0 16px;font-size:13.5px}
.toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:13px 20px;border-top:1px solid var(--line-soft);flex-wrap:wrap}
.preview{display:flex;justify-content:space-between;gap:12px;padding:11px 20px;border-top:1px solid var(--line-soft);font-size:12.5px;color:var(--ink-3)}
.preview strong{color:var(--ink-2);font-weight:600}
#resultPanel{padding:22px 20px!important;border-top:1px solid var(--line-soft)}
#resultPanel>strong{font-family:"Fraunces",Georgia,serif;font-size:21px;font-weight:400}
#resultPhoto{border-radius:12px!important}
.comparison{margin-top:14px}
.comparison-stage{position:relative;border-radius:12px;overflow:hidden;background:var(--ivory)}
.comparison-stage img{width:100%;display:block}
.comparison-top{position:absolute;inset:0;height:100%;object-fit:cover}
.comparison-divider{position:absolute;top:0;bottom:0;width:2px;background:#fff;box-shadow:0 0 0 1px rgba(33,29,24,.25)}
.comparison-label{position:absolute;top:12px;font-size:10.5px;letter-spacing:.14em;font-weight:700;padding:5px 9px;border-radius:999px;background:rgba(250,248,243,.92);color:var(--ink)}
.comparison-label.before{left:12px}.comparison-label.after{right:12px;color:var(--accent-deep)}
.comparison-hint{font-size:12.5px;color:var(--ink-3)}
input[type="range"]{width:100%;accent-color:var(--accent)}

/* ---- Controls ---- */
label{display:block;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--ink-3);font-weight:600;margin:15px 0 6px}
label>input,label>select,label>textarea{margin-top:0}
input,select,textarea{width:100%;background:#fff;border:1px solid var(--line);border-radius:var(--r-ctl);padding:11px 12px;font:inherit;font-size:14px;color:var(--ink);transition:border-color .16s ease,box-shadow .16s ease}
input:focus,select:focus,textarea:focus{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-tint);outline:none}
textarea{min-height:84px;resize:vertical}
input[type="checkbox"],input[type="radio"]{width:auto;accent-color:var(--accent)}
button{font:inherit;font-size:13.5px;font-weight:600;background:var(--ink);color:#fdfcf9;border:1px solid var(--ink);border-radius:999px;padding:11px 20px;cursor:pointer;transition:background .16s ease,border-color .16s ease,color .16s ease}
button:hover{background:#000;border-color:#000}
button:disabled{opacity:.42;cursor:not-allowed}
button.secondary,.secondary button,a.secondary{background:transparent;color:var(--ink);border:1px solid var(--line)}
button.secondary:hover,a.secondary:hover{background:#fff;border-color:var(--accent);color:var(--accent-deep)}
.actions{display:flex;flex-wrap:wrap;gap:9px;align-items:center;margin-top:16px}
.row{display:flex;flex-wrap:wrap;gap:9px;align-items:center}
.pill{display:inline-flex;align-items:center;font-size:12px;font-weight:600;color:var(--ink-2);background:var(--ivory);border:1px solid var(--line-soft);border-radius:999px;padding:5px 11px}
.tag{display:inline-block;font-size:10.5px;font-weight:700;letter-spacing:.1em;color:var(--warn);background:var(--warn-bg);border-radius:999px;padding:3px 8px;vertical-align:2px}
.status{font-size:13px;color:var(--ink-2)}
.note{font-size:12.5px;color:var(--ink-3)}
.notice{font-size:13px;color:var(--ink-2);background:#f6f1e7;border:1px solid var(--line-soft);border-radius:10px;padding:11px 14px;margin:8px 0}
.file{position:absolute;width:1px;height:1px;opacity:0;overflow:hidden}

/* ---- Swatches & materials ---- */
.swatches{display:flex;gap:9px;margin-top:4px}
.swatch{width:38px;height:38px;border-radius:50%;border:2px solid #fff;box-shadow:0 0 0 1px var(--line);padding:0;cursor:pointer}
.swatch[aria-pressed="true"]{box-shadow:0 0 0 2px var(--accent)}
.scope-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:10px}
.scope-option{display:flex;align-items:center;gap:10px;background:#fff;border:1px solid var(--line);border-radius:var(--r-ctl);padding:10px 12px;font-size:13px;color:var(--ink);text-transform:none;letter-spacing:0;font-weight:500;margin:0}
.scope-description{font-size:12.5px;color:var(--ink-3)}
.material-library{margin-top:40px;padding:28px 0 4px;border-top:1px solid var(--line-soft)}
.material-head{display:flex;align-items:end;justify-content:space-between;gap:20px;flex-wrap:wrap}
.material-head h3{font-family:"Fraunces",Georgia,serif;font-size:clamp(24px,2.6vw,32px);font-weight:400;margin:6px 0 0}
.material-head p{color:var(--ink-2);max-width:520px;margin:0;font-size:13.5px}
.material-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-top:18px}
.material-card{border:1px solid var(--line);background:var(--card);border-radius:14px;padding:14px;text-align:left;display:flex;flex-direction:column;gap:7px;cursor:pointer;color:var(--ink);font-weight:500}
.material-card strong{font-family:"Fraunces",Georgia,serif;font-size:18px;font-weight:400}
.material-card small{color:var(--ink-3);font-size:11.5px}
.material-card .texture{height:64px;border-radius:9px;display:block}
.material-card[aria-pressed="true"]{border-color:var(--accent);box-shadow:inset 0 0 0 1px var(--accent)}
.texture-oak{background:linear-gradient(135deg,#c8a878,#a9854f)}
.texture-stone{background:linear-gradient(135deg,#ddd6c8,#c2b8a4)}
.texture-sage{background:linear-gradient(135deg,#a8b39a,#8a987c)}
.texture-charcoal{background:linear-gradient(135deg,#4a4a48,#2c2c2a)}

/* ---- Planner ---- */
#interiorPlanner{margin-top:0}
#floorPlan{border:1.5px solid var(--ink-3)!important;border-radius:12px!important;background-color:#fffdf9!important;box-shadow:inset 0 1px 6px rgba(33,29,24,.05)}
#floorPlan button{border-radius:8px;border:1px solid var(--line);background:var(--ivory);color:var(--ink);font-size:12px;font-weight:600;padding:4px 6px;box-shadow:0 1px 3px rgba(33,29,24,.12)}
#floorPlan button:hover{border-color:var(--accent)}
#furnitureItems .row,#furnitureItems>div{border-top:1px solid var(--line-soft);padding:10px 0}
table{width:100%;border-collapse:collapse;font-size:13.5px}
th{font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--ink-3);text-align:left;font-weight:600}
th,td{padding:9px 8px;border-bottom:1px solid var(--line-soft)}

/* ---- Budget summary band ---- */
#budgetPanel .status:first-of-type,#budgetPanel p.status{background:var(--ivory);border:1px solid var(--line-soft);border-radius:12px;padding:13px 16px;font-size:14px;color:var(--ink)}

/* ---- Concept history filmstrip ---- */
#conceptHistoryList{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:12px;margin-top:12px}
#conceptHistoryList .room-card{background:#fff;border:1px solid var(--line);border-radius:12px;padding:12px}
#conceptHistoryList img{border-radius:8px;width:100%}

/* ---- Quiet disclosures (progressive disclosure, open by default) ---- */
details.quiet{border-top:1px solid var(--line-soft);margin-top:16px;padding-top:4px}
details.quiet>summary{font-size:11.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--ink-2);font-weight:700;cursor:pointer;padding:9px 0;list-style:none}
details.quiet>summary::-webkit-details-marker{display:none}
details.quiet>summary::after{content:" –";color:var(--ink-3)}
details.quiet:not([open])>summary::after{content:" +"}

.studio-footer{display:flex;justify-content:space-between;gap:14px;flex-wrap:wrap;margin:38px 0 6px;padding-top:18px;border-top:1px solid var(--line-soft);font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--ink-3)}

/* ---- Responsive ---- */
@media(max-width:1020px){
  .workspace{grid-template-columns:1fr}
  .intro{grid-template-columns:1fr;align-items:start}
  .material-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
}
@media(max-width:760px){
  .journey-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
  .layout{grid-template-columns:1fr}
  .panel,.surface{padding:20px}
  .stage{min-height:300px}
  header{padding:12px 18px}
}
@media(max-width:420px){
  .journey-card{min-height:108px;padding:14px}
  .journey-card strong{font-size:18px}
  .material-grid{grid-template-columns:1fr}
}
/* UF-PV-7: at narrow widths the six journey stages overflowed one line and
   stages 4-6 were clipped inside a hidden-scrollbar scroll area. Wrap the
   strip so every stage stays visible, and give stages extra scroll margin
   for the taller sticky strip. UF-PV-8 (CX polish): the same internal
   overflow persisted at 741-760px (18px at 741, 0 at 761) because the wrap
   stopped at 740px while the single-row strip needs 700px — extend the
   identical wrap + scroll-margin treatment to 768px. At 761-768px the
   items fit on one row, so wrapping changes nothing there. */
@media(max-width:768px){
  .journey{flex-wrap:wrap;gap:4px 18px;overflow-x:visible}
  section.vx-stage{scroll-margin-top:100px}
  .stage-block,#stageProject,#stageVision,#stageConcept,#interiorPlanner{scroll-margin-top:100px}
}

/* ---- Guided platform components (2026-11-19) ---- */
.gx-rate-row{display:grid;grid-template-columns:auto 130px 90px 84px 1fr 110px;gap:8px;align-items:center;margin:6px 0}
.gx-rate-row label.gx-rate-use{margin:0;text-transform:none;letter-spacing:0;font-size:13px;color:var(--ink);font-weight:600}
.gx-rate-row input[type="checkbox"]{width:16px;height:16px}
.gx-layout-card{border:1px solid var(--line);border-radius:12px;padding:14px;margin:12px 0;background:#fff}
.gx-layout-stage{position:relative;width:100%;background:var(--ivory);border:1px solid var(--line);border-radius:8px;overflow:hidden}
.gx-zone{position:absolute;border:1.5px dashed var(--accent);background:rgba(49,83,107,.08);color:var(--accent-deep);font-size:10.5px;font-weight:700;padding:3px 5px;overflow:hidden}
.gx-furn-block{position:absolute;background:#d5e2d8;border:1px solid #6c645b;border-radius:4px;color:#243c30;font-size:10px;font-weight:600;padding:2px 4px;overflow:hidden}
#gxConciergePanel textarea{width:100%}
#gxConciergeSummary{margin:10px 0 4px}
#gxNextActions>div{margin:6px 0}
@media(max-width:760px){.gx-rate-row{grid-template-columns:auto 1fr 84px;grid-auto-rows:auto}}
</style></head><body>
<header><h1><img src="/brand/icon-192.png" alt="" width="34" height="34" style="border-radius:8px;vertical-align:-7px;margin-right:10px">RENOVISION <span style="color:#729b86">AI</span></h1><a href="/operator">Operator workspace</a></header>
<main><section class="intro"><div><div class="eyebrow">The renovation design atelier · RENOVISION AI</div><h2>Spaces, <em>reimagined.</em></h2></div><div><p>Thoughtful transformations begin with a vision. Explore materials, finishes and architectural character—starting with a photograph of your own space.</p><div class="intro-meta">01 / Your space &nbsp; · &nbsp; 02 / Your vision &nbsp; · &nbsp; 03 / Your concept</div></div></section>
<nav aria-label="Design journey progress"><ol id="journeyStrip" class="journey"></ol></nav>
<section class="room-journeys" id="stageProject" aria-labelledby="journeyTitle"><div class="chapter">Choose a room to transform</div><h3 id="journeyTitle" class="journey-heading">Where shall we begin?</h3><p style="margin:0;font-size:13px">Select a room to tailor the renovation brief. Your photograph remains yours.</p><div class="journey-grid"><button type="button" class="journey-card" data-room="Kitchen" aria-pressed="false"><strong>Kitchen</strong><small>Cabinetry · surfaces · light</small></button><button type="button" class="journey-card" data-room="Bathroom" aria-pressed="false"><strong>Bathroom</strong><small>Tile · fixtures · sanctuary</small></button><button type="button" class="journey-card" data-room="Living room" aria-pressed="true"><strong>Living room</strong><small>Flow · furnishings · comfort</small></button><button type="button" class="journey-card" data-room="Bedroom" aria-pressed="false"><strong>Bedroom</strong><small>Texture · tranquility · layers</small></button></div></section><div class="layout workspace" id="stageVision"><div class="surface" id="stageConcept"><div class="studio-kicker"><strong>01 — Your existing space</strong><span>THE STARTING POINT</span></div><div class="stage" id="stage"><div class="empty" id="empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8" cy="9" r="2"/><path d="m3 17 6-6 4 4 3-3 5 5"/></svg><strong>Every space has potential.</strong><p>Choose a clear, well-lit room photograph to begin your renovation brief.</p><button id="choose">Upload room photo</button></div><img id="photo" class="hidden" alt="Original room photograph"></div><div class="toolbar"><span class="pill" id="photoStatus">No photo selected</span><div class="actions" style="margin:0"><button class="secondary" id="replace">Change photo</button><button class="secondary" id="clear">Clear</button></div></div><div class="preview"><span>Original photograph</span><strong id="renderState">AI redesign not generated</strong></div><div id="resultPanel" class="hidden" style="padding:20px;border-top:1px solid #e4e9e4"><strong>AI renovation concept</strong><p>Compare this concept with the original photo. Architectural details and dimensions require verification.</p><img id="resultPhoto" alt="AI-generated renovation concept" style="width:100%;max-height:470px;object-fit:contain;border-radius:10px"><div id="comparison" class="comparison hidden"><div class="comparison-stage"><img id="comparisonOriginal" alt="Original renovation source photo"><img id="comparisonConcept" class="comparison-top" alt="Generated design concept"><div class="comparison-divider" id="comparisonDivider"></div><span class="comparison-label before">BEFORE</span><span class="comparison-label after">CONCEPT</span></div><label for="comparisonRange">Compare original and concept</label><input id="comparisonRange" type="range" min="0" max="100" value="50" aria-label="Drag to compare before and after"><p class="comparison-hint">Move the slider to compare your original photo with the generated concept. Geometry is not verified.</p></div><div class="actions"><button class="secondary" id="downloadResult">Download concept</button><button class="secondary" id="showOriginal">View original</button><button class="secondary" id="showResult">View concept</button><button class="secondary" id="refineResult">Refine this concept</button></div></div><div class="notice">Your source photo stays on this device until you choose Generate. Generating sends the photo to the configured AI provider and may incur charges. Results are concepts, not construction drawings.</div></div>
<aside class="panel"><div class="chapter">02 — Curate your vision</div><h3>Your design story.</h3><p>Shape the atmosphere with thoughtful materials, color and the details that make a space feel like yours.</p>
<label for="room">Room type</label><select id="room"><option>Living room</option><option>Kitchen</option><option>Bathroom</option><option>Bedroom</option><option>Basement</option><option>Other</option></select>
<label for="style">Design style</label><select id="style"><option>Warm modern</option><option>Contemporary</option><option>Transitional</option><option>Modern farmhouse</option><option>Minimalist</option><option>Traditional</option></select>
<label>Palette</label><div class="swatches" id="swatches"><button class="swatch" style="background:#e9dfce" data-color="Warm neutral" aria-label="Warm neutral" aria-pressed="true"></button><button class="swatch" style="background:#d9ded7" data-color="Soft sage" aria-label="Soft sage" aria-pressed="false"></button><button class="swatch" style="background:#8d9ca6" data-color="Coastal blue" aria-label="Coastal blue" aria-pressed="false"></button><button class="swatch" style="background:#b6a58f" data-color="Natural oak" aria-label="Natural oak" aria-pressed="false"></button></div>
<label>Renovation priorities</label><p class="scope-description">Select the work you are considering. These are planning ideas, not a contractor estimate.</p><div class="scope-grid" id="scopeGrid" role="group" aria-label="Renovation scope selections"></div><label for="changes">What would you change?</label><textarea id="changes" placeholder="For example: replace flooring with light oak, brighten the walls, update cabinets and add contemporary furniture."></textarea>
<div class="actions"><button id="save">Download design brief</button><button class="secondary" id="downloadScope">Download contractor scope</button><button class="secondary" id="reviewScope">Enter contractor estimates</button></div><section id="renderPanel"><h3 class="rail-title">Project &amp; concept</h3><p id="renderAvailability" class="status">Checking image-generation availability...</p><details class="quiet"><summary>Project details — create or open a project</summary><label for="projectId">Project ID</label><input id="projectId" autocomplete="off" placeholder="e.g. kitchen-refresh-01"><label for="propertyId">Property ID</label><input id="propertyId" autocomplete="off" placeholder="Your property record ID"><label for="roomId">Room ID</label><input id="roomId" autocomplete="off" placeholder="e.g. kitchen"><div class="actions"><button class="secondary" id="createProject">Create / open project</button><span id="projectState" class="status">No project selected</span></div></details><details class="quiet"><summary>Account — sign in to generate</summary><label for="renderEmail">Account email</label><input id="renderEmail" type="email" autocomplete="username" placeholder="Your RENOVISION account email"><label for="renderPassword">Password</label><input id="renderPassword" type="password" autocomplete="current-password" placeholder="Your account password"><div class="actions"><button class="secondary" id="signIn">Sign in securely</button><button class="secondary" id="requestPasswordReset" type="button">Reset password</button><button class="secondary" id="signOut" disabled>Sign out</button><span id="authState" class="status">Not signed in</span></div></details><div class="actions"><button id="generate" disabled>Generate renovation concept</button></div><p class="note" id="generateGuidance">To generate a concept: 1) sign in under Account above, 2) create or open a project under Project details above, 3) add a room photo. Generate becomes available when all three are ready — the preview line under your photo names the step that is still needed.</p><p>AI concepts are visual ideas, not verified geometry or construction drawings. Generation may incur Google Cloud charges.</p></section><section aria-labelledby="conceptHistoryHeading"><h2 id="conceptHistoryHeading">Concept history</h2><p class="note">Generated concepts saved to this project, with the photo and brief that produced them. Concepts are design visualizations only — never verified measurements or construction documents. Simulated concepts (from test renderers) are labeled.</p><div class="row"><button id="loadConceptHistory" type="button">Load concept history</button></div><p id="conceptHistoryStatus" class="note" role="status">Nothing here yet. Concepts you generate while a project is open are saved here automatically; choose Load concept history to bring back a project’s earlier concepts.</p><div id="conceptHistoryList"></div></section><div class="status" id="status" role="status"></div></aside></div>
<section class="material-library" aria-labelledby="materialTitle"><div class="material-head"><div><div class="chapter">03 — Material inspiration</div><h3 id="materialTitle">A palette of possibilities.</h3></div><p>Explore a few timeless material directions. Select a finish to inform your renovation brief; these are illustrative swatches, not product samples.</p></div><div class="material-grid"><button type="button" class="material-card" data-material="Natural oak flooring and warm wood finishes" aria-pressed="false"><span class="texture texture-oak" aria-hidden="true"></span><strong>Natural oak</strong><small>Warmth · organic texture</small></button><button type="button" class="material-card" data-material="Light limestone and soft natural stone surfaces" aria-pressed="false"><span class="texture texture-stone" aria-hidden="true"></span><strong>Soft stone</strong><small>Quiet luxury · tactile surfaces</small></button><button type="button" class="material-card" data-material="Muted sage cabinetry and earthy accents" aria-pressed="false"><span class="texture texture-sage" aria-hidden="true"></span><strong>Muted sage</strong><small>Grounded · calming color</small></button><button type="button" class="material-card" data-material="Charcoal accents and refined dark metal finishes" aria-pressed="false"><span class="texture texture-charcoal" aria-hidden="true"></span><strong>Charcoal</strong><small>Contrast · architectural depth</small></button></div></section><div class="studio-footer"><strong>RENOVISION AI / DESIGN STUDIO</strong><span>Imagined with intention. Built with care.</span></div><input class="file" type="file" id="file" aria-label="Upload a room photo" accept="image/png,image/jpeg,image/webp"></main>
<section class="panel" id="interiorPlanner" aria-labelledby="plannerTitle" style="margin-top:28px"><div class="eyebrow">04 / INTERIOR DESIGN</div><h2 id="plannerTitle">Design within your space and budget.</h2><p>Build a room specification, add real furniture you find, and check dimensions and costs before purchasing. All prices and measurements are user-entered and unverified.</p><div class="layout"><div><label for="designStyle">Design style</label><select id="designStyle"><option>Modern organic</option><option>Contemporary</option><option>Minimalist</option><option>Scandinavian</option><option>Japandi</option><option>Mid-century modern</option><option>Traditional</option><option>Transitional</option><option>Industrial</option><option>Farmhouse</option><option>Coastal</option><option>Bohemian</option><option>Art Deco</option><option>Maximalist</option><option>Eclectic</option><option>French country</option><option>Mediterranean</option><option>Rustic</option><option>Luxury modern</option><option>Southwestern</option></select><label for="designMaterial">Material direction</label><select id="designMaterial"><option>White oak and linen</option><option>Walnut and leather</option><option>Travertine and boucle</option><option>Marble and brass</option><option>Concrete and black steel</option><option>Rattan and natural cotton</option><option>Terrazzo and lacquer</option><option>Painted cabinetry and quartz</option><option>Slate and dark wood</option><option>Terracotta and plaster</option></select><div class="layout"><div><label for="roomWidth">Room width (inches)</label><input id="roomWidth" type="number" min="1" step="0.1" placeholder="e.g. 144"></div><div><label for="roomDepth">Room depth (inches)</label><input id="roomDepth" type="number" min="1" step="0.1" placeholder="e.g. 180"></div></div><label for="clearance">Desired circulation clearance (inches)</label><input id="clearance" type="number" min="0" value="30" step="1"><label for="designBudget">Total furniture budget ($)</label><input id="designBudget" type="number" min="0" step="0.01" placeholder="e.g. 5000"></div><div><h3>Furniture shortlist</h3><p>Add product details and retailer links yourself. Catalog pricing and inventory are not live-connected.</p><label for="furnitureName">Product name</label><input id="furnitureName" placeholder="e.g. 84-inch sofa"><label for="furnitureRetailer">Retailer</label><input id="furnitureRetailer" placeholder="Store name"><label for="furnitureUrl">Product URL (https)</label><input id="furnitureUrl" type="url" placeholder="https://..."><div class="layout"><div><label for="furnitureWidth">Width (in)</label><input id="furnitureWidth" type="number" min="0.1" step="0.1"></div><div><label for="furnitureDepth">Depth (in)</label><input id="furnitureDepth" type="number" min="0.1" step="0.1"></div></div><label for="furniturePrice">Price ($)</label><input id="furniturePrice" type="number" min="0" step="0.01"><button id="addFurniture" type="button" style="margin-top:14px">Add furniture</button><div class="status" id="furnitureMessage" role="status"></div></div></div><div class="panel" style="margin-top:20px"><h3>2D space plan</h3><p>Drag furniture blocks to reposition them. Each item is shown at scale using its entered dimensions. Add doors, windows, walkways and fixed obstacles with the planning controls below; swing, clearance and circulation checks are advisory and cannot certify a layout.</p><div class="actions"><label for="obstacleType">Opening / obstacle</label><select id="obstacleType" style="max-width:180px"><option value="door">Door swing (approximate)</option><option value="window">Window zone</option><option value="fixed">Fixed obstacle</option></select><label for="obstacleX">X (in)</label><input id="obstacleX" type="number" min="0" value="0" style="max-width:95px"><label for="obstacleY">Y (in)</label><input id="obstacleY" type="number" min="0" value="0" style="max-width:95px"><label for="obstacleWidth">Width (in)</label><input id="obstacleWidth" type="number" min="1" value="36" style="max-width:95px"><label for="obstacleDepth">Depth (in)</label><input id="obstacleDepth" type="number" min="1" value="36" style="max-width:95px"><button id="addObstacle" type="button" class="secondary">Add zone</button><button id="clearObstacles" type="button" class="secondary">Clear zones</button></div><p id="obstacleMessage" class="status" role="status"></p><div class="actions"><button id="rotateFurniture" type="button" class="secondary">Rotate selected furniture 90°</button><span id="selectedFurnitureStatus" class="status">Select a furniture block to rotate it.</span></div><div id="floorPlan" style="position:relative;max-width:100%;width:100%;height:360px;background:repeating-linear-gradient(0deg,#eeeae3 0px,#eeeae3 1px,transparent 1px,transparent 24px),repeating-linear-gradient(90deg,#eeeae3 0px,#eeeae3 1px,transparent 1px,transparent 24px),#fbfaf7;border:2px solid #7c7368;border-radius:5px;overflow:hidden;touch-action:none" role="group" aria-label="Scaled room plan with draggable furniture"></div><p id="floorPlanStatus" class="status" role="status">Enter room dimensions to display a scaled plan.</p></div><div id="furnitureSummary" class="status" aria-live="polite"></div><div id="furnitureItems"></div><div class="actions"><button id="exportFurniturePlan" type="button" class="secondary">Download design and shopping plan</button><button id="clearFurniturePlan" type="button" class="secondary">Clear shortlist</button><a class="secondary" href="/3d-viewer" target="_blank" rel="noopener noreferrer" style="display:inline-flex;align-items:center;padding:10px 14px;text-decoration:none">Open 3D Asset Studio</a></div><p class="note">About the 3D Asset Studio: it opens in a new tab and only inspects sample or local .glb models — it does not generate a 3D model from your photo, and 3D generation is not available yet. Close its tab to return here.</p><p class="notice">Preliminary envelope check only. A product fitting the room rectangle does not prove a safe layout. Door swings, windows, paths, built-ins, delivery access, taxes and shipping are not included. Verify measurements, pricing and availability before purchase.</p></section>
<script>
const $=id=>document.getElementById(id);let photoUrl=null;let palette='Warm neutral';let fileName='';let sourceFile=null;let idToken=null;let authApiKey=null;let activeProjectId=null;let resultUrl=null;let resultMime=null;let resultBlob=null;let refinementSource=null;let sessionExpiresAt=0;let designRevision=0;
let renderingAvailable=false;fetch('/studio-capabilities').then(r=>r.json()).then(j=>{renderingAvailable=j.photoRendering?.enabled===true;$('renderAvailability').textContent=renderingAvailable?'Image generation available for authorized projects.':'Image generation is currently disabled. You can sign in, manage projects, upload photos, and download design briefs without paid rendering.';refreshGenerateButton()}).catch(()=>{$('renderAvailability').textContent='Image-generation availability could not be verified. Rendering remains disabled.'});fetch('/auth-config').then(r=>r.json()).then(j=>{authApiKey=j.signIn?.apiKey||null;if(!j.signIn?.configured)$('authState').textContent='Identity Platform sign-in is not configured'}).catch(()=>{});
let renderInFlight=false;function refreshGenerateButton(){const ready=Boolean(!renderInFlight&&renderingAvailable&&activeProjectId&&idToken&&Date.now()<sessionExpiresAt&&(sourceFile||refinementSource));$('generate').disabled=!ready;if(!resultUrl&&!renderInFlight){$('renderState').textContent=!renderingAvailable?'Concept generation unavailable':(!idToken||Date.now()>=sessionExpiresAt)?'Sign in to generate a concept':!activeProjectId?'Create or open a project to generate':!(sourceFile||refinementSource)?'Add a room photo to generate':'Ready to generate'}}
function invalidateConcept({keepRefinement=false}={}){designRevision++;if(!keepRefinement)refinementSource=null;refreshGenerateButton();if(!resultUrl)return;if($('photo').getAttribute('src')===resultUrl){if(photoUrl)$('photo').src=photoUrl;else $('photo').removeAttribute('src')}URL.revokeObjectURL(resultUrl);resultUrl=null;resultBlob=null;resultMime=null;$('resultPhoto').removeAttribute('src');$('comparisonConcept').removeAttribute('src');$('comparison').classList.add('hidden');$('resultPanel').classList.add('hidden');$('renderState').textContent='Concept outdated — generate again';$('status').textContent='Design brief changed. Previous concept cleared to prevent a misleading comparison.'}
function clearPhoto(){designRevision++;refinementSource=null;$('comparison').classList.add('hidden');if(resultUrl){URL.revokeObjectURL(resultUrl);resultUrl=null;resultMime=null;resultBlob=null;refinementSource=null;$('resultPanel').classList.add('hidden');$('renderState').textContent='AI redesign not generated'}if(photoUrl)URL.revokeObjectURL(photoUrl);photoUrl=null;sourceFile=null;fileName='';$('photo').removeAttribute('src');$('photo').classList.add('hidden');$('empty').classList.remove('hidden');$('photoStatus').textContent='No photo selected';$('file').value='';refreshGenerateButton()}
$('choose').onclick=$('replace').onclick=()=>$('file').click();$('clear').onclick=clearPhoto;
$('file').onchange=()=>{const f=$('file').files[0];if(!f)return;if(!['image/jpeg','image/png','image/webp'].includes(f.type)||f.size>10*1024*1024){$('status').textContent='Choose a JPG, PNG, or WebP under 10 MB.';return}clearPhoto();sourceFile=f;photoUrl=URL.createObjectURL(f);fileName=f.name;$('photo').src=photoUrl;$('photo').classList.remove('hidden');$('empty').classList.add('hidden');$('photoStatus').textContent=f.name;$('status').textContent='Photo ready — it stays on this device until you choose Generate. Next: pick your style and finishes, then Generate renovation concept.';refreshGenerateButton()};
$('requestPasswordReset').onclick=async()=>{const email=$('renderEmail').value.trim();if(!authApiKey){$('authState').textContent='Password recovery unavailable: sign-in configuration missing.';return}if(!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email)){$('authState').textContent='Enter your account email before requesting a reset.';return}const button=$('requestPasswordReset');button.disabled=true;$('authState').textContent='Requesting password recovery…';try{const response=await fetch('https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key='+encodeURIComponent(authApiKey),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({requestType:'PASSWORD_RESET',email})});if(!response.ok)throw Error('request failed');$('authState').textContent='If this email is eligible, follow the password recovery instructions sent to it. Do not share the link.'}catch{$('authState').textContent='Password recovery could not be requested. Try again later or contact your account administrator.'}finally{button.disabled=false}};
let authAttempt=0;for(const id of ['renderEmail','renderPassword'])$(id).addEventListener('input',()=>{authAttempt++});$('signIn').onclick=async()=>{if(!authApiKey){$('authState').textContent='Sign-in configuration unavailable';return}const b=$('signIn');const attempt=++authAttempt;const email=$('renderEmail').value.trim();b.disabled=true;$('authState').textContent='Signing in…';try{const r=await fetch('https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key='+encodeURIComponent(authApiKey),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email,password:$('renderPassword').value,returnSecureToken:true})});const data=await r.json();if(attempt!==authAttempt)return;if(!r.ok)throw Error(data.error?.message||'Sign-in failed');invalidateConcept();resetEstimateWorksheet();idToken=data.idToken;sessionExpiresAt=Date.now()+Math.max(0,Number(data.expiresIn||3600)-60)*1000;activeProjectId=null;$('projectState').textContent='No project selected';$('renderPassword').value='';$('signOut').disabled=false;$('authState').textContent='Signed in · '+data.email;refreshGenerateButton()}catch(e){if(attempt!==authAttempt)return;idToken=null;sessionExpiresAt=0;activeProjectId=null;$('projectState').textContent='No project selected';$('generate').disabled=true;$('signOut').disabled=true;$('authState').textContent='Sign-in failed: '+e.message}finally{b.disabled=false}};
$('signOut').onclick=()=>{authAttempt++;invalidateConcept();resetEstimateWorksheet();idToken=null;sessionExpiresAt=0;activeProjectId=null;$('renderPassword').value='';$('signOut').disabled=true;$('generate').disabled=true;$('authState').textContent='Signed out';$('projectState').textContent='No project selected'};function sessionReady(){if(!idToken)return false;if(Date.now()<sessionExpiresAt)return true;$('signOut').click();$('authState').textContent='Session expired. Sign in again.';return false};$('createProject').onclick=async()=>{if(!sessionReady()){$('projectState').textContent='Sign in first';return}const projectId=$('projectId').value.trim(),propertyId=$('propertyId').value.trim(),roomId=$('roomId').value.trim();if(!projectId||!propertyId||!roomId){$('projectState').textContent='Project, property and room IDs are required';return}const b=$('createProject');const requestedRevision=designRevision;const requestedToken=idToken;const requestCurrent=()=>requestedRevision===designRevision&&requestedToken===idToken&&projectId===$('projectId').value.trim()&&propertyId===$('propertyId').value.trim()&&roomId===$('roomId').value.trim();b.disabled=true;try{const r=await fetch('/api/renovision/projects',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+idToken},body:JSON.stringify({projectId,propertyId,roomId})});const d=await r.json();if(!r.ok&&r.status!==409)throw Error((d.errors||['Project creation failed']).join(', '));let resolvedProject=d.project;if(r.status===409){const check=await fetch('/api/renovision/projects/'+encodeURIComponent(projectId),{headers:{authorization:'Bearer '+requestedToken}});if(!check.ok)throw Error('Project exists but cannot be opened for this account');const existing=await check.json();resolvedProject=existing.project;}if(!requestCurrent()){$('projectState').textContent='Project details or session changed. Reopen the project to continue.';return}if(!resolvedProject||resolvedProject.projectId!==projectId||resolvedProject.propertyId!==propertyId||resolvedProject.roomId!==roomId)throw Error('Existing project does not match the selected property and room');if(activeProjectId!==projectId){invalidateConcept();resetEstimateWorksheet()}activeProjectId=projectId;$('projectState').textContent='Project ready · '+projectId;refreshGenerateButton()}catch(e){if(requestCurrent()){activeProjectId=null;$('generate').disabled=true;$('projectState').textContent=e.message}}finally{b.disabled=false}};
$('generate').onclick=async()=>{if(renderInFlight)return;if(!renderingAvailable){$('status').textContent='Image generation is disabled; no paid request was sent.';return}if(!(refinementSource||sourceFile)||!activeProjectId||!sessionReady()){$('status').textContent='Choose a photo and provide an authorized project and session.';return}const btn=$('generate');const requestedRevision=designRevision;const requestedProject=activeProjectId;const requestedToken=idToken;const renderCurrent=()=>requestedRevision===designRevision&&requestedProject===activeProjectId&&requestedToken===idToken;renderInFlight=true;btn.disabled=true;$('status').textContent='Generating renovation concept…';try{const renderSource=refinementSource||sourceFile;const bytes=new Uint8Array(await renderSource.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));const priorities=[...(scopeSelections.get($('room').value)||new Set())];const prompt=[$('room').value,$('style').value,palette,priorities.length?'Renovation priorities: '+priorities.join(', '):'',selectedMaterial,$('changes').value].filter(Boolean).join('. ');if(!renderCurrent())return;const response=await fetch('/api/renovision/projects/'+encodeURIComponent(requestedProject)+'/render-photo',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+requestedToken},body:JSON.stringify({mimeType:renderSource.type,imageBase64:btoa(binary),prompt})});const result=await response.json();if(!renderCurrent()){$('status').textContent='Design or session changed while generating. Outdated result discarded.';return}if(!response.ok||!result.ok)throw Error((result.errors||[result.error||'Generation unavailable']).join(', '));if(resultUrl)URL.revokeObjectURL(resultUrl);const decoded=atob(result.imageBase64);const array=new Uint8Array(decoded.length);for(let i=0;i<decoded.length;i++)array[i]=decoded.charCodeAt(i);resultMime=result.mimeType;resultBlob=new Blob([array],{type:resultMime});resultUrl=URL.createObjectURL(resultBlob);refinementSource=null;$('resultPhoto').src=resultUrl;$('comparisonOriginal').src=photoUrl;$('comparisonConcept').src=resultUrl;$('comparisonRange').value='50';updateComparison();$('comparison').classList.remove('hidden');$('resultPanel').classList.remove('hidden');$('renderState').textContent='AI concept generated';$('status').textContent=result.disclosure;if(window.__rvOnConcept)window.__rvOnConcept({resultBlob,resultMime,prompt,disclosure:result.disclosure,provider:result.provider||{kind:'vertex',simulated:false},source:renderSource});}catch(e){if(renderCurrent())$('status').textContent='Generation not completed: '+e.message}finally{renderInFlight=false;refreshGenerateButton();}};
$('downloadResult').onclick=()=>{if(!resultUrl)return;const a=document.createElement('a');a.href=resultUrl;a.download='renovision-concept.'+(resultMime==='image/jpeg'?'jpg':resultMime==='image/webp'?'webp':'png');a.click()};$('refineResult').onclick=()=>{if(!resultBlob)return;refinementSource=resultBlob;refreshGenerateButton();$('status').textContent='Concept selected for refinement. Describe the next changes, then select Generate renovation concept.';$('changes').focus()};$('showOriginal').onclick=()=>{if(photoUrl){$('photo').src=photoUrl;$('stage').scrollIntoView({behavior:'smooth'})}};$('showResult').onclick=()=>{if(resultUrl){$('photo').src=resultUrl;$('stage').scrollIntoView({behavior:'smooth'})}};
for(const id of ['projectId','propertyId','roomId'])$(id).addEventListener('input',()=>{invalidateConcept();resetEstimateWorksheet();activeProjectId=null;$('generate').disabled=true;$('projectState').textContent='Project details changed; create or open to continue'});
let selectedMaterial='';const roomScopes={Kitchen:['Cabinetry','Countertops','Backsplash','Lighting','Flooring','Appliances'],Bathroom:['Tile and shower','Vanity','Fixtures','Lighting','Flooring','Storage'],'Living room':['Flooring','Paint and walls','Lighting','Windows','Built-ins','Furniture layout'],Bedroom:['Flooring','Paint and walls','Lighting','Closet storage','Windows','Furniture layout'],Basement:['Flooring','Framing and drywall','Lighting','Egress and windows','Bathroom','Storage'],Other:['Flooring','Paint and walls','Lighting','Windows','Storage','Layout']};const scopeSelections=new Map();function renderScopes(){const room=$('room').value;const selected=scopeSelections.get(room)||new Set();const grid=$('scopeGrid');grid.replaceChildren();for(const item of roomScopes[room]||roomScopes.Other){const label=document.createElement('label');label.className='scope-option';const input=document.createElement('input');input.type='checkbox';input.checked=selected.has(item);input.addEventListener('change',()=>{invalidateConcept();resetEstimateWorksheet();const set=scopeSelections.get(room)||new Set();input.checked?set.add(item):set.delete(item);scopeSelections.set(room,set)});label.append(input,document.createTextNode(item));grid.append(label)}}
function syncRoomJourney(){invalidateConcept();resetEstimateWorksheet();renderScopes();document.querySelectorAll('.journey-card').forEach(c=>c.setAttribute('aria-pressed',String(c.dataset.room===$('room').value)))}document.querySelectorAll('.journey-card').forEach(c=>c.onclick=()=>{$('room').value=c.dataset.room;syncRoomJourney();$('status').textContent=c.dataset.room+' selected. Choose your finishes and upload a room photograph.'});$('room').addEventListener('change',syncRoomJourney);
function updateComparison(){const n=Number($('comparisonRange').value);$('comparisonConcept').style.clipPath='inset(0 0 0 '+n+'%)';$('comparisonDivider').style.left=n+'%'}$('comparisonRange').oninput=updateComparison;
document.querySelectorAll('.material-card').forEach(card=>card.onclick=()=>{const wasSelected=card.getAttribute('aria-pressed')==='true';document.querySelectorAll('.material-card').forEach(c=>c.setAttribute('aria-pressed','false'));selectedMaterial=wasSelected?'':card.dataset.material;invalidateConcept();if(!wasSelected)card.setAttribute('aria-pressed','true');$('status').textContent=selectedMaterial?'Material direction selected: '+selectedMaterial:'Material inspiration deselected.'});
document.querySelectorAll('.swatch').forEach(b=>b.onclick=()=>{if(palette!==b.dataset.color)invalidateConcept();palette=b.dataset.color;document.querySelectorAll('.swatch').forEach(x=>x.setAttribute('aria-pressed',String(x===b)))});
for(const id of ['style','changes'])$(id).addEventListener(id==='style'?'change':'input',()=>invalidateConcept({keepRefinement:id==='changes'}));
renderScopes();$('save').onclick=()=>{const data={product:'RENOVISION AI',type:'renovation-design-brief',formatVersion:2,createdAt:new Date().toISOString(),project:activeProjectId?{projectId:activeProjectId,propertyId:$('propertyId').value.trim(),roomId:$('roomId').value.trim()}:null,room:$('room').value,style:$('style').value,palette,materialDirection:selectedMaterial||null,changes:$('changes').value,renovationPriorities:[...(scopeSelections.get($('room').value)||new Set())],sourcePhotoFilename:fileName||null,renderingStatus:resultUrl?'concept-generated':'not-generated',refinementPending:Boolean(refinementSource),note:'Original photograph is not embedded or uploaded. This is a design brief, not an AI-generated renovation.'};const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='renovision-design-brief.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);$('status').textContent='Design brief downloaded.'};
function downloadJson(data,filename){const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
$('downloadScope').onclick=()=>{const room=$('room').value;const selected=[...(scopeSelections.get(room)||new Set())];const scope={product:'RENOVISION AI',type:'contractor-scope-draft',formatVersion:1,createdAt:new Date().toISOString(),project:activeProjectId?{projectId:activeProjectId,propertyId:$('propertyId').value.trim(),roomId:$('roomId').value.trim()}:null,room,style:$('style').value,palette,materialDirection:selectedMaterial||null,customerNotes:$('changes').value,items:selected.map((name,index)=>({itemId:'S-'+String(index+1).padStart(3,'0'),description:name,quantity:null,unit:null,materialsCost:null,laborCost:null,contractorEstimate:null,permitReviewRequired:null,status:'requires-contractor-review'})),estimateStatus:'not-estimated',totalCost:null,disclaimer:'Planning draft only. No dimensions, quantities, permits, pricing, or contractor commitments have been verified. Contractor must inspect the property, confirm scope, and supply estimates.'};downloadJson(scope,'renovision-contractor-scope.json');$('status').textContent=selected.length?'Contractor scope draft downloaded. Pricing and quantities require contractor review.':'Empty contractor scope downloaded. Select renovation priorities to populate it.'};
const scopeEstimateInputs=new Map();function resetEstimateWorksheet(){scopeEstimateInputs.clear();const source=document.getElementById('contractorName');if(source)source.value='';const panel=document.getElementById('scopeReview');if(panel)panel.classList.add('hidden')}
const scopeReview=document.createElement('section');scopeReview.id='scopeReview';scopeReview.className='panel hidden';scopeReview.style.marginTop='20px';scopeReview.innerHTML='<h3>Contractor estimate worksheet</h3><p>Enter documented amounts supplied by your contractor. Blank values mean unknown. These entries are not verified or approved by RENOVISION.</p><div id="scopeReviewItems"></div><label for="contractorName">Contractor / estimate source</label><input id="contractorName" placeholder="Contractor name or estimate reference"><div class="actions"><button id="exportEstimate" type="button">Download estimate worksheet</button><button class="secondary" id="closeScopeReview" type="button">Close worksheet</button></div><p id="scopeReviewStatus" class="status"></p>';
$('renderPanel').parentElement.append(scopeReview);
function reviewScopeRows(){const room=$('room').value;const selected=[...(scopeSelections.get(room)||new Set())];const grid=$('scopeReviewItems');grid.replaceChildren();for(const name of selected){const key=room+'|'+name;const values=scopeEstimateInputs.get(key)||{};const wrapper=document.createElement('div');wrapper.style.borderBottom='1px solid #dedbd4';wrapper.style.padding='12px 0';const title=document.createElement('strong');title.textContent=name;wrapper.append(title);for(const [field,label] of [['quantity','Quantity'],['unit','Unit'],['materialsCost','Materials total ($)'],['laborCost','Labor total ($)']]){const lab=document.createElement('label');lab.textContent=label;const input=document.createElement('input');input.dataset.field=field;input.dataset.scope=key;input.type=field==='unit'?'text':'number';if(input.type==='number'){input.min='0';input.step='any'}input.value=values[field]??'';input.addEventListener('input',()=>{const current=scopeEstimateInputs.get(key)||{};current[field]=input.value;scopeEstimateInputs.set(key,current)});lab.append(input);wrapper.append(lab)}grid.append(wrapper)}$('scopeReviewStatus').textContent=selected.length?'Enter contractor-supplied figures. Missing values remain unknown.':'Select renovation priorities before entering estimates.'}
$('reviewScope').onclick=()=>{reviewScopeRows();scopeReview.classList.remove('hidden');scopeReview.scrollIntoView({behavior:'smooth'})};
$('closeScopeReview').onclick=()=>scopeReview.classList.add('hidden');
$('exportEstimate').onclick=()=>{const room=$('room').value;const selected=[...(scopeSelections.get(room)||new Set())];const contractor=$('contractorName').value.trim();if(!selected.length){$('scopeReviewStatus').textContent='Select at least one renovation priority.';return}if(!contractor){$('scopeReviewStatus').textContent='Enter the contractor or estimate source before exporting.';return}const parse=(value,{positive=false,money=false}={})=>{if(value===undefined||value===null||String(value).trim()==='')return null;const n=Number(value);if(!Number.isFinite(n)||(positive?n<=0:n<0))return null;if(money&&(!Number.isSafeInteger(Math.round(n*100))||Math.abs(n*100-Math.round(n*100))>0.000001))return null;return n};const items=selected.map((name,index)=>{const v=scopeEstimateInputs.get(room+'|'+name)||{};const quantity=parse(v.quantity,{positive:true}),materialsCost=parse(v.materialsCost,{money:true}),laborCost=parse(v.laborCost,{money:true});return {itemId:'S-'+String(index+1).padStart(3,'0'),description:name,quantity,unit:v.unit?.trim()||null,materialsCost,laborCost,lineTotal:materialsCost!==null&&laborCost!==null&&Number.isSafeInteger(Math.round((materialsCost+laborCost)*100))?Math.round((materialsCost+laborCost)*100)/100:null,status:'contractor-input-unverified'}});const complete=items.every(x=>x.quantity!==null&&x.unit&&x.lineTotal!==null);const sumCents=complete?items.reduce((sum,x)=>sum+Math.round(x.lineTotal*100),0):null;const totalCost=sumCents!==null&&Number.isSafeInteger(sumCents)?sumCents/100:null;downloadJson({product:'RENOVISION AI',type:'contractor-estimate-worksheet',formatVersion:1,createdAt:new Date().toISOString(),project:activeProjectId?{projectId:activeProjectId,propertyId:$('propertyId').value.trim(),roomId:$('roomId').value.trim()}:null,room,contractorSource:contractor,items,totalCost,estimateStatus:complete&&totalCost!==null?'entered-unverified':'incomplete',disclaimer:'Contractor-entered figures only. RENOVISION has not verified quantities, labor, materials, permits, contractor licensing, or estimate accuracy. No approval or contract is implied.'},'renovision-contractor-estimate.json');$('scopeReviewStatus').textContent=complete&&totalCost!==null?'Worksheet exported with calculated subtotal; amounts remain unverified.':'Incomplete worksheet exported. Total withheld until every work item has quantity, unit, materials and labor.'};

const furnitureItems=[];const obstacles=[];let selectedFurniture=-1;const moneyCents=n=>{const v=Number(n);return Number.isFinite(v)&&v>=0&&Number.isSafeInteger(Math.round(v*100))&&Math.abs(v*100-Math.round(v*100))<0.000001?Math.round(v*100):null};const dimension=n=>{const v=Number(n);return n!==''&&Number.isFinite(v)&&v>0&&v<=100000?v:null};const safeText=t=>String(t).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));function furnitureFit(item){const w=dimension($('roomWidth').value),d=dimension($('roomDepth').value),c=Number($('clearance').value);if(w===null||d===null||!Number.isFinite(c)||c<0)return 'Room dimensions needed';return (item.width+c<=w&&item.depth+c<=d)||(item.depth+c<=w&&item.width+c<=d)?'Fits room envelope with stated clearance (layout unverified)':'Does not fit room envelope with stated clearance'}function drawFloorPlan(){const host=$('floorPlan'),status=$('floorPlanStatus');const planHadFocus=host.contains(document.activeElement);host.replaceChildren();const w=dimension($('roomWidth').value),d=dimension($('roomDepth').value);if(w===null||d===null){status.textContent='Enter valid room width and depth to position furniture.';return}const scale=Math.min((host.clientWidth-16)/w,340/d);if(!Number.isFinite(scale)||scale<=0)return;const surface=document.createElement('div');surface.style.cssText='position:relative;margin:8px;background:#f4f0e9;border:2px solid #756d60;box-sizing:border-box;width:'+w*scale+'px;height:'+d*scale+'px';host.append(surface);let overlaps=0,offRoom=0,zoneConflicts=0;obstacles.forEach(zone=>{const z=document.createElement('div');z.title=zone.type+' (approximate)';z.textContent=zone.type;z.style.cssText='position:absolute;pointer-events:none;overflow:hidden;border:2px dashed #a36e51;background:#eac9ac66;color:#663b24;font-size:10px;left:'+zone.x*scale+'px;top:'+zone.y*scale+'px;width:'+zone.width*scale+'px;height:'+zone.depth*scale+'px';surface.append(z)});furnitureItems.forEach((item,i)=>{if(!Number.isFinite(item.x))item.x=0;if(!Number.isFinite(item.y))item.y=0;const iw=item.rotated?item.depth:item.width, id=item.rotated?item.width:item.depth;const inside=item.x>=0&&item.y>=0&&item.x+iw<=w&&item.y+id<=d;if(!inside)offRoom++;for(const zone of obstacles){if(item.x<zone.x+zone.width&&item.x+iw>zone.x&&item.y<zone.y+zone.depth&&item.y+id>zone.y)zoneConflicts++}for(let j=0;j<i;j++){const other=furnitureItems[j];if(item.x<other.x+(other.rotated?other.depth:other.width)&&item.x+iw>other.x&&item.y<other.y+(other.rotated?other.width:other.depth)&&item.y+id>other.y)overlaps++}const block=document.createElement('button');block.type='button';block.textContent=item.name;block.onclick=()=>{selectedFurniture=i;$('selectedFurnitureStatus').textContent='Selected: '+item.name};block.title=item.name+' — drag to reposition';block.setAttribute('aria-label','Move '+item.name+' using drag or arrow keys');block.style.cssText='position:absolute;overflow:hidden;white-space:normal;word-break:break-word;font-size:11px;padding:3px;touch-action:none;border:1px solid #6c645b;border-radius:3px;background:'+(inside?'#d5e2d8':'#efc8b8')+';color:#243c30;left:'+item.x*scale+'px;top:'+item.y*scale+'px;width:'+Math.max(2,iw*scale)+'px;height:'+Math.max(2,id*scale)+'px';block.onpointerdown=e=>{if(e.button!==0)return;e.preventDefault();selectedFurniture=i;$('selectedFurnitureStatus').textContent='Selected: '+item.name;block.focus();block.setPointerCapture(e.pointerId);const sx=e.clientX,sy=e.clientY,ox=item.x,oy=item.y;block.onpointermove=ev=>{item.x=Math.round(Math.max(0,Math.min(w-iw,ox+(ev.clientX-sx)/scale))*10)/10;item.y=Math.round(Math.max(0,Math.min(d-id,oy+(ev.clientY-sy)/scale))*10)/10;block.style.left=item.x*scale+'px';block.style.top=item.y*scale+'px'};block.onpointerup=()=>{block.onpointermove=null;drawFloorPlan()}};block.onkeydown=e=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();const step=e.shiftKey?6:1;item.x=Math.max(0,Math.min(w-iw,item.x+(e.key==='ArrowRight'?step:e.key==='ArrowLeft'?-step:0)));item.y=Math.max(0,Math.min(d-id,item.y+(e.key==='ArrowDown'?step:e.key==='ArrowUp'?-step:0)));drawFloorPlan()};surface.append(block)});status.textContent=furnitureItems.length+' item(s) | '+offRoom+' outside room bounds | '+overlaps+' furniture overlaps | '+zoneConflicts+' obstacle-zone conflicts. Zones are approximate; real clearances and accessibility remain unverified.';if(planHadFocus&&selectedFurniture>=0){const nb=surface.querySelectorAll('button')[selectedFurniture];if(nb)nb.focus()}}
function updateFurniturePlan(){const budget=moneyCents($('designBudget').value);const total=furnitureItems.reduce((n,x)=>n+x.priceCents,0);const safeTotal=Number.isSafeInteger(total);$('furnitureSummary').textContent='Items: '+furnitureItems.length+' | Estimated merchandise: '+(safeTotal?'USD '+(total/100).toFixed(2):'unavailable')+' | Budget remaining: '+(budget!==null&&safeTotal?'USD '+((budget-total)/100).toFixed(2):'enter valid budget')+(budget!==null&&safeTotal&&total>budget?' | OVER BUDGET':'');$('furnitureItems').replaceChildren();furnitureItems.forEach((item,i)=>{const row=document.createElement('div');row.className='notice';const link=item.url?'<a href="'+safeText(item.url)+'" target="_blank" rel="noopener noreferrer">Retailer product page</a>':'';row.innerHTML='<strong>'+safeText(item.name)+'</strong> — '+safeText(item.retailer||'Retailer unspecified')+' — USD '+(item.priceCents/100).toFixed(2)+' — '+item.width+' × '+item.depth+' in. '+safeText(furnitureFit(item))+' '+link+' ';const remove=document.createElement('button');remove.type='button';remove.className='secondary';remove.textContent='Remove';remove.onclick=()=>{furnitureItems.splice(i,1);updateFurniturePlan()};row.append(remove);$('furnitureItems').append(row)});drawFloorPlan()}for(const id of ['roomWidth','roomDepth','clearance','designBudget'])$(id).addEventListener('input',updateFurniturePlan);$('addFurniture').onclick=()=>{const name=$('furnitureName').value.trim(),retailer=$('furnitureRetailer').value.trim(),rawUrl=$('furnitureUrl').value.trim(),width=dimension($('furnitureWidth').value),depth=dimension($('furnitureDepth').value),priceCents=moneyCents($('furniturePrice').value);let url='';try{if(rawUrl){const parsed=new URL(rawUrl);if(parsed.protocol!=='https:'||!parsed.hostname)throw Error('invalid');url=parsed.href}}catch{$('furnitureMessage').textContent='Use a valid HTTPS retailer URL.';return}if(!name||width===null||depth===null||priceCents===null||$('furniturePrice').value===''){$('furnitureMessage').textContent='Enter a product name, positive dimensions and valid price.';return}furnitureItems.push({name,retailer,url,width,depth,priceCents,x:0,y:0,rotated:false});$('furnitureMessage').textContent='Added to shortlist. Verify dimensions and retailer pricing.';updateFurniturePlan()};$('addObstacle').onclick=()=>{const w=dimension($('roomWidth').value),d=dimension($('roomDepth').value),x=Number($('obstacleX').value),y=Number($('obstacleY').value),width=dimension($('obstacleWidth').value),depth=dimension($('obstacleDepth').value);if(w===null||d===null||!Number.isFinite(x)||!Number.isFinite(y)||x<0||y<0||width===null||depth===null||x+width>w||y+depth>d){$('obstacleMessage').textContent='Enter a valid obstacle fully within the room.';return}obstacles.push({type:$('obstacleType').value,x,y,width,depth});$('obstacleMessage').textContent='Zone added. This is a rectangular approximation, not a verified door swing or window clearance.';drawFloorPlan()};$('clearObstacles').onclick=()=>{obstacles.length=0;$('obstacleMessage').textContent='Zones cleared.';drawFloorPlan()};$('rotateFurniture').onclick=()=>{const item=furnitureItems[selectedFurniture];if(!item){$('selectedFurnitureStatus').textContent='Select a furniture block first.';return}item.rotated=!item.rotated;drawFloorPlan();$('selectedFurnitureStatus').textContent=item.name+' rotated '+(item.rotated?'90°':'0°')};$('clearFurniturePlan').onclick=()=>{furnitureItems.length=0;obstacles.length=0;selectedFurniture=-1;updateFurniturePlan()};$('exportFurniturePlan').onclick=()=>{const budget=moneyCents($('designBudget').value),total=furnitureItems.reduce((n,x)=>n+x.priceCents,0);downloadJson({product:'RENOVISION AI',type:'interior-design-shopping-plan',formatVersion:1,room:$('room').value,style:$('designStyle').value,materialDirection:$('designMaterial').value,roomWidthInches:dimension($('roomWidth').value),roomDepthInches:dimension($('roomDepth').value),clearanceInches:Number($('clearance').value),budget:budget===null?null:budget/100,merchandiseTotal:Number.isSafeInteger(total)?total/100:null,obstacles,items:furnitureItems.map(x=>({...x,price:x.priceCents/100,fit:furnitureFit(x)})),disclaimer:'Preliminary user-entered shopping plan. Fit, safety, pricing, taxes, shipping, inventory and purchase links are unverified.'},'renovision-interior-shopping-plan.json')};

/* ===== RENOVISION design platform extension: openings, walkways, layouts,
   library, catalog, budget, persistent workspace. Appended to the studio
   script; uses the studio's own helpers ($, dimension, moneyCents,
   furnitureItems, obstacles, updateFurniturePlan, drawFloorPlan, idToken,
   activeProjectId). Units in this UI are inches; the server workspace is
   meters — conversion happens only at the workspace boundary. ===== */
const IN_M = 0.0254;
const toM = (inches) => Math.round(inches / 1 * IN_M * 1000) / 1000;
const toIn = (meters) => Math.round(meters / IN_M * 10) / 10;
const openings = [];
const walkways = [];
const planHistory = [];
let savedLayouts = new Map();
let activeLayoutName = "Layout 1";
let wsProducts = [];
let wsShopping = new Set();
let wsBudget = null;
let wsSelections = {styleId: null, paletteId: null, materialIds: []};
let libraryData = null;
let itemCounter = 0;

function planSnapshot() {
  return JSON.stringify({f: furnitureItems, o: obstacles, p: openings, w: walkways});
}
function planRestore(snap) {
  const s = JSON.parse(snap);
  furnitureItems.length = 0; s.f.forEach((x) => furnitureItems.push(x));
  obstacles.length = 0; s.o.forEach((x) => obstacles.push(x));
  openings.length = 0; s.p.forEach((x) => openings.push(x));
  walkways.length = 0; s.w.forEach((x) => walkways.push(x));
  selectedFurniture = -1;
  updateFurniturePlan();
}
function pushHistory() {
  const snap = planSnapshot();
  if (planHistory[planHistory.length - 1] !== snap) planHistory.push(snap);
  if (planHistory.length > 60) planHistory.shift();
}

function zoneRectsInches() {
  const w = dimension($("roomWidth").value), d = dimension($("roomDepth").value);
  if (w === null || d === null) return [];
  const zones = [];
  for (const o of openings) {
    if (o.kind === "window") {
      const strip = 0.6 / IN_M;
      if (o.wall === "north") zones.push({kind: "window", label: "window zone", x: o.offsetIn, y: 0, width: o.widthIn, depth: strip});
      if (o.wall === "south") zones.push({kind: "window", label: "window zone", x: o.offsetIn, y: d - strip, width: o.widthIn, depth: strip});
      if (o.wall === "west") zones.push({kind: "window", label: "window zone", x: 0, y: o.offsetIn, width: strip, depth: o.widthIn});
      if (o.wall === "east") zones.push({kind: "window", label: "window zone", x: w - strip, y: o.offsetIn, width: strip, depth: o.widthIn});
    } else if (o.direction !== "out") {
      const s = o.widthIn;
      if (o.wall === "north") zones.push({kind: "swing", label: "door swing", x: o.offsetIn, y: 0, width: s, depth: s});
      if (o.wall === "south") zones.push({kind: "swing", label: "door swing", x: o.offsetIn, y: d - s, width: s, depth: s});
      if (o.wall === "west") zones.push({kind: "swing", label: "door swing", x: 0, y: o.offsetIn, width: s, depth: s});
      if (o.wall === "east") zones.push({kind: "swing", label: "door swing", x: w - s, y: o.offsetIn, width: s, depth: s});
    }
  }
  for (const wk of walkways) zones.push({kind: "walkway", label: "walkway", x: wk.x, y: wk.y, width: wk.width, depth: wk.depth});
  return zones;
}

function renderZones() {
  const host = $("floorPlan");
  if (!host) return;
  host.querySelectorAll("[data-rv-zone]").forEach((el) => el.remove());
  const surface = host.querySelector("div");
  const w = dimension($("roomWidth").value), d = dimension($("roomDepth").value);
  if (!surface || w === null || d === null) return;
  const scale = Math.min((host.clientWidth - 16) / w, 340 / d);
  if (!Number.isFinite(scale) || scale <= 0) return;
  const colors = {swing: ["#b3543f", "#b3543f22"], window: ["#3f6fb5", "#3f6fb522"], walkway: ["#3f7d4e", "#3f7d4e1e"]};
  let swingHits = 0, windowHits = 0, walkwayHits = 0;
  for (const z of zoneRectsInches()) {
    const el = document.createElement("div");
    el.setAttribute("data-rv-zone", "1");
    el.title = z.label + " (approximate)";
    el.textContent = z.label;
    const c = colors[z.kind];
    el.style.cssText = "position:absolute;pointer-events:none;overflow:hidden;border:2px dashed " + c[0] + ";background:" + c[1] + ";color:" + c[0] + ";font-size:10px;left:" + z.x * scale + "px;top:" + z.y * scale + "px;width:" + z.width * scale + "px;height:" + z.depth * scale + "px";
    surface.append(el);
    for (const item of furnitureItems) {
      const iw = item.rotated ? item.depth : item.width, idp = item.rotated ? item.width : item.depth;
      if (item.x < z.x + z.width && item.x + iw > z.x && item.y < z.y + z.depth && item.y + idp > z.y) {
        if (z.kind === "swing") swingHits++; else if (z.kind === "window") windowHits++; else walkwayHits++;
      }
    }
  }
  const status = $("floorPlanStatus");
  if (status && !status.textContent.includes("door-swing intrusions")) {
    status.textContent += " | " + swingHits + " door-swing intrusions | " + windowHits + " window-zone blocks | " + walkwayHits + " walkway intrusions. Swing and window zones are conservative approximations; accessibility unverified.";
  }
}
const drawFloorPlanOrig = drawFloorPlan;
drawFloorPlan = function () { drawFloorPlanOrig(); renderZones(); };

function makePanel(title, blurb) {
  const sec = document.createElement("section");
  sec.className = "panel";
  sec.style.marginTop = "20px";
  const h = document.createElement("h3"); h.textContent = title; sec.append(h);
  if (blurb) { const p = document.createElement("p"); p.textContent = blurb; sec.append(p); }
  const main = document.querySelector("main") || document.body;
  main.append(sec);
  return sec;
}
function field(parent, labelText, input) {
  const lab = document.createElement("label"); lab.textContent = labelText; lab.append(input); parent.append(lab); return input;
}
function textInput(id, ph) { const i = document.createElement("input"); i.id = id; if (ph) i.placeholder = ph; return i; }
function numInput(id, ph) { const i = textInput(id, ph); i.type = "number"; i.min = "0"; i.step = "any"; return i; }
function selInput(id, options) { const s = document.createElement("select"); s.id = id; for (const o of options) { const op = document.createElement("option"); op.value = o; op.textContent = o; s.append(op); } return s; }
function actionButton(parent, label, cls) { const b = document.createElement("button"); b.type = "button"; if (cls) b.className = cls; b.textContent = label; parent.append(b); return b; }
function statusLine(parent) { const p = document.createElement("p"); p.className = "status"; parent.append(p); return p; }

/* ----- Openings & circulation panel ----- */
const zonePanel = makePanel("Doors, windows & circulation", "Add wall openings and walkway zones. Door swings are drawn as conservative swept squares; furniture intruding into a swing, window or walkway zone is flagged in the plan diagnostics.");
{
  const row = document.createElement("div"); row.className = "actions"; zonePanel.append(row);
  field(row, "Opening type", selInput("opKind", ["door", "window"]));
  field(row, "Wall", selInput("opWall", ["north", "south", "east", "west"]));
  field(row, "Offset along wall (in)", numInput("opOffset", "e.g. 24"));
  field(row, "Width (in)", numInput("opWidth", "e.g. 36"));
  field(row, "Hinge (doors)", selInput("opHinge", ["start", "end"]));
  field(row, "Swing (doors)", selInput("opDirection", ["in", "out"]));
  const add = actionButton(row, "Add opening");
  const msg = statusLine(zonePanel);
  add.onclick = () => {
    const w = dimension($("roomWidth").value), d = dimension($("roomDepth").value);
    const wall = $("opWall").value, off = Number($("opOffset").value), width = dimension($("opWidth").value);
    const wallLen = wall === "north" || wall === "south" ? w : d;
    if (w === null || d === null || !Number.isFinite(off) || off < 0 || width === null || off + width > wallLen) { msg.textContent = "Enter a valid opening fully within its wall."; return; }
    pushHistory();
    openings.push({id: "op-" + (++itemCounter), kind: $("opKind").value, wall, offsetIn: off, widthIn: width, hinge: $("opHinge").value, direction: $("opDirection").value});
    msg.textContent = "Opening added. Zones are approximations, not verified clearances.";
    drawFloorPlan();
  };
  const row2 = document.createElement("div"); row2.className = "actions"; zonePanel.append(row2);
  field(row2, "Walkway X (in)", numInput("wkX", "e.g. 12"));
  field(row2, "Walkway Y (in)", numInput("wkY", "e.g. 60"));
  field(row2, "Width (in)", numInput("wkW", "e.g. 120"));
  field(row2, "Depth (in)", numInput("wkD", "e.g. 36"));
  field(row2, "Minimum width (in)", numInput("wkMin", "e.g. 36"));
  const addW = actionButton(row2, "Add walkway");
  addW.onclick = () => {
    const x = Number($("wkX").value), y = Number($("wkY").value), width = dimension($("wkW").value), depth = dimension($("wkD").value);
    const w = dimension($("roomWidth").value), d = dimension($("roomDepth").value);
    if (w === null || d === null || !Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || width === null || depth === null || x + width > w || y + depth > d) { msg.textContent = "Enter a valid walkway fully within the room."; return; }
    pushHistory();
    walkways.push({id: "wk-" + (++itemCounter), x, y, width, depth, minWidthIn: Number($("wkMin").value) || null});
    msg.textContent = "Walkway added. Keep it clear for circulation; accessibility remains unverified.";
    drawFloorPlan();
  };
  const clear = actionButton(row2, "Clear openings & walkways", "secondary");
  clear.onclick = () => { pushHistory(); openings.length = 0; walkways.length = 0; drawFloorPlan(); };
}

/* ----- Plan tools: undo, duplicate ----- */
const toolsPanel = makePanel("Plan tools", "");
{
  const row = document.createElement("div"); row.className = "actions"; toolsPanel.append(row);
  const undo = actionButton(row, "Undo", "secondary");
  undo.onclick = () => { const snap = planHistory.pop(); if (snap) planRestore(snap); };
  const dup = actionButton(row, "Duplicate selected", "secondary");
  const msg = statusLine(toolsPanel);
  dup.onclick = () => {
    const item = furnitureItems[selectedFurniture];
    if (!item) { msg.textContent = "Select a furniture block first."; return; }
    pushHistory();
    const copy = {...item, name: item.name + " copy", x: Math.min(item.x + 6, 9999), y: Math.min(item.y + 6, 9999)};
    furnitureItems.push(copy);
    msg.textContent = "Duplicated " + item.name + ". Check the copy's position in the diagnostics.";
    updateFurniturePlan();
  };
  const planHost = $("floorPlan");
  if (planHost) planHost.addEventListener("pointerdown", () => pushHistory(), true);
}

/* ----- Layout manager + workspace persistence ----- */
const layoutPanel = makePanel("Layouts & project workspace", "Keep several named layouts for this room, then save the whole design workspace — layouts, products, budget and library selections — into the project record. It reopens exactly as saved, visible only to your account.");
const wsStatus = statusLine(layoutPanel);
{
  const row = document.createElement("div"); row.className = "actions"; layoutPanel.append(row);
  field(row, "Layout name", textInput("layoutName", "Layout 1"));
  const saveL = actionButton(row, "Save layout");
  field(row, "Saved layouts", selInput("layoutList", []));
  const loadL = actionButton(row, "Switch layout", "secondary");
  const dupL = actionButton(row, "Duplicate layout", "secondary");
  const delL = actionButton(row, "Delete layout", "secondary");
  const refreshList = () => {
    const sel = $("layoutList"); sel.replaceChildren();
    for (const name of savedLayouts.keys()) { const op = document.createElement("option"); op.value = name; op.textContent = name; sel.append(op); }
    sel.value = activeLayoutName;
  };
  const captureCurrent = () => JSON.parse(planSnapshot());
  const applyState = (s) => {
    furnitureItems.length = 0; (s.f || []).forEach((x) => furnitureItems.push(x));
    obstacles.length = 0; (s.o || []).forEach((x) => obstacles.push(x));
    openings.length = 0; (s.p || []).forEach((x) => openings.push(x));
    walkways.length = 0; (s.w || []).forEach((x) => walkways.push(x));
    selectedFurniture = -1;
    updateFurniturePlan();
  };
  saveL.onclick = () => {
    const name = $("layoutName").value.trim() || activeLayoutName;
    activeLayoutName = name;
    savedLayouts.set(name, captureCurrent());
    refreshList();
    wsStatus.textContent = "Layout '" + name + "' kept in this session. Save the workspace to persist it in the project.";
  };
  loadL.onclick = () => {
    const name = $("layoutList").value;
    if (!savedLayouts.has(name)) return;
    pushHistory();
    savedLayouts.set(activeLayoutName, captureCurrent());
    activeLayoutName = name;
    $("layoutName").value = name;
    applyState(savedLayouts.get(name));
    refreshList();
    wsStatus.textContent = "Switched to layout '" + name + "'.";
  };
  dupL.onclick = () => {
    const name = $("layoutList").value;
    if (!savedLayouts.has(name)) return;
    const copyName = name + " copy";
    savedLayouts.set(copyName, JSON.parse(JSON.stringify(savedLayouts.get(name))));
    refreshList();
    wsStatus.textContent = "Layout duplicated as '" + copyName + "'.";
  };
  delL.onclick = () => {
    const name = $("layoutList").value;
    if (name === activeLayoutName) { wsStatus.textContent = "Switch away before deleting the active layout."; return; }
    savedLayouts.delete(name);
    refreshList();
  };
  layoutPanel._refreshList = refreshList;
  layoutPanel._applyState = applyState;
  layoutPanel._captureCurrent = captureCurrent;
}

/* ===== Design platform extension, part 2: library, catalog, budget,
   workspace save/load. ===== */
const BUDGET_CATS = [["furniture", "Furniture"], ["materials", "Materials"], ["flooring", "Flooring"], ["paint", "Paint"], ["lighting", "Lighting"], ["fixtures", "Fixtures"], ["cabinetry", "Cabinetry"], ["countertops", "Countertops"], ["appliances", "Appliances"], ["labor", "Labor"], ["contractor-estimates", "Contractor estimates"], ["delivery", "Delivery"], ["taxes", "Taxes"], ["permits", "Permits"], ["contingency", "Contingency"]];
const slugify = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
async function apiCall(path, method, body) {
  const r = await fetch(path, {method, headers: {"content-type": "application/json", authorization: "Bearer " + idToken}, body: body ? JSON.stringify(body) : undefined});
  const data = await r.json().catch(() => ({}));
  return {status: r.status, data};
}
const dollars = (cents) => cents === null || cents === undefined ? "unknown" : "USD " + (cents / 100).toFixed(2);

/* ----- Workspace collect / save / load ----- */
const wsNotesInput = field(layoutPanel, "Project design notes", textInput("wsNotes", "Notes kept with the design workspace"));
{
  const row = document.createElement("div"); row.className = "actions"; layoutPanel.append(row);
  const save = actionButton(row, "Save workspace to project");
  const load = actionButton(row, "Load saved workspace", "secondary");
  save.onclick = async () => {
    if (!activeProjectId || !idToken) { wsStatus.textContent = "Sign in and open a project first."; return; }
    try {
      const ws = collectWorkspace();
      const r = await apiCall("/api/renovision/projects/" + encodeURIComponent(activeProjectId) + "/design-workspace", "POST", {workspace: ws});
      if (r.status === 200) wsStatus.textContent = "Workspace saved to the project at " + new Date(r.data.designWorkspace.updatedAt).toLocaleTimeString() + ". Layouts: " + ws.layouts.length + ", products: " + ws.products.length + ".";
      else wsStatus.textContent = "Save rejected: " + ((r.data.errors || ["unknown error"]).join("; "));
    } catch (e) { wsStatus.textContent = "Save failed: " + e.message; }
  };
  load.onclick = async () => {
    if (!activeProjectId || !idToken) { wsStatus.textContent = "Sign in and open a project first."; return; }
    try {
      const r = await apiCall("/api/renovision/projects/" + encodeURIComponent(activeProjectId) + "/design-workspace", "GET");
      if (r.status !== 200) { wsStatus.textContent = "Load failed (" + r.status + ")."; return; }
      if (!r.data.designWorkspace) { wsStatus.textContent = "No saved workspace in this project yet."; return; }
      hydrateWorkspace(r.data.designWorkspace);
      wsStatus.textContent = "Workspace loaded. Verify dimensions before relying on any fit or price.";
    } catch (e) { wsStatus.textContent = "Load failed: " + e.message; }
  };
}
function collectWorkspace() {
  savedLayouts.set(activeLayoutName, layoutPanel._captureCurrent());
  const roomW = dimension($("roomWidth").value), roomD = dimension($("roomDepth").value);
  if (roomW === null || roomD === null) throw new Error("enter valid room width and depth before saving");
  const layouts = [];
  const seenSlugs = new Set();
  for (const [name, s] of savedLayouts.entries()) {
    const slug = slugify(name) || "layout";
    if (seenSlugs.has(slug)) throw new Error("layout names '" + name + "' and another layout produce the same saved id '" + slug + "' — rename one before saving");
    seenSlugs.add(slug);
    layouts.push({
      layoutId: slugify(name) || "layout", name, roomId: $("roomId").value.trim() || null,
      room: {widthMeters: toM(roomW), depthMeters: toM(roomD)},
      openings: (s.p || []).map((o) => ({id: o.id, kind: o.kind, wall: o.wall, offsetMeters: toM(o.offsetIn), widthMeters: toM(o.widthIn), swing: o.kind === "door" ? {hinge: o.hinge, direction: o.direction} : undefined})),
      obstacles: (s.o || []).map((z, i) => ({id: "ob-" + (i + 1), kind: ["column", "fireplace", "built-in", "radiator"].includes(z.type) ? z.type : "other", xMeters: toM(z.x), yMeters: toM(z.y), widthMeters: toM(z.width), depthMeters: toM(z.depth)})),
      walkways: (s.w || []).map((wk) => ({id: wk.id, xMeters: toM(wk.x), yMeters: toM(wk.y), widthMeters: toM(wk.width), depthMeters: toM(wk.depth), minimumWidthMeters: wk.minWidthIn ? toM(wk.minWidthIn) : undefined})),
      items: (s.f || []).map((item) => {
        if (!item._lid) item._lid = "item-" + (++itemCounter);
        return {id: item._lid, productId: item._pid || null, name: item.name, xMeters: toM(item.x), yMeters: toM(item.y), widthMeters: toM(item.width), depthMeters: toM(item.depth), rotationDeg: item.rotated ? 90 : 0};
      }),
    });
  }
  const derivedLines = [];
  furnitureItems.forEach((item, i) => { if (item.priceCents > 0) derivedLines.push({lineId: "auto-" + (i + 1), categoryId: "furniture", label: item.name, productId: item._pid || null, estimatedCents: item.priceCents, actualCents: null, status: "planned"}); });
  let budget = wsBudget;
  if (!budget) { const rawBudget = $("designBudget").value; budget = {currency: "USD", totalBudgetCents: rawBudget === "" ? null : moneyCents(rawBudget), allocations: {}, lines: derivedLines}; }
  else if (!budget.lines.length && derivedLines.length) budget = {...budget, lines: derivedLines};
  return {
    format: "renovision-design-workspace/v1",
    styleId: wsSelections.styleId || (libraryData ? (libraryData.styles.find((s) => s.name === $("designStyle").value)?.id ?? null) : null),
    paletteId: wsSelections.paletteId, collectionId: null, materialIds: wsSelections.materialIds,
    layouts, activeLayoutId: slugify(activeLayoutName) || "layout",
    products: wsProducts, shoppingListIds: [...wsShopping], budget,
    notes: wsNotesInput.value || "",
    guided: typeof guidedCollect === "function" ? guidedCollect() : null,
  };
}
function hydrateWorkspace(ws) {
  if (ws.guided && typeof guidedRestore === "function") guidedRestore(ws.guided);
  wsProducts = ws.products || [];
  wsShopping = new Set(ws.shoppingListIds || []);
  wsBudget = ws.budget || null;
  wsSelections = {styleId: ws.styleId || null, paletteId: ws.paletteId || null, materialIds: ws.materialIds || []};
  wsNotesInput.value = ws.notes || "";
  savedLayouts = new Map();
  const byId = new Map(wsProducts.map((p) => [p.productId, p]));
  for (const l of ws.layouts || []) {
    savedLayouts.set(l.name, {
      f: (l.items || []).map((item) => { const prod = item.productId ? byId.get(item.productId) : null; return {name: item.name || (prod ? prod.name : "Item"), retailer: prod?.retailer?.name || "", url: prod?.retailer?.url || "", width: toIn(item.widthMeters), depth: toIn(item.depthMeters), priceCents: prod?.priceCents ?? 0, x: toIn(item.xMeters), y: toIn(item.yMeters), rotated: item.rotationDeg === 90 || item.rotationDeg === 270, _lid: item.id, _pid: item.productId || null}; }),
      o: (l.obstacles || []).map((z) => ({type: z.kind, x: toIn(z.xMeters), y: toIn(z.yMeters), width: toIn(z.widthMeters), depth: toIn(z.depthMeters)})),
      p: (l.openings || []).map((o) => ({id: o.id, kind: o.kind, wall: o.wall, offsetIn: toIn(o.offsetMeters), widthIn: toIn(o.widthMeters), hinge: o.swing?.hinge || "start", direction: o.swing?.direction || "in"})),
      w: (l.walkways || []).map((wk) => ({id: wk.id, x: toIn(wk.xMeters), y: toIn(wk.yMeters), width: toIn(wk.widthMeters), depth: toIn(wk.depthMeters), minWidthIn: wk.minimumWidthMeters ? toIn(wk.minimumWidthMeters) : null})),
    });
  }
  const active = (ws.layouts || []).find((l) => l.layoutId === ws.activeLayoutId) || (ws.layouts || [])[0];
  if (active) {
    activeLayoutName = active.name;
    $("layoutName").value = active.name;
    $("roomWidth").value = toIn(active.room.widthMeters);
    $("roomDepth").value = toIn(active.room.depthMeters);
    layoutPanel._applyState(savedLayouts.get(active.name));
  }
  layoutPanel._refreshList();
  renderCatalog();
  renderBudget();
  markLibrarySelections();
}

/* ----- Design library panel ----- */
const libraryPanel = makePanel("Design library", "Twenty design styles, materials by category, cohesive palettes and room collections. Selections are saved with the workspace. Palette colors are illustrative design values — always check physical samples.");
const libraryStatus = statusLine(libraryPanel);
const libraryBody = document.createElement("div"); libraryPanel.append(libraryBody);
{
  const load = actionButton(libraryPanel, "Load design library", "secondary");
  load.onclick = async () => {
    if (!idToken) { libraryStatus.textContent = "Sign in first."; return; }
    const r = await apiCall("/api/renovision/design-library", "GET");
    if (r.status !== 200) { libraryStatus.textContent = "Library failed to load (" + r.status + ")."; return; }
    libraryData = r.data.library;
    renderLibrary();
    libraryStatus.textContent = "Library loaded: " + libraryData.styles.length + " styles, " + libraryData.materials.length + " materials, " + libraryData.palettes.length + " palettes, " + libraryData.collections.length + " collections.";
  };
}
function markLibrarySelections() {
  libraryBody.querySelectorAll("[data-style-id]").forEach((el) => { el.style.outline = el.getAttribute("data-style-id") === wsSelections.styleId ? "2px solid #756d60" : ""; });
  libraryBody.querySelectorAll("[data-palette-id]").forEach((el) => { el.style.outline = el.getAttribute("data-palette-id") === wsSelections.paletteId ? "2px solid #756d60" : ""; });
}
function renderLibrary() {
  libraryBody.replaceChildren();
  if (!libraryData) return;
  const sh = document.createElement("h4"); sh.textContent = "Styles"; libraryBody.append(sh);
  const sg = document.createElement("div"); sg.className = "actions"; libraryBody.append(sg);
  for (const s of libraryData.styles) {
    const b = document.createElement("button"); b.type = "button"; b.className = "secondary"; b.textContent = s.name; b.title = s.description; b.setAttribute("data-style-id", s.id);
    b.onclick = () => { wsSelections.styleId = s.id; const sel = $("designStyle"); for (const op of sel.options) if (op.text === s.name || op.value === s.name) sel.value = op.value; markLibrarySelections(); libraryStatus.textContent = "Style selected: " + s.name + " — " + s.description; };
    sg.append(b);
  }
  const ph = document.createElement("h4"); ph.textContent = "Palettes"; libraryBody.append(ph);
  for (const p of libraryData.palettes) {
    const row = document.createElement("div"); row.className = "notice"; row.setAttribute("data-palette-id", p.id);
    const title = document.createElement("strong"); title.textContent = p.name + " "; row.append(title);
    for (const c of p.colors) { const sw = document.createElement("span"); sw.title = c.name + " (" + c.role + ")"; sw.style.cssText = "display:inline-block;width:18px;height:18px;border:1px solid #999;vertical-align:middle;margin-right:4px;background:" + c.hex; row.append(sw); }
    const use = document.createElement("button"); use.type = "button"; use.className = "secondary"; use.textContent = "Use palette";
    use.onclick = () => { wsSelections.paletteId = p.id; wsSelections.materialIds = [...p.materialIds]; markLibrarySelections(); libraryStatus.textContent = "Palette selected: " + p.name + " (materials: " + p.materialIds.join(", ") + ")."; };
    row.append(use);
    libraryBody.append(row);
  }
  const mh = document.createElement("h4"); mh.textContent = "Materials — check up to three to compare"; libraryBody.append(mh);
  const compareSet = new Set();
  const compareOut = document.createElement("div"); compareOut.className = "notice";
  const renderCompare = () => {
    compareOut.replaceChildren();
    if (!compareSet.size) { compareOut.textContent = "No materials selected for comparison."; return; }
    for (const id of compareSet) { const m = libraryData.materials.find((x) => x.id === id); const line = document.createElement("div"); line.textContent = m.name + " (" + m.category + ") — durability: " + m.durability + ", maintenance: " + m.maintenance + ". " + m.description; compareOut.append(line); }
    const note = document.createElement("div"); note.textContent = "General characteristics only; performance varies by specific product."; compareOut.append(note);
  };
  for (const cat of libraryData.categories) {
    const mats = libraryData.materials.filter((m) => m.category === cat.id);
    if (!mats.length) continue;
    const line = document.createElement("div");
    const strong = document.createElement("strong"); strong.textContent = cat.name + ": "; line.append(strong);
    for (const m of mats) {
      const lab = document.createElement("label"); lab.style.marginRight = "10px";
      const cb = document.createElement("input"); cb.type = "checkbox"; cb.checked = wsSelections.materialIds.includes(m.id);
      cb.onchange = () => {
        if (cb.checked) { wsSelections.materialIds = [...new Set([...wsSelections.materialIds, m.id])]; if (compareSet.size < 3) compareSet.add(m.id); }
        else { wsSelections.materialIds = wsSelections.materialIds.filter((x) => x !== m.id); compareSet.delete(m.id); }
        renderCompare();
      };
      lab.append(cb, document.createTextNode(" " + m.name));
      line.append(lab);
    }
    libraryBody.append(line);
  }
  libraryBody.append(compareOut); renderCompare();
  const ch = document.createElement("h4"); ch.textContent = "Room collections"; libraryBody.append(ch);
  for (const c of libraryData.collections) {
    const row = document.createElement("div"); row.className = "notice";
    row.textContent = c.name + " (" + c.roomType + ") — " + c.notes + " ";
    const use = document.createElement("button"); use.type = "button"; use.className = "secondary"; use.textContent = "Apply collection";
    use.onclick = () => { wsSelections.styleId = c.styleId; wsSelections.paletteId = c.paletteId; wsSelections.materialIds = [...c.materialIds]; const st = libraryData.styles.find((s) => s.id === c.styleId); if (st) { const sel = $("designStyle"); for (const op of sel.options) if (op.text === st.name || op.value === st.name) sel.value = op.value; } markLibrarySelections(); libraryStatus.textContent = "Collection applied: " + c.name + ". Save the workspace to persist it."; };
    row.append(use);
    libraryBody.append(row);
  }
  markLibrarySelections();
}

/* ----- Product catalog panel ----- */
const catalogPanel = makePanel("Furniture & product catalog", "Products you add yourself, with their source recorded. RENOVISION does not invent listings, prices or availability: unknown prices stay unknown, and dimensions are unverified unless you record their source.");
const catalogStatus = statusLine(catalogPanel);
const catalogList = document.createElement("div"); catalogPanel.append(catalogList);
const shopSummary = document.createElement("p"); shopSummary.className = "status"; catalogPanel.append(shopSummary);
function freshnessOf(p) {
  const ts = Date.parse(p?.source?.retrievedAt ?? "");
  if (!Number.isFinite(ts)) return "freshness unknown";
  const age = Date.now() - ts;
  if (age < 0) return "freshness unknown";
  return age <= 7 * 24 * 3600 * 1000 ? "recorded within 7 days" : "recorded over 7 days ago — re-check the source";
}
function renderCatalog() {
  catalogList.replaceChildren();
  const q = ($("catalogSearch")?.value || "").toLowerCase();
  const maxW = Number($("catalogMaxW")?.value);
  for (const p of wsProducts) {
    if (q && ![p.name, p.type, p.color, p.material, p.retailer?.name].some((f) => typeof f === "string" && f.toLowerCase().includes(q))) continue;
    if (Number.isFinite(maxW) && maxW > 0 && toIn(p.widthMeters) > maxW) continue;
    const row = document.createElement("div"); row.className = "notice";
    const head = document.createElement("strong"); head.textContent = p.name; row.append(head);
    row.append(document.createTextNode(" — " + p.type + " — " + toIn(p.widthMeters) + " × " + toIn(p.depthMeters) + " in — " + dollars(p.priceCents) + " — " + (p.dimensionsVerified ? "dimensions verified (" + p.dimensionSource + ")" : "dimensions unverified") + " — source: " + (p.source?.label || "unknown") + ", " + freshnessOf(p) + " "));
    if (p.retailer?.url) { const a = document.createElement("a"); a.href = p.retailer.url; a.target = "_blank"; a.rel = "noopener noreferrer"; a.textContent = p.retailer.name || "Retailer page"; row.append(a, document.createTextNode(" ")); }
    const add = document.createElement("button"); add.type = "button"; add.className = "secondary"; add.textContent = "Add to plan";
    add.onclick = () => { pushHistory(); furnitureItems.push({name: p.name, retailer: p.retailer?.name || "", url: p.retailer?.url || "", width: toIn(p.widthMeters), depth: toIn(p.depthMeters), priceCents: p.priceCents ?? 0, x: 0, y: 0, rotated: false, _pid: p.productId, _lid: "item-" + (++itemCounter)}); updateFurniturePlan(); catalogStatus.textContent = p.name + " added to the plan." + (p.priceCents === null ? " Its price is unknown and is excluded from budget lines." : ""); };
    const shop = document.createElement("button"); shop.type = "button"; shop.className = "secondary"; shop.textContent = wsShopping.has(p.productId) ? "In shopping list ✓" : "Add to shopping list";
    shop.onclick = () => { if (wsShopping.has(p.productId)) wsShopping.delete(p.productId); else wsShopping.add(p.productId); renderCatalog(); };
    row.append(add, shop);
    catalogList.append(row);
  }
  if (!wsProducts.length) catalogList.textContent = "No products yet. Add the first one below.";
  const selected = wsProducts.filter((p) => wsShopping.has(p.productId));
  const unpriced = selected.filter((p) => p.priceCents === null).length;
  shopSummary.textContent = "Shopping list: " + selected.length + " item(s). " + (unpriced ? "Merchandise total unavailable — price unknown for " + unpriced + " item(s). Totals are never estimated." : "Merchandise: " + dollars(selected.reduce((s, p) => s + p.priceCents, 0)) + " (delivery unknown unless recorded per product).");
}
{
  const row = document.createElement("div"); row.className = "actions"; catalogPanel.append(row);
  field(row, "Search catalog", textInput("catalogSearch", "name, type, color…"));
  field(row, "Max width (in)", numInput("catalogMaxW", "e.g. 84"));
  $("catalogSearch").addEventListener("input", renderCatalog);
  $("catalogMaxW").addEventListener("input", renderCatalog);
  const form = document.createElement("div"); form.className = "actions"; catalogPanel.append(form);
  field(form, "Product name", textInput("catName", "e.g. Linen sofa"));
  field(form, "Type", textInput("catType", "sofa, table, rug…"));
  field(form, "Retailer", textInput("catRetailer", "Retailer name"));
  field(form, "Retailer URL (HTTPS)", textInput("catUrl", "https://…"));
  field(form, "Width (in)", numInput("catW", "e.g. 84"));
  field(form, "Depth (in)", numInput("catD", "e.g. 38"));
  field(form, "Price ($, blank = unknown)", numInput("catPrice", ""));
  field(form, "Color", textInput("catColor", ""));
  field(form, "Material", textInput("catMaterial", ""));
  field(form, "Dimension source", textInput("catDimSource", "e.g. manufacturer spec sheet"));
  const add = actionButton(form, "Add product to catalog");
  add.onclick = () => {
    const name = $("catName").value.trim(), type = $("catType").value.trim();
    const w = dimension($("catW").value), d = dimension($("catD").value);
    const rawUrl = $("catUrl").value.trim();
    let url = null;
    if (rawUrl) { try { const u = new URL(rawUrl); if (u.protocol !== "https:" || !u.hostname) throw new Error("bad"); url = u.href; } catch { catalogStatus.textContent = "Use a valid HTTPS retailer URL or leave it blank."; return; } }
    if (!name || !type || w === null || d === null) { catalogStatus.textContent = "Enter a name, type and positive dimensions."; return; }
    const priceRaw = $("catPrice").value;
    const priceCents = priceRaw === "" ? null : moneyCents(priceRaw);
    if (priceRaw !== "" && priceCents === null) { catalogStatus.textContent = "Enter a valid price or leave it blank for unknown."; return; }
    const dimSource = $("catDimSource").value.trim() || null;
    wsProducts.push({productId: "prod-" + (++itemCounter) + "-" + Date.now().toString(36), name, type, widthMeters: toM(w), depthMeters: toM(d), heightMeters: null, color: $("catColor").value.trim() || null, material: $("catMaterial").value.trim() || null, styleIds: wsSelections.styleId ? [wsSelections.styleId] : [], priceCents, deliveryCents: null, currency: "USD", retailer: $("catRetailer").value.trim() ? {name: $("catRetailer").value.trim(), url} : null, availability: "unknown", dimensionSource: dimSource, dimensionsVerified: Boolean(dimSource), source: {kind: "manual_entry", label: "manual entry", retrievedAt: new Date().toISOString()}});
    catalogStatus.textContent = name + " added to the catalog as a manual entry. Save the workspace to persist it.";
    renderCatalog();
  };
}

/* ----- Budget panel ----- */
const budgetPanel = makePanel("Project budget", "Category allocations, estimated versus actual spend, and over-budget alerts. All amounts are exact cents math; contractor figures remain unverified and are never approved costs.");
const budgetStatus = statusLine(budgetPanel);
const budgetBody = document.createElement("div"); budgetPanel.append(budgetBody);
function ensureBudget() {
  if (!wsBudget) { const raw = $("designBudget").value; wsBudget = {currency: "USD", totalBudgetCents: raw === "" ? null : moneyCents(raw), allocations: {}, lines: []}; }
  return wsBudget;
}
function renderBudget() {
  const b = ensureBudget();
  budgetBody.replaceChildren();
  const summary = document.createElement("div"); summary.className = "notice";
  const est = b.lines.filter((l) => l.status !== "cancelled").reduce((s, l) => s + l.estimatedCents, 0);
  const act = b.lines.filter((l) => l.status !== "cancelled").reduce((s, l) => s + (l.actualCents || 0), 0);
  summary.textContent = "Total budget: " + dollars(b.totalBudgetCents) + " | Estimated: " + dollars(est) + " | Actual recorded: " + dollars(act) + " | Remaining vs estimate: " + (b.totalBudgetCents === null ? "unknown" : dollars(b.totalBudgetCents - est)) + (b.totalBudgetCents !== null && est > b.totalBudgetCents ? " | OVER BUDGET" : "");
  budgetBody.append(summary);
  for (const [cid, cname] of BUDGET_CATS) {
    const lines = b.lines.filter((l) => l.categoryId === cid && l.status !== "cancelled");
    if (!lines.length && b.allocations[cid] === undefined) continue;
    const cEst = lines.reduce((s, l) => s + l.estimatedCents, 0);
    const alloc = b.allocations[cid];
    const row = document.createElement("div");
    row.textContent = cname + ": allocated " + dollars(alloc ?? null) + ", estimated " + dollars(cEst) + (alloc !== undefined && cEst > alloc ? " — OVER ALLOCATION" : "");
    budgetBody.append(row);
  }
  const list = document.createElement("div"); budgetBody.append(list);
  b.lines.forEach((line, idx) => {
    const row = document.createElement("div"); row.className = "notice";
    row.textContent = line.label + " (" + line.categoryId + ") — est " + dollars(line.estimatedCents) + ", actual " + (line.actualCents === null ? "not recorded" : dollars(line.actualCents)) + ", " + line.status + " ";
    const actIn = document.createElement("input"); actIn.type = "number"; actIn.min = "0"; actIn.step = "0.01"; actIn.placeholder = "Actual $"; actIn.style.width = "110px";
    const setAct = document.createElement("button"); setAct.type = "button"; setAct.className = "secondary"; setAct.textContent = "Record actual";
    setAct.onclick = () => { const c = moneyCents(actIn.value); if (c === null) { budgetStatus.textContent = "Enter a valid actual amount."; return; } line.actualCents = c; line.status = "purchased"; renderBudget(); };
    const rm = document.createElement("button"); rm.type = "button"; rm.className = "secondary"; rm.textContent = "Remove";
    rm.onclick = () => { b.lines.splice(idx, 1); renderBudget(); };
    row.append(actIn, setAct, rm);
    list.append(row);
  });
  const form = document.createElement("div"); form.className = "actions"; budgetBody.append(form);
  field(form, "Allocation category", selInput("budAllocCat", BUDGET_CATS.map((c) => c[0])));
  field(form, "Allocation ($)", numInput("budAlloc", ""));
  const setAlloc = actionButton(form, "Set allocation", "secondary");
  setAlloc.onclick = () => { const c = moneyCents($("budAlloc").value); if (c === null) { budgetStatus.textContent = "Enter a valid allocation."; return; } ensureBudget().allocations[$("budAllocCat").value] = c; renderBudget(); };
  field(form, "Line label", textInput("budLabel", "e.g. Sofa"));
  field(form, "Line category", selInput("budLineCat", BUDGET_CATS.map((c) => c[0])));
  field(form, "Estimated ($)", numInput("budEst", ""));
  const addLine = actionButton(form, "Add budget line", "secondary");
  addLine.onclick = () => { const c = moneyCents($("budEst").value); const label = $("budLabel").value.trim(); if (!label || c === null) { budgetStatus.textContent = "Enter a label and a valid estimate."; return; } ensureBudget().lines.push({lineId: "line-" + (++itemCounter) + "-" + Date.now().toString(36), categoryId: $("budLineCat").value, label, productId: null, estimatedCents: c, actualCents: null, status: "planned"}); renderBudget(); };
  const importBtn = actionButton(form, "Import shopping list as furniture lines", "secondary");
  importBtn.onclick = () => {
    const bb = ensureBudget();
    let added = 0, skipped = 0;
    for (const p of wsProducts.filter((x) => wsShopping.has(x.productId))) {
      if (p.priceCents === null) { skipped++; continue; }
      if (bb.lines.some((l) => l.productId === p.productId)) continue;
      bb.lines.push({lineId: "line-" + (++itemCounter) + "-" + Date.now().toString(36), categoryId: "furniture", label: p.name, productId: p.productId, estimatedCents: p.priceCents, actualCents: null, status: "planned"});
      added++;
    }
    budgetStatus.textContent = "Imported " + added + " priced product(s)." + (skipped ? " " + skipped + " unpriced product(s) skipped — their cost is unknown, never estimated." : "");
    renderBudget();
  };
  const totalRow = document.createElement("div"); totalRow.className = "actions"; budgetBody.append(totalRow);
  field(totalRow, "Total project budget ($)", numInput("budTotal", ""));
  const setTotal = actionButton(totalRow, "Set total budget", "secondary");
  setTotal.onclick = () => { const c = moneyCents($("budTotal").value); if (c === null) { budgetStatus.textContent = "Enter a valid total budget."; return; } ensureBudget().totalBudgetCents = c; $("designBudget").value = (c / 100).toFixed(2); renderBudget(); };
}
renderCatalog();
renderBudget();
$('room').addEventListener('change',()=>{furnitureItems.length=0;updateFurniturePlan()});updateFurniturePlan();

/* ---- Durable concept history (design-platform extension) ---- */
let historyRevisionOf=null;
const blobToB64=(blob)=>new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result).split(',')[1]);r.onerror=()=>reject(Error('image read failed'));r.readAsDataURL(blob);});
const b64ToBlob=(b64,mime)=>{const d=atob(b64);const a=new Uint8Array(d.length);for(let i=0;i<d.length;i++)a[i]=d.charCodeAt(i);return new Blob([a],{type:mime});};
const conceptApi=async(path,method,body)=>{const r=await apiCall('/api/renovision/projects/'+encodeURIComponent(activeProjectId)+path,method,body);if(r.status<200||r.status>=300)throw Error((r.data&&r.data.errors||['request failed']).join(', '));return r.data;};
function renderConceptHistory(list){
  window.__rvConceptSelections=(list||[]).map(c=>(c&&c.selections)?c.selections:null).filter(Boolean);
  window.dispatchEvent(new Event('rv-concepts-changed'));
  const box=$('conceptHistoryList');box.innerHTML='';
  if(!list||!list.length){box.innerHTML='<p class="note">No concepts saved yet. Generate a concept while a project is open and it will be recorded here.</p>';return;}
  for(const c of list){
    const card=document.createElement('div');card.className='room-card';
    const when=new Date(c.createdAt).toLocaleString();
    const sel=c.selections||{};
    card.innerHTML='<strong></strong> <span class="note"></span>'+(c.provider&&c.provider.simulated?' <span class="tag">SIMULATED</span>':'')+'<p class="note"></p><div class="row"><button type="button" data-act="view">View</button><button type="button" data-act="refine">Refine from this concept</button><button type="button" data-act="delete">Delete</button></div>';
    card.querySelector('strong').textContent=(sel.style||'Concept')+' — '+(sel.room||'room');
    card.querySelector('span.note').textContent=when+(c.revisionOf?' · revision':'');
    card.querySelector('p.note').textContent=(c.prompt||'').slice(0,180);
    card.querySelectorAll('button').forEach(b=>b.onclick=()=>conceptHistoryAction(b.dataset.act,c));
    box.appendChild(card);
  }
}
async function loadConceptHistory(){
  if(!activeProjectId){$('conceptHistoryStatus').textContent='Create or open a project first.';return;}
  try{const data=await conceptApi('/concepts','GET');renderConceptHistory(data.concepts||[]);$('conceptHistoryStatus').textContent=(data.concepts||[]).length+' concept(s) in this project\u2019s history.';}
  catch(e){$('conceptHistoryStatus').textContent='Concept history unavailable: '+e.message;}
}
async function conceptHistoryAction(act,c){
  const st=$('conceptHistoryStatus');
  try{
    if(act==='delete'){const data=await conceptApi('/concepts/delete','POST',{conceptId:c.conceptId});renderConceptHistory(data.concepts||[]);st.textContent='Concept deleted. Its image bytes are purged when their retention period expires.';return;}
    const conceptData=await conceptApi('/concepts/'+encodeURIComponent(c.conceptId)+'/image/concept','GET');
    const conceptBlob=b64ToBlob(conceptData.imageBase64,conceptData.mimeType);
    if(act==='view'){
      let originalUrl=null;
      if(c.original){const od=await conceptApi('/concepts/'+encodeURIComponent(c.conceptId)+'/image/original','GET');originalUrl=URL.createObjectURL(b64ToBlob(od.imageBase64,od.mimeType));}
      if(resultUrl)URL.revokeObjectURL(resultUrl);
      resultMime=conceptData.mimeType;resultBlob=conceptBlob;resultUrl=URL.createObjectURL(conceptBlob);
      $('resultPhoto').src=resultUrl;$('comparisonConcept').src=resultUrl;$('comparisonOriginal').src=originalUrl||resultUrl;$('comparisonRange').value='50';updateComparison();$('comparison').classList.remove('hidden');$('resultPanel').classList.remove('hidden');
      st.textContent='Viewing saved concept from '+new Date(c.createdAt).toLocaleString()+(c.provider&&c.provider.simulated?' (SIMULATED)':'')+'.';
    }
    if(act==='refine'){
      refinementSource=conceptBlob;
      historyRevisionOf=c.conceptId;
      st.textContent='Refining from the saved concept. The next generation will be recorded as a revision of it.';
      $('status').textContent='Refinement source: saved concept from '+new Date(c.createdAt).toLocaleString()+'. Add changes and generate.';
    }
  }catch(e){st.textContent='Concept action failed: '+e.message;}
}
window.__rvOnConcept=async({resultBlob,resultMime,prompt,disclosure,provider,source})=>{
  const st=$('conceptHistoryStatus');
  if(!activeProjectId){st.textContent='Concept generated but not saved to history: no project is open.';return;}
  try{
    const priorities=(typeof scopeSelections!=='undefined'&&scopeSelections&&$('room'))?[...(scopeSelections.get($('room').value)||[])]:[];
    const body={prompt:prompt||'',disclosure:disclosure||'AI-generated design concept only.',provider:provider||{kind:'vertex',simulated:false},selections:{room:$('room')?$('room').value:null,style:$('style')?$('style').value:null,palette:(typeof palette!=='undefined'?palette:null),material:$('material')?$('material').value:null,priorities},revisionOf:historyRevisionOf,conceptImage:{imageBase64:await blobToB64(resultBlob),mimeType:resultMime}};
    if(source&&source.size)body.originalImage={imageBase64:await blobToB64(source),mimeType:source.type||'image/png'};
    const data=await conceptApi('/concepts','POST',body);
    historyRevisionOf=null;
    renderConceptHistory(data.concepts||[]);
    st.textContent='Concept saved to this project\u2019s history.';rvJourneyUpdate();
  }catch(e){st.textContent='Concept generated, but saving to history failed: '+e.message;}
};
$('loadConceptHistory').onclick=loadConceptHistory;
{const origCreate=$('createProject').onclick;if(origCreate)$('createProject').onclick=async(...args)=>{await origCreate(...args);if(activeProjectId){loadConceptHistory();rvJourneyUpdate();}};}


/* ---- Journey progress guide (customer-experience extension) ---- */
function rvJourneyUpdate(){
  const strip=$('journeyStrip');if(!strip)return;
  let planDone=false;
  try{planDone=document.querySelectorAll('#floorPlan button').length>0||document.querySelectorAll('#budgetLines tr,#budgetLines .row,#budgetLines li').length>0;}catch(e){}
  const state=[
    {label:'1 · Start',done:!!activeProjectId},
    {label:'2 · Design',done:!!(window.__rvDesignDone)},
    {label:'3 · Transform',done:!!resultUrl||!!document.querySelector('#conceptHistoryList .room-card')||!!document.querySelector('#gxLayoutCards .gx-layout-card')},
    {label:'4 · Furnish',done:!!document.querySelector('#gxFuResult .tag')||(typeof wsShopping!=='undefined'&&wsShopping.size>0)},
    {label:'5 · Review',done:planDone},
    {label:'6 · Export',done:false},
  ];
  const current=state.findIndex(s=>!s.done);
  strip.innerHTML='';
  state.forEach((s,i)=>{
    const li=document.createElement('li');
    li.textContent=(s.done?'\u2713 ':'')+s.label;
    if(s.done)li.className='done';else if(i===current){li.className='current';li.setAttribute('aria-current','step');}
    strip.appendChild(li);
  });
}
document.addEventListener('click',()=>setTimeout(rvJourneyUpdate,350));
document.addEventListener('change',()=>setTimeout(rvJourneyUpdate,350));

/* ---- Presentation: staged workspace organization (UX replacement 2026-11-19; presentation only, no functional change) ---- */
(function rvStageOrganize(){
  try{
    var main=document.querySelector('main'); if(!main) return;
    var panels=[].slice.call(main.querySelectorAll(':scope > section.panel'));
    function byTitle(t){return panels.find(function(s){var h=s.querySelector('h3');return h&&h.textContent.trim().indexOf(t)===0;});}
    function stageBlock(id,num,title,sub){
      var sec=document.createElement('section'); sec.className='stage-block'; sec.id=id;
      var head=document.createElement('div'); head.className='stage-head';
      var numEl=document.createElement('span'); numEl.className='stage-num'; numEl.textContent=num;
      var h=document.createElement('h2'); h.textContent=title;
      var p=document.createElement('p'); p.textContent=sub;
      head.appendChild(numEl); head.appendChild(h); head.appendChild(p);
      sec.appendChild(head); var foot=main.querySelector('.studio-footer'); if(foot) main.insertBefore(sec,foot); else main.appendChild(sec); return sec;
    }
    var plan=stageBlock('stagePlan','04','Plan your space','Lay out the room, place furniture and openings, and review clearances before you commit.');
    var zones=byTitle('Doors, windows'); if(zones){zones.id='zonePanel'; plan.appendChild(zones);}
    var tools=byTitle('Plan tools'); if(tools){tools.id='toolsPanel'; plan.appendChild(tools);}
    var planner=document.getElementById('interiorPlanner'); if(planner) plan.appendChild(planner);
    var finish=stageBlock('stageFinish','05','Finish & export','Alternative layouts, the design library, your product catalog and the project budget — saved with your project.');
    [['Layouts & project workspace','layoutPanel'],['Design library','libraryPanel'],['Furniture & product catalog','catalogPanel'],['Project budget','budgetPanel']].forEach(function(pair){var p=byTitle(pair[0]); if(p){p.id=pair[1]; finish.appendChild(p);}});
    var order=['stageProject','stageVision','stageConcept','stagePlan','stageFinish'];
    var strip=document.getElementById('journeyStrip');
    function wireStrip(){
      if(!strip) return;
      [].forEach.call(strip.children,function(li,i){
        if(li.dataset.rvNav) return; li.dataset.rvNav='1';
        li.setAttribute('tabindex','0'); li.title='Go to this step';
        function go(){var el=document.getElementById(order[i]); if(el) el.scrollIntoView({behavior:'smooth',block:'start'});}
        li.addEventListener('click',go);
        li.addEventListener('keydown',function(e){if(e.key==='Enter'||e.key===' '){e.preventDefault();go();}});
      });
    }
    wireStrip();
    if(strip&&window.MutationObserver){ new MutationObserver(wireStrip).observe(strip,{childList:true}); }
  }catch(e){}
})();

/* ---- Guided platform: concierge, property, plan ingestion, conversions, cost engine, furnish (master directive 2026-11-19) ---- */
const guidedState = { context: null, property: null, planUploads: [], screening: null, layouts: null, rateBook: null, estimate: null, furnishRequest: null, furnishProposal: null, templateId: null };
function guidedCollect() {
  try { return JSON.parse(JSON.stringify({ context: guidedState.context, property: guidedState.property, planUploads: guidedState.planUploads, screening: guidedState.screening, layouts: guidedState.layouts, rateBook: guidedState.rateBook, estimate: guidedState.estimate, furnishRequest: guidedState.furnishRequest, furnishProposal: guidedState.furnishProposal, templateId: guidedState.templateId })); } catch (e) { return null; }
}
function guidedRestore(g) {
  if (!g) return;
  guidedState.context = g.context || null; guidedState.property = g.property || null; guidedState.planUploads = g.planUploads || [];
  guidedState.screening = g.screening || null; guidedState.layouts = g.layouts || null; guidedState.rateBook = g.rateBook || null;
  guidedState.estimate = g.estimate || null; guidedState.furnishRequest = g.furnishRequest || null; guidedState.furnishProposal = g.furnishProposal || null;
  guidedState.templateId = g.templateId || null;
  if (typeof gxRenderAll === "function") gxRenderAll();
}
const gxMoney = (c) => c === null || c === undefined ? "—" : "USD " + (c / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const gxEl = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };

function gxBuildPanels() {
  const RV = window.RV;
  /* ---------- Concierge (right rail, below concept history) ---------- */
  const conciergePanel = document.createElement("section");
  conciergePanel.id = "gxConciergePanel";
  conciergePanel.innerHTML = '<h3 class="rail-title">Design concierge</h3>';
  const cNote = gxEl("p", "note", "A guided assistant that works with your project’s real planner, budget and catalog. It is a rule-based guide, not a generative AI, and it never invents prices, dimensions or records.");
  cNote.id = "gxConciergeNote";
  const cInput = document.createElement("textarea"); cInput.id = "gxConciergeInput"; cInput.rows = 3; cInput.setAttribute("aria-label", "Describe your project for the design concierge");
  cInput.placeholder = "Describe what you want — e.g. “I have a two-car garage and want to convert it into a one-bedroom guest suite with a bathroom. My renovation budget is $35,000. I want a warm modern design.”";
  const cBtn = gxEl("button", "", "Guide my project"); cBtn.id = "gxGuideBtn"; cBtn.type = "button";
  const cSummary = gxEl("div", ""); cSummary.id = "gxConciergeSummary";
  const cActions = gxEl("div", ""); cActions.id = "gxNextActions";
  const cJourney = gxEl("p", "note", ""); cJourney.id = "gxJourneyLine";
  conciergePanel.append(cNote, cInput, cBtn, cSummary, cActions, cJourney);
  const historySection = $("conceptHistoryHeading") ? $("conceptHistoryHeading").closest("section") : null;
  const rail = $("renderPanel").parentElement;
  if (historySection && historySection.parentElement === rail) rail.insertBefore(conciergePanel, historySection.nextSibling); else rail.append(conciergePanel);

  /* ---------- Property & floor plans ---------- */
  const propPanel = makePanel("Your property & floor plans", "Address and property facts are stored with their source. Address lookup and property-record services are not connected, so nothing is inferred from an address — every fact below is exactly what you enter, labeled by provenance.");
  propPanel.id = "gxPropertyPanel";
  const propAddr = field(propPanel, "Property address", textInput("gxPropAddress", "Street, city, state"));
  const propFacts = gxEl("div", "layout"); propPanel.append(propFacts);
  const factDefs = [["areaSqFt", "Building area (sq ft)"], ["bedrooms", "Bedrooms"], ["bathrooms", "Bathrooms"], ["yearBuilt", "Year built"]];
  const factInputs = {};
  for (const [key, label] of factDefs) {
    const wrap = gxEl("div");
    const inp = numInput("gxProp_" + key, ""); inp.min = "0"; inp.step = key === "areaSqFt" || key === "yearBuilt" ? "1" : "0.5";
    field(wrap, label, inp);
    const prov = selInput("gxProv_" + key, ["user_supplied", "estimate"]); prov.value = "user_supplied";
    field(wrap, "Source", prov);
    const hint = gxEl("p", "note", "“Verified record” is unavailable until a records service is connected.");
    wrap.append(hint); propFacts.append(wrap); factInputs[key] = { inp, prov };
  }
  const propBtn = actionButton(propPanel, "Save property facts"); propBtn.id = "gxPropSave";
  const propStatus = statusLine(propPanel); propStatus.id = "gxPropStatus";
  const propSummary = gxEl("div", ""); propSummary.id = "gxPropSummary"; propPanel.append(propSummary);
  const planBox = gxEl("div", ""); planBox.style.marginTop = "18px"; propPanel.append(planBox);
  planBox.append(gxEl("h4", "", "Floor plan upload"));
  planBox.append(gxEl("p", "note", "Upload a PDF or image floor plan. The original is preserved with a revision history. Automated plan detection is NOT AVAILABLE — dimensions are confirmed by you below and only then used as room geometry."));
  const planFile = document.createElement("input"); planFile.type = "file"; planFile.id = "gxPlanFile"; planFile.accept = ".pdf,.png,.jpg,.jpeg,.webp"; planFile.setAttribute("aria-label", "Floor plan file (PDF or image)");
  const planReg = gxEl("button", "secondary", "Register plan upload"); planReg.id = "gxPlanRegister"; planReg.type = "button";
  const planStatus = gxEl("p", "status", ""); planStatus.id = "gxPlanStatus";
  const planDims = gxEl("div", "layout");
  const pw = numInput("gxPlanWidth", "e.g. 240"); const pd = numInput("gxPlanDepth", "e.g. 240");
  const pwrap1 = gxEl("div"); field(pwrap1, "Plan width (inches)", pw); planDims.append(pwrap1);
  const pwrap2 = gxEl("div"); field(pwrap2, "Plan depth (inches)", pd); planDims.append(pwrap2);
  const psrc = selInput("gxPlanSource", ["user_measured", "plan_stated"]);
  const pwrap3 = gxEl("div"); field(pwrap3, "Dimension source", psrc); planDims.append(pwrap3);
  const planConfirm = gxEl("button", "secondary", "Confirm dimensions"); planConfirm.id = "gxPlanConfirm"; planConfirm.type = "button";
  const planApply = gxEl("button", "secondary", "Use as room geometry"); planApply.id = "gxPlanApply"; planApply.type = "button";
  planBox.append(planFile, planReg, planStatus, planDims, planConfirm, planApply);
  const main = document.querySelector("main");
  const stagePlanEl = document.getElementById("stagePlan");
  if (stagePlanEl) main.insertBefore(propPanel, stagePlanEl); else main.append(propPanel);

  /* ---------- Transform ---------- */
  const trPanel = makePanel("Transform your space", "Choose a conversion to generate conceptual layouts and a feasibility screening. Screening flags what needs professional review — it never approves a design for construction or permits.");
  trPanel.id = "gxTransformPanel";
  const tplSel = selInput("gxTplSelect", []); field(trPanel, "Conversion", tplSel);
  const screenBox = gxEl("div", ""); screenBox.id = "gxScreenBox"; trPanel.append(screenBox);
  const screenBtn = actionButton(trPanel, "Run feasibility screening"); screenBtn.id = "gxScreenBtn";
  const screenResult = gxEl("div", ""); screenResult.id = "gxScreenResult"; trPanel.append(screenResult);
  const layoutBtn = actionButton(trPanel, "Generate concept layouts", "secondary"); layoutBtn.id = "gxLayoutBtn";
  const layoutBox = gxEl("div", ""); layoutBox.id = "gxLayoutBox"; trPanel.append(layoutBox);
  const trStatus = statusLine(trPanel); trStatus.id = "gxTransformStatus";

  /* ---------- Estimate ---------- */
  const estPanel = makePanel("Conversion estimate", "Preliminary, fail-closed estimating. A total is produced only when every in-scope category has a rate with a named source — rates are planning assumptions until verified, and the estimate says so.");
  estPanel.id = "gxEstimatePanel";
  const demoBtn = actionButton(estPanel, "Load demonstration assumptions", "secondary"); demoBtn.id = "gxDemoRates";
  estPanel.append(gxEl("p", "note", "Demonstration assumptions are editable planning figures labeled ASSUMPTION — not market data and not a quote."));
  const rateBox = gxEl("div", ""); rateBox.id = "gxRateBox"; estPanel.append(rateBox);
  const estBtn = actionButton(estPanel, "Build estimate"); estBtn.id = "gxEstBtn";
  const estResult = gxEl("div", ""); estResult.id = "gxEstResult"; estPanel.append(estResult);
  const estImport = actionButton(estPanel, "Add estimate lines to project budget", "secondary"); estImport.id = "gxEstImport";
  const estStatus = statusLine(estPanel); estStatus.id = "gxEstStatus";

  /* ---------- Furnish ---------- */
  const fuPanel = makePanel("Furnish my space", "Coordinated furnishings proposed from your project catalog, checked against the room geometry. Retailer connections (Wayfair, Walmart, IKEA, Target, Home Depot) are NOT CONNECTED — no live prices, stock or purchase links are shown or invented.");
  fuPanel.id = "gxFurnishPanel";
  const fuBudget = field(fuPanel, "Furnishing budget ($, blank = no budget set)", numInput("gxFuBudget", "e.g. 6000"));
  const fuQuality = field(fuPanel, "Quality level", selInput("gxFuQuality", ["value", "mid", "premium"]));
  const fuBtn = actionButton(fuPanel, "Propose furnishings"); fuBtn.id = "gxFuBtn";
  const fuResult = gxEl("div", ""); fuResult.id = "gxFuResult"; fuPanel.append(fuResult);
  const fuStatus = statusLine(fuPanel); fuStatus.id = "gxFuStatus";

  if (stagePlanEl) { stagePlanEl.append(trPanel, estPanel); }
  const stageFinishEl = document.getElementById("stageFinish");
  if (stageFinishEl) stageFinishEl.append(fuPanel);

  /* ---------- Wiring ---------- */
  if (!RV) { cNote.textContent += " (Guided engine failed to load — the rest of the studio is unaffected.)"; return; }
  const { concierge, propertyProfile, planIngestion, conversions, conversionCosts, furnish } = RV;

  for (const t of conversions.CONVERSION_TEMPLATES) { const o = document.createElement("option"); o.value = t.id; o.textContent = t.label; tplSel.append(o); }
  tplSel.value = guidedState.templateId || "garage-guest-suite";
  const GX_DEMO_RATES = { demolition: [3, "sqft"], framing: [10, "sqft"], insulation: [3, "sqft"], drywall: [5, "sqft"], flooring: [8, "sqft"], electrical: [9, "sqft"], plumbing: [12, "sqft"], hvac: [7, "sqft"], "windows-doors": [1600, "lump"], fixtures: [2400, "lump"], finishes: [6, "sqft"], labor: [15, "sqft"], permits: [800, "lump"], contingency: [null, "lump"] };
  function gxRenderRates() {
    rateBox.innerHTML = "";
    for (const cat of conversionCosts.CONVERSION_COST_CATEGORIES) {
      const row = gxEl("div", "gx-rate-row");
      const use = document.createElement("input"); use.type = "checkbox"; use.id = "gxUse_" + cat.id; use.checked = cat.id !== "contingency";
      const useL = gxEl("label", "", cat.label); useL.htmlFor = use.id; useL.className = "gx-rate-use";
      const amt = numInput("gxRate_" + cat.id, "$"); amt.step = "0.01"; amt.min = "0"; amt.setAttribute("aria-label", cat.label + " rate in dollars");
      const unit = selInput("gxUnit_" + cat.id, ["sqft", "lump", "each"]); unit.setAttribute("aria-label", cat.label + " rate unit");
      const src = textInput("gxSrc_" + cat.id, "Rate source (required)"); src.setAttribute("aria-label", cat.label + " rate source");
      const conf = selInput("gxConf_" + cat.id, ["assumption", "sourced", "verified"]); conf.setAttribute("aria-label", cat.label + " rate confidence");
      row.append(use, useL, amt, unit, src, conf); rateBox.append(row);
      const saved = guidedState.rateBook && guidedState.rateBook.rates[cat.id];
      if (saved) { amt.value = saved.amountCents / 100; unit.value = saved.unit; src.value = saved.source; conf.value = saved.confidence; }
    }
  }
  function gxRoomDims() {
    const w = dimension($("roomWidth").value), d = dimension($("roomDepth").value);
    return w !== null && d !== null ? { widthIn: w, depthIn: d } : null;
  }
  function gxRenderConcierge() {
    const ctx = guidedState.context;
    cSummary.innerHTML = ""; cActions.innerHTML = "";
    if (!ctx) { cJourney.textContent = "Journey: Describe → Discover → Capture → Design → Transform → Estimate → Furnish → Review → Export. Tell the concierge what you want to begin."; return; }
    const chips = [];
    if (ctx.objective) chips.push("Objective: " + ctx.objective);
    if (ctx.conversionType) { const t = conversions.getConversionTemplate(ctx.conversionType); if (t) chips.push(t.label); }
    if (ctx.style) { const st = RV.designLibrary.getDesignStyle(ctx.style); chips.push("Style: " + (st ? st.name : ctx.style)); }
    if (ctx.budgetCents) chips.push("Budget: " + gxMoney(ctx.budgetCents));
    for (const c of chips) { const s = gxEl("span", "pill", c); cSummary.append(s, document.createTextNode(" ")); }
    const acts = concierge.nextActions(ctx);
    if (acts.length) cActions.append(gxEl("p", "note", "Recommended next steps:"));
    const targets = { describe: "gxConciergePanel", discover: "stageProject", capture: "stageVision", design: "stageConcept", transform: "gxTransformPanel", estimate: "gxEstimatePanel", furnish: "gxFurnishPanel", review: "stageFinish", export: "stageFinish" };
    for (const a of acts) {
      const b = gxEl("button", "secondary", a.label); b.type = "button";
      b.onclick = () => { const el = document.getElementById(targets[a.stage] || "stagePlan"); if (el) el.scrollIntoView({ behavior: "smooth", block: "start" }); };
      const line = gxEl("div", ""); line.append(b, gxEl("span", "note", " " + (a.reason || ""))); cActions.append(line);
    }
    cJourney.textContent = "Journey stage: " + ctx.stage + " · Decisions remembered: " + ctx.decisions.length + " · Still needed: " + (ctx.missing && ctx.missing.length ? ctx.missing.join(", ") : "nothing outstanding") + ".";
  }
  cBtn.onclick = () => {
    const text = cInput.value.trim(); if (!text) { cSummary.textContent = "Describe your project first."; return; }
    try {
      const intent = concierge.parseIntent(text);
      guidedState.context = concierge.applyIntent(guidedState.context || concierge.createConciergeContext(activeProjectId || "draft"), intent);
      if (intent.conversionType) { guidedState.templateId = intent.conversionType; tplSel.value = intent.conversionType; gxRenderScreening(); }
      if (intent.style) { const st = RV.designLibrary.getDesignStyle(intent.style); const styleName = st ? st.name : intent.style; const match = [...$("designStyle").options].find((o) => o.text.toLowerCase() === styleName.toLowerCase()); if (match) { $("designStyle").value = match.value; $("designStyle").dispatchEvent(new Event("change")); } }
      gxRenderConcierge();
    } catch (e) { cSummary.textContent = "The concierge could not use that: " + e.message; }
  };
  propBtn.onclick = () => {
    try {
      let profile = guidedState.property || propertyProfile.createPropertyProfile(propAddr.value.trim());
      profile.address = propAddr.value.trim();
      for (const [key] of factDefs) {
        const { inp, prov } = factInputs[key];
        const v = inp.value === "" ? null : Number(inp.value);
        profile = propertyProfile.setPropertyFact(profile, key, v, v === null ? "unknown" : prov.value);
      }
      guidedState.property = profile;
      const s = propertyProfile.summarizePropertyProfile(profile);
      propSummary.innerHTML = "";
      for (const f of s.facts) { const line = gxEl("p", "status", f.key + ": " + (f.value === null ? "unknown" : f.value) + " · source: " + f.provenance); propSummary.append(line); }
      propSummary.append(gxEl("p", "note", "Geocoding: UNAVAILABLE · Property records: UNAVAILABLE — no data was fetched or inferred."));
      propStatus.textContent = "Property facts saved with this project (use Save workspace).";
    } catch (e) { propStatus.textContent = "Not saved: " + e.message; }
  };
  let gxPlanFileObj = null;
  planReg.onclick = async () => {
    const f = planFile.files && planFile.files[0]; if (!f) { planStatus.textContent = "Choose a plan file first."; return; }
    try {
      const buf = await f.arrayBuffer();
      const hash = await crypto.subtle.digest("SHA-256", buf);
      const digest = [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
      gxPlanFileObj = planIngestion.createPlanUpload({ fileName: f.name, mediaType: f.type || "application/pdf", sizeBytes: f.size, digest });
      guidedState.planUploads = [gxPlanFileObj, ...guidedState.planUploads.filter((u) => u.id !== gxPlanFileObj.id)];
      planStatus.textContent = "Registered " + gxPlanFileObj.fileName + " · revision 1 (original preserved) · digest " + digest.slice(0, 12) + "… · automated detection NOT AVAILABLE — confirm dimensions below.";
    } catch (e) { planStatus.textContent = "Registration failed: " + e.message; }
  };
  planConfirm.onclick = () => {
    if (!gxPlanFileObj) { planStatus.textContent = "Register a plan first."; return; }
    try {
      gxPlanFileObj = planIngestion.confirmPlanDimensions(gxPlanFileObj, { widthIn: Number(pw.value), depthIn: Number(pd.value), source: psrc.value });
      guidedState.planUploads = guidedState.planUploads.map((u) => u.id === gxPlanFileObj.id ? gxPlanFileObj : u);
      planStatus.textContent = "Dimensions confirmed (" + pw.value + " × " + pd.value + " in, source: " + psrc.value + ").";
    } catch (e) { planStatus.textContent = "Not confirmed: " + e.message; }
  };
  planApply.onclick = () => {
    const g = gxPlanFileObj && planIngestion.planToRoomGeometry(gxPlanFileObj);
    if (!g) { planStatus.textContent = "Confirm the plan dimensions first."; return; }
    $("roomWidth").value = g.widthIn; $("roomDepth").value = g.depthIn;
    $("roomWidth").dispatchEvent(new Event("change")); $("roomDepth").dispatchEvent(new Event("change"));
    drawFloorPlan(); window.__rvRoomConfirmed = true; planStatus.textContent = "Room geometry set from the confirmed plan dimensions.";
  };
  function gxRenderScreening() {
    const t = conversions.getConversionTemplate(tplSel.value); if (!t) return;
    guidedState.templateId = t.id;
    screenBox.innerHTML = "";
    for (const q of t.screening) {
      const wrap = gxEl("div");
      const sel = selInput("gxQ_" + q.id, ["", "yes", "no", "unknown"]); sel.dataset.qid = q.id;
      field(wrap, q.topic + " — " + q.question, sel); screenBox.append(wrap);
      if (guidedState.screening && guidedState.screening.answers && guidedState.screening.answers[q.id]) sel.value = guidedState.screening.answers[q.id];
    }
  }
  tplSel.onchange = () => { gxRenderScreening(); screenResult.innerHTML = ""; layoutBox.innerHTML = ""; };
  screenBtn.onclick = () => {
    const t = conversions.getConversionTemplate(tplSel.value); if (!t) return;
    const answers = {};
    screenBox.querySelectorAll("select").forEach((s) => { if (s.value) answers[s.dataset.qid] = s.value; });
    const res = conversions.screenFeasibility(t, answers);
    guidedState.screening = { templateId: t.id, answers, result: res };
    if (guidedState.context) { try { guidedState.context = concierge.recordDecision(guidedState.context, "feasibility", true, "customer"); } catch (e) {} }
    screenResult.innerHTML = "";
    for (const f of res.flags) { const line = gxEl("p", "status", ""); const tag = gxEl("span", "tag", f.level.replace("_", " ")); line.append(tag, document.createTextNode(" " + f.topic + " — " + f.note)); screenResult.append(line); }
    screenResult.append(gxEl("p", "note", res.disclaimer));
    gxRenderConcierge();
  };
  layoutBtn.onclick = () => {
    const t = conversions.getConversionTemplate(tplSel.value); const dims = gxRoomDims();
    if (!t) return;
    if (!dims) { trStatus.textContent = "Enter the room width and depth in the planner (or confirm plan dimensions) first — layouts are generated only from confirmed dimensions."; return; }
    const layouts = conversions.generateConceptLayouts(t, dims);
    if (guidedState.context) { try { guidedState.context = concierge.recordDecision(guidedState.context, "measurements", true, "customer"); } catch (e) {} }
    guidedState.layouts = layouts;
    layoutBox.innerHTML = "";
    for (const layout of layouts) {
      const card = gxEl("div", "gx-layout-card");
      card.append(gxEl("h4", "", layout.name));
      const stage = gxEl("div", "gx-layout-stage"); stage.style.aspectRatio = (dims.widthIn / dims.depthIn).toFixed(3);
      for (const item of layout.items) {
        const b = gxEl("div", item.kind === "zone" ? "gx-zone" : "gx-furn-block", item.label);
        b.style.left = (item.x / dims.widthIn * 100) + "%"; b.style.top = (item.y / dims.depthIn * 100) + "%";
        b.style.width = (item.width / dims.widthIn * 100) + "%"; b.style.height = (item.depth / dims.depthIn * 100) + "%";
        stage.append(b);
      }
      card.append(stage, gxEl("p", "note", layout.disclosure));
      const use = gxEl("button", "secondary", "Use this layout in the planner"); use.type = "button";
      use.onclick = () => {
        for (const item of layout.items) {
          if (item.kind === "furniture") furnitureItems.push({ name: item.label, retailer: "", url: "", width: item.width, depth: item.depth, priceCents: 0, x: item.x, y: item.y, rotated: false });
          else obstacles.push({ type: "fixed", x: item.x, y: item.y, width: item.width, depth: item.depth });
        }
        drawFloorPlan(); updateFurniturePlan();
        trStatus.textContent = "Layout applied to the planner as editable blocks and zones. Verify every dimension before relying on it.";
      };
      card.append(use); layoutBox.append(card);
    }
    trStatus.textContent = "Two conceptual alternatives generated from the confirmed room dimensions.";
  };
  demoBtn.onclick = () => {
    gxRenderRates();
    for (const [id, [amt, unit]] of Object.entries(GX_DEMO_RATES)) {
      if (amt === null) continue;
      $("gxRate_" + id).value = amt; $("gxUnit_" + id).value = unit;
      $("gxSrc_" + id).value = "Demonstration planning assumptions — not market data"; $("gxConf_" + id).value = "assumption";
    }
    estStatus.textContent = "Demonstration assumptions loaded (editable). They are labeled ASSUMPTION and are not a quote.";
  };
  estBtn.onclick = () => {
    const dims = gxRoomDims();
    if (!dims) { estStatus.textContent = "Enter confirmed room dimensions in the planner first — the estimate needs an area."; return; }
    try {
      let book = conversionCosts.createRateBook();
      const required = [];
      for (const cat of conversionCosts.CONVERSION_COST_CATEGORIES) {
        if (!$("gxUse_" + cat.id).checked) continue;
        required.push(cat.id);
        const amt = $("gxRate_" + cat.id).value;
        if (amt === "") continue;
        book = conversionCosts.setRate(book, cat.id, { amountCents: Math.round(Number(amt) * 100), unit: $("gxUnit_" + cat.id).value, source: $("gxSrc_" + cat.id).value, sourceDate: new Date().toISOString().slice(0, 10), confidence: $("gxConf_" + cat.id).value });
      }
      guidedState.rateBook = book;
      const areaSqFt = dims.widthIn * dims.depthIn / 144;
      const est = conversionCosts.buildConversionEstimate({ areaSqFt, rateBook: book, requiredCategories: required, quantities: {} });
      guidedState.estimate = est;
      if (guidedState.context) { try { guidedState.context = concierge.recordDecision(guidedState.context, "measurements", true, "customer"); guidedState.context = concierge.recordDecision(guidedState.context, "estimateRates", true, "customer"); gxRenderConcierge(); } catch (e) {} }
      estResult.innerHTML = "";
      if (est.status !== "estimated") {
        estResult.append(gxEl("p", "status", "No total yet — the estimate is incomplete (fail-closed). Missing rates for: " + (est.missing || []).join(", ") + "."));
      } else {
        const tbl = gxEl("table", "");
        tbl.innerHTML = "<tr><th>Category</th><th>Basis</th><th>Amount</th></tr>";
        for (const line of est.lines) { const tr = document.createElement("tr"); tr.innerHTML = "<td></td><td></td><td></td>"; tr.children[0].textContent = line.categoryId; tr.children[1].textContent = line.basis; tr.children[2].textContent = gxMoney(line.amountCents); tbl.append(tr); }
        estResult.append(tbl);
        estResult.append(gxEl("p", "status", "Subtotal " + gxMoney(est.subtotalCents) + " · Total " + gxMoney(est.totalCents) + " · Confidence: " + est.confidence + " · Estimated " + String(est.estimatedAt).slice(0, 10)));
        for (const a of est.assumptions || []) estResult.append(gxEl("p", "note", a));
        estResult.append(gxEl("p", "note", est.disclaimer));
        if (guidedState.context) for (const line of concierge.explainTradeoffs(guidedState.context, est)) estResult.append(gxEl("p", "status", line));
      }
      estStatus.textContent = "Estimate built from the rates above. Use Save workspace to keep it with the project.";
    } catch (e) { estStatus.textContent = "Estimate not built: " + e.message; }
  };
  estImport.onclick = () => {
    const est = guidedState.estimate;
    if (!est || est.status !== "estimated") { estStatus.textContent = "Build a complete estimate first."; return; }
    const lines = conversionCosts.estimateToBudgetLines(est);
    const base = wsBudget || { currency: "USD", totalBudgetCents: guidedState.context && guidedState.context.budgetCents ? guidedState.context.budgetCents : null, allocations: {}, lines: [] };
    wsBudget = { ...base, lines: [...(base.lines || []), ...lines] };
    renderBudget();
    estStatus.textContent = lines.length + " estimate lines added to the project budget below.";
  };
  fuBtn.onclick = () => {
    const dims = gxRoomDims();
    if (!dims) { fuStatus.textContent = "Enter confirmed room dimensions in the planner first — fit checks need the real geometry."; return; }
    try {
      const budgetRaw = fuBudget.value;
      const request = furnish.createFurnishRequest({ roomId: $("roomId").value.trim() || "room", style: $("designStyle").value || null, budgetCents: budgetRaw === "" ? null : Math.round(Number(budgetRaw) * 100), quality: fuQuality.value });
      const proposal = furnish.proposeFurnishing({ request, products: wsProducts, room: { widthIn: dims.widthIn, depthIn: dims.depthIn, clearanceIn: Number($("clearance").value) || 0 } });
      guidedState.furnishRequest = request; guidedState.furnishProposal = proposal;
      gxRenderFurnish();
      fuStatus.textContent = wsProducts.length ? "Proposal built from your project catalog." : "Your project catalog is empty — add products in the catalog panel and they will be proposed here with fit checks.";
    } catch (e) { fuStatus.textContent = "Proposal failed: " + e.message; }
  };
  function gxRenderFurnish() {
    const p = guidedState.furnishProposal; if (!p) return;
    fuResult.innerHTML = "";
    if (!p.selections.length) fuResult.append(gxEl("p", "status", "No products selected yet."));
    for (const s of p.selections) {
      const line = gxEl("p", "status", "");
      const fitTxt = s.fit && s.fit.status ? s.fit.status : "unknown";
      let tierTxt = "";
      try {
        const prod = (p._selectedProducts || []).find((x) => x.productId === s.productId) || s;
        const tier = window.RV && window.RV.fitTiers ? window.RV.fitTiers.assessFit({ product: prod, room: { widthIn: Number($("roomWidth").value) || 0, depthIn: Number($("roomDepth").value) || 0, clearanceIn: Number($("clearance").value) || 0, confirmed: !!window.__rvRoomConfirmed } }) : null;
        if (tier) tierTxt = " · tier: " + tier.tier.replaceAll("_", " ");
      } catch (e) { /* tier is additive detail; the base fit status already renders */ }
      const tagSpan = gxEl("span", "tag", "fit: " + fitTxt + tierTxt);
      if (tierTxt) { const tl = tierTxt.toUpperCase(); tagSpan.className = "tag vx-tier " + (tl.includes("VERIFIED FIT") ? "vx-tier-verified" : tl.includes("POTENTIAL") ? "vx-tier-potential" : tl.includes("DOES NOT FIT") ? "vx-tier-no" : "vx-tier-unknown"); }
      line.append(tagSpan, document.createTextNode(" " + s.name + " (" + s.category + ") — " + gxMoney(s.priceCents)));
      const swapAlts = (typeof wsProducts !== "undefined" ? wsProducts : []).filter((x) => x.productId !== s.productId && x.priceCents !== null && x.priceCents !== undefined);
      if (swapAlts.length) {
        const swapSel = document.createElement("select"); swapSel.setAttribute("aria-label", "Replace " + s.name + " with another catalog product"); swapSel.style.marginLeft = "8px";
        const keep = document.createElement("option"); keep.value = ""; keep.textContent = "Replace with…"; swapSel.append(keep);
        for (const alt of swapAlts) { const o = document.createElement("option"); o.value = alt.productId; o.textContent = alt.name + " — " + gxMoney(alt.priceCents); swapSel.append(o); }
        swapSel.onchange = () => {
          const alt = swapAlts.find((x) => x.productId === swapSel.value); if (!alt) return;
          const budgetBefore = (p.totalCents || 0) + (p.remainingCents || 0);
          s.productId = alt.productId; s.name = alt.name; s.priceCents = alt.priceCents; s.category = alt.type || alt.category || s.category; s.fit = null;
          if (Array.isArray(p._selectedProducts)) { const ix = p._selectedProducts.findIndex((x) => x.productId === alt.productId); if (ix < 0) p._selectedProducts.push(alt); }
          p.totalCents = p.selections.reduce((a, x) => a + (x.priceCents || 0), 0);
          p.remainingCents = budgetBefore - p.totalCents;
          gxRenderFurnish();
        };
        line.append(swapSel);
      }
      fuResult.append(line);
    }
    fuResult.append(gxEl("p", "status", "Total: " + gxMoney(p.totalCents) + (p.remainingCents !== null && p.remainingCents !== undefined ? " · Remaining: " + gxMoney(p.remainingCents) : "")));
    for (const n of p.notes || []) fuResult.append(gxEl("p", "note", n));
    if (p.unfilledCategories && p.unfilledCategories.length) fuResult.append(gxEl("p", "note", "No catalog product yet for: " + p.unfilledCategories.join(", ") + "."));
    fuResult.append(gxEl("p", "note", "Retailer connections are UNAVAILABLE — these are your catalog products with their recorded sources; verify price and availability with the retailer before purchase."));
  }
  window.gxRenderAll = function () {
    gxRenderConcierge(); gxRenderRates(); gxRenderScreening();
    if (guidedState.property) { propAddr.value = guidedState.property.address || ""; for (const [key] of factDefs) { const f = guidedState.property.facts[key]; if (f !== null && f !== undefined) factInputs[key].inp.value = f; const pv = guidedState.property.provenance[key]; if (pv && pv !== "unknown") factInputs[key].prov.value = pv; } }
    if (guidedState.estimate) estStatus.textContent = "Estimate restored from the saved workspace.";
    if (guidedState.furnishProposal) gxRenderFurnish();
    if (guidedState.screening) screenBtn.click();
  };
  gxRenderRates(); gxRenderScreening(); gxRenderConcierge();
}
if (window.RV) gxBuildPanels(); else window.addEventListener("rv-ready", gxBuildPanels, { once: true });


/* ==== Visual-first studio (founder directive 2026-11-19): START/DESIGN/TRANSFORM/FURNISH/REVIEW/EXPORT,
   Design Harmony Engine UI, optional assistant, Deal Scout scope import. Additive: reuses the certified
   panels and engines; the manual journey never depends on this block. ==== */
(function rvVisualStudio() {
  var css = ".vx-stage{margin:0 0 8px;scroll-margin-top:64px}.vx-stage-head{display:flex;align-items:baseline;gap:12px;margin:26px 0 4px}.vx-stage-head .n{font:600 11px/1 Inter,system-ui,sans-serif;letter-spacing:.14em;color:var(--accent)}"
  + ".vx-stage-head h2{font-family:Fraunces,Georgia,serif;font-size:24px;font-weight:600;margin:0;color:var(--ink)}"
  + ".vx-start-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin:14px 0}"
  + ".vx-start-card{display:block;width:100%;text-align:left;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:22px;cursor:pointer;font:inherit;color:var(--ink)}"
  + ".vx-start-card:hover{border-color:var(--accent)} .vx-start-card strong{display:block;font-family:Fraunces,Georgia,serif;font-size:20px;margin-bottom:6px}"
  + ".vx-start-card span{color:var(--ink-2);font-size:13px;line-height:1.5;display:block}"
  + ".vx-alt{display:flex;gap:10px;flex-wrap:wrap;margin:4px 0 10px}"
  + ".vx-family-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:12px;margin:12px 0}"
  + ".vx-family-card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:10px;cursor:pointer;text-align:left;font:inherit;color:var(--ink);width:100%}"
  + ".vx-family-card[aria-pressed='true']{border-color:var(--accent);box-shadow:0 0 0 1px var(--accent)}"
  + ".vx-swatches{display:flex;height:44px;border-radius:8px;overflow:hidden;margin-bottom:8px}.vx-swatches i{flex:1}"
  + ".vx-family-card strong{display:block;font-size:13px}.vx-family-card small{color:var(--ink-2);font-size:11px;line-height:1.4;display:block}"
  + ".vx-chiprow{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0}"
  + ".vx-swatch-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(86px,1fr));gap:10px;margin:10px 0}"
  + ".vx-swatch{border:1px solid var(--line);border-radius:10px;overflow:hidden;background:var(--card);cursor:pointer;padding:0;font:inherit;text-align:left;color:var(--ink);width:100%}"
  + ".vx-swatch i{display:block;height:44px}.vx-swatch span{display:block;font-size:11px;padding:6px 8px}.vx-swatch small{display:block;font-size:10px;color:var(--ink-2);padding:0 8px 6px}"
  + ".vx-combo{display:flex;gap:10px;flex-wrap:wrap;margin:10px 0}.vx-combo div{flex:1;min-width:110px;border:1px solid var(--line);border-radius:10px;overflow:hidden}"
  + ".vx-combo i{display:block;height:52px}.vx-combo span{display:block;font-size:11px;padding:6px 8px;background:var(--card)}"
  + ".vx-findings{margin:8px 0}.vx-findings li{margin:3px 0}"
  + ".vx-hero{position:relative;border-radius:16px;overflow:hidden;margin:14px 0 4px;min-height:180px;background:#2c2620 center/cover no-repeat;display:flex;align-items:flex-end}"
  + ".vx-hero-in{padding:22px 24px;color:#fdfbf7;background:linear-gradient(0deg,rgba(24,20,16,.72),rgba(24,20,16,0) 70%);width:100%}"
  + ".vx-hero-in strong{display:block;font-family:Fraunces,Georgia,serif;font-size:30px;font-weight:600;line-height:1.15}"
  + ".vx-hero-in span{display:block;margin-top:6px;font-size:14px;opacity:.92;max-width:560px;line-height:1.5}"
  + ".vx-ggrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(248px,1fr));gap:16px;margin:12px 0}"
  + ".vx-gcard{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:0;overflow:hidden;cursor:pointer;text-align:left;font:inherit;color:var(--ink);width:100%}"
  + ".vx-gcard:hover{border-color:var(--accent)} .vx-gcard[aria-pressed='true']{border-color:var(--accent);box-shadow:0 0 0 2px var(--accent)}"
  + ".vx-gcard img{display:block;width:100%;height:168px;object-fit:cover}"
  + ".vx-gph{height:168px;background:repeating-linear-gradient(45deg,#e9eff3,#e9eff3 10px,#f3eee5 10px,#f3eee5 20px);display:flex;align-items:center;justify-content:center;color:var(--ink-2);font-size:12px;letter-spacing:.08em}"
  + ".vx-gbody{padding:12px 14px 14px}.vx-gbody strong{display:block;font-size:15px;margin-bottom:4px}.vx-gbody small{color:var(--ink-2);font-size:12px;line-height:1.45;display:block}"
  + ".vx-gbody .vx-swatches{height:10px;margin:10px 0 8px}.vx-gdir{font-size:11px;color:var(--ink-2);line-height:1.5}"
  + ".vx-board{display:grid;grid-template-columns:repeat(auto-fill,minmax(208px,1fr));gap:12px;margin:12px 0}"
  + ".vx-tile{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:12px}"
  + ".vx-tile h4{margin:0;font-size:13px;display:flex;justify-content:space-between;align-items:center;gap:8px}"
  + ".vx-tvis{height:58px;border-radius:10px;margin:10px 0 8px;border:1px solid var(--line)}"
  + ".vx-tval{font-size:12px;color:var(--ink-2);line-height:1.45;min-height:34px}"
  + ".vx-talts{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}.vx-talts button{font-size:11px;padding:5px 8px}"
  + ".vx-talts i{display:inline-block;width:18px;height:18px;border-radius:5px;border:1px solid var(--line);vertical-align:middle}"
  + ".vx-lockbtn{font-size:11px;padding:4px 8px}.vx-lockbtn[aria-pressed='true']{background:var(--accent);color:#fff;border-color:var(--accent)}"
  + ".vx-tier{display:inline-block;padding:2px 8px;border-radius:999px;font-size:10px;font-weight:700;letter-spacing:.04em}"
  + ".vx-tier-verified{background:#1e5c3a;color:#fff}.vx-tier-potential{background:#b97f16;color:#fff}.vx-tier-unknown{background:#6b7280;color:#fff}.vx-tier-no{background:#fff;color:#b3261e;border:1px solid #b3261e}"
  + ".vx-review-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin:12px 0}"
  + ".vx-review-card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:14px}.vx-review-card h4{margin:0 0 6px;font-size:13px}.vx-review-card p{margin:3px 0;font-size:12px;color:var(--ink-2);line-height:1.5}"
  + ".vx-export-list{margin:8px 0;padding-left:18px}.vx-export-list li{margin:4px 0;font-size:13px}"
  + ".vx-gcard:focus-visible,.vx-start-card:focus-visible,.vx-swatch:focus-visible,.vx-tile button:focus-visible{outline:3px solid var(--accent);outline-offset:2px}"
  + "#floorPlan{height:min(460px,62vh)!important}"
  + "@media (max-width:760px){.vx-start-grid{grid-template-columns:1fr}.vx-hero-in strong{font-size:24px}.vx-board{grid-template-columns:1fr 1fr}#floorPlan{height:300px!important}}"
  + "@media (max-width:520px){.vx-board{grid-template-columns:1fr}.vx-ggrid{grid-template-columns:1fr}}"
  + "@media (prefers-reduced-motion:reduce){.vx-stage *,#journeyStrip *{transition:none!important}html{scroll-behavior:auto!important}}";
  var styleEl = document.createElement("style"); styleEl.textContent = css; document.head.appendChild(styleEl);

  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; }
  function stageWrap(id, num, title) {
    var w = document.createElement("section"); w.className = "vx-stage"; w.id = id;
    var head = el("div", "vx-stage-head"); head.append(el("span", "n", num), el("h2", "", title)); w.append(head); return w;
  }
  function scrollTo(node) { if (node) node.scrollIntoView({ behavior: "smooth", block: "start" }); }

  /* --- Reorganization + panel construction run on rv-ready, AFTER the guided block has built its
     panels (its insertions assume the certified stage blocks are still children of <main>). --- */
  var harmonyPanel, dsPanel, dsStatus, dsText, dsBtn, dsResult, famGrid, comboBox, atmoSel, paintChips, swatchGrid, selLine, lockBtn, harmonyStatus, proposalBox, verLabel, verBtn, verList, boardGrid, reviewGrid, exportList;
  var conciergePanel = null, reopenBtn = null;
  function field2(label, input) { var w = el("div", "field"); var l = el("label", "", label); l.htmlFor = input.id || ""; w.append(l, input); return w; }
  function vxBuild() {
  /* --- Reorganize the certified blocks into the six-stage journey (moves only; nothing removed) --- */
  var main = document.querySelector("main");
  var stageProject = $("stageProject"), stageVision = $("stageVision"), stagePlan = $("stagePlan"), stageFinish = $("stageFinish");
  var propPanel = $("gxPropertyPanel"), transformPanel = $("gxTransformPanel"), furnishPanel = $("gxFurnishPanel"), estimatePanel = $("gxEstimatePanel");
  var startWrap = stageWrap("stageStart", "01", "Start");
  var designWrap = stageWrap("stageDesign", "02", "Design");
  var transformWrap = stageWrap("stageTransform", "03", "Transform");
  var furnishWrap = stageWrap("stageFurnish", "04", "Furnish");
  var reviewWrap = stageWrap("stageReview", "05", "Review");
  var exportWrap = stageWrap("stageExport", "06", "Export");
  if (main && stageProject) {
    main.insertBefore(startWrap, stageProject);
    main.insertBefore(designWrap, stageProject);
    main.insertBefore(transformWrap, stageProject);
    main.insertBefore(furnishWrap, stageProject);
    main.insertBefore(reviewWrap, stageProject);
    main.insertBefore(exportWrap, stageProject);
    var startGrid = el("div", "vx-start-grid");
    var cardPlan = el("button", "vx-start-card"); cardPlan.type = "button"; cardPlan.id = "vxStartPlan";
    cardPlan.append(el("strong", "", "Upload floor plan"), el("span", "", "PDF or image. Your original is preserved, and you confirm the measurements yourself — nothing is guessed from a drawing."));
    var cardAddr = el("button", "vx-start-card"); cardAddr.type = "button"; cardAddr.id = "vxStartAddress";
    cardAddr.append(el("strong", "", "Enter property address"), el("span", "", "Start from the property itself. Only information you provide or verify is recorded — an address alone never invents room sizes."));
    startGrid.append(cardPlan, cardAddr);
    var hero = el("div", "vx-hero"); hero.setAttribute("role", "img"); hero.setAttribute("aria-label", "Warm modern living room in warm ivory and natural oak — RENOVISION style inspiration");
    hero.style.backgroundImage = "url(/assets/styles/warm-modern.jpg)";
    var heroIn = el("div", "vx-hero-in");
    heroIn.append(el("strong", "", "Design a home you love."), el("span", "", "Begin with a floor plan or your address. Choose an atmosphere, coordinate paint and materials, furnish with confidence — and watch one cohesive design take shape."));
    hero.append(heroIn); startWrap.append(hero); startWrap.append(startGrid);
    var altRow = el("div", "vx-alt");
    var altPhoto = el("button", "secondary", "Start with a room photo"); altPhoto.type = "button"; altPhoto.id = "vxStartPhoto";
    var altRoom = el("button", "secondary", "Create a room manually"); altRoom.type = "button"; altRoom.id = "vxStartRoom";
    altRow.append(altPhoto, altRoom); startWrap.append(altRow);
    if (propPanel) startWrap.append(propPanel);
    startWrap.append(stageProject);
    cardPlan.onclick = function () { var f = $("gxPlanFile"); if (f) f.click(); else scrollTo(propPanel); };
    cardAddr.onclick = function () { var a = $("gxPropAddress"); if (a) { scrollTo(propPanel); a.focus(); } };
    altPhoto.onclick = function () { scrollTo(stageVision); };
    altRoom.onclick = function () { scrollTo(stageProject); };
    var matSection = null;
    main.querySelectorAll(":scope > section.panel").forEach(function (s) { var h = s.querySelector("h3"); if (h && h.textContent.indexOf("Material library") === 0) matSection = s; });
    if (matSection) designWrap.append(matSection);
    var plannerSection = document.getElementById("interiorPlanner");
    if (plannerSection) transformWrap.append(plannerSection);
    if (stageVision) transformWrap.append(stageVision);
    if (transformPanel) transformWrap.append(transformPanel);
    var catalogPanel = null;
    main.querySelectorAll(":scope > section.panel").forEach(function (s) { if (s.id === "catalogPanel") catalogPanel = s; });
    if (furnishPanel) furnishWrap.append(furnishPanel);
    if (catalogPanel) furnishWrap.append(catalogPanel);
    var reviewBoard = makePanel("Your design at a glance", "The selected design, coordinated materials, furnishing plan and budget — one coherent picture. Open the panels below only when you want the underlying detail.");
    reviewGrid = el("div", "vx-review-grid"); reviewGrid.id = "vxReviewGrid"; reviewBoard.append(reviewGrid);
    reviewWrap.append(reviewBoard);
    if (stagePlan) reviewWrap.append(stagePlan);
    if (estimatePanel && estimatePanel.parentElement !== reviewWrap) { /* estimate already lives inside stagePlan */ }
    var budgetPanel = document.getElementById("budgetPanel"); if (budgetPanel) reviewWrap.append(budgetPanel);
    if (stageFinish) exportWrap.append(stageFinish);
    var exportPanel = makePanel("Your project package", "Everything RENOVISION can actually deliver today, assembled from your project. The checklist below shows what is ready so far. The download buttons live with each tool: Download design brief and Download contractor scope beside your photo in Transform, Download design and shopping plan in the planner, and Download concept with a generated concept. No other formats are claimed.");
    exportList = el("ul", "vx-export-list"); exportList.id = "vxExportList"; exportPanel.append(exportList);
    exportWrap.append(exportPanel);
    [stageVision, stagePlan, stageFinish].forEach(function (b) { if (!b) return; var h = b.querySelector(".stage-head"); if (h) h.style.display = "none"; });
    var spHead = stageProject.querySelector(".chapter"); if (spHead) spHead.textContent = "Or begin with a room";
    var view3d = el("a", "secondary", "Open the 3D Asset Studio"); view3d.href = "/3d-viewer"; view3d.target = "_blank"; view3d.rel = "noopener"; view3d.id = "vxView3d"; view3d.style.display = "inline-block"; view3d.style.margin = "10px 0";
    var view3dNote = el("p", "note", "3D generation from your photo is not available yet, and opening this studio does not create a model. The 3D Asset Studio inspects sample models and your own .glb files in interactive 3D — drag to orbit, scroll to zoom. For a concept image of your room, use Generate renovation concept in the Transform stage. The studio opens in a new tab; close it to return here.");
    furnishWrap.append(view3d, view3dNote);
  }

  /* --- Rail anchors for the six stages --- */
  var vxTargets = ["stageStart", "stageDesign", "stageTransform", "stageFurnish", "stageReview", "stageExport"];
  function vxWireRail() {
    var strip = $("journeyStrip"); if (!strip) return;
    strip.querySelectorAll("li").forEach(function (li, i) {
      li.style.cursor = "pointer";
      li.addEventListener("click", function () { var t = document.getElementById(vxTargets[i]); if (t) scrollTo(t); });
    });
  }
  var vxObs = new MutationObserver(function () { vxWireRail(); });
  var stripNode = $("journeyStrip"); if (stripNode) { vxObs.observe(stripNode, { childList: true }); vxWireRail(); }

  /* --- Optional assistant: open/close control (the manual journey never depends on it) --- */
  conciergePanel = document.getElementById("gxConciergePanel");
  reopenBtn = el("button", "secondary", "Show design assistant"); reopenBtn.type = "button"; reopenBtn.id = "vxAssistantOpen"; reopenBtn.style.display = "none";
  vxSetAssistantImpl = function (open) {
    assistantOpen = !!open;
    if (conciergePanel) conciergePanel.style.display = assistantOpen ? "" : "none";
    reopenBtn.style.display = assistantOpen ? "none" : "";
    try { guidedState.assistantOpen = assistantOpen; } catch (e) {}
  };
  if (conciergePanel) {
    var hideBtn = el("button", "secondary", "Hide assistant"); hideBtn.type = "button"; hideBtn.id = "vxAssistantHide";
    hideBtn.onclick = function () { vxSetAssistant(false); };
    conciergePanel.append(hideBtn);
    conciergePanel.parentElement.insertBefore(reopenBtn, conciergePanel);
    reopenBtn.onclick = function () { vxSetAssistant(true); scrollTo(conciergePanel); };
  }

  /* --- Design Harmony panel --- */
  harmonyPanel = makePanel("Design harmony", "Choose a style family and every suggestion — paint, flooring, cabinetry, lighting, furniture — is coordinated around it. Suggestions, never restrictions: you can override anything, and approved selections are locked against silent changes.");
  harmonyPanel.id = "vxHarmonyPanel";
  if (designWrap) designWrap.append(harmonyPanel);
  famGrid = el("div", "vx-family-grid"); famGrid.id = "vxFamilyGrid"; harmonyPanel.append(famGrid);
  comboBox = el("div"); comboBox.id = "vxComboBox"; harmonyPanel.append(comboBox);
  atmoSel = selInput("vxAtmosphere", ["", "warm", "elegant", "airy", "cozy", "dramatic", "sophisticated", "natural", "contemporary", "calm"]);
  harmonyPanel.append(field2("Browse paint by atmosphere", atmoSel));
  paintChips = el("div", "vx-chiprow"); paintChips.id = "vxPaintChips"; harmonyPanel.append(paintChips);
  swatchGrid = el("div", "vx-swatch-grid"); swatchGrid.id = "vxSwatchGrid"; harmonyPanel.append(swatchGrid);
  selLine = el("p", "status", ""); selLine.id = "vxSelectionLine"; harmonyPanel.append(selLine);
  lockBtn = el("button", "secondary", "Lock wall color"); lockBtn.type = "button"; lockBtn.id = "vxLockPaint"; harmonyPanel.append(lockBtn);
  harmonyStatus = el("div"); harmonyStatus.id = "vxHarmonyStatus"; harmonyPanel.append(harmonyStatus);
  proposalBox = el("div"); proposalBox.id = "vxProposalBox"; harmonyPanel.append(proposalBox);
  verLabel = textInput("vxVersionLabel", "Version label (e.g. Warm modern v1)");
  verBtn = el("button", "secondary", "Save design version"); verBtn.type = "button"; verBtn.id = "vxSaveVersion";
  harmonyPanel.append(field2("Design versions", verLabel), verBtn);
  verList = el("div"); verList.id = "vxVersionList"; harmonyPanel.append(verList);
  harmonyPanel.append(el("h3", "", "Design harmony board"));
  harmonyPanel.append(el("p", "note", "Every coordinated element of your design, together. Alternatives come from the style families — blend freely; locked elements are never overwritten silently, and screen colors and finishes are approximate."));
  boardGrid = el("div", "vx-board"); boardGrid.id = "vxBoard"; harmonyPanel.append(boardGrid);
  harmonyPanel.append(el("p", "note", "Paint colors are digital references and read approximately on screen; they are not manufacturer products. Verify against a physical sample before purchasing paint."));
  /* --- Deal Scout scope panel (Review) --- */
  dsPanel = makePanel("Deal Scout renovation scope", "Deal Scout owns general renovation scope. RENOVISION imports an approved scope document with its provenance and never regenerates or edits it.");
  dsPanel.id = "vxDealScoutPanel";
  if (reviewWrap) reviewWrap.append(dsPanel);
  dsStatus = el("p", "status", ""); dsStatus.id = "vxDsStatus"; dsPanel.append(dsStatus);
  dsText = document.createElement("textarea"); dsText.id = "vxDsJson"; dsText.rows = 5; dsText.placeholder = "Paste an approved Deal Scout scope document (renovision-deal-scout-scope/v1)"; dsText.setAttribute("aria-label", "Deal Scout scope document");
  dsPanel.append(dsText);
  dsBtn = el("button", "", "Import scope"); dsBtn.type = "button"; dsBtn.id = "vxDsImport"; dsPanel.append(dsBtn);
  dsResult = el("div"); dsResult.id = "vxDsResult"; dsPanel.append(dsResult);

  lockBtn.onclick = function () { if (!H || !designState) return; designState = designState.locked && designState.locked.paintHex ? H.unlockSelection(designState, "paintHex") : H.lockSelection(designState, "paintHex"); renderHarmonyStatus(); };
  verBtn.onclick = function () { if (!H || !designState) return; var label = verLabel.value.trim() || "Design version"; designState = H.saveVersion(designState, label); verLabel.value = ""; renderVersions(); renderHarmonyStatus(); };
  atmoSel.onchange = function () { renderSwatches(); };
  dsBtn.onclick = function () {
    if (!window.RV || !window.RV.dealScout) { dsStatus.textContent = "Scope tools are still loading."; return; }
    try { var doc = JSON.parse(dsText.value); dsScope = window.RV.dealScout.importDealScoutScope(doc); renderDealScout(); }
    catch (e) { dsResult.innerHTML = ""; dsResult.append(el("p", "status", "Import rejected: " + e.message + (e.errors ? " — " + e.errors.join("; ") : ""))); }
  };
  }
  var assistantOpen = true;
  var vxSetAssistantImpl = null;
  function vxSetAssistant(open) { if (vxSetAssistantImpl) vxSetAssistantImpl(open); }

  /* --- State + rendering (engines arrive via rv-ready) --- */
  var H = null, designState = null, designFamilyId = "warm-modern", designChosen = false, dsScope = null, paintFamilyId = "warm-whites", pendingProposal = null, pendingRestore = null;
  var STYLE_MAP = { "warm-modern": "modern-organic", "organic-contemporary": "modern-organic", "modern-sophistication": "contemporary", "contemporary-luxury": "contemporary", "timeless-elegance": "traditional", "transitional": "transitional", "scandinavian": "scandinavian", "mid-century-modern": "mid-century-modern", "traditional": "traditional", "coastal": "coastal", "industrial": "industrial", "minimalist": "minimalist" };
  function harmonyInput() { return { familyId: designFamilyId }; }
  function refreshDesignDone() { window.__rvDesignDone = !!(designChosen || (designState && Object.keys(designState.selections || {}).length)); }
  function renderHarmonyStatus() {
    if (!H || !designState) { harmonyStatus.innerHTML = ""; return; }
    var ev;
    try { ev = H.evaluateHarmony({ familyId: designFamilyId, selections: designState.selections || {} }); } catch (e) { harmonyStatus.textContent = "Harmony check unavailable: " + e.message; return; }
    harmonyStatus.innerHTML = "";
    harmonyStatus.append(el("p", "status", "Harmony: " + ev.status + " for " + designFamilyId.replaceAll("-", " ") + "."));
    var ul = el("ul", "vx-findings");
    for (const f of ev.findings) { if (f.level === "attention" || f.level === "conflict") { var li = el("li", "", f.rule + " — " + f.message + (f.suggestion ? " Suggestion: " + f.suggestion : "")); ul.append(li); } }
    if (ul.children.length) harmonyStatus.append(ul);
    var sel = designState.selections || {};
    selLine.textContent = "Selections: " + (sel.paintHex ? "wall " + sel.paintHex : "no wall color yet") + (designState.locked && designState.locked.paintHex ? " (locked)" : "") + (sel.flooringKeyword ? " · flooring: " + sel.flooringKeyword : "") + (sel.lighting ? " · lighting: " + sel.lighting : "") + ".";
    lockBtn.textContent = designState.locked && designState.locked.paintHex ? "Unlock wall color" : "Lock wall color";
    renderBoard(); renderReview(); renderExport();
  }
  /* --- Design harmony board: every coordinated element, lockable, blendable --- */
  function toneDir(fam, warm, neutral, cool) { return fam && fam.undertone === "cool" ? cool : fam && fam.undertone === "neutral" ? neutral : warm; }
  function unionOf(field, cap) { var out = []; for (const f of H.HARMONY_STYLE_FAMILIES) { for (const v of f[field] || []) { if (!out.includes(v)) out.push(v); } } return out.slice(0, cap || 10); }
  var BOARD_CATS = [
    { key: "trimHex", label: "Trim paint", visual: function (fam, sel) { return sel || (fam && fam.palette ? fam.palette.trim : "#f5f0e6"); }, value: function (fam, sel) { return { text: sel || (fam && fam.palette ? fam.palette.trim : "—"), isDefault: !sel }; }, alternatives: function () { return H.HARMONY_STYLE_FAMILIES.filter(function (f) { return f.palette && f.palette.trim; }).map(function (f) { return { label: f.name, value: f.palette.trim, hex: f.palette.trim }; }); } },
    { key: "ceilingHex", label: "Ceiling paint", visual: function (fam, sel) { return sel || (fam && fam.palette ? fam.palette.ceiling : "#ffffff"); }, value: function (fam, sel) { return { text: sel || (fam && fam.palette ? fam.palette.ceiling : "—"), isDefault: !sel }; }, alternatives: function () { return H.HARMONY_STYLE_FAMILIES.filter(function (f) { return f.palette && f.palette.ceiling; }).map(function (f) { return { label: f.name, value: f.palette.ceiling, hex: f.palette.ceiling }; }); } },
    { key: "accentHex", label: "Accent color", visual: function (fam, sel) { return sel || (fam && fam.palette ? fam.palette.accent : "#8a6d4f"); }, value: function (fam, sel) { return { text: sel || (fam && fam.palette ? fam.palette.accent : "—"), isDefault: !sel }; }, alternatives: function () { return H.HARMONY_STYLE_FAMILIES.filter(function (f) { return f.palette && f.palette.accent; }).map(function (f) { return { label: f.name, value: f.palette.accent, hex: f.palette.accent }; }); } },
    { key: "flooringKeyword", label: "Flooring", visual: function () { return "linear-gradient(90deg,#b98d5e,#a1763f 45%,#c49a6c)"; }, value: function (fam, sel) { return { text: sel || (fam && fam.flooringKeywords ? fam.flooringKeywords[0] : "—"), isDefault: !sel }; }, alternatives: function () { return unionOf("flooringKeywords").map(function (v) { return { label: v, value: v }; }); } },
    { key: "cabinetry", label: "Cabinetry", visual: function (fam) { return "linear-gradient(135deg," + (fam && fam.palette ? fam.palette.accent : "#8a6d4f") + "," + (fam && fam.palette ? fam.palette.wall : "#e8dfca") + ")"; }, value: function (fam, sel) { return { text: sel || (fam && fam.cabinetKeywords ? fam.cabinetKeywords[0] : "—"), isDefault: !sel }; }, alternatives: function () { return unionOf("cabinetKeywords").map(function (v) { return { label: v, value: v }; }); } },
    { key: "countertop", label: "Countertops", visual: function () { return "linear-gradient(120deg,#efe9dd,#ddd3bf 55%,#f4efe4)"; }, value: function (fam, sel) { return { text: sel || toneDir(fam, "Light stone with warm veining", "Honed stone with soft grey veining", "Crisp quartz with cool veining"), isDefault: !sel }; }, alternatives: function () { return ["Light stone with warm veining", "Honed stone with soft grey veining", "Crisp quartz with cool veining"].map(function (v) { return { label: v, value: v }; }); } },
    { key: "tile", label: "Tile", visual: function () { return "repeating-linear-gradient(0deg,#e7dfd0 0 10px,#d9cfb8 10px 11px),repeating-linear-gradient(90deg,#e7dfd0 0 10px,#d9cfb8 10px 11px)"; }, value: function (fam, sel) { return { text: sel || toneDir(fam, "Handmade-look ceramic, warm glaze", "Large-format matte porcelain", "Gloss ceramic, cool glaze"), isDefault: !sel }; }, alternatives: function () { return ["Handmade-look ceramic, warm glaze", "Large-format matte porcelain", "Gloss ceramic, cool glaze"].map(function (v) { return { label: v, value: v }; }); } },
    { key: "hardware", label: "Hardware", visual: function () { return "linear-gradient(90deg,#8c6a2f,#c9a227,#8c6a2f)"; }, value: function (fam, sel) { return { text: sel || toneDir(fam, "Brushed brass", "Matte black", "Polished nickel"), isDefault: !sel }; }, alternatives: function () { return ["Brushed brass", "Aged bronze", "Matte black", "Polished nickel"].map(function (v) { return { label: v, value: v }; }); } },
    { key: "fixtures", label: "Fixtures", visual: function () { return "linear-gradient(120deg,#d8d2c4,#b6ad99)"; }, value: function (fam, sel) { return { text: sel || toneDir(fam, "Warm metal with opal glass", "Sculptural matte fixtures", "Chrome with clear glass"), isDefault: !sel }; }, alternatives: function () { return ["Warm metal with opal glass", "Sculptural matte fixtures", "Chrome with clear glass"].map(function (v) { return { label: v, value: v }; }); } },
    { key: "lighting", label: "Lighting", visual: function (fam, sel) { var t = sel || (fam ? fam.lighting : "warm"); return t === "cool" ? "linear-gradient(120deg,#dfe9f2,#b9c9d8)" : t === "neutral" ? "linear-gradient(120deg,#efe9dc,#d9d2c0)" : "linear-gradient(120deg,#f6dfae,#eda93f)"; }, value: function (fam, sel) { return { text: (sel || (fam ? fam.lighting : "warm")) + " light", isDefault: !sel }; }, alternatives: function () { return ["warm", "neutral", "cool"].map(function (v) { return { label: v + " light", value: v }; }); } },
    { key: "upholstery", label: "Upholstery", visual: function () { return "linear-gradient(120deg,#e5d9c3,#cbb896)"; }, value: function (fam, sel) { var tags = fam && fam.furnitureTags ? fam.furnitureTags : []; var d = tags.includes("velvet") ? "Tailored velvet" : tags.includes("leather") ? "Full-grain leather" : tags.includes("linen") ? "Natural linen" : "Woven cotton"; return { text: sel || d, isDefault: !sel }; }, alternatives: function () { return ["Natural linen", "Tailored velvet", "Textured boucle", "Full-grain leather", "Woven cotton"].map(function (v) { return { label: v, value: v }; }); } },
    { key: "furnitureTag", label: "Furniture direction", visual: function () { return "linear-gradient(120deg,#a98d68,#7d6242)"; }, value: function (fam, sel) { return { text: sel || (fam && fam.furnitureTags ? fam.furnitureTags.join(", ") : "—"), isDefault: !sel }; }, alternatives: function () { return unionOf("furnitureTags").map(function (v) { return { label: v, value: v }; }); } }
  ];
  function renderBoard() {
    if (!H || !designState || !boardGrid) return;
    var fam = H.getHarmonyFamily(designFamilyId);
    boardGrid.innerHTML = "";
    for (const cat of BOARD_CATS) {
      var sel = designState.selections ? designState.selections[cat.key] : undefined;
      var locked = !!(designState.locked && designState.locked[cat.key]);
      var tile = el("div", "vx-tile");
      var head = el("h4"); head.append(el("span", "", cat.label));
      var lb = el("button", "vx-lockbtn", locked ? "Locked" : "Lock"); lb.type = "button"; lb.id = "vxLock_" + cat.key; lb.setAttribute("aria-pressed", locked ? "true" : "false");
      lb.onclick = (function (c2, was) { return function () { designState = was ? H.unlockSelection(designState, c2.key) : H.lockSelection(designState, c2.key); renderBoard(); renderHarmonyStatus(); }; })(cat, locked);
      head.append(lb); tile.append(head);
      var vis = el("div", "vx-tvis"); var bg = cat.visual(fam, sel); if (bg) vis.style.background = bg; tile.append(vis);
      var val = cat.value(fam, sel);
      tile.append(el("div", "vx-tval", val.text + (val.isDefault ? " — style direction" : " — your selection")));
      var alts = el("div", "vx-talts");
      for (const a of cat.alternatives(fam)) {
        var b = el("button", "secondary"); b.type = "button"; b.title = a.label;
        if (a.hex) { var swi = document.createElement("i"); swi.style.background = a.hex; b.append(swi); }
        else b.textContent = a.label;
        b.onclick = (function (c2, alt) { return function () { proposeOrSet(c2.key, alt.value, c2.label + ": " + alt.label); }; })(cat, a);
        alts.append(b);
      }
      tile.append(alts);
      boardGrid.append(tile);
    }
  }
  function renderFamilies() {
    if (!H) return; famGrid.innerHTML = "";
    famGrid.className = "vx-ggrid";
    for (const fam of H.HARMONY_STYLE_FAMILIES) {
      var card = el("button", "vx-gcard"); card.type = "button"; card.id = "vxFam_" + fam.id;
      card.setAttribute("aria-pressed", fam.id === designFamilyId ? "true" : "false");
      if (fam.palette && fam.id !== "custom-mixed") {
        var img = document.createElement("img"); img.src = "/assets/styles/" + fam.id + ".jpg"; img.alt = fam.name + " interior — illustrative concept imagery"; img.loading = "lazy";
        img.onerror = function () { var ph = el("div", "vx-gph", "STYLE INSPIRATION"); this.replaceWith(ph); };
        card.append(img);
      } else {
        card.append(el("div", "vx-gph", "BLEND YOUR OWN"));
      }
      var body = el("div", "vx-gbody");
      body.append(el("strong", "", fam.name), el("small", "", fam.description || ""));
      if (fam.palette) { var sw = el("div", "vx-swatches"); for (const k of ["wall", "trim", "ceiling", "accent"]) { var i = document.createElement("i"); i.style.background = fam.palette[k]; sw.append(i); } body.append(sw); }
      var dir = [];
      if (fam.flooringKeywords && fam.flooringKeywords[0]) dir.push("Flooring: " + fam.flooringKeywords[0]);
      if (fam.lighting) dir.push("Light: " + fam.lighting);
      if (fam.furnitureTags && fam.furnitureTags.length) dir.push("Furniture: " + fam.furnitureTags.slice(0, 2).join(", "));
      if (dir.length) body.append(el("div", "vx-gdir", dir.join(" · ")));
      card.append(body);
      card.onclick = function () {
        designFamilyId = fam.id; designChosen = true;
        var mapped = STYLE_MAP[fam.id]; var sel = $("designStyle");
        if (mapped && sel) { for (const o of sel.options) { if (o.value === mapped || o.textContent.toLowerCase().indexOf(mapped.replaceAll("-", " ")) === 0) { sel.value = o.value; sel.dispatchEvent(new Event("change")); break; } } }
        renderFamilies(); renderCombo(); renderPaintChips(); renderHarmonyStatus(); refreshDesignDone(); rvJourneyUpdate();
      };
      famGrid.append(card);
    }
    var cap = el("p", "note", "Style imagery is illustrative concept imagery created for RENOVISION to convey each atmosphere — it is not a photograph of your space, and screen colors are approximate.");
    cap.style.gridColumn = "1 / -1";
    famGrid.append(cap);
  }
  function renderCombo() {
    if (!H) return; comboBox.innerHTML = "";
    var fam = H.getHarmonyFamily(designFamilyId); if (!fam || !fam.palette) { comboBox.append(el("p", "note", "Custom / mixed style: build your own combination from the paint browser below.")); return; }
    comboBox.append(el("p", "status", "Coordinated palette for " + fam.name + ":"));
    var row = el("div", "vx-combo");
    for (const k of ["wall", "trim", "ceiling", "accent"]) { var d = el("div"); var i = document.createElement("i"); i.style.background = fam.palette[k]; d.append(i, el("span", "", k + " · " + fam.palette[k])); row.append(d); }
    comboBox.append(row);
    var apply = el("button", "secondary", "Use this wall color"); apply.type = "button"; apply.id = "vxApplyPalette";
    apply.onclick = function () { proposeOrSet("paintHex", fam.palette.wall, fam.name + " wall color"); };
    comboBox.append(apply);
    if (fam.flooringKeywords && fam.flooringKeywords.length) {
      var chips = el("div", "vx-chiprow");
      for (const kw of fam.flooringKeywords) { var c = el("button", "secondary", "Flooring: " + kw); c.type = "button"; c.onclick = (function (k2) { return function () { proposeOrSet("flooringKeyword", k2, "flooring " + k2); }; })(kw); chips.append(c); }
      comboBox.append(chips);
    }
  }
  function renderPaintChips() {
    if (!H) return; paintChips.innerHTML = "";
    for (const pf of H.PAINT_FAMILIES) { var c = el("button", "secondary", pf.name); c.type = "button"; if (pf.id === paintFamilyId) c.setAttribute("aria-pressed", "true"); c.onclick = (function (id) { return function () { paintFamilyId = id; atmoSel.value = ""; renderPaintChips(); renderSwatches(); }; })(pf.id); paintChips.append(c); }
  }
  function renderSwatches() {
    if (!H) return; swatchGrid.innerHTML = "";
    var colors = [];
    if (atmoSel.value) colors = H.colorsForAtmosphere(atmoSel.value);
    else { var pf = H.PAINT_FAMILIES.find(function (x) { return x.id === paintFamilyId; }); colors = pf ? pf.colors : []; }
    for (const col of colors) {
      var b = el("button", "vx-swatch"); b.type = "button"; b.id = "vxSw_" + col.id;
      var i = document.createElement("i"); i.style.background = col.hex;
      b.append(i, el("span", "", col.name), el("small", "", col.hex + " · " + col.undertone));
      b.onclick = (function (c2) { return function () { proposeOrSet("paintHex", c2.hex, c2.name); }; })(col);
      swatchGrid.append(b);
    }
  }
  function proposeOrSet(key, value, label) {
    if (!H || !designState) return;
    designChosen = true;
    var locked = designState.locked && designState.locked[key];
    if (!locked && !(designState.selections && designState.selections[key] && designState.locked && designState.locked[key])) {
      try { designState = H.setSelection(designState, key, value); afterDesignChange(label + " applied."); return; } catch (e) { /* locked: fall through to proposal */ }
    }
    var prop = H.proposeChange(designState, key, value, harmonyInput());
    pendingProposal = { key: key, value: value, label: label };
    proposalBox.innerHTML = "";
    proposalBox.append(el("p", "status", "Proposed change: " + label + ". Your approved selections stay untouched until you confirm."));
    var ul = el("ul", "vx-findings");
    for (const f of prop.evaluation.findings) { if (f.level === "attention" || f.level === "conflict") ul.append(el("li", "", f.rule + " — " + f.message + (f.suggestion ? " Suggestion: " + f.suggestion : ""))); }
    if (prop.conflicts && prop.conflicts.length) ul.append(el("li", "", "Affects locked selections: " + prop.conflicts.join(", ") + "."));
    if (ul.children.length) proposalBox.append(ul);
    var ok = el("button", "", "Confirm change"); ok.type = "button"; ok.id = "vxConfirmChange";
    ok.onclick = function () { if (!pendingProposal) return; designState = H.confirmChange(designState, pendingProposal.key, pendingProposal.value); pendingProposal = null; proposalBox.innerHTML = ""; afterDesignChange("Change confirmed and recorded in design history."); };
    var no = el("button", "secondary", "Keep current design"); no.type = "button"; no.id = "vxCancelChange";
    no.onclick = function () { pendingProposal = null; proposalBox.innerHTML = ""; };
    proposalBox.append(ok, document.createTextNode(" "), no);
  }
  function afterDesignChange(msg) { renderHarmonyStatus(); renderVersions(); refreshDesignDone(); rvJourneyUpdate(); if (msg) selLine.textContent = msg + " " + selLine.textContent; }
  function renderVersions() {
    if (!H || !designState) return; verList.innerHTML = "";
    for (const v of designState.versions || []) {
      var row = el("p", "status", "");
      row.append(document.createTextNode(v.label + " — " + Object.keys(v.selections || {}).length + " selections "));
      var r = el("button", "secondary", "Restore"); r.type = "button";
      r.onclick = (function (id) { return function () { designState = H.restoreVersion(designState, id); afterDesignChange("Version restored."); renderFamilies(); renderCombo(); }; })(v.id);
      row.append(r); verList.append(row);
    }
  }
  function renderReview() {
    if (!reviewGrid) return;
    reviewGrid.innerHTML = "";
    var fam = H ? H.getHarmonyFamily(designFamilyId) : null;
    var sel = designState && designState.selections ? designState.selections : {};
    var locks = designState && designState.locked ? Object.keys(designState.locked).filter(function (k) { return designState.locked[k]; }).length : 0;
    var c1 = el("div", "vx-review-card"); c1.append(el("h4", "", "Design"));
    c1.append(el("p", "", "Style: " + (fam ? fam.name : designFamilyId)));
    c1.append(el("p", "", "Wall: " + (sel.paintHex || "not chosen yet")));
    c1.append(el("p", "", locks + " approved selection" + (locks === 1 ? "" : "s") + " locked"));
    var c2 = el("div", "vx-review-card"); c2.append(el("h4", "", "Materials"));
    c2.append(el("p", "", "Flooring: " + (sel.flooringKeyword || (fam && fam.flooringKeywords ? fam.flooringKeywords[0] + " (direction)" : "—"))));
    c2.append(el("p", "", "Cabinetry: " + (sel.cabinetry || (fam && fam.cabinetKeywords ? fam.cabinetKeywords[0] + " (direction)" : "—"))));
    c2.append(el("p", "", "Countertop: " + (sel.countertop || "style direction")));
    var c3 = el("div", "vx-review-card"); c3.append(el("h4", "", "Furnishing"));
    var fp = typeof guidedState !== "undefined" ? guidedState.furnishProposal : null;
    if (fp && fp.selections) { c3.append(el("p", "", fp.selections.length + " items · total " + gxMoney(fp.totalCents))); if (fp.remainingCents !== null && fp.remainingCents !== undefined) c3.append(el("p", "", "Remaining budget: " + gxMoney(fp.remainingCents))); }
    else c3.append(el("p", "", "Not proposed yet — open Furnish My Space in the Furnish stage."));
    var c4 = el("div", "vx-review-card"); c4.append(el("h4", "", "Budget"));
    var lines = [];
    var est = typeof guidedState !== "undefined" ? guidedState.estimate : null;
    if (est) lines.push("Conversion estimate: " + (est.totalCents === null || est.totalCents === undefined ? "incomplete — rates missing (fail-closed)" : gxMoney(est.totalCents)));
    if (fp) lines.push("Furnishing: " + gxMoney(fp.totalCents));
    if (dsScope && window.RV && window.RV.dealScout) { var sm = window.RV.dealScout.summarizeScope(dsScope); lines.push("Imported Deal Scout scope: " + gxMoney(sm.knownTotalCents) + (sm.totalIsComplete ? "" : " (partial)")); }
    if (!lines.length) lines.push("No budget figures yet.");
    for (const t of lines) c4.append(el("p", "", t));
    reviewGrid.append(c1, c2, c3, c4);
  }
  function renderExport() {
    if (!exportList) return;
    exportList.innerHTML = "";
    var fp = typeof guidedState !== "undefined" ? guidedState.furnishProposal : null;
    var plans = typeof guidedState !== "undefined" && guidedState.planUploads ? guidedState.planUploads.length : 0;
    var chk = (window.RV && window.RV.exportChecklist && window.RV.exportChecklist.evaluateDesignChecklist)
      ? window.RV.exportChecklist.evaluateDesignChecklist({ harmonyChosen: designChosen, harmonySelections: designState && designState.selections ? designState.selections : {}, conceptSelections: window.__rvConceptSelections || [] })
      : { designSelections: designChosen, paintMaterialSchedule: designChosen };
    var items = [
      [plans > 0, "Floor plan — registered original preserved, with your confirmed dimensions"],
      [chk.designSelections, "Design selections — style, paint and materials with revision history"],
      [chk.paintMaterialSchedule, "Paint & material schedule — included in the design brief download"],
      [!!fp, "Furniture schedule — items, fit classifications and prices from your catalog"],
      [!!(fp || (typeof guidedState !== "undefined" && guidedState.estimate) || dsScope), "Budget summary — estimates and totals with their sources"],
      [!!dsScope, "Deal Scout scope — imported with provenance intact"],
      [true, "Verification notes — what is verified, estimated, or still unknown"]
    ];
    for (const [ok, label] of items) exportList.append(el("li", "", (ok ? "✓ " : "— ") + label + (ok ? "" : " (not yet)")));
  }
  function renderDealScout() {
    if (!window.RV || !window.RV.dealScout) return;
    var info = window.RV.dealScout.DEAL_SCOUT_INTEGRATION;
    dsStatus.textContent = "Connection: " + info.status + " (manual import). " + info.note;
    dsResult.innerHTML = "";
    if (!dsScope) { dsResult.append(el("p", "note", "No scope imported. Design, conversion, and furnishing work continues without one.")); renderReview(); renderExport(); return; }
    var sum = window.RV.dealScout.summarizeScope(dsScope);
    dsResult.append(el("p", "status", "Imported scope — source: Deal Scout · version " + dsScope.version + " · exported " + dsScope.exportedAt + " · " + sum.itemCount + " items · priced total: " + gxMoney(sum.knownTotalCents) + (sum.totalIsComplete ? " (complete)" : " (partial — " + sum.unpricedCount + " unpriced)")));
    for (const it of dsScope.items) dsResult.append(el("p", "status", "• " + it.label + " (" + it.category + ")" + (it.estimatedCents === null ? " — unpriced" : " — " + gxMoney(it.estimatedCents))));
    renderReview(); renderExport();
  }
  function vxInit() {
    if (!window.RV || !window.RV.harmony) return;
    H = window.RV.harmony;
    vxBuild();
    if (!designState) designState = H.createDesignState();
    if (pendingRestore) { var pr = pendingRestore; pendingRestore = null; vxApplyRestore(pr); }
    renderFamilies(); renderCombo(); renderPaintChips(); renderSwatches(); renderHarmonyStatus(); renderVersions(); renderDealScout(); refreshDesignDone();
  }
  function vxApplyRestore(g) {
    if (g.design && g.design.state) { designState = g.design.state; designFamilyId = g.design.familyId || designFamilyId; designChosen = true; }
    if (g.dealScoutScope) dsScope = g.dealScoutScope;
    if (g.assistantOpen === false) vxSetAssistant(false);
    renderFamilies(); renderCombo(); renderPaintChips(); renderSwatches(); renderHarmonyStatus(); renderVersions(); renderDealScout(); refreshDesignDone();
  }
  window.addEventListener("rv-concepts-changed", function () { renderExport(); });
  if (window.RV) vxInit(); else window.addEventListener("rv-ready", vxInit);

  /* --- Persistence: ride the existing design-workspace document --- */
  var origCollect = guidedCollect, origRestore = guidedRestore;
  guidedCollect = function () { var g = origCollect(); g.design = { state: designState, familyId: designFamilyId }; g.dealScoutScope = dsScope; g.assistantOpen = assistantOpen; return g; };
  guidedRestore = function (g) { origRestore(g || {}); if (!g) return; if (H) vxApplyRestore(g); else pendingRestore = g; };
})();
rvJourneyUpdate();
</script>
<script type="module">
import * as concierge from "/lib/renovision/concierge.mjs";
import * as propertyProfile from "/lib/renovision/property-profile.mjs";
import * as planIngestion from "/lib/renovision/plan-ingestion.mjs";
import * as conversions from "/lib/renovision/conversions.mjs";
import * as conversionCosts from "/lib/renovision/conversion-costs.mjs";
import * as furnish from "/lib/renovision/furnish.mjs";
import * as harmony from "/lib/renovision/design-harmony.mjs";
import * as fitTiers from "/lib/renovision/fit-tiers.mjs";
import * as dealScout from "/lib/renovision/deal-scout-contract.mjs";
import * as designLibrary from "/lib/renovision/design-library.mjs";
import * as exportChecklist from "/lib/renovision/export-checklist.mjs";
window.RV = { concierge, propertyProfile, planIngestion, conversions, conversionCosts, furnish, harmony, fitTiers, dealScout, designLibrary, exportChecklist };
window.dispatchEvent(new Event("rv-ready"));
</script>
</body></html>`;
