import assert from "node:assert/strict";
import test from "node:test";
import {
  SUBSCRIPTION_PLANS,
  getFeatureEntitlement,
  canUseFeature,
  getStoredPlan,
  saveStoredPlan,
  POSTPAID_PRICING_CONFIG,
} from "../lib/subscriptions";

test("Subscription configuration contains all 4 canonical plans with correct prices", () => {
  assert.equal(SUBSCRIPTION_PLANS.free.id, "free");
  assert.equal(SUBSCRIPTION_PLANS.free.priceMonthly, 0);
  assert.equal(SUBSCRIPTION_PLANS.free.priceFormatted, "0đ");

  assert.equal(SUBSCRIPTION_PLANS.forecast.id, "forecast");
  assert.equal(SUBSCRIPTION_PLANS.forecast.priceMonthly, 299000);
  assert.equal(SUBSCRIPTION_PLANS.forecast.priceFormatted, "299.000đ");
  assert.equal(SUBSCRIPTION_PLANS.forecast.recommended, true);

  assert.equal(SUBSCRIPTION_PLANS.decision.id, "decision");
  assert.equal(SUBSCRIPTION_PLANS.decision.priceMonthly, 599000);
  assert.equal(SUBSCRIPTION_PLANS.decision.priceFormatted, "599.000đ");

  assert.equal(SUBSCRIPTION_PLANS.postpaid.id, "postpaid");
  assert.equal(SUBSCRIPTION_PLANS.postpaid.priceMonthly, 0);
  assert.equal(SUBSCRIPTION_PLANS.postpaid.priceFormatted, "0đ");
  assert.equal(SUBSCRIPTION_PLANS.postpaid.priceUnit, "phí cố định");
  assert.equal(SUBSCRIPTION_PLANS.postpaid.badgeLabel, "LINH HOẠT");
  assert.equal(SUBSCRIPTION_PLANS.postpaid.subPrice, "Tính theo mức sử dụng");
});

test("Postpaid pricing config avoids hardcoding fake unit prices", () => {
  assert.equal(POSTPAID_PRICING_CONFIG.forecastRun, null);
  assert.equal(POSTPAID_PRICING_CONFIG.decisionSession, null);
});

test("Entitlement system correctly represents included, metered, and locked states", () => {
  // Free: base included, advanced locked
  assert.equal(getFeatureEntitlement("free", "excel_import"), "included");
  assert.equal(getFeatureEntitlement("free", "inventory_fefo"), "included");
  assert.equal(getFeatureEntitlement("free", "demand_forecast"), "locked");
  assert.equal(getFeatureEntitlement("free", "ai_decision_chat"), "locked");

  // Forecast: forecast included, decision AI locked
  assert.equal(getFeatureEntitlement("forecast", "excel_import"), "included");
  assert.equal(getFeatureEntitlement("forecast", "demand_forecast"), "included");
  assert.equal(getFeatureEntitlement("forecast", "procurement_planning"), "included");
  assert.equal(getFeatureEntitlement("forecast", "ai_decision_chat"), "locked");

  // Decision: all included
  assert.equal(getFeatureEntitlement("decision", "excel_import"), "included");
  assert.equal(getFeatureEntitlement("decision", "demand_forecast"), "included");
  assert.equal(getFeatureEntitlement("decision", "ai_decision_chat"), "included");

  // Postpaid: base included, advanced metered (pay-per-use)
  assert.equal(getFeatureEntitlement("postpaid", "excel_import"), "included");
  assert.equal(getFeatureEntitlement("postpaid", "inventory_fefo"), "included");
  assert.equal(getFeatureEntitlement("postpaid", "demand_forecast"), "metered");
  assert.equal(getFeatureEntitlement("postpaid", "procurement_planning"), "metered");
  assert.equal(getFeatureEntitlement("postpaid", "ai_decision_chat"), "metered");

  // canUseFeature handles both included and metered
  assert.equal(canUseFeature("postpaid", "demand_forecast"), true);
  assert.equal(canUseFeature("postpaid", "ai_decision_chat"), true);
  assert.equal(canUseFeature("free", "demand_forecast"), false);
});

test("Plan descriptions and features are non-empty and user-friendly", () => {
  for (const [planId, plan] of Object.entries(SUBSCRIPTION_PLANS)) {
    assert.ok(plan.name.length > 0);
    assert.ok(plan.description.length > 0);
    assert.ok(plan.features.length >= 5);
    // Ensure no internal technical jargon like LightGBM or MILP or LLM in user facing copy
    for (const feat of plan.features) {
      assert.doesNotMatch(feat.text, /LightGBM|MILP|CQR|RAG|LLM|token/i);
    }
  }
});
