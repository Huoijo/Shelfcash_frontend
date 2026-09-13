"use client";

import { AlertTriangle, Compass, MapPin, RefreshCw, ZoomIn, ZoomOut } from "lucide-react";
import React, { useEffect, useMemo, useState } from "react";
import type {
  OpportunityAnalysisLocation,
  OpportunityPoi,
  OpportunityPoiCategory,
  OpportunityRunStatus,
} from "../../../../lib/opportunity/types";

export interface FallbackOpportunityScannerProps {
  center: OpportunityAnalysisLocation;
  radiusKm: number;
  pois: OpportunityPoi[];
  isScanning: boolean;
  status: OpportunityRunStatus;
  activeCategoryFilter?: OpportunityPoiCategory | null;
  errorMessage?: string | null;
  onRetryMap?: () => void;
  onLocationSelect?: (location: OpportunityAnalysisLocation) => void;
}

export function FallbackOpportunityScanner({
  center,
  radiusKm,
  pois,
  isScanning,
  status,
  activeCategoryFilter,
  errorMessage,
  onRetryMap,
  onLocationSelect,
}: FallbackOpportunityScannerProps) {
  const [selectedPoi, setSelectedPoi] = useState<OpportunityPoi | null>(null);
  const [sweepAngle, setSweepAngle] = useState(0);

  // Radar sweep animation
  useEffect(() => {
    if (!isScanning) {
      setSweepAngle(0);
      return;
    }

    let frameId: number;
    const start = performance.now();
    const PERIOD = 2400;

    const tick = (now: number) => {
      const elapsed = now - start;
      const angle = ((elapsed % PERIOD) / PERIOD) * 360;
      setSweepAngle(angle);
      frameId = requestAnimationFrame(tick);
    };

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [isScanning]);

  const categoryColors: Record<OpportunityPoiCategory, { bg: string; text: string; label: string }> = {
    competitor: { bg: "#e11d48", text: "#ffffff", label: "Cửa hàng / Đối thủ" },
    university: { bg: "#2563eb", text: "#ffffff", label: "Trường / Đại học" },
    transit: { bg: "#d97706", text: "#ffffff", label: "Transit" },
    supporting_retail: { bg: "#059669", text: "#ffffff", label: "Retail bổ trợ" },
  };

  // Convert relative coordinates for vector display
  const renderedPois = useMemo(() => {
    const latSpan = (radiusKm * 0.009) * 1.3;
    const lngSpan = (radiusKm * 0.009) * 1.3;

    return pois.map((poi) => {
      const dLat = poi.lat - center.lat;
      const dLng = poi.lng - center.lng;

      // Project to 50% +/- 42%
      const xPercent = 50 + (dLng / lngSpan) * 42;
      const yPercent = 50 - (dLat / latSpan) * 42;

      const isMatch = !activeCategoryFilter || poi.category === activeCategoryFilter;

      return {
        ...poi,
        xPercent: Math.max(8, Math.min(92, xPercent)),
        yPercent: Math.max(8, Math.min(92, yPercent)),
        isMatch,
      };
    });
  }, [pois, center, radiusKm, activeCategoryFilter]);

  return (
    <div className="opp-map-viewport-wrapper" role="region" aria-label="Bản đồ phân tích cơ hội">
      {/* Map simulation container */}
      <div className="opp-vector-map-canvas">
        {/* Subtle grid background */}
        <div className="opp-map-grid-bg" />

        {/* Concentric radius circle overlay */}
        <div className="opp-map-radius-circle-svg-wrap">
          <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
            {/* 1km, 3km, 5km rings */}
            <circle cx="50" cy="50" r="14" fill="none" stroke="#cbd5e1" strokeWidth="0.5" strokeDasharray="1.5 1.5" />
            <circle cx="50" cy="50" r="28" fill="none" stroke="#94a3b8" strokeWidth="0.6" strokeDasharray="2 2" />
            <circle
              cx="50"
              cy="50"
              r={radiusKm === 1 ? 14 : radiusKm === 5 ? 42 : 28}
              fill="rgba(16, 185, 129, 0.07)"
              stroke="#059669"
              strokeWidth="1.2"
              className="transition-all duration-300 ease-out"
            />
          </svg>
        </div>

        {/* Radar Sweep Effect during scanning */}
        {isScanning && (
          <div className="opp-map-radar-overlay" aria-hidden="true">
            <div
              className="opp-map-radar-sweeper"
              style={{ transform: `rotate(${sweepAngle}deg)` }}
            />
          </div>
        )}

        {/* Center Target Marker */}
        <div className="opp-map-center-target" title={`${center.label} (${center.source === "store" ? "Cửa hàng hiện tại" : "Vị trí khảo sát"})`}>
          <div className="opp-center-pulse-ring" />
          <div className="opp-center-dot">
            <MapPin size={14} className="text-white" />
          </div>
          <div className="opp-center-badge">
            <span className="opp-center-badge-dot" />
            <span>{center.source === "store" ? "Cửa hàng" : "Khảo sát"}</span>
          </div>
        </div>

        {/* POI Markers */}
        {renderedPois.map((poi) => {
          const cat = categoryColors[poi.category] || categoryColors.competitor;
          const isDimmed = !poi.isMatch;

          return (
            <button
              key={poi.id}
              type="button"
              className={`opp-map-poi-marker ${isDimmed ? "opp-marker-dimmed" : "opp-marker-highlight"}`}
              style={{
                left: `${poi.xPercent}%`,
                top: `${poi.yPercent}%`,
                backgroundColor: cat.bg,
              }}
              onClick={() => setSelectedPoi(poi)}
              title={`${poi.name} · ${cat.label}${poi.distanceMeters ? ` (${poi.distanceMeters}m)` : ""}`}
            >
              <span className="opp-poi-marker-inner" />
            </button>
          );
        })}

        {/* Selected POI Tooltip Drawer / Popover */}
        {selectedPoi && (
          <div className="opp-map-poi-popover">
            <div className="opp-popover-header">
              <span
                className="opp-popover-badge"
                style={{
                  backgroundColor: categoryColors[selectedPoi.category]?.bg || "#64748b",
                }}
              >
                {categoryColors[selectedPoi.category]?.label}
              </span>
              <button
                type="button"
                className="opp-popover-close"
                onClick={() => setSelectedPoi(null)}
                aria-label="Đóng"
              >
                ×
              </button>
            </div>
            <strong className="opp-popover-name">{selectedPoi.name}</strong>
            {selectedPoi.distanceMeters !== undefined && (
              <span className="opp-popover-distance">
                Khoảng cách: ~{selectedPoi.distanceMeters} m từ tâm
              </span>
            )}
          </div>
        )}

        {/* Map Notice / Provider Indicator */}
        <div className="opp-map-overlay-badge">
          {errorMessage ? (
            <div className="flex items-center gap-1.5 text-amber-700">
              <AlertTriangle size={13} />
              <span>Chế độ xem trước (Google Maps chưa sẵn sàng)</span>
              {onRetryMap && (
                <button
                  type="button"
                  onClick={onRetryMap}
                  className="ml-1 underline font-medium hover:text-amber-900"
                >
                  Thử lại
                </button>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-slate-600">
              <Compass size={13} className="text-emerald-600" />
              <span>Bản đồ khảo sát địa bàn · {radiusKm} km</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
