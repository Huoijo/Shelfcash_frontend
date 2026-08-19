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

type Filter = "all" | "buy" | "risk" | "expiry";

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
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [supplierFilter, setSupplierFilter] = useState("");
  const [selectedId, updateSelectedId] = useState("");
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
  const rows = allRows.filter((row) => {
    const needle = query.trim().toLocaleLowerCase("vi");
    if (
      needle &&
      !`${row.ingredientName} ${row.supplierName}`
        .toLocaleLowerCase("vi")
        .includes(needle)
    )
      return false;
    if (supplierFilter && row.supplierName !== supplierFilter) return false;
    if (filter === "buy") return row.recommendedQuantity != null;
    if (filter === "risk")
      return Boolean(row.stockoutDate || (row.shortageQuantity ?? 0) > 0);
    if (filter === "expiry") return false;
    return true;
  });
  const selected =
    allRows.find((row) => row.ingredientId === selectedId) ?? null;
  const selectedDemand = selected
    ? view.demand.filter((item) => item.ingredientId === selected.ingredientId)
    : [];
  const selectedRisk = selected
    ? view.risks.find((item) => item.ingredientId === selected.ingredientId)
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

  function toggleSelected(ingredientId: string) {
    updateSelectedId((current) =>
      current === ingredientId ? "" : ingredientId,
    );
  }

  function selectStrategy(strategyKey: string) {
    setSelectedStrategyKey(strategyKey);
    updateSelectedId("");
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
          <Notice tone="warning">
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
                      {strategy.feasible
                        ? "Đáp ứng toàn bộ ràng buộc"
                        : observed
                          ? `Đáp ứng ${observed}${required ? ` · yêu cầu ${required}` : ""}`
                          : "Backend chưa trả mức đáp ứng"}
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
          <span>Xem danh sách nguyên liệu</span>
          <ArrowDown aria-hidden="true" size={19} />
        </button>
      </section>

      <section
        className="procurement-workspace-scene"
        id="procurement-workspace"
        ref={workspaceRef}
        aria-labelledby="procurement-workspace-title"
      >
        <header className="procurement-workspace-header">
          <h2 id="procurement-workspace-title">
            Danh sách nguyên liệu{" "}
            <GuidanceHint
              content="Chọn một dòng để xem nhu cầu, rủi ro tồn kho và điều kiện nhà cung cấp; chọn lại dòng đang mở để đóng chi tiết."
              label="Cách xem chi tiết nguyên liệu"
            />
          </h2>
          <div className="procurement-table-toolbar">
            <div className="procurement-search">
              <Search aria-hidden="true" size={16} />
              <label>
                <span className="sr-only">
                  Tìm nguyên liệu hoặc nhà cung cấp
                </span>
                <input
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Tìm nguyên liệu / nhà cung cấp"
                  value={query}
                />
              </label>
            </div>
            <div className="procurement-filter-controls">
              <SlidersHorizontal aria-hidden="true" size={16} />
              <label>
                <span className="sr-only">Lọc nguyên liệu</span>
                <select
                  onChange={(event) => setFilter(event.target.value as Filter)}
                  value={filter}
                >
                  <option value="all">Tất cả</option>
                  <option value="buy">Cần nhập</option>
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
            {feasible ? (
              <Button
                disabled={!canCreate}
                onClick={() => setReviewOpen(true)}
              >{`Xem đơn nhập nháp · ${eligibleRecommendations.length} dòng`}</Button>
            ) : null}
          </div>
          {filter !== "all" ? (
            <div className="procurement-filter-chip">
              <span>
                {filter === "buy"
                  ? "Cần nhập"
                  : filter === "risk"
                    ? "Nguy cơ thiếu"
                    : "Sắp hết hạn"}
              </span>
              <button
                aria-label="Xóa bộ lọc"
                onClick={() => setFilter("all")}
                type="button"
              >
                ×
              </button>
            </div>
          ) : null}
        </header>
        <div
          className={`procurement-master-detail${selected ? " has-selection" : ""}`}
        >
          <section
            className="procurement-table-panel"
            aria-label="Bảng nguyên liệu cần nhập"
          >
            <div className="procurement-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Nguyên liệu</th>
                    <th scope="col">
                      <abbr
                        aria-label="NCC là Nhà cung cấp; TG là Thời gian giao hàng"
                        className="procurement-header-abbr"
                        data-tooltip="NCC: Nhà cung cấp · TG: Thời gian giao hàng"
                        tabIndex={0}
                      >
                        NCC &amp; TG
                      </abbr>
                    </th>
                    <th scope="col">Tồn hiện có</th>
                    <th scope="col">Hàng sắp về</th>
                    <th scope="col">Nhu cầu kỳ này</th>
                    <th scope="col">Đề xuất phương án</th>
                    <th scope="col">Đơn giá</th>
                    <th scope="col">Thành tiền</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      aria-selected={
                        selected?.ingredientId === row.ingredientId
                      }
                      className={
                        selected?.ingredientId === row.ingredientId
                          ? "selected"
                          : ""
                      }
                      key={row.ingredientId}
                      onClick={() => toggleSelected(row.ingredientId)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          toggleSelected(row.ingredientId);
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
                        {row.supplierName || "Chưa có nhà cung cấp phù hợp"}
                        <small>
                          {row.leadTimeDays == null
                            ? "Chưa có thời gian giao"
                            : `${row.leadTimeDays} ngày`}
                        </small>
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
                        {row.recommendedQuantity == null ? (
                          activeStrategy ? (
                            "Không có đề xuất"
                          ) : (
                            "Chọn phương án để xem"
                          )
                        ) : (
                          <>
                            {formatQuantity(row.recommendedQuantity, row.unit)}
                            <small>
                              {row.packCount == null
                                ? ""
                                : `${row.packCount} gói${row.packSize == null ? "" : ` · ${formatQuantity(row.packSize, row.unit)}`}`}
                            </small>
                          </>
                        )}
                      </td>
                      <td>
                        {row.unitPrice == null
                          ? "Chưa có dữ liệu"
                          : formatVnd(row.unitPrice)}
                      </td>
                      <td>
                        {row.purchaseCost == null
                          ? "Chưa có dữ liệu"
                          : formatVnd(row.purchaseCost)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!rows.length ? (
              <Notice tone="info">
                Không có nguyên liệu khớp với bộ lọc hiện tại.
              </Notice>
            ) : null}
          </section>
          {selected ? (
            <aside
              aria-labelledby="ingredient-inspector-title"
              className="procurement-inspector is-open"
            >
              <header>
                <div>
                  <span className="eyebrow">Chi tiết nguyên liệu</span>
                  <h2 id="ingredient-inspector-title">
                    {selected.ingredientName}
                  </h2>
                  <p>Đơn vị: {selected.unit || "chưa xác định"}</p>
                </div>
                <span
                  className={`procurement-severity ${severityClass(selected)}`}
                >
                  {severity(selected)}
                </span>
              </header>
              <dl className="procurement-inspector-metrics">
                <div>
                  <dt>Tồn hiện có</dt>
                  <dd>{quantity(selected.onHand, selected.unit)}</dd>
                </div>
                <div>
                  <dt>Hàng sắp về</dt>
                  <dd>{quantity(selected.inbound, selected.unit)}</dd>
                </div>
                <div>
                  <dt>Nhu cầu P50 kỳ này</dt>
                  <dd>{quantity(selected.p50, selected.unit)}</dd>
                </div>
                <div>
                  <dt>Khoảng dự báo</dt>
                  <dd>
                    {quantity(selected.p25, selected.unit)} –{" "}
                    {quantity(selected.p75, selected.unit)}
                  </dd>
                </div>
                {selectedRisk?.shortageQuantity != null ? (
                  <div>
                    <dt>Thiếu dự kiến</dt>
                    <dd>
                      {formatQuantity(
                        selectedRisk.shortageQuantity,
                        selected.unit,
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
                  ingredientName={selected.ingredientName}
                  rows={selectedDemand}
                  unit={selected.unit}
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
                                : `${formatQuantity(contribution.recipeQuantity)} ${contribution.recipeUnit || selected.unit} / sản phẩm`}
                            </small>
                          </div>
                          <span>
                            {quantity(
                              contribution.p50,
                              contribution.unit || selected.unit,
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
                {supplierTerms(data, selected.ingredientId).length ? (
                  <div className="procurement-supplier-list">
                    {supplierTerms(data, selected.ingredientId).map(
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
                            {formatQuantity(supplier.moq, selected.unit)} ·{" "}
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
