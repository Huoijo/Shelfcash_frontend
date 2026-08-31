"use client";

import { AlertCircle, CheckCircle2, Play, Sparkles, Trash2, X } from "lucide-react";
import React, { useState } from "react";
import type { OpportunityCandidate, TrialPortfolio } from "../../../lib/opportunity/types";

interface TrialPortfolioViewProps {
  portfolio: TrialPortfolio;
  selectedCandidates: OpportunityCandidate[];
  onRemoveCandidate: (candidateId: string) => void;
}

export function TrialPortfolioView({
  portfolio,
  selectedCandidates,
  onRemoveCandidate,
}: TrialPortfolioViewProps) {
  const [showPreviewModal, setShowPreviewModal] = useState(false);

  const formatCurrency = (val: number) =>
    val.toLocaleString("vi-VN") + " ₫";

  const percentUsed =
    portfolio.budget > 0
      ? Math.min(100, Math.round((portfolio.allocatedCost / portfolio.budget) * 100))
      : 0;

  return (
    <section className="opportunity-section" aria-labelledby="heading-trial-portfolio">
      <div className="opp-section-header">
        <div className="opp-section-title-wrap">
          <h2 id="heading-trial-portfolio" className="opp-section-title">
            DANH MỤC THỬ NGHIỆM
          </h2>
          <span className="opp-count-badge">{selectedCandidates.length} ứng viên đã chọn</span>
        </div>
      </div>

      <div className="opp-portfolio-card">
        {/* Budget Metrics Summary */}
        <div className="opp-portfolio-budget-grid">
          <div className="opp-port-stat">
            <span className="opp-port-stat-label">Ngân sách thử</span>
            <span className="opp-port-stat-val">{formatCurrency(portfolio.budget)}</span>
          </div>

          <div className="opp-port-stat">
            <span className="opp-port-stat-label">Chi phí dự kiến</span>
            <span className="opp-port-stat-val text-emerald-700 font-semibold">
              {formatCurrency(portfolio.allocatedCost)}
            </span>
          </div>

          <div className="opp-port-stat">
            <span className="opp-port-stat-label">Ngân sách còn lại</span>
            <span className="opp-port-stat-val text-slate-700">
              {formatCurrency(portfolio.remainingBudget)}
            </span>
          </div>
        </div>

        {/* Visual Progress Bar */}
        <div className="opp-budget-progress-wrap">
          <div className="opp-budget-progress-track">
            <div
              className={`opp-budget-progress-fill ${
                percentUsed > 100 ? "fill-overbudget" : "fill-normal"
              }`}
              style={{ width: `${percentUsed}%` }}
            />
          </div>
          <div className="opp-budget-progress-labels">
            <span>Đã phân bổ {percentUsed}% ngân sách</span>
            <span>{selectedCandidates.length} món</span>
          </div>
        </div>

        {/* Selected Candidate Items */}
        {selectedCandidates.length > 0 ? (
          <div className="opp-portfolio-items-list">
            {selectedCandidates.map((cand) => (
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
                    {formatCurrency(cand.trialCost)}
                  </span>
                  <button
                    type="button"
                    className="opp-port-remove-btn"
                    onClick={() => onRemoveCandidate(cand.id)}
                    title="Bỏ khỏi danh mục thử"
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
            <p>Chưa có món nào được chọn vào danh mục thử nghiệm. Hãy bấm "Thêm vào thử nghiệm" ở danh sách gợi ý phía trên.</p>
          </div>
        )}

        {/* Action Trigger */}
        <div className="opp-portfolio-footer-actions">
          <button
            type="button"
            className="btn-opp-start-trial"
            disabled={selectedCandidates.length === 0}
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
                Xem trước danh mục thử nghiệm
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
              <p className="opp-dialog-msg">
                Danh mục thử nghiệm gồm <strong>{selectedCandidates.length} món</strong> với tổng chi phí ước tính <strong>{formatCurrency(portfolio.allocatedCost)}</strong> đã sẵn sàng để xem trước.
              </p>
              <div className="opp-dialog-note">
                <AlertCircle size={15} className="text-slate-500 shrink-0 mt-0.5" />
                <span>
                  Khởi tạo thử nghiệm và đồng bộ vào quy trình vận hành sẽ khả dụng khi dịch vụ kết nối với Backend.
                </span>
              </div>
            </div>

            <div className="opp-dialog-footer">
              <button
                type="button"
                className="btn-opp-dialog-primary"
                onClick={() => setShowPreviewModal(false)}
              >
                Đã hiểu
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
