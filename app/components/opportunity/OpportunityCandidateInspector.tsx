"use client";

import {
  AlertTriangle,
  ArrowDown,
  CheckCircle2,
  Layers,
  PackageCheck,
  Plus,
  ShieldAlert,
  Sparkles,
  Tag,
  X,
} from "lucide-react";
import React, { useEffect, useRef } from "react";
import type { OpportunityCandidate } from "../../../lib/opportunity/types";

interface OpportunityCandidateInspectorProps {
  candidate: OpportunityCandidate | null;
  isSelectedInPortfolio: boolean;
  onClose: () => void;
  onTogglePortfolio: (candidate: OpportunityCandidate) => void;
}

export function OpportunityCandidateInspector({
  candidate,
  isSelectedInPortfolio,
  onClose,
  onTogglePortfolio,
}: OpportunityCandidateInspectorProps) {
  const drawerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  if (!candidate) return null;

  const domainBadgeLabel =
    candidate.domain === "same_domain" ? "CÙNG NGÀNH" : "THỬ NGHIỆM MỞ RỘNG";

  const formatCurrency = (val: number) =>
    val.toLocaleString("vi-VN") + " ₫";

  return (
    <div className="opp-inspector-overlay" onClick={onClose}>
      <aside
        className="opp-inspector-drawer"
        ref={drawerRef}
        onClick={(e) => e.stopPropagation()}
        aria-label={`Chi tiết cơ hội: ${candidate.name}`}
      >
        {/* Drawer Header */}
        <div className="opp-inspector-header">
          <div className="opp-inspector-identity">
            <div className="opp-inspector-rank-row">
              <span className="opp-rank-tag">#{candidate.rank}</span>
              <span className="opp-domain-badge badge-same-domain">
                {domainBadgeLabel}
              </span>
            </div>
            <h2 className="opp-inspector-title">{candidate.name}</h2>
            <span className="opp-inspector-category">{candidate.category}</span>
          </div>

          <button
            type="button"
            className="opp-inspector-close-btn"
            onClick={onClose}
            aria-label="Đóng bảng chi tiết"
          >
            <X size={18} />
          </button>
        </div>

        {/* Drawer Scrollable Content */}
        <div className="opp-inspector-content">
          {/* Score & Cost Summary */}
          <div className="opp-inspector-metric-cards">
            <div className="opp-insp-stat-card">
              <span className="opp-stat-label">Điểm cơ hội</span>
              <span className="opp-stat-val text-emerald-700">
                {candidate.opportunityScore.toFixed(2)}
              </span>
            </div>
            <div className="opp-insp-stat-card">
              <span className="opp-stat-label">Chi phí thử nghiệm</span>
              <span className="opp-stat-val font-semibold">
                {formatCurrency(candidate.trialCost)}
              </span>
            </div>
          </div>

          {/* Signature "Why Path" (Vì sao được đề xuất?) */}
          <div className="opp-why-path-section">
            <h3 className="opp-why-path-title">
              VÌ SAO ĐƯỢC ĐỀ XUẤT?
            </h3>

            <div className="opp-why-path-flow">
              {candidate.whyPath.map((step, idx) => {
                const isLast = idx === candidate.whyPath.length - 1;
                const isTargetItem = step === candidate.name;

                return (
                  <React.Fragment key={idx}>
                    <div
                      className={`opp-why-node ${
                        isTargetItem ? "node-target" : isLast ? "node-conclusion" : "node-context"
                      }`}
                    >
                      <span className="opp-why-step-num">{idx + 1}</span>
                      <span className="opp-why-step-text">{step}</span>
                    </div>

                    {!isLast && (
                      <div className="opp-why-connector" aria-hidden="true">
                        <ArrowDown size={14} className="text-slate-400" />
                      </div>
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          </div>

          {/* Ingredient Synergies */}
          <div className="opp-ingredients-section">
            <h3 className="opp-sub-title">CƠ CẤU NGUYÊN LIỆU</h3>

            {candidate.reusableIngredients.length > 0 && (
              <div className="opp-ing-group">
                <span className="opp-ing-group-label text-emerald-800">
                  <PackageCheck size={14} className="inline mr-1" />
                  Tận dụng từ kho hiện có:
                </span>
                <div className="opp-ing-tags">
                  {candidate.reusableIngredients.map((ing, i) => (
                    <span key={i} className="opp-ing-tag tag-reusable">
                      {ing}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {candidate.newIngredients.length > 0 && (
              <div className="opp-ing-group">
                <span className="opp-ing-group-label text-slate-700">
                  <Plus size={14} className="inline mr-1" />
                  Nguyên liệu mới cần nhập thử:
                </span>
                <div className="opp-ing-tags">
                  {candidate.newIngredients.map((ing, i) => (
                    <span key={i} className="opp-ing-tag tag-new">
                      {ing}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Operational Constraints */}
          {candidate.constraints && candidate.constraints.length > 0 && (
            <div className="opp-constraints-section">
              <h3 className="opp-sub-title">LƯU Ý VẬN HÀNH</h3>
              <ul className="opp-constraints-list">
                {candidate.constraints.map((item, i) => (
                  <li key={i} className="opp-constraint-item">
                    <AlertTriangle size={14} className="text-amber-600 shrink-0 mt-0.5" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Drawer Footer Actions */}
        <div className="opp-inspector-footer">
          <button
            type="button"
            className={`btn-opp-inspector-action ${
              isSelectedInPortfolio ? "btn-in-portfolio" : "btn-add-portfolio"
            }`}
            onClick={() => onTogglePortfolio(candidate)}
          >
            {isSelectedInPortfolio ? (
              <>
                <CheckCircle2 size={16} />
                <span>Đã chọn vào danh mục thử nghiệm</span>
              </>
            ) : (
              <>
                <Plus size={16} />
                <span>Thêm vào danh mục thử nghiệm</span>
              </>
            )}
          </button>
        </div>
      </aside>
    </div>
  );
}
