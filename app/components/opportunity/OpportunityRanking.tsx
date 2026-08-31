"use client";

import { ArrowRight, Sparkles } from "lucide-react";
import React, { useState } from "react";
import type { OpportunityCandidate } from "../../../lib/opportunity/types";
import { OpportunityCandidateCard } from "./OpportunityCandidateCard";

interface OpportunityRankingProps {
  candidates: OpportunityCandidate[];
  selectedCandidateIds: Set<string>;
  onInspect: (candidate: OpportunityCandidate) => void;
  onTogglePortfolio: (candidate: OpportunityCandidate) => void;
}

export function OpportunityRanking({
  candidates,
  selectedCandidateIds,
  onInspect,
  onTogglePortfolio,
}: OpportunityRankingProps) {
  const [showAll, setShowAll] = useState(false);

  const displayedCandidates = showAll ? candidates : candidates.slice(0, 3);
  const remainingCount = Math.max(0, candidates.length - 3);

  return (
    <section className="opportunity-section" aria-labelledby="heading-opportunity-ranking">
      <div className="opp-section-header">
        <div className="opp-section-title-wrap">
          <h2 id="heading-opportunity-ranking" className="opp-section-title">
            CƠ HỘI ĐÁNG THỬ
          </h2>
          <span className="opp-count-badge">{candidates.length} gợi ý</span>
        </div>

        {candidates.length > 3 && (
          <button
            type="button"
            className="btn-opp-toggle-all"
            onClick={() => setShowAll((prev) => !prev)}
          >
            <span>{showAll ? "Thu gọn (Top 3)" : `Xem tất cả (${candidates.length})`}</span>
            <ArrowRight size={14} className={showAll ? "rotate-180" : ""} />
          </button>
        )}
      </div>

      <div className="opp-candidates-grid">
        {displayedCandidates.map((candidate) => (
          <OpportunityCandidateCard
            key={candidate.id}
            candidate={candidate}
            isSelectedInPortfolio={selectedCandidateIds.has(candidate.id)}
            onInspect={onInspect}
            onTogglePortfolio={onTogglePortfolio}
          />
        ))}
      </div>
    </section>
  );
}
