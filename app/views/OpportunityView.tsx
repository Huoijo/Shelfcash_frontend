"use client";

import { AlertCircle, Compass, X } from "lucide-react";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LocalContextSummary } from "../components/opportunity/LocalContextSummary";
import { OpportunityCandidateInspector } from "../components/opportunity/OpportunityCandidateInspector";
import { OpportunityLocationWorkspace } from "../components/opportunity/OpportunityLocationWorkspace";
import { OpportunityRanking } from "../components/opportunity/OpportunityRanking";
import { TrialPortfolioView } from "../components/opportunity/TrialPortfolioView";
import {
  DEFAULT_STORE_LOCATION,
  generatePreviewPoisForLocation,
  PREVIEW_LOCAL_CONTEXT,
} from "../../lib/opportunity/candidate-catalog";
import { getOpportunityConfig, getOpportunityMode } from "../../lib/opportunity/config";
import {
  calculatePortfolioMetrics,
  canAddCandidateToPortfolio,
  formatVnd,
  getRecommendedCandidateIds,
} from "../../lib/opportunity/portfolio-selector";
import { getOpportunityService } from "../../lib/opportunity/service";
import type {
  OpportunityAnalysisLocation,
  OpportunityCandidate,
  OpportunityPoiCategory,
  OpportunityResult,
  OpportunityRun,
  OpportunityRunStatus,
} from "../../lib/opportunity/types";

export interface OpportunityViewProps {
  storeId?: string;
  storeName?: string;
}

export function OpportunityView({
  storeId = "STORE_001",
  storeName = "ShelfCash Flagship Coffee",
}: OpportunityViewProps) {
  const config = useMemo(() => getOpportunityConfig(), []);
  const mode = config.mode;
  const service = useMemo(() => getOpportunityService(mode), [mode]);

  const [status, setStatus] = useState<OpportunityRunStatus>("idle");
  const [trialBudget, setTrialBudget] = useState<number>(2000000);
  const [radiusKm, setRadiusKm] = useState<number>(3);
  const [isStale, setIsStale] = useState<boolean>(false);

  // Analysis Location (Default to store coordinates, can be changed via search or map click without mutating store)
  const [analysisLocation, setAnalysisLocation] = useState<OpportunityAnalysisLocation>(() => ({
    ...DEFAULT_STORE_LOCATION,
    label: storeName || DEFAULT_STORE_LOCATION.label,
    source: "store",
  }));

  const [activeCategoryFilter, setActiveCategoryFilter] =
    useState<OpportunityPoiCategory | null>(null);

  const [currentRun, setCurrentRun] = useState<OpportunityRun | null>(null);
  const [result, setResult] = useState<OpportunityResult | null>(null);

  const [selectedCandidateIds, setSelectedCandidateIds] = useState<Set<string>>(
    new Set()
  );
  const [portfolioSource, setPortfolioSource] = useState<"optimizer" | "user_adjusted">("optimizer");
  const [budgetAlert, setBudgetAlert] = useState<string | null>(null);
  const [inspectedCandidate, setInspectedCandidate] =
    useState<OpportunityCandidate | null>(null);

  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);

  const [osmPois, setOsmPois] = useState<OpportunityPoi[] | null>(null);

  // Clear polling on unmount
  useEffect(() => {
    return () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
      }
    };
  }, []);

  // Compute active POIs for the current location & radius:
  // Before explicit scan, currentPois is EMPTY so map renders 0 nearby POI markers
  const currentPois = useMemo(() => {
    if (result?.localContext?.pois && result.localContext.pois.length > 0 && !isStale) {
      return result.localContext.pois;
    }
    if (osmPois && osmPois.length > 0 && !isStale) {
      return osmPois;
    }
    // If scanning has started, we use the generated preview fallback if Overpass hasn't returned yet
    if (status !== "idle" && !isStale) {
      return generatePreviewPoisForLocation(analysisLocation, radiusKm);
    }
    return [];
  }, [result, isStale, osmPois, status, analysisLocation, radiusKm]);

  const handleStartScan = useCallback(async () => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
    }

    setStatus("scanning");
    setResult(null);
    setIsStale(false);
    setActiveCategoryFilter(null);
    setBudgetAlert(null);

    let activePoisToUse = currentPois;

    // In OSM mode, query Overpass API for real Nearby POIs
    if (config.mapProvider === "osm") {
      try {
        const { searchNearbyOsmPois } = await import("../../lib/opportunity/map/overpass-service");
        const realOsmPois = await searchNearbyOsmPois({
          lat: analysisLocation.lat,
          lng: analysisLocation.lng,
          radiusMeters: radiusKm * 1000,
        });

        if (realOsmPois && realOsmPois.length > 0) {
          activePoisToUse = realOsmPois;
          setOsmPois(realOsmPois);
        }
      } catch (osmErr) {
        console.warn("Overpass POI query failed, utilizing preview candidate fallback:", osmErr);
      }
    }

    try {
      const run = await service.createRun({
        storeId,
        storeName,
        analysisLocation,
        radiusKm,
        trialBudget,
        pois: activePoisToUse,
      });

      setCurrentRun(run);
      setStatus(run.status);

      // Poll run status until completed or failed
      const checkProgress = async () => {
        try {
          const updatedRun = await service.getRun(run.runId, storeId);
          setCurrentRun(updatedRun);
          setStatus(updatedRun.status);

          if (updatedRun.status === "completed") {
            if (pollTimerRef.current) clearInterval(pollTimerRef.current);
            const scanResult = await service.getResult(run.runId, storeId);
            setResult(scanResult);
            // In accordance with product requirements: initialize empty so customer selects deliberately
            setSelectedCandidateIds(new Set());
            setPortfolioSource("optimizer");
          } else if (updatedRun.status === "failed") {
            if (pollTimerRef.current) clearInterval(pollTimerRef.current);
          }
        } catch {
          if (pollTimerRef.current) clearInterval(pollTimerRef.current);
          setStatus("failed");
        }
      };

      pollTimerRef.current = setInterval(checkProgress, 350);
    } catch {
      setStatus("failed");
    }
  }, [config, service, storeId, storeName, analysisLocation, radiusKm, trialBudget, currentPois]);

  const handleResetScan = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
    }
    if (currentRun?.runId && service.cancelRun) {
      service.cancelRun(currentRun.runId);
    }
    setStatus("idle");
    setCurrentRun(null);
    setResult(null);
    setIsStale(false);
    setActiveCategoryFilter(null);
    setSelectedCandidateIds(new Set());
    setPortfolioSource("optimizer");
    setBudgetAlert(null);
    setInspectedCandidate(null);
  }, [currentRun, service]);

  const handleLocationChange = useCallback(
    (newLocation: OpportunityAnalysisLocation) => {
      setAnalysisLocation(newLocation);
      setOsmPois(null);
      if (status === "completed") {
        setIsStale(true);
      }
    },
    [status]
  );

  const handleRadiusChange = useCallback(
    (newRadius: number) => {
      setRadiusKm(newRadius);
      setOsmPois(null);
      if (status === "completed") {
        setIsStale(true);
      }
    },
    [status]
  );

  const handleBudgetChange = useCallback(
    (newBudget: number) => {
      setTrialBudget(newBudget);
      if (status === "completed") {
        setIsStale(true);
      }
    },
    [status]
  );

  const handleCategoryFilterToggle = useCallback(
    (cat: OpportunityPoiCategory) => {
      setActiveCategoryFilter((prev) => (prev === cat ? null : cat));
    },
    []
  );

  const handleTogglePortfolio = useCallback(
    (candidate: OpportunityCandidate) => {
      setBudgetAlert(null);
      setSelectedCandidateIds((prev) => {
        const next = new Set(prev);
        if (next.has(candidate.id)) {
          next.delete(candidate.id);
          setPortfolioSource("user_adjusted");
          return next;
        }

        // Check hard budget feasibility before adding
        if (result) {
          const currentSelected = result.rankedCandidates.filter((c) => prev.has(c.id));
          const check = canAddCandidateToPortfolio(candidate, currentSelected, trialBudget);
          if (!check.allowed) {
            setBudgetAlert(
              `Vượt ngân sách thử nghiệm ${formatVnd(check.overBudgetAmount || 0)}. Vui lòng cân nhắc bỏ bớt ứng viên hoặc tăng ngân sách.`
            );
            return prev; // Block adding
          }
        }

        next.add(candidate.id);
        setPortfolioSource("user_adjusted");
        return next;
      });
    },
    [result, trialBudget]
  );

  const handleRemoveCandidate = useCallback((candidateId: string) => {
    setBudgetAlert(null);
    setSelectedCandidateIds((prev) => {
      const next = new Set(prev);
      next.delete(candidateId);
      return next;
    });
    setPortfolioSource("user_adjusted");
  }, []);

  const handleRestoreRecommendation = useCallback(() => {
    if (!result) return;
    setBudgetAlert(null);
    const recommended = getRecommendedCandidateIds(result.rankedCandidates, trialBudget);
    setSelectedCandidateIds(new Set(recommended));
    setPortfolioSource("optimizer");
  }, [result, trialBudget]);

  // Dynamically calculate trial portfolio metrics using pure selectors
  const portfolioMetrics = useMemo(() => {
    const candidates = result?.rankedCandidates ?? [];
    return calculatePortfolioMetrics(
      candidates,
      selectedCandidateIds,
      trialBudget,
      portfolioSource
    );
  }, [result, selectedCandidateIds, trialBudget, portfolioSource]);

  const selectedCandidateList = useMemo(() => {
    if (!result) return [];
    return result.rankedCandidates.filter((cand) =>
      selectedCandidateIds.has(cand.id)
    );
  }, [result, selectedCandidateIds]);

  return (
    <div className="opportunity-view-root">
      {/* Page Header */}
      <header className="opportunity-page-header">
        <div className="opp-header-title-block">
          <div className="opp-header-badge">
            <Compass size={18} className="text-emerald-700" />
            <span className="opp-header-tag">KHÁM PHÁ CƠ HỘI</span>
          </div>
          <h1 className="opp-main-heading">Gợi ý sản phẩm & Món mới</h1>
        </div>

        {mode === "preview" && (
          <div className="opp-dev-mode-indicator" title="Đang chạy ở chế độ xem trước">
            <span className="opp-dev-dot" />
            <span>Preview Mode</span>
          </div>
        )}
      </header>

      {/* Main Workspace */}
      <div className="opportunity-workspace">
        {/* Interactive Location, Map & Radar Scanner Workspace */}
        <OpportunityLocationWorkspace
          storeName={storeName}
          analysisLocation={analysisLocation}
          radiusKm={radiusKm}
          trialBudget={trialBudget}
          status={status}
          currentRun={currentRun}
          pois={currentPois}
          isStale={isStale}
          activeCategoryFilter={activeCategoryFilter}
          onLocationChange={handleLocationChange}
          onRadiusChange={handleRadiusChange}
          onBudgetChange={handleBudgetChange}
          onStartScan={handleStartScan}
          onResetScan={handleResetScan}
        />

        {/* Results Stream revealed on completed */}
        {status === "completed" && result && (
          <div className="opportunity-results-stream">
            {/* Budget Alert Toast Banner */}
            {budgetAlert && (
              <div className="opp-budget-alert-toast" role="alert">
                <div className="opp-budget-alert-content">
                  <AlertCircle size={16} className="text-rose-600 shrink-0" />
                  <span>{budgetAlert}</span>
                </div>
                <button
                  type="button"
                  className="opp-budget-alert-close"
                  onClick={() => setBudgetAlert(null)}
                  aria-label="Đóng thông báo"
                >
                  <X size={14} />
                </button>
              </div>
            )}

            {/* 1. Local Context Summary with 2-way Map Filter */}
            <LocalContextSummary
              context={result.localContext ?? PREVIEW_LOCAL_CONTEXT}
              activeCategoryFilter={activeCategoryFilter}
              onCategoryFilterToggle={handleCategoryFilterToggle}
            />

            <hr className="opp-section-divider" />

            {/* 2. Opportunity Ranking */}
            <OpportunityRanking
              candidates={result.rankedCandidates}
              selectedCandidateIds={selectedCandidateIds}
              onInspect={setInspectedCandidate}
              onTogglePortfolio={handleTogglePortfolio}
            />

            <hr className="opp-section-divider" />

            {/* 3. Trial Portfolio Builder */}
            <TrialPortfolioView
              metrics={portfolioMetrics}
              selectedCandidates={selectedCandidateList}
              onRemoveCandidate={handleRemoveCandidate}
              onRestoreRecommendation={handleRestoreRecommendation}
            />
          </div>
        )}
      </div>

      {/* Slide-over Inspector Drawer */}
      <OpportunityCandidateInspector
        candidate={inspectedCandidate}
        isSelectedInPortfolio={
          inspectedCandidate ? selectedCandidateIds.has(inspectedCandidate.id) : false
        }
        onClose={() => setInspectedCandidate(null)}
        onTogglePortfolio={handleTogglePortfolio}
      />
    </div>
  );
}
