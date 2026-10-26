/** RENOVISION physical benchmark runner.
 * Usage: node scripts/renovision-benchmark-runner.mjs <fixture.json> [report.json]
 * Reads an independently recorded benchmark fixture, validates its provenance,
 * and computes reference-vs-candidate dimension errors with the existing
 * benchmark modules. The output is a measurement report, never a certification:
 * independent QUINCEY review of the exact commit and the private evidence is
 * still required before any accuracy statement may be made. */
import {readFile, writeFile} from "node:fs/promises";
import {validateBenchmarkProvenance} from "../lib/renovision/benchmark-provenance.mjs";
import {evaluateRoomBenchmark} from "../lib/renovision/room-benchmark.mjs";
import {summarizeDimensionBenchmark} from "../lib/renovision/dimension-benchmark-summary.mjs";
import {normalizeLength} from "../lib/renovision/measurement-math.mjs";
const [, , fixturePath, reportPath] = process.argv;
if (!fixturePath) { console.error("usage: renovision-benchmark-runner.mjs <fixture.json> [report.json]"); process.exit(64); }
const fixture = JSON.parse(await readFile(fixturePath, "utf8"));
const provenance = validateBenchmarkProvenance(fixture.provenance ?? {});
const benchmark = evaluateRoomBenchmark({roomId: fixture.roomId, referenceMeasurements: fixture.referenceMeasurements ?? [], candidateMeasurements: fixture.candidateMeasurements ?? [], toleranceMeters: fixture.toleranceMeters ?? 0.05});
let summary = null;
if (benchmark.valid) {
 const candidates = new Map((fixture.candidateMeasurements ?? []).map((c) => [c.featureId, c]));
 const samples = (fixture.referenceMeasurements ?? []).map((ref) => ({featureId: ref.featureId, referenceMeters: normalizeLength(ref).meters, candidateMeters: normalizeLength(candidates.get(ref.featureId)).meters}));
 summary = summarizeDimensionBenchmark(samples, {absoluteToleranceMeters: fixture.toleranceMeters ?? 0.05, relativeTolerance: fixture.relativeTolerance ?? 0.02});
}
const report = {
 tool: "renovision-benchmark-runner",
 generatedAt: new Date().toISOString(),
 studyId: fixture.studyId ?? null,
 roomId: fixture.roomId ?? null,
 provenance,
 benchmark,
 summary,
 certified: false,
 independentlyCertified: false,
 notice: "NOT CERTIFIED. This report computes errors from the supplied fixture only. It does not verify that the reference measurements were taken as described, and it authorizes no accuracy claim."
};
const serialized = JSON.stringify(report, null, 2);
if (reportPath) await writeFile(reportPath, serialized);
console.log(serialized);
const inputsValid = provenance.valid && benchmark.valid && summary?.valid === true;
console.log(inputsValid ? "Benchmark inputs valid; errors computed. Certification: NOT GRANTED (independent QUINCEY review required)." : "Benchmark inputs INVALID — see report errors. No result may be quoted.");
process.exit(inputsValid ? 0 : 2);
