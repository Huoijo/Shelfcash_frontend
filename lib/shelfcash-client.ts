import type {
  ApiRecord,
  ApiStrategy,
  BackendConnectionHealth,
  ConfirmImportMapping,
  ForecastRunResponse,
  ForecastRunResultResponse,
  ImportCreateResponse,
  ImportStatusResponse,
  IngestionResult,
  MenuComponentDraft,
  MenuItemDraft,
  MenuListResponse,
  MappingSuggestion,
  PlanRunResponse,
  PlanRunResultResponse,
  SheetProfile,
  ShelfCashApiErrorBody,
  StoreBootstrapResponse,
} from "./types";

const proxyPrefix = "/api/shelfcash";

export class ShelfCashApiError extends Error {
  code: string;
  details: ApiRecord;
  status: number;

  constructor(body: ShelfCashApiErrorBody, status: number) {
    super(body.message);
    this.name = "ShelfCashApiError";
    this.code = body.code;
    this.details = body.details;
    this.status = status;
  }
}

function isRecord(value: unknown): value is ApiRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

async function parseResponse(response: Response): Promise<unknown> {
  if (response.status === 204) return {};
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) return response.json();
  const text = await response.text();
  return text ? { message: text } : {};
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${proxyPrefix}${path}`, init);
  const payload = await parseResponse(response);
  if (!response.ok) {
    const record = isRecord(payload) ? payload : {};
    throw new ShelfCashApiError(
      {
        code:
          typeof record.code === "string"
            ? record.code
            : `HTTP_${response.status}`,
        message:
          typeof record.message === "string"
            ? record.message
            : "Không thể kết nối ShelfCash backend.",
        details: isRecord(record.details) ? record.details : {},
      },
      response.status,
    );
  }
  return payload as T;
}

function idempotencyKey(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `shelfcash-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function jsonRequest(
  method: "POST" | "PUT" | "PATCH",
  body: unknown,
  idempotent = false,
): RequestInit {
  const headers = new Headers({
    accept: "application/json",
    "content-type": "application/json",
  });
  if (idempotent) headers.set("Idempotency-Key", idempotencyKey());
  return { method, headers, body: JSON.stringify(body) };
}

function storePath(storeId: string): string {
  return `/api/v1/stores/${encodeURIComponent(storeId)}`;
}

function healthStatus(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return ["ok", "healthy", "ready", "online"].includes(
    String(value.status ?? "").toLowerCase(),
  );
}

export async function getConnectionHealth(): Promise<BackendConnectionHealth> {
  const [service, llm] = await Promise.allSettled([
    request<ApiRecord>("/health"),
    request<ApiRecord>("/api/v1/llm/health"),
  ]);
  const serviceOnline =
    service.status === "fulfilled" && healthStatus(service.value);
  const llmOnline = llm.status === "fulfilled" && healthStatus(llm.value);
  const serviceRecord =
    service.status === "fulfilled" && isRecord(service.value)
      ? service.value
      : {};
  const llmRecord =
    llm.status === "fulfilled" && isRecord(llm.value) ? llm.value : {};
  return {
    service: serviceOnline ? "online" : "offline",
    llm:
      llm.status === "rejected"
        ? "offline"
        : llmOnline
          ? "online"
          : "unknown",
    serviceName:
      typeof serviceRecord.service === "string"
        ? serviceRecord.service
        : undefined,
    provider:
      typeof llmRecord.provider === "string"
        ? llmRecord.provider
        : typeof llmRecord.model === "string"
          ? llmRecord.model
          : undefined,
    message:
      service.status === "rejected" && service.reason instanceof Error
        ? service.reason.message
        : undefined,
  };
}

export async function mapSheet(
  profile: SheetProfile,
): Promise<MappingSuggestion> {
  return request<MappingSuggestion>(
    "/api/v1/llm/map-sheet",
    jsonRequest("POST", profile),
  );
}

export async function createImport(input: {
  files: File[];
  storeId: string;
  forecastDate?: string;
  forecastHorizon: number;
}): Promise<ImportCreateResponse> {
  const form = new FormData();
  input.files.forEach((file) => form.append("files", file));
  form.append("store_id", input.storeId);
  if (input.forecastDate) form.append("forecast_date", input.forecastDate);
  form.append("forecast_horizon", String(input.forecastHorizon));
  return request<ImportCreateResponse>("/api/v1/imports", {
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey() },
    body: form,
  });
}

export async function getImport(
  importId: string,
): Promise<ImportStatusResponse> {
  return request<ImportStatusResponse>(
    `/api/v1/imports/${encodeURIComponent(importId)}`,
  );
}

export async function confirmImport(
  importId: string,
  mappings: ConfirmImportMapping[],
): Promise<ImportStatusResponse> {
  return request<ImportStatusResponse>(
    `/api/v1/imports/${encodeURIComponent(importId)}/confirm`,
    jsonRequest("POST", { mappings }),
  );
}

export async function processImport(
  importId: string,
): Promise<ImportStatusResponse> {
  return request<ImportStatusResponse>(
    `/api/v1/imports/${encodeURIComponent(importId)}/process`,
    { method: "POST", headers: { accept: "application/json" } },
  );
}

export async function getImportResult(
  importId: string,
): Promise<IngestionResult> {
  return request<IngestionResult>(
    `/api/v1/imports/${encodeURIComponent(importId)}/result`,
  );
}

export async function getBootstrap(
  storeId: string,
): Promise<StoreBootstrapResponse> {
  return request<StoreBootstrapResponse>(`${storePath(storeId)}/bootstrap`);
}

export async function getDashboard(storeId: string): Promise<ApiRecord> {
  return request<ApiRecord>(`${storePath(storeId)}/dashboard`);
}

export async function getInventory(storeId: string): Promise<unknown> {
  return request<unknown>(`${storePath(storeId)}/inventory`);
}

export async function getProducts(storeId: string): Promise<unknown> {
  return request<unknown>(`${storePath(storeId)}/products`);
}

export async function getMenu(
  storeId: string,
  input: {
    status?: "active" | "inactive" | "all";
    itemType?: "single" | "combo" | "all";
    search?: string;
    page?: number;
    pageSize?: number;
  } = {},
): Promise<MenuListResponse> {
  const query = new URLSearchParams({
    status: input.status ?? "all",
    item_type: input.itemType ?? "all",
    page: String(input.page ?? 1),
    page_size: String(input.pageSize ?? 100),
  });
  if (input.search?.trim()) query.set("search", input.search.trim());
  return request<MenuListResponse>(
    `${storePath(storeId)}/menu?${query.toString()}`,
  );
}

export async function createMenuProduct(input: {
  storeId: string;
  payload: MenuItemDraft | ApiRecord;
}): Promise<ApiRecord> {
  return request<ApiRecord>(
    `${storePath(input.storeId)}/products`,
    jsonRequest("POST", input.payload, true),
  );
}

export async function updateMenuProduct(input: {
  storeId: string;
  productId: string;
  payload: ApiRecord;
}): Promise<ApiRecord> {
  return request<ApiRecord>(
    `${storePath(input.storeId)}/products/${encodeURIComponent(input.productId)}`,
    jsonRequest("PATCH", input.payload),
  );
}

export async function replaceMenuComponents(input: {
  storeId: string;
  productId: string;
  version: number;
  components: MenuComponentDraft[];
}): Promise<ApiRecord> {
  return request<ApiRecord>(
    `${storePath(input.storeId)}/products/${encodeURIComponent(input.productId)}/components`,
    jsonRequest(
      "PUT",
      {
        version: input.version,
        components: input.components.map((component) => ({
          component_product_id: component.componentProductId,
          quantity: component.quantity,
        })),
      },
      true,
    ),
  );
}

export async function getSupplierConstraints(
  storeId: string,
): Promise<unknown> {
  return request<unknown>(`${storePath(storeId)}/supplier-constraints`);
}

export async function saveRecipe(input: {
  storeId: string;
  productId: string;
  effectiveFrom: string;
  version: number;
  lines: Array<{
    ingredientId: string;
    quantity: number;
    unit: string;
  }>;
}): Promise<ApiRecord> {
  return request<ApiRecord>(
    `${storePath(input.storeId)}/products/${encodeURIComponent(input.productId)}/recipe`,
    jsonRequest("PUT", {
      effective_from: input.effectiveFrom,
      version: input.version,
      lines: input.lines.map((line) => ({
        ingredient_id: line.ingredientId,
        quantity: line.quantity,
        unit: line.unit,
      })),
    }),
  );
}

export async function saveSupplierConstraint(input: {
  storeId: string;
  constraintId?: string;
  payload: ApiRecord;
}): Promise<ApiRecord> {
  const path = input.constraintId
    ? `${storePath(input.storeId)}/supplier-constraints/${encodeURIComponent(input.constraintId)}`
    : `${storePath(input.storeId)}/supplier-constraints`;
  return request<ApiRecord>(
    path,
    jsonRequest(input.constraintId ? "PUT" : "POST", input.payload),
  );
}

export async function saveAliases(
  storeId: string,
  aliases: Array<{
    sourceName: string;
    canonicalName: string;
    ingredientId?: string;
  }>,
): Promise<ApiRecord> {
  return request<ApiRecord>(
    `${storePath(storeId)}/aliases`,
    jsonRequest("PUT", {
      aliases: aliases.map((alias) => ({
        source_name: alias.sourceName,
        canonical_name: alias.canonicalName,
        ...(alias.ingredientId
          ? { ingredient_id: alias.ingredientId }
          : {}),
      })),
    }),
  );
}

export async function saveSettings(
  storeId: string,
  settings: {
    monthlyBudget: number;
    forecastHorizon: number;
  },
): Promise<ApiRecord> {
  return request<ApiRecord>(
    `${storePath(storeId)}/settings`,
    jsonRequest("PUT", {
      monthly_budget: settings.monthlyBudget,
      forecast_horizon: settings.forecastHorizon,
    }),
  );
}

export async function saveCalendar(
  storeId: string,
  calendar: Array<{
    date: string;
    holiday: boolean;
    promotion: boolean;
    promotionNote: string;
  }>,
): Promise<ApiRecord> {
  return request<ApiRecord>(
    `${storePath(storeId)}/calendar-features`,
    jsonRequest("PUT", {
      items: calendar.map((day) => ({
        date: day.date,
        holiday: day.holiday,
        promotion: day.promotion,
        promotion_note: day.promotionNote,
      })),
    }),
  );
}

export async function createForecastRun(input: {
  storeId: string;
  cutoffDate: string;
  horizonDays: number;
  ingredientIds?: string[];
}): Promise<ForecastRunResponse> {
  return request<ForecastRunResponse>(
    `${storePath(input.storeId)}/forecast-runs`,
    jsonRequest(
      "POST",
      {
        cutoff_date: input.cutoffDate,
        horizon_days: input.horizonDays,
        quantiles: [0.25, 0.5, 0.75],
        scope: { ingredient_ids: input.ingredientIds ?? [] },
        use_latest_calendar: true,
      },
      true,
    ),
  );
}

export async function getForecastRun(
  storeId: string,
  forecastRunId: string,
): Promise<ForecastRunResponse> {
  return request<ForecastRunResponse>(
    `${storePath(storeId)}/forecast-runs/${encodeURIComponent(forecastRunId)}`,
  );
}

export async function getForecastResult(
  storeId: string,
  forecastRunId: string,
): Promise<ForecastRunResultResponse> {
  return request<ForecastRunResultResponse>(
    `${storePath(storeId)}/forecast-runs/${encodeURIComponent(forecastRunId)}/result`,
  );
}

export async function createPlanRun(input: {
  storeId: string;
  forecastRunId: string;
  strategy: ApiStrategy;
  budgetLimit: number;
  asOfDate: string;
}): Promise<PlanRunResponse> {
  return request<PlanRunResponse>(
    `${storePath(input.storeId)}/plan-runs`,
    jsonRequest(
      "POST",
      {
        forecast_run_id: input.forecastRunId,
        strategy: input.strategy,
        budget_limit: input.budgetLimit,
        as_of_date: input.asOfDate,
        include_open_purchase_orders: true,
      },
      true,
    ),
  );
}

export async function getPlanRun(
  storeId: string,
  planRunId: string,
): Promise<PlanRunResponse> {
  return request<PlanRunResponse>(
    `${storePath(storeId)}/plan-runs/${encodeURIComponent(planRunId)}`,
  );
}

export async function getPlanResult(
  storeId: string,
  planRunId: string,
): Promise<PlanRunResultResponse> {
  return request<PlanRunResultResponse>(
    `${storePath(storeId)}/plan-runs/${encodeURIComponent(planRunId)}/result`,
  );
}

function terminalFailure(status: string): boolean {
  return ["failed", "cancelled", "canceled", "error"].includes(
    status.toLowerCase(),
  );
}

async function delay(milliseconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitForRun<TStatus extends { status: string }, TResult>(
  getStatus: () => Promise<TStatus>,
  getResult: () => Promise<TResult>,
): Promise<TResult> {
  for (let attempt = 0; attempt < 90; attempt += 1) {
    const status = await getStatus();
    if (terminalFailure(status.status)) {
      throw new ShelfCashApiError(
        {
          code: "INVALID_STATE_TRANSITION",
          message: "Backend không thể hoàn tất tác vụ.",
          details: { status: status.status },
        },
        409,
      );
    }
    if (status.status.toLowerCase() === "completed") return getResult();
    await delay(1_000);
  }
  throw new ShelfCashApiError(
    {
      code: "JOB_TIMEOUT",
      message: "Backend xử lý lâu hơn dự kiến. Bạn có thể thử lại sau.",
      details: {},
    },
    408,
  );
}

export async function waitForForecastResult(
  storeId: string,
  forecastRunId: string,
): Promise<ForecastRunResultResponse> {
  return waitForRun(
    () => getForecastRun(storeId, forecastRunId),
    () => getForecastResult(storeId, forecastRunId),
  );
}

export async function waitForPlanResult(
  storeId: string,
  planRunId: string,
): Promise<PlanRunResultResponse> {
  return waitForRun(
    () => getPlanRun(storeId, planRunId),
    () => getPlanResult(storeId, planRunId),
  );
}

export async function createPurchaseOrders(input: {
  storeId: string;
  planRunId: string;
  lines: Array<{
    recommendationId: string;
    orderQuantityOverride: number;
  }>;
}): Promise<ApiRecord> {
  return request<ApiRecord>(
    `${storePath(input.storeId)}/purchase-orders`,
    jsonRequest(
      "POST",
      {
        plan_run_id: input.planRunId,
        lines: input.lines.map((line) => ({
          recommendation_id: line.recommendationId,
          order_quantity_override: line.orderQuantityOverride,
        })),
      },
      true,
    ),
  );
}

export async function getPurchaseOrders(
  storeId: string,
  page = 1,
  pageSize = 50,
): Promise<unknown> {
  const query = new URLSearchParams({
    page: String(page),
    page_size: String(pageSize),
  });
  return request<unknown>(
    `${storePath(storeId)}/purchase-orders?${query.toString()}`,
  );
}

export async function confirmPurchaseOrder(input: {
  storeId: string;
  poId: string;
  version: number;
  confirmedAt: string;
}): Promise<ApiRecord> {
  return request<ApiRecord>(
    `${storePath(input.storeId)}/purchase-orders/${encodeURIComponent(input.poId)}/confirm`,
    jsonRequest("POST", {
      version: input.version,
      confirmed_at: input.confirmedAt,
    }),
  );
}

export async function getHistory(
  storeId: string,
  resource: "sales-history" | "usage-history" | "purchase-history",
  input: {
    dateFrom: string;
    dateTo: string;
    page?: number;
    pageSize?: number;
  },
): Promise<unknown> {
  const query = new URLSearchParams({
    date_from: input.dateFrom,
    date_to: input.dateTo,
    page: String(input.page ?? 1),
    page_size: String(input.pageSize ?? 50),
  });
  return request<unknown>(
    `${storePath(storeId)}/${resource}?${query.toString()}`,
  );
}
