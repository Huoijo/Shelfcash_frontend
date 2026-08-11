import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { DecisionWorkspace } from "../app/components/DecisionWorkspace.tsx";
import type { BootstrapData, PlanResponse } from "../lib/types.ts";

test("decision workspace exposes a named dialog and preserves zero-valued plan data", () => {
  const plan = {
    recommendations: [
      {
        ingredientId: "ingredient-1",
        ingredient: "Matcha",
        unit: "kg",
        forecastDemand: 0,
        usableStock: 0,
        inbound: 0,
        safetyStock: 0,
        orderQty: 0,
        recommendedQty: 0,
        unitCost: 0,
        cost: 0,
        supplier: "NCC A",
        moq: 0,
        packSize: 0,
        leadTimeDays: 0,
        expiryRiskQty: 0,
        capacityWarning: false,
        status: "Thiếu dữ liệu",
        statusKey: "missing",
        onHand: 0,
        reason: "",
      },
    ],
    ingredientDemand: {},
  } as PlanResponse;
  const markup = renderToStaticMarkup(
    <DecisionWorkspace
      data={{ inventory: [] } as unknown as BootstrapData}
      ingredient="ingredient-1"
      plan={plan}
      onClose={() => undefined}
      onNavigate={() => undefined}
    />,
  );

  assert.match(markup, /role="dialog"/);
  assert.match(markup, /aria-modal="true"/);
  assert.match(markup, /Không gian quyết định/);
  assert.match(markup, /Tồn khả dụng/);
  assert.match(markup, /0 kg/);
  assert.match(markup, /Chi phí dự kiến/);
  assert.match(markup, /0 ₫/);
  assert.match(markup, /Chưa có dữ liệu nhu cầu nguyên liệu/);
  assert.match(markup, /Xem 7 ngày/);
});
