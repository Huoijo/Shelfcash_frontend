import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { PREVIEW_CANDIDATE_CATALOG } from "../lib/opportunity/candidate-catalog";
import {
  calculatePortfolioMetrics,
  canAddCandidateToPortfolio,
  formatVnd,
  getRecommendedCandidateIds,
  getWhyPortfolioReasons,
} from "../lib/opportunity/portfolio-selector";
import { TrialPortfolioView } from "../app/components/opportunity/TrialPortfolioView";

test("Portfolio Acceptance Test: Initial Recommended Bundle (#2 + #5)", () => {
  const budget = 2000000;
  const recommendedIds = getRecommendedCandidateIds(PREVIEW_CANDIDATE_CATALOG, budget);

  assert.deepEqual(recommendedIds, ["cand-cf-muoi", "cand-croissant-almond"]);

  const metrics = calculatePortfolioMetrics(
    PREVIEW_CANDIDATE_CATALOG,
    recommendedIds,
    budget,
    "optimizer"
  );

  assert.equal(metrics.budget, 2000000);
  assert.equal(metrics.totalCost, 1310000); // 560k + 750k
  assert.equal(metrics.remainingBudget, 690000); // 2000k - 1310k
  assert.equal(metrics.candidateCount, 2);
  assert.equal(metrics.utilizationPercent, 66); // 65.5% -> 66%
  assert.equal(metrics.feasible, true);
  assert.equal(metrics.violations.length, 0);
  assert.equal(metrics.source, "optimizer");
});

test("Portfolio Acceptance Test: Rank Preservation (Strictly #2, #5, never renumbered)", () => {
  const selectedCands = PREVIEW_CANDIDATE_CATALOG.filter((c) =>
    ["cand-cf-muoi", "cand-croissant-almond"].includes(c.id)
  );

  const metrics = calculatePortfolioMetrics(
    PREVIEW_CANDIDATE_CATALOG,
    ["cand-croissant-almond", "cand-cf-muoi"], // passed out of order
    2000000
  );

  // Selector automatically sorts by rank ascending
  assert.deepEqual(metrics.selectedCandidateIds, ["cand-cf-muoi", "cand-croissant-almond"]);

  const markup = renderToStaticMarkup(
    <TrialPortfolioView
      metrics={metrics}
      selectedCandidates={selectedCands}
      onRemoveCandidate={() => undefined}
    />
  );

  // Ranks #2 and #5 must appear clearly
  assert.match(markup, /#2/);
  assert.match(markup, /#5/);
  assert.doesNotMatch(markup, /#1/); // #1 wasn't selected, so rank #1 must not be invented for candidate 2
});

test("Portfolio Acceptance Test: Remove Candidate recomputes immediately", () => {
  const budget = 2000000;
  // User removes candidate #5 (750k), leaving only #2 (560k)
  const afterRemoveIds = ["cand-cf-muoi"];

  const metrics = calculatePortfolioMetrics(
    PREVIEW_CANDIDATE_CATALOG,
    afterRemoveIds,
    budget,
    "user_adjusted"
  );

  assert.equal(metrics.candidateCount, 1);
  assert.equal(metrics.totalCost, 560000);
  assert.equal(metrics.remainingBudget, 1440000);
  assert.equal(metrics.utilizationPercent, 28); // 560 / 2000 = 28%
  assert.equal(metrics.feasible, true);
  assert.equal(metrics.source, "user_adjusted");
});

test("Portfolio Acceptance Test: Add Candidate budget checking and over-budget blocking", () => {
  const budget = 2000000;
  const cand1 = PREVIEW_CANDIDATE_CATALOG.find((c) => c.rank === 1)!; // 480k
  const cand2 = PREVIEW_CANDIDATE_CATALOG.find((c) => c.rank === 2)!; // 560k
  const cand3 = PREVIEW_CANDIDATE_CATALOG.find((c) => c.rank === 3)!; // 580k
  const cand5 = PREVIEW_CANDIDATE_CATALOG.find((c) => c.rank === 5)!; // 750k

  // Current selection: cand2 (560k) + cand5 (750k) = 1.310k
  const currentSelected = [cand2, cand5];

  // Try adding cand1 (480k): 1310 + 480 = 1.790k <= 2.000k -> ALLOWED
  const checkCand1 = canAddCandidateToPortfolio(cand1, currentSelected, budget);
  assert.equal(checkCand1.allowed, true);

  // Try adding cand4 (620k) or cand3 (580k) + cand1 (480k):
  // If current selection was cand2 (560k) + cand3 (580k) + cand5 (750k) = 1.890k
  const threeSelected = [cand2, cand3, cand5];
  // Adding cand1 (480k) gives 2.370k > 2.000k -> BLOCKED with overBudgetAmount = 370k
  const checkCand1Over = canAddCandidateToPortfolio(cand1, threeSelected, budget);
  assert.equal(checkCand1Over.allowed, false);
  assert.equal(checkCand1Over.overBudgetAmount, 370000);
});

test("Portfolio Acceptance Test: Empty state when all candidates removed", () => {
  const budget = 2000000;
  const emptyMetrics = calculatePortfolioMetrics(
    PREVIEW_CANDIDATE_CATALOG,
    [],
    budget,
    "user_adjusted"
  );

  assert.equal(emptyMetrics.candidateCount, 0);
  assert.equal(emptyMetrics.totalCost, 0);
  assert.equal(emptyMetrics.remainingBudget, 2000000);
  assert.equal(emptyMetrics.feasible, false); // Cannot start trial with 0 candidates
  assert.equal(emptyMetrics.violations[0]?.code, "EMPTY_SELECTION");

  const markup = renderToStaticMarkup(
    <TrialPortfolioView
      metrics={emptyMetrics}
      selectedCandidates={[]}
      onRemoveCandidate={() => undefined}
    />
  );

  assert.match(markup, /Chưa có ứng viên nào được chọn/);
  // Button "Bắt đầu thử nghiệm" must be disabled in markup
  assert.match(markup, /disabled/);
});

test("Portfolio Acceptance Test: Why this portfolio explanation", () => {
  const selectedCands = PREVIEW_CANDIDATE_CATALOG.filter((c) =>
    ["cand-cf-muoi", "cand-croissant-almond"].includes(c.id)
  );
  const reasons = getWhyPortfolioReasons(selectedCands, 2000000);

  assert.ok(reasons.length >= 2);
  assert.match(reasons[0], /1\.310\.000/);
  assert.match(reasons[1], /AOV|kết hợp giữa đồ uống xu hướng và sản phẩm ăn kèm/);
});

test("FormatVND helper outputs correct Vietnamese currency format", () => {
  assert.equal(formatVnd(2000000), "2.000.000 ₫");
  assert.equal(formatVnd(1310000), "1.310.000 ₫");
  assert.equal(formatVnd(690000), "690.000 ₫");
  assert.equal(formatVnd(-250000), "-250.000 ₫");
});
