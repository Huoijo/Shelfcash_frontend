"use client";

import { ArrowRight, X } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import type {
  BootstrapData,
  IngredientDemandResult,
  PlanResponse,
  Recommendation,
} from "../../lib/types";
import {
  Button,
  Notice,
  SectionHeading,
  formatQuantity,
  formatVnd,
} from "./ui";

type WorkspaceDestination = "future" | "simulator" | "plan" | "orders";

function matchesIngredient(
  value: string,
  ingredient?: { ingredientId?: string; ingredient?: string },
): boolean {
  return Boolean(
    value &&
      (ingredient?.ingredientId === value || ingredient?.ingredient === value),
  );
}

function decisionItem(
  plan: PlanResponse,
  ingredient: string,
): Recommendation | undefined {
  return plan.recommendations.find((item) => matchesIngredient(ingredient, item));
}

function demandItem(
  plan: PlanResponse,
  ingredient: string,
): IngredientDemandResult | undefined {
  return Object.values(plan.ingredientDemand).find((item) =>
    matchesIngredient(ingredient, item),
  );
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="decision-workspace-metric">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

export function DecisionWorkspace({
  data,
  plan,
  ingredient,
  onClose,
  onNavigate,
}: {
  data: BootstrapData;
  plan: PlanResponse;
  ingredient: string;
  onClose: () => void;
  onNavigate: (destination: WorkspaceDestination, ingredient: string) => void;
}) {
  const closeButton = useRef<HTMLButtonElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const recommendation = useMemo(
    () => decisionItem(plan, ingredient),
    [ingredient, plan],
  );
  const demand = useMemo(() => demandItem(plan, ingredient), [ingredient, plan]);
  const inventory = data.inventory.find((item) => matchesIngredient(ingredient, item));
  const itemName = recommendation?.ingredient || demand?.ingredient || inventory?.ingredient || ingredient;

  useEffect(() => {
    opener.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    closeButton.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const drawer = document.getElementById("decision-workspace");
      const focusable = Array.from(
        drawer?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      opener.current?.focus();
    };
  }, [onClose]);

  const go = (destination: WorkspaceDestination) => {
    onNavigate(destination, ingredient);
    onClose();
  };

  return (
    <div className="decision-workspace-layer">
      <button
        aria-label="Đóng không gian quyết định"
        className="decision-workspace-backdrop"
        onClick={onClose}
        type="button"
      />
      <aside
        aria-labelledby="decision-workspace-title"
        aria-modal="true"
        className="decision-workspace"
        id="decision-workspace"
        role="dialog"
      >
        <header className="decision-workspace-header">
          <div>
            <span className="eyebrow">Không gian quyết định</span>
            <h2 id="decision-workspace-title">{itemName}</h2>
          </div>
          <button
            aria-label="Đóng không gian quyết định"
            className="decision-workspace-close"
            onClick={onClose}
            ref={closeButton}
            type="button"
          >
            <X aria-hidden="true" size={20} />
          </button>
        </header>

        {recommendation ? (
          <>
            <dl className="decision-workspace-metrics">
              <MetricRow
                label="Nhu cầu kịch bản"
                value={formatQuantity(recommendation.forecastDemand, recommendation.unit)}
              />
              <MetricRow
                label="Tồn khả dụng"
                value={formatQuantity(recommendation.usableStock, recommendation.unit)}
              />
              <MetricRow
                label="Hàng đang về"
                value={formatQuantity(recommendation.inbound, recommendation.unit)}
              />
              {recommendation.configuredSafetyStock != null ? (
                <MetricRow
                  label="Tồn kho an toàn"
                  value={formatQuantity(recommendation.configuredSafetyStock, recommendation.unit)}
                />
              ) : null}
              <MetricRow
                label="Đề xuất đặt"
                value={formatQuantity(recommendation.orderQty, recommendation.unit)}
              />
              <MetricRow label="Chi phí dự kiến" value={formatVnd(recommendation.cost)} />
              {recommendation.moq > 0 ? (
                <MetricRow label="Đặt tối thiểu" value={formatQuantity(recommendation.moq, recommendation.unit)} />
              ) : null}
              {recommendation.packSize > 0 ? (
                <MetricRow label="Quy cách" value={formatQuantity(recommendation.packSize, recommendation.unit)} />
              ) : null}
              {recommendation.leadTimeDays > 0 ? (
                <MetricRow label="Thời gian giao" value={`${recommendation.leadTimeDays.toLocaleString("vi-VN")} ngày`} />
              ) : null}
            </dl>

            <SectionHeading title="Vì sao đề xuất?" />
            <ol className="decision-workspace-explanation">
              <li>
                <strong>Dự báo sản phẩm → công thức</strong>
                <span>
                  {demand?.contributions.length
                    ? `${demand.contributions.length} sản phẩm có đóng góp vào nhu cầu nguyên liệu này.`
                    : "Chưa có dữ liệu đóng góp sản phẩm trong kết quả hiện tại."}
                </span>
              </li>
              <li>
                <strong>Nhu cầu nguyên liệu</strong>
                <span>
                  {demand
                    ? formatQuantity(demand.totals.p50, demand.unit)
                    : "Chưa có dữ liệu nhu cầu nguyên liệu."}
                </span>
              </li>
              <li>
                <strong>Tồn và hàng đang về</strong>
                <span>{formatQuantity(recommendation.usableStock, recommendation.unit)} tồn khả dụng · {formatQuantity(recommendation.inbound, recommendation.unit)} đang về.</span>
              </li>
              <li>
                <strong>Ràng buộc đặt hàng</strong>
                <span>{recommendation.reason || "Chưa có diễn giải cho đề xuất này."}</span>
              </li>
              <li>
                <strong>Phương án đề xuất</strong>
                <span>{formatQuantity(recommendation.orderQty, recommendation.unit)} từ {recommendation.supplier || "nhà cung cấp chưa xác định"}.</span>
              </li>
            </ol>
            {recommendation.warnings?.length ? (
              <Notice tone="warning">{recommendation.warnings.join(" · ")}</Notice>
            ) : null}
          </>
        ) : (
          <Notice tone="info">
            Chưa có đề xuất nhập hàng cho nguyên liệu này trong lượt kế hoạch hiện tại. Bạn vẫn có thể xem dữ liệu 7 ngày hoặc chạy mô phỏng mới.
          </Notice>
        )}

        <footer className="decision-workspace-actions">
          <Button onClick={() => go("future")}>
            Xem 7 ngày <ArrowRight aria-hidden="true" size={16} />
          </Button>
          <Button variant="secondary" onClick={() => go("simulator")}>
            Mô phỏng
          </Button>
          <Button variant="secondary" onClick={() => go("plan")}>
            Kế hoạch nhập
          </Button>
          <Button variant="secondary" onClick={() => go("orders")}>
            Đơn nháp
          </Button>
        </footer>
      </aside>
    </div>
  );
}
