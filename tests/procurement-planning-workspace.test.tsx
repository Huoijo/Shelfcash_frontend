import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ProcurementPlanningWorkspace } from "../app/components/ProcurementPlanningWorkspace";
import { buildProcurementIngredientRows } from "../lib/decision-view";
import type { BootstrapData, DecisionPackage, PlanResponse } from "../lib/types";

const data = {
  store: { id: "store-1", name: "ShelfCash Test" },
  ingredients: [{ ingredientId: "milk", ingredient: "Sữa tươi thanh trùng" }],
  inventory: [{ ingredientId: "milk", ingredient: "Sữa tươi thanh trùng", unit: "L", onHand: 4, inbound: 1, safetyStock: 8, supplier: "Nông trại An Phú", leadTimeDays: 2, moq: 12, packSize: 6, unitCost: 32000 }],
  products: [],
  menu: [],
  supplierConstraints: [{ constraintId: "supplier-1", supplier: "Nông trại An Phú", ingredientId: "milk", active: true, leadTimeDays: 2, moq: 12, unitCost: 32000 }],
  settings: { storeName: "ShelfCash Test", timezone: "Asia/Ho_Chi_Minh" },
} as unknown as BootstrapData;

const decision = {
  decision_run_id: "decision-1",
  status: "completed",
  recommended_strategy: "balanced",
  recommended_plan: { valid: true, items: [{ ingredient_id: "milk", ingredient_name: "Sữa tươi thanh trùng", quantity: 18, supplier_id: "supplier-1", supplier_name: "Nông trại An Phú" }] },
  ingredient_demand: [{ ingredient_id: "milk", ingredient_name: "Sữa tươi thanh trùng", target_date: "2026-08-12", unit: "L", p25: 3, p50: 5, p75: 7 }],
  inventory_risk: { results: [{ scenario_id: "p50_design", summary: { by_key: [{ ingredient_id: "milk", stockout_date: "2026-08-13", shortage_quantity: 10 }] } }] },
  strategies: { balanced: { valid: true, items: [{ ingredient_id: "milk", ingredient_name: "Sữa tươi thanh trùng", quantity: 18, supplier_id: "supplier-1", supplier_name: "Nông trại An Phú", unit_price: 32000 }] } },
} as unknown as DecisionPackage;

test("builds a purchasing row from decision demand and bootstrap inventory without hiding metadata", () => {
  const [row] = buildProcurementIngredientRows(decision, data);
  assert.equal(row.ingredientName, "Sữa tươi thanh trùng");
  assert.equal(row.onHand, 4);
  assert.equal(row.inbound, 1);
  assert.equal(row.p50, 5);
  assert.equal(row.stockoutDate, "2026-08-13");
  assert.equal(row.recommendedQuantity, 18);
  assert.equal(row.supplierName, "Nông trại An Phú");
});

test("renders the executive overview and procurement workspace as distinct scroll scenes", () => {
  const markup = renderToStaticMarkup(
    <ProcurementPlanningWorkspace
      busy={false}
      data={data}
      decision={decision}
      onCreateOrders={async () => []}
      onRunAgain={() => undefined}
      plan={{ status: "completed", recommendations: [{ id: "rec-1", ingredientId: "milk", ingredient: "Sữa tươi thanh trùng", recommendedQty: 18 }], scenarios: [], enrichedInventory: [] } as unknown as PlanResponse}
    />,
  );
  assert.match(markup, /Nguyên liệu/);
  assert.match(markup, /procurement-dashboard-scene/);
  assert.match(markup, /procurement-workspace-scene/);
  assert.match(markup, /Xem danh sách nguyên liệu/);
  assert.match(markup, /Danh sách nguyên liệu/);
  assert.match(markup, /Sữa tươi thanh trùng/);
  assert.match(markup, /Tồn hiện có/);
  assert.match(markup, /Cần xử lý/);
  assert.match(markup, /Nhà cung cấp/);
  assert.match(markup, /Xem đơn nhập nháp/);
  assert.match(markup, /aria-label="Cách xem chi tiết nguyên liệu"/);
  assert.doesNotMatch(markup, /Chọn một nguyên liệu/);
  assert.doesNotMatch(markup, /<aside/);
});

test("shows infeasible backend candidates with their returned service level", () => {
  const infeasibleDecision = {
    ...decision,
    status: "completed_with_no_feasible_recommendation",
    recommended_strategy: null,
    recommended_plan: { valid: false, items: [] },
    strategies: {
      balanced: {
        is_feasible: false,
        items: [],
        critic: {
          findings: [
            {
              code: "EXACT_SIMULATION_SAFETY_FLOOR",
              evidence: { observed: 0.809, required: 0.9 },
            },
          ],
        },
      },
    },
  } as unknown as DecisionPackage;
  const markup = renderToStaticMarkup(
    <ProcurementPlanningWorkspace
      busy={false}
      data={data}
      decision={infeasibleDecision}
      onRunAgain={() => undefined}
      plan={{ status: "completed", recommendations: [], scenarios: [], enrichedInventory: [] } as unknown as PlanResponse}
    />,
  );

  assert.match(markup, /0\/1 phương án đáp ứng toàn bộ/);
  assert.match(markup, /Phương án đã đánh giá/);
  assert.match(markup, /Đáp ứng 80,9% · yêu cầu 90%/);
  assert.match(markup, /Đề xuất phương án/);
  assert.doesNotMatch(markup, /Xem đơn nhập nháp/);
});

test("keeps a sticky workspace header without forcing the page to snap while users scroll", () => {
  const styles = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(styles, /html:has\(.procurement-planning-workspace\) \{[\s\S]*scroll-snap-type: none/);
  assert.doesNotMatch(styles, /scroll-snap-type: y mandatory/);
  assert.match(styles, /\.procurement-workspace-header \{[\s\S]*position: sticky/);
  assert.match(styles, /\.procurement-table-wrap \{[\s\S]*overflow-x: auto;[\s\S]*overflow-y: visible/);
  assert.match(styles, /prefers-reduced-motion: reduce/);
});

test("keeps table labels in the shared table grid and toggles the inspector from the selected row", () => {
  const source = readFileSync(new URL("../app/components/ProcurementPlanningWorkspace.tsx", import.meta.url), "utf8");
  assert.match(source, /<th scope="col">Nguyên liệu<\/th>/);
  assert.match(source, /NCC &amp; TG/);
  assert.match(source, /NCC: Nhà cung cấp · TG: Thời gian giao hàng/);
  assert.doesNotMatch(source, /procurement-table-columns/);
  assert.match(source, /current === ingredientId \? "" : ingredientId/);
  const styles = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(styles, /\.procurement-table-wrap th \{[\s\S]*position: static/);
  assert.match(styles, /\.procurement-header-abbr:hover::after/);
  assert.match(styles, /\.procurement-master-detail:not\(\.has-selection\)[\s\S]*grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(styles, /\.procurement-master-detail:not\(\.has-selection\) \.procurement-inspector[\s\S]*display: none/);
});
