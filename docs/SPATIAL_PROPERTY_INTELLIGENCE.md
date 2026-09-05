# OCG Spatial Property Intelligence

Status: Architecture baseline
Owner system: RENO / Mission Control
Consumers: Deal Scout / Victor, Mission Control, OCG marketing

## Objective
Create an accurate spatial representation of a real property, apply a verified proposed renovation, and publish an interactive browser walkthrough without creating a separate application or duplicate infrastructure.

## Canonical flow

Real property capture -> reconstruction -> spatial cleanup -> renovation design -> QA -> web walkthrough -> marketing / operations

### 1. Capture
Accept phone photos/video, LiDAR when available, floor plans, measurements, inspection media, and existing Deal Scout walkthrough evidence.

### 2. Reconstruction
Produce a spatial scene using the best economical reconstruction path available (Gaussian splat, photogrammetry, mesh reconstruction, or compatible world-model output). Do not bind OCG to one vendor.

### 3. Spatial cleanup
Use open tooling first. Gaussian splat cleanup/optimization can use SuperSplat-compatible formats. Blender is the canonical 3D production environment for geometry correction, materials, renovation design, staging, cameras, and export.

### 4. Renovation layer
The renovation is a proposed state layered on the verified existing property. It may change finishes, fixtures, cabinetry, flooring, paint, lighting, approved walls, exterior finishes, landscaping, and staging according to the actual renovation scope.

### 5. Accuracy contract
AI MUST NOT silently alter verified physical property facts. Preserve or explicitly flag changes to:
- room dimensions
- exterior footprint
- ceiling heights
- doors and windows
- structural walls
- floor relationships
- permanent mechanical/plumbing/electrical locations when known

Every structural or dimensional deviation must be traceable to an approved proposed-scope item. Unknowns remain unknown.

### 6. States
Every property twin should support, where data exists:
- EXISTING
- PROPOSED RENOVATION
- ALTERNATE DESIGN (optional)
- AS-BUILT (after verification)

Conceptual states must be visibly labeled and never represented as completed construction.

### 7. Web delivery
Prefer an embeddable browser experience over a new standalone application. The viewer must support desktop/mobile navigation and should support walk controls, camera paths, annotations, and a shareable property-specific URL/QR target.

### 8. OCG system integration
Deal Scout / Victor owns pre-acquisition property intelligence and deterministic underwriting. Spatial outputs are evidence/design artifacts, not replacements for authoritative calculations.

Mission Control / RENO inherits the property spatial record after acquisition and owns renovation execution state. The same property identity should persist across acquisition, renovation, marketing, and disposition.

### 9. Model routing / cost control
Aiden routes each operation to the simplest capable engine. Astra is escalation-only for difficult computer-use, autonomous execution, coding/debugging, or independent QA where its additional capability is justified. It is not the default spatial or rendering engine.

### 10. First proof
The first proof must use one real OCG property. Required input at proof time:
- comprehensive room/exterior capture
- at least one verified measurement or floor plan for scale
- intended renovation scope

Proof acceptance:
1. recognizable and navigable actual property
2. geometry/scale checked against verified measurements
3. proposed renovation traceable to scope
4. no silent structural hallucinations
5. usable mobile + desktop walkthrough
6. current/proposed states clearly distinguished
7. browser share target works
8. stills/camera path can be produced from the same spatial asset

## Tool baseline
- Blender LTS: canonical 3D production/cleanup/design tool
- SuperSplat / compatible open-source tooling: splat inspection, cleanup, optimization and browser publishing where appropriate
- Browser viewer: embedded into existing OCG surfaces where possible

## Non-goals
- no new OCG agent
- no duplicate repository solely for this feature
- no duplicate deployment unless technically required and approved
- no paid spatial platform by default
- no invented property geometry
