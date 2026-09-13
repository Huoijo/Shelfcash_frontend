"use client";

import { Building2, Bus, Filter, ShoppingBag, Store, Users, Zap } from "lucide-react";
import React, { useMemo } from "react";
import type {
  LocalOpportunityContext,
  OpportunityPoiCategory,
} from "../../../lib/opportunity/types";

interface LocalContextSummaryProps {
  context: LocalOpportunityContext;
  activeCategoryFilter?: OpportunityPoiCategory | null;
  onCategoryFilterToggle?: (category: OpportunityPoiCategory) => void;
}

function normalizeCategory(key: string): OpportunityPoiCategory {
  if (key === "competition" || key === "competitor") return "competitor";
  if (key === "university") return "university";
  if (key === "transit") return "transit";
  return "supporting_retail";
}

export function LocalContextSummary({
  context,
  activeCategoryFilter,
  onCategoryFilterToggle,
}: LocalContextSummaryProps) {
  // Derive counts directly from POIs if available to ensure 100% synchronization
  const categoryCounts = useMemo(() => {
    if (context.pois && context.pois.length > 0) {
      return {
        competitor: context.pois.filter((p) => p.category === "competitor").length,
        university: context.pois.filter((p) => p.category === "university").length,
        transit: context.pois.filter((p) => p.category === "transit").length,
        supporting_retail: context.pois.filter((p) => p.category === "supporting_retail").length,
      };
    }

    const map: Record<string, number> = {};
    context.metrics.forEach((m) => {
      map[normalizeCategory(m.key)] = m.count;
    });

    return {
      competitor: map.competitor ?? 8,
      university: map.university ?? 4,
      transit: map.transit ?? 3,
      supporting_retail: map.supporting_retail ?? 5,
    };
  }, [context]);

  const metricCards: Array<{
    category: OpportunityPoiCategory;
    label: string;
    count: number;
    icon: React.ReactNode;
  }> = [
    {
      category: "competitor",
      label: "Cửa hàng / Đối thủ",
      count: categoryCounts.competitor,
      icon: <Store size={16} className="text-rose-600" />,
    },
    {
      category: "university",
      label: "Trường / Đại học",
      count: categoryCounts.university,
      icon: <Building2 size={16} className="text-blue-600" />,
    },
    {
      category: "transit",
      label: "Transit",
      count: categoryCounts.transit,
      icon: <Bus size={16} className="text-amber-600" />,
    },
    {
      category: "supporting_retail",
      label: "Retail bổ trợ",
      count: categoryCounts.supporting_retail,
      icon: <ShoppingBag size={16} className="text-emerald-600" />,
    },
  ];

  return (
    <section className="opportunity-section" aria-labelledby="heading-local-context">
      <div className="opp-section-header">
        <h2 id="heading-local-context" className="opp-section-title">
          BỐI CẢNH KHU VỰC
        </h2>
        {activeCategoryFilter && (
          <span className="opp-filter-active-hint">
            <Filter size={12} className="inline mr-1" />
            Đang lọc trên bản đồ:{" "}
            <strong>
              {metricCards.find((c) => c.category === activeCategoryFilter)?.label}
            </strong>
          </span>
        )}
      </div>

      <div className="opp-context-grid">
        {/* Metric Counts Cards with Filter Interactivity */}
        <div className="opp-metrics-row">
          {metricCards.map((card) => {
            const isSelected = activeCategoryFilter === card.category;

            return (
              <button
                key={card.category}
                type="button"
                className={`opp-metric-card ${isSelected ? "selected" : ""}`}
                onClick={() => onCategoryFilterToggle?.(card.category)}
                title={`Bấm để ${isSelected ? "hủy lọc" : "lọc điểm trên bản đồ"}`}
                aria-pressed={isSelected}
              >
                <div className="opp-metric-icon-wrap">{card.icon}</div>
                <div className="opp-metric-content">
                  <span className="opp-metric-count">{card.count}</span>
                  <span className="opp-metric-label">{card.label}</span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Signals */}
        {context.signals.length > 0 && (
          <div className="opp-signals-wrap">
            <span className="opp-signals-label">Đặc trưng nhận diện:</span>
            <div className="opp-signals-tags">
              {context.signals.map((signal) => (
                <span
                  key={signal.key}
                  className={`opp-signal-badge badge-${signal.badgeType || "info"}`}
                >
                  <Users size={12} className="inline mr-1" />
                  {signal.label}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
