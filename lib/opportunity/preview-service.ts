import {
  PREVIEW_CANDIDATE_CATALOG,
  PREVIEW_LOCAL_CONTEXT,
} from "./candidate-catalog";
import type {
  OpportunityCandidate,
  OpportunityResult,
  OpportunityRun,
  OpportunityRunInput,
  OpportunityRunStatus,
  TrialPortfolio,
  TrialPortfolioItem,
} from "./types";

export class OpportunityPreviewService {
  private activeRuns = new Map<string, OpportunityRun>();
  private runResults = new Map<string, OpportunityResult>();
  private timers = new Map<string, NodeJS.Timeout[]>();

  public async createRun(input: OpportunityRunInput): Promise<OpportunityRun> {
    const runId = `opp-run-${Date.now()}`;
    const initialRun: OpportunityRun = {
      runId,
      storeId: input.storeId,
      storeName: input.storeName,
      radiusKm: input.radiusKm || 3,
      trialBudget: input.trialBudget || 2000000,
      status: "scanning",
      currentStageIndex: 1,
      totalStages: 5,
      progressPercent: 15,
      stageMessage: `Đang quét khu vực ${input.radiusKm || 3} km...`,
      scannedCount: 12,
      totalPoisCount: PREVIEW_LOCAL_CONTEXT.totalPois,
      createdAt: new Date().toISOString(),
    };

    this.activeRuns.set(runId, initialRun);
    this.schedulePreviewProgression(runId, input);

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

  private schedulePreviewProgression(runId: string, input: OpportunityRunInput): void {
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
        scannedCount: 22,
        delayMs: 600,
      },
      {
        status: "analyzing_context",
        stageIndex: 2,
        progressPercent: 45,
        stageMessage: "✓ Đã nhận diện khu vực · Đang phân tích bối cảnh...",
        scannedCount: PREVIEW_LOCAL_CONTEXT.totalPois,
        delayMs: 1300,
      },
      {
        status: "matching_candidates",
        stageIndex: 3,
        progressPercent: 65,
        stageMessage: `Đang đối chiếu Candidate Catalog... (${PREVIEW_CANDIDATE_CATALOG.length} ứng viên)`,
        scannedCount: PREVIEW_LOCAL_CONTEXT.totalPois,
        delayMs: 2000,
      },
      {
        status: "ranking",
        stageIndex: 4,
        progressPercent: 85,
        stageMessage: "Đang xếp hạng cơ hội theo bối cảnh cửa hàng...",
        scannedCount: PREVIEW_LOCAL_CONTEXT.totalPois,
        delayMs: 2700,
      },
      {
        status: "building_portfolio",
        stageIndex: 5,
        progressPercent: 95,
        stageMessage: "Đang xây dựng danh mục thử nghiệm tối ưu theo ngân sách...",
        scannedCount: PREVIEW_LOCAL_CONTEXT.totalPois,
        delayMs: 3300,
      },
      {
        status: "completed",
        stageIndex: 5,
        progressPercent: 100,
        stageMessage: "Hoàn tất phân tích cơ hội.",
        scannedCount: PREVIEW_LOCAL_CONTEXT.totalPois,
        delayMs: 3800,
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

    // Build portfolio under budget deterministically
    let allocatedCost = 0;
    const portfolioItems: TrialPortfolioItem[] = [];

    candidates.forEach((cand) => {
      const fitsBudget = allocatedCost + cand.trialCost <= budget;
      const isTopRanked = cand.rank <= 3;
      const shouldSelect = isTopRanked && fitsBudget;

      if (shouldSelect) {
        allocatedCost += cand.trialCost;
      }

      portfolioItems.push({
        candidateId: cand.id,
        candidateName: cand.name,
        category: cand.category,
        trialCost: cand.trialCost,
        score: cand.opportunityScore,
        domain: cand.domain,
        selected: shouldSelect,
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
      status: "completed",
      localContext: PREVIEW_LOCAL_CONTEXT,
      rankedCandidates: candidates,
      trialPortfolio,
      scanTimestamp: run.completedAt || new Date().toISOString(),
    };
  }
}
