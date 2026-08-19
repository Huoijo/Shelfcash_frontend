"use client";

import { useMemo, useState } from "react";
import { adaptDecisionRunView } from "../../lib/decision-view";
import type { BootstrapData, DecisionPackage } from "../../lib/types";
import { DemandExplanationDialog } from "./ProcurementDecisionWorkspace";
import {
  Button,
  Details,
  Notice,
  SectionHeading,
  StatCard,
  SummaryGrid,
  formatDate,
  formatQuantity,
} from "./ui";

function quantity(value: number | null, unit = ""): string {
  return value == null ? "—" : formatQuantity(value, unit);
}

function percentage(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const percent = value <= 1 ? value * 100 : value;
  return `${percent.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%`;
}

function statusCopy(status: string): { title: string; detail: string } {
  if (status === "completed_with_no_feasible_recommendation") {
    return {
      title: "Đã mô phỏng, chưa có phương án nhập khả thi",
      detail:
        "Nhu cầu và tồn kho đã được tính, nhưng hệ thống không tìm được tổ hợp mua hàng thỏa toàn bộ ràng buộc.",
    };
  }
  return {
    title: "Mô phỏng đã hoàn tất",
    detail: "Dữ liệu dưới đây phản ánh nhu cầu và tồn kho trong khoảng thời gian đã chọn.",
  };
}

export function SimulationResultPanel({
  data,
  decision,
  running,
}: {
  data: BootstrapData;
  decision: DecisionPackage;
  running: boolean;
}) {
  const view = useMemo(() => adaptDecisionRunView(decision, data), [data, decision]);
  const [requestedDate, setRequestedDate] = useState("");
  const [drawerKey, setDrawerKey] = useState("");
  const selectedDate = view.dates.includes(requestedDate)
    ? requestedDate
    : view.dates[0] || "";
  const rows = view.demand.filter((item) => item.targetDate === selectedDate);
  const selectedRow = rows.find(
    (item) => `${item.ingredientId}-${item.targetDate}` === drawerKey,
  );
  const ingredientCount = new Set(view.demand.map((item) => item.ingredientId)).size;
  const status = statusCopy(decision.status);
  const technical = decision.technical_metrics;

  if (running) {
    return (
      <Notice tone="info">
        Đang chạy mô phỏng tồn kho và kiểm tra các ràng buộc mua hàng…
      </Notice>
    );
  }

  return (
    <div className="decision-center">
      <section className="decision-summary" aria-labelledby="simulation-result-title">
        <span className="eyebrow">Kết quả mô phỏng</span>
        <h2 id="simulation-result-title">{status.title}</h2>
        <p>{status.detail}</p>
        <SummaryGrid columns={4}>
          <StatCard label="Kỳ mô phỏng" value={`${decision.horizon_days ?? view.dates.length} ngày`} status="info" />
          <StatCard label="Nguyên liệu đã tính" value={ingredientCount.toLocaleString("vi-VN")} />
          <StatCard label="Có nguy cơ thiếu" value={view.risks.length.toLocaleString("vi-VN")} status={view.risks.length ? "warning" : "success"} />
          <StatCard label="Phương án mua khả thi" value={decision.recommended_strategy ? "Có" : "Chưa có"} status={decision.recommended_strategy ? "success" : "warning"} />
        </SummaryGrid>
      </section>

      <section className="procurement-demand" aria-labelledby="simulation-demand-title">
        <SectionHeading
          title="Nhu cầu nguyên liệu theo ngày"
          description="P50 là nhu cầu dự kiến; P25–P75 là khoảng biến động theo dự báo."
          action={
            selectedDate ? <span className="page-header-context">{formatDate(selectedDate)}</span> : undefined
          }
        />
        {view.dates.length ? (
          <div className="procurement-date-tabs" role="tablist" aria-label="Ngày mô phỏng">
            {view.dates.map((date) => (
              <button
                aria-selected={selectedDate === date}
                className={selectedDate === date ? "active" : ""}
                key={date}
                onClick={() => setRequestedDate(date)}
                role="tab"
                type="button"
              >
                {formatDate(date)}
              </button>
            ))}
          </div>
        ) : null}
        {rows.length ? (
          <div className="procurement-demand-list">
            {rows.map((row) => (
              <article className="procurement-demand-card" key={`${row.ingredientId}-${row.targetDate}`}>
                <div>
                  <h3 title={row.ingredientName}>{row.ingredientName}</h3>
                  <p>{quantity(row.p50, row.unit)} dự kiến</p>
                  <small>Khoảng {quantity(row.p25, row.unit)} – {quantity(row.p75, row.unit)}</small>
                </div>
                <div className="procurement-demand-card-action">
                  <span>Đến từ {row.contributions.length} món</span>
                  <Button onClick={() => setDrawerKey(`${row.ingredientId}-${row.targetDate}`)} variant="secondary">
                    Xem cách tính
                  </Button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <Notice tone="info">Backend chưa trả nhu cầu nguyên liệu cho lượt mô phỏng này.</Notice>
        )}
      </section>

      <section aria-labelledby="simulation-risk-title">
        <SectionHeading
          title="Rủi ro tồn kho trong mô phỏng"
          description="Dựa trên mô phỏng FEFO của backend, không phải đề xuất đặt hàng."
          action={view.risks.length ? <span className="page-header-context">{view.risks.length} nguyên liệu</span> : undefined}
        />
        {view.risks.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Nguyên liệu</th>
                  <th>Thiếu từ</th>
                  <th>Thiếu dự kiến</th>
                  <th>Tồn đầu kỳ</th>
                  <th>Mức đáp ứng</th>
                </tr>
              </thead>
              <tbody>
                {view.risks.map((risk) => (
                  <tr key={risk.ingredientId}>
                    <td><strong>{risk.ingredientName}</strong></td>
                    <td>{risk.stockoutDate ? formatDate(risk.stockoutDate) : "—"}</td>
                    <td>{quantity(risk.shortageQuantity, risk.unit)}</td>
                    <td>{quantity(risk.beginningInventory, risk.unit)}</td>
                    <td>{percentage(risk.fillRate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Notice tone="success">Không phát hiện nguyên liệu có nguy cơ thiếu trong mô phỏng này.</Notice>
        )}
      </section>

      {view.warnings.length ? (
        <Details summary={`Lưu ý về kết quả (${view.warnings.length})`}>
          <ul className="warning-list">
            {view.warnings.map((warning, index) => <li key={`${warning}-${index}`}>{warning}</li>)}
          </ul>
        </Details>
      ) : null}

      <Details summary="Thông tin kỹ thuật mô phỏng">
        <ul className="warning-list">
          <li>Engine: {technical?.baseline_engine || technical?.engine_mode || "—"}</li>
          <li>Phương pháp kịch bản: {technical?.scenario_method || "—"}</li>
          <li>Số kịch bản: {technical?.scenario_count ?? "—"}</li>
        </ul>
      </Details>

      {selectedRow ? <DemandExplanationDialog onClose={() => setDrawerKey("")} row={selectedRow} /> : null}
    </div>
  );
}
