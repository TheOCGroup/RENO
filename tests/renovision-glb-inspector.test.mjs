import test from "node:test";
import assert from "node:assert/strict";
import {
  buildMinimalGlb,
  parseGlb,
  inspectGlbFile,
  exportAssetFormat,
  EXPORT_FORMATS,
} from "../lib/renovision/glb-inspector.mjs";

test("buildMinimalGlb creates a spec-compliant glTF 2.0 binary with PBR material and exact bounds", () => {
  const buf = buildMinimalGlb({
    name: "midcentury-sofa",
    widthMeters: 2.1,
    heightMeters: 0.82,
    depthMeters: 0.95,
    baseColorFactor: [0.3, 0.4, 0.5, 1.0],
    metallicFactor: 0.0,
    roughnessFactor: 0.75,
    extras: { modelId: "microsoft/TRELLIS.2-4B", dimensionsVerified: false },
  });

  const parsed = parseGlb(buf);
  assert.equal(parsed.valid, true);
  assert.equal(parsed.asset.version, "2.0");
  assert.equal(parsed.meshCount, 1);
  assert.equal(parsed.primitiveCount, 1);
  assert.equal(parsed.materialCount, 1);
  assert.equal(parsed.hasTextures, false);
  assert.equal(parsed.vertexCount, 8);
  assert.equal(parsed.triangleCount, 12);
  assert.equal(parsed.pbrMaterials[0].hasPbrMetallicRoughness, true);
  assert.equal(parsed.pbrMaterials[0].roughnessFactor, 0.75);
  assert.equal(parsed.boundingBoxMeters.width, 2.1);
  assert.equal(parsed.boundingBoxMeters.height, 0.82);
  assert.equal(parsed.boundingBoxMeters.depth, 0.95);
  assert.equal(parsed.extras.modelId, "microsoft/TRELLIS.2-4B");

  const report = inspectGlbFile(buf);
  assert.equal(report.passed, true);
  assert.equal(report.errors.length, 0);
});

test("parseGlb rejects truncated, non-GLB, over-budget, and NaN-corrupted geometry buffers", () => {
  assert.equal(parseGlb(Buffer.from("not-a-glb")).valid, false);
  assert.equal(parseGlb(Buffer.alloc(4)).valid, false);

  const valid = buildMinimalGlb({ widthMeters: 1, heightMeters: 1, depthMeters: 1 });
  const overBytes = inspectGlbFile(valid, { maxBytes: 32 });
  assert.equal(overBytes.passed, false);
  assert.match(overBytes.errors[0], /exceeds maxBytes/);

  const overTris = inspectGlbFile(valid, { maxTriangles: 4 });
  assert.equal(overTris.passed, false);
  assert.match(overTris.errors[0], /exceeds maxTriangles/);

  // Corrupt first float of BIN chunk (after 12-byte header + JSON chunk + 8-byte BIN header) with NaN
  const corrupted = Buffer.from(valid);
  const jsonLen = corrupted.readUInt32LE(12);
  const binStart = 12 + 8 + jsonLen + 8;
  corrupted.writeFloatLE(Number.NaN, binStart);
  const nanResult = parseGlb(corrupted);
  assert.equal(nanResult.valid, false);
  assert.match(nanResult.errors[0], /non-finite coordinate/);
});

test("exportAssetFormat produces valid gltf, obj, stl, ply, and glb outputs and rejects unsupported formats", () => {
  for (const fmt of EXPORT_FORMATS) {
    const res = exportAssetFormat(fmt, { name: "dining-table", widthMeters: 2, heightMeters: 0.75, depthMeters: 1 });
    assert.equal(res.ok, true);
    assert.ok(Buffer.isBuffer(res.buffer) && res.buffer.length > 0);
  }
  const objText = exportAssetFormat("obj", { name: "dining-table" }).buffer.toString("utf8");
  assert.match(objText, /^# OCG 3D Engine Wavefront OBJ/m);
  assert.match(objText, /^v /m);
  assert.match(objText, /^f /m);

  const plyText = exportAssetFormat("ply", { name: "dining-table" }).buffer.toString("utf8");
  assert.match(plyText, /^ply/m);
  assert.match(plyText, /^end_header/m);

  const bad = exportAssetFormat("fbx");
  assert.equal(bad.ok, false);
});
