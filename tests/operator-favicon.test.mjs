import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MissionControlStore } from "../src/missionControlStore.mjs";
import { createMissionControlServer } from "../src/missionControlServer.mjs";

// Regression for finding F-M1 (mobile acceptance, 2026-11-15): the operator
// page declared no favicon, so every browser's automatic /favicon.ico
// request returned 404 (console error on load, no home-screen icon on
// mobile). The page now declares an inline SVG icon; these tests fail on
// the pre-fix page and pass on the fixed page.

const OPERATOR_TOKEN = "favicon-test-operator-token";
const HANDOFF_SECRET = "favicon-test-handoff-secret";

async function startApp(t) {
  const dir = mkdtempSync(join(tmpdir(), "mc-favicon-"));
  const store = new MissionControlStore(join(dir, "mission-control.db"), { tenantId: "default" });
  const app = createMissionControlServer({ store, operatorToken: OPERATOR_TOKEN, handoffSecret: HANDOFF_SECRET });
  await new Promise(resolve => app.server.listen(0, "127.0.0.1", resolve));
  t.after(() => { app.server.close(); store.close(); rmSync(dir, { recursive: true, force: true }); });
  return `http://127.0.0.1:${app.server.address().port}`;
}

test("operator page declares an inline SVG favicon", async (t) => {
  const base = await startApp(t);
  const res = await fetch(`${base}/`);
  assert.equal(res.status, 200);
  const html = await res.text();
  const match = html.match(/<link\s+rel="icon"\s+href="data:image\/svg\+xml,([^"]+)"/);
  assert.ok(match, "served operator page must declare <link rel=\"icon\"> with a data:image/svg+xml URI");
  const svg = decodeURIComponent(match[1]);
  assert.ok(svg.startsWith("<svg"), "favicon payload decodes to an SVG document");
  assert.ok(svg.includes("</svg>"), "favicon SVG is complete");
  assert.ok(svg.includes(">M</text>"), "favicon carries the M monogram");
  assert.ok(svg.includes('xmlns="http://www.w3.org/2000/svg"') || svg.includes("xmlns='http://www.w3.org/2000/svg'"),
    "decoded SVG carries the SVG namespace (the raw URI percent-encodes it so the page keeps zero literal external URLs)");
  // Certified invariant (mission-control-server.test.mjs): the page must
  // reference no external URLs. The favicon must not break it.
  assert.equal(/https?:\/\//.test(html), false, "operator page must reference no external URLs");
});

test("operator page head carries exactly one favicon declaration", async (t) => {
  const base = await startApp(t);
  const res = await fetch(`${base}/`);
  const html = await res.text();
  const count = (html.match(/rel="icon"/g) || []).length;
  assert.equal(count, 1);
});
