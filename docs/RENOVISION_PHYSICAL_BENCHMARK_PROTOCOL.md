# RENOVISION — physical room benchmark protocol v0.1

Status: TEST PLAN ONLY. No real room scanned, no measurements certified.

## Test selection
Use one consenting, accessible, ordinary room with at least one door, one window and one obstruction. Do not include identifying household photographs in public repositories. Obtain property owner authorization before recording. Record device model, OS, sensor support, app build and permission outcomes.

## Independent reference
Two operators: reference measurer and capture operator. Reference measurer records wall-to-wall width/depth, ceiling height, opening widths/positions, obstruction locations, and three repeat measurements per dimension using a calibrated laser or tape. Record instrument ID, calibration date/status, measurement unit, timestamp, operator, uncertainty estimate and evidence SHA-256. No benchmark claims unless original evidence bytes and digest are available and separately verified.

## Candidate captures
Capture from at least three positions, including occluded corners. Log coverage gaps and failed frames. Test camera permission denied, interrupted session, device without depth support and manual fallback. Do not use phone IMU alone to claim floor levelness. Do not assume RoomPlan/ARCore available until detected on actual device.

## Evaluation
Run the deterministic benchmark against independently recorded reference dimensions. Pre-register tolerances and measurement acceptance criteria before capture. Report mean/max absolute error, missing feature rate, opening and obstruction errors, repeated-capture variability, processing latency and cost. Keep failures, outliers and rejected captures. A pass on width/depth does not prove whole-room geometric fidelity.

## Security and QA
No production images in test fixtures. Private evidence store must enforce tenant isolation, authenticated actors, server-side authorization, retention deletion and encryption. QUINCEY independently inspects test protocol, artifacts, commit SHA, reproducibility, limitations and negative cases. Do not merge or deploy before separate approval.

## Evidence checklist
- [ ] Owner consent and capture authorization
- [ ] Independent operator and calibrated reference instrument
- [ ] Three repeated reference measurements per dimension
- [ ] Sensor capability and permission logs
- [ ] Original private artifacts and independently verified SHA-256 digests
- [ ] Calibration/uncertainty record and coverage-gap notes
- [ ] Benchmark outputs, failures, latency and model/tool costs
- [ ] Independent QUINCEY verdict on exact commit and artifacts
