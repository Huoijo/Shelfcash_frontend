import type {
  CoreStrategy,
  LegacyStrategy,
  RunStatus,
} from "./api-contract";

export type { CoreStrategy, LegacyStrategy, RunStatus } from "./api-contract";

/** Statuses actually emitted by InventoryService, plus a UI-only missing state. */
export type InventoryStatus =
  | "stockout"
  | "expired"
  | "expiring"
  | "healthy"
  | "missing";

export type Strategy = "Tiết kiệm" | "Cân bằng" | "An toàn";

export type DataType =
  | "sales"
  | "purchases"
  | "inventory"
  | "recipes"
  | "suppliers"
  | "other"
  | "skip";

export interface InventoryItem {
  lotId?: string;
  ingredientId?: string;
  supplierId?: string;
  constraintId?: string;
  constraintVersion?: number;
  ingredient: string;
  sku: string;
  unit: string;
  onHand: number;
  usableQuantity?: number;
  expiredQty?: number;
  receivedDate?: string;
  version?: number;
  lots?: InventoryLot[];
  unitCost: number;
  expiryDate: string;
  expiringQty: number;
  safetyStock: number | null;
  inbound: number;
  supplier: string;
  leadTimeDays: number;
  moq: number;
  packSize: number;
  capacity: number;
  lastCounted: string;
  backendStatus?: InventoryStatus;
  daysSupply?: number;
}

export interface InventoryLot {
  lotId: string;
  ingredientId?: string;
  supplierId?: string;
  ingredient: string;
  sku: string;
  unit: string;
  onHand: number;
  usableQuantity: number;
  expiringQuantity: number;
  expiredQuantity: number;
  unitCost: number;
  receivedDate: string;
  expiryDate: string;
  supplier: string;
  status: InventoryStatus;
  lastCounted: string;
  version: number;
}

export interface EnrichedInventoryItem extends InventoryItem {
  averageDailyUsage: number;
  daysSupply: number;
  expiryDays: number;
  countAgeDays: number;
  statusKey: InventoryStatus;
  status: string;
  dataQuality: string;
}

export interface Product {
  productId?: string;
  recipeVersionId?: string;
  recipeVersion?: number;
  recipeVersionLabel?: string;
  product: string;
  sku: string;
  price: number;
  itemType?: "single" | "combo";
  status?: "active" | "inactive";
  sellingUnit?: string;
  recipeStatus: "Hoàn chỉnh" | "Thiếu định lượng";
  effectiveDate?: string;
  recipeYieldQuantity?: number;
  recipeProcessLossRate?: number;
}

export type MenuItemType = "single" | "combo";
export type MenuItemStatus = "active" | "inactive";

export interface MenuComponent {
  componentProductId: string;
  sku: string;
  product: string;
  quantity: number;
  sellingUnit: string;
  unitPrice: number;
  lineListPrice: number;
}

export interface MenuItem {
  productId: string;
  sku: string;
  product: string;
  itemType: MenuItemType;
  sellingUnit: string;
  listPrice: number;
  price: number;
  discountRate: number;
  savingsAmount: number;
  status: MenuItemStatus;
  currency: string;
  components: MenuComponent[];
  version: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface MenuComponentDraft {
  componentProductId: string;
  quantity: number;
}

export interface MenuItemDraft {
  sku: string;
  product: string;
  itemType: MenuItemType;
  sellingUnit: string;
  price: number;
  status: MenuItemStatus;
  components: MenuComponentDraft[];
}

export interface MenuSummary {
  singleCount: number;
  comboCount: number;
  activeCount: number;
  inactiveCount: number;
}

export interface MenuListResponse extends ApiRecord {
  items?: ApiRecord[];
  menu?: ApiRecord[];
  summary?: ApiRecord;
  page?: number;
  page_size?: number;
  total?: number;
}

export interface RecipeLine {
  productId?: string;
  ingredientId?: string;
  product: string;
  ingredient: string;
  quantity: number;
  unit: string;
  recipeVersion?: string | number;
  effectiveDate?: string;
}

export interface Ingredient {
  ingredientId?: string;
  ingredient: string;
  unit: string;
  sku?: string;
}

export interface Alias {
  ingredientId?: string;
  sourceName: string;
  canonicalName: string;
}

export interface CalendarDay {
  date: string;
  weekday: string;
  weekend: boolean;
  holiday: boolean;
  promotion: boolean;
  promotionNote: string;
}

export interface Settings {
  monthlyBudget: number;
  reservedBudget: number;
  spentBudget: number;
  remainingBudget: number;
  forecastHorizon: number;
  defaultStrategy: LegacyStrategy;
  version: number;
  safetyPolicy?: string;
  updatedAt?: string;
  storeId: string;
  storeName: string;
  timezone?: string;
  currency?: string;
  latestForecastRunId?: string;
  latestPlanRunId?: string;
  dataFreshness?: Record<string, unknown>;
}

export interface ImportLog {
  file: string;
  sheet: string;
  dataType: string;
  rows: number;
  importedAt: string;
}

export interface RecipeVersion {
  product: string;
  savedAt: string;
  effectiveUntil: string;
  rows: RecipeLine[];
}

export interface BootstrapData {
  today: string;
  inventory: InventoryItem[];
  ingredients: Ingredient[];
  products: Product[];
  menu: MenuItem[];
  recipes: RecipeLine[];
  salesHistory: SalesHistoryRow[];
  usageHistory: UsageHistoryRow[];
  purchaseHistory: PurchaseHistoryRow[];
  supplierConstraints: SupplierConstraintRow[];
  inventoryConstraints: InventoryConstraint[];
  businessConstraints: Record<string, unknown>[];
  validationSummary: Record<string, unknown>;
  ingestionMetadata: Record<string, unknown>;
  aliases: Alias[];
  futureCalendar: CalendarDay[];
  settings: Settings;
}

export interface SalesHistoryRow {
  date: string;
  product: string;
  quantity: number;
  unitPrice?: number;
  promotion?: boolean;
}

export interface UsageHistoryRow {
  date: string;
  ingredient: string;
  quantity: number;
  unit: string;
}

export interface PurchaseHistoryRow {
  date: string;
  ingredient: string;
  quantity: number;
  unitCost: number;
  supplier: string;
  expiryDate?: string;
}

export interface SupplierConstraintRow {
  constraintId?: string;
  storeId?: string;
  supplierId?: string;
  ingredientId?: string;
  ingredient: string;
  supplier: string;
  unitCost: number;
  moq: number;
  packSize: number;
  leadTimeDays: number;
  orderUnit?: string;
  baseUnit?: string;
  version?: number;
  active?: boolean;
  effectiveDate?: string | null;
  endDate?: string | null;
}

export type InventoryConstraintType =
  | "safety_stock"
  | "maximum_stock"
  | "minimum_stock"
  | "shelf_life_target"
  | "storage_capacity"
  | "maximum_storage_volume"
  | (string & {});

export interface InventoryConstraint {
  constraintId: string;
  storeId: string;
  ingredientId: string | null;
  ingredientName?: string | null;
  constraintType: InventoryConstraintType;
  value: number | string;
  unit: string | null;
  effectiveDate: string | null;
  endDate: string | null;
  version: number;
  active: boolean;
}

export interface QuantitySetting {
  value: number;
  unit: string | null;
  constraintId: string;
  effectiveDate: string | null;
  version: number;
}

export interface ProcurementSettingsRow {
  ingredientId: string;
  ingredientName: string;
  safetyStock: QuantitySetting | null;
  maximumStock: QuantitySetting | null;
  supplierTerms: SupplierConstraintRow[];
}

export interface ForecastPoint {
  date: string;
  actual?: number;
  p25?: number;
  p50?: number;
  p75?: number;
  intervalLower?: number;
  intervalUpper?: number;
  baselineP50?: number;
  calibrationSource?: string;
  warnings?: string[];
  promotion?: boolean;
  weekend?: boolean;
}

export interface ForecastResult {
  productId?: string;
  product?: string;
  ingredientId?: string;
  ingredient: string;
  unit: string;
  history: ForecastPoint[];
  forecast: ForecastPoint[];
  totals: {
    p25: number;
    p50: number;
    p75: number;
  };
  drivers: string[];
  confidence: "Tốt" | "Khá" | "Cần thêm dữ liệu";
  dataNotes: string[];
}

export interface IngredientDemandContribution {
  productId?: string;
  product: string;
  p25: number;
  p50: number;
  p75: number;
  quantity?: number;
  unit?: string;
}

export interface IngredientDemandResult {
  ingredientId: string;
  ingredient: string;
  unit: string;
  forecast: ForecastPoint[];
  totals: { p25: number; p50: number; p75: number };
  contributions: IngredientDemandContribution[];
  warnings: string[];
}

export interface Recommendation {
  poLineId?: string;
  recommendationId?: string;
  ingredientId?: string;
  supplierId?: string;
  supplierTermId?: string;
  ingredient: string;
  unit: string;
  status: string;
  statusKey: InventoryStatus;
  onHand: number;
  usableStock: number;
  forecastDemand: number;
  safetyStock: number;
  configuredSafetyStock?: number | null;
  fallbackPolicy?: string | null;
  inbound: number;
  recommendedQty: number;
  orderQty: number;
  unitCost: number;
  cost: number;
  supplier: string;
  moq: number;
  packSize: number;
  leadTimeDays: number;
  expiryRiskQty: number;
  capacityWarning: boolean;
  reason: string;
  reasonCodes?: string[];
  warnings?: string[];
  orderDate?: string;
  expectedArrivalDate?: string | null;
  rawRequiredQuantity?: number;
  roundingExcess?: number;
  packCount?: number | null;
  receivedQuantity?: number;
  remainingQuantity?: number;
}

export interface PlanningScenario {
  strategy: CoreStrategy;
  feasible: boolean;
  cost: number;
  shortage: number;
  waste: number;
  fillRate: number;
  metrics: Record<string, unknown>;
  warnings: string[];
  violations: string[];
  recommendations: Recommendation[];
}

export interface PlanResponse {
  strategy: Strategy;
  status: RunStatus | "idle";
  engineStatus?: string;
  failureCode?: string | null;
  failureMessage?: string | null;
  cutoffDate?: string;
  horizonDays?: number;
  createdAt?: string;
  completedAt?: string;
  enrichedInventory: EnrichedInventoryItem[];
  recommendations: Recommendation[];
  forecasts: Record<string, ForecastResult>;
  ingredientDemand: Record<string, IngredientDemandResult>;
  scenarios: PlanningScenario[];
  recommendedStrategy?: CoreStrategy | null;
  forecastRunId?: string;
  ingredientDemandRunId?: string;
  procurementPlanRunId?: string;
  planRunId?: string;
  budget?: {
    limit: number;
    plannedCost: number;
    remainingAfterPlan: number;
  };
  warnings?: string[];
}

export interface PurchaseOrder {
  poId: string;
  supplierId?: string;
  supplier: string;
  orderDate: string;
  deliveryDate: string;
  strategy: Strategy;
  lines: Recommendation[];
  total: number;
  budgetAfter: number;
  status: PurchaseOrderStatus;
  version?: number;
  confirmedAt?: string;
  receivedAt?: string;
  deliveryReference?: string;
}

export type PurchaseOrderStatus =
  | "draft"
  | "ordered"
  | "partially_received"
  | "received";

export interface ParsedSheet {
  name: string;
  rowCount: number;
  columns: string[];
  rows: Record<string, string | number | boolean | null>[];
  detectedType: DataType;
  confidence: number;
  suggestedMapping: Record<string, string>;
}

export interface ParsedWorkbook {
  filename: string;
  sheets: ParsedSheet[];
}

export type ApiRecord = Record<string, unknown>;

export interface ShelfCashApiErrorBody {
  code: string;
  message: string;
  details: ApiRecord;
  request_id: string | null;
}

export interface SheetProfile extends ApiRecord {
  sheet_name?: string;
  sheet_type?: string;
  columns?: unknown[];
  row_count?: number;
  sample_rows?: ApiRecord[];
}

export interface MappingSuggestion extends ApiRecord {
  sheet_name?: string;
  sheet_type?: string;
  column_mapping?: Record<string, string | null>;
  source?: "rule" | "llm" | "rule_fallback" | string;
}

export interface ImportCreateResponse extends ApiRecord {
  import_id: string;
  profiles: SheetProfile[];
  suggested_mappings: unknown;
  source?: "rule" | "llm" | "rule_fallback" | string;
  warnings?: unknown[];
  errors?: unknown[];
  requires_review?: boolean;
}

export interface ImportStatusResponse extends ApiRecord {
  import_id?: string;
  status?: string;
  mappings?: unknown;
  warnings?: unknown[];
  errors?: unknown[];
  requires_review?: boolean;
}

export interface ConfirmImportMapping {
  profile_id?: string;
  file_name?: string;
  sheet_name?: string;
  sheet_type: string;
  column_mapping: Record<string, string | null>;
  skip?: boolean;
}

export interface IngestionResult extends ApiRecord {
  store_id: string;
  forecast_date: string;
  forecast_horizon: number;
  inventory: ApiRecord[];
  sales_history: ApiRecord[];
  usage_history: ApiRecord[];
  recipes: ApiRecord[];
  purchase_history: ApiRecord[];
  supplier_constraints: ApiRecord[];
  calendar_features: ApiRecord[];
  business_constraints: ApiRecord[];
  menu?: ApiRecord[];
  validation_summary: ApiRecord;
  ingestion_metadata: ApiRecord;
}

export interface EditableSheetMapping {
  id: string;
  profile: SheetProfile;
  sheetName: string;
  fileName: string;
  sheetType: string;
  rowCount: number;
  columns: string[];
  sampleRows: ApiRecord[];
  confidence: number | null;
  source: string;
  mapping: Record<string, string>;
  targetFields: string[];
}

export interface BackendConnectionHealth {
  service: "online" | "offline";
  llm: "online" | "offline" | "unknown";
  serviceName?: string;
  provider?: string;
  message?: string;
}

export type ApiStrategy = LegacyStrategy;

export interface StoreBootstrapResponse extends ApiRecord {
  today: string;
  store: {
    store_id: string;
    store_name: string;
    timezone: string;
    currency: string;
  };
  inventory: ApiRecord[];
  ingredients?: ApiRecord[];
  products: ApiRecord[];
  menu?: ApiRecord[];
  recipes?: ApiRecord[];
  supplier_constraints: ApiRecord[];
  aliases: ApiRecord[];
  future_calendar: ApiRecord[];
  settings: {
    monthly_budget: number | string;
    reserved_budget?: number | string;
    spent_budget?: number | string;
    remaining_budget: number | string;
    forecast_horizon: number;
    default_strategy?: LegacyStrategy;
    safety_policy?: string;
    version?: number;
    updated_at?: string;
  };
  latest_runs: {
    forecast_run_id: string | null;
    plan_run_id: string | null;
  };
  data_freshness: ApiRecord;
}

export interface ForecastRunResponse extends ApiRecord {
  forecast_run_id: string;
  status: RunStatus;
  cutoff_date?: string;
  horizon_days?: number;
}

export interface ForecastRunResultResponse extends ApiRecord {
  forecast_run_id: string;
  status: RunStatus;
  model_version?: string;
  calibrator_version?: string;
  predictions?: ApiRecord[];
  forecasts?: ApiRecord[];
}

export interface PlanRunResponse extends ApiRecord {
  plan_run_id: string;
  status: RunStatus;
  strategy?: ApiStrategy;
}

export interface PlanRunResultResponse extends ApiRecord {
  plan_run_id: string;
  status: RunStatus;
  strategy: ApiStrategy;
  budget?: {
    limit?: number;
    planned_cost?: number;
    remaining_after_plan?: number;
  };
  recommendations: ApiRecord[];
  warnings?: unknown[];
}

export interface PurchaseOrderApiResponse extends ApiRecord {
  orders: ApiRecord[];
}
