import {mkdirSync, writeFileSync} from "node:fs";
import {join} from "node:path";
import {SAMPLE_3D_CATALOG} from "../src/asset3dServer.mjs";
import {buildMinimalGlb, inspectGlbFile} from "../lib/renovision/glb-inspector.mjs";

const outDir = join(process.cwd(), "assets", "samples");
mkdirSync(outDir, { recursive: true });

for (const sample of SAMPLE_3D_CATALOG) {
  const buf = buildMinimalGlb({ ...sample, name: sample.id });
  const check = inspectGlbFile(buf);
  if (!check.passed) {
    throw new Error(`Sample ${sample.id} failed GLB inspection: ${check.errors.join("; ")}`);
  }
  const outPath = join(outDir, `${sample.id}.glb`);
  writeFileSync(outPath, buf);
  console.log(`Generated & verified ${outPath} (${buf.length} bytes, ${check.inspection.triangleCount} tris)`);
}
