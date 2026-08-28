import test from "node:test";
import assert from "node:assert/strict";
import {
  isDecisionMockDiagnosticsEnabled,
  extractRealCriticDiagnostics,
  getMockCriticDiagnostics,
  getDecisionDiagnosticsReport,
} from "../lib/decision-diagnostics";
import type { DecisionBriefFacts, DecisionPackage } from "../lib/types";

const sampleBrief: DecisionBriefFacts = {
  brief_id: "brief-1",
  decision_run_id: "run-1",
  status: "completed_with_recommendation",
  recommendation: {
    available: true,
    strategy: "balanced",
    total_purchase_cost: 5625000,
    expected_fill_rate: 0.965,
  },
  procurement_rows: [],
  ingredient_demand: [],
  risk: {
    expected_fill_rate: 0.965,
    stockout_probability: 0.038,
    shortage_quantity: 0,
    waste_quantity: 0,
  },
  critic: {
    hard_violations: [],
    warnings: [],
  },
  evidence: [],
  data_availability: {
    sales_history: "available",
    inventory: "available",
    recipes: "available",
  },
};

test("isDecisionMockDiagnosticsEnabled reflects environment variable configuration", () => {
  const originalEnv = process.env.NEXT_PUBLIC_ENABLE_DECISION_MOCK_DIAGNOSTICS;
  try {
    process.env.NEXT_PUBLIC_ENABLE_DECISION_MOCK_DIAGNOSTICS = "true";
    assert.equal(isDecisionMockDiagnosticsEnabled(), true);

    process.env.NEXT_PUBLIC_ENABLE_DECISION_MOCK_DIAGNOSTICS = "false";
    assert.equal(isDecisionMockDiagnosticsEnabled(), false);
  } finally {
    if (originalEnv === undefined) {
      delete process.env.NEXT_PUBLIC_ENABLE_DECISION_MOCK_DIAGNOSTICS;
    } else {
      process.env.NEXT_PUBLIC_ENABLE_DECISION_MOCK_DIAGNOSTICS = originalEnv;
    }
  }
});

test("extractRealCriticDiagnostics extracts real findings and violations from solver package", () => {
  const decision: DecisionPackage = {
    decision_run_id: "run-1",
    status: "completed",
    recommended_strategy: "balanced",
    critic: {
      status: "pass",
      findings: [
        {
          code: "LEAD_TIME_FEASIBILITY",
          status: "fail",
          severity: "critical",
          message: "NCC không kịp giao trước khi hết tồn an toàn",
        },
      ],
    },
    strategies: [
      {
        strategy: "lean",
        feasible: false,
        violations: ["Tồn kho đệm không đủ đáp ứng nhu cầu P25"],
        business_metrics: {
          projected_purchase_cost: 4000000,
          expected_fill_rate: 0.91,
          stockout_probability: 0.09,
        },
      },
      {
        strategy: "balanced",
        feasible: true,
        violations: [],
        business_metrics: {
          projected_purchase_cost: 5625000,
          expected_fill_rate: 0.965,
          stockout_probability: 0.038,
        },
      },
      {
        strategy: "protected",
        feasible: true,
        warnings: ["Hao hụt tăng do tồn kho cao"],
        business_metrics: {
          projected_purchase_cost: 7000000,
          expected_fill_rate: 0.99,
          stockout_probability: 0.01,
        },
      },
    ],
  };

  const report = extractRealCriticDiagnostics(sampleBrief, decision, 10000000);
  assert.ok(report);
  assert.equal(report.origin, "real");
  assert.equal(report.hasRealCriticData, true);
  assert.equal(report.summaries.lean.statusTag, "fail");
  assert.match(report.summaries.lean.reason, /Tồn kho đệm không đủ/);
  assert.equal(report.summaries.balanced.statusTag, "pass");

  // Check extracted checks include LEAD_TIME_FEASIBILITY
  const leadCheck = report.checks.find((c) => c.code === "LEAD_TIME_FEASIBILITY");
  assert.ok(leadCheck);
  assert.equal(leadCheck.origin, "real");
});

test("getMockCriticDiagnostics returns structured mock data with origin metadata", () => {
  const mockReport = getMockCriticDiagnostics(sampleBrief, 15000000);
  assert.equal(mockReport.origin, "mock");
  assert.equal(mockReport.hasRealCriticData, false);
  assert.equal(mockReport.checks.length, 6);
  assert.equal(mockReport.summaries.lean.statusTag, "fail");
  assert.equal(mockReport.summaries.balanced.statusTag, "pass");
});

test("getDecisionDiagnosticsReport respects forceMode and fallback logic", () => {
  const originalEnv = process.env.NEXT_PUBLIC_ENABLE_DECISION_MOCK_DIAGNOSTICS;
  try {
    process.env.NEXT_PUBLIC_ENABLE_DECISION_MOCK_DIAGNOSTICS = "false";
    const reportEmptyReal = getDecisionDiagnosticsReport(sampleBrief, null, 15000000);
    assert.equal(reportEmptyReal.origin, "real");

    // Force mock mode
    const reportForcedMock = getDecisionDiagnosticsReport(sampleBrief, null, 15000000, "mock");
    assert.equal(reportForcedMock.origin, "mock");
    assert.equal(reportForcedMock.checks.length, 6);
  } finally {
    if (originalEnv === undefined) {
      delete process.env.NEXT_PUBLIC_ENABLE_DECISION_MOCK_DIAGNOSTICS;
    } else {
      process.env.NEXT_PUBLIC_ENABLE_DECISION_MOCK_DIAGNOSTICS = originalEnv;
    }
  }
});
