import { OpportunityApiService } from "./api-service";
import { getOpportunityMode, type OpportunityMode } from "./config";
import { OpportunityPreviewService } from "./preview-service";
import type {
  OpportunityResult,
  OpportunityRun,
  OpportunityRunInput,
} from "./types";

export interface OpportunityService {
  createRun(input: OpportunityRunInput): Promise<OpportunityRun>;
  getRun(runId: string, storeId?: string): Promise<OpportunityRun>;
  getResult(runId: string, storeId?: string): Promise<OpportunityResult>;
  cancelRun?(runId: string): void;
}

// Global singleton instances to maintain state across component re-renders
const previewServiceInstance = new OpportunityPreviewService();
const apiServiceInstance = new OpportunityApiService();

export function getOpportunityService(
  overrideMode?: OpportunityMode
): OpportunityService {
  const mode = overrideMode ?? getOpportunityMode();

  switch (mode) {
    case "live":
      return apiServiceInstance;
    case "preview":
      return previewServiceInstance;
    case "disabled":
    default:
      // Return preview instance as safe fallback for any dry-runs without making network calls
      return previewServiceInstance;
  }
}
