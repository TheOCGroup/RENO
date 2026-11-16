import test from "node:test";
import assert from "node:assert/strict";
import {buildRoomModel, lockRoomGeometry} from "../lib/renovision/room-model.mjs";
import {evaluateAsset3dFurnishingFit} from "../lib/renovision/asset3d-furnishing-bridge.mjs";

function makeLockedRoom() {
  const roomModel = buildRoomModel({
    propertyId: "prop-1",
    roomId: "living-room",
    measurements: [
      { measurementId: "m1", featureId: "width", value: 4.5, unit: "m", uncertainty: 0.02, verificationStatus: "verified", fieldMeasured: true, evidenceRef: "ev-1" },
      { measurementId: "m2", featureId: "depth", value: 5.0, unit: "m", uncertainty: 0.02, verificationStatus: "verified", fieldMeasured: true, evidenceRef: "ev-2" },
      { measurementId: "m3", featureId: "height", value: 2.7, unit: "m", uncertainty: 0.02, verificationStatus: "verified", fieldMeasured: true, evidenceRef: "ev-3" },
    ],
  });
  const lock = lockRoomGeometry({
    roomModel,
    manifestVerified: true,
    actor: { authenticated: true, id: "archer", tenantId: "tenant-1" },
  });
  return { roomModel, lock };
}

test("AI-estimated 3D asset dimensions are blocked from furnishing fit without calibrated SKU provenance", () => {
  const { roomModel, lock } = makeLockedRoom();
  const res = evaluateAsset3dFurnishingFit({
    roomModel,
    lock,
    assets: [
      {
        id: "sofa-ai",
        jobId: "asset3d_123",
        estimatedDimensionsMeters: { width: 2.1, depth: 0.95, height: 0.82 },
        x: 1.0,
        y: 1.0,
      },
    ],
  });
  assert.equal(res.valid, true);
  assert.equal(res.items[0].verdict, "blocked_unverified_dimensions");
  assert.equal(res.items[0].verified, false);
});

test("Calibrated 3D asset dimensions flow through RENO furnishing-plan uncertainty & clearance checks", () => {
  const { roomModel, lock } = makeLockedRoom();
  const res = evaluateAsset3dFurnishingFit({
    roomModel,
    lock,
    assets: [
      {
        id: "sofa-calibrated",
        productId: "SKU-SOFA-210",
        calibratedDimensions: {
          widthMeters: 2.1,
          depthMeters: 0.95,
          heightMeters: 0.82,
          dimensionSource: "manufacturer-spec-sheet",
          dimensionsVerified: true,
          uncertaintyMeters: 0.01,
        },
        x: 1.0,
        y: 1.0,
        clearance: 0.75,
      },
    ],
  });
  assert.equal(res.valid, true);
  assert.equal(res.items[0].verdict, "fits_with_uncertainty_margin");
  assert.equal(res.items[0].verified, false);
  assert.equal(res.items[0].fieldVerificationRequired, true);
});
