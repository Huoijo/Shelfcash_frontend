/**
 * Staff / Branch Operations API Client
 * Provides typed access to Staff operations endpoints.
 * Currently guarded by feature flags since Backend endpoints are proposed.
 */

import { DEFAULT_STAFF_FEATURES, type StaffFeatureAvailability, type StaffTasksResponse, type StaffReceiptsResponse, type StaffInventoryCountsResponse, type OperationalIssuesResponse, type StaffBootstrapResponse } from "./staff-types";

export class StaffClient {
  private features: StaffFeatureAvailability;

  constructor(features: StaffFeatureAvailability = DEFAULT_STAFF_FEATURES) {
    this.features = features;
  }

  getFeatures(): StaffFeatureAvailability {
    return { ...this.features };
  }

  async getStaffBootstrap(_storeId: string): Promise<StaffBootstrapResponse | null> {
    // Backend endpoint proposed (GET /api/v1/stores/{store_id}/staff/bootstrap)
    return null;
  }

  async getStaffTasks(_storeId: string, _date?: string): Promise<StaffTasksResponse> {
    if (!this.features.todayTasks) {
      return {
        date: new Date().toISOString().slice(0, 10),
        summary: { pending: 0, in_progress: 0, completed: 0 },
        tasks: [],
      };
    }
    return {
      date: new Date().toISOString().slice(0, 10),
      summary: { pending: 0, in_progress: 0, completed: 0 },
      tasks: [],
    };
  }

  async getStaffReceipts(_storeId: string, _date?: string): Promise<StaffReceiptsResponse> {
    if (!this.features.receiving) {
      return { items: [] };
    }
    return { items: [] };
  }

  async getStaffInventoryCounts(_storeId: string, _date?: string): Promise<StaffInventoryCountsResponse> {
    if (!this.features.inventoryCountAssignments) {
      return { sessions: [] };
    }
    return { sessions: [] };
  }

  async getOperationalIssues(_storeId: string): Promise<OperationalIssuesResponse> {
    if (!this.features.issueReporting) {
      return { items: [] };
    }
    return { items: [] };
  }
}

export const staffClient = new StaffClient();
