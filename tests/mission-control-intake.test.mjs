import test from "node:test";
import assert from "node:assert/strict";
import { receiveClosedAcquisition, validateAcquisitionHandoff } from "../src/missionControlIntake.mjs";

function payload() {
  return {
    contractVersion: "1.0",
    sourceSystem: "pipeline",
    targetSystem: "mission-control",
    opportunityId: "opp-123",
    opportunityCode: "OCG-123",
    propertyId: "property-123",
    address: "123 Test St",
    closedAt: "2026-09-25T16:00:00Z",
    acquisition: { purchasePrice: 145000, earnestMoney: 1000, strategyType: "cash_purchase", offerId: "offer-1", offerVersionId: "version-1" },
    underwriting: { sourceSystem: "deal-scout", sourceUnderwritingId: "victor-1", arv: 235000, rehab: 30000, mao: 155000, confidence: 0.9, limitations: null },
    renovationSeed: { budgetBaseline: 30000, scopeStatus: "needs_field_validation", projectStatus: "intake_ready" }
  };
}

function repository() {
  const byHandoff = new Map();
  return {
    findBySourceHandoffId(id) { return byHandoff.get(id) || null; },
    insert(project) { byHandoff.set(project.sourceHandoffId, project); return project; },
    count() { return byHandoff.size; }
  };
}

test("closed acquisition creates one field-validation project and preserves acquisition baselines", () => {
  const repo = repository();
  const first = receiveClosedAcquisition({ handoffId: "handoff-1", payload: payload(), repository: repo });
  assert.equal(first.duplicate, false);
  assert.equal(first.project.acquisitionPrice, 145000);
  assert.equal(first.project.arvBaseline, 235000);
  assert.equal(first.project.rehabBudgetBaseline, 30000);
  assert.equal(first.project.scopeStatus, "field_scope_required");
  assert.equal(first.project.budgetStatus, "preliminary_baseline");
  assert.equal(first.project.projectStatus, "intake");
  assert.equal(first.acknowledgment.eventType, "acknowledged");
  assert.equal(first.acknowledgment.externalRef, first.project.id);
  assert.equal(repo.count(), 1);

  const duplicate = receiveClosedAcquisition({ handoffId: "handoff-1", payload: payload(), repository: repo });
  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.project.id, first.project.id);
  assert.equal(repo.count(), 1);
});

test("receiver refuses handoffs that would bypass field scope validation", () => {
  const bad = payload();
  bad.renovationSeed.scopeStatus = "approved";
  assert.throws(() => validateAcquisitionHandoff(bad), /field_scope_validation_required/);
});

test("receiver rejects wrong source, target, or contract version", () => {
  const wrongSource = payload(); wrongSource.sourceSystem = "other";
  assert.throws(() => validateAcquisitionHandoff(wrongSource), /invalid_handoff_source/);
  const wrongTarget = payload(); wrongTarget.targetSystem = "other";
  assert.throws(() => validateAcquisitionHandoff(wrongTarget), /invalid_handoff_target/);
  const wrongVersion = payload(); wrongVersion.contractVersion = "2.0";
  assert.throws(() => validateAcquisitionHandoff(wrongVersion), /unsupported_handoff_contract/);
});
