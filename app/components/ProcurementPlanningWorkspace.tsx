"use client";

/* The row keeps its visual/announced selected state while behaving as one keyboard button. */
/* eslint-disable jsx-a11y/role-supports-aria-props */

import {
  ArrowDown,
  ArrowRight,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  adaptDecisionRunView,
  buildProcurementIngredientRows,
  type ProcurementIngredientRowView,
} from "../../lib/decision-view";
import type {
  BootstrapData,
  DecisionPackage,
  PlanResponse,
  Recommendation,
} from "../../lib/types";
import { DemandChart } from "./DemandChart";
import {
  DemandExplanationDialog,
  noFeasibleDecision,
} from "./ProcurementDecisionWorkspace";
import {
  Button,
  GuidanceHint,
  Notice,
  formatDate,
  formatQuantity,
  formatVnd,
} from "./ui";

type Filter = "all" | "risk" | "expiry";

function serviceLevel(value: number | null): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  return `${(value * 100).toLocaleString("vi-VN", {
    maximumFractionDigits: 1,
  })}%`;
}

function quantity(value: number | null | undefined, unit = ""): string {
  return value == null ? "Chưa có dữ liệu" : formatQuantity(value, unit);
}

function dateWindow(
  dates: string[],
  asOfDate?: string | null,
  horizon?: number | null,
): string {
  if (dates.length)
    return `${formatDate(dates[0])} – ${formatDate(dates.at(-1) ?? dates[0])}`;
  if (asOfDate && horizon) return `${formatDate(asOfDate)} · ${horizon} ngày`;
  return "Chưa có kỳ lập kế hoạch";
}

function severity(
  row: ProcurementIngredientRowView,
): "Cần xử lý" | "Cần theo dõi" | "Ổn định" {
  if (row.stockoutDate || (row.shortageQuantity ?? 0) > 0) return "Cần xử lý";
  if (row.recommendedQuantity != null) return "Cần theo dõi";
  return "Ổn định";
}

function severityClass(row: ProcurementIngredientRowView): string {
  return severity(row) === "Cần xử lý"
    ? "critical"
    : severity(row) === "Cần theo dõi"
      ? "watch"
      : "stable";
}

function supplierTerms(data: BootstrapData, ingredientId: string) {
  return data.supplierConstraints.filter(
    (item) => item.ingredientId === ingredientId && item.active !== false,
  );
}

function ProcurementReviewDialog({
  rows,
  onClose,
  onCreate,
  creating,
}: {
  rows: ProcurementIngredientRowView[];
  onClose: () => void;
  onCreate?: () => void;
  creating: boolean;
}) {
  const closeButton = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLElement>(null);
  useEffect(() => {
    closeButton.current?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab") return;
      const buttons = Array.from(
        dialog.current?.querySelectorAll<HTMLButtonElement>(
          "button:not(:disabled)",
        ) ?? [],
      );
      const first = buttons[0];
      const last = buttons.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      }
      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", keydown);
    return () => document.removeEventListener("keydown", keydown);
  }, [onClose]);

  const groups = Array.from(
    rows
      .reduce((map, row) => {
        const name = row.supplierName || "Nhà cung cấp chưa xác định";
        map.set(name, [...(map.get(name) ?? []), row]);
        return map;
      }, new Map<string, ProcurementIngredientRowView[]>())
      .entries(),
  );
  const total = rows.reduce((sum, row) => sum + (row.purchaseCost ?? 0), 0);
  const hasCost = rows.some((row) => row.purchaseCost != null);

  return (
    <div className="procurement-review-layer">
      <button
        aria-label="Đóng xem trước đơn nhập"
        className="procurement-review-backdrop"
        onClick={onClose}
        type="button"
      />
      <section
        aria-labelledby="procurement-review-title"
        aria-modal="true"
        className="procurement-review-dialog"
        ref={dialog}
        role="dialog"
      >
        <header>
          <div>
            <span className="eyebrow">Đơn nhập nháp</span>
            <h2 id="procurement-review-title">
              Xác nhận tạo đơn nhập{" "}
              <GuidanceHint
                content="Số lượng đã được điều chỉnh theo mức đặt tối thiểu và quy cách đóng gói."
                label="Cách tính số lượng đặt"
              />
            </h2>
          </div>
          <button
            aria-label="Đóng xem trước đơn nhập"
            onClick={onClose}
            ref={closeButton}
            type="button"
          >
            <X aria-hidden="true" size={20} />
          </button>
        </header>
        <div className="procurement-review-body">
          {groups.map(([supplier, lines]) => (
            <section key={supplier}>
              <h3>{supplier}</h3>
              <ul>
                {lines.map((line) => (
                  <li key={line.ingredientId}>
                    <span>{line.ingredientName}</span>
                    <strong>
                      {quantity(line.recommendedQuantity, line.unit)}
                    </strong>
                    <small>
                      {line.purchaseCost == null
                        ? "Chưa có chi phí"
                        : formatVnd(line.purchaseCost)}
                    </small>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          <dl>
            <div>
              <dt>Tổng chi phí dự kiến</dt>
              <dd>{hasCost ? formatVnd(total) : "Chưa có dữ liệu"}</dd>
            </div>
            <div>
              <dt>Số đơn sẽ tạo</dt>
              <dd>{groups.length}</dd>
            </div>
          </dl>
          <Notice tone="info">
            Ngân sách được giữ khi xác nhận đơn và ghi nhận chi khi nhận hàng.
          </Notice>
        </div>
        <footer>
          <Button onClick={onClose} variant="secondary">
            Hủy
          </Button>
          {onCreate ? (
            <Button busy={creating} onClick={onCreate}>
              Tạo đơn
            </Button>
          ) : (
            <Button disabled>Chưa thể tạo đơn</Button>
          )}
        </footer>
      </section>
    </div>
  );
}

export function ProcurementPlanningWorkspace({
  data,
  decision,
  plan,
  busy,
  onRunAgain,
  onCreateOrders,
}: {
  data: BootstrapData;
  decision: DecisionPackage;
  plan: PlanResponse;
  busy: boolean;
  onRunAgain: () => void;
  onCreateOrders?: (recommendations: Recommendation[]) => Promise<unknown>;
}) {
  const workspaceRef = useRef<HTMLElement>(null);
  const view = useMemo(
    () => adaptDecisionRunView(decision, data),
    [decision, data],
  );
  const defaultStrategyKey =
    decision.recommended_strategy ??
    view.strategies.find((strategy) => strategy.items.length > 0)?.key ??
    view.strategies[0]?.key ??
    "";
  const [selectedStrategyKey, setSelectedStrategyKey] = useState("");
  const activeStrategyKey = view.strategies.some(
    (strategy) => strategy.key === selectedStrategyKey,
  )
    ? selectedStrategyKey
    : defaultStrategyKey;
  const activeStrategy = view.strategies.find(
    (strategy) => strategy.key === activeStrategyKey,
  );
  const allRows = useMemo(
    () => buildProcurementIngredientRows(decision, data, activeStrategyKey),
    [activeStrategyKey, decision, data],
  );
  const planRows = useMemo(
    () =>
      (activeStrategy?.items ?? []).map((item) => {
        const context = allRows.find(
          (row) => row.ingredientId === item.ingredientId,
        );
        return {
          ...(context ?? {
            ingredientId: item.ingredientId,
            ingredientName: item.ingredientName,
            unit: item.unit,
            onHand: null,
            inbound: null,
            safetyStock: null,
            supplierName: "",
            leadTimeDays: null,
            p25: null,
            p50: null,
            p75: null,
            stockoutDate: "",
            shortageQuantity: null,
            recommendedQuantity: null,
            packCount: null,
            packSize: null,
            unitPrice: null,
            purchaseCost: null,
            feasible: activeStrategy?.feasible === true,
          }),
          ingredientName: item.ingredientName,
          unit: item.unit || context?.unit || "",
          supplierName: item.supplierName || context?.supplierName || "",
          recommendedQuantity: item.orderQuantity,
          packCount: item.packCount,
          packSize: item.packSize,
          unitPrice: item.unitPrice,
          purchaseCost: item.purchaseCost,
          feasible: activeStrategy?.feasible === true,
          orderDate: item.orderDate,
          arrivalDate: item.arrivalDate,
          emergency: item.emergency,
        };
      }),
    [activeStrategy, allRows],
  );
  const [contextFilter, setContextFilter] = useState<Filter>("all");
  const [contextQuery, setContextQuery] = useState("");
  const [supplierFilter, setSupplierFilter] = useState("");
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [selectedContextId, setSelectedContextId] = useState("");
  const [contextOpen, setContextOpen] = useState(false);
  const [explaining, setExplaining] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState("");
  const noFeasible = noFeasibleDecision(decision);
  const feasible =
    !noFeasible &&
    decision.status === "completed" &&
    Boolean(
      decision.recommended_strategy &&
      decision.recommended_plan?.valid &&
      decision.recommended_plan.items?.length,
    );
  const recommendedStrategy =
    view.strategies.find(
      (strategy) => strategy.key === decision.recommended_strategy,
    ) ?? view.strategies.find((strategy) => strategy.feasible);
  const assessedStrategyCount = view.strategies.length;
  const feasibleStrategyCount = view.strategies.filter(
    (strategy) => strategy.feasible === true,
  ).length;
  const urgentRows = allRows.filter((row) => severity(row) === "Cần xử lý");
  const earliestStockout =
    urgentRows
      .map((row) => row.stockoutDate)
      .filter(Boolean)
      .sort()[0] || "";
  const supplierOptions = Array.from(
    new Set(allRows.map((row) => row.supplierName).filter(Boolean)),
  ).sort((a, b) => a.localeCompare(b, "vi"));
  const contextRows = allRows.filter((row) => {
    const needle = contextQuery.trim().toLocaleLowerCase("vi");
    if (
      needle &&
      !`${row.ingredientName} ${row.supplierName}`
        .toLocaleLowerCase("vi")
        .includes(needle)
    )
      return false;
    if (supplierFilter && row.supplierName !== supplierFilter) return false;
    if (contextFilter === "risk")
      return Boolean(row.stockoutDate || (row.shortageQuantity ?? 0) > 0);
    if (contextFilter === "expiry") return false;
    return true;
  });
  const selectedPlan =
    planRows.find((row) => row.ingredientId === selectedPlanId) ?? null;
  const selectedContext =
    allRows.find((row) => row.ingredientId === selectedContextId) ?? null;
  const selectedDemand = selectedContext
    ? view.demand.filter((item) => item.ingredientId === selectedContext.ingredientId)
    : [];
  const selectedRisk = selectedContext
    ? view.risks.find((item) => item.ingredientId === selectedContext.ingredientId)
    : undefined;
  const eligibleRecommendations = plan.recommendations.filter((line) =>
    allRows.some(
      (row) =>
        row.ingredientId === line.ingredientId &&
        row.recommendedQuantity != null,
    ),
  );
  const canCreate =
    feasible &&
    activeStrategy?.feasible === true &&
    activeStrategy.key === decision.recommended_strategy &&
    eligibleRecommendations.length > 0 &&
    Boolean(onCreateOrders);

  function toggleContextSelected(ingredientId: string) {
    setSelectedContextId((current) =>
      current === ingredientId ? "" : ingredientId,
    );
  }

  function togglePlanSelected(ingredientId: string) {
    setSelectedPlanId((current) => (current === ingredientId ? "" : ingredientId));
  }

  function selectStrategy(strategyKey: string) {
    setSelectedStrategyKey(strategyKey);
    setSelectedPlanId("");
    setExplaining(false);
  }

  function scrollToWorkspace() {
    const reduceMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    workspaceRef.current?.scrollIntoView({
      behavior: reduceMotion ? "auto" : "smooth",
      block: "start",
    });
  }

  async function createOrders() {
    if (!onCreateOrders || !canCreate) return;
    setCreating(true);
    setMessage("");
    try {
      await onCreateOrders(eligibleRecommendations);
      setReviewOpen(false);
      setMessage("Đã tạo đơn nhập nháp theo nhà cung cấp.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Không thể tạo đơn nhập.",
      );
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="procurement-planning-workspace">
      <section
        className="procurement-dashboard-scene"
        aria-labelledby="procurement-page-title"
      >
        <header className="procurement-planning-header">
          <div>
            <span className="eyebrow">Quyết định mua hàng</span>
            <h1 id="procurement-page-title">Kế hoạch nhập hàng</h1>
            <span className="page-header-context">
              {data.settings.storeName} ·{" "}
              {dateWindow(
                view.dates,
                decision.as_of_date,
                decision.horizon_days,
              )}
            </span>
          </div>
          <div className="procurement-planning-actions">
            <Button busy={busy} onClick={onRunAgain} variant="secondary">
              Tính lại
            </Button>
          </div>
        </header>
        <ol
          aria-label="Trạng thái lập kế hoạch"
          className="procurement-planning-status"
        >
          <li>
            <strong>Dự báo bán hàng</strong>
            <span>
              {decision.status === "queued" || decision.status === "running"
                ? "Đang xử lý"
                : "Hoàn tất"}
            </span>
          </li>
          <li>
            <strong>Nhu cầu nguyên liệu</strong>
            <span>
              {view.demand.length
                ? `Đã tính · ${new Set(view.demand.map((item) => item.ingredientId)).size} nguyên liệu · ${view.dates.length} ngày`
                : "Chưa có dữ liệu"}
            </span>
          </li>
          <li className={noFeasible ? "warning" : "success"}>
            <strong>Kế hoạch nhập</strong>
            <span>
              {assessedStrategyCount
                ? `${feasibleStrategyCount}/${assessedStrategyCount} phương án đáp ứng toàn bộ`
                : feasible
                  ? "Khả thi"
                  : "Đang chờ xác nhận"}
            </span>
          </li>
        </ol>
        <div className="procurement-highlights" aria-label="Điểm cần lưu ý">
          <article className={urgentRows.length ? "attention" : "steady"}>
            <span>Nguyên liệu cần xử lý</span>
            <strong>
              {urgentRows.length
                ? `${urgentRows.length} nguyên liệu`
                : "Chưa ghi nhận"}
            </strong>
          </article>
          <article className={earliestStockout ? "attention" : "steady"}>
            <span>Nguy cơ thiếu gần nhất · P50</span>
            <strong>
              {earliestStockout
                ? formatDate(earliestStockout)
                : "Chưa có dữ liệu"}
            </strong>
          </article>
          <article className={feasibleStrategyCount ? "steady" : "attention"}>
            <span>Phương án đáp ứng toàn bộ</span>
            <strong>
              {assessedStrategyCount
                ? `${feasibleStrategyCount}/${assessedStrategyCount} phương án`
                : "Backend chưa trả phương án"}
            </strong>
            <small>
              {feasibleStrategyCount
                ? `${activeStrategy?.itemCount ?? 0} dòng trong phương án đang xem${recommendedStrategy?.purchaseCost == null ? "" : ` · ${formatVnd(recommendedStrategy.purchaseCost)}`}`
                : view.blockers[0]?.title ||
                  "Dự báo và nhu cầu nguyên liệu đã tính nhưng chưa có phương án đáp ứng toàn bộ điều kiện."}
            </small>
          </article>
        </div>
        {noFeasible ? (
          <Notice tone="warning" id="procurement-constraints">
            <strong>
              Chưa tìm được phương án nhập đáp ứng toàn bộ ràng buộc.
            </strong>{" "}
            Các phương án backend đã thử vẫn được hiển thị bên dưới, kèm mức đáp
            ứng nếu backend có trả chỉ số này.
          </Notice>
        ) : null}
        {view.strategies.length ? (
          <section
            aria-labelledby="procurement-strategy-title"
            className="procurement-strategy-review"
          >
            <header>
              <div>
                <h2 id="procurement-strategy-title">Phương án đã đánh giá</h2>
                <p>
                  Chọn một phương án để xem các dòng đề xuất. Phương án chưa đáp
                  ứng toàn bộ chỉ để đối chiếu, không thể tạo đơn.
                </p>
              </div>
              {activeStrategy ? (
                <span
                  className={
                    activeStrategy.feasible
                      ? "procurement-strategy-status is-feasible"
                      : "procurement-strategy-status is-infeasible"
                  }
                >
                  {activeStrategy.feasible
                    ? "Đáp ứng toàn bộ"
                    : "Chưa đáp ứng toàn bộ"}
                </span>
              ) : null}
            </header>
            <div className="procurement-strategy-options">
              {view.strategies.map((strategy) => {
                const observed = serviceLevel(strategy.observedFillRate);
                const required = serviceLevel(strategy.requiredFillRate);
                const isActive = strategy.key === activeStrategyKey;
                return (
                  <button
                    aria-pressed={isActive}
                    className={`procurement-strategy-option ${isActive ? "is-active" : ""} ${strategy.feasible ? "is-feasible" : "is-infeasible"}`}
                    key={strategy.key}
                    onClick={() => selectStrategy(strategy.key)}
                    type="button"
                  >
                    <span>{strategy.label}</span>
                    <strong>
                      {strategy.feasible === true
                        ? "Đáp ứng toàn bộ ràng buộc"
                        : strategy.feasible === false
                          ? observed
                            ? `Đáp ứng ${observed}${required ? ` · yêu cầu ${required}` : ""}`
                            : "Chưa có dữ liệu đánh giá mức đáp ứng"
                          : "Chưa có dữ liệu đánh giá mức đáp ứng"}
                    </strong>
                    <small>
                      {strategy.itemCount
                        ? `${strategy.itemCount} dòng đề xuất${strategy.purchaseCost == null ? "" : ` · ${formatVnd(strategy.purchaseCost)}`}`
                        : "Chưa có dòng đề xuất"}
                    </small>
                  </button>
                );
              })}
            </div>
          </section>
        ) : null}
        {activeStrategy ? (
          <section
            aria-labelledby="procurement-plan-focus-title"
            className={`procurement-plan-focus ${activeStrategy.feasible === true ? "is-feasible" : "is-simulated"}`}
            key={activeStrategyKey}
          >
            <div className="procurement-plan-focus-copy">
              <span className="eyebrow">Phương án đang xem</span>
              <h2 id="procurement-plan-focus-title">{activeStrategy.label}</h2>
              <p className="procurement-plan-focus-status">
                {activeStrategy.feasible === true
                  ? "Đáp ứng toàn bộ ràng buộc"
                  : "Phương án mô phỏng — chưa đủ điều kiện tạo đơn"}
              </p>
              <div className="procurement-plan-focus-metrics">
                {activeStrategy.itemCount ? (
                  <span>
                    {activeStrategy.feasible === true
                      ? `${activeStrategy.itemCount} nguyên liệu cần nhập`
                      : `${activeStrategy.itemCount} dòng mua tham khảo`}
                  </span>
                ) : null}
                {activeStrategy.purchaseCost != null ? (
                  <span>{formatVnd(activeStrategy.purchaseCost)} chi phí dự kiến</span>
                ) : null}
                {new Set(planRows.map((row) => row.supplierName).filter(Boolean)).size ? (
                  <span>{new Set(planRows.map((row) => row.supplierName).filter(Boolean)).size} nhà cung cấp</span>
                ) : null}
                {planRows.map((row) => row.arrivalDate).filter(Boolean).sort().length ? (
                  <span>
                    Giao dự kiến {dateWindow(planRows.map((row) => row.arrivalDate).filter(Boolean))}
                  </span>
                ) : null}
                {activeStrategy.feasible === false && serviceLevel(activeStrategy.observedFillRate) ? (
                  <span>
                    Mức đáp ứng thấp nhất: {serviceLevel(activeStrategy.observedFillRate)}
                    {serviceLevel(activeStrategy.requiredFillRate)
                      ? ` · yêu cầu ${serviceLevel(activeStrategy.requiredFillRate)}`
                      : ""}
                  </span>
                ) : null}
              </div>
            </div>
            {activeStrategy.feasible === true && canCreate ? (
              <Button onClick={() => setReviewOpen(true)}>
                Xem đơn nhập nháp · {eligibleRecommendations.length} dòng
              </Button>
            ) : activeStrategy.feasible === false && view.blockers.length ? (
              <a className="button secondary" href="#procurement-constraints">
                Xem lý do chưa khả thi
              </a>
            ) : null}
          </section>
        ) : null}
        {message ? (
          <Notice tone={message.startsWith("Đã tạo") ? "success" : "error"}>
            {message}
          </Notice>
        ) : null}
        <button
          className="procurement-scene-link"
          onClick={scrollToWorkspace}
          type="button"
        >
          <span>Xem dòng nhập đề xuất</span>
          <ArrowDown aria-hidden="true" size={19} />
        </button>
      </section>

      <section
        className="procurement-workspace-scene"
        id="procurement-workspace"
        ref={workspaceRef}
        aria-labelledby="procurement-workspace-title"
      >
        <section className="procurement-plan-lines" aria-labelledby="procurement-plan-lines-title" key={activeStrategyKey}>
          <header className="procurement-section-heading">
            <div>
              <span className="eyebrow">Kế hoạch đề xuất</span>
              <h2 id="procurement-plan-lines-title">Dòng nhập đề xuất</h2>
              <p>Chỉ hiển thị các nguyên liệu thuộc phương án {activeStrategy?.label ?? "đang chọn"}.</p>
            </div>
          </header>
          {planRows.length ? (
            <div className="procurement-plan-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Nguyên liệu</th>
                    <th scope="col">Nhà cung cấp</th>
                    <th scope="col">Cần mua</th>
                    <th scope="col">Đơn giá</th>
                    <th scope="col">Thành tiền</th>
                    <th scope="col">Đặt hàng</th>
                    <th scope="col">Dự kiến đến</th>
                    <th scope="col">Trạng thái</th>
                  </tr>
                </thead>
                <tbody>
                  {planRows.map((row) => (
                    <tr
                      aria-selected={selectedPlan?.ingredientId === row.ingredientId}
                      className={selectedPlan?.ingredientId === row.ingredientId ? "selected" : ""}
                      key={row.ingredientId}
                      onClick={() => togglePlanSelected(row.ingredientId)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          togglePlanSelected(row.ingredientId);
                        }
                      }}
                      role="button"
                      tabIndex={0}
                    >
                      <td><strong>{row.ingredientName}</strong><small>{row.unit || "Đơn vị chưa xác định"}</small>{row.emergency ? <span className="procurement-severity critical">Ưu tiên khẩn</span> : null}</td>
                      <td>{row.supplierName || "Chưa có nhà cung cấp được chọn"}</td>
                      <td>{quantity(row.recommendedQuantity, row.unit)}{row.packCount != null ? <small>{`${row.packCount} gói${row.packSize == null ? "" : ` × ${formatQuantity(row.packSize, row.unit)}`}`}</small> : null}</td>
                      <td>{row.unitPrice == null ? "—" : `${formatVnd(row.unitPrice)} / ${row.unit || "đơn vị"}`}</td>
                      <td>{row.purchaseCost == null ? "—" : formatVnd(row.purchaseCost)}</td>
                      <td>{row.orderDate ? formatDate(row.orderDate) : "—"}</td>
                      <td>{row.arrivalDate ? formatDate(row.arrivalDate) : "—"}</td>
                      <td><span className={`procurement-plan-state ${row.feasible ? "is-feasible" : "is-simulated"}`}>{row.feasible ? "Khả thi" : "Mô phỏng"}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Notice tone="info">Phương án này chưa có dòng nhập được đề xuất.</Notice>
          )}
          {selectedPlan ? (
            <article className="procurement-plan-line-detail" aria-live="polite">
              <div>
                <span className="eyebrow">Chi tiết dòng nhập</span>
                <h3>Vì sao cần mua {selectedPlan.ingredientName}?</h3>
              </div>
              <dl>
                <div><dt>Tồn hiện có</dt><dd>{quantity(selectedPlan.onHand, selectedPlan.unit)}</dd></div>
                <div><dt>Nhu cầu P50</dt><dd>{quantity(selectedPlan.p50, selectedPlan.unit)}</dd></div>
                <div><dt>Khoảng P25–P75</dt><dd>{quantity(selectedPlan.p25, selectedPlan.unit)} – {quantity(selectedPlan.p75, selectedPlan.unit)}</dd></div>
                <div><dt>Hàng sắp về</dt><dd>{quantity(selectedPlan.inbound, selectedPlan.unit)}</dd></div>
                {selectedPlan.packSize != null ? <div><dt>Quy cách gói</dt><dd>{formatQuantity(selectedPlan.packSize, selectedPlan.unit)}</dd></div> : null}
              </dl>
            </article>
          ) : null}
        </section>
        <section className="procurement-context" aria-labelledby="procurement-workspace-title">
        <header className="procurement-workspace-header">
          <div>
          <span className="eyebrow">Kiểm chứng</span>
          <h2 id="procurement-workspace-title">
            Bối cảnh nguyên liệu{" "}
            <GuidanceHint
              content="Chọn một dòng để xem nhu cầu, rủi ro tồn kho và điều kiện nhà cung cấp; việc này không thay đổi kế hoạch đề xuất."
              label="Cách xem chi tiết nguyên liệu"
            />
          </h2>
          <p>Xem tồn kho, nhu cầu và rủi ro của toàn bộ nguyên liệu.</p>
          </div>
          <Button aria-expanded={contextOpen} onClick={() => setContextOpen((open) => !open)} variant="secondary">
            {contextOpen ? "Ẩn bối cảnh" : `Xem toàn bộ nguyên liệu · ${allRows.length}`}
          </Button>
        </header>
        {contextOpen ? <>
          <div className="procurement-table-toolbar">
            <div className="procurement-search">
              <Search aria-hidden="true" size={16} />
              <label>
                <span className="sr-only">
                  Tìm nguyên liệu hoặc nhà cung cấp
                </span>
                <input
                  onChange={(event) => setContextQuery(event.target.value)}
                  placeholder="Tìm nguyên liệu / nhà cung cấp"
                  value={contextQuery}
                />
              </label>
            </div>
            <div className="procurement-filter-controls">
              <SlidersHorizontal aria-hidden="true" size={16} />
              <label>
                <span className="sr-only">Lọc nguyên liệu</span>
                <select
                  onChange={(event) => setContextFilter(event.target.value as Filter)}
                  value={contextFilter}
                >
                  <option value="all">Tất cả</option>
                  <option value="risk">Nguy cơ thiếu</option>
                  <option value="expiry" disabled>
                    Sắp hết hạn
                  </option>
                </select>
              </label>
              <label>
                <span className="sr-only">Lọc nhà cung cấp</span>
                <select
                  onChange={(event) => setSupplierFilter(event.target.value)}
                  value={supplierFilter}
                >
                  <option value="">Nhà cung cấp</option>
                  {supplierOptions.map((supplier) => (
                    <option key={supplier} value={supplier}>
                      {supplier}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
          {contextFilter !== "all" ? (
            <div className="procurement-filter-chip">
              <span>
                {contextFilter === "risk"
                    ? "Nguy cơ thiếu"
                    : "Sắp hết hạn"}
              </span>
              <button
                aria-label="Xóa bộ lọc"
                onClick={() => setContextFilter("all")}
                type="button"
              >
                ×
              </button>
            </div>
          ) : null}
        <div
          className={`procurement-master-detail${selectedContext ? " has-selection" : ""}`}
        >
          <section
            className="procurement-table-panel"
            aria-label="Bảng bối cảnh nguyên liệu"
          >
            <div className="procurement-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Nguyên liệu</th>
                    <th scope="col">Tồn hiện có</th>
                    <th scope="col">Hàng sắp về</th>
                    <th scope="col">Nhu cầu kỳ này</th>
                    <th scope="col">Hạn / rủi ro</th>
                  </tr>
                </thead>
                <tbody>
                  {contextRows.map((row) => (
                    <tr
                      aria-selected={
                        selectedContext?.ingredientId === row.ingredientId
                      }
                      className={
                        selectedContext?.ingredientId === row.ingredientId
                          ? "selected"
                          : ""
                      }
                      key={row.ingredientId}
                      onClick={() => toggleContextSelected(row.ingredientId)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          toggleContextSelected(row.ingredientId);
                        }
                      }}
                      role="button"
                      tabIndex={0}
                    >
                      <td>
                        <strong title={row.ingredientName}>
                          {row.ingredientName}
                        </strong>
                        <small>{row.unit || "Đơn vị chưa xác định"}</small>
                        <span
                          className={`procurement-severity ${severityClass(row)}`}
                        >
                          {severity(row)}
                        </span>
                      </td>
                      <td>
                        {quantity(row.onHand, row.unit)}
                        {row.safetyStock == null ? null : (
                          <small>
                            Tối thiểu{" "}
                            {formatQuantity(row.safetyStock, row.unit)}
                          </small>
                        )}
                      </td>
                      <td>{quantity(row.inbound, row.unit)}</td>
                      <td>
                        {quantity(row.p50, row.unit)}
                        <small>
                          {quantity(row.p25, row.unit)} –{" "}
                          {quantity(row.p75, row.unit)}
                        </small>
                      </td>
                      <td>
                        {row.stockoutDate ? `Nguy cơ thiếu từ ${formatDate(row.stockoutDate)}` : row.shortageQuantity != null ? `Thiếu dự kiến ${formatQuantity(row.shortageQuantity, row.unit)}` : "Chưa ghi nhận rủi ro"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!contextRows.length ? (
              <Notice tone="info">
                Không có nguyên liệu khớp với bộ lọc hiện tại.
              </Notice>
            ) : null}
          </section>
          {selectedContext ? (
            <aside
              aria-labelledby="ingredient-inspector-title"
              className="procurement-inspector is-open"
            >
              <header>
                <div>
                  <span className="eyebrow">Chi tiết nguyên liệu</span>
                  <h2 id="ingredient-inspector-title">
                    {selectedContext.ingredientName}
                  </h2>
                  <p>Đơn vị: {selectedContext.unit || "chưa xác định"}</p>
                </div>
                <span
                  className={`procurement-severity ${severityClass(selectedContext)}`}
                >
                  {severity(selectedContext)}
                </span>
              </header>
              <dl className="procurement-inspector-metrics">
                <div>
                  <dt>Tồn hiện có</dt>
                  <dd>{quantity(selectedContext.onHand, selectedContext.unit)}</dd>
                </div>
                <div>
                  <dt>Hàng sắp về</dt>
                  <dd>{quantity(selectedContext.inbound, selectedContext.unit)}</dd>
                </div>
                <div>
                  <dt>Nhu cầu P50 kỳ này</dt>
                  <dd>{quantity(selectedContext.p50, selectedContext.unit)}</dd>
                </div>
                <div>
                  <dt>Khoảng dự báo</dt>
                  <dd>
                    {quantity(selectedContext.p25, selectedContext.unit)} –{" "}
                    {quantity(selectedContext.p75, selectedContext.unit)}
                  </dd>
                </div>
                {selectedRisk?.shortageQuantity != null ? (
                  <div>
                    <dt>Thiếu dự kiến</dt>
                    <dd>
                      {formatQuantity(
                        selectedRisk.shortageQuantity,
                        selectedContext.unit,
                      )}
                    </dd>
                  </div>
                ) : null}
                {selectedRisk?.stockoutDate ? (
                  <div>
                    <dt>Nguy cơ thiếu</dt>
                    <dd>Từ {formatDate(selectedRisk.stockoutDate)}</dd>
                  </div>
                ) : null}
              </dl>
              {selectedDemand.length ? (
                <DemandChart
                  ingredientName={selectedContext.ingredientName}
                  rows={selectedDemand}
                  unit={selectedContext.unit}
                />
              ) : (
                <Notice tone="info">
                  Chưa có chuỗi nhu cầu theo ngày cho nguyên liệu này.
                </Notice>
              )}
              <section className="procurement-inspector-section">
                <h3>Vì sao cần lượng này?</h3>
                {selectedDemand.flatMap((demand) => demand.contributions)
                  .length ? (
                  <ul className="procurement-inspector-contributions">
                    {selectedDemand
                      .flatMap((demand) => demand.contributions)
                      .map((contribution, index) => (
                        <li key={`${contribution.productId}-${index}`}>
                          <div>
                            <strong>{contribution.productName}</strong>
                            <small>
                              Dự báo P50:{" "}
                              {quantity(contribution.forecastP50, "sản phẩm")} ·
                              Định lượng:{" "}
                              {contribution.recipeQuantity == null
                                ? "Chưa có dữ liệu"
                                : `${formatQuantity(contribution.recipeQuantity)} ${contribution.recipeUnit || selectedContext.unit} / sản phẩm`}
                            </small>
                          </div>
                          <span>
                            {quantity(
                              contribution.p50,
                              contribution.unit || selectedContext.unit,
                            )}
                          </span>
                        </li>
                      ))}
                  </ul>
                ) : (
                  <p className="quiet-copy">
                    Chưa có dữ liệu đóng góp theo món.
                  </p>
                )}
                <Button onClick={() => setExplaining(true)} variant="secondary">
                  Xem giải thích đầy đủ{" "}
                  <ArrowRight aria-hidden="true" size={16} />
                </Button>
              </section>
              <section className="procurement-inspector-section">
                <h3>Nhà cung cấp phù hợp</h3>
                {supplierTerms(data, selectedContext.ingredientId).length ? (
                  <div className="procurement-supplier-list">
                    {supplierTerms(data, selectedContext.ingredientId).map(
                      (supplier) => (
                        <article
                          key={
                            supplier.constraintId ||
                            `${supplier.supplier}-${supplier.ingredientId}`
                          }
                        >
                          <strong>{supplier.supplier}</strong>
                          <span>
                            {formatVnd(supplier.unitCost)} · Tối thiểu{" "}
                            {formatQuantity(supplier.moq, selectedContext.unit)} ·{" "}
                            {supplier.leadTimeDays} ngày
                          </span>
                        </article>
                      ),
                    )}
                  </div>
                ) : (
                  <p className="quiet-copy">
                    Chưa có nhà cung cấp phù hợp để tạo đề xuất mua.
                  </p>
                )}
              </section>
            </aside>
          ) : null}
        </div>
        </> : null}
        </section>
      </section>
      {explaining && selectedDemand[0] ? (
        <DemandExplanationDialog
          onClose={() => setExplaining(false)}
          row={selectedDemand[0]}
        />
      ) : null}
      {reviewOpen ? (
        <ProcurementReviewDialog
          creating={creating}
          onClose={() => setReviewOpen(false)}
          onCreate={canCreate ? () => void createOrders() : undefined}
          rows={allRows.filter((row) =>
            eligibleRecommendations.some(
              (recommendation) =>
                recommendation.ingredientId === row.ingredientId,
            ),
          )}
        />
      ) : null}
    </div>
  );
}
