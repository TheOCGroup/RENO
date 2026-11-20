import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import {createRenovisionServer, createMemoryApprovalRegistry} from "../src/renovisionServer.mjs";
import {createMemoryEvidenceStorage} from "../lib/renovision/memory-evidence-storage.mjs";
import {RENOVISION_STUDIO_HTML} from "../src/renovisionStudio.mjs";
import {RENOVISION_APP_HTML} from "../src/renovisionUi.mjs";

/** Founder-approved RENOVISION AI branding (2026-11-18 directive §7).
 * The packaged source asset is the founder-supplied icon, byte-identical;
 * the served derivatives must match the packaged files exactly. */

const BRAND_DIR = new URL("../src/brand/", import.meta.url);
const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

async function boot(t) {
  const authenticate = async () => null; // brand routes are public by design
  const storage = createMemoryEvidenceStorage({authorize: async () => false});
  const server = createRenovisionServer({authenticate, resolveApproval: createMemoryApprovalRegistry(), evidenceStorage: storage});
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  t.after(() => server.close());
  return "http://127.0.0.1:" + server.address().port;
}

test("brand assets are served publicly, byte-identical to the packaged files", async (t) => {
  const base = await boot(t);
  const cases = [
    ["/brand/icon-16.png", "icon-16.png", "image/png"],
    ["/brand/icon-32.png", "icon-32.png", "image/png"],
    ["/brand/icon-48.png", "icon-48.png", "image/png"],
    ["/brand/icon-180.png", "icon-180.png", "image/png"],
    ["/brand/icon-192.png", "icon-192.png", "image/png"],
    ["/brand/icon-512.png", "icon-512.png", "image/png"],
    ["/brand/renovision-icon-source.png", "renovision-icon-source.png", "image/png"],
    ["/brand/favicon.ico", "favicon.ico", "image/x-icon"],
    ["/favicon.ico", "favicon.ico", "image/x-icon"],
    ["/brand/manifest.webmanifest", "manifest.webmanifest", "application/manifest+json"],
  ];
  for (const [route, file, type] of cases) {
    const res = await fetch(base + route); // no auth headers: must be public
    assert.equal(res.status, 200, route);
    assert.equal(res.headers.get("content-type"), type, route);
    const served = Buffer.from(await res.arrayBuffer());
    const packaged = await readFile(new URL(file, BRAND_DIR));
    assert.equal(sha256(served), sha256(packaged), route + " bytes differ from packaged file");
  }
  const missing = await fetch(base + "/brand/icon-999.png");
  assert.equal(missing.status, 404);
});

test("the packaged source asset is the founder-approved icon (sha256 pinned)", async () => {
  const source = await readFile(new URL("renovision-icon-source.png", BRAND_DIR));
  assert.equal(sha256(source), "de095779d5ba6f1b36ae049a6418e835be837a5761c58aa4fc2aabcfe8ebe528");
});

test("both pages reference the approved icon set and show it in the header", () => {
  for (const html of [RENOVISION_STUDIO_HTML, RENOVISION_APP_HTML]) {
    assert.match(html, /<link rel="icon" type="image\/png" sizes="32x32" href="\/brand\/icon-32\.png">/);
    assert.match(html, /<link rel="apple-touch-icon" sizes="180x180" href="\/brand\/icon-180\.png">/);
    assert.match(html, /<link rel="manifest" href="\/brand\/manifest\.webmanifest">/);
    assert.match(html, /<img src="\/brand\/icon-192\.png" alt=""/);
    assert.doesNotMatch(html, /data:image\/svg\+xml,%3Csvg/); // interim "R" favicon retired
  }
});

test("the web manifest names the product and points at real icons", async () => {
  const manifest = JSON.parse(await readFile(new URL("manifest.webmanifest", BRAND_DIR), "utf8"));
  assert.equal(manifest.name, "RENOVISION AI");
  assert.deepEqual(manifest.icons.map((i) => i.sizes).sort(), ["192x192", "512x512"]);
});
