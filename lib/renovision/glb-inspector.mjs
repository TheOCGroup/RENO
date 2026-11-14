/** Pure-Node glTF 2.0 / GLB (.glb) binary inspector and deterministic sample
 * exporter. Zero external dependencies. Validates GLB header, JSON/BIN chunks,
 * mesh/node/material/texture counts, PBR metallic-roughness properties, and
 * POSITION accessor bounding boxes without executing untrusted scripts. */

const GLB_MAGIC = 0x46546c67; // "glTF"
const GLB_VERSION = 2;
const CHUNK_JSON = 0x4e4f534a; // "JSON"
const CHUNK_BIN = 0x004e4942; // "BIN\0"

function pad4(n) {
  return (n + 3) & ~3;
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

  for (const mesh of meshes) {
    const prims = Array.isArray(mesh?.primitives) ? mesh.primitives : [];
    primitiveCount += prims.length;
    for (const prim of prims) {
      const posIdx = prim?.attributes?.POSITION;
      if (Number.isInteger(posIdx) && accessors[posIdx]) {
        const acc = accessors[posIdx];
        if (Number.isInteger(acc.count)) vertexCount += acc.count;
        if (Array.isArray(acc.min) && acc.min.length === 3 && Array.isArray(acc.max) && acc.max.length === 3) {
          hasBounds = true;
          for (let i = 0; i < 3; i++) {
            if (acc.min[i] < min[i]) min[i] = acc.min[i];
            if (acc.max[i] > max[i]) max[i] = acc.max[i];
          }
        }
      }
      const idxIdx = prim?.indices;
      if (Number.isInteger(idxIdx) && accessors[idxIdx] && Number.isInteger(accessors[idxIdx].count)) {
        triangleCount += Math.floor(accessors[idxIdx].count / 3);
      } else if (Number.isInteger(posIdx) && accessors[posIdx] && Number.isInteger(accessors[posIdx].count)) {
        triangleCount += Math.floor(accessors[posIdx].count / 3);
      }
    }
  }

  const pbrMaterials = materials.map((m, index) => {
    const pbr = m?.pbrMetallicRoughness ?? {};
    return {
      index,
      name: m?.name ?? null,
      hasPbrMetallicRoughness: Boolean(m?.pbrMetallicRoughness),
      baseColorFactor: pbr.baseColorFactor ?? [1, 1, 1, 1],
      metallicFactor: pbr.metallicFactor ?? 1,
      roughnessFactor: pbr.roughnessFactor ?? 1,
      hasBaseColorTexture: Boolean(pbr.baseColorTexture),
      hasMetallicRoughnessTexture: Boolean(pbr.metallicRoughnessTexture),
      hasNormalTexture: Boolean(m?.normalTexture),
      hasOcclusionTexture: Boolean(m?.occlusionTexture),
      hasEmissiveTexture: Boolean(m?.emissiveTexture),
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
    valid: true,
    errors: [],
    asset: gltf.asset ?? null,
    byteLength: buf.length,
    binByteLength: binBuffer ? binBuffer.length : 0,
    meshCount: meshes.length,
    primitiveCount,
    nodeCount: nodes.length,
    materialCount: materials.length,
    textureCount: textures.length,
    imageCount: images.length,
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
  if (parsed.triangleCount > maxTriangles) {
    errors.push(`triangleCount ${parsed.triangleCount} exceeds maxTriangles ${maxTriangles}`);
  }
  if (requirePbrMaterial && !parsed.pbrMaterials.some((m) => m.hasPbrMetallicRoughness)) {
    errors.push("GLB missing pbrMetallicRoughness material definition");
  }
  if (requireBounds && (!parsed.boundingBoxMeters || parsed.boundingBoxMeters.width <= 0 || parsed.boundingBoxMeters.height <= 0 || parsed.boundingBoxMeters.depth <= 0)) {
    errors.push("GLB missing non-zero 3D bounding box");
  }
  return {
    passed: errors.length === 0,
    validGlb: true,
    errors,
    inspection: parsed,
  };
}

/** Builds a valid, spec-compliant binary glTF 2.0 (.glb) box asset with PBR
 * metallic-roughness material and OCG provenance extras. Useful for
 * deterministic sample assets, pipeline integration tests, and Blender import. */
export function buildMinimalGlb({
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

  // 8 corners of an axis-aligned box centered at origin
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
    0, 2, 1, 0, 3, 2, // back
    4, 5, 6, 4, 6, 7, // front
    0, 1, 5, 0, 5, 4, // bottom
    2, 3, 7, 2, 7, 6, // top
    0, 4, 7, 0, 7, 3, // left
    1, 2, 6, 1, 6, 5, // right
  ]);

  const posBytes = Buffer.from(positions.buffer);
  const idxBytes = Buffer.from(indices.buffer);
  const binRaw = Buffer.concat([posBytes, idxBytes]);
  const binPadLen = pad4(binRaw.length);
  const binChunkData = Buffer.alloc(binPadLen, 0);
  binRaw.copy(binChunkData);

  const gltf = {
    asset: {
      version: "2.0",
      generator: "OCG-3D-Engine/glb-inspector",
      ...(extras ? { extras } : {}),
    },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name }],
    meshes: [
      {
        name,
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
        name: `${name}-pbr`,
        pbrMetallicRoughness: {
          baseColorFactor,
          metallicFactor,
          roughnessFactor,
        },
      },
    ],
    buffers: [{ byteLength: binRaw.length }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: posBytes.length, target: 34962 },
      { buffer: 0, byteOffset: posBytes.length, byteLength: idxBytes.length, target: 34963 },
    ],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126, // FLOAT
        count: 8,
        type: "VEC3",
        min: [-hx, -hy, -hz],
        max: [hx, hy, hz],
      },
      {
        bufferView: 1,
        componentType: 5123, // UNSIGNED_SHORT
        count: 36,
        type: "SCALAR",
      },
    ],
  };

  const jsonRaw = Buffer.from(JSON.stringify(gltf), "utf8");
  const jsonPadLen = pad4(jsonRaw.length);
  const jsonChunkData = Buffer.alloc(jsonPadLen, 0x20); // space-padded per glTF spec
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
