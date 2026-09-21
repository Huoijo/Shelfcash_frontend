"use client";

import {
  AlertCircle,
  Building2,
  CheckCircle2,
  Compass,
  Loader2,
  MapPin,
  RotateCcw,
  RotateCw,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import React, { useEffect, useMemo, useRef, useState } from "react";
import type {
  OpportunityAnalysisLocation,
  OpportunityPoi,
  OpportunityPoiCategory,
  OpportunityRun,
  OpportunityRunStatus,
} from "../../../lib/opportunity/types";
import { DEFAULT_STORE_LOCATION } from "../../../lib/opportunity/candidate-catalog";
import { OpportunityMap } from "./map/OpportunityMap";

export interface OpportunityLocationWorkspaceProps {
  storeName: string;
  analysisLocation: OpportunityAnalysisLocation;
  radiusKm: number;
  trialBudget: number;
  status: OpportunityRunStatus;
  currentRun?: OpportunityRun | null;
  pois: OpportunityPoi[];
  isStale?: boolean;
  activeCategoryFilter?: OpportunityPoiCategory | null;
  onLocationChange: (location: OpportunityAnalysisLocation) => void;
  onRadiusChange: (radiusKm: number) => void;
  onBudgetChange: (budget: number) => void;
  onStartScan: () => void;
  onResetScan: () => void;
}

// Curated preview locations for immediate, reliable search suggestions
const PREVIEW_SEARCH_SUGGESTIONS: OpportunityAnalysisLocation[] = [
  {
    lat: 10.7725,
    lng: 106.6578,
    label: "ShelfCash Flagship Coffee",
    address: "268 Lý Thường Kiệt, Phường 14, Quận 10, TP. Hồ Chí Minh",
    source: "store",
  },
  {
    lat: 10.7721,
    lng: 106.6598,
    label: "Đại học Bách Khoa TP.HCM",
    address: "268 Lý Thường Kiệt, Phường 14, Quận 10, TP. Hồ Chí Minh",
    source: "search",
  },
  {
    lat: 10.7937,
    lng: 106.7219,
    label: "Landmark 81",
    address: "720A Điện Biên Phủ, Phường 22, Bình Thạnh, TP. Hồ Chí Minh",
    source: "search",
  },
  {
    lat: 10.7749,
    lng: 106.6635,
    label: "Đại học Kinh Tế TP.HCM (Cơ sở B)",
    address: "279 Nguyễn Tri Phương, Phường 5, Quận 10, TP. Hồ Chí Minh",
    source: "search",
  },
  {
    lat: 10.7719,
    lng: 106.6983,
    label: "Chợ Bến Thành",
    address: "Đường Lê Lợi, Phường Bến Thành, Quận 1, TP. Hồ Chí Minh",
    source: "search",
  },
  {
    lat: 10.7705,
    lng: 106.7042,
    label: "Phố đi bộ Nguyễn Huệ",
    address: "Đường Nguyễn Huệ, Phường Bến Nghé, Quận 1, TP. Hồ Chí Minh",
    source: "search",
  },
  {
    lat: 10.7695,
    lng: 106.6672,
    label: "Vạn Hạnh Mall",
    address: "11 Sư Vạn Hạnh, Phường 12, Quận 10, TP. Hồ Chí Minh",
    source: "search",
  },
];

export function OpportunityLocationWorkspace({
  storeName,
  analysisLocation,
  radiusKm,
  trialBudget,
  status,
  currentRun,
  pois,
  isStale = false,
  activeCategoryFilter,
  onLocationChange,
  onRadiusChange,
  onBudgetChange,
  onStartScan,
  onResetScan,
}: OpportunityLocationWorkspaceProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchDropdownOpen, setSearchDropdownOpen] = useState(false);
  const [googleSuggestions, setGoogleSuggestions] = useState<
    Array<{ placeId: string; description: string; mainText: string }>
  >([]);

  const [budgetInput, setBudgetInput] = useState(
    trialBudget ? trialBudget.toLocaleString("vi-VN") : "2.000.000"
  );

  const [isSearchingNominatim, setIsSearchingNominatim] = useState(false);
  const [nominatimResults, setNominatimResults] = useState<OpportunityAnalysisLocation[]>([]);
  const [nominatimError, setNominatimError] = useState<string | null>(null);

  const searchContainerRef = useRef<HTMLDivElement>(null);

  const isScanning =
    status === "scanning" ||
    status === "analyzing_context" ||
    status === "matching_candidates" ||
    status === "ranking" ||
    status === "building_portfolio";

  const isCompleted = status === "completed";
  const isFailed = status === "failed";
  const isIdle = status === "idle" || (!isScanning && !isCompleted && !isFailed);

  // Close search suggestions on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        searchContainerRef.current &&
        !searchContainerRef.current.contains(e.target as Node)
      ) {
        setSearchDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Sync budget input if prop changes externally
  useEffect(() => {
    if (trialBudget) {
      setBudgetInput(trialBudget.toLocaleString("vi-VN"));
    }
  }, [trialBudget]);

  // Explicit Nominatim search execution
  const executeNominatimSearch = async (queryText: string) => {
    const q = queryText.trim();
    if (!q) return;

    setIsSearchingNominatim(true);
    setNominatimError(null);
    setSearchDropdownOpen(true);

    try {
      const { searchNominatimLocation } = await import("../../../lib/opportunity/map/nominatim-service");
      const results = await searchNominatimLocation({
        query: q,
        countryCode: "vn",
        limit: 6,
      });

      setNominatimResults(results);
      if (results.length === 0) {
        setNominatimError("Không tìm thấy địa điểm nào phù hợp với từ khóa này.");
      }
    } catch (err) {
      console.error("Nominatim search failed:", err);
      setNominatimError("Không thể kết nối đến dịch vụ tìm kiếm OpenStreetMap. Vui lòng thử lại hoặc bấm trực tiếp trên bản đồ.");
    } finally {
      setIsSearchingNominatim(false);
    }
  };

  const handleSearchSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (searchQuery.trim()) {
      executeNominatimSearch(searchQuery);
    }
  };

  const handleSelectSuggestion = (item: OpportunityAnalysisLocation) => {
    onLocationChange({
      ...item,
      source: item.source === "store" ? "store" : "search",
    });
    setSearchQuery(item.label);
    setSearchDropdownOpen(false);
  };

  const handleResetToStore = () => {
    onLocationChange({
      ...DEFAULT_STORE_LOCATION,
      label: storeName || DEFAULT_STORE_LOCATION.label,
      source: "store",
    });
    setSearchQuery("");
    setNominatimResults([]);
  };

  const handleBudgetBlur = () => {
    const numeric = parseInt(budgetInput.replace(/\D/g, ""), 10);
    if (!isNaN(numeric) && numeric > 0) {
      setBudgetInput(numeric.toLocaleString("vi-VN"));
      onBudgetChange(numeric);
    } else {
      setBudgetInput("2.000.000");
      onBudgetChange(2000000);
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
    onBudgetChange(num);
  };

  const isStoreSelected = analysisLocation.source === "store";

  return (
    <div className="opportunity-location-workspace-card">
      {/* Search Bar on Top */}
      <div
        className="opp-search-bar-wrapper"
        ref={searchContainerRef}
      >
        <form onSubmit={handleSearchSubmit} className="opp-search-input-box">
          <Search size={18} className="text-slate-400 shrink-0" />
          <input
            type="text"
            className="opp-search-input"
            placeholder="Tìm địa chỉ hoặc địa điểm (ví dụ: Đại học Kinh tế TP.HCM)..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
            }}
            disabled={isScanning}
            aria-label="Tìm kiếm địa điểm phân tích"
          />
          {searchQuery && (
            <button
              type="button"
              className="opp-search-clear mr-1"
              onClick={() => {
                setSearchQuery("");
                setNominatimResults([]);
                setNominatimError(null);
              }}
              disabled={isScanning}
              aria-label="Xóa tìm kiếm"
            >
              <X size={15} />
            </button>
          )}
          <button
            type="submit"
            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md text-xs font-semibold shrink-0 transition-colors flex items-center gap-1 shadow-sm disabled:opacity-50"
            disabled={isSearchingNominatim || !searchQuery.trim() || isScanning}
          >
            {isSearchingNominatim ? (
              <>
                <Loader2 size={13} className="animate-spin" />
                <span>Đang tìm...</span>
              </>
            ) : (
              <span>Tìm</span>
            )}
          </button>
        </form>

        {/* Search Dropdown */}
        {searchDropdownOpen && (
          <div className="opp-search-dropdown" role="listbox">
            {isSearchingNominatim ? (
              <div className="p-4 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
                <Loader2 size={14} className="animate-spin text-emerald-600" />
                <span>Đang tìm kiếm qua OpenStreetMap Nominatim...</span>
              </div>
            ) : nominatimResults.length > 0 ? (
              nominatimResults.map((item, idx) => (
                <button
                  key={`${item.id}-${idx}`}
                  type="button"
                  className="opp-search-item"
                  onClick={() => handleSelectSuggestion(item)}
                >
                  <MapPin size={15} className="text-emerald-600 shrink-0 mt-0.5" />
                  <div className="opp-search-item-text">
                    <strong className="opp-search-item-title">{item.label}</strong>
                    {item.address && (
                      <span className="opp-search-item-sub">{item.address}</span>
                    )}
                  </div>
                </button>
              ))
            ) : nominatimError ? (
              <div className="opp-search-no-result text-amber-700 bg-amber-50/70 p-3 text-xs">
                {nominatimError}
              </div>
            ) : null}
          </div>
        )}
      </div>

      {/* Main Workspace: Left Map (~65%) & Right Controls (~35%) */}
      <div className="opp-location-main-grid">
        {/* Map Container */}
        <div className="opp-map-col">
          <OpportunityMap
            center={analysisLocation}
            radiusKm={radiusKm}
            pois={pois}
            isScanning={isScanning}
            status={status}
            activeCategoryFilter={activeCategoryFilter}
            onLocationSelect={onLocationChange}
          />
        </div>

        {/* Controls Container */}
        <div className="opp-controls-col">
          {/* Header */}
          <div className="opp-controls-header">
            <span className="opp-controls-tag">ĐỊA ĐIỂM PHÂN TÍCH</span>
            {!isStoreSelected && (
              <button
                type="button"
                className="btn-opp-reset-store"
                onClick={handleResetToStore}
                disabled={isScanning}
                title="Quay lại phân tích tại cửa hàng hiện tại"
              >
                <RotateCcw size={12} />
                <span>Về cửa hàng</span>
              </button>
            )}
          </div>

          {/* Location Mode Indicator & Address */}
          <div className="opp-location-card">
            <div className="opp-location-mode-row">
              {isStoreSelected ? (
                <span className="opp-mode-pill store-mode">
                  <span className="opp-mode-dot" />
                  Cửa hàng hiện tại
                </span>
              ) : (
                <span className="opp-mode-pill survey-mode">
                  <span className="opp-mode-dot" />
                  Vị trí khảo sát
                </span>
              )}
            </div>

            <h3 className="opp-location-name" title={analysisLocation.label}>
              {analysisLocation.label}
            </h3>
            {analysisLocation.address && (
              <p className="opp-location-address">{analysisLocation.address}</p>
            )}
          </div>

          {/* Radius Selector */}
          <div className="opp-control-group">
            <label className="opp-control-label">Bán kính quét</label>
            <div className="opp-radius-button-group" role="group" aria-label="Chọn bán kính">
              {[1, 2, 3].map((km) => (
                <button
                  key={km}
                  type="button"
                  className={`opp-radius-btn ${radiusKm === km ? "active" : ""}`}
                  onClick={() => onRadiusChange(km)}
                  disabled={isScanning}
                >
                  {km} km
                </button>
              ))}
            </div>
          </div>

          {/* Trial Budget */}
          <div className="opp-control-group">
            <label htmlFor="opp-budget-field" className="opp-control-label">
              Ngân sách thử nghiệm
            </label>
            <div className="opp-budget-input-wrapper">
              <input
                id="opp-budget-field"
                type="text"
                className="opp-budget-input"
                value={budgetInput}
                onChange={handleBudgetChange}
                onBlur={handleBudgetBlur}
                disabled={isScanning}
                placeholder="2.000.000"
              />
              <span className="opp-budget-unit">₫</span>
            </div>
          </div>

          {/* Stale Result Notice */}
          {isStale && !isScanning && (
            <div className="opp-stale-notice">
              <AlertCircle size={14} className="shrink-0 text-amber-600" />
              <span>Vị trí hoặc phạm vi đã đổi. Hãy quét lại để cập nhật cơ hội.</span>
            </div>
          )}

          {/* Action Trigger Button */}
          <div className="opp-action-row">
            {isIdle && (
              <button
                type="button"
                className="btn-opp-action-primary"
                onClick={onStartScan}
              >
                <Compass size={18} />
                <span>QUÉT CƠ HỘI</span>
              </button>
            )}

            {isScanning && (
              <div className="opp-scanning-active-box">
                <div className="opp-scanning-status-text">
                  <Loader2 size={16} className="opp-spin-icon" />
                  <span>{currentRun?.stageMessage || "Đang quét khu vực..."}</span>
                </div>
                {currentRun && (
                  <div className="opp-progress-mini-bar">
                    <div
                      className="opp-progress-mini-fill"
                      style={{ width: `${currentRun.progressPercent}%` }}
                    />
                  </div>
                )}
                <div className="opp-scanning-stats-row">
                  <span>
                    {currentRun?.scannedCount ?? 0} / {currentRun?.totalPoisCount ?? pois.length} điểm
                  </span>
                  <span>{currentRun?.progressPercent ?? 0}%</span>
                </div>
              </div>
            )}

            {isCompleted && (
              <div className="opp-completed-action-box">
                {isStale ? (
                  <button
                    type="button"
                    className="btn-opp-action-primary"
                    onClick={onStartScan}
                  >
                    <RotateCw size={16} />
                    <span>QUÉT LẠI KHU VỰC NÀY</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn-opp-action-secondary"
                    onClick={onResetScan}
                  >
                    <RotateCw size={15} />
                    <span>Quét lại</span>
                  </button>
                )}
              </div>
            )}

            {isFailed && (
              <button
                type="button"
                className="btn-opp-action-retry"
                onClick={onStartScan}
              >
                <span>Thử lại</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
