/**
 * Staff / Branch Operations Domain Types
 * Defines the future contract and UI representations for branch staff workflows:
 * 1. Today Task Queue (Hôm nay)
 * 2. Receiving Goods (Nhận hàng)
 * 3. Inventory Counting (Kiểm kho)
 * 4. Operational Issue Reporting (Báo vấn đề)
 */

export interface StaffFeatureAvailability {
  todayTasks: boolean;
  receiving: boolean;
  inventoryCountAssignments: boolean;
  issueReporting: boolean;
}

export const DEFAULT_STAFF_FEATURES: StaffFeatureAvailability = {
  todayTasks: false,
  receiving: false,
  inventoryCountAssignments: false,
  issueReporting: false,
};

// ── 1. TODAY / TASK QUEUE ──
export type StaffTaskType =
  | "receive_goods"
  | "inventory_count"
  | "check_inventory"
  | "resolve_issue"
  | "other";

export type StaffTaskStatus = "pending" | "in_progress" | "completed" | "cancelled";
export type StaffTaskPriority = "urgent" | "high" | "normal" | "low";

export interface StaffTask {
  task_id: string;
  task_type: StaffTaskType;
  title: string;
  status: StaffTaskStatus;
  priority: StaffTaskPriority;
  due_at: string;
  source_type?: "purchase_order" | "count_session" | "operational_issue" | "manual";
  source_id?: string;
  action?: {
    destination: "receiving" | "counts" | "issues" | "inventory";
    resource_id?: string;
  };
  created_at?: string;
  completed_at?: string;
}

export interface StaffTasksResponse {
  date: string;
  summary: {
    pending: number;
    in_progress: number;
    completed: number;
  };
  tasks: StaffTask[];
}

// ── 2. RECEIVING GOODS ──
export type ReceiptCondition =
  | "accepted"
  | "damaged"
  | "short_delivery"
  | "wrong_item"
  | "rejected";

export interface StaffReceiptLine {
  line_id: string;
  ingredient_id: string;
  ingredient_name: string;
  ordered_quantity: number;
  unit: string;
  received_quantity?: number;
  condition?: ReceiptCondition;
}

export interface StaffReceiptItem {
  po_id: string;
  supplier_id: string;
  supplier_name: string;
  expected_delivery_date: string;
  status: "due" | "partially_received" | "received" | "cancelled";
  lines: StaffReceiptLine[];
}

export interface StaffReceiptsResponse {
  items: StaffReceiptItem[];
}

// ── 3. INVENTORY COUNTS ──
export interface StaffInventoryCountItem {
  lot_id: string;
  ingredient_id: string;
  ingredient_name: string;
  system_quantity: number;
  unit: string;
  expected_version?: number;
  counted_quantity?: number;
  note?: string;
}

export interface StaffInventoryCountSession {
  count_session_id: string;
  title: string;
  due_at: string;
  status: "pending" | "in_progress" | "completed";
  items: StaffInventoryCountItem[];
}

export interface StaffInventoryCountsResponse {
  sessions: StaffInventoryCountSession[];
}

// ── 4. OPERATIONAL ISSUES ──
export type OperationalIssueType =
  | "stock_mismatch"
  | "damaged_goods"
  | "expired_goods"
  | "delivery_shortage"
  | "wrong_item"
  | "stockout"
  | "other";

export type OperationalIssueStatus =
  | "open"
  | "acknowledged"
  | "resolved"
  | "dismissed";

export interface OperationalIssue {
  issue_id: string;
  issue_type: OperationalIssueType;
  status: OperationalIssueStatus;
  reported_at: string;
  reported_by: string;
  store_id: string;
  ingredient_id?: string | null;
  lot_id?: string | null;
  po_id?: string | null;
  system_quantity?: number | null;
  observed_quantity?: number | null;
  unit?: string | null;
  note?: string | null;
}

export interface OperationalIssuesResponse {
  items: OperationalIssue[];
}

// ── STAFF BOOTSTRAP ──
export interface StaffBootstrapResponse {
  today: string;
  store: {
    store_id: string;
    store_name: string;
    timezone: string;
  };
  staff: {
    user_id: string;
    name: string;
    role: string;
  };
  summary: {
    pending_tasks: number;
    receipts_due_today: number;
    inventory_counts_due: number;
    open_issues: number;
  };
}
