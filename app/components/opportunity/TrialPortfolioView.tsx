"use client";

import {
  AlertCircle,
  CheckCircle2,
  HelpCircle,
  Play,
  RotateCcw,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import React, { useState } from "react";
import { formatVnd, getWhyPortfolioReasons, type PortfolioMetrics } from "../../../lib/opportunity/portfolio-selector";
import type { OpportunityCandidate } from "../../../lib/opportunity/types";

interface TrialPortfolioViewProps {
  metrics: PortfolioMetrics;
  selectedCandidates: OpportunityCandidate[];
  onRemoveCandidate: (candidateId: string) => void;
  onRestoreRecommendation?: () => void;
}

export function TrialPortfolioView({
  metrics,
  selectedCandidates,
  onRemoveCandidate,
  onRestoreRecommendation,
}: TrialPortfolioViewProps) {
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [showWhyTooltip, setShowWhyTooltip] = useState(false);

  // Preserve rank ascending order (#1, #2, #5...)
  const sortedCandidates = [...selectedCandidates].sort((a, b) => a.rank - b.rank);

  const percentUsed = metrics.budget > 0
    ? Math.min(100, Math.round((metrics.totalCost / metrics.budget) * 100))
    : 0;

  const whyReasons = getWhyPortfolioReasons(sortedCandidates, metrics.budget);

  return (
    <section className="opportunity-section" aria-labelledby="heading-trial-portfolio">
      <div className="opp-section-header">
        <div className="opp-section-title-wrap">
          <h2 id="heading-trial-portfolio" className="opp-section-title">
            DANH MỤC THỬ NGHIỆM
          </h2>
          <span className="opp-count-badge">
            {metrics.candidateCount} ứng viên đã chọn
          </span>
          {metrics.source === "user_adjusted" && (
            <span className="opp-adjusted-badge" title="Danh mục đã được người dùng chỉnh sửa">
              Đã điều chỉnh
            </span>
          )}
        </div>

        {/* Why this portfolio action */}
        {sortedCandidates.length > 0 && (
          <div className="opp-why-portfolio-action-wrap">
            <button
              type="button"
              className="btn-opp-why-portfolio"
              onClick={() => setShowWhyTooltip((prev) => !prev)}
              aria-expanded={showWhyTooltip}
            >
              <HelpCircle size={14} className="text-emerald-700" />
              <span>Vì sao chọn danh mục này?</span>
            </button>
          </div>
        )}
      </div>

      {/* Why this portfolio reasoning popover */}
      {showWhyTooltip && sortedCandidates.length > 0 && (
        <div className="opp-why-portfolio-popover" role="region" aria-label="Lý do đề xuất danh mục">
          <div className="opp-why-popover-header">
            <div className="flex items-center gap-2">
              <Sparkles size={14} className="text-emerald-600" />
              <strong className="text-xs font-semibold text-slate-800">
                CƠ SỞ TỐI ƯU TỔ HỢP THỬ NGHIỆM
              </strong>
            </div>
            <button
              type="button"
              className="opp-why-close-btn"
              onClick={() => setShowWhyTooltip(false)}
              aria-label="Đóng giải thích"
            >
              <X size={13} />
            </button>
          </div>
          <ul className="opp-why-reasons-list">
            {whyReasons.map((r, i) => (
              <li key={i} className="opp-why-reason-item">
                <CheckCircle2 size={13} className="text-emerald-600 shrink-0 mt-0.5" />
                <span>{r}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="opp-portfolio-card">
        {/* Budget Metrics Summary */}
        <div className="opp-portfolio-budget-grid">
          <div className="opp-port-stat">
            <span className="opp-port-stat-label">Ngân sách thử</span>
            <span className="opp-port-stat-val">{formatVnd(metrics.budget)}</span>
          </div>

          <div className="opp-port-stat">
            <span className="opp-port-stat-label">Chi phí dự kiến</span>
            <span className="opp-port-stat-val text-emerald-700 font-semibold">
              {formatVnd(metrics.totalCost)}
            </span>
          </div>

          <div className="opp-port-stat">
            <span className="opp-port-stat-label">Ngân sách còn lại</span>
            <span className={`opp-port-stat-val ${metrics.remainingBudget < 0 ? "text-rose-600" : "text-slate-700"}`}>
              {formatVnd(metrics.remainingBudget)}
            </span>
          </div>
        </div>

        {/* Visual Progress Bar */}
        <div className="opp-budget-progress-wrap">
          <div className="opp-budget-progress-track">
            <div
              className={`opp-budget-progress-fill ${
                metrics.remainingBudget < 0 ? "fill-overbudget" : "fill-normal"
              }`}
              style={{ width: `${Math.min(100, Math.max(0, percentUsed))}%` }}
            />
          </div>
          <div className="opp-budget-progress-labels">
            <span>Đã phân bổ {percentUsed}% ngân sách</span>
            <span>{metrics.candidateCount} ứng viên</span>
          </div>
        </div>

        {/* Selected Candidate Items (Rank-preserved: #1, #2, #5...) */}
        {sortedCandidates.length > 0 ? (
          <div className="opp-portfolio-items-list">
            {sortedCandidates.map((cand) => (
              <div key={cand.id} className="opp-portfolio-item-row">
                <div className="opp-port-item-info">
                  <span className="opp-port-item-rank">#{cand.rank}</span>
                  <div className="opp-port-item-name-group">
                    <strong className="opp-port-item-name">{cand.name}</strong>
                    <span className="opp-port-item-cat">{cand.category}</span>
                  </div>
                </div>

                <div className="opp-port-item-meta">
                  <span className="opp-port-item-cost">
                    {formatVnd(cand.trialCost)}
                  </span>
                  <button
                    type="button"
                    className="opp-port-remove-btn"
                    onClick={() => onRemoveCandidate(cand.id)}
                    title={`Bỏ ${cand.name} khỏi danh mục`}
                    aria-label={`Bỏ ${cand.name} khỏi danh mục`}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="opp-portfolio-empty-hint">
            <p className="font-medium text-slate-700">Chưa có ứng viên nào được chọn.</p>
            <p className="text-xs text-slate-500 mt-1">
              Hãy bấm "Thêm vào thử nghiệm" ở danh sách gợi ý phía trên để xây dựng danh mục.
            </p>
          </div>
        )}

        {/* Action Footer: Restore recommendation + Start Trial */}
        <div className="opp-portfolio-footer-actions">
          {metrics.source === "user_adjusted" && onRestoreRecommendation && (
            <button
              type="button"
              className="btn-opp-restore-recom"
              onClick={onRestoreRecommendation}
              title="Khôi phục danh mục đề xuất tối ưu ban đầu"
            >
              <RotateCcw size={14} />
              <span>Khôi phục đề xuất</span>
            </button>
          )}

          <button
            type="button"
            className="btn-opp-start-trial"
            disabled={!metrics.feasible}
            onClick={() => setShowPreviewModal(true)}
          >
            <Play size={16} />
            <span>Bắt đầu thử nghiệm</span>
          </button>
        </div>
      </div>

      {/* Preview Confirmation Modal */}
      {showPreviewModal && (
        <div className="opp-modal-overlay" onClick={() => setShowPreviewModal(false)}>
          <div
            className="opp-preview-dialog"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="opp-dialog-title"
          >
            <div className="opp-dialog-header">
              <div className="opp-dialog-icon">
                <Sparkles size={20} className="text-emerald-600" />
              </div>
              <h3 id="opp-dialog-title" className="opp-dialog-title">
                SẴN SÀNG THỬ NGHIỆM
              </h3>
              <button
                type="button"
                className="opp-dialog-close"
                onClick={() => setShowPreviewModal(false)}
                aria-label="Đóng"
              >
                <X size={16} />
              </button>
            </div>

            <div className="opp-dialog-body">
              <div className="opp-confirm-candidates-summary">
                <div className="opp-confirm-count-lead">
                  <strong>{sortedCandidates.length} ứng viên</strong>
                </div>

                <div className="opp-confirm-candidates-list">
                  {sortedCandidates.map((c) => (
                    <div key={c.id} className="opp-confirm-candidate-line">
                      <span>#{c.rank} {c.name}</span>
                      <span className="font-semibold text-slate-800">{formatVnd(c.trialCost)}</span>
                    </div>
                  ))}
                </div>
              </div>

              <hr className="opp-confirm-divider" />

              <div className="opp-confirm-finance-block">
                <div className="opp-confirm-finance-row">
                  <span className="text-slate-600">Tổng chi phí dự kiến</span>
                  <strong className="text-emerald-700">{formatVnd(metrics.totalCost)}</strong>
                </div>
                <div className="opp-confirm-finance-row">
                  <span className="text-slate-600">Ngân sách</span>
                  <span>{formatVnd(metrics.budget)}</span>
                </div>
                <div className="opp-confirm-finance-row">
                  <span className="text-slate-600">Còn lại</span>
                  <span className="font-medium text-slate-800">{formatVnd(metrics.remainingBudget)}</span>
                </div>
              </div>

              <div className="opp-confirm-preview-badge-box">
                <span className="opp-confirm-preview-pill">PREVIEW MODE</span>
                <p className="opp-confirm-preview-text">
                  Danh mục đã sẵn sàng để xem trước. Khởi tạo thử nghiệm sẽ khả dụng khi dịch vụ Trial được kết nối.
                </p>
              </div>
            </div>

            <div className="opp-dialog-footer">
              <button
                type="button"
                className="btn-opp-dialog-secondary"
                onClick={() => setShowPreviewModal(false)}
              >
                Quay lại
              </button>
              <button
                type="button"
                className="btn-opp-dialog-primary"
                onClick={() => setShowPreviewModal(false)}
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
