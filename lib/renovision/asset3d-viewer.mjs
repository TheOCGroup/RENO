/** Self-contained interactive 3D Asset Preview & Inspection Studio HTML/JS.
 * Zero external CDN dependencies (offline & local-first). Includes a real
 * client-side binary GLB parser, interactive 3D orbit/zoom/rotation renderer,
 * PBR material & texture inspector, metadata/provenance panel, clear error
 * states, local .glb file upload, sample loading, and multi-format export. */

export function renderAsset3dViewerHtml({ title = "OCG 3D ENGINE — Asset Preview & Inspector" } = {}) {
  const safeTitle = String(title).replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]));
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${safeTitle}</title>
<style>
  :root { --bg:#0f1419; --panel:#171e26; --border:#2a3542; --text:#e6edf3; --muted:#8b9bb0; --accent:#4da3ff; --ok:#3fb950; --warn:#d29922; --err:#f85149; }
  * { box-sizing:border-box; }
  body { margin:0; font-family:system-ui,-apple-system,sans-serif; background:var(--bg); color:var(--text); display:grid; grid-template-rows:auto 1fr; height:100vh; }
  header { padding:12px 18px; border-bottom:1px solid var(--border); display:flex; align-items:center; justify-content:space-between; gap:12px; background:var(--panel); }
  header h1 { margin:0; font-size:15px; font-weight:600; letter-spacing:0.3px; }
  .badge { font-size:11px; padding:3px 8px; border-radius:999px; border:1px solid var(--border); color:var(--muted); }
  main { display:grid; grid-template-columns:1fr 360px; min-height:0; }
  .viewport-wrap { position:relative; display:flex; flex-direction:column; min-height:0; }
  canvas { width:100%; height:100%; display:block; cursor:grab; background:radial-gradient(circle at 50% 45%, #1c2530 0%, #0d1217 100%); }
  canvas:active { cursor:grabbing; }
  .toolbar { position:absolute; left:14px; bottom:14px; display:flex; gap:8px; flex-wrap:wrap; background:rgba(23,30,38,0.9); padding:8px; border:1px solid var(--border); border-radius:8px; }
  button, select { background:#212b36; color:var(--text); border:1px solid var(--border); border-radius:6px; padding:6px 10px; font-size:12px; cursor:pointer; }
  button:hover { border-color:var(--accent); }
  button.primary { background:var(--accent); color:#071320; border-color:var(--accent); font-weight:600; }
  aside { border-left:1px solid var(--border); background:var(--panel); overflow:auto; padding:14px; display:flex; flex-direction:column; gap:14px; }
  section { border:1px solid var(--border); border-radius:8px; padding:10px 12px; background:#121820; }
  section h2 { margin:0 0 8px; font-size:12px; text-transform:uppercase; letter-spacing:0.6px; color:var(--muted); }
  .kv { display:grid; grid-template-columns:120px 1fr; gap:4px 8px; font-size:12px; }
  .kv div:nth-child(odd) { color:var(--muted); }
  .error-banner { display:none; padding:10px 12px; border-radius:6px; background:rgba(248,81,73,0.14); border:1px solid var(--err); color:#ffb4ae; font-size:12px; }
  .error-banner.visible { display:block; }
  .mat-card { border-top:1px solid var(--border); padding-top:8px; margin-top:8px; font-size:12px; }
  .swatch { display:inline-block; width:12px; height:12px; border-radius:3px; border:1px solid #fff3; vertical-align:middle; margin-right:6px; }
  .exports { display:flex; flex-wrap:wrap; gap:6px; }
  @media (max-width:900px) { main { grid-template-columns:1fr; grid-template-rows:55vh auto; } }
</style>
</head>
<body>
<header>
  <div>
    <h1>${safeTitle}</h1>
  </div>
  <div style="display:flex;gap:8px;align-items:center;">
    <span class="badge" id="envBadge">Local-Only | $0 Budget</span>
    <span class="badge" id="dimBadge">Dimensions: Unverified</span>
  </div>
</header>
<main>
  <div class="viewport-wrap">
    <canvas id="viewport"></canvas>
    <div class="toolbar">
      <button type="button" id="zoomIn">Zoom +</button>
      <button type="button" id="zoomOut">Zoom -</button>
      <button type="button" id="resetView">Reset View</button>
      <button type="button" id="toggleAutoRotate">Auto-Rotate: On</button>
      <button type="button" id="toggleWireframe">Wireframe: Off</button>
    </div>
  </div>
  <aside>
    <div id="errorBanner" class="error-banner" role="alert"></div>
    <section>
      <h2>Model Loader</h2>
      <div style="display:flex;flex-direction:column;gap:8px;">
        <select id="sampleSelect" aria-label="Sample 3D Assets"></select>
        <button type="button" class="primary" id="loadSampleBtn">Load Selected Sample</button>
        <label style="font-size:12px;color:var(--muted);">Or inspect local .glb file:
          <input type="file" id="glbFileInput" accept=".glb" style="margin-top:4px;width:100%;font-size:12px;">
        </label>
      </div>
    </section>
    <section>
      <h2>Asset Metadata</h2>
      <div class="kv" id="metaGrid">
        <div>Name</div><div id="metaName">—</div>
        <div>Meshes / Tris</div><div id="metaGeom">—</div>
        <div>Bounding Box (m)</div><div id="metaBounds">—</div>
        <div>File Size</div><div id="metaBytes">—</div>
        <div>Provenance</div><div id="metaProv">—</div>
      </div>
    </section>
    <section>
      <h2>PBR Materials & Textures</h2>
      <div id="materialsPanel" style="font-size:12px;color:var(--muted);">No model loaded.</div>
    </section>
    <section>
      <h2>Export Asset</h2>
      <div class="exports" id="exportButtons">
        <button type="button" data-fmt="glb">GLB</button>
        <button type="button" data-fmt="gltf">glTF</button>
        <button type="button" data-fmt="obj">OBJ</button>
        <button type="button" data-fmt="stl">STL</button>
        <button type="button" data-fmt="ply">PLY</button>
      </div>
    </section>
  </aside>
</main>
<script>
(function(){
  const canvas = document.getElementById("viewport");
  const ctx = canvas.getContext("2d");
  const errorBanner = document.getElementById("errorBanner");
  const sampleSelect = document.getElementById("sampleSelect");
  let state = {
    yaw: 0.6,
    pitch: 0.35,
    zoom: 1.0,
    autoRotate: true,
    wireframe: false,
    dragging: false,
    lastX: 0,
    lastY: 0,
    mesh: null,
    activeSampleId: null
  };

  function showError(msg) {
    errorBanner.textContent = msg;
    errorBanner.classList.add("visible");
  }
  function clearError() {
    errorBanner.textContent = "";
    errorBanner.classList.remove("visible");
  }

  function parseGlbBytes(arrayBuffer) {
    if (!arrayBuffer || arrayBuffer.byteLength < 12) throw new Error("File smaller than 12-byte GLB header");
    const view = new DataView(arrayBuffer);
    const magic = view.getUint32(0, true);
    const version = view.getUint32(4, true);
    const totalLen = view.getUint32(8, true);
    if (magic !== 0x46546c67) throw new Error("Invalid GLB magic header (expected glTF)");
    if (version !== 2) throw new Error("Unsupported glTF version: " + version);
    if (totalLen !== arrayBuffer.byteLength) throw new Error("GLB length mismatch");
    let offset = 12, gltf = null, bin = null;
    while (offset + 8 <= arrayBuffer.byteLength) {
      const len = view.getUint32(offset, true);
      const type = view.getUint32(offset + 4, true);
      offset += 8;
      if (offset + len > arrayBuffer.byteLength) throw new Error("Corrupt GLB chunk length");
      const slice = arrayBuffer.slice(offset, offset + len);
      offset += len;
      if (type === 0x4e4f534a && !gltf) {
        gltf = JSON.parse(new TextDecoder("utf-8").decode(slice));
      } else if (type === 0x004e4942 && !bin) {
        bin = slice;
      }
    }
    if (!gltf || !bin) throw new Error("GLB missing JSON or BIN chunk");
    const prim = gltf.meshes?.[0]?.primitives?.[0];
    if (!prim) throw new Error("GLB contains no mesh primitive");
    const posAcc = gltf.accessors?.[prim.attributes?.POSITION];
    const idxAcc = gltf.accessors?.[prim.indices];
    if (!posAcc || !idxAcc) throw new Error("GLB primitive missing POSITION or INDICES accessor");
    const posBv = gltf.bufferViews[posAcc.bufferView];
    const idxBv = gltf.bufferViews[idxAcc.bufferView];
    const positions = new Float32Array(bin, (posBv.byteOffset || 0) + (posAcc.byteOffset || 0), posAcc.count * 3);
    const indices = idxAcc.componentType === 5125
      ? new Uint32Array(bin, (idxBv.byteOffset || 0) + (idxAcc.byteOffset || 0), idxAcc.count)
      : new Uint16Array(bin, (idxBv.byteOffset || 0) + (idxAcc.byteOffset || 0), idxAcc.count);
    const min = posAcc.min || [-0.5,-0.5,-0.5];
    const max = posAcc.max || [0.5,0.5,0.5];
    return {
      name: gltf.meshes?.[0]?.name || "asset",
      byteLength: arrayBuffer.byteLength,
      meshCount: (gltf.meshes || []).length,
      triangleCount: Math.floor(indices.length / 3),
      positions,
      indices,
      bounds: {
        width: +(max[0] - min[0]).toFixed(3),
        height: +(max[1] - min[1]).toFixed(3),
        depth: +(max[2] - min[2]).toFixed(3)
      },
      materials: gltf.materials || [],
      textures: gltf.textures || [],
      extras: gltf.asset?.extras || null
    };
  }

  function updateInspector(mesh) {
    document.getElementById("metaName").textContent = mesh.name;
    document.getElementById("metaGeom").textContent = mesh.meshCount + " mesh / " + mesh.triangleCount + " tris";
    document.getElementById("metaBounds").textContent = mesh.bounds.width + " × " + mesh.bounds.height + " × " + mesh.bounds.depth;
    document.getElementById("metaBytes").textContent = mesh.byteLength + " bytes";
    const verified = mesh.extras?.dimensionsVerified === true;
    document.getElementById("metaProv").textContent = (mesh.extras?.modelId || "deterministic-sample") + " (" + (mesh.extras?.license || "MIT") + ")";
    document.getElementById("dimBadge").textContent = verified ? "Dimensions: Verified" : "Dimensions: Unverified";

    const matPanel = document.getElementById("materialsPanel");
    if (!mesh.materials.length) {
      matPanel.textContent = "No PBR materials defined.";
      return;
    }
    matPanel.innerHTML = mesh.materials.map((m) => {
      const pbr = m.pbrMetallicRoughness || {};
      const c = pbr.baseColorFactor || [0.8,0.8,0.8,1];
      const rgb = "rgb(" + Math.round(c[0]*255) + "," + Math.round(c[1]*255) + "," + Math.round(c[2]*255) + ")";
      const texCount = mesh.textures.length;
      return "<div class='mat-card'>" +
        "<span class='swatch' style='background:" + rgb + "'></span><strong>" + (m.name || "material") + "</strong><br>" +
        "Metallic: " + (pbr.metallicFactor ?? 1) + " | Roughness: " + (pbr.roughnessFactor ?? 1) + "<br>" +
        "Textures: " + (texCount ? texCount + " referenced" : "none (factor-only PBR)") +
        "</div>";
    }).join("");
  }

  function loadGlbArrayBuffer(buf, sampleId) {
    try {
      clearError();
      const mesh = parseGlbBytes(buf);
      state.mesh = mesh;
      state.activeSampleId = sampleId || null;
      updateInspector(mesh);
    } catch (err) {
      showError("GLB load error: " + (err?.message || "Invalid GLB"));
    }
  }

  function projectVertex(x, y, z, w, h) {
    const cy = Math.cos(state.yaw), sy = Math.sin(state.yaw);
    const cp = Math.cos(state.pitch), sp = Math.sin(state.pitch);
    const x1 = x * cy - z * sy;
    const z1 = x * sy + z * cy;
    const y2 = y * cp - z1 * sp;
    const z2 = y * sp + z1 * cp + 3.2 / state.zoom;
    const scale = Math.min(w, h) * 0.72 / Math.max(0.2, z2);
    return { x: w / 2 + x1 * scale, y: h / 2 - y2 * scale, z: z2 };
  }

  function renderFrame() {
    const rect = canvas.getBoundingClientRect();
    if (canvas.width !== Math.floor(rect.width) || canvas.height !== Math.floor(rect.height)) {
      canvas.width = Math.max(1, Math.floor(rect.width));
      canvas.height = Math.max(1, Math.floor(rect.height));
    }
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    if (state.autoRotate && !state.dragging) {
      state.yaw += 0.008;
    }

    if (state.mesh) {
      const { positions, indices, bounds, materials } = state.mesh;
      const maxDim = Math.max(0.001, bounds.width, bounds.height, bounds.depth);
      const norm = 1.4 / maxDim;
      const c = materials?.[0]?.pbrMetallicRoughness?.baseColorFactor || [0.7, 0.65, 0.58, 1];
      const tris = [];
      for (let i = 0; i < indices.length; i += 3) {
        const i0 = indices[i] * 3, i1 = indices[i+1] * 3, i2 = indices[i+2] * 3;
        const p0 = projectVertex(positions[i0]*norm, positions[i0+1]*norm, positions[i0+2]*norm, w, h);
        const p1 = projectVertex(positions[i1]*norm, positions[i1+1]*norm, positions[i1+2]*norm, w, h);
        const p2 = projectVertex(positions[i2]*norm, positions[i2+1]*norm, positions[i2+2]*norm, w, h);
        const cross = (p1.x - p0.x) * (p2.y - p0.y) - (p1.y - p0.y) * (p2.x - p0.x);
        if (!state.wireframe && cross > 0) continue;
        tris.push({ p0, p1, p2, depth: (p0.z + p1.z + p2.z) / 3 });
      }
      tris.sort((a, b) => b.depth - a.depth);
      for (let idx = 0; idx < tris.length; idx++) {
        const t = tris[idx];
        ctx.beginPath();
        ctx.moveTo(t.p0.x, t.p0.y);
        ctx.lineTo(t.p1.x, t.p1.y);
        ctx.lineTo(t.p2.x, t.p2.y);
        ctx.closePath();
        if (state.wireframe) {
          ctx.strokeStyle = "#4da3ff";
          ctx.lineWidth = 1.2;
          ctx.stroke();
        } else {
          const shade = 0.65 + 0.35 * ((idx % 3) / 2);
          ctx.fillStyle = "rgb(" + Math.round(c[0]*255*shade) + "," + Math.round(c[1]*255*shade) + "," + Math.round(c[2]*255*shade) + ")";
          ctx.fill();
          ctx.strokeStyle = "rgba(255,255,255,0.16)";
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }
    }
    requestAnimationFrame(renderFrame);
  }

  canvas.addEventListener("pointerdown", (e) => { state.dragging = true; state.lastX = e.clientX; state.lastY = e.clientY; });
  window.addEventListener("pointerup", () => { state.dragging = false; });
  window.addEventListener("pointermove", (e) => {
    if (!state.dragging) return;
    state.yaw += (e.clientX - state.lastX) * 0.01;
    state.pitch = Math.max(-1.4, Math.min(1.4, state.pitch + (e.clientY - state.lastY) * 0.01));
    state.lastX = e.clientX; state.lastY = e.clientY;
  });
  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    state.zoom = Math.max(0.35, Math.min(3.0, state.zoom * (e.deltaY < 0 ? 1.1 : 0.9)));
  }, { passive: false });

  document.getElementById("zoomIn").onclick = () => { state.zoom = Math.min(3.0, state.zoom * 1.15); };
  document.getElementById("zoomOut").onclick = () => { state.zoom = Math.max(0.35, state.zoom * 0.85); };
  document.getElementById("resetView").onclick = () => { state.yaw = 0.6; state.pitch = 0.35; state.zoom = 1.0; };
  document.getElementById("toggleAutoRotate").onclick = (e) => {
    state.autoRotate = !state.autoRotate;
    e.target.textContent = "Auto-Rotate: " + (state.autoRotate ? "On" : "Off");
  };
  document.getElementById("toggleWireframe").onclick = (e) => {
    state.wireframe = !state.wireframe;
    e.target.textContent = "Wireframe: " + (state.wireframe ? "On" : "Off");
  };

  document.getElementById("glbFileInput").addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const buf = await file.arrayBuffer();
    loadGlbArrayBuffer(buf, null);
  });

  async function loadSelectedSample() {
    const id = sampleSelect.value;
    if (!id) return;
    try {
      const res = await fetch("/api/3d/samples/" + encodeURIComponent(id) + ".glb");
      if (!res.ok) throw new Error("HTTP " + res.status);
      const buf = await res.arrayBuffer();
      loadGlbArrayBuffer(buf, id);
    } catch (err) {
      showError("Failed to load sample asset: " + (err?.message || "unknown error"));
    }
  }
  document.getElementById("loadSampleBtn").onclick = loadSelectedSample;

  document.getElementById("exportButtons").addEventListener("click", (e) => {
    const fmt = e.target?.dataset?.fmt;
    if (!fmt) return;
    const id = state.activeSampleId || sampleSelect.value;
    if (!id) { showError("Select a sample asset to export."); return; }
    window.location.href = "/api/3d/samples/" + encodeURIComponent(id) + "." + encodeURIComponent(fmt);
  });

  async function init() {
    try {
      const res = await fetch("/api/3d/samples");
      const data = await res.json();
      for (const s of data.samples || []) {
        const opt = document.createElement("option");
        opt.value = s.id;
        opt.textContent = s.label + " (" + s.category + ")";
        sampleSelect.appendChild(opt);
      }
      if (data.samples?.length) await loadSelectedSample();
    } catch {
      showError("Unable to load sample catalog from local server.");
    }
    requestAnimationFrame(renderFrame);
  }
  init();
})();
</script>
</body>
</html>`;
}
