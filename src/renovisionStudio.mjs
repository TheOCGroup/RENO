/** Customer-facing visual studio. Local photo/brief editing is explicitly not AI rendering. */
export const RENOVISION_STUDIO_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>RENOVISION AI | Design Studio</title><link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='7' fill='%23243c30'/%3E%3Ctext x='16' y='22' font-family='Georgia,serif' font-size='17' fill='%23e8e2d5' text-anchor='middle'%3ER%3C/text%3E%3C/svg%3E">
<style>
:root{font-family:Inter,system-ui,Arial,sans-serif;color:#1b2931;background:#f5f6f4}*{box-sizing:border-box}body{margin:0}header{display:flex;align-items:center;justify-content:space-between;padding:22px clamp(20px,5vw,80px);background:white;border-bottom:1px solid #e5e8e5}h1{font-size:19px;letter-spacing:.12em;margin:0}header a{color:#425e56;font-size:13px}main{max-width:1440px;margin:auto;padding:36px clamp(20px,5vw,70px)}.eyebrow{font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:#52796d;font-weight:700}h2{font-size:clamp(32px,4vw,56px);line-height:1.1;letter-spacing:-.05em;margin:12px 0}p{color:#607078;line-height:1.6}.layout{display:grid;grid-template-columns:minmax(0,1.7fr) minmax(280px,.85fr);gap:24px;margin-top:32px}.surface,.panel{background:white;border:1px solid #e2e7e3;border-radius:18px;overflow:hidden;box-shadow:0 8px 32px #22372c09}.stage{min-height:410px;background:linear-gradient(140deg,#e8eee9,#cddbd5);display:grid;place-items:center;position:relative;overflow:hidden}.stage img{width:100%;height:100%;position:absolute;inset:0;object-fit:contain}.empty{text-align:center;max-width:360px;padding:32px}.empty svg{width:56px;height:56px;color:#52796d}.empty strong{display:block;font-size:20px;margin-top:10px}.toolbar{padding:20px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}.pill{background:#eff4ef;border-radius:99px;padding:7px 11px;font-size:12px;color:#486a57}.panel{padding:26px}h3{margin:0 0 8px;font-size:19px}label{font-size:12px;font-weight:700;display:block;margin:20px 0 8px;color:#45534c}input,select,textarea{width:100%;border:1px solid #d5ded7;background:#fafbf9;border-radius:10px;padding:13px;font:inherit;color:#273c33}textarea{min-height:110px;resize:vertical}button,.button{background:#254b3d;border:0;color:white;border-radius:10px;padding:13px 20px;font:inherit;font-weight:650;cursor:pointer}button.secondary{background:#edf3ef;color:#254b3d}button:disabled{opacity:.5;cursor:not-allowed}.actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:20px}.notice{font-size:12px;color:#6a746f;padding:16px 20px;border-top:1px solid #e4e9e4;background:#f8faf8}.status{font-size:13px;margin-top:14px;color:#365d4b}.hidden{display:none!important}.swatches{display:flex;gap:8px}.swatch{width:38px;height:38px;border-radius:50%;border:2px solid #fff;outline:1px solid #ccd5ce;cursor:pointer}.swatch[aria-pressed=true]{outline:3px solid #254b3d}.preview{display:flex;align-items:center;justify-content:space-between;padding:14px 20px;background:#f6f8f5;font-size:13px}.file{display:none}@media(max-width:850px){.layout{grid-template-columns:1fr}.stage{min-height:330px}}

/* RENOVISION architectural studio — restrained editorial design */
:root{font-family:Arial,Helvetica,sans-serif;color:#252620;background:#f8f6f2}body{background:#f8f6f2;color:#252620}header{background:#f8f6f2;border-bottom:1px solid #dedbd4;padding:25px clamp(22px,5vw,90px)}header h1{font-size:17px;letter-spacing:.2em;font-weight:750}header h1 span{color:#aa8d6b!important}header a{color:#59594f;text-decoration:none;letter-spacing:.04em}main{max-width:1560px;padding:42px clamp(22px,5vw,90px) 100px}.eyebrow{color:#9b8062;letter-spacing:.24em;font-size:11px}.intro{display:grid;grid-template-columns:minmax(0,1fr) minmax(240px,.55fr);gap:36px;align-items:end;padding:25px 0 43px;border-bottom:1px solid #dedbd4}.intro h2{font-family:Georgia,'Times New Roman',serif;font-size:clamp(49px,6.3vw,104px);font-weight:400;letter-spacing:-.065em;line-height:.98;margin:21px 0 0;max-width:900px}.intro h2 em{font-weight:400;color:#9d856b}.intro p{max-width:440px;font-size:16px;line-height:1.85;color:#77766e;margin:0 0 7px}.intro-meta{font-size:10px;color:#9a958b;letter-spacing:.2em;text-transform:uppercase;margin-top:20px}.layout{grid-template-columns:minmax(0,1.55fr) minmax(325px,.73fr);gap:27px;margin-top:34px;align-items:start}.surface,.panel{border:1px solid #e0ddd5;background:#fffdfa;border-radius:3px;box-shadow:0 16px 45px #3e34240b}.stage{min-height:550px;background:radial-gradient(ellipse at 80% 15%,#e9e0d1,transparent 60%),linear-gradient(145deg,#e7e1d7,#c9c0b3);border-bottom:1px solid #e5dfd5}.stage img{object-fit:contain}.empty{max-width:430px;padding:38px}.empty svg{color:#967e60;width:48px;height:48px}.empty strong{font-family:Georgia,'Times New Roman',serif;font-weight:400;font-size:30px;letter-spacing:-.025em;margin-top:20px}.empty p{color:#69675f;font-size:14px;line-height:1.75}.toolbar{padding:17px 24px}.pill{background:#f2eee7;color:#786a58;letter-spacing:.04em}.panel{padding:34px}.panel h3{font-family:Georgia,'Times New Roman',serif;font-size:35px;font-weight:400;letter-spacing:-.045em;margin:10px 0}.panel>p{font-size:14px;color:#77736a}.panel label{margin:23px 0 9px;color:#5b594f;font-size:11px;letter-spacing:.1em;text-transform:uppercase}input,select,textarea{background:#faf8f4;border:1px solid #dedbd3;border-radius:3px;color:#302f2b;padding:14px}input:focus,select:focus,textarea:focus{outline:2px solid #ae997d;outline-offset:1px}button,.button{border-radius:3px;background:#343b32;color:#fff;padding:14px 19px;font-size:13px;letter-spacing:.02em}button:hover:not(:disabled){background:#586251}button.secondary{background:#f0ede7;color:#514b42}button.secondary:hover:not(:disabled){background:#e6e0d6}.swatch[aria-pressed=true]{outline-color:#78634c}.notice{background:#f8f6f2;color:#77736c;border-top:1px solid #e4e0d9;line-height:1.7}.preview{background:#faf8f4;color:#736e64}.status{color:#6a645a}.studio-kicker{display:flex;justify-content:space-between;align-items:center;gap:16px;padding:16px 24px;border-bottom:1px solid #e8e4dc;background:#fffdfa}.studio-kicker strong{font-size:11px;letter-spacing:.18em;text-transform:uppercase;font-weight:700;color:#4e5146}.studio-kicker span{font-size:11px;color:#a08d76;letter-spacing:.08em}.chapter{margin:0 0 14px;color:#aa9276;font-size:11px;letter-spacing:.18em;text-transform:uppercase}.studio-footer{margin-top:36px;display:flex;justify-content:space-between;gap:20px;border-top:1px solid #dedbd4;padding-top:22px;font-size:12px;color:#918c83}.studio-footer strong{color:#545148;letter-spacing:.12em}@media(max-width:920px){.intro{grid-template-columns:1fr;gap:18px}.layout{grid-template-columns:1fr}.stage{min-height:390px}.intro h2{font-size:clamp(48px,9vw,78px)}.panel{padding:25px}}@media(max-width:520px){main{padding-top:22px}.intro{padding-bottom:30px}.stage{min-height:340px}.intro h2{font-size:49px}.toolbar{padding:14px}.studio-kicker{padding:14px}}

/* Material library and comparison — no remote images or fabricated concepts */
.material-library{margin-top:42px;padding:28px 0 4px;border-top:1px solid #dedbd4}.material-head{display:flex;align-items:end;justify-content:space-between;gap:20px;flex-wrap:wrap}.material-head h3{font-family:Georgia,'Times New Roman',serif;font-size:clamp(29px,3vw,43px);font-weight:400;letter-spacing:-.04em;margin:8px 0}.material-head p{font-size:13px;max-width:390px;margin:0}.material-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:13px;margin-top:24px}.material-card{border:1px solid #e0ddd5;background:#fffdfa;padding:0;text-align:left;overflow:hidden;color:#333;min-width:0}.material-card .texture{height:125px;display:block;position:relative}.material-card .texture:after{content:'';position:absolute;inset:0;background:linear-gradient(145deg,#ffffff48,transparent 42%,#0000000d)}.material-card strong{display:block;font-family:Georgia,'Times New Roman',serif;font-size:18px;font-weight:400;padding:15px 15px 4px}.material-card small{display:block;font-size:11px;color:#8c8478;padding:0 15px 16px;line-height:1.5}.material-card[aria-pressed=true]{outline:2px solid #9d8060;outline-offset:2px}.texture-oak{background:repeating-linear-gradient(91deg,#c3a782 0px,#ddc6a1 4px,#c8ae8c 12px,#e2cba8 22px,#bfa07c 28px)}.texture-stone{background:linear-gradient(135deg,transparent 42%,#b5ada259 42.4%,transparent 43%),linear-gradient(24deg,#ddd9d1,#f1eee7 55%,#bcb7ac)}.texture-sage{background:linear-gradient(125deg,#8e9a88,#b7c1ae 50%,#84917f)}.texture-charcoal{background:linear-gradient(140deg,#303532,#555b54 54%,#242a28)}.comparison{margin-top:20px;border:1px solid #e4ded4;background:#f8f6f2;padding:18px}.comparison-stage{position:relative;width:100%;height:420px;overflow:hidden;background:#ded8cd}.comparison-stage img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain}.comparison-stage .comparison-top{clip-path:inset(0 50% 0 0)}.comparison-divider{position:absolute;top:0;bottom:0;left:50%;width:2px;background:#fff;box-shadow:0 0 8px #0005;pointer-events:none}.comparison-stage .comparison-label{position:absolute;top:12px;background:#fffdf0e8;color:#292923;padding:7px 10px;font-size:11px;letter-spacing:.07em}.comparison-stage .comparison-label.before{left:12px}.comparison-stage .comparison-label.after{right:12px}.comparison input[type=range]{width:100%;margin:17px 0 5px;accent-color:#75674f}.comparison .comparison-hint{font-size:12px;color:#777168;margin:0}@media(max-width:760px){.material-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.comparison-stage{height:300px}}@media(max-width:420px){.material-card .texture{height:95px}.comparison-stage{height:240px}}
.room-journeys{margin-top:34px;border-top:1px solid #dedbd4;padding-top:29px}.journey-heading{font-family:Georgia,'Times New Roman',serif;font-size:clamp(27px,3vw,38px);font-weight:400;letter-spacing:-.04em;margin:10px 0 7px}.journey-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:13px;margin-top:19px}.journey-card{border:1px solid #dedbd4;background:#fffdfa;color:#393a33;padding:20px 16px;text-align:left;min-height:136px;display:flex;flex-direction:column;justify-content:space-between}.journey-card strong{font-family:Georgia,'Times New Roman',serif;font-size:22px;font-weight:400}.journey-card small{color:#888075;line-height:1.5;font-size:11px}.journey-card[aria-pressed=true]{border-color:#8d775e;box-shadow:inset 0 0 0 1px #8d775e;background:#f3eee5}.journey-card:hover{border-color:#8d775e;background:#f6f2ec}@media(max-width:760px){.journey-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:420px){.journey-card{min-height:115px;padding:14px}.journey-card strong{font-size:19px}}
.scope-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:14px}.scope-option{display:flex;align-items:center;gap:10px;background:#faf8f4;border:1px solid #e2ddd5;padding:12px;font-size:12px;color:#555249;cursor:pointer}.scope-option:has(input:checked){border-color:#947b60;background:#f2ebe1}.scope-option input{width:16px;height:16px;accent-color:#7d6b52;flex:none;margin:0}.scope-description{font-size:12px;color:#8c8274;margin:8px 0 0}@media(max-width:440px){.scope-grid{grid-template-columns:1fr}}
</style></head><body>
<header><h1>RENOVISION <span style="color:#729b86">AI</span></h1><a href="/operator">Operator workspace</a></header>
<main><section class="intro"><div><div class="eyebrow">The renovation design atelier · RENOVISION AI</div><h2>Spaces, <em>reimagined.</em></h2></div><div><p>Thoughtful transformations begin with a vision. Explore materials, finishes and architectural character—starting with a photograph of your own space.</p><div class="intro-meta">01 / Your space &nbsp; · &nbsp; 02 / Your vision &nbsp; · &nbsp; 03 / Your concept</div></div></section>
<section class="room-journeys" aria-labelledby="journeyTitle"><div class="chapter">Choose a room to transform</div><h3 id="journeyTitle" class="journey-heading">Where shall we begin?</h3><p style="margin:0;font-size:13px">Select a room to tailor the renovation brief. Your photograph remains yours.</p><div class="journey-grid"><button type="button" class="journey-card" data-room="Kitchen" aria-pressed="false"><strong>Kitchen</strong><small>Cabinetry · surfaces · light</small></button><button type="button" class="journey-card" data-room="Bathroom" aria-pressed="false"><strong>Bathroom</strong><small>Tile · fixtures · sanctuary</small></button><button type="button" class="journey-card" data-room="Living room" aria-pressed="true"><strong>Living room</strong><small>Flow · furnishings · comfort</small></button><button type="button" class="journey-card" data-room="Bedroom" aria-pressed="false"><strong>Bedroom</strong><small>Texture · tranquility · layers</small></button></div></section><div class="layout"><div class="surface"><div class="studio-kicker"><strong>01 — Your existing space</strong><span>THE STARTING POINT</span></div><div class="stage" id="stage"><div class="empty" id="empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8" cy="9" r="2"/><path d="m3 17 6-6 4 4 3-3 5 5"/></svg><strong>Every space has potential.</strong><p>Choose a clear, well-lit room photograph to begin your renovation brief.</p><button id="choose">Upload room photo</button></div><img id="photo" class="hidden" alt="Original room photograph"></div><div class="toolbar"><span class="pill" id="photoStatus">No photo selected</span><div class="actions" style="margin:0"><button class="secondary" id="replace">Change photo</button><button class="secondary" id="clear">Clear</button></div></div><div class="preview"><span>Original photograph</span><strong id="renderState">AI redesign not generated</strong></div><div id="resultPanel" class="hidden" style="padding:20px;border-top:1px solid #e4e9e4"><strong>AI renovation concept</strong><p>Compare this concept with the original photo. Architectural details and dimensions require verification.</p><img id="resultPhoto" alt="AI-generated renovation concept" style="width:100%;max-height:470px;object-fit:contain;border-radius:10px"><div id="comparison" class="comparison hidden"><div class="comparison-stage"><img id="comparisonOriginal" alt="Original renovation source photo"><img id="comparisonConcept" class="comparison-top" alt="Generated design concept"><div class="comparison-divider" id="comparisonDivider"></div><span class="comparison-label before">BEFORE</span><span class="comparison-label after">CONCEPT</span></div><label for="comparisonRange">Compare original and concept</label><input id="comparisonRange" type="range" min="0" max="100" value="50" aria-label="Drag to compare before and after"><p class="comparison-hint">Move the slider to compare your original photo with the generated concept. Geometry is not verified.</p></div><div class="actions"><button class="secondary" id="downloadResult">Download concept</button><button class="secondary" id="showOriginal">View original</button><button class="secondary" id="showResult">View concept</button><button class="secondary" id="refineResult">Refine this concept</button></div></div><div class="notice">Your source photo stays on this device until you choose Generate. Generating sends the photo to the configured AI provider and may incur charges. Results are concepts, not construction drawings.</div></div>
<aside class="panel"><div class="chapter">02 — Curate your vision</div><h3>Your design story.</h3><p>Shape the atmosphere with thoughtful materials, color and the details that make a space feel like yours.</p>
<label for="room">Room type</label><select id="room"><option>Living room</option><option>Kitchen</option><option>Bathroom</option><option>Bedroom</option><option>Basement</option><option>Other</option></select>
<label for="style">Design style</label><select id="style"><option>Warm modern</option><option>Contemporary</option><option>Transitional</option><option>Modern farmhouse</option><option>Minimalist</option><option>Traditional</option></select>
<label>Palette</label><div class="swatches" id="swatches"><button class="swatch" style="background:#e9dfce" data-color="Warm neutral" aria-label="Warm neutral" aria-pressed="true"></button><button class="swatch" style="background:#d9ded7" data-color="Soft sage" aria-label="Soft sage" aria-pressed="false"></button><button class="swatch" style="background:#8d9ca6" data-color="Coastal blue" aria-label="Coastal blue" aria-pressed="false"></button><button class="swatch" style="background:#b6a58f" data-color="Natural oak" aria-label="Natural oak" aria-pressed="false"></button></div>
<label>Renovation priorities</label><p class="scope-description">Select the work you are considering. These are planning ideas, not a contractor estimate.</p><div class="scope-grid" id="scopeGrid" aria-label="Renovation scope selections"></div><label for="changes">What would you change?</label><textarea id="changes" placeholder="For example: replace flooring with light oak, brighten the walls, update cabinets and add contemporary furniture."></textarea>
<div class="actions"><button id="save">Download design brief</button><button class="secondary" id="downloadScope">Download contractor scope</button><button class="secondary" id="reviewScope">Enter contractor estimates</button></div><section id="renderPanel"><p id="renderAvailability" class="status">Checking image-generation availability...</p><label for="projectId">Project ID</label><input id="projectId" autocomplete="off" placeholder="e.g. kitchen-refresh-01"><label for="propertyId">Property ID</label><input id="propertyId" autocomplete="off" placeholder="Your property record ID"><label for="roomId">Room ID</label><input id="roomId" autocomplete="off" placeholder="e.g. kitchen"><div class="actions"><button class="secondary" id="createProject">Create / open project</button><span id="projectState" class="status">No project selected</span></div><label for="renderEmail">Account email</label><input id="renderEmail" type="email" autocomplete="username" placeholder="Your RENOVISION account email"><label for="renderPassword">Password</label><input id="renderPassword" type="password" autocomplete="current-password" placeholder="Your account password"><div class="actions"><button class="secondary" id="signIn">Sign in securely</button><button class="secondary" id="requestPasswordReset" type="button">Reset password</button><button class="secondary" id="signOut" disabled>Sign out</button><span id="authState" class="status">Not signed in</span></div><div class="actions"><button id="generate" disabled>Generate renovation concept</button></div><p>AI concepts are visual ideas, not verified geometry or construction drawings. Generation may incur Google Cloud charges.</p></section><div class="status" id="status" role="status"></div></aside></div>
<section class="material-library" aria-labelledby="materialTitle"><div class="material-head"><div><div class="chapter">03 — Material inspiration</div><h3 id="materialTitle">A palette of possibilities.</h3></div><p>Explore a few timeless material directions. Select a finish to inform your renovation brief; these are illustrative swatches, not product samples.</p></div><div class="material-grid"><button type="button" class="material-card" data-material="Natural oak flooring and warm wood finishes" aria-pressed="false"><span class="texture texture-oak" aria-hidden="true"></span><strong>Natural oak</strong><small>Warmth · organic texture</small></button><button type="button" class="material-card" data-material="Light limestone and soft natural stone surfaces" aria-pressed="false"><span class="texture texture-stone" aria-hidden="true"></span><strong>Soft stone</strong><small>Quiet luxury · tactile surfaces</small></button><button type="button" class="material-card" data-material="Muted sage cabinetry and earthy accents" aria-pressed="false"><span class="texture texture-sage" aria-hidden="true"></span><strong>Muted sage</strong><small>Grounded · calming color</small></button><button type="button" class="material-card" data-material="Charcoal accents and refined dark metal finishes" aria-pressed="false"><span class="texture texture-charcoal" aria-hidden="true"></span><strong>Charcoal</strong><small>Contrast · architectural depth</small></button></div></section><div class="studio-footer"><strong>RENOVISION AI / DESIGN STUDIO</strong><span>Imagined with intention. Built with care.</span></div><input class="file" type="file" id="file" accept="image/png,image/jpeg,image/webp"></main>
<section class="panel" id="interiorPlanner" aria-labelledby="plannerTitle" style="margin-top:28px"><div class="eyebrow">04 / INTERIOR DESIGN</div><h2 id="plannerTitle">Design within your space and budget.</h2><p>Build a room specification, add real furniture you find, and check dimensions and costs before purchasing. All prices and measurements are user-entered and unverified.</p><div class="layout"><div><label for="designStyle">Design style</label><select id="designStyle"><option>Modern organic</option><option>Contemporary</option><option>Minimalist</option><option>Scandinavian</option><option>Japandi</option><option>Mid-century modern</option><option>Traditional</option><option>Transitional</option><option>Industrial</option><option>Farmhouse</option><option>Coastal</option><option>Bohemian</option><option>Art Deco</option><option>Maximalist</option><option>Eclectic</option><option>French country</option><option>Mediterranean</option><option>Rustic</option><option>Luxury modern</option><option>Southwestern</option></select><label for="designMaterial">Material direction</label><select id="designMaterial"><option>White oak and linen</option><option>Walnut and leather</option><option>Travertine and boucle</option><option>Marble and brass</option><option>Concrete and black steel</option><option>Rattan and natural cotton</option><option>Terrazzo and lacquer</option><option>Painted cabinetry and quartz</option><option>Slate and dark wood</option><option>Terracotta and plaster</option></select><div class="layout"><div><label for="roomWidth">Room width (inches)</label><input id="roomWidth" type="number" min="1" step="0.1" placeholder="e.g. 144"></div><div><label for="roomDepth">Room depth (inches)</label><input id="roomDepth" type="number" min="1" step="0.1" placeholder="e.g. 180"></div></div><label for="clearance">Desired circulation clearance (inches)</label><input id="clearance" type="number" min="0" value="30" step="1"><label for="designBudget">Total furniture budget ($)</label><input id="designBudget" type="number" min="0" step="0.01" placeholder="e.g. 5000"></div><div><h3>Furniture shortlist</h3><p>Add product details and retailer links yourself. Catalog pricing and inventory are not live-connected.</p><label for="furnitureName">Product name</label><input id="furnitureName" placeholder="e.g. 84-inch sofa"><label for="furnitureRetailer">Retailer</label><input id="furnitureRetailer" placeholder="Store name"><label for="furnitureUrl">Product URL (https)</label><input id="furnitureUrl" type="url" placeholder="https://..."><div class="layout"><div><label for="furnitureWidth">Width (in)</label><input id="furnitureWidth" type="number" min="0.1" step="0.1"></div><div><label for="furnitureDepth">Depth (in)</label><input id="furnitureDepth" type="number" min="0.1" step="0.1"></div></div><label for="furniturePrice">Price ($)</label><input id="furniturePrice" type="number" min="0" step="0.01"><button id="addFurniture" type="button" style="margin-top:14px">Add furniture</button><div class="status" id="furnitureMessage" role="status"></div></div></div><div class="panel" style="margin-top:20px"><h3>2D space plan</h3><p>Drag furniture blocks to reposition them. Each item is shown at scale using its entered dimensions. Add doors, windows, walkways and fixed obstacles with the planning controls below; swing, clearance and circulation checks are advisory and cannot certify a layout.</p><div class="actions"><label for="obstacleType">Opening / obstacle</label><select id="obstacleType" style="max-width:180px"><option value="door">Door swing (approximate)</option><option value="window">Window zone</option><option value="fixed">Fixed obstacle</option></select><label for="obstacleX">X (in)</label><input id="obstacleX" type="number" min="0" value="0" style="max-width:95px"><label for="obstacleY">Y (in)</label><input id="obstacleY" type="number" min="0" value="0" style="max-width:95px"><label for="obstacleWidth">Width (in)</label><input id="obstacleWidth" type="number" min="1" value="36" style="max-width:95px"><label for="obstacleDepth">Depth (in)</label><input id="obstacleDepth" type="number" min="1" value="36" style="max-width:95px"><button id="addObstacle" type="button" class="secondary">Add zone</button><button id="clearObstacles" type="button" class="secondary">Clear zones</button></div><p id="obstacleMessage" class="status" role="status"></p><div class="actions"><button id="rotateFurniture" type="button" class="secondary">Rotate selected furniture 90°</button><span id="selectedFurnitureStatus" class="status">Select a furniture block to rotate it.</span></div><div id="floorPlan" style="position:relative;max-width:100%;width:100%;height:360px;background:repeating-linear-gradient(0deg,#eeeae3 0px,#eeeae3 1px,transparent 1px,transparent 24px),repeating-linear-gradient(90deg,#eeeae3 0px,#eeeae3 1px,transparent 1px,transparent 24px),#fbfaf7;border:2px solid #7c7368;border-radius:5px;overflow:hidden;touch-action:none" role="group" aria-label="Scaled room plan with draggable furniture"></div><p id="floorPlanStatus" class="status" role="status">Enter room dimensions to display a scaled plan.</p></div><div id="furnitureSummary" class="status" aria-live="polite"></div><div id="furnitureItems"></div><div class="actions"><button id="exportFurniturePlan" type="button" class="secondary">Download design and shopping plan</button><button id="clearFurniturePlan" type="button" class="secondary">Clear shortlist</button></div><p class="notice">Preliminary envelope check only. A product fitting the room rectangle does not prove a safe layout. Door swings, windows, paths, built-ins, delivery access, taxes and shipping are not included. Verify measurements, pricing and availability before purchase.</p></section>
<script>
const $=id=>document.getElementById(id);let photoUrl=null;let palette='Warm neutral';let fileName='';let sourceFile=null;let idToken=null;let authApiKey=null;let activeProjectId=null;let resultUrl=null;let resultMime=null;let resultBlob=null;let refinementSource=null;let sessionExpiresAt=0;let designRevision=0;
let renderingAvailable=false;fetch('/studio-capabilities').then(r=>r.json()).then(j=>{renderingAvailable=j.photoRendering?.enabled===true;$('renderAvailability').textContent=renderingAvailable?'Image generation available for authorized projects.':'Image generation is currently disabled. You can sign in, manage projects, upload photos, and download design briefs without paid rendering.';refreshGenerateButton()}).catch(()=>{$('renderAvailability').textContent='Image-generation availability could not be verified. Rendering remains disabled.'});fetch('/auth-config').then(r=>r.json()).then(j=>{authApiKey=j.signIn?.apiKey||null;if(!j.signIn?.configured)$('authState').textContent='Identity Platform sign-in is not configured'}).catch(()=>{});
let renderInFlight=false;function refreshGenerateButton(){const ready=Boolean(!renderInFlight&&renderingAvailable&&activeProjectId&&idToken&&Date.now()<sessionExpiresAt&&(sourceFile||refinementSource));$('generate').disabled=!ready}
function invalidateConcept({keepRefinement=false}={}){designRevision++;if(!keepRefinement)refinementSource=null;refreshGenerateButton();if(!resultUrl)return;if($('photo').getAttribute('src')===resultUrl){if(photoUrl)$('photo').src=photoUrl;else $('photo').removeAttribute('src')}URL.revokeObjectURL(resultUrl);resultUrl=null;resultBlob=null;resultMime=null;$('resultPhoto').removeAttribute('src');$('comparisonConcept').removeAttribute('src');$('comparison').classList.add('hidden');$('resultPanel').classList.add('hidden');$('renderState').textContent='Concept outdated — generate again';$('status').textContent='Design brief changed. Previous concept cleared to prevent a misleading comparison.'}
function clearPhoto(){designRevision++;refinementSource=null;$('comparison').classList.add('hidden');if(resultUrl){URL.revokeObjectURL(resultUrl);resultUrl=null;resultMime=null;resultBlob=null;refinementSource=null;$('resultPanel').classList.add('hidden');$('renderState').textContent='AI redesign not generated'}if(photoUrl)URL.revokeObjectURL(photoUrl);photoUrl=null;sourceFile=null;fileName='';$('photo').removeAttribute('src');$('photo').classList.add('hidden');$('empty').classList.remove('hidden');$('photoStatus').textContent='No photo selected';$('file').value='';refreshGenerateButton()}
$('choose').onclick=$('replace').onclick=()=>$('file').click();$('clear').onclick=clearPhoto;
$('file').onchange=()=>{const f=$('file').files[0];if(!f)return;if(!['image/jpeg','image/png','image/webp'].includes(f.type)||f.size>10*1024*1024){$('status').textContent='Choose a JPG, PNG, or WebP under 10 MB.';return}clearPhoto();sourceFile=f;photoUrl=URL.createObjectURL(f);fileName=f.name;$('photo').src=photoUrl;$('photo').classList.remove('hidden');$('empty').classList.add('hidden');$('photoStatus').textContent=f.name;$('status').textContent='Photo loaded locally. No server upload performed.';refreshGenerateButton()};
$('requestPasswordReset').onclick=async()=>{const email=$('renderEmail').value.trim();if(!authApiKey){$('authState').textContent='Password recovery unavailable: sign-in configuration missing.';return}if(!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email)){$('authState').textContent='Enter your account email before requesting a reset.';return}const button=$('requestPasswordReset');button.disabled=true;$('authState').textContent='Requesting password recovery…';try{const response=await fetch('https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key='+encodeURIComponent(authApiKey),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({requestType:'PASSWORD_RESET',email})});if(!response.ok)throw Error('request failed');$('authState').textContent='If this email is eligible, follow the password recovery instructions sent to it. Do not share the link.'}catch{$('authState').textContent='Password recovery could not be requested. Try again later or contact your account administrator.'}finally{button.disabled=false}};
let authAttempt=0;for(const id of ['renderEmail','renderPassword'])$(id).addEventListener('input',()=>{authAttempt++});$('signIn').onclick=async()=>{if(!authApiKey){$('authState').textContent='Sign-in configuration unavailable';return}const b=$('signIn');const attempt=++authAttempt;const email=$('renderEmail').value.trim();b.disabled=true;$('authState').textContent='Signing in…';try{const r=await fetch('https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key='+encodeURIComponent(authApiKey),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email,password:$('renderPassword').value,returnSecureToken:true})});const data=await r.json();if(attempt!==authAttempt)return;if(!r.ok)throw Error(data.error?.message||'Sign-in failed');invalidateConcept();resetEstimateWorksheet();idToken=data.idToken;sessionExpiresAt=Date.now()+Math.max(0,Number(data.expiresIn||3600)-60)*1000;activeProjectId=null;$('projectState').textContent='No project selected';$('renderPassword').value='';$('signOut').disabled=false;$('authState').textContent='Signed in · '+data.email;refreshGenerateButton()}catch(e){if(attempt!==authAttempt)return;idToken=null;sessionExpiresAt=0;activeProjectId=null;$('projectState').textContent='No project selected';$('generate').disabled=true;$('signOut').disabled=true;$('authState').textContent='Sign-in failed: '+e.message}finally{b.disabled=false}};
$('signOut').onclick=()=>{authAttempt++;invalidateConcept();resetEstimateWorksheet();idToken=null;sessionExpiresAt=0;activeProjectId=null;$('renderPassword').value='';$('signOut').disabled=true;$('generate').disabled=true;$('authState').textContent='Signed out';$('projectState').textContent='No project selected'};function sessionReady(){if(!idToken)return false;if(Date.now()<sessionExpiresAt)return true;$('signOut').click();$('authState').textContent='Session expired. Sign in again.';return false};$('createProject').onclick=async()=>{if(!sessionReady()){$('projectState').textContent='Sign in first';return}const projectId=$('projectId').value.trim(),propertyId=$('propertyId').value.trim(),roomId=$('roomId').value.trim();if(!projectId||!propertyId||!roomId){$('projectState').textContent='Project, property and room IDs are required';return}const b=$('createProject');const requestedRevision=designRevision;const requestedToken=idToken;const requestCurrent=()=>requestedRevision===designRevision&&requestedToken===idToken&&projectId===$('projectId').value.trim()&&propertyId===$('propertyId').value.trim()&&roomId===$('roomId').value.trim();b.disabled=true;try{const r=await fetch('/api/renovision/projects',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+idToken},body:JSON.stringify({projectId,propertyId,roomId})});const d=await r.json();if(!r.ok&&r.status!==409)throw Error((d.errors||['Project creation failed']).join(', '));let resolvedProject=d.project;if(r.status===409){const check=await fetch('/api/renovision/projects/'+encodeURIComponent(projectId),{headers:{authorization:'Bearer '+requestedToken}});if(!check.ok)throw Error('Project exists but cannot be opened for this account');const existing=await check.json();resolvedProject=existing.project;}if(!requestCurrent()){$('projectState').textContent='Project details or session changed. Reopen the project to continue.';return}if(!resolvedProject||resolvedProject.projectId!==projectId||resolvedProject.propertyId!==propertyId||resolvedProject.roomId!==roomId)throw Error('Existing project does not match the selected property and room');if(activeProjectId!==projectId){invalidateConcept();resetEstimateWorksheet()}activeProjectId=projectId;$('projectState').textContent='Project ready · '+projectId;refreshGenerateButton()}catch(e){if(requestCurrent()){activeProjectId=null;$('generate').disabled=true;$('projectState').textContent=e.message}}finally{b.disabled=false}};
$('generate').onclick=async()=>{if(renderInFlight)return;if(!renderingAvailable){$('status').textContent='Image generation is disabled; no paid request was sent.';return}if(!(refinementSource||sourceFile)||!activeProjectId||!sessionReady()){$('status').textContent='Choose a photo and provide an authorized project and session.';return}const btn=$('generate');const requestedRevision=designRevision;const requestedProject=activeProjectId;const requestedToken=idToken;const renderCurrent=()=>requestedRevision===designRevision&&requestedProject===activeProjectId&&requestedToken===idToken;renderInFlight=true;btn.disabled=true;$('status').textContent='Generating renovation concept…';try{const renderSource=refinementSource||sourceFile;const bytes=new Uint8Array(await renderSource.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));const priorities=[...(scopeSelections.get($('room').value)||new Set())];const prompt=[$('room').value,$('style').value,palette,priorities.length?'Renovation priorities: '+priorities.join(', '):'',selectedMaterial,$('changes').value].filter(Boolean).join('. ');if(!renderCurrent())return;const response=await fetch('/api/renovision/projects/'+encodeURIComponent(requestedProject)+'/render-photo',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+requestedToken},body:JSON.stringify({mimeType:renderSource.type,imageBase64:btoa(binary),prompt})});const result=await response.json();if(!renderCurrent()){$('status').textContent='Design or session changed while generating. Outdated result discarded.';return}if(!response.ok||!result.ok)throw Error((result.errors||[result.error||'Generation unavailable']).join(', '));if(resultUrl)URL.revokeObjectURL(resultUrl);const decoded=atob(result.imageBase64);const array=new Uint8Array(decoded.length);for(let i=0;i<decoded.length;i++)array[i]=decoded.charCodeAt(i);resultMime=result.mimeType;resultBlob=new Blob([array],{type:resultMime});resultUrl=URL.createObjectURL(resultBlob);refinementSource=null;$('resultPhoto').src=resultUrl;$('comparisonOriginal').src=photoUrl;$('comparisonConcept').src=resultUrl;$('comparisonRange').value='50';updateComparison();$('comparison').classList.remove('hidden');$('resultPanel').classList.remove('hidden');$('renderState').textContent='AI concept generated';$('status').textContent=result.disclosure;}catch(e){if(renderCurrent())$('status').textContent='Generation not completed: '+e.message}finally{renderInFlight=false;refreshGenerateButton();}};
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
  };
}
function hydrateWorkspace(ws) {
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
</script></body></html>`;
