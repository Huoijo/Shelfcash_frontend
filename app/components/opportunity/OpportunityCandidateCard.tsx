"use client";

import { Check, CheckCircle2, ChevronRight, Info, Plus, Sparkles } from "lucide-react";
import React from "react";
import type { OpportunityCandidate } from "../../../lib/opportunity/types";

interface OpportunityCandidateCardProps {
  candidate: OpportunityCandidate;
  isSelectedInPortfolio: boolean;
  onInspect: (candidate: OpportunityCandidate) => void;
  onTogglePortfolio: (candidate: OpportunityCandidate) => void;
}

export function OpportunityCandidateCard({
  candidate,
  isSelectedInPortfolio,
  onInspect,
  onTogglePortfolio,
}: OpportunityCandidateCardProps) {
  const domainBadgeLabel =
    candidate.domain === "same_domain" ? "CÙNG NGÀNH" : "THỬ NGHIỆM MỞ RỘNG";
  const domainBadgeClass =
    candidate.domain === "same_domain" ? "badge-same-domain" : "badge-cross-domain";

  const formatCurrency = (val: number) =>
    val.toLocaleString("vi-VN") + " ₫";

  return (
    <div className={`opp-candidate-card ${isSelectedInPortfolio ? "is-selected" : ""}`}>
      {/* Top Bar: Rank, Name, Domain */}
      <div className="opp-card-topbar">
        <div className="opp-card-identity">
          <span className="opp-rank-tag">#{candidate.rank}</span>
          <div className="opp-name-group">
            <h3 className="opp-candidate-name">{candidate.name}</h3>
            <span className="opp-candidate-category">{candidate.category}</span>
          </div>
        </div>

        <div className="opp-card-badges">
          <span className={`opp-domain-badge ${domainBadgeClass}`}>
            {domainBadgeLabel}
          </span>
        </div>
      </div>

      {/* Score Hero */}
      <div className="opp-score-hero">
        <div className="opp-score-block">
          <span className="opp-score-label">Điểm cơ hội</span>
          <span className="opp-score-value">{candidate.opportunityScore.toFixed(2)}</span>
        </div>
        <div className="opp-cost-block">
          <span className="opp-cost-label">Chi phí thử</span>
          <span className="opp-cost-value">{formatCurrency(candidate.trialCost)}</span>
        </div>
      </div>

      {/* Criteria Breakdown Grid */}
      <div className="opp-criteria-grid">
        <div className="opp-criteria-item">
          <span className="opp-crit-key">Phù hợp khu vực</span>
          <span className="opp-crit-val font-medium">{candidate.criteria.areaFit}</span>
        </div>
        <div className="opp-criteria-item">
          <span className="opp-crit-key">Tận dụng nguyên liệu</span>
          <span className="opp-crit-val font-medium text-emerald-700">
            {candidate.criteria.ingredientLeverage}
          </span>
        </div>
        <div className="opp-criteria-item">
          <span className="opp-crit-key">Khác biệt menu</span>
          <span className="opp-crit-val font-medium">{candidate.criteria.menuDifferentiation}</span>
        </div>
        <div className="opp-criteria-item">
          <span className="opp-crit-key">Độ phức tạp</span>
          <span className="opp-crit-val font-medium">{candidate.criteria.complexity}</span>
        </div>
      </div>

      {/* Price Range */}
      <div className="opp-price-row">
        <span className="opp-price-label">Khoảng giá đề xuất:</span>
        <span className="opp-price-range">
          {formatCurrency(candidate.priceRange.min)} – {formatCurrency(candidate.priceRange.max)}
        </span>
      </div>

      {/* Key Highlights */}
      {candidate.keyHighlights.length > 0 && (
        <ul className="opp-highlights-list">
          {candidate.keyHighlights.map((highlight, idx) => (
            <li key={idx} className="opp-highlight-item">
              <Check size={13} className="text-emerald-600 shrink-0" />
              <span>{highlight}</span>
            </li>
          ))}
        </ul>
      )}

      {/* Action Buttons */}
      <div className="opp-card-actions">
        <button
          type="button"
          className="btn-opp-inspect"
          onClick={() => onInspect(candidate)}
          title="Xem phân tích chi tiết vì sao được đề xuất"
        >
          <Info size={14} />
          <span>Xem lý do</span>
        </button>

        <button
          type="button"
          className={`btn-opp-portfolio-toggle ${
            isSelectedInPortfolio ? "btn-selected" : "btn-unselected"
          }`}
          onClick={() => onTogglePortfolio(candidate)}
        >
          {isSelectedInPortfolio ? (
            <>
              <CheckCircle2 size={14} />
              <span>Đã chọn thử</span>
            </>
          ) : (
            <>
              <Plus size={14} />
              <span>Thêm vào thử nghiệm</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
