// Phase 9.5 remediation — UF-Q9.5-1 (QUINCEY High): every browser module the
// studio page imports must actually be SERVED by the studio server. The
// server only serves lib modules from a fixed allowlist; when
// export-checklist.mjs was imported by the page but not allowlisted, the
// import 404'd and the page's whole module script died (window.RV never
// assigned). This test boots the real server and fetches every import —
// it fails on any allowlist omission, unlike an HTML string match.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRenovisionServer, createMemoryApprovalRegistry } from "../src/renovisionServer.mjs";
import { createMemoryEvidenceStorage } from "../lib/renovision/memory-evidence-storage.mjs";
import { RENOVISION_STUDIO_HTML } from "../src/renovisionStudio.mjs";

async function boot(t) {
  const authenticate = async () => null;
  const storage = createMemoryEvidenceStorage({ authorize: async () => false });
  const server = createRenovisionServer({ authenticate, resolveApproval: createMemoryApprovalRegistry(), evidenceStorage: storage });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  t.after(() => server.close());
  return "http://127.0.0.1:" + server.address().port;
}

test("UF-Q9.5-1: every /lib/renovision module imported by the studio page is served (HTTP 200)", async (t) => {
  const imports = [...RENOVISION_STUDIO_HTML.matchAll(/from\s+"(\/lib\/renovision\/[a-z0-9-]+\.mjs)"/g)].map((m) => m[1]);
  assert.ok(imports.length >= 10, `expected the studio module imports to be found, got ${imports.length}`);
  assert.ok(imports.includes("/lib/renovision/export-checklist.mjs"), "studio must import the export checklist evaluator");
  const base = await boot(t);
  for (const route of imports) {
    const res = await fetch(base + route);
    assert.equal(res.status, 200, `${route} must be served (a 404 here kills the studio module script)`);
    assert.match(res.headers.get("content-type") || "", /javascript/, route);
    await res.arrayBuffer();
  }
});

test("UF-Q9.5-1: served export-checklist module bytes equal the packaged lib file", async (t) => {
  const base = await boot(t);
  const res = await fetch(base + "/lib/renovision/export-checklist.mjs");
  assert.equal(res.status, 200);
  const served = Buffer.from(await res.arrayBuffer());
  const packaged = await readFile(new URL("../lib/renovision/export-checklist.mjs", import.meta.url));
  assert.ok(served.equals(packaged), "served module must be the packaged evaluator, byte for byte");
});
