# RENOVISION — Spatial Accuracy Contract v0.1

Status: engineering contract / not implemented
Owner: RENO / Mission Control spatial source of truth
Consumers: RENOVISION Renovate, RENOVISION Furnish, Deal Scout (read-only geometry where appropriate)
Reference: docs/SPATIAL_PROPERTY_INTELLIGENCE.md
Tracking: #2

## Core invariant
An AI image is never authoritative geometry. Only evidence-backed spatial measurements can be marked verified. Proposed edits are a separate layer from the existing property.

## Capture evidence
Each room capture must record property ID, room ID, capture ID, device model, platform, sensor/depth capability, timestamp, calibration method/status, photo/video/scan artifact references, coverage gaps, operator, and measurement source. Store source provenance and access controls. Avoid collecting unnecessary personal data.

## Measurement contract
Each measured segment/surface stores: stable ID, semantic type (wall/floor/ceiling/opening/obstruction), numerical value and unit, coordinate frame, source method (manual laser/tape, LiDAR/RoomPlan, AR depth, photogrammetry, imported plan), estimated uncertainty, verification status, verifier, verification time, and links to supporting evidence. Missing calibration or unsupported sensor = estimated, not verified. Confidence alone never promotes a measurement to verified.

## Surface levelness
Device pitch/roll can assist camera alignment but cannot certify floor/wall levelness. Surface levelness requires a documented calibrated measurement procedure or external instrument and explicit verification.

## Geometry state
Maintain EXISTING, PROPOSED, ALTERNATE and AS-BUILT as separately identified states. Lock verified dimensions, structural walls, door/window positions, ceiling heights, and known permanent services in EXISTING. Every PROPOSED change requires an approved scope item, actor, timestamp and geometry diff. Never mutate EXISTING from generated pixels.

## Rendering gate
Before output: validate requested edits against approved scope. After output: compare architectural features and spatial relationships against source images and measured geometry; flag or reject mismatches. Image-only comparisons are advisory, not proof of dimensional fidelity. Mark renderings CONCEPT until geometry verification has evidence. Professional review status requires recorded reviewer and scope.

## Furnishing gate
For each proposed product: stable product identifier, source, verified physical dimensions, orientation, clearance envelope, placement coordinates, collision results, door/egress clearance, price timestamp and availability source. Unverified dimensions or product identity block 'verified fit' claims. Egress and accessibility rules require jurisdiction-specific professional checks when relevant.

## Ground-truth benchmark
Use a real measured property. Compare at least 10 independently measured distances covering room dimensions, openings and ceiling height; record signed/absolute errors in cm and inches, per-device conditions and failure modes. Include reflective/low-texture surfaces, poor lighting, occlusions and incomplete scans. Establish acceptance thresholds from empirical device testing before claims; no invented accuracy tolerance.

## QA and cost
Log model/tool versions, execution cost, latency, data lineage, test fixtures, failed scans, manual corrections and independent QUINCEY review. Run no paid generations for initial contract validation. All changes on isolated branches; no automatic merge or deployment.

## Agent and product boundaries
VICTOR leads OCG OS; HUNTER and PIPER are working agents. ORION leads OCG MEDIA with DEVIN (Director), MARK and other specialists. TED leads OCG LAB with ARCHER and other specialists; QUINCEY independent QA. AIDEN/CHIEF coordinate. MUSE and ASTRA are models, not agents. FLIP IT! is separate and out of scope.
