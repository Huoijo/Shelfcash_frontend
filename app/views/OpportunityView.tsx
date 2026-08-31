"use client";

import { Compass, RotateCw, Sparkles } from "lucide-react";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LocalContextSummary } from "../components/opportunity/LocalContextSummary";
import { OpportunityCandidateInspector } from "../components/opportunity/OpportunityCandidateInspector";
import { OpportunityRanking } from "../components/opportunity/OpportunityRanking";
import { OpportunityScanner } from "../components/opportunity/OpportunityScanner";
import { TrialPortfolioView } from "../components/opportunity/TrialPortfolioView";
import { getOpportunityMode } from "../../lib/opportunity/config";
import { getOpportunityService } from "../../lib/opportunity/service";
import type {
  OpportunityCandidate,
  OpportunityResult,
  OpportunityRun,
  OpportunityRunStatus,
  TrialPortfolio,
} from "../../lib/opportunity/types";

export interface OpportunityViewProps {
  storeId?: string;
  storeName?: string;
}

export function OpportunityView({
  storeId = "STORE_001",
  storeName = "ShelfCash Flagship Coffee",
}: OpportunityViewProps) {
  const mode = useMemo(() => getOpportunityMode(), []);
  const service = useMemo(() => getOpportunityService(mode), [mode]);

  const [status, setStatus] = useState<OpportunityRunStatus>("idle");
  const [trialBudget, setTrialBudget] = useState<number>(2000000);
  const [radiusKm] = useState<number>(3);

  const [currentRun, setCurrentRun] = useState<OpportunityRun | null>(null);
  const [result, setResult] = useState<OpportunityResult | null>(null);

  const [selectedCandidateIds, setSelectedCandidateIds] = useState<Set<string>>(
    new Set()
  );
  const [inspectedCandidate, setInspectedCandidate] =
    useState<OpportunityCandidate | null>(null);

  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Clear polling on unmount
  useEffect(() => {
    return () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
      }
    };
  }, []);

  const handleStartScan = useCallback(async () => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
    }

    setStatus("scanning");
    setResult(null);

    try {
      const run = await service.createRun({
        storeId,
        storeName,
        radiusKm,
        trialBudget,
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
            // Default select top recommended candidates from portfolio
            const initialSelected = new Set(
              scanResult.trialPortfolio.items
                .filter((item) => item.selected)
                .map((item) => item.candidateId)
            );
            setSelectedCandidateIds(initialSelected);
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
  }, [service, storeId, storeName, radiusKm, trialBudget]);

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
    setSelectedCandidateIds(new Set());
    setInspectedCandidate(null);
  }, [currentRun, service]);

  const handleTogglePortfolio = useCallback(
    (candidate: OpportunityCandidate) => {
      setSelectedCandidateIds((prev) => {
        const next = new Set(prev);
        if (next.has(candidate.id)) {
          next.delete(candidate.id);
        } else {
          next.add(candidate.id);
        }
        return next;
      });
    },
    []
  );

  const handleRemoveCandidate = useCallback((candidateId: string) => {
    setSelectedCandidateIds((prev) => {
      const next = new Set(prev);
      next.delete(candidateId);
      return next;
    });
  }, []);

  // Dynamically calculate dynamic trial portfolio based on user's manual selections
  const dynamicPortfolio: TrialPortfolio = useMemo(() => {
    const budget = trialBudget;
    if (!result) {
      return {
        budget,
        allocatedCost: 0,
        remainingBudget: budget,
        candidateCount: 0,
        items: [],
      };
    }

    let allocated = 0;
    const items = result.rankedCandidates.map((cand) => {
      const isSelected = selectedCandidateIds.has(cand.id);
      if (isSelected) {
        allocated += cand.trialCost;
      }
      return {
        candidateId: cand.id,
        candidateName: cand.name,
        category: cand.category,
        trialCost: cand.trialCost,
        score: cand.opportunityScore,
        domain: cand.domain,
        selected: isSelected,
      };
    });

    return {
      budget,
      allocatedCost: allocated,
      remainingBudget: Math.max(0, budget - allocated),
      candidateCount: selectedCandidateIds.size,
      items,
    };
  }, [result, selectedCandidateIds, trialBudget]);

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
        {/* Scanner Component (Idle / Active Scanning / Completed Banner) */}
        <OpportunityScanner
          storeName={storeName}
          radiusKm={radiusKm}
          trialBudget={trialBudget}
          status={status}
          currentRun={currentRun}
          localContext={result?.localContext}
          onBudgetChange={setTrialBudget}
          onStartScan={handleStartScan}
          onResetScan={handleResetScan}
        />

        {/* Results Stream revealed on completed */}
        {status === "completed" && result && (
          <div className="opportunity-results-stream">
            {/* 1. Local Context Summary */}
            <LocalContextSummary context={result.localContext} />

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
              portfolio={dynamicPortfolio}
              selectedCandidates={selectedCandidateList}
              onRemoveCandidate={handleRemoveCandidate}
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
