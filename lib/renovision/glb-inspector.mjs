/** Pure-Node glTF 2.0 / GLB (.glb) binary parser, geometry integrity checker,
 * PBR material/texture inspector, and multi-format deterministic exporter
 * (GLB, glTF, OBJ, STL, PLY). Zero external dependencies. */

const GLB_MAGIC = 0x46546c67; // "glTF"
const GLB_VERSION = 2;
const CHUNK_JSON = 0x4e4f534a; // "JSON"
const CHUNK_BIN = 0x004e4942; // "BIN\0"

export const EXPORT_FORMATS = Object.freeze(["glb", "gltf", "obj", "stl", "ply"]);

function pad4(n) {
  return (n + 3) & ~3;
}

function componentByteSize(componentType) {
  switch (componentType) {
    case 5120: // BYTE
    case 5121: // UNSIGNED_BYTE
      return 1;
    case 5122: // SHORT
    case 5123: // UNSIGNED_SHORT
      return 2;
    case 5125: // UNSIGNED_INT
    case 5126: // FLOAT
      return 4;
    default:
      return 0;
  }
}

function typeElementCount(type) {
  switch (type) {
    case "SCALAR":
      return 1;
    case "VEC2":
      return 2;
    case "VEC3":
      return 3;
    case "VEC4":
    case "MAT2":
      return 4;
    case "MAT3":
      return 9;
    case "MAT4":
      return 16;
    default:
      return 0;
  }
}

function validateAccessorBufferBounds(gltf, binBuffer, accessorIndex, label) {
  const errors = [];
  const accessors = Array.isArray(gltf.accessors) ? gltf.accessors : [];
  const bufferViews = Array.isArray(gltf.bufferViews) ? gltf.bufferViews : [];
  const acc = accessors[accessorIndex];
  if (!acc) return [`missing ${label} accessor at index ${accessorIndex}`];
  if (!Number.isInteger(acc.count) || acc.count <= 0) {
    return [`invalid ${label} accessor count: ${acc.count}`];
  }
  const elemCount = typeElementCount(acc.type);
  const compBytes = componentByteSize(acc.componentType);
  if (elemCount === 0 || compBytes === 0) {
    return [`unsupported ${label} accessor type/componentType`];
  }
  if (Number.isInteger(acc.bufferView)) {
    const bv = bufferViews[acc.bufferView];
    if (!bv) return [`missing bufferView ${acc.bufferView} for ${label}`];
    if (!binBuffer) return [`missing BIN chunk for ${label} bufferView`];
    const bvOffset = bv.byteOffset ?? 0;
    const accOffset = acc.byteOffset ?? 0;
    const stride = bv.byteStride ?? elemCount * compBytes;
    const neededEnd = bvOffset + accOffset + (acc.count - 1) * stride + elemCount * compBytes;
    if (neededEnd > binBuffer.length) {
      errors.push(`${label} accessor exceeds BIN chunk length (${neededEnd} > ${binBuffer.length})`);
      return errors;
    }
    // Check for NaN / Infinity in FLOAT VEC3 POSITION buffers
    if (label === "POSITION" && acc.componentType === 5126 && elemCount === 3) {
      for (let i = 0; i < acc.count; i++) {
        const base = bvOffset + accOffset + i * stride;
        const x = binBuffer.readFloatLE(base);
        const y = binBuffer.readFloatLE(base + 4);
        const z = binBuffer.readFloatLE(base + 8);
        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
          errors.push(`POSITION vertex ${i} contains non-finite coordinate (NaN/Infinity)`);
          break;
        }
      }
    }
  }
  return errors;
}

export function parseGlb(input) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input ?? "");
  if (buf.length < 12) {
    return { valid: false, errors: ["GLB buffer smaller than 12-byte header"] };
  }
  const magic = buf.readUInt32LE(0);
  const version = buf.readUInt32LE(4);
  const totalLength = buf.readUInt32LE(8);
  const errors = [];
  if (magic !== GLB_MAGIC) errors.push("invalid GLB magic header");
  if (version !== GLB_VERSION) errors.push(`unsupported glTF version: ${version}`);
  if (totalLength !== buf.length) {
    errors.push(`GLB declared length ${totalLength} does not match buffer length ${buf.length}`);
  }
  if (errors.length) return { valid: false, errors };

  let offset = 12;
  let gltf = null;
  let binBuffer = null;

  while (offset + 8 <= buf.length) {
    const chunkLength = buf.readUInt32LE(offset);
    const chunkType = buf.readUInt32LE(offset + 4);
    offset += 8;
    if (offset + chunkLength > buf.length) {
      return { valid: false, errors: ["GLB chunk extends past end of buffer"] };
    }
    const chunkData = buf.subarray(offset, offset + chunkLength);
    offset += chunkLength;

    if (chunkType === CHUNK_JSON && gltf === null) {
      try {
        gltf = JSON.parse(chunkData.toString("utf8"));
      } catch {
        return { valid: false, errors: ["GLB JSON chunk is not valid UTF-8 JSON"] };
      }
    } else if (chunkType === CHUNK_BIN && binBuffer === null) {
      binBuffer = chunkData;
    }
  }

  if (!gltf || typeof gltf !== "object") {
    return { valid: false, errors: ["GLB missing required JSON chunk"] };
  }

  const meshes = Array.isArray(gltf.meshes) ? gltf.meshes : [];
  const nodes = Array.isArray(gltf.nodes) ? gltf.nodes : [];
  const materials = Array.isArray(gltf.materials) ? gltf.materials : [];
  const textures = Array.isArray(gltf.textures) ? gltf.textures : [];
  const images = Array.isArray(gltf.images) ? gltf.images : [];
  const accessors = Array.isArray(gltf.accessors) ? gltf.accessors : [];

  let primitiveCount = 0;
  let vertexCount = 0;
  let triangleCount = 0;
  let min = [Infinity, Infinity, Infinity];
  let max = [-Infinity, -Infinity, -Infinity];
  let hasBounds = false;
  const integrityErrors = [];

  for (const mesh of meshes) {
    const prims = Array.isArray(mesh?.primitives) ? mesh.primitives : [];
    primitiveCount += prims.length;
    for (const prim of prims) {
      const posIdx = prim?.attributes?.POSITION;
      if (Number.isInteger(posIdx)) {
        integrityErrors.push(...validateAccessorBufferBounds(gltf, binBuffer, posIdx, "POSITION"));
        const acc = accessors[posIdx];
        if (acc) {
          if (Number.isInteger(acc.count)) vertexCount += acc.count;
          if (Array.isArray(acc.min) && acc.min.length === 3 && Array.isArray(acc.max) && acc.max.length === 3) {
            if (acc.min.every(Number.isFinite) && acc.max.every(Number.isFinite)) {
              hasBounds = true;
              for (let i = 0; i < 3; i++) {
                if (acc.min[i] < min[i]) min[i] = acc.min[i];
                if (acc.max[i] > max[i]) max[i] = acc.max[i];
              }
            } else {
              integrityErrors.push("POSITION accessor min/max contains non-finite values");
            }
          }
        }
      } else {
        integrityErrors.push("mesh primitive missing POSITION attribute");
      }

      const idxIdx = prim?.indices;
      if (Number.isInteger(idxIdx)) {
        integrityErrors.push(...validateAccessorBufferBounds(gltf, binBuffer, idxIdx, "INDICES"));
        const acc = accessors[idxIdx];
        if (acc && Number.isInteger(acc.count)) {
          triangleCount += Math.floor(acc.count / 3);
        }
      } else if (Number.isInteger(posIdx) && accessors[posIdx] && Number.isInteger(accessors[posIdx].count)) {
        triangleCount += Math.floor(accessors[posIdx].count / 3);
      }
    }
  }

  const pbrMaterials = materials.map((m, index) => {
    const pbr = m?.pbrMetallicRoughness ?? {};
    const textureRefs = [];
    if (pbr.baseColorTexture) textureRefs.push({ role: "baseColor", index: pbr.baseColorTexture.index });
    if (pbr.metallicRoughnessTexture) textureRefs.push({ role: "metallicRoughness", index: pbr.metallicRoughnessTexture.index });
    if (m?.normalTexture) textureRefs.push({ role: "normal", index: m.normalTexture.index });
    if (m?.occlusionTexture) textureRefs.push({ role: "occlusion", index: m.occlusionTexture.index });
    if (m?.emissiveTexture) textureRefs.push({ role: "emissive", index: m.emissiveTexture.index });

    return {
      index,
      name: m?.name ?? null,
      hasPbrMetallicRoughness: Boolean(m?.pbrMetallicRoughness),
      baseColorFactor: pbr.baseColorFactor ?? [1, 1, 1, 1],
      metallicFactor: pbr.metallicFactor ?? 1,
      roughnessFactor: pbr.roughnessFactor ?? 1,
      alphaMode: m?.alphaMode ?? "OPAQUE",
      alphaCutoff: m?.alphaCutoff ?? 0.5,
      doubleSided: m?.doubleSided === true,
      hasBaseColorTexture: Boolean(pbr.baseColorTexture),
      hasMetallicRoughnessTexture: Boolean(pbr.metallicRoughnessTexture),
      hasNormalTexture: Boolean(m?.normalTexture),
      hasOcclusionTexture: Boolean(m?.occlusionTexture),
      hasEmissiveTexture: Boolean(m?.emissiveTexture),
      textureRefs,
    };
  });

  const boundingBoxMeters = hasBounds
    ? {
        min: min.map((v) => Number(v.toFixed(6))),
        max: max.map((v) => Number(v.toFixed(6))),
        width: Number((max[0] - min[0]).toFixed(6)),
        height: Number((max[1] - min[1]).toFixed(6)),
        depth: Number((max[2] - min[2]).toFixed(6)),
      }
    : null;

  return {
    valid: integrityErrors.length === 0,
    errors: integrityErrors,
    asset: gltf.asset ?? null,
    byteLength: buf.length,
    binByteLength: binBuffer ? binBuffer.length : 0,
    meshCount: meshes.length,
    primitiveCount,
    nodeCount: nodes.length,
    materialCount: materials.length,
    textureCount: textures.length,
    imageCount: images.length,
    hasTextures: textures.length > 0 && images.length > 0,
    vertexCount,
    triangleCount,
    pbrMaterials,
    boundingBoxMeters,
    extras: gltf.asset?.extras ?? null,
  };
}

export function inspectGlbFile(
  input,
  {
    maxBytes = 50 * 1024 * 1024,
    maxTriangles = 500_000,
    requirePbrMaterial = true,
    requireBounds = true,
  } = {},
) {
  const parsed = parseGlb(input);
  if (!parsed.valid) {
    return {
      passed: false,
      validGlb: false,
      errors: parsed.errors,
      inspection: null,
    };
  }
  const errors = [];
  if (parsed.byteLength > maxBytes) {
    errors.push(`GLB byteLength ${parsed.byteLength} exceeds maxBytes ${maxBytes}`);
  }
  if (parsed.meshCount < 1 || parsed.primitiveCount < 1) {
    errors.push("GLB contains no renderable mesh primitives");
  }
  if (parsed.triangleCount < 1) {
    errors.push("GLB contains zero triangles");
  }
  if (parsed.triangleCount > maxTriangles) {
    errors.push(`triangleCount ${parsed.triangleCount} exceeds maxTriangles ${maxTriangles}`);
  }
  if (requirePbrMaterial && !parsed.pbrMaterials.some((m) => m.hasPbrMetallicRoughness)) {
    errors.push("GLB missing pbrMetallicRoughness material definition");
  }
  if (
    requireBounds &&
    (!parsed.boundingBoxMeters ||
      parsed.boundingBoxMeters.width <= 0 ||
      parsed.boundingBoxMeters.height <= 0 ||
      parsed.boundingBoxMeters.depth <= 0)
  ) {
    errors.push("GLB missing non-zero 3D bounding box");
  }
  return {
    passed: errors.length === 0,
    validGlb: true,
    errors,
    inspection: parsed,
  };
}

export function createBoxMeshSpec({
  name = "ocg-asset",
  widthMeters = 1.0,
  heightMeters = 0.8,
  depthMeters = 0.9,
  baseColorFactor = [0.72, 0.66, 0.58, 1.0],
  metallicFactor = 0.05,
  roughnessFactor = 0.65,
  extras = null,
} = {}) {
  for (const [k, v] of [
    ["widthMeters", widthMeters],
    ["heightMeters", heightMeters],
    ["depthMeters", depthMeters],
  ]) {
    if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) {
      throw new Error(`${k} must be a positive finite number`);
    }
  }
  const hx = widthMeters / 2;
  const hy = heightMeters / 2;
  const hz = depthMeters / 2;

  const positions = new Float32Array([
    -hx, -hy, -hz,
     hx, -hy, -hz,
     hx,  hy, -hz,
    -hx,  hy, -hz,
    -hx, -hy,  hz,
     hx, -hy,  hz,
     hx,  hy,  hz,
    -hx,  hy,  hz,
  ]);
  const indices = new Uint16Array([
    0, 2, 1, 0, 3, 2,
    4, 5, 6, 4, 6, 7,
    0, 1, 5, 0, 5, 4,
    2, 3, 7, 2, 7, 6,
    0, 4, 7, 0, 7, 3,
    1, 2, 6, 1, 6, 5,
  ]);
  return {
    name,
    widthMeters,
    heightMeters,
    depthMeters,
    baseColorFactor,
    metallicFactor,
    roughnessFactor,
    extras,
    positions,
    indices,
    min: [-hx, -hy, -hz],
    max: [hx, hy, hz],
  };
}

function buildGltfDocument(spec, binRaw) {
  return {
    asset: {
      version: "2.0",
      generator: "OCG-3D-Engine/glb-inspector",
      ...(spec.extras ? { extras: spec.extras } : {}),
    },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name: spec.name }],
    meshes: [
      {
        name: spec.name,
        primitives: [
          {
            attributes: { POSITION: 0 },
            indices: 1,
            material: 0,
          },
        ],
      },
    ],
    materials: [
      {
        name: `${spec.name}-pbr`,
        pbrMetallicRoughness: {
          baseColorFactor: spec.baseColorFactor,
          metallicFactor: spec.metallicFactor,
          roughnessFactor: spec.roughnessFactor,
        },
      },
    ],
    buffers: [{ byteLength: binRaw.length }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: spec.positions.byteLength, target: 34962 },
      { buffer: 0, byteOffset: spec.positions.byteLength, byteLength: spec.indices.byteLength, target: 34963 },
    ],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: spec.positions.length / 3,
        type: "VEC3",
        min: spec.min,
        max: spec.max,
      },
      {
        bufferView: 1,
        componentType: 5123,
        count: spec.indices.length,
        type: "SCALAR",
      },
    ],
  };
}

/** Builds a valid, spec-compliant binary glTF 2.0 (.glb) box asset. */
export function buildMinimalGlb(options = {}) {
  const spec = createBoxMeshSpec(options);
  const posBytes = Buffer.from(spec.positions.buffer, spec.positions.byteOffset, spec.positions.byteLength);
  const idxBytes = Buffer.from(spec.indices.buffer, spec.indices.byteOffset, spec.indices.byteLength);
  const binRaw = Buffer.concat([posBytes, idxBytes]);
  const binPadLen = pad4(binRaw.length);
  const binChunkData = Buffer.alloc(binPadLen, 0);
  binRaw.copy(binChunkData);

  const gltf = buildGltfDocument(spec, binRaw);
  const jsonRaw = Buffer.from(JSON.stringify(gltf), "utf8");
  const jsonPadLen = pad4(jsonRaw.length);
  const jsonChunkData = Buffer.alloc(jsonPadLen, 0x20);
  jsonRaw.copy(jsonChunkData);

  const totalLength = 12 + 8 + jsonPadLen + 8 + binPadLen;
  const header = Buffer.alloc(12);
  header.writeUInt32LE(GLB_MAGIC, 0);
  header.writeUInt32LE(GLB_VERSION, 4);
  header.writeUInt32LE(totalLength, 8);

  const jsonHeader = Buffer.alloc(8);
  jsonHeader.writeUInt32LE(jsonPadLen, 0);
  jsonHeader.writeUInt32LE(CHUNK_JSON, 4);

  const binHeader = Buffer.alloc(8);
  binHeader.writeUInt32LE(binPadLen, 0);
  binHeader.writeUInt32LE(CHUNK_BIN, 4);

  return Buffer.concat([header, jsonHeader, jsonChunkData, binHeader, binChunkData]);
}

/** Exports a self-contained glTF 2.0 JSON (.gltf) with embedded base64 buffer. */
export function exportGltfJson(options = {}) {
  const spec = createBoxMeshSpec(options);
  const posBytes = Buffer.from(spec.positions.buffer, spec.positions.byteOffset, spec.positions.byteLength);
  const idxBytes = Buffer.from(spec.indices.buffer, spec.indices.byteOffset, spec.indices.byteLength);
  const binRaw = Buffer.concat([posBytes, idxBytes]);
  const gltf = buildGltfDocument(spec, binRaw);
  gltf.buffers[0].uri = `data:application/octet-stream;base64,${binRaw.toString("base64")}`;
  return Buffer.from(JSON.stringify(gltf, null, 2), "utf8");
}

/** Exports Wavefront OBJ (.obj) text. */
export function exportObj(options = {}) {
  const spec = createBoxMeshSpec(options);
  const lines = [`# OCG 3D Engine Wavefront OBJ`, `o ${spec.name}`];
  for (let i = 0; i < spec.positions.length; i += 3) {
    lines.push(`v ${spec.positions[i]} ${spec.positions[i + 1]} ${spec.positions[i + 2]}`);
  }
  for (let i = 0; i < spec.indices.length; i += 3) {
    lines.push(`f ${spec.indices[i] + 1} ${spec.indices[i + 1] + 1} ${spec.indices[i + 2] + 1}`);
  }
  return Buffer.from(lines.join("\n") + "\n", "utf8");
}

/** Exports Binary STL (.stl) buffer. */
export function exportStl(options = {}) {
  const spec = createBoxMeshSpec(options);
  const triCount = spec.indices.length / 3;
  const buf = Buffer.alloc(84 + triCount * 50, 0);
  Buffer.from(`OCG 3D Engine Binary STL: ${spec.name}`).copy(buf, 0, 0, 80);
  buf.writeUInt32LE(triCount, 80);
  for (let t = 0; t < triCount; t++) {
    const off = 84 + t * 50;
    const i0 = spec.indices[t * 3] * 3;
    const i1 = spec.indices[t * 3 + 1] * 3;
    const i2 = spec.indices[t * 3 + 2] * 3;
    const ax = spec.positions[i1] - spec.positions[i0];
    const ay = spec.positions[i1 + 1] - spec.positions[i0 + 1];
    const az = spec.positions[i1 + 2] - spec.positions[i0 + 2];
    const bx = spec.positions[i2] - spec.positions[i0];
    const by = spec.positions[i2 + 1] - spec.positions[i0 + 1];
    const bz = spec.positions[i2 + 2] - spec.positions[i0 + 2];
    let nx = ay * bz - az * by;
    let ny = az * bx - ax * bz;
    let nz = ax * by - ay * bx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len; ny /= len; nz /= len;
    buf.writeFloatLE(nx, off);
    buf.writeFloatLE(ny, off + 4);
    buf.writeFloatLE(nz, off + 8);
    for (const [k, idx] of [[0, i0], [1, i1], [2, i2]]) {
      buf.writeFloatLE(spec.positions[idx], off + 12 + k * 12);
      buf.writeFloatLE(spec.positions[idx + 1], off + 16 + k * 12);
      buf.writeFloatLE(spec.positions[idx + 2], off + 20 + k * 12);
    }
  }
  return buf;
}

/** Exports ASCII PLY (.ply) buffer. */
export function exportPly(options = {}) {
  const spec = createBoxMeshSpec(options);
  const vCount = spec.positions.length / 3;
  const fCount = spec.indices.length / 3;
  const header = [
    "ply",
    "format ascii 1.0",
    `comment OCG 3D Engine (${spec.name})`,
    `element vertex ${vCount}`,
    "property float x",
    "property float y",
    "property float z",
    `element face ${fCount}`,
    "property list uchar int vertex_indices",
    "end_header",
  ];
  const verts = [];
  for (let i = 0; i < spec.positions.length; i += 3) {
    verts.push(`${spec.positions[i]} ${spec.positions[i + 1]} ${spec.positions[i + 2]}`);
  }
  const faces = [];
  for (let i = 0; i < spec.indices.length; i += 3) {
    faces.push(`3 ${spec.indices[i]} ${spec.indices[i + 1]} ${spec.indices[i + 2]}`);
  }
  return Buffer.from([...header, ...verts, ...faces].join("\n") + "\n", "utf8");
}

export function exportAssetFormat(format, options = {}) {
  const f = String(format ?? "").toLowerCase().trim();
  switch (f) {
    case "glb":
      return { ok: true, format: "glb", mimeType: "model/gltf-binary", buffer: buildMinimalGlb(options) };
    case "gltf":
      return { ok: true, format: "gltf", mimeType: "model/gltf+json", buffer: exportGltfJson(options) };
    case "obj":
      return { ok: true, format: "obj", mimeType: "text/plain; charset=utf-8", buffer: exportObj(options) };
    case "stl":
      return { ok: true, format: "stl", mimeType: "model/stl", buffer: exportStl(options) };
    case "ply":
      return { ok: true, format: "ply", mimeType: "application/octet-stream", buffer: exportPly(options) };
    default:
      return { ok: false, errors: [`unsupported export format: ${f}; supported: ${EXPORT_FORMATS.join(", ")}`] };
  }
}
