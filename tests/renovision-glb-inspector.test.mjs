import test from "node:test";
import assert from "node:assert/strict";
import {buildMinimalGlb, parseGlb, inspectGlbFile} from "../lib/renovision/glb-inspector.mjs";

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

test("parseGlb and inspectGlbFile reject truncated, non-GLB, and over-budget buffers", () => {
  assert.equal(parseGlb(Buffer.from("not-a-glb")).valid, false);
  assert.equal(parseGlb(Buffer.alloc(4)).valid, false);

  const valid = buildMinimalGlb({ widthMeters: 1, heightMeters: 1, depthMeters: 1 });
  const overBytes = inspectGlbFile(valid, { maxBytes: 32 });
  assert.equal(overBytes.passed, false);
  assert.match(overBytes.errors[0], /exceeds maxBytes/);

  const overTris = inspectGlbFile(valid, { maxTriangles: 4 });
  assert.equal(overTris.passed, false);
  assert.match(overTris.errors[0], /exceeds maxTriangles/);
});
