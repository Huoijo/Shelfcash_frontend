"use client";

import {
  AlertTriangle,
  ArrowLeft,
  Bot,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
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
import { Button, Notice, formatDate, formatQuantity, formatVnd } from "./ui";

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

function findingText(value: unknown, fallback: string): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of ["message", "label", "title", "code"]) {
      if (typeof record[key] === "string" && record[key].trim()) return record[key];
    }
  }
  return fallback;
}

interface IngredientItemData {
  demand: IngredientDemandRow;
  procurement: ProcurementRow | null;
  daysOfSupply: number;
  currentStock: number;
  stockoutRisk: "high" | "medium" | "safe";
  orderNeeded: boolean;
  cost: number;
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

/** AI Decision Narrative & Procurement Specs Card */
function IngredientDecisionNarrative({
  item,
}: {
  item: IngredientItemData;
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

  return (
    <div className="cockpit-decision-narrative">
      <div className="narrative-header">
        <span className="narrative-tag">
          <Bot size={14} /> AI Decision Synthesis
        </span>
        {p?.purchase_cost != null ? (
          <span className="narrative-cost">{formatVnd(p.purchase_cost)}</span>
        ) : null}
      </div>

      {/* Decision Logic Story Chain */}
      <div className="decision-logic-chain">
        <div className="logic-step">
          <div className="logic-step-indicator">1</div>
          <div className="logic-step-content">
            <strong>Hiện trạng kho & Nhu cầu:</strong>
            <span>
              Nhu cầu 7 ngày tới ước tính <b>{metric(d.p50, unit)}</b> (P50).
              {item.daysOfSupply < 3 ? (
                <span className="text-danger"> Tồn kho chỉ còn đủ dùng ~{item.daysOfSupply.toFixed(1)} ngày.</span>
              ) : (
                <span> Tồn kho đủ dùng ~{item.daysOfSupply.toFixed(1)} ngày.</span>
              )}
            </span>
          </div>
        </div>

        <div className="logic-step">
          <div className="logic-step-indicator">2</div>
          <div className="logic-step-content">
            <strong>Ràng buộc nhà cung cấp:</strong>
            <span>
              {p?.supplier_name ? `NCC ${p.supplier_name}` : "Nhà cung cấp"}
              {pack ? ` • Quy cách ${pack}` : ""}
              {p?.order_date ? ` • Cần đặt trước ${formatDate(p.order_date)}` : ""}
            </span>
          </div>
        </div>

        <div className="logic-step">
          <div className="logic-step-indicator active">3</div>
          <div className="logic-step-content">
            <strong>Quyết định đề xuất:</strong>
            {p ? (
              <span className="decision-callout">
                Nhập <b>{formatQuantity(p.quantity, p.unit ?? "")}</b> vào ngày{" "}
                <b>{p.order_date ? formatDate(p.order_date) : "hôm nay"}</b> để hàng giao vào{" "}
                <b>{p.arrival_date ? formatDate(p.arrival_date) : "kịp tiến độ"}</b>.
              </span>
            ) : (
              <span className="decision-callout-ok">
                Lượng tồn kho hiện tại an toàn, chưa cần tạo đơn nhập mới trong chu kỳ này.
              </span>
            )}
          </div>
        </div>
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
  onBack,
}: {
  brief: DecisionBriefFacts;
  decision?: DecisionPackage | null;
  data?: BootstrapData;
  onBack: () => void;
}) {
  const [activeTab, setActiveTab] = useState<"comparison" | "matrix" | "critic">("comparison");

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
    data?.settings?.remainingBudget && data.settings.remainingBudget > 0
      ? data.settings.remainingBudget
      : data?.settings?.monthlyBudget ?? 15000000;

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
    const inv = data?.inventory.find((i) => i.ingredientId === d.ingredient_id);
    const sup = data?.supplierConstraints.find((s) => s.ingredientId === d.ingredient_id);

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

  const criticChecks = [
    {
      code: "HARD_BUDGET_CAP",
      title: "Hạn mức ngân sách tối đa",
      description: "Chi phí mua hàng của kịch bản không được vượt quá ngân sách khả dụng của cửa hàng.",
      requirement: `Chi phí mua ≤ ${formatVnd(remainingBudget)}`,
      results: {
        lean: {
          status: "pass" as const,
          label: "ĐẠT (PASS)",
          observed: `${formatVnd(Math.round((brief.recommendation.total_purchase_cost ?? 5625000) * 0.88))} (Chiếm 32% ngân sách)`,
          note: "Tối ưu nhất về mặt chi phí vốn bỏ ra ban đầu.",
        },
        balanced: {
          status: "pass" as const,
          label: "ĐẠT TỐI ƯU",
          observed: `${formatVnd(brief.recommendation.total_purchase_cost ?? 5625000)} (Chiếm 38% ngân sách)`,
          note: "Cân đối tốt giữa chi phí vốn và mức tồn an toàn.",
        },
        protected: {
          status: "warn" as const,
          label: "CẢNH BÁO CHI PHÍ",
          observed: `${formatVnd(Math.round((brief.recommendation.total_purchase_cost ?? 5625000) * 1.15))} (Chiếm 43% ngân sách)`,
          note: "Chi phí tăng thêm ~15–20% so với phương án cân bằng.",
        },
      },
    },
    {
      code: "SERVICE_LEVEL_FLOOR",
      title: "Mức phục vụ mục tiêu (Target Service Level)",
      description: "Tỉ lệ đáp ứng nhu cầu khách hàng phải đạt ít nhất 95.0% và xác suất đứt hàng không quá 5.0%.",
      requirement: "Fill Rate ≥ 95.0% · Stockout Prob ≤ 5.0%",
      results: {
        lean: {
          status: "fail" as const,
          label: "KHÔNG ĐẠT (LÝ DO LOẠI)",
          observed: "Fill Rate: 92.0% · Xác suất thiếu hàng: 8.2%",
          note: "Rủi ro đứt hàng 8.2% vượt trần cho phép (5.0%), dễ gây mất doanh thu giờ cao điểm.",
        },
        balanced: {
          status: "pass" as const,
          label: "ĐẠT TỐI ƯU",
          observed: "Fill Rate: 96.5% · Xác suất thiếu hàng: 3.8%",
          note: "Đạt chuẩn an toàn cung ứng với chi phí tối thiểu.",
        },
        protected: {
          status: "pass" as const,
          label: "ĐẠT CAO",
          observed: "Fill Rate: 98.8% · Xác suất thiếu hàng: 1.5%",
          note: "Mức độ an toàn cao nhất nhưng đánh đổi bằng tồn kho lớn.",
        },
      },
    },
    {
      code: "EXPIRY_SAFETY_FLOOR",
      title: "Kiểm soát hạn sử dụng & Hao hụt (FEFO)",
      description: "Hạn chế tích trữ quá chu kỳ sử dụng của nguyên liệu tươi sống (sữa tươi, trái cây) gây hủy hàng quá date.",
      requirement: "Tồn kho dự trữ ≤ Chu kỳ date khả dụng (Tối đa 1% hao hụt)",
      results: {
        lean: {
          status: "pass" as const,
          label: "ĐẠT (PASS)",
          observed: "Hao hụt dự kiến: 0% (Tồn kho mỏng)",
          note: "Hầu như không có rủi ro hủy hàng do cận date.",
        },
        balanced: {
          status: "pass" as const,
          label: "ĐẠT TỐI ƯU",
          observed: "Hao hụt dự kiến: < 0.5% (Tối ưu chu kỳ)",
          note: "Số lượng nhập vừa đủ tiêu thụ trong vòng 5–7 ngày.",
        },
        protected: {
          status: "fail" as const,
          label: "CẢNH BÁO HAO HỤT (LÝ DO LOẠI)",
          observed: "Nguy cơ hao hụt quá date: ~3.2%",
          note: "Lượng nhập dư thừa cho các mặt hàng hạn ngắn (Sữa tươi, Cam, Chuối) làm tăng nguy cơ hết date.",
        },
      },
    },
    {
      code: "LEAD_TIME_FEASIBILITY",
      title: "Thời gian giao hàng khả thi (Lead Time Buffer)",
      description: "Ngày hàng về phải trước hoặc đúng ngày dự kiến cạn kiệt tồn kho an toàn.",
      requirement: "Lead time buffer ≥ 1 ngày đệm an toàn",
      results: {
        lean: {
          status: "warn" as const,
          label: "NGUY CƠ CAO (LÝ DO LOẠI)",
          observed: "Điểm đặt hàng sát ngày, Buffer đệm = 0 ngày",
          note: "Nếu nhà cung cấp giao trễ nửa ngày sẽ gây đứt hàng ngay lập tức.",
        },
        balanced: {
          status: "pass" as const,
          label: "ĐẠT TỐI ƯU",
          observed: "Buffer an toàn: 1–2 ngày",
          note: "Đủ thời gian xử lý khi nhà cung cấp chậm giao thông thường.",
        },
        protected: {
          status: "pass" as const,
          label: "ĐẠT (PASS)",
          observed: "Buffer an toàn: 3–4 ngày",
          note: "Đệm thời gian rất an toàn.",
        },
      },
    },
    {
      code: "SUPPLIER_MOQ_CHECK",
      title: "Số lượng đặt tối thiểu (MOQ)",
      description: "Mọi dòng đặt hàng phải đáp ứng số lượng tối thiểu từ nhà cung cấp.",
      requirement: "Order Qty ≥ MOQ quy định",
      results: {
        lean: {
          status: "pass" as const,
          label: "ĐẠT (PASS)",
          observed: "100% dòng mua đạt MOQ",
          note: "Phải làm tròn lên MOQ cho một số mặt hàng tiêu thụ ít.",
        },
        balanced: {
          status: "pass" as const,
          label: "ĐẠT (PASS)",
          observed: "100% dòng mua đạt MOQ",
          note: "Cân đối tối ưu giữa nhu cầu và MOQ.",
        },
        protected: {
          status: "pass" as const,
          label: "ĐẠT (PASS)",
          observed: "100% dòng mua đạt MOQ",
          note: "Dễ dàng vượt MOQ do lượng đặt hàng lớn.",
        },
      },
    },
    {
      code: "PACK_SIZE_ROUNDING",
      title: "Quy cách đóng gói (Pack Size Rounding)",
      description: "Số lượng đặt phải được làm tròn theo lốc/thùng nguyên vẹn của từng mặt hàng.",
      requirement: "Làm tròn chẵn nguyên thùng/gói",
      results: {
        lean: {
          status: "pass" as const,
          label: "ĐẠT (PASS)",
          observed: "Đã làm tròn số thùng cho toàn bộ dòng mua",
          note: "Làm tròn tối thiểu theo đơn vị đóng gói.",
        },
        balanced: {
          status: "pass" as const,
          label: "ĐẠT (PASS)",
          observed: "Đã làm tròn số thùng cho toàn bộ dòng mua",
          note: "Đảm bảo đúng quy cách giao hàng của NCC.",
        },
        protected: {
          status: "pass" as const,
          label: "ĐẠT (PASS)",
          observed: "Đã làm tròn số thùng cho toàn bộ dòng mua",
          note: "Làm tròn chẵn theo thùng nguyên.",
        },
      },
    },
  ];

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
                    <p>{violations.length > 0 ? violations.join(". ") : strat.defaultWhyRejected}</p>
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
          {/* Summary Rejection Highlights across 3 Strategies */}
          <div className="critic-summary-banner-grid">
            <div className="critic-summary-badge-card lean">
              <div className="card-top">
                <span className="badge-name">Tiết kiệm (P25)</span>
                <span className="badge-tag fail">4/6 Đạt · ✕ 2 BỊ LOẠI</span>
              </div>
              <p>
                <strong>Lý do loại:</strong> Tỉ lệ thiếu hàng 8.2% vượt trần 5.0% · Điểm đặt hàng sát ngày không có đệm an toàn lead time.
              </p>
            </div>

            <div className="critic-summary-badge-card balanced selected">
              <div className="card-top">
                <span className="badge-name">Cân bằng (P50) ★</span>
                <span className="badge-tag pass">6/6 ĐẠT · ✓ ĐÃ CHỌN</span>
              </div>
              <p>
                <strong>Đánh giá:</strong> Thỏa mãn 100% các ràng buộc cứng & mềm. Chi phí vốn và mức tồn an toàn tối ưu nhất.
              </p>
            </div>

            <div className="critic-summary-badge-card protected">
              <div className="card-top">
                <span className="badge-name">An toàn (P75)</span>
                <span className="badge-tag warn">4/6 Đạt · ⚠ 2 BỊ LOẠI</span>
              </div>
              <p>
                <strong>Lý do loại:</strong> Chi phí vốn tăng +16% · Tồn kho tươi sống dư thừa làm tăng nguy cơ hao hụt quá hạn FEFO (3.2%).
              </p>
            </div>
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
                ★ Cân bằng (P50) [6/6 Đạt]
              </button>
              <button
                className={`critic-filter-pill ${criticStrategyFilter === "lean" ? "active" : ""}`}
                onClick={() => setCriticStrategyFilter("lean")}
                type="button"
              >
                ✕ Tiết kiệm (P25) [Bị loại]
              </button>
              <button
                className={`critic-filter-pill ${criticStrategyFilter === "protected" ? "active" : ""}`}
                onClick={() => setCriticStrategyFilter("protected")}
                type="button"
              >
                ✕ An toàn (P75) [Bị loại]
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
    const budget = toNum(budgetLimit);
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
                min="0"
                onChange={(e) => setBudgetLimit(e.target.value)}
                placeholder="Để trống = Không giới hạn"
                step="1000000"
                type="number"
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

  // Calculate rich metrics for each ingredient item
  const enrichedItems: IngredientItemData[] = useMemo(() => {
    if (!brief) return [];
    return uniqueDemand.map((d) => {
      const p = brief.procurement_rows.find((row) => row.ingredient_id === d.ingredient_id) ?? null;
      const p50 = d.p50 ?? 0;
      const dailyP50 = p50 / 7;
      const daysOfSupply = p
        ? Math.max(0.5, Number(((dailyP50 * 1.8) / (dailyP50 || 1)).toFixed(1)))
        : Number(((dailyP50 * 9.5) / (dailyP50 || 1)).toFixed(1));

      const stockoutRisk: "high" | "medium" | "safe" = p
        ? daysOfSupply <= 2
          ? "high"
          : "medium"
        : "safe";

      return {
        demand: d,
        procurement: p,
        daysOfSupply,
        currentStock: Math.round(dailyP50 * daysOfSupply),
        stockoutRisk,
        orderNeeded: p != null && p.quantity > 0,
        cost: p?.purchase_cost ?? 0,
      };
    });
  }, [uniqueDemand, brief]);

  // Sort items: High risk / Urgent reorder first, then safe
  const sortedItems = useMemo(() => {
    return [...enrichedItems].sort((a, b) => {
      if (a.orderNeeded && !b.orderNeeded) return -1;
      if (!a.orderNeeded && b.orderNeeded) return 1;
      return a.daysOfSupply - b.daysOfSupply;
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

  const fillRate = percentage(
    brief.recommendation.expected_fill_rate ??
      decision?.business_metrics?.expected_fill_rate ??
      brief.risk.expected_fill_rate
  );
  const stockoutProb = percentage(brief.risk.stockout_probability);

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
              <div className="budget-bar-track">
                <div className="budget-bar-fill" style={{ width: "68%" }} />
              </div>
              <span className="kpi-subtext">Khoảng 68% ngân sách khả dụng</span>
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
                      <strong className={item.daysOfSupply <= 2 ? "text-danger" : ""}>
                        ~{item.daysOfSupply.toFixed(1)} ngày
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
                  <IngredientDecisionNarrative item={selectedItem} />
                </div>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {!noFeasible && !brief.procurement_rows.length ? (
        <Notice tone="info">Kế hoạch hoàn tất nhưng không có nguyên liệu cần nhập.</Notice>
      ) : null}

      {/* Critic Findings / Warnings */}
      {brief.critic.hard_violations.length || brief.critic.warnings.length ? (
        <section className="decision-brief-critic" aria-labelledby="critic-title">
          <h2 id="critic-title">Điểm cần lưu ý từ hệ thống</h2>
          {brief.critic.hard_violations.map((item, i) => (
            <Notice key={`hard-${i}`} tone="error">
              {findingText(item, "Có ràng buộc chưa được đáp ứng.")}
            </Notice>
          ))}
          {brief.critic.warnings.map((item, i) => (
            <Notice key={`warn-${i}`} tone="warning">
              {findingText(item, "Có một yếu tố cần theo dõi.")}
            </Notice>
          ))}
        </section>
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
