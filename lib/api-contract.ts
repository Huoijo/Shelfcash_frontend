/** Canonical transport and workflow contracts shared at the API boundary. */

export type DecimalLike = string | number;

export interface ApiErrorBody {
  code: string;
  message: string;
  details: Record<string, unknown>;
  request_id: string | null;
}

export interface Page<T> {
  items: T[];
  page: number;
  page_size: number;
  total: number;
}

export type RunStatus = "running" | "completed" | "blocked" | "failed";
export type CoreStrategy = "lean" | "balanced" | "protected";
export type LegacyStrategy = "economy" | "balanced" | "safe";

export interface RunFailure {
  failure_code?: string | null;
  failure_message?: string | null;
}

export interface ForecastRunMetadata extends RunFailure {
  forecast_run_id: string;
  store_id?: string;
  status: RunStatus;
  engine_status?: string;
  cutoff_date?: string;
  horizon_days?: number;
  model_version?: string | null;
  warnings?: unknown[];
  created_at?: string;
  completed_at?: string | null;
  result_url?: string;
}

export interface ForecastPrediction {
  product_id: string;
  product_name: string;
  target_date: string;
  horizon: number;
  p25: number;
  p50: number;
  p75: number;
  interval_lower: number;
  interval_upper: number;
  baseline_p50: number;
  calibration_source: string;
  warnings: unknown[];
}

export interface ForecastRunResult extends ForecastRunMetadata {
  predictions: ForecastPrediction[];
}

export interface IngredientDemandContribution {
  product_id?: string;
  product_name?: string;
  p25?: number;
  p50?: number;
  p75?: number;
  [key: string]: unknown;
}

export interface IngredientDemandPrediction {
  ingredient_id: string;
  ingredient_name?: string;
  target_date: string;
  p25: number;
  p50: number;
  p75: number;
  unit?: string;
  contributions: IngredientDemandContribution[];
  warnings?: unknown[];
}

export interface IngredientDemandRun extends RunFailure {
  ingredient_demand_run_id: string;
  forecast_run_id?: string;
  store_id?: string;
  status: RunStatus;
  predictions?: IngredientDemandPrediction[];
  warnings?: unknown[];
  created_at?: string;
  completed_at?: string | null;
}

export interface ProcurementPlanLine {
  ingredient_id: string;
  supplier_id: string | null;
  supplier_term_id: string | null;
  order_date: string;
  expected_arrival_date: string | null;
  raw_required_quantity: number;
  order_quantity: number;
  rounding_excess: number;
  unit: string;
  pack_count: number | null;
  unit_cost: number | null;
  line_cost: number;
  moq: number | null;
  pack_size: number | null;
  lead_time_days: number | null;
  reason_codes: string[];
  warnings: unknown[];
  [key: string]: unknown;
}

export interface ProcurementPlan {
  strategy: CoreStrategy;
  feasible?: boolean;
  feasibility?: boolean | string | Record<string, unknown>;
  cost?: number;
  shortage?: number;
  waste?: number;
  fill_rate?: number;
  metrics?: Record<string, unknown>;
  warnings?: unknown[];
  violations?: unknown[];
  daily_projections?: unknown[];
  lines: ProcurementPlanLine[];
  [key: string]: unknown;
}

export interface ProcurementPlanRun extends RunFailure {
  procurement_plan_run_id: string;
  forecast_run_id?: string;
  store_id?: string;
  status: RunStatus;
  recommended_strategy?: CoreStrategy | null;
  plans?: ProcurementPlan[];
  warnings?: unknown[];
  created_at?: string;
  completed_at?: string | null;
}

export interface RecipeDetail {
  product_id?: string;
  recipe_version_id?: string;
  version?: number;
  effective_from?: string;
  effective_to?: string | null;
  yield_quantity?: DecimalLike;
  process_loss_rate?: DecimalLike;
  lines?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

export type PurchaseOrderStatus =
  | "draft"
  | "ordered"
  | "partially_received"
  | "received";

export interface PurchaseOrderRecord {
  po_id: string;
  status: PurchaseOrderStatus;
  version: number;
  lines: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

export interface PurchaseOrderCreateResponse {
  orders: PurchaseOrderRecord[];
}

export interface RunWaitOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  requestTimeoutMs?: number;
  pollIntervalMs?: number;
}

export const MIN_FORECAST_HORIZON = 1;
export const MAX_FORECAST_HORIZON = 7;

export function assertForecastHorizon(value: number): number {
  if (
    !Number.isInteger(value) ||
    value < MIN_FORECAST_HORIZON ||
    value > MAX_FORECAST_HORIZON
  ) {
    throw new RangeError(
      `forecast horizon must be an integer from ${MIN_FORECAST_HORIZON} to ${MAX_FORECAST_HORIZON}`,
    );
  }
  return value;
}

/**
 * Converts backend Decimal strings and ordinary numbers at one boundary.
 * Both dot-decimal JSON strings and common comma-decimal display strings are
 * accepted; non-numeric values resolve to the caller's explicit fallback.
 */
export function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : fallback;
  if (typeof value !== "string") return fallback;
  let normalized = value.trim().replace(/[\s\u00a0]/g, "");
  if (!normalized) return fallback;

  const comma = normalized.lastIndexOf(",");
  const dot = normalized.lastIndexOf(".");
  if (comma >= 0 && dot >= 0) {
    const decimalSeparator = comma > dot ? "," : ".";
    const groupingSeparator = decimalSeparator === "," ? "." : ",";
    normalized = normalized.replaceAll(groupingSeparator, "");
    if (decimalSeparator === ",") normalized = normalized.replace(",", ".");
  } else if (comma >= 0) {
    const groups = normalized.split(",");
    normalized =
      groups.length > 2 && groups.slice(1).every((group) => group.length === 3)
        ? groups.join("")
        : `${groups.shift() ?? ""}.${groups.join("")}`;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export interface DateOnlyParts {
  year: number;
  month: number;
  day: number;
}

export function parseDateOnly(value: string): DateOnlyParts | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    return null;
  }
  return { year, month, day };
}

export function addDaysToDateOnly(value: string, days: number): string {
  const parts = parseDateOnly(value);
  if (!parts || !Number.isInteger(days)) {
    throw new RangeError("A valid YYYY-MM-DD date and integer day offset are required.");
  }
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return date.toISOString().slice(0, 10);
}

export function formatDateOnly(
  value: string,
  locale = "vi-VN",
): string {
  const parts = parseDateOnly(value);
  if (!parts) return value;
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(parts.year, parts.month - 1, parts.day)));
}

export function isTimezoneAwareDateTime(value: string): boolean {
  return /(?:Z|[+-]\d{2}:\d{2})$/i.test(value);
}

/** Formats an instant with the explicit offset for the requested IANA zone. */
export function toTimezoneAwareIso(
  value: Date = new Date(),
  timeZone = "Asia/Ho_Chi_Minh",
): string {
  if (Number.isNaN(value.getTime())) throw new RangeError("Invalid date.");
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);
  const fields = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const localAsUtc = Date.UTC(
    Number(fields.year),
    Number(fields.month) - 1,
    Number(fields.day),
    Number(fields.hour),
    Number(fields.minute),
    Number(fields.second),
  );
  const instantToSecond = Math.floor(value.getTime() / 1_000) * 1_000;
  const offsetMinutes = Math.round((localAsUtc - instantToSecond) / 60_000);
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absolute = Math.abs(offsetMinutes);
  const offset = `${sign}${String(Math.floor(absolute / 60)).padStart(2, "0")}:${String(absolute % 60).padStart(2, "0")}`;
  return `${fields.year}-${fields.month}-${fields.day}T${fields.hour}:${fields.minute}:${fields.second}${offset}`;
}
