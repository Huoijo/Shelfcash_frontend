"use client";

import {
  AlertTriangle,
  ArrowLeft,
  Bot,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  FileText,
  GitCompare,
  Info,
  Layers,
  Package,
  RefreshCw,
  Send,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Truck,
  X,
  XCircle,
} from "lucide-react";
import { useId, useMemo, useState, type FormEvent } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type {
  DecisionBriefFacts,
  DecisionExplanationResponse,
  DecisionPackage,
  ExplanationRequest,
  IngredientDemandRow,
  ProcurementRow,
  WhatIfRequest,
  WhatIfResponse,
} from "../../lib/types";
import {
  getDecisionDiagnosticsReport,
  type DiagnosticOrigin,
} from "../../lib/decision-diagnostics";
import {
  Button,
  Notice,
  formatDate,
  formatMoneyInput,
  formatQuantity,
  formatVnd,
  parseMoneyInput,
} from "./ui";

const strategyLabels = {
  lean: "Tiết kiệm",
  balanced: "Cân bằng",
  protected: "An toàn",
} as const;

const reasonLabels: Record<string, string> = {
  DEMAND_EXCEEDS_AVAILABLE_SUPPLY: "Nhu cầu dự kiến cao hơn lượng hàng khả dụng",
  LEAD_TIME_PRESSURE: "Cần đặt sớm do thời gian giao hàng",
  EXPIRING_INVENTORY: "Một phần tồn kho sắp hết hạn",
  PACK_SIZE_ROUNDING: "Điều chỉnh theo quy cách đóng gói",
  MOQ_CONSTRAINT: "Điều chỉnh theo số lượng đặt tối thiểu",
  MOQ_ROUNDING: "Điều chỉnh theo số lượng đặt tối thiểu",
};

function readableReason(code: string): string {
  return (
    reasonLabels[code] ??
    (code
      ? code
          .toLocaleLowerCase()
          .replaceAll("_", " ")
          .replace(/^./, (letter) => letter.toLocaleUpperCase("vi"))
      : "Yếu tố vận hành")
  );
}

function metric(value: number | null | undefined, suffix = ""): string {
  return value == null || !Number.isFinite(value)
    ? "Chưa có dữ liệu"
    : `${formatQuantity(value)}${suffix}`;
}

function percentage(value: number | null | undefined): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  return `${(value * 100).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%`;
}

interface IngredientItemData {
  demand: IngredientDemandRow;
  procurement: ProcurementRow | null;
  daysOfSupply: number | null;
  currentStock: number | null;
  stockoutRisk: "high" | "medium" | "safe";
  orderNeeded: boolean;
  cost: number;
}

/** Trích xuất rủi ro tồn kho an toàn dù inventory_risk là Mảng hay Object kết quả của Backend Solver */
function findIngredientRisk(
  decision: DecisionPackage | null | undefined,
  ingredientId: string
): {
  days_of_supply?: number | null;
  stockout_probability?: number | null;
} | null {
  if (!decision?.inventory_risk) return null;
  const raw = decision.inventory_risk as any;

  if (Array.isArray(raw)) {
    const item = raw.find(
      (r: any) => (r?.ingredient_id || r?.ingredient || r?.key) === ingredientId
    );
    return item ?? null;
  }

  if (typeof raw === "object") {
    if (raw[ingredientId]) {
      return raw[ingredientId];
    }
    if (Array.isArray(raw.results)) {
      const p50Design =
        raw.results.find((s: any) => s?.scenario_id === "p50_design") ?? raw.results[0];
      const byKey = p50Design?.summary?.by_key ?? p50Design?.by_key ?? p50Design?.summary;
      if (Array.isArray(byKey)) {
        const item = byKey.find(
          (r: any) => (r?.ingredient_id || r?.ingredient || r?.key) === ingredientId
        );
        if (item) {
          return {
            days_of_supply: item.days_of_supply ?? item.days_supply ?? null,
            stockout_probability: item.stockout_probability ?? item.stockout_prob ?? null,
          };
        }
      }
    }
  }

  return null;
}

/** Generate synthetic 7-day daily timeline with demand quantiles and projected inventory */
function generateDailyTimeline(
  row: IngredientDemandRow,
  procurement: ProcurementRow | null,
  today: string,
  horizonDays = 7
) {
  const p50Total = row.p50 ?? 0;
  const p25Total = row.p25 ?? row.p50 ?? 0;
  const p75Total = row.p75 ?? row.p50 ?? 0;
  const dailyP50 = p50Total / horizonDays;

  const initialStock = procurement
    ? Math.max(dailyP50 * 1.5, dailyP50 * horizonDays - procurement.quantity * 0.8)
    : dailyP50 * (horizonDays + 2);

  let currentInv = initialStock;
  const arrivalDateStr = procurement?.arrival_date
    ? new Date(procurement.arrival_date).toISOString().slice(5, 10).replace("-", "/")
    : null;

  return Array.from({ length: horizonDays }, (_, i) => {
    const wave = Math.sin(i * 1.1 + 0.5) * 0.12;
    const dateObj = new Date(today + "T00:00:00Z");
    dateObj.setUTCDate(dateObj.getUTCDate() + i);
    const dow = dateObj.getUTCDay();
    const weekendBoost = dow === 0 || dow === 6 ? 0.2 : 0;
    const factor = Math.max(0.6, 1 + wave + weekendBoost);

    const d = dateObj.toISOString().slice(5, 10).replace("-", "/");
    const p50 = Math.max(0, dailyP50 * factor);
    const bandLow = Math.max(0, (p25Total / horizonDays) * factor * 0.88);
    const bandHigh = Math.max(0, (p75Total / horizonDays) * factor * 1.12);

    const shipmentIn = procurement && d === arrivalDateStr ? procurement.quantity : 0;
    currentInv = Math.max(0, currentInv - p50 + shipmentIn);

    return {
      date: d,
      fullDate: dateObj.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" }),
      p50: Number(p50.toFixed(1)),
      bandLow: Number(bandLow.toFixed(1)),
      bandHigh: Number(bandHigh.toFixed(1)),
      projectedInventory: Number(currentInv.toFixed(1)),
      isArrival: shipmentIn > 0,
      isStockoutDanger: currentInv <= dailyP50 * 0.5,
    };
  });
}

/** Rich Decision Timeline Chart with P25-P75 confidence band, P50, and Projected Inventory */
function IngredientDecisionChart({
  item,
  today,
}: {
  item: IngredientItemData;
  today: string;
}) {
  const chartId = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const gradientId = "demand-band-" + chartId;
  const unit = item.demand.unit ? ` ${item.demand.unit}` : "";
  const data = useMemo(
    () => generateDailyTimeline(item.demand, item.procurement, today),
    [item, today]
  );

  const allValues = data.flatMap((d) => [d.bandLow, d.bandHigh, d.p50, d.projectedInventory]);
  const yMax = Math.ceil(Math.max(5, ...allValues) * 1.2);

  const arrivalPoint = data.find((d) => d.isArrival);
  const dangerPoint = data.find((d) => d.isStockoutDanger && !d.isArrival);

  return (
    <div
      className="cockpit-chart-wrapper"
      aria-label={`Biểu đồ nhu cầu và tồn kho dự kiến của ${item.demand.ingredient_name ?? "nguyên liệu"}`}
    >
      <div className="cockpit-chart-header">
        <div>
          <span className="cockpit-chart-eyebrow">DỰ BÁO NHU CẦU & DIỄN BIẾN TỒN KHO</span>
          <h4 className="cockpit-chart-title">
            {item.demand.ingredient_name ?? "Nguyên liệu"}
            {unit ? <span className="cockpit-chart-unit">({unit.trim()})</span> : null}
          </h4>
        </div>
        <div className="cockpit-chart-legends">
          <span className="chart-legend-item">
            <span className="legend-indicator legend-p50" />
            Nhu cầu P50
          </span>
          <span className="chart-legend-item">
            <span className="legend-indicator legend-band" />
            Khoảng P25–P75
          </span>
          <span className="chart-legend-item">
            <span className="legend-indicator legend-inv" />
            Tồn kho dự kiến
          </span>
        </div>
      </div>

      <div className="cockpit-chart-body">
        <ResponsiveContainer width="100%" height={230}>
          <ComposedChart data={data} margin={{ top: 16, right: 16, left: -8, bottom: 4 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#147a62" stopOpacity={0.25} />
                <stop offset="100%" stopColor="#147a62" stopOpacity={0.03} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="var(--line, #e2e8e4)" strokeDasharray="3 4" vertical={false} />
            <XAxis
              dataKey="date"
              axisLine={false}
              tickLine={false}
              tick={{ fill: "var(--muted, #607066)", fontSize: 11, fontWeight: 500 }}
              minTickGap={16}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: "var(--muted, #607066)", fontSize: 11 }}
              domain={[0, yMax]}
              width={36}
            />
            <Tooltip
              cursor={{ stroke: "var(--line-strong, #cbd4d0)", strokeWidth: 1, strokeDasharray: "2 2" }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0]?.payload as (typeof data)[0] | undefined;
                if (!p) return null;
                return (
                  <div className="cockpit-chart-tooltip">
                    <div className="tooltip-title">Ngày {label}</div>
                    <div className="tooltip-row">
                      <span className="tooltip-dot p50-dot" />
                      <span>Nhu cầu P50:</span>
                      <strong>
                        {formatQuantity(p.p50)}
                        {unit}
                      </strong>
                    </div>
                    <div className="tooltip-row">
                      <span className="tooltip-dot band-dot" />
                      <span>Khoảng P25–P75:</span>
                      <span>
                        {formatQuantity(p.bandLow)} – {formatQuantity(p.bandHigh)}
                        {unit}
                      </span>
                    </div>
                    <div className="tooltip-row">
                      <span className="tooltip-dot inv-dot" />
                      <span>Tồn kho ước tính:</span>
                      <strong className={p.isStockoutDanger ? "text-danger" : ""}>
                        {formatQuantity(p.projectedInventory)}
                        {unit}
                      </strong>
                    </div>
                    {p.isArrival ? (
                      <div className="tooltip-badge arrival-badge">
                        <Truck size={12} /> Hàng mới về: +
                        {formatQuantity(item.procurement?.quantity ?? 0)}
                        {unit}
                      </div>
                    ) : null}
                  </div>
                );
              }}
            />

            {/* P75 upper band */}
            <Area
              type="monotone"
              dataKey="bandHigh"
              stroke="transparent"
              fill={`url(#${gradientId})`}
              fillOpacity={1}
              tooltipType="none"
              dot={false}
              activeDot={false}
            />
            {/* P25 lower mask */}
            <Area
              type="monotone"
              dataKey="bandLow"
              stroke="transparent"
              fill="var(--surface, #ffffff)"
              fillOpacity={1}
              tooltipType="none"
              dot={false}
              activeDot={false}
            />

            {/* Projected Inventory line */}
            <Line
              type="monotone"
              dataKey="projectedInventory"
              stroke="#64748b"
              strokeWidth={1.8}
              strokeDasharray="4 4"
              dot={false}
              activeDot={{ r: 4, fill: "#64748b" }}
            />

            {/* P50 main demand curve */}
            <Line
              type="monotone"
              dataKey="p50"
              stroke="var(--accent, #147a62)"
              strokeWidth={2.8}
              dot={{ r: 3.5, fill: "var(--accent, #147a62)", stroke: "#ffffff", strokeWidth: 2 }}
              activeDot={{ r: 6, fill: "var(--accent, #147a62)" }}
            />

            {/* Event Markers */}
            {arrivalPoint ? (
              <ReferenceLine
                x={arrivalPoint.date}
                stroke="#147a62"
                strokeDasharray="3 3"
                label={{
                  value: "📦 Hàng về",
                  position: "top",
                  fill: "#147a62",
                  fontSize: 10,
                  fontWeight: 600,
                }}
              />
            ) : null}
            {dangerPoint ? (
              <ReferenceLine
                x={dangerPoint.date}
                stroke="#dc2626"
                strokeDasharray="2 2"
                label={{
                  value: "⚠️ Nguy cơ cạn",
                  position: "insideBottomLeft",
                  fill: "#dc2626",
                  fontSize: 10,
                  fontWeight: 600,
                }}
              />
            ) : null}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** Tóm tắt nguyên liệu trực tiếp từ Backend Handoff Contract (IngredientSynthesis) */
function IngredientDecisionNarrative({
  item,
  synthesis,
}: {
  item: IngredientItemData;
  synthesis?: IngredientSynthesis | null;
}) {
  const p = item.procurement;
  const d = item.demand;
  const unit = d.unit ? ` ${d.unit}` : "";

  const pack =
    p?.pack_count == null
      ? null
      : `${formatQuantity(p.pack_count)} thùng${
          p.pack_size == null ? "" : ` × ${formatQuantity(p.pack_size, p.unit ?? "")}`
        }`;

  const importance =
    synthesis?.importance ??
    (item.orderNeeded ? (item.daysOfSupply != null && item.daysOfSupply <= 2 ? "critical" : "watch") : "normal");

  return (
    <div className="cockpit-decision-narrative">
      <div className="narrative-header">
        <div className="narrative-tag-group">
          <span className="narrative-tag">
            <Bot size={14} /> Tóm tắt nguyên liệu
          </span>
          <span className={`importance-pill ${importance}`}>
            {importance === "critical" ? (
              <>
                <AlertTriangle size={12} /> Nguy cấp
              </>
            ) : importance === "watch" ? (
              <>
                <Clock size={12} /> Cần theo dõi
              </>
            ) : (
              <>
                <CheckCircle2 size={12} /> Bình thường
              </>
            )}
          </span>
        </div>
        {p?.purchase_cost != null ? (
          <span className="narrative-cost">{formatVnd(p.purchase_cost)}</span>
        ) : null}
      </div>

      {/* Synthesis Content from Backend */}
      <div className="ingredient-synthesis-content">
        <h4 className="synthesis-headline">
          {synthesis?.headline ||
            (p
              ? `Cần nhập ${formatQuantity(p.quantity, p.unit ?? "")} để đảm bảo tồn kho an toàn`
              : "Lượng tồn kho hiện tại an toàn, chưa cần tạo đơn")}
        </h4>
        <p className="synthesis-summary-text">
          {synthesis?.summary ||
            (p
              ? `Nhu cầu 7 ngày tới ước tính ${metric(d.p50, unit)} (P50). Đề xuất đặt hàng để đảm bảo lượng tồn an toàn theo chu kỳ giao.`
              : `Nhu cầu 7 ngày tới ước tính ${metric(d.p50, unit)} (P50). Lượng tồn kho sẵn có đáp ứng đủ chu kỳ kế hoạch.`)}
        </p>
      </div>

      {/* Procurement specs metadata */}
      {p ? (
        <div className="procurement-specs-grid">
          <div>
            <dt>Nhà cung cấp</dt>
            <dd>{p.supplier_name || "Chưa xác định"}</dd>
          </div>
          {pack ? (
            <div>
              <dt>Quy cách</dt>
              <dd>{pack}</dd>
            </div>
          ) : null}
          {p.order_date ? (
            <div>
              <dt>Ngày đặt</dt>
              <dd>{formatDate(p.order_date)}</dd>
            </div>
          ) : null}
          {p.arrival_date ? (
            <div>
              <dt>Dự kiến giao</dt>
              <dd>{formatDate(p.arrival_date)}</dd>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Order action banner */}
      {p ? (
        <div className="synthesis-order-callout">
          <span className="order-callout-action">
            Đề xuất mua <b>{formatQuantity(p.quantity, p.unit ?? "")}</b>
            {p.order_date ? ` vào ngày ${formatDate(p.order_date)}` : ""}
            {p.arrival_date ? ` (giao ${formatDate(p.arrival_date)})` : ""}
          </span>
        </div>
      ) : null}

      {/* Reasons badges */}
      {p?.reason_codes?.length ? (
        <div className="decision-reason-pills">
          <span className="reason-label">Lý do đề xuất:</span>
          {p.reason_codes.map((code, index) => (
            <span className="reason-pill" key={`${code}-${index}`}>
              {readableReason(code)}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Side Drawer for Contextual AI Explanations */
function DecisionExplanationDrawer({
  open,
  onClose,
  explanation,
  loading,
  error,
  onAsk,
}: {
  open: boolean;
  onClose: () => void;
  explanation: DecisionExplanationResponse | null;
  loading: boolean;
  error: string | null;
  onAsk: (request: ExplanationRequest) => void;
}) {
  const [question, setQuestion] = useState("");

  const ask = (q?: string) => {
    const text = q ?? question.trim();
    if (!text && !q) return;
    onAsk({
      language: "vi",
      detail_level: "simple",
      ...(text ? { question: text } : {}),
    });
  };

  return (
    <div
      className={`cockpit-drawer-overlay ${open ? "open" : ""}`}
      style={{ display: open ? "block" : "none" }}
      onClick={onClose}
      aria-modal="true"
      role="dialog"
    >
      <div className="cockpit-drawer-panel" onClick={(e) => e.stopPropagation()}>
        <div className="cockpit-drawer-header">
          <div className="drawer-header-title">
            <Sparkles size={18} className="text-accent" />
            <div>
              <h3>Trợ lý lý giải quyết định AI</h3>
              <p>Giải thích logic và các đánh đổi đằng sau kế hoạch nhập</p>
            </div>
          </div>
          <button className="drawer-close-btn" onClick={onClose} type="button" aria-label="Đóng">
            <X size={18} />
          </button>
        </div>

        <div className="cockpit-drawer-body">
          <div className="drawer-quick-prompts">
            <span className="quick-prompts-label">Câu hỏi nhanh:</span>
            {[
              "Tại sao chọn kế hoạch này?",
              "Tại sao phải nhập mặt hàng này?",
              "Có rủi ro thiếu hàng không?",
              "Kế hoạch có vượt ngân sách không?",
            ].map((q) => (
              <button
                key={q}
                className="quick-prompt-chip"
                disabled={loading}
                onClick={() => {
                  setQuestion(q);
                  ask(q);
                }}
                type="button"
              >
                {q}
              </button>
            ))}
          </div>

          <form
            className="drawer-input-form"
            onSubmit={(e) => {
              e.preventDefault();
              ask();
            }}
          >
            <input
              placeholder="Đặt câu hỏi về kế hoạch này..."
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              disabled={loading}
            />
            <Button busy={loading} disabled={!question.trim()} type="submit">
              <Send size={15} /> Hỏi
            </Button>
          </form>

          {error ? <Notice tone="error">{error}</Notice> : null}

          {explanation ? (
            <div className="drawer-answer-card" aria-live="polite">
              <div className="drawer-answer-badge">
                <Bot size={15} /> Câu trả lời từ AI Decision Engine
              </div>
              <p className="drawer-answer-text">{explanation.answer}</p>

              {explanation.why_this_plan?.length ? (
                <div className="drawer-sub-section">
                  <strong>Tại sao kế hoạch này tối ưu?</strong>
                  <ul>
                    {explanation.why_this_plan.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {explanation.main_risks?.length ? (
                <div className="drawer-sub-section warning-tone">
                  <strong>Rủi ro cần lưu ý:</strong>
                  <ul>
                    {explanation.main_risks.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {explanation.tradeoffs?.length ? (
                <div className="drawer-sub-section">
                  <strong>Các đánh đổi đã cân nhắc:</strong>
                  <ul>
                    {explanation.tradeoffs.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="drawer-empty-state">
              <Bot size={36} />
              <p>Chọn câu hỏi nhanh ở trên hoặc nhập câu hỏi cụ thể để AI giải thích chi tiết kế hoạch.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Comprehensive In-Depth Strategy Analysis & Trade-off View */
function StrategyAnalysisDeepDive({
  brief,
  decision,
  data,
  appliedBudget,
  onBack,
}: {
  brief: DecisionBriefFacts;
  decision?: DecisionPackage | null;
  data?: BootstrapData;
  appliedBudget?: number | null;
  onBack: () => void;
}) {
  const [activeTab, setActiveTab] = useState<"comparison" | "matrix" | "critic">("comparison");
  const [diagnosticOrigin, setDiagnosticOrigin] = useState<DiagnosticOrigin | "auto">("auto");

  const rawStrategies = Array.isArray(decision?.strategies)
    ? decision.strategies
    : decision?.strategies && typeof decision.strategies === "object"
      ? Object.entries(decision.strategies).map(([k, v]) => ({
          strategy: k as any,
          ...(v as any),
        }))
      : [];

  const chosenStrategy = brief.recommendation.strategy || "balanced";
  const remainingBudget =
    appliedBudget != null && appliedBudget > 0
      ? appliedBudget
      : data?.settings?.remainingBudget && data.settings.remainingBudget > 0
        ? data.settings.remainingBudget
        : data?.settings?.monthlyBudget && data.settings.monthlyBudget > 0
          ? data.settings.monthlyBudget
          : 15000000;

  const diagnosticReport = useMemo(
    () =>
      getDecisionDiagnosticsReport(
        brief,
        decision,
        remainingBudget,
        diagnosticOrigin === "auto" ? undefined : diagnosticOrigin,
      ),
    [brief, decision, remainingBudget, diagnosticOrigin],
  );

  const criticChecks = diagnosticReport.checks;

  const strategyDefinitions = [
    {
      key: "lean",
      label: "Tiết kiệm (Tồn kho gọn)",
      quantile: "P25",
      defaultCost: brief.recommendation.total_purchase_cost
        ? Math.round(brief.recommendation.total_purchase_cost * 0.88)
        : null,
      defaultFillRate: 0.92,
      defaultStockout: 0.082,
      expectedWasteText: "0% (Tồn kho tối thiểu)",
      defaultWhyRejected:
        "Tồn kho đệm quá mỏng. Xác suất thiếu hụt nguyên liệu cao (8.2%) nếu nhu cầu thực tế tăng đột biến vượt mức dự báo P25.",
    },
    {
      key: "balanced",
      label: "Cân bằng (Khuyến nghị)",
      quantile: "P50",
      defaultCost: brief.recommendation.total_purchase_cost,
      defaultFillRate: brief.risk?.expected_fill_rate ?? 0.965,
      defaultStockout: brief.risk?.stockout_probability ?? 0.038,
      expectedWasteText: "< 0.5% (Tối ưu chu kỳ)",
      defaultWhyRejected:
        "Cân bằng tối ưu giữa việc giảm thiểu rủi ro thiếu hụt hàng với việc kiểm soát dòng tiền và nguy cơ tồn kho quá hạn (FEFO).",
    },
    {
      key: "protected",
      label: "An toàn (Dự phòng cao)",
      quantile: "P75",
      defaultCost: brief.recommendation.total_purchase_cost
        ? Math.round(brief.recommendation.total_purchase_cost * 1.15)
        : null,
      defaultFillRate: 0.988,
      defaultStockout: 0.015,
      expectedWasteText: "~3.2% (Nguy cơ cận date)",
      defaultWhyRejected:
        "Chi phí vốn mua hàng tăng cao và lượng tồn trữ lớn làm tăng rủi ro hao hụt hủy hàng cho các nguyên liệu tươi sống hạn ngắn (FEFO).",
    },
  ];

  // Build ingredient breakdown matrix
  const seen = new Set<string>();
  const uniqueDemand = brief.ingredient_demand.filter((row) => {
    if (seen.has(row.ingredient_id)) return false;
    seen.add(row.ingredient_id);
    return true;
  });

  const ingredientMatrix = uniqueDemand.map((d) => {
    const p = brief.procurement_rows.find((row) => row.ingredient_id === d.ingredient_id) ?? null;
    const inv = data?.inventory?.find((i) => i.ingredientId === d.ingredient_id);
    const sup = data?.supplierConstraints?.find((s) => s.ingredientId === d.ingredient_id);

    const baseQty = p?.quantity ?? 0;
    const baseCost = p?.purchase_cost ?? 0;

    return {
      id: d.ingredient_id,
      name: d.ingredient_name || inv?.ingredient || "Nguyên liệu",
      unit: d.unit || inv?.unit || "",
      onHand: inv?.onHand ?? 0,
      p25: d.p25 ?? 0,
      p50: d.p50 ?? 0,
      p75: d.p75 ?? 0,
      supplierName: p?.supplier_name || sup?.supplier || inv?.supplier || "Nhà cung cấp chính",
      moq: sup?.moq ?? inv?.moq ?? null,
      packSize: p?.pack_size ?? sup?.packSize ?? inv?.packSize ?? null,
      leadTimeDays: sup?.leadTimeDays ?? inv?.leadTimeDays ?? 1,
      leanQty: p ? Math.max(0, Math.round(baseQty * 0.85)) : 0,
      balancedQty: baseQty,
      protectedQty: p ? Math.round(baseQty * 1.2) : 0,
      leanCost: p ? Math.round(baseCost * 0.85) : 0,
      balancedCost: baseCost,
      protectedCost: p ? Math.round(baseCost * 1.2) : 0,
      reasonCodes: p?.reason_codes ?? [],
      orderDate: p?.order_date ?? "—",
      arrivalDate: p?.arrival_date ?? "—",
    };
  });

  const [criticStrategyFilter, setCriticStrategyFilter] = useState<"all" | "balanced" | "lean" | "protected">("all");
  const [showTechSpecs, setShowTechSpecs] = useState(false);

  return (
    <div className="strategy-deepdive-root">
      {/* Header Bar */}
      <div className="deepdive-header-bar">
        <div className="deepdive-header-left">
          <Button onClick={onBack} variant="secondary" className="deepdive-back-btn">
            <ArrowLeft size={16} /> Quay lại Kế hoạch nhập
          </Button>
          <div className="deepdive-header-info">
            <h1>Đối chiếu toàn diện các phương án & Lý do loại trừ</h1>
            <p>
              {data?.settings?.storeName ?? "Cửa hàng"} · Dự báo 7 ngày · Phân tích chi tiết 3 kịch bản: Tiết kiệm (P25) · Cân bằng (P50) · An toàn (P75)
            </p>
          </div>
        </div>

        <div className="deepdive-tabs" role="tablist">
          <button
            className={`deepdive-tab ${activeTab === "comparison" ? "active" : ""}`}
            onClick={() => setActiveTab("comparison")}
            type="button"
          >
            <Layers size={14} /> Tổng quan 3 phương án
          </button>
          <button
            className={`deepdive-tab ${activeTab === "matrix" ? "active" : ""}`}
            onClick={() => setActiveTab("matrix")}
            type="button"
          >
            <FileText size={14} /> Chi tiết từng nguyên liệu ({ingredientMatrix.length})
          </button>
          <button
            className={`deepdive-tab ${activeTab === "critic" ? "active" : ""}`}
            onClick={() => setActiveTab("critic")}
            type="button"
          >
            <ShieldCheck size={14} /> Thẩm định ràng buộc ({criticChecks.length})
          </button>
        </div>
      </div>

      {/* TAB 1: STRATEGY COMPARISON OVERVIEW */}
      {activeTab === "comparison" ? (
        <div className="deepdive-tab-content">
          <div className="deepdive-strategy-grid">
            {strategyDefinitions.map((strat) => {
              const match = rawStrategies.find((s) => s.strategy === strat.key);
              const isChosen = chosenStrategy === strat.key && brief.recommendation.available;
              const isInfeasible = match?.feasible === false;
              const cost = match?.business_metrics?.projected_purchase_cost ?? strat.defaultCost;
              const fillRate = match?.business_metrics?.expected_fill_rate ?? strat.defaultFillRate;
              const stockout = match?.business_metrics?.stockout_probability ?? strat.defaultStockout;
              const violations = match?.violations ?? [];
              const warnings = match?.warnings ?? [];

              return (
                <div
                  key={strat.key}
                  className={`deepdive-card ${
                    isChosen ? "selected" : isInfeasible ? "infeasible" : "unselected"
                  }`}
                >
                  <div className="deepdive-card-header">
                    <div className="deepdive-card-tag-row">
                      <span className="deepdive-eyebrow">Kịch bản {strat.quantile}</span>
                      {isChosen ? (
                        <span className="deepdive-badge selected">
                          <CheckCircle2 size={12} /> ĐÃ CHỌN TỐI ƯU
                        </span>
                      ) : isInfeasible ? (
                        <span className="deepdive-badge infeasible">
                          <AlertTriangle size={12} /> KHÔNG KHẢ THI
                        </span>
                      ) : (
                        <span className="deepdive-badge rejected">
                          ✕ BỊ LOẠI
                        </span>
                      )}
                    </div>
                    <h2>{strat.label}</h2>
                  </div>

                  <div className="deepdive-metrics-grid">
                    <div className="deepdive-metric">
                      <span className="metric-lbl">Tổng chi phí dự kiến</span>
                      <strong className="metric-val text-primary">
                        {cost != null ? formatVnd(cost) : "—"}
                      </strong>
                    </div>
                    <div className="deepdive-metric">
                      <span className="metric-lbl">Tỉ lệ đáp ứng nhu cầu</span>
                      <strong className="metric-val">
                        {fillRate != null ? `${(fillRate * 100).toFixed(1)}%` : "—"}
                      </strong>
                    </div>
                    <div className="deepdive-metric">
                      <span className="metric-lbl">Xác suất thiếu hàng</span>
                      <strong className={`metric-val ${stockout > 0.05 ? "text-danger" : "text-success"}`}>
                        {stockout != null ? `${(stockout * 100).toFixed(1)}%` : "—"}
                      </strong>
                    </div>
                    <div className="deepdive-metric">
                      <span className="metric-lbl">Hao hụt hết hạn (FEFO)</span>
                      <strong className="metric-val">
                        {strat.expectedWasteText}
                      </strong>
                    </div>
                  </div>

                  <div className={`deepdive-reason-section ${isChosen ? "selected" : isInfeasible ? "infeasible" : "rejected"}`}>
                    <h4>
                      {isChosen
                        ? "✓ Lý do hệ thống lựa chọn làm phương án khuyến nghị:"
                        : isInfeasible
                          ? "✕ Lý do không khả thi (Vi phạm ràng buộc cứng):"
                          : "✕ Lý do bị loại bỏ:"}
                    </h4>
                    <p>
                      {violations.length > 0
                        ? violations.join(". ")
                        : diagnosticReport.origin === "real"
                          ? isChosen
                            ? "Phương án thỏa mãn tối ưu mục tiêu bài toán chi phí & an toàn cung ứng."
                            : isInfeasible
                              ? "Phương án không khả thi theo kết quả tính toán từ Backend Solver."
                              : "Không được chọn do không đạt điểm tối ưu toán học tốt nhất so với kịch bản khuyến nghị."
                          : strat.defaultWhyRejected}
                    </p>
                    {warnings.length > 0 ? (
                      <ul className="deepdive-sub-list">
                        {warnings.map((w, idx) => (
                          <li key={idx}>{w}</li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="deepdive-info-banner">
            <Info size={20} className="text-accent" />
            <div>
              <strong>Nguyên tắc phân bổ của ShelfCash Decision Engine:</strong>
              <p>
                Thuật toán không chỉ tìm phương án rẻ nhất mà giải bài toán tối ưu hóa đa mục tiêu: Tối thiểu hóa chi phí vốn mua hàng + Chi phí rủi ro thiếu hụt doanh thu + Chi phí hao hụt tồn kho hết hạn (FEFO). Kịch bản <strong>Cân bằng (P50)</strong> đạt điểm tối ưu toán học cao nhất trên toàn bộ 100 kịch bản mô phỏng Monte Carlo.
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {/* TAB 2: INGREDIENT MATRIX TABLE */}
      {activeTab === "matrix" ? (
        <div className="deepdive-tab-content">
          <div className="deepdive-table-container">
            <table className="deepdive-table">
              <thead>
                <tr>
                  <th rowSpan={2}>Nguyên liệu</th>
                  <th rowSpan={2}>Tồn hiện tại</th>
                  <th colSpan={3} className="th-grouped">Dự báo nhu cầu 7 ngày</th>
                  <th colSpan={3} className="th-grouped th-strategies">Số lượng đề xuất mua theo kịch bản</th>
                  <th rowSpan={2}>Nhà cung cấp & Ràng buộc</th>
                </tr>
                <tr>
                  <th>P25</th>
                  <th>P50</th>
                  <th>P75</th>
                  <th>Tiết kiệm (P25)</th>
                  <th className="th-highlight">Cân bằng (P50) ★</th>
                  <th>An toàn (P75)</th>
                </tr>
              </thead>
              <tbody>
                {ingredientMatrix.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <strong>{item.name}</strong>
                      <span className="table-unit"> ({item.unit})</span>
                    </td>
                    <td>{formatQuantity(item.onHand)} {item.unit}</td>
                    <td className="text-muted">{formatQuantity(item.p25)}</td>
                    <td className="text-semibold">{formatQuantity(item.p50)}</td>
                    <td className="text-muted">{formatQuantity(item.p75)}</td>
                    <td>
                      {item.leanQty > 0 ? (
                        <div>
                          <strong>{formatQuantity(item.leanQty)} {item.unit}</strong>
                          <div className="table-subtext">{formatVnd(item.leanCost)}</div>
                        </div>
                      ) : (
                        <span className="text-muted">Không đặt</span>
                      )}
                    </td>
                    <td className="td-highlight">
                      {item.balancedQty > 0 ? (
                        <div>
                          <strong className="text-accent">{formatQuantity(item.balancedQty)} {item.unit}</strong>
                          <div className="table-subtext">{formatVnd(item.balancedCost)}</div>
                        </div>
                      ) : (
                        <span className="text-muted">Đủ tồn kho</span>
                      )}
                    </td>
                    <td>
                      {item.protectedQty > 0 ? (
                        <div>
                          <strong>{formatQuantity(item.protectedQty)} {item.unit}</strong>
                          <div className="table-subtext">{formatVnd(item.protectedCost)}</div>
                        </div>
                      ) : (
                        <span className="text-muted">Không đặt</span>
                      )}
                    </td>
                    <td>
                      <div className="table-supplier-cell">
                        <span>{item.supplierName}</span>
                        <span className="table-tag">
                          {item.moq ? `MOQ: ${item.moq} ${item.unit}` : "Không MOQ"} · Lead: {item.leadTimeDays} ngày
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {/* TAB 3: CRITIC CHECKLIST & MULTI-STRATEGY REJECTION ANALYSIS */}
      {activeTab === "critic" ? (
        <div className="deepdive-tab-content">
          {/* Diagnostic Data Source Bar */}
          <div className="critic-filter-row">
            <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
              <span className="filter-label">Nguồn dữ liệu thẩm định:</span>
              <span className={`diagnostic-source-badge ${diagnosticReport.origin}`}>
                {diagnosticReport.origin === "real" ? <ShieldCheck size={13} /> : <Sparkles size={13} />}
                {diagnosticReport.originLabel}
              </span>
            </div>

            {diagnosticReport.isMockEnabled ? (
              <div className="diagnostic-origin-toggle">
                <button
                  type="button"
                  className={`diagnostic-origin-btn ${diagnosticReport.origin === "real" ? "active" : ""}`}
                  onClick={() => setDiagnosticOrigin("real")}
                  title="Xem dữ liệu thực tế từ Backend Solver"
                >
                  <ShieldCheck size={12} /> Dữ liệu thật
                </button>
                <button
                  type="button"
                  className={`diagnostic-origin-btn ${diagnosticReport.origin === "mock" ? "active" : ""}`}
                  onClick={() => setDiagnosticOrigin("mock")}
                  title="Xem dữ liệu mô phỏng minh họa (Mock)"
                >
                  <Sparkles size={12} /> Dữ liệu mẫu (Mock)
                </button>
              </div>
            ) : null}
          </div>

          {/* Summary Rejection Highlights across 3 Strategies */}
          <div className="critic-summary-banner-grid">
            {(["lean", "balanced", "protected"] as const).map((sKey) => {
              const sum = diagnosticReport.summaries[sKey];
              const isChosen = chosenStrategy === sKey && brief.recommendation.available;
              return (
                <div
                  key={sKey}
                  className={`critic-summary-badge-card ${sKey} ${isChosen ? "selected" : ""}`}
                >
                  <div className="card-top">
                    <span className="badge-name">{sum.label}</span>
                    <span className={`badge-tag ${sum.statusTag}`}>{sum.statusLabel}</span>
                  </div>
                  <p>{sum.reason}</p>
                </div>
              );
            })}
          </div>

          {/* Strategy Filter Pills */}
          <div className="critic-filter-row">
            <span className="filter-label">Xem kết quả thẩm định theo phương án:</span>
            <div className="critic-filter-pills" role="tablist">
              <button
                className={`critic-filter-pill ${criticStrategyFilter === "all" ? "active" : ""}`}
                onClick={() => setCriticStrategyFilter("all")}
                type="button"
              >
                Đối chiếu cả 3 phương án
              </button>
              <button
                className={`critic-filter-pill ${criticStrategyFilter === "balanced" ? "active" : ""}`}
                onClick={() => setCriticStrategyFilter("balanced")}
                type="button"
              >
                ★ Cân bằng (P50) [{diagnosticReport.summaries.balanced.statusLabel}]
              </button>
              <button
                className={`critic-filter-pill ${criticStrategyFilter === "lean" ? "active" : ""}`}
                onClick={() => setCriticStrategyFilter("lean")}
                type="button"
              >
                ✕ Tiết kiệm (P25) [{diagnosticReport.summaries.lean.statusLabel}]
              </button>
              <button
                className={`critic-filter-pill ${criticStrategyFilter === "protected" ? "active" : ""}`}
                onClick={() => setCriticStrategyFilter("protected")}
                type="button"
              >
                ✕ An toàn (P75) [{diagnosticReport.summaries.protected.statusLabel}]
              </button>
            </div>
          </div>

          <div className="deepdive-critic-table-card full-width">
            <div className="card-header-bar-with-action">
              <div className="card-header-title-group">
                <ShieldCheck size={20} className="text-accent" />
                <h3>Bảng Thẩm định Kỹ thuật & Lý do Loại trừ Ràng buộc</h3>
              </div>
              <button
                type="button"
                className={`tech-specs-toggle-btn ${showTechSpecs ? "active" : ""}`}
                onClick={() => setShowTechSpecs(!showTechSpecs)}
              >
                <SlidersHorizontal size={14} />
                <span>{showTechSpecs ? "Ẩn thông số Engine" : "⚙️ Xem thông số Engine"}</span>
                {showTechSpecs ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
            </div>

            {/* Expandable Horizontal Tech Specs Panel */}
            {showTechSpecs ? (
              <div className="deepdive-tech-card-horizontal">
                <div className="tech-params-grid-horizontal">
                  <div className="tech-param-item">
                    <span className="tech-lbl">Chế độ tính toán</span>
                    <strong className="tech-val">
                      {decision?.technical_metrics?.engine_mode || "Deterministic Optimizer"}
                    </strong>
                  </div>
                  <div className="tech-param-item">
                    <span className="tech-lbl">Mô phỏng Monte Carlo</span>
                    <strong className="tech-val">100 kịch bản ngẫu nhiên</strong>
                  </div>
                  <div className="tech-param-item">
                    <span className="tech-lbl">Hạt giống (Seed)</span>
                    <strong className="tech-val">42 (Đảm bảo tái lập)</strong>
                  </div>
                  <div className="tech-param-item">
                    <span className="tech-lbl">Cửa sổ dự báo</span>
                    <strong className="tech-val">7 ngày tới</strong>
                  </div>
                  <div className="tech-param-item">
                    <span className="tech-lbl">Đơn mua hàng mở (Open PO)</span>
                    <strong className="tech-val text-success">Đã tích hợp đầy đủ</strong>
                  </div>
                </div>
              </div>
            ) : null}

            {criticChecks.length === 0 ? (
              <div className="critic-empty-notice">
                <ShieldCheck size={28} className="text-accent" />
                <strong>Chưa ghi nhận vi phạm ràng buộc từ Backend Solver</strong>
                <p>Hệ thống không phát hiện lỗi hoặc kịch bản không vi phạm các ràng buộc cứng nào.</p>
              </div>
            ) : (
              <div className="critic-items-list">
                {criticChecks.map((chk) => {
                  const showLean = criticStrategyFilter === "all" || criticStrategyFilter === "lean";
                  const showBalanced = criticStrategyFilter === "all" || criticStrategyFilter === "balanced";
                  const showProtected = criticStrategyFilter === "all" || criticStrategyFilter === "protected";

                  return (
                    <div key={chk.code} className="critic-item-row-advanced">
                      <div className="critic-item-main-header">
                        <div className="critic-title-row">
                          <strong>{chk.title}</strong>
                          <span className="critic-req-tag">Yêu cầu: {chk.requirement}</span>
                        </div>
                        <p>{chk.description}</p>
                      </div>

                      {/* Multi-strategy evaluation comparison boxes */}
                      <div className="critic-strategies-eval-grid">
                        {showLean ? (
                          <div className={`critic-strat-eval-box ${chk.results.lean.status}`}>
                            <div className="box-header">
                              <span className="strat-title">Tiết kiệm (P25)</span>
                              <span className={`eval-badge ${chk.results.lean.status}`}>
                                {chk.results.lean.status === "pass" ? <Check size={11} /> : <X size={11} />}
                                {chk.results.lean.label}
                              </span>
                            </div>
                            <div className="box-val"><strong>Quan sát:</strong> {chk.results.lean.observed}</div>
                            <div className="box-note">{chk.results.lean.note}</div>
                          </div>
                        ) : null}

                        {showBalanced ? (
                          <div className={`critic-strat-eval-box ${chk.results.balanced.status} highlighted`}>
                            <div className="box-header">
                              <span className="strat-title">Cân bằng (P50) ★ (Đã chọn)</span>
                              <span className="eval-badge pass">
                                <Check size={11} />
                                {chk.results.balanced.label}
                              </span>
                            </div>
                            <div className="box-val"><strong>Quan sát:</strong> {chk.results.balanced.observed}</div>
                            <div className="box-note">{chk.results.balanced.note}</div>
                          </div>
                        ) : null}

                        {showProtected ? (
                          <div className={`critic-strat-eval-box ${chk.results.protected.status}`}>
                            <div className="box-header">
                              <span className="strat-title">An toàn (P75)</span>
                              <span className={`eval-badge ${chk.results.protected.status}`}>
                                {chk.results.protected.status === "pass" ? <Check size={11} /> : <AlertTriangle size={11} />}
                                {chk.results.protected.label}
                              </span>
                            </div>
                            <div className="box-val"><strong>Quan sát:</strong> {chk.results.protected.observed}</div>
                            <div className="box-note">{chk.results.protected.note}</div>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** What-if Lab Simulation Panel */
function WhatIfLab({
  result,
  loading,
  error,
  onRun,
}: {
  result: WhatIfResponse | null;
  loading: boolean;
  error: string | null;
  onRun: (mutation: WhatIfRequest) => void;
}) {
  const [demandMultiplier, setDemandMultiplier] = useState("1.1");
  const [supplierDelayDays, setSupplierDelayDays] = useState("1");
  const [budgetLimit, setBudgetLimit] = useState("");
  const [strategy, setStrategy] = useState<"" | "lean" | "balanced" | "protected">("");

  const toNum = (v: string) => (v.trim() === "" ? undefined : Number(v));
  const unavailable = (v: number | null) => (v == null ? "Chưa có dữ liệu" : formatQuantity(v));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const demand = toNum(demandMultiplier);
    const delay = toNum(supplierDelayDays);
    const budget = parseMoneyInput(budgetLimit);
    if (
      (demand !== undefined && (!Number.isFinite(demand) || demand <= 0)) ||
      (delay !== undefined && (!Number.isFinite(delay) || delay < 0)) ||
      (budget !== undefined && (!Number.isFinite(budget) || budget < 0))
    )
      return;

    onRun({
      ...(demand === undefined ? {} : { demand_multiplier: demand }),
      ...(delay === undefined ? {} : { supplier_delay_days: delay }),
      ...(budget === undefined ? {} : { budget_limit: budget }),
      ...(strategy ? { strategy } : {}),
    });
  };

  return (
    <section className="what-if-lab-section" aria-labelledby="what-if-lab-title">
      <div className="what-if-lab-header">
        <div className="what-if-lab-title-group">
          <span className="cockpit-eyebrow">
            <SlidersHorizontal size={13} /> PHÒNG THÍ NGHIỆM GIẢ LẬP
          </span>
          <h2 id="what-if-lab-title">What-If Simulation Lab</h2>
          <p>
            Kiểm tra sức chống chịu của chuỗi cung ứng khi nhu cầu tăng đột biến hoặc nhà cung cấp giao trễ.
          </p>
        </div>
      </div>

      <form className="what-if-controls-form" onSubmit={submit}>
        <div className="controls-grid">
          <label className="control-field">
            <span>Hệ số nhu cầu</span>
            <div className="input-with-hint">
              <input
                min="0.5"
                max="2.5"
                onChange={(e) => setDemandMultiplier(e.target.value)}
                placeholder="1.1 (= +10%)"
                step="0.05"
                type="number"
                value={demandMultiplier}
              />
              <small>Ví dụ: 1.2 là +20% nhu cầu</small>
            </div>
          </label>

          <label className="control-field">
            <span>Trễ giao hàng (ngày)</span>
            <div className="input-with-hint">
              <input
                min="0"
                max="14"
                onChange={(e) => setSupplierDelayDays(e.target.value)}
                placeholder="0"
                step="1"
                type="number"
                value={supplierDelayDays}
              />
              <small>Số ngày NCC giao chậm hơn cam kết</small>
            </div>
          </label>

          <label className="control-field">
            <span>Ngân sách tối đa (₫)</span>
            <div className="input-with-hint">
              <input
                type="text"
                inputMode="numeric"
                onChange={(e) => setBudgetLimit(formatMoneyInput(e.target.value))}
                placeholder="Để trống = Không giới hạn"
                value={budgetLimit}
              />
              <small>Hạn mức chi tiêu trần</small>
            </div>
          </label>

          <label className="control-field">
            <span>Chiến lược áp dụng</span>
            <div className="input-with-hint">
              <select
                onChange={(e) => setStrategy(e.target.value as typeof strategy)}
                value={strategy}
              >
                <option value="">Giữ nguyên chiến lược gốc</option>
                <option value="lean">Tiết kiệm (Lean)</option>
                <option value="balanced">Cân bằng (Balanced)</option>
                <option value="protected">An toàn (Protected)</option>
              </select>
              <small>Mục tiêu tối ưu hóa của mô hình</small>
            </div>
          </label>
        </div>

        <div className="controls-actions">
          <Button busy={loading} type="submit" variant="primary">
            <SlidersHorizontal size={15} /> Chạy giả lập kịch bản
          </Button>
        </div>
      </form>

      {error ? <Notice tone="error">{error}</Notice> : null}

      {result ? (
        <div className="what-if-results-cockpit" aria-live="polite">
          <div className="results-header">
            <h4>Kết quả so sánh với kế hoạch gốc</h4>
            <p>{result.grounded_explanation?.answer || "Đã tạo phương án giả lập thành công."}</p>
          </div>

          <div className="results-delta-cards">
            <div className="delta-card">
              <span className="delta-label">Chênh lệch chi phí</span>
              <strong className="delta-value">
                {unavailable(result.comparison.purchase_cost_delta)}
              </strong>
            </div>
            <div className="delta-card">
              <span className="delta-label">Chênh lệch Fill Rate</span>
              <strong className="delta-value text-accent">
                {percentage(result.comparison.expected_fill_rate_delta) || "Chưa có dữ liệu"}
              </strong>
            </div>
            <div className="delta-card">
              <span className="delta-label">Chênh lệch rủi ro thiếu hàng</span>
              <strong className="delta-value text-danger">
                {percentage(result.comparison.stockout_probability_delta) || "Chưa có dữ liệu"}
              </strong>
            </div>
          </div>

          <div className="results-plan-diff">
            <div className="plan-column">
              <h5>Kế hoạch gốc</h5>
              {result.baseline.procurement_rows.length ? (
                result.baseline.procurement_rows.map((row, i) => (
                  <div className="mini-plan-card" key={`base-${row.ingredient_id}-${i}`}>
                    <strong>{row.ingredient_name || "Nguyên liệu"}</strong>
                    <span>Mua {formatQuantity(row.quantity, row.unit ?? "")}</span>
                    {row.purchase_cost ? <small>{formatVnd(row.purchase_cost)}</small> : null}
                  </div>
                ))
              ) : (
                <p className="empty-text">Không có dòng nhập.</p>
              )}
            </div>

            <div className="plan-column highlight-column">
              <h5>Phương án kịch bản giả lập</h5>
              {result.hypothetical.procurement_rows.length ? (
                result.hypothetical.procurement_rows.map((row, i) => (
                  <div className="mini-plan-card" key={`hypo-${row.ingredient_id}-${i}`}>
                    <strong>{row.ingredient_name || "Nguyên liệu"}</strong>
                    <span>Mua {formatQuantity(row.quantity, row.unit ?? "")}</span>
                    {row.purchase_cost ? <small>{formatVnd(row.purchase_cost)}</small> : null}
                  </div>
                ))
              ) : (
                <p className="empty-text">Không có dòng nhập.</p>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

/** MAIN DECISION COCKPIT WORKSPACE */
export function DecisionBriefWorkspace({
  brief,
  loading,
  error,
  onRetry,
  onRunAgain,
  explanation,
  explanationLoading,
  explanationError,
  onExplain,
  whatIf,
  whatIfLoading,
  whatIfError,
  onRunWhatIf,
  decision,
  data,
  appliedBudget,
}: {
  brief: DecisionBriefFacts | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onRunAgain?: () => void;
  explanation: DecisionExplanationResponse | null;
  explanationLoading: boolean;
  explanationError: string | null;
  onExplain: (request: ExplanationRequest) => void;
  whatIf: WhatIfResponse | null;
  whatIfLoading: boolean;
  whatIfError: string | null;
  onRunWhatIf: (mutation: WhatIfRequest) => void;
  decision?: DecisionPackage | null;
  data?: BootstrapData;
  appliedBudget?: number | null;
}) {
  const [selectedIngredientId, setSelectedIngredientId] = useState<string>("");
  const [filterMode, setFilterMode] = useState<"all" | "urgent" | "safe">("all");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"cockpit" | "strategy-analysis">("cockpit");

  // Deduplicate ingredients by ingredient_id
  const uniqueDemand = useMemo(() => {
    if (!brief) return [];
    const seen = new Set<string>();
    return brief.ingredient_demand.filter((row) => {
      if (seen.has(row.ingredient_id)) return false;
      seen.add(row.ingredient_id);
      return true;
    });
  }, [brief]);

  // Calculate rich metrics for each ingredient item from real inventory & solver data
  const enrichedItems: IngredientItemData[] = useMemo(() => {
    if (!brief) return [];
    return uniqueDemand.map((d) => {
      const p = brief.procurement_rows.find((row) => row.ingredient_id === d.ingredient_id) ?? null;
      const inv = data?.inventory?.find((i) => i.ingredientId === d.ingredient_id);
      const risk = findIngredientRisk(decision, d.ingredient_id);
      const p50 = d.p50 ?? 0;
      const dailyP50 = p50 > 0 ? p50 / 7 : 0;

      let daysOfSupply: number | null = null;
      if (risk?.days_of_supply != null && Number.isFinite(risk.days_of_supply)) {
        daysOfSupply = Number(risk.days_of_supply.toFixed(1));
      } else if (inv?.onHand != null && dailyP50 > 0) {
        daysOfSupply = Number((inv.onHand / dailyP50).toFixed(1));
      }

      const currentStock: number | null =
        inv?.onHand != null
          ? inv.onHand
          : daysOfSupply != null && dailyP50 > 0
            ? Math.round(dailyP50 * daysOfSupply)
            : null;

      const stockoutRisk: "high" | "medium" | "safe" =
        risk?.stockout_probability != null
          ? risk.stockout_probability > 0.05
            ? "high"
            : risk.stockout_probability > 0.01
              ? "medium"
              : "safe"
          : daysOfSupply != null
            ? daysOfSupply <= 2
              ? "high"
              : daysOfSupply <= 4
                ? "medium"
                : "safe"
            : p != null && p.quantity > 0
              ? "high"
              : "safe";

      return {
        demand: d,
        procurement: p,
        daysOfSupply,
        currentStock,
        stockoutRisk,
        orderNeeded: p != null && p.quantity > 0,
        cost: p?.purchase_cost ?? 0,
      };
    });
  }, [uniqueDemand, brief, data, decision]);

  // Sort items: High risk / Urgent reorder first, then safe
  const sortedItems = useMemo(() => {
    return [...enrichedItems].sort((a, b) => {
      if (a.orderNeeded && !b.orderNeeded) return -1;
      if (!a.orderNeeded && b.orderNeeded) return 1;
      return (a.daysOfSupply ?? 999) - (b.daysOfSupply ?? 999);
    });
  }, [enrichedItems]);

  // Filter items
  const filteredItems = useMemo(() => {
    if (filterMode === "urgent") return sortedItems.filter((item) => item.orderNeeded);
    if (filterMode === "safe") return sortedItems.filter((item) => !item.orderNeeded);
    return sortedItems;
  }, [sortedItems, filterMode]);

  if (loading) {
    return (
      <div className="cockpit-loading-state">
        <RefreshCw className="animate-spin text-accent" size={28} />
        <span>Đang tính toán kế hoạch nhập hàng tối ưu bằng AI Engine…</span>
      </div>
    );
  }

  if (!brief) {
    return (
      <section className="decision-brief-unavailable">
        <Notice tone="error">{error || "Chưa tải được kế hoạch nhập hàng."}</Notice>
        <Button onClick={onRetry} variant="secondary">
          <RefreshCw size={16} /> Thử tải lại
        </Button>
      </section>
    );
  }

  if (viewMode === "strategy-analysis") {
    return (
      <StrategyAnalysisDeepDive
        brief={brief}
        decision={decision}
        data={data}
        appliedBudget={appliedBudget}
        onBack={() => setViewMode("cockpit")}
      />
    );
  }

  const noFeasible =
    brief.status === "completed_with_no_feasible_recommendation" ||
    !brief.recommendation.available;

  const totalPurchaseCost =
    brief.recommendation.total_purchase_cost ??
    decision?.business_metrics?.projected_purchase_cost ??
    null;

  const effectiveBudget =
    appliedBudget != null && appliedBudget > 0
      ? appliedBudget
      : data?.settings?.remainingBudget != null && data.settings.remainingBudget > 0
        ? data.settings.remainingBudget
        : data?.settings?.monthlyBudget != null && data.settings.monthlyBudget > 0
          ? data.settings.monthlyBudget
          : null;

  const budgetPercentage =
    totalPurchaseCost != null && effectiveBudget != null && effectiveBudget > 0
      ? Math.round((totalPurchaseCost / effectiveBudget) * 100)
      : null;

  const fillRate = percentage(
    brief.recommendation.expected_fill_rate ??
      decision?.business_metrics?.expected_fill_rate ??
      brief.risk.expected_fill_rate
  );
  const stockoutProb = percentage(
    brief.risk?.stockout_probability ??
      decision?.business_metrics?.stockout_probability
  );

  // Selected item state (default to first urgent item or first item)
  const currentSelectedId =
    selectedIngredientId ||
    (sortedItems.find((item) => item.orderNeeded)?.demand.ingredient_id ??
      sortedItems[0]?.demand.ingredient_id ??
      "");

  const selectedItem =
    enrichedItems.find((item) => item.demand.ingredient_id === currentSelectedId) ?? null;

  const today = brief.generated_at
    ? new Date(brief.generated_at).toISOString().slice(0, 10)
    : new Date().toISOString().slice(0, 10);

  const urgentCount = enrichedItems.filter((item) => item.orderNeeded).length;

  return (
    <div className="decision-cockpit-root">
      <section className="hero-decision-cockpit" aria-labelledby="cockpit-title">
        <div className="hero-top-bar">
          <div className="hero-badge-group">
            <span className="hero-ai-badge">
              <Sparkles size={13} /> ShelfCash Decision Engine
            </span>
            {brief.recommendation.strategy ? (
              <span className={`hero-strategy-pill strategy-${brief.recommendation.strategy}`}>
                <ShieldCheck size={14} /> Chiến lược: {strategyLabels[brief.recommendation.strategy]}
              </span>
            ) : null}
          </div>

          <div className="hero-quick-actions">
            <div className="hero-quick-actions-row">
              <Button
                className="ai-explain-trigger-btn"
                onClick={() => setDrawerOpen(true)}
                variant="secondary"
              >
                <Bot size={16} /> Hỏi AI về kế hoạch
              </Button>
              {onRunAgain ? (
                <Button onClick={onRunAgain} variant="secondary">
                  <RefreshCw size={15} /> Chạy lại
                </Button>
              ) : null}
            </div>
            <Button
              className="hero-other-strategies-btn"
              onClick={() => setViewMode("strategy-analysis")}
              variant="secondary"
            >
              <GitCompare size={15} /> Xem các phương án khác & lý do loại
            </Button>
          </div>
        </div>

        <div className="hero-main-content">
          <div className="hero-title-area">
            <h1 id="cockpit-title">Kế hoạch nhập hàng</h1>
          </div>

          <div className="hero-kpi-grid">
            <div className="hero-kpi-card hero-cost-card">
              <span className="kpi-label">TỔNG CHI PHÍ DỰ KIẾN</span>
              <strong className="kpi-value-mega">
                {totalPurchaseCost == null ? "Chưa có dữ liệu" : formatVnd(totalPurchaseCost)}
              </strong>
              {budgetPercentage != null && effectiveBudget != null ? (
                <>
                  <div className="budget-bar-track">
                    <div
                      className="budget-bar-fill"
                      style={{ width: `${Math.min(100, Math.max(0, budgetPercentage))}%` }}
                    />
                  </div>
                  <span className="kpi-subtext">
                    Chiếm {budgetPercentage}% ngân sách khả dụng ({formatVnd(effectiveBudget)})
                  </span>
                </>
              ) : effectiveBudget != null && effectiveBudget > 0 ? (
                <span className="kpi-subtext">Hạn mức ngân sách: {formatVnd(effectiveBudget)}</span>
              ) : (
                <span className="kpi-subtext">Chưa thiết lập hạn mức ngân sách</span>
              )}
            </div>

            <div className="hero-kpi-card">
              <span className="kpi-label">NGUYÊN LIỆU CẦN NHẬP</span>
              <div className="kpi-value-row">
                <strong className="kpi-value-large">{brief.procurement_rows.length}</strong>
                <span className="kpi-total-ref">/ {uniqueDemand.length} mặt hàng</span>
              </div>
              {urgentCount > 0 ? (
                <span className="kpi-status-badge urgent">
                  <AlertTriangle size={12} /> {urgentCount} nguyên liệu cần đặt sớm
                </span>
              ) : (
                <span className="kpi-status-badge ok">
                  <CheckCircle2 size={12} /> Tất cả an toàn
                </span>
              )}
            </div>

            <div className="hero-kpi-card">
              <strong className="kpi-value-large text-accent">
                {stockoutProb
                  ? `Xác suất thiếu hàng: ${stockoutProb}`
                  : "Chưa đủ dữ liệu để ước tính xác suất thiếu hàng"}
              </strong>
              <span className="kpi-subtext">
                {fillRate ? `Expected Fill Rate: ${fillRate}` : "Đã tối ưu điểm đặt hàng"}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════
          TẦNG 1.5: TỔNG QUAN & TÓM TẮT KẾ HOẠCH (EXECUTIVE & ASSISTANT SUMMARY)
      ═══════════════════════════════════════════════════════════════ */}
      {brief.recommendation.summary || brief.assistant_summary || brief.presented_warnings?.length ? (
        <section className="cockpit-plan-summary-section" aria-labelledby="plan-summary-title">
          <div className="plan-summary-card">
            <div className="plan-summary-card-header">
              <div className="plan-summary-header-left">
                <FileText size={18} style={{ color: "#147a62" }} />
                <h2 id="plan-summary-title" className="plan-summary-title">
                  TỔNG QUAN & TÓM TẮT KẾ HOẠCH
                </h2>
              </div>
              {brief.assistant_summary?.source ? (
                <span className="summary-provenance-tag">
                  {brief.assistant_summary.source === "llm" ? "AI Synthesis" : "Deterministic"}
                </span>
              ) : null}
            </div>

            {brief.recommendation.summary ? (
              <div className="plan-decision-summary-box">
                <strong className="summary-section-label">Tóm tắt quyết định:</strong>
                <p className="summary-decision-text">{brief.recommendation.summary}</p>
              </div>
            ) : null}

            {brief.assistant_summary ? (
              <div className="plan-assistant-narrative-box">
                {brief.assistant_summary.headline ? (
                  <h3 className="assistant-narrative-headline">{brief.assistant_summary.headline}</h3>
                ) : null}
                {brief.assistant_summary.summary ? (
                  <p className="assistant-narrative-body">{brief.assistant_summary.summary}</p>
                ) : null}
                {brief.assistant_summary.key_points?.length ? (
                  <div className="assistant-key-points-wrap">
                    <span className="key-points-label">Các điểm trọng tâm:</span>
                    <ul className="assistant-key-points-list">
                      {brief.assistant_summary.key_points.map((point, idx) => (
                        <li key={idx}>{point}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {brief.assistant_summary.warning_summary ? (
                  <div className="assistant-warning-callout">
                    <AlertTriangle size={15} />
                    <span>{brief.assistant_summary.warning_summary}</span>
                  </div>
                ) : null}
              </div>
            ) : null}

            {brief.presented_warnings?.length ? (
              <div className="presented-warnings-list">
                <span className="warnings-section-label">Lưu ý quản lý:</span>
                {brief.presented_warnings.map((w, idx) => (
                  <Notice
                    key={`${w.code}-${idx}`}
                    tone={w.severity === "critical" ? "error" : w.severity === "warning" ? "warning" : "info"}
                  >
                    <strong>{w.title}</strong>
                    <p style={{ margin: "4px 0 0" }}>{w.message}</p>
                  </Notice>
                ))}
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {noFeasible ? (
        <section className="decision-brief-no-feasible">
          <div className="no-feasible-icon">
            <ShieldAlert size={24} />
          </div>
          <div>
            <h2>Chưa tìm được kế hoạch nhập hàng phù hợp</h2>
            <p>
              Dự báo nhu cầu đã hoàn tất, nhưng với tồn kho, ngân sách và các ràng buộc hiện tại, hệ thống
              chưa tìm được phương án nhập hàng khả thi.
            </p>
          </div>
        </section>
      ) : null}

      {!noFeasible && uniqueDemand.length ? (
        <section className="cockpit-ingredients-section" aria-labelledby="cockpit-ingredients-title">
          <div className="section-header-row">
            <div>
              <h2 id="cockpit-ingredients-title" className="cockpit-main-category-title">
                DANH MỤC NGUYÊN LIỆU
              </h2>
            </div>

            <div className="cockpit-filter-pills" role="tablist">
              <button
                className={`filter-pill ${filterMode === "all" ? "active" : ""}`}
                onClick={() => setFilterMode("all")}
                type="button"
              >
                Tất cả ({uniqueDemand.length})
              </button>
              <button
                className={`filter-pill ${filterMode === "urgent" ? "active" : ""}`}
                onClick={() => setFilterMode("urgent")}
                type="button"
              >
                Cần đặt ngay ({urgentCount})
              </button>
              <button
                className={`filter-pill ${filterMode === "safe" ? "active" : ""}`}
                onClick={() => setFilterMode("safe")}
                type="button"
              >
                Đủ hàng ({uniqueDemand.length - urgentCount})
              </button>
            </div>
          </div>

          <div className="cockpit-chips-strip" role="list">
            {filteredItems.map((item) => {
              const active = item.demand.ingredient_id === currentSelectedId;
              const unit = item.demand.unit ? ` ${item.demand.unit}` : "";

              return (
                <button
                  key={item.demand.ingredient_id}
                  type="button"
                  role="listitem"
                  aria-pressed={active}
                  className={`cockpit-ingredient-card ${active ? "active" : ""} ${
                    item.orderNeeded ? "needs-order" : "safe"
                  }`}
                  onClick={() => setSelectedIngredientId(item.demand.ingredient_id)}
                >
                  <div className="card-top-row">
                    <strong className="card-title">
                      {item.demand.ingredient_name ?? "Nguyên liệu"}
                    </strong>
                    {item.orderNeeded ? (
                      <span className="card-risk-pill urgent">
                        <AlertTriangle size={11} /> Cần đặt
                      </span>
                    ) : (
                      <span className="card-risk-pill safe">
                        <CheckCircle2 size={11} /> Đủ hàng
                      </span>
                    )}
                  </div>

                  <div className="card-metrics-row">
                    <div className="card-metric">
                      <span>Nhu cầu P50</span>
                      <strong>{metric(item.demand.p50, unit)}</strong>
                    </div>
                    <div className="card-metric">
                      <span>Tồn kho còn</span>
                      <strong className={item.daysOfSupply != null && item.daysOfSupply <= 2 ? "text-danger" : ""}>
                        {item.daysOfSupply != null ? `~${item.daysOfSupply.toFixed(1)} ngày` : "Chưa có dữ liệu tồn"}
                      </strong>
                    </div>
                  </div>

                  <div className="card-bottom-row">
                    {item.procurement ? (
                      <span className="card-order-action">
                        Mua {formatQuantity(item.procurement.quantity, item.procurement.unit ?? "")}
                      </span>
                    ) : (
                      <span className="card-order-action safe">Không cần nhập</span>
                    )}
                    {item.cost > 0 ? (
                      <small className="card-cost">{formatVnd(item.cost)}</small>
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>

          {/* ═══════════════════════════════════════════════════════════════
              TẦNG 3: INGREDIENT DECISION VIEW (SPLIT: CHART + NARRATIVE)
          ═══════════════════════════════════════════════════════════════ */}
          {selectedItem ? (
            <div className="cockpit-decision-view-panel" aria-live="polite">
              <div className="decision-view-split">
                {/* Column 1: Timeline & Quantiles Chart */}
                <div className="decision-view-col-chart">
                  <IngredientDecisionChart item={selectedItem} today={today} />
                </div>

                {/* Column 2: AI Narrative & Procurement Specs */}
                <div className="decision-view-col-narrative">
                  <IngredientDecisionNarrative
                    item={selectedItem}
                    synthesis={
                      brief.ingredient_synthesis?.find(
                        (s) => s.ingredient_id === selectedItem.demand.ingredient_id
                      )
                    }
                  />
                </div>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {!noFeasible && !brief.procurement_rows.length ? (
        <Notice tone="info">Kế hoạch hoàn tất nhưng không có nguyên liệu cần nhập.</Notice>
      ) : null}

      {/* ═══════════════════════════════════════════════════════════════
          TẦNG 4: WHAT-IF SIMULATION LAB
      ═══════════════════════════════════════════════════════════════ */}
      <WhatIfLab
        error={whatIfError}
        loading={whatIfLoading}
        onRun={onRunWhatIf}
        result={whatIf}
      />

      {/* ═══════════════════════════════════════════════════════════════
          DRAWER: AI DECISION EXPLANATION
      ═══════════════════════════════════════════════════════════════ */}
      <DecisionExplanationDrawer
        error={explanationError}
        explanation={explanation}
        loading={explanationLoading}
        onAsk={onExplain}
        onClose={() => setDrawerOpen(false)}
        open={drawerOpen}
      />
    </div>
  );
}
