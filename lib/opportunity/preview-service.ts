import {
  DEFAULT_STORE_LOCATION,
  PREVIEW_CANDIDATE_CATALOG,
  PREVIEW_LOCAL_CONTEXT,
  generatePreviewPoisForLocation,
} from "./candidate-catalog";
import { getRecommendedCandidateIds } from "./portfolio-selector";
import type {
  LocalOpportunityContext,
  OpportunityPoi,
  OpportunityResult,
  OpportunityRun,
  OpportunityRunInput,
  OpportunityRunStatus,
  TrialPortfolio,
  TrialPortfolioItem,
} from "./types";

export class OpportunityPreviewService {
  private activeRuns = new Map<string, OpportunityRun>();
  private runPois = new Map<string, OpportunityPoi[]>();
  private runResults = new Map<string, OpportunityResult>();
  private timers = new Map<string, NodeJS.Timeout[]>();

  public async createRun(input: OpportunityRunInput): Promise<OpportunityRun> {
    const runId = `opp-run-${Date.now()}`;
    const location = input.analysisLocation || DEFAULT_STORE_LOCATION;
    const pois =
      input.pois && input.pois.length > 0
        ? input.pois
        : generatePreviewPoisForLocation(location, input.radiusKm || 3);

    this.runPois.set(runId, pois);

    const initialRun: OpportunityRun = {
      runId,
      storeId: input.storeId,
      storeName: input.storeName,
      analysisLocation: location,
      radiusKm: input.radiusKm || 3,
      trialBudget: input.trialBudget || 2000000,
      status: "scanning",
      currentStageIndex: 1,
      totalStages: 5,
      progressPercent: 12,
      stageMessage: `Đang quét khu vực ${input.radiusKm || 3} km...`,
      scannedCount: Math.min(6, pois.length),
      totalPoisCount: pois.length,
      createdAt: new Date().toISOString(),
    };

    this.activeRuns.set(runId, initialRun);
    this.schedulePreviewProgression(runId, input, pois.length);

    return initialRun;
  }

  public async getRun(runId: string): Promise<OpportunityRun> {
    const run = this.activeRuns.get(runId);
    if (!run) {
      throw new Error(`Opportunity run ${runId} not found in preview service.`);
    }
    return { ...run };
  }

  public async getResult(runId: string): Promise<OpportunityResult> {
    const result = this.runResults.get(runId);
    if (result) {
      return result;
    }

    const run = this.activeRuns.get(runId);
    if (run && run.status === "completed") {
      const builtResult = this.buildResult(run);
      this.runResults.set(runId, builtResult);
      return builtResult;
    }

    throw new Error(`Opportunity run ${runId} is not completed yet.`);
  }

  public cancelRun(runId: string): void {
    const timers = this.timers.get(runId);
    if (timers) {
      timers.forEach((t) => clearTimeout(t));
      this.timers.delete(runId);
    }
    const run = this.activeRuns.get(runId);
    if (run && run.status !== "completed") {
      run.status = "idle";
      run.stageMessage = "Đã dừng quét.";
    }
  }

  private schedulePreviewProgression(runId: string, input: OpportunityRunInput, totalPois: number): void {
    const run = this.activeRuns.get(runId);
    if (!run) return;

    const stages: Array<{
      status: OpportunityRunStatus;
      stageIndex: number;
      progressPercent: number;
      stageMessage: string;
      scannedCount: number;
      delayMs: number;
    }> = [
      {
        status: "scanning",
        stageIndex: 1,
        progressPercent: 25,
        stageMessage: `Đang quét khu vực ${input.radiusKm || 3} km...`,
        scannedCount: Math.min(10, totalPois),
        delayMs: 500,
      },
      {
        status: "scanning",
        stageIndex: 1,
        progressPercent: 40,
        stageMessage: `Đang quét khu vực ${input.radiusKm || 3} km...`,
        scannedCount: Math.min(16, totalPois),
        delayMs: 1000,
      },
      {
        status: "analyzing_context",
        stageIndex: 2,
        progressPercent: 55,
        stageMessage: `✓ Đã nhận diện ${totalPois} điểm bối cảnh · Đang phân tích...`,
        scannedCount: totalPois,
        delayMs: 1600,
      },
      {
        status: "matching_candidates",
        stageIndex: 3,
        progressPercent: 70,
        stageMessage: `Đang đối chiếu Candidate Catalog... (${PREVIEW_CANDIDATE_CATALOG.length} ứng viên)`,
        scannedCount: totalPois,
        delayMs: 2300,
      },
      {
        status: "ranking",
        stageIndex: 4,
        progressPercent: 85,
        stageMessage: "Đang xếp hạng cơ hội theo bối cảnh khu vực...",
        scannedCount: totalPois,
        delayMs: 2900,
      },
      {
        status: "building_portfolio",
        stageIndex: 5,
        progressPercent: 95,
        stageMessage: "Đang xây dựng danh mục thử nghiệm tối ưu theo ngân sách...",
        scannedCount: totalPois,
        delayMs: 3400,
      },
      {
        status: "completed",
        stageIndex: 5,
        progressPercent: 100,
        stageMessage: "Hoàn tất phân tích cơ hội.",
        scannedCount: totalPois,
        delayMs: 3900,
      },
    ];

    const runTimers: NodeJS.Timeout[] = [];

    stages.forEach((stage) => {
      const timer = setTimeout(() => {
        const current = this.activeRuns.get(runId);
        if (!current) return;

        current.status = stage.status;
        current.currentStageIndex = stage.stageIndex;
        current.progressPercent = stage.progressPercent;
        current.stageMessage = stage.stageMessage;
        current.scannedCount = stage.scannedCount;

        if (stage.status === "completed") {
          current.completedAt = new Date().toISOString();
          const finalResult = this.buildResult(current);
          this.runResults.set(runId, finalResult);
        }
      }, stage.delayMs);

      runTimers.push(timer);
    });

    this.timers.set(runId, runTimers);
  }

  public buildResult(run: OpportunityRun): OpportunityResult {
    const candidates = [...PREVIEW_CANDIDATE_CATALOG];
    const budget = run.trialBudget || 2000000;
    const location = run.analysisLocation || DEFAULT_STORE_LOCATION;
    const pois =
      this.runPois.get(run.runId) ||
      generatePreviewPoisForLocation(location, run.radiusKm || 3);

    // Invariant: Card counts must derive directly from POIs
    const competitorCount = pois.filter((p) => p.category === "competitor").length;
    const universityCount = pois.filter((p) => p.category === "university").length;
    const transitCount = pois.filter((p) => p.category === "transit").length;
    const retailCount = pois.filter((p) => p.category === "supporting_retail").length;

    const dynamicContext: LocalOpportunityContext = {
      radiusKm: run.radiusKm || 3,
      totalPois: pois.length,
      scannedPois: pois.length,
      metrics: [
        { key: "competitor", label: "Cửa hàng / Đối thủ", count: competitorCount },
        { key: "university", label: "Trường / Đại học", count: universityCount },
        { key: "transit", label: "Transit", count: transitCount },
        { key: "supporting_retail", label: "Retail bổ trợ", count: retailCount },
      ],
      signals: PREVIEW_LOCAL_CONTEXT.signals,
      poiPoints: PREVIEW_LOCAL_CONTEXT.poiPoints,
      pois,
    };

    // Build portfolio under budget deterministically using portfolio optimizer
    const recommendedIds = new Set(getRecommendedCandidateIds(candidates, budget));
    let allocatedCost = 0;
    const portfolioItems: TrialPortfolioItem[] = [];

    candidates.forEach((cand) => {
      const isSelected = recommendedIds.has(cand.id);
      if (isSelected) {
        allocatedCost += cand.trialCost;
      }

      portfolioItems.push({
        candidateId: cand.id,
        candidateName: cand.name,
        category: cand.category,
        trialCost: cand.trialCost,
        score: cand.opportunityScore,
        domain: cand.domain,
        selected: isSelected,
        whySnippet: cand.whyPath[cand.whyPath.length - 1],
      });
    });

    const selectedItems = portfolioItems.filter((item) => item.selected);
    const trialPortfolio: TrialPortfolio = {
      budget,
      allocatedCost,
      remainingBudget: Math.max(0, budget - allocatedCost),
      candidateCount: selectedItems.length,
      items: portfolioItems,
    };

    return {
      runId: run.runId,
      storeId: run.storeId,
      analysisLocation: location,
      status: "completed",
      localContext: dynamicContext,
      rankedCandidates: candidates,
      trialPortfolio,
      scanTimestamp: run.completedAt || new Date().toISOString(),
    };
  }
}
