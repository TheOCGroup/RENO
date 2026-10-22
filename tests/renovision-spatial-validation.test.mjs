import test from "node:test";
import assert from "node:assert/strict";
import { validateMeasurement, validateGeometryChange, verifyFurnitureFit } from "../lib/renovision/spatial-validation.mjs";

const base = {
  propertyId:"p1", roomId:"r1", measurementId:"m1", captureId:"c1",
  deviceModel:"laser meter", platform:"manual", timestamp:"2026-10-22T00:00:00Z",
  coordinateFrame:"room-local", evidenceRef:"sha256:test-fixture",
  semanticType:"wall", method:"manual_laser", value:4.2, unit:"m",
  uncertainty:0.01, calibrationStatus:"calibrated",
  verificationStatus:"verified", verifiedBy:"field-reviewer",
  verifiedAt:"2026-10-22T00:00:00Z", geometryState:"EXISTING"
};

test("verified evidence passes with provenance", () => {
  assert.deepEqual(validateMeasurement(base), {valid:true,verified:true,errors:[]});
});
test("estimated evidence is not promoted to verified", () => {
  const r=validateMeasurement({...base, verificationStatus:"estimated", verifiedBy:undefined});
  assert.equal(r.valid,true); assert.equal(r.verified,false);
});
test("uncalibrated measurements cannot claim verified", () => {
  assert.equal(validateMeasurement({...base,calibrationStatus:"uncalibrated"}).valid,false);
});
test("nonfinite values are rejected", () => {
  assert.equal(validateMeasurement({...base,value:Infinity}).valid,false);
});
test("proposed geometry cannot be marked field verified", () => {
  assert.equal(validateMeasurement({...base,geometryState:"PROPOSED"}).valid,false);
});
test("existing geometry cannot be mutated", () => {
  assert.equal(validateGeometryChange({featureId:"wall1",targetState:"EXISTING"},["wall1"]).allowed,false);
});
test("locked proposed change requires approval evidence", () => {
  assert.equal(validateGeometryChange({featureId:"wall1",targetState:"PROPOSED"},["wall1"]).allowed,false);
  assert.equal(validateGeometryChange({featureId:"wall1",targetState:"PROPOSED",approvedScopeItemId:"s1",approvedBy:"owner",approvedAt:"2026-10-22"},["wall1"]).allowed,true);
});
test("furniture fits only with dimensional provenance and clearance", () => {
  const room={width:4,depth:4,geometryVerified:true};
  const item={productId:"sku1",dimensionSource:"manufacturer",dimensionsVerified:true,width:1,depth:1,x:1,y:1,clearance:0.3};
  assert.deepEqual(verifyFurnitureFit(room,item),{fits:true,verified:true,errors:[]});
  assert.equal(verifyFurnitureFit(room,{...item,x:3.5}).fits,false);
  assert.equal(verifyFurnitureFit(room,{...item,dimensionsVerified:false}).verified,false);
});
