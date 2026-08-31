"use client";

import { AlertCircle, CheckCircle2, Compass, Loader2, Play, RotateCw } from "lucide-react";
import React, { useState } from "react";
import type { LocalOpportunityContext, OpportunityRun, OpportunityRunStatus } from "../../../lib/opportunity/types";

interface OpportunityScannerProps {
  storeName: string;
  radiusKm: number;
  trialBudget: number;
  status: OpportunityRunStatus;
  currentRun?: OpportunityRun | null;
  localContext?: LocalOpportunityContext | null;
  onBudgetChange?: (budget: number) => void;
  onStartScan: () => void;
  onResetScan: () => void;
}

export function OpportunityScanner({
  storeName,
  radiusKm,
  trialBudget,
  status,
  currentRun,
  localContext,
  onBudgetChange,
  onStartScan,
  onResetScan,
}: OpportunityScannerProps) {
  const [budgetInput, setBudgetInput] = useState(
    trialBudget ? trialBudget.toLocaleString("vi-VN") : "2.000.000"
  );

  const isScanning =
    status === "scanning" ||
    status === "analyzing_context" ||
    status === "matching_candidates" ||
    status === "ranking" ||
    status === "building_portfolio";

  const isCompleted = status === "completed";
  const isFailed = status === "failed";
  const isIdle = status === "idle" || (!isScanning && !isCompleted && !isFailed);

  const handleBudgetBlur = () => {
    const numeric = parseInt(budgetInput.replace(/\D/g, ""), 10);
    if (!isNaN(numeric) && numeric > 0) {
      setBudgetInput(numeric.toLocaleString("vi-VN"));
      if (onBudgetChange) onBudgetChange(numeric);
    } else {
      setBudgetInput("2.000.000");
      if (onBudgetChange) onBudgetChange(2000000);
    }
  };

  const handleBudgetChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const digits = raw.replace(/\D/g, "");
    if (!digits) {
      setBudgetInput("");
      return;
    }
    const num = parseInt(digits, 10);
    setBudgetInput(num.toLocaleString("vi-VN"));
    if (onBudgetChange) onBudgetChange(num);
  };

  // Compact Completed Banner
  if (isCompleted) {
    const lastScanTime = currentRun?.completedAt
      ? new Date(currentRun.completedAt).toLocaleTimeString("vi-VN", {
          hour: "2-digit",
          minute: "2-digit",
        })
      : new Date().toLocaleTimeString("vi-VN", {
          hour: "2-digit",
          minute: "2-digit",
        });

    const lastScanDate = currentRun?.completedAt
      ? new Date(currentRun.completedAt).toLocaleDateString("vi-VN")
      : new Date().toLocaleDateString("vi-VN");

    return (
      <div className="opportunity-completed-bar">
        <div className="opp-completed-info">
          <div className="opp-completed-store">
            <span className="opp-store-dot" aria-hidden="true" />
            <strong>{storeName}</strong>
            <span className="opp-meta-divider">·</span>
            <span>Bán kính {radiusKm} km</span>
          </div>
          <div className="opp-completed-meta">
            <span className="opp-meta-label">Lần quét gần nhất:</span>
            <span className="opp-meta-time">
              {lastScanDate} · {lastScanTime}
            </span>
          </div>
        </div>

        <button
          type="button"
          className="btn-opp-rescan"
          onClick={onResetScan}
          title="Quét lại cơ hội mới"
        >
          <RotateCw size={15} />
          <span>Quét lại</span>
        </button>
      </div>
    );
  }

  // Active Scanning & Idle UI
  return (
    <div className="opportunity-scanner-card">
      <div className="opp-scanner-header">
        <div className="opp-scanner-store-badge">
          <span className="opp-radar-icon-dot" />
          <span className="opp-scanner-store-title">{storeName}</span>
          <span className="opp-scanner-radius-pill">Bán kính {radiusKm} km</span>
        </div>

        {isIdle && (
          <div className="opp-budget-control">
            <label htmlFor="opp-budget-input" className="opp-budget-label">
              Ngân sách thử nghiệm
            </label>
            <div className="opp-budget-input-wrapper">
              <input
                id="opp-budget-input"
                type="text"
                className="opp-budget-input"
                value={budgetInput}
                onChange={handleBudgetChange}
                onBlur={handleBudgetBlur}
                placeholder="2.000.000"
              />
              <span className="opp-budget-unit">₫</span>
            </div>
          </div>
        )}
      </div>

      {/* Market Scanner Visual (Radar & POI Metaphor) */}
      <div className="opp-scanner-viewport" aria-label="Mô phỏng quét bối cảnh khu vực">
        <div className="opp-radar-scope">
          {/* Concentric distance rings */}
          <div className="opp-radar-ring ring-1" />
          <div className="opp-radar-ring ring-2" />
          <div className="opp-radar-ring ring-3" />
          <div className="opp-radar-crosshair-h" />
          <div className="opp-radar-crosshair-v" />

          {/* Rotating radar beam during scan */}
          {isScanning && <div className="opp-radar-sweep-beam" />}

          {/* Center store anchor */}
          <div className="opp-radar-center-hub">
            <div className="opp-hub-core" />
            <span className="opp-hub-label">CỬA HÀNG</span>
          </div>

          {/* POI scatter indicators */}
          {localContext?.poiPoints.map((poi, idx) => {
            const angleRad = (poi.angleDeg * Math.PI) / 180;
            const radiusPx = poi.distanceNormalized * 110;
            const x = Math.cos(angleRad) * radiusPx;
            const y = Math.sin(angleRad) * radiusPx;

            const isRevealed =
              isScanning && currentRun?.scannedCount
                ? idx < currentRun.scannedCount
                : isCompleted;

            return (
              <div
                key={poi.id}
                className={`opp-radar-poi poi-${poi.type} ${isRevealed ? "poi-visible" : "poi-hidden"}`}
                style={{
                  transform: `translate(${x}px, ${y}px)`,
                }}
                title={`${poi.label} (${poi.type})`}
              >
                <div className="opp-poi-ping" />
              </div>
            );
          })}
        </div>

        {/* Dynamic Stage Message & Progress Indicator */}
        <div className="opp-scanner-status-area">
          {isIdle && (
            <div className="opp-idle-prompt">
              <p className="opp-idle-hint">
                Quét dữ liệu địa bàn trong bán kính {radiusKm} km để nhận diện cơ hội sản phẩm mới phù hợp nhất với cửa hàng.
              </p>
              <button
                type="button"
                className="btn-opp-start-scan"
                onClick={onStartScan}
              >
                <Compass size={18} />
                <span>Quét cơ hội</span>
              </button>
            </div>
          )}

          {isScanning && (
            <div className="opp-scanning-progress">
              <div className="opp-scanning-headline">
                <Loader2 size={16} className="opp-spin-icon" />
                <span className="opp-scanning-msg">
                  {currentRun?.stageMessage || "Đang quét bối cảnh khu vực..."}
                </span>
              </div>

              {currentRun && (
                <div className="opp-scan-stats">
                  <div className="opp-progress-bar-track">
                    <div
                      className="opp-progress-bar-fill"
                      style={{ width: `${currentRun.progressPercent}%` }}
                    />
                  </div>
                  <div className="opp-scan-counter">
                    <span>
                      {currentRun.scannedCount} / {currentRun.totalPoisCount || 31} điểm khu vực
                    </span>
                    <span>{currentRun.progressPercent}%</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {isFailed && (
            <div className="opp-failed-notice">
              <AlertCircle size={18} className="text-rose-600" />
              <span>{currentRun?.error || "Không thể hoàn tất phiên quét."}</span>
              <button type="button" className="btn-opp-retry" onClick={onStartScan}>
                Thử lại
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
