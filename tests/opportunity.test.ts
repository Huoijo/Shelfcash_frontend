import assert from "node:assert/strict";
import test from "node:test";
import { getOpportunityMode, isOpportunityEnabled } from "../lib/opportunity/config";
import { getOpportunityService } from "../lib/opportunity/service";
import { OpportunityPreviewService } from "../lib/opportunity/preview-service";
import { OpportunityApiService } from "../lib/opportunity/api-service";
import {
  PREVIEW_CANDIDATE_CATALOG,
  PREVIEW_LOCAL_CONTEXT,
} from "../lib/opportunity/candidate-catalog";

test("Opportunity Config parser handles 3-state mode and safe fallback", () => {
  const originalEnv = process.env.NEXT_PUBLIC_SHELFCASH_OPPORTUNITY_MODE;

  try {
    process.env.NEXT_PUBLIC_SHELFCASH_OPPORTUNITY_MODE = "preview";
    assert.equal(getOpportunityMode(), "preview");
    assert.equal(isOpportunityEnabled(), true);

    process.env.NEXT_PUBLIC_SHELFCASH_OPPORTUNITY_MODE = "live";
    assert.equal(getOpportunityMode(), "live");
    assert.equal(isOpportunityEnabled(), true);

    process.env.NEXT_PUBLIC_SHELFCASH_OPPORTUNITY_MODE = "disabled";
    assert.equal(getOpportunityMode(), "disabled");
    assert.equal(isOpportunityEnabled(), false);

    // Unknown or empty falls back safely to disabled
    process.env.NEXT_PUBLIC_SHELFCASH_OPPORTUNITY_MODE = "unknown_xyz";
    assert.equal(getOpportunityMode(), "disabled");
    assert.equal(isOpportunityEnabled(), false);

    delete process.env.NEXT_PUBLIC_SHELFCASH_OPPORTUNITY_MODE;
    assert.equal(getOpportunityMode(), "disabled");
    assert.equal(isOpportunityEnabled(), false);
  } finally {
    process.env.NEXT_PUBLIC_SHELFCASH_OPPORTUNITY_MODE = originalEnv;
  }
});

test("Opportunity Service factory resolves proper adapter according to mode", () => {
  const previewService = getOpportunityService("preview");
  assert.ok(previewService instanceof OpportunityPreviewService);

  const liveService = getOpportunityService("live");
  assert.ok(liveService instanceof OpportunityApiService);

  const disabledFallbackService = getOpportunityService("disabled");
  assert.ok(disabledFallbackService instanceof OpportunityPreviewService);
});

test("Opportunity Preview Service creates run and builds deterministic portfolio under budget", async () => {
  const service = new OpportunityPreviewService();

  const run = await service.createRun({
    storeId: "STORE_001",
    storeName: "ShelfCash Flagship Coffee",
    radiusKm: 3,
    trialBudget: 2000000,
  });

  assert.ok(run.runId.startsWith("opp-run-"));
  assert.equal(run.storeId, "STORE_001");
  assert.equal(run.radiusKm, 3);
  assert.equal(run.trialBudget, 2000000);
  assert.equal(run.status, "scanning");
  assert.equal(run.totalPoisCount, 31);

  // Directly build result from run to verify portfolio optimization
  const result = service.buildResult(run);

  assert.equal(result.status, "completed");
  assert.equal(result.localContext.radiusKm, 3);
  assert.equal(result.localContext.metrics.length, 4);
  assert.equal(result.rankedCandidates.length, PREVIEW_CANDIDATE_CATALOG.length);

  // Verification of portfolio under 2.000.000 budget
  // Trà Lài (480k) + Cà Phê Muối (560k) + Cold Brew Cam Sả (580k) = 1.620k <= 2.000k
  assert.equal(result.trialPortfolio.budget, 2000000);
  assert.equal(result.trialPortfolio.allocatedCost, 1620000);
  assert.equal(result.trialPortfolio.remainingBudget, 380000);
  assert.equal(result.trialPortfolio.candidateCount, 3);

  const selectedItems = result.trialPortfolio.items.filter((i) => i.selected);
  assert.equal(selectedItems.length, 3);
  assert.equal(selectedItems[0]?.candidateName, "Trà Lài");
  assert.equal(selectedItems[1]?.candidateName, "Cà Phê Muối Biển");
  assert.equal(selectedItems[2]?.candidateName, "Cold Brew Cam Sả");
});

test("Opportunity Candidate Catalog maintains proper evidence, why paths, and boundaries", () => {
  assert.ok(PREVIEW_CANDIDATE_CATALOG.length >= 5);

  const top1 = PREVIEW_CANDIDATE_CATALOG[0];
  assert.equal(top1.name, "Trà Lài");
  assert.equal(top1.opportunityScore, 0.82);
  assert.equal(top1.domain, "same_domain");
  assert.ok(top1.whyPath.length >= 5);
  assert.ok(top1.reusableIngredients.length > 0);

  // Verify POI points count matches metrics
  assert.equal(PREVIEW_LOCAL_CONTEXT.poiPoints.length, 31);
  const universities = PREVIEW_LOCAL_CONTEXT.poiPoints.filter((p) => p.type === "university");
  assert.equal(universities.length, 6);
  const transits = PREVIEW_LOCAL_CONTEXT.poiPoints.filter((p) => p.type === "transit");
  assert.equal(transits.length, 4);
  const competitions = PREVIEW_LOCAL_CONTEXT.poiPoints.filter((p) => p.type === "competition");
  assert.equal(competitions.length, 12);
  const retails = PREVIEW_LOCAL_CONTEXT.poiPoints.filter((p) => p.type === "retail");
  assert.equal(retails.length, 9);
});

