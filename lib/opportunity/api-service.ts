import type {
  OpportunityResult,
  OpportunityRun,
  OpportunityRunInput,
} from "./types";

export class OpportunityApiService {
  private baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl || "/api/shelfcash/api/v1";
  }

  public async createRun(input: OpportunityRunInput): Promise<OpportunityRun> {
    const response = await fetch(
      `${this.baseUrl}/stores/${encodeURIComponent(input.storeId)}/opportunity-runs`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          radius_km: input.radiusKm,
          trial_budget: input.trialBudget,
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Không thể khởi tạo phiên quét cơ hội (${response.status}): ${errorText || response.statusText}`
      );
    }

    const data = await response.json();
    return this.adaptRun(data, input.storeName);
  }

  public async getRun(runId: string, storeId: string = "STORE_001"): Promise<OpportunityRun> {
    const response = await fetch(
      `${this.baseUrl}/stores/${encodeURIComponent(storeId)}/opportunity-runs/${encodeURIComponent(runId)}`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Không thể lấy trạng thái phiên quét (${response.status})`);
    }

    const data = await response.json();
    return this.adaptRun(data);
  }

  public async getResult(runId: string, storeId: string = "STORE_001"): Promise<OpportunityResult> {
    const response = await fetch(
      `${this.baseUrl}/stores/${encodeURIComponent(storeId)}/opportunity-runs/${encodeURIComponent(runId)}/result`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Không thể tải kết quả phiên quét cơ hội (${response.status})`);
    }

    return await response.json();
  }

  private adaptRun(raw: Record<string, unknown>, fallbackStoreName: string = "Cửa hàng"): OpportunityRun {
    return {
      runId: String(raw.run_id || raw.id || ""),
      storeId: String(raw.store_id || "STORE_001"),
      storeName: String(raw.store_name || fallbackStoreName),
      radiusKm: Number(raw.radius_km || 3),
      trialBudget: Number(raw.trial_budget || 2000000),
      status: (raw.status as OpportunityRun["status"]) || "idle",
      currentStageIndex: Number(raw.current_stage_index || 1),
      totalStages: Number(raw.total_stages || 5),
      progressPercent: Number(raw.progress_percent || 0),
      stageMessage: String(raw.stage_message || "Đang xử lý..."),
      scannedCount: Number(raw.scanned_count || 0),
      totalPoisCount: Number(raw.total_pois_count || 0),
      createdAt: String(raw.created_at || new Date().toISOString()),
      completedAt: raw.completed_at ? String(raw.completed_at) : undefined,
      error: raw.error ? String(raw.error) : undefined,
    };
  }
}
