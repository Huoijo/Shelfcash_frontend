"use client";

import { Building2, Bus, ShoppingBag, Store, Users, Zap } from "lucide-react";
import React from "react";
import type { LocalOpportunityContext } from "../../../lib/opportunity/types";

interface LocalContextSummaryProps {
  context: LocalOpportunityContext;
}

export function LocalContextSummary({ context }: LocalContextSummaryProps) {
  const getMetricIcon = (key: string) => {
    switch (key) {
      case "university":
        return <Building2 size={16} className="text-blue-600" />;
      case "transit":
        return <Bus size={16} className="text-amber-600" />;
      case "competition":
        return <Store size={16} className="text-rose-600" />;
      case "retail":
        return <ShoppingBag size={16} className="text-emerald-600" />;
      default:
        return <Zap size={16} className="text-slate-500" />;
    }
  };

  return (
    <section className="opportunity-section" aria-labelledby="heading-local-context">
      <div className="opp-section-header">
        <h2 id="heading-local-context" className="opp-section-title">
          BỐI CẢNH KHU VỰC
        </h2>
      </div>

      <div className="opp-context-grid">
        {/* Metric Counts */}
        <div className="opp-metrics-row">
          {context.metrics.map((metric) => (
            <div key={metric.key} className="opp-metric-card">
              <div className="opp-metric-icon-wrap">{getMetricIcon(metric.key)}</div>
              <div className="opp-metric-content">
                <span className="opp-metric-count">{metric.count}</span>
                <span className="opp-metric-label">{metric.label}</span>
              </div>
            </div>
          ))}
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
