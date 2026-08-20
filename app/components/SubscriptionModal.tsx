"use client";

import {
  Check,
  CheckCircle2,
  Sparkles,
  Zap,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
  type PlanId,
  SUBSCRIPTION_PLANS,
} from "../../lib/subscriptions";

interface SubscriptionModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentPlan: PlanId;
  onPlanChange?: (newPlan: PlanId) => void;
}

export function SubscriptionModal({
  isOpen,
  onClose,
  currentPlan,
  onPlanChange,
}: SubscriptionModalProps) {
  const [notice, setNotice] = useState<string | null>(null);

  // Close on ESC
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const allPlans: PlanId[] = ["free", "forecast", "decision", "postpaid"];

  const handleSelectPlan = (planId: PlanId) => {
    if (planId === currentPlan) return;

    if (planId === "postpaid") {
      setNotice(
        "Đã chọn gói Trả sau (Linh hoạt). Chi phí sẽ được tổng hợp theo mức sử dụng trong kỳ. (Cổng thanh toán trực tuyến sẽ được bổ sung sau).",
      );
    } else {
      setNotice(
        `Đã chuyển sang gói ${SUBSCRIPTION_PLANS[planId].name}. (Cổng thanh toán trực tuyến sẽ được bổ sung sau).`,
      );
    }

    if (onPlanChange) {
      onPlanChange(planId);
    }
  };

  return (
    <div
      className="subscription-modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="pricing-modal-title"
    >
      <div className="subscription-modal-content">
        {/* Modal Header */}
        <div className="subscription-modal-header">
          <div>
            <h2 id="pricing-modal-title" className="subscription-modal-title">
              Chọn gói ShelfCash
            </h2>
          </div>
          <button
            type="button"
            className="subscription-close-btn"
            onClick={onClose}
            aria-label="Đóng cửa sổ chọn gói"
          >
            <X size={20} />
          </button>
        </div>

        {/* Notice banner */}
        {notice && (
          <div className="subscription-notice-banner">
            <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
            <span>{notice}</span>
          </div>
        )}

        {/* 4 Vertical Plan Cards Grid */}
        <div className="subscription-cards-grid four-cards">
          {allPlans.map((planId) => {
            const plan = SUBSCRIPTION_PLANS[planId];
            const isCurrent = currentPlan === planId;
            const isRecommended = Boolean(plan.recommended);

            return (
              <div
                key={plan.id}
                className={`subscription-plan-card ${
                  isRecommended ? "is-recommended" : ""
                } ${isCurrent ? "is-current" : ""} ${
                  planId === "postpaid" ? "is-postpaid" : ""
                }`}
              >
                {/* Header & Title */}
                <div className="plan-card-header">
                  <div className="plan-title-line">
                    <span className="plan-name">{plan.name}</span>
                    {isRecommended && (
                      <span className="plan-recommended-badge">
                        <Sparkles size={11} />
                        <span>ĐỀ XUẤT</span>
                      </span>
                    )}
                    {!isRecommended && plan.badgeLabel && (
                      <span className="plan-badge-neutral">
                        <Zap size={11} />
                        <span>{plan.badgeLabel}</span>
                      </span>
                    )}
                  </div>

                  {/* Price */}
                  <div className="plan-price-block">
                    <div className="plan-price-main-line">
                      <span className="plan-price-number">{plan.priceFormatted}</span>
                      {plan.priceUnit ? (
                        <span className="plan-price-unit">{plan.priceUnit}</span>
                      ) : null}
                    </div>
                    {plan.subPrice ? (
                      <div className="plan-subprice-line">{plan.subPrice}</div>
                    ) : (
                      <div className="plan-subprice-spacer" />
                    )}
                  </div>

                  {/* Core Value */}
                  <p className="plan-one-line-value">{plan.description}</p>

                  {/* Action CTA Button */}
                  <div className="plan-cta-container">
                    {isCurrent ? (
                      <button
                        type="button"
                        className="plan-cta-btn current-plan-btn"
                        disabled
                      >
                        Gói hiện tại
                      </button>
                    ) : (
                      <button
                        type="button"
                        className={`plan-cta-btn ${
                          isRecommended
                            ? "recommended-cta-btn"
                            : planId === "postpaid"
                              ? "postpaid-cta-btn"
                              : "upgrade-cta-btn"
                        }`}
                        onClick={() => handleSelectPlan(plan.id)}
                      >
                        {planId === "free"
                          ? "Chọn gói Free"
                          : planId === "postpaid"
                            ? "Chọn Trả sau"
                            : `Nâng cấp ${plan.name}`}
                      </button>
                    )}
                  </div>
                </div>

                {/* Divider */}
                <hr className="plan-card-divider" />

                {/* Features List */}
                <div className="plan-features-section">
                  {plan.includesPrevious && (
                    <div className="plan-includes-prev-label">
                      {plan.includesPrevious}
                    </div>
                  )}

                  <ul className="plan-features-list">
                    {plan.features.map((feat, fIdx) => (
                      <li key={fIdx} className="plan-feature-item">
                        <Check size={15} className="plan-feature-check" />
                        <span className="plan-feature-text">{feat.text}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
