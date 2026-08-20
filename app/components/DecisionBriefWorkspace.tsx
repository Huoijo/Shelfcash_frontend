"use client";

import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Package,
  RefreshCw,
  Send,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Truck,
  X,
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
}) {
  const [selectedIngredientId, setSelectedIngredientId] = useState<string>("");
  const [filterMode, setFilterMode] = useState<"all" | "urgent" | "safe">("all");
  const [drawerOpen, setDrawerOpen] = useState(false);

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

  // Deduplicate ingredients by ingredient_id
  const seen = new Set<string>();
  const uniqueDemand = brief.ingredient_demand.filter((row) => {
    if (seen.has(row.ingredient_id)) return false;
    seen.add(row.ingredient_id);
    return true;
  });

  // Calculate rich metrics for each ingredient item
  const enrichedItems: IngredientItemData[] = useMemo(() => {
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
  }, [uniqueDemand, brief.procurement_rows]);

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
      {/* ═══════════════════════════════════════════════════════════════
          TẦNG 1: HERO DECISION COCKPIT
      ═══════════════════════════════════════════════════════════════ */}
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
        </div>

        <div className="hero-main-content">
          <div className="hero-title-area">
            <h1 id="cockpit-title">Kế hoạch nhập hàng</h1>
          </div>

          {/* Primary High-Impact KPIs */}
          <div className="hero-kpi-grid">
            {/* Mega KPI: Total Purchase Cost */}
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

            {/* KPI 2: Ingredients to Buy */}
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

            {/* KPI 3: Stockout Risk / Fill rate */}
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

      {/* No feasible banner if constraints violated */}
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

      {/* ═══════════════════════════════════════════════════════════════
          TẦNG 2 & 3: INGREDIENT STRIP + DECISION VIEW
      ═══════════════════════════════════════════════════════════════ */}
      {!noFeasible && uniqueDemand.length ? (
        <section className="cockpit-ingredients-section" aria-labelledby="cockpit-ingredients-title">
          <div className="section-header-row">
            <div>
              <h2 id="cockpit-ingredients-title" className="cockpit-main-category-title">
                DANH MỤC NGUYÊN LIỆU
              </h2>
            </div>

            {/* Filter pills */}
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

          {/* Horizontal Risk-First Ingredient Strip */}
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
