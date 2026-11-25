import test from "node:test";
import assert from "node:assert/strict";
import {RENOVISION_STUDIO_HTML} from "../src/renovisionStudio.mjs";
import {renderAsset3dViewerHtml} from "../lib/renovision/asset3d-viewer.mjs";

/* Phase 9 CX polish (founder addendum 2026-11-24): guidance/clarity fixes.
   Each test asserts the guidance copy or exit that the audit found missing,
   so removing the guidance fails the suite. */

test("CX: disabled Generate explains the three prerequisites next to the button", () => {
  assert.match(RENOVISION_STUDIO_HTML, /id="generateGuidance"/);
  assert.match(RENOVISION_STUDIO_HTML, /sign in under Account above/);
  assert.match(RENOVISION_STUDIO_HTML, /create or open a project under Project details above/);
  assert.match(RENOVISION_STUDIO_HTML, /add a room photo/);
  assert.match(RENOVISION_STUDIO_HTML, /Generate becomes available when all three are ready/);
});

test("CX: collapsed panels name the action they contain (sign in / create project)", () => {
  assert.match(RENOVISION_STUDIO_HTML, /<summary>Account — sign in to generate<\/summary>/);
  assert.match(RENOVISION_STUDIO_HTML, /<summary>Project details — create or open a project<\/summary>/);
});

test("CX: photo upload confirms readiness and names the next step, not server jargon", () => {
  assert.match(RENOVISION_STUDIO_HTML, /Photo ready — it stays on this device until you choose Generate\. Next: pick your style and finishes, then Generate renovation concept\./);
  assert.doesNotMatch(RENOVISION_STUDIO_HTML, /Photo loaded locally\. No server upload performed\./);
});

test("CX: concept history has a guided empty state before any load", () => {
  assert.match(RENOVISION_STUDIO_HTML, /id="conceptHistoryStatus" class="note" role="status">Nothing here yet\. Concepts you generate while a project is open are saved here automatically/);
});

test("CX: 3D entry explains generation is unavailable and what the studio does instead", () => {
  assert.match(RENOVISION_STUDIO_HTML, /3D generation from your photo is not available yet, and opening this studio does not create a model/);
  assert.match(RENOVISION_STUDIO_HTML, /inspects sample models and your own \.glb files in interactive 3D/);
  assert.match(RENOVISION_STUDIO_HTML, /About the 3D Asset Studio: it opens in a new tab and only inspects sample or local \.glb models — it does not generate a 3D model from your photo/);
  assert.doesNotMatch(RENOVISION_STUDIO_HTML, /Real interactive 3D for room shells and design assets/);
});

test("CX: export stage tells the user where the download buttons actually live", () => {
  assert.match(RENOVISION_STUDIO_HTML, /The download buttons live with each tool: Download design brief and Download contractor scope beside your photo in Transform/);
  assert.doesNotMatch(RENOVISION_STUDIO_HTML, /The downloads above are the supported exports/);
});

test("CX: 3D viewer explains itself and offers a way back to the Design Studio", () => {
  const html = renderAsset3dViewerHtml({title: "RENOVISION AI — 3D Asset Studio"});
  assert.match(html, /id="viewerGuidance"/);
  assert.match(html, /This studio inspects 3D models — it does not generate them, and 3D generation from a photo is not available here/);
  assert.match(html, /drag on the canvas to orbit and scroll to zoom/);
  assert.match(html, /id="backToStudio" href="\/"[^>]*>← Design Studio<\/a>/);
  // Required attribution is preserved.
  assert.match(html, /Built with DINOv3/);
});

test("UF-PV-8: journey strip wrap + scroll-margin treatment covers the 741-768px band", () => {
  const media = RENOVISION_STUDIO_HTML.match(/@media\(max-width:(\d+)px\)\{\s*\.journey\{flex-wrap:wrap;gap:4px 18px;overflow-x:visible\}/);
  assert.ok(media, "journey wrap media query must exist");
  assert.ok(Number(media[1]) >= 768, `wrap breakpoint must cover 768px, got ${media[1]}`);
  assert.doesNotMatch(RENOVISION_STUDIO_HTML, /@media\(max-width:740px\)\{\s*\.journey/);
});
