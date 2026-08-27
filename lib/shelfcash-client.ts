import type {
  ApiRecord,
  BackendConnectionHealth,
  ConfirmImportMapping,
  ImportCreateResponse,
  ImportStatusResponse,
  IngestionResult,
  InventoryConstraint,
  MenuComponentDraft,
  MenuItemDraft,
  MenuListResponse,
  MappingSuggestion,
  PlanRunResponse,
  PlanRunResultResponse,
  DecisionBriefFacts,
  DecisionExplanation,
  DecisionExplanationResponse,
  ExplanationRequest,
  WhatIfRequest,
  WhatIfResponse,
  DecisionPackage,
  CreateDecisionRunRequest,
  SheetProfile,
  StoreBootstrapResponse,
} from "./types";
import {
  assertForecastHorizon,
  isTimezoneAwareDateTime,
  type ApiErrorBody,
  type CoreStrategy,
  type ForecastRunMetadata,
  type ForecastRunResult,
  type IngredientDemandRun,
  type LegacyStrategy,
  type ProcurementPlanRun,
  type PurchaseOrderCreateResponse,
  type PurchaseOrderRecord,
  type RecipeDetail,
  type RunStatus,
  type RunWaitOptions,
} from "./api-contract";
import { decisionRunLifecycle, shouldPollDecisionRun } from "./decision-run";

/** The browser talks to one same-origin BFF root; the BFF owns backend secrets. */
export const API_ROOT = "/api/shelfcash";

export interface ShelfCashRequestOptions extends RequestInit {
  requestId?: string;
  timeoutMs?: number;
}

export interface MutationOptions {
  idempotencyKey?: string;
  requestId?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export class ShelfCashApiError extends Error {
  code: string;
  details: ApiRecord;
  status: number;
  requestId: string | null;
  request_id: string | null;

  constructor(
    body: Omit<ApiErrorBody, "request_id"> & { request_id?: string | null },
    status: number,
  ) {
    super(body.message);
    this.name = "ShelfCashApiError";
    this.code = body.code;
    this.details = body.details;
    this.status = status;
    this.requestId = body.request_id ?? null;
    this.request_id = this.requestId;
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

function generatedUuid(prefix: string): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function createIdempotencyKey(): string {
  return generatedUuid("shelfcash-action");
}

export function createRequestId(): string {
  return generatedUuid("shelfcash-request");
}

function composedRequestSignal(
  externalSignal: AbortSignal | null | undefined,
  timeoutMs: number,
): {
  signal: AbortSignal;
  didTimeout: () => boolean;
  cleanup: () => void;
} {
  const controller = new AbortController();
  let timedOut = false;
  const abortFromExternal = () => controller.abort(externalSignal?.reason);
  if (externalSignal?.aborted) abortFromExternal();
  else externalSignal?.addEventListener("abort", abortFromExternal, { once: true });
  const timer =
    timeoutMs > 0
      ? setTimeout(() => {
          timedOut = true;
          controller.abort(new DOMException("Request timed out", "TimeoutError"));
        }, timeoutMs)
      : undefined;
  return {
    signal: controller.signal,
    didTimeout: () => timedOut,
    cleanup: () => {
      if (timer !== undefined) clearTimeout(timer);
      externalSignal?.removeEventListener("abort", abortFromExternal);
    },
  };
}

export async function requestShelfCash<T>(
  path: string,
  options: ShelfCashRequestOptions = {},
): Promise<T> {
  const { requestId: explicitRequestId, timeoutMs = 120_000, ...init } = options;
  const headers = new Headers(init.headers);
  const requestId =
    explicitRequestId || headers.get("X-Request-ID") || createRequestId();
  headers.set("X-Request-ID", requestId);
  const requestSignal = composedRequestSignal(init.signal, timeoutMs);
  try {
    const response = await fetch(`${API_ROOT}${path}`, {
      ...init,
      headers,
      signal: requestSignal.signal,
    });
    const payload = await parseResponse(response);
    if (!response.ok) {
      const record = isRecord(payload) ? payload : {};
      const responseRequestId =
        typeof record.request_id === "string"
          ? record.request_id
          : response.headers.get("X-Request-ID") || requestId;
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
          request_id: responseRequestId,
        },
        response.status,
      );
    }
    return payload as T;
  } catch (caught) {
    if (caught instanceof ShelfCashApiError) throw caught;
    if (requestSignal.didTimeout()) {
      throw new ShelfCashApiError(
        {
          code: "REQUEST_TIMEOUT",
          message: "ShelfCash backend xử lý lâu hơn thời gian chờ của yêu cầu.",
          details: { timeout_ms: timeoutMs },
          request_id: requestId,
        },
        408,
      );
    }
    if (init.signal?.aborted) {
      throw new ShelfCashApiError(
        {
          code: "REQUEST_ABORTED",
          message: "Yêu cầu đã bị hủy.",
          details: {},
          request_id: requestId,
        },
        499,
      );
    }
    throw new ShelfCashApiError(
      {
        code: "NETWORK_ERROR",
        message: "Không thể kết nối ShelfCash backend.",
        details: {
          reason: caught instanceof Error ? caught.message : "Unknown network error",
        },
        request_id: requestId,
      },
      0,
    );
  } finally {
    requestSignal.cleanup();
  }
}

function jsonRequest(
  method: "POST" | "PUT" | "PATCH",
  body: unknown,
  input: boolean | (MutationOptions & { idempotent?: boolean }) = false,
): ShelfCashRequestOptions {
  const options = typeof input === "boolean" ? { idempotent: input } : input;
  const headers = new Headers({
    accept: "application/json",
    "content-type": "application/json",
  });
  if (options.idempotent || options.idempotencyKey) {
    headers.set(
      "Idempotency-Key",
      options.idempotencyKey ?? createIdempotencyKey(),
    );
  }
  return {
    method,
    headers,
    body: JSON.stringify(body),
    requestId: options.requestId,
    signal: options.signal,
    timeoutMs: options.timeoutMs,
  };
}

const request = requestShelfCash;

function decisionPath(decisionRunId: string): string {
  return `/api/v1/decision-runs/${encodeURIComponent(decisionRunId)}`;
}

export async function createDecisionRun(input: {
  storeId: string;
  request: CreateDecisionRunRequest;
  signal?: AbortSignal;
}): Promise<DecisionPackage> {
  return request<DecisionPackage>(
    `${storePath(input.storeId)}/decision-runs`,
    jsonRequest("POST", input.request, {
      signal: input.signal,
      timeoutMs: 120_000,
    }),
  );
}

export async function getDecisionRun(
  decisionRunId: string,
  options: ShelfCashRequestOptions = {},
): Promise<DecisionPackage> {
  return request<DecisionPackage>(decisionPath(decisionRunId), options);
}

export async function getDecisionBrief(
  decisionRunId: string,
  options: ShelfCashRequestOptions = {},
): Promise<DecisionBriefFacts> {
  return request<DecisionBriefFacts>(`${decisionPath(decisionRunId)}/brief`, options);
}

export async function explainDecision(
  decisionRunId: string,
  explanation: ExplanationRequest,
  options: MutationOptions = {},
): Promise<DecisionExplanationResponse> {
  return request<DecisionExplanationResponse>(
    `${decisionPath(decisionRunId)}/explanation`,
    jsonRequest("POST", explanation, options),
  );
}

export async function getDecisionExplanation(
  decisionRunId: string,
): Promise<DecisionExplanation> {
  return request<DecisionExplanation>(
    `${decisionPath(decisionRunId)}/explanation`,
    jsonRequest("POST", { language: "vi", detail_level: "simple" }),
  );
}

export async function runDecisionWhatIf(
  decisionRunId: string,
  mutation: WhatIfRequest,
  options: MutationOptions = {},
): Promise<WhatIfResponse> {
  return request<WhatIfResponse>(
    `${decisionPath(decisionRunId)}/what-if`,
    jsonRequest("POST", mutation, options),
  );
}

/** @deprecated Use runDecisionWhatIf with an explicit WhatIfRequest. */
export async function getDecisionWhatIf(decisionRunId: string): Promise<WhatIfResponse> {
  return runDecisionWhatIf(decisionRunId, {});
}

export async function waitForDecisionRun(
  decisionRunId: string,
  initial?: DecisionPackage,
  options: RunWaitOptions = {},
): Promise<DecisionPackage> {
  let result = initial;
  const startedAt = Date.now();
  while (!result || shouldPollDecisionRun(result.status)) {
    if (Date.now() - startedAt > (options.timeoutMs ?? 90_000)) {
      throw new ShelfCashApiError({ code: "JOB_TIMEOUT", message: "Lập kế hoạch đang mất nhiều thời gian hơn dự kiến.", details: {}, request_id: null }, 408);
    }
    await delay(options.pollIntervalMs ?? 2_000, options.signal);
    result = await getDecisionRun(decisionRunId, {
      signal: options.signal,
      timeoutMs: options.requestTimeoutMs ?? 30_000,
    });
  }
  if (decisionRunLifecycle(result.status) === "unknown") {
    throw new ShelfCashApiError(
      {
        code: "UNEXPECTED_DECISION_STATUS",
        message: "Máy chủ trả trạng thái mô phỏng không xác định.",
        details: { status: result.status },
        request_id: result.request_id ?? null,
      },
      502,
    );
  }
  return result;
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
  idempotencyKey?: string;
  requestId?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
}): Promise<ImportCreateResponse> {
  const horizon = assertForecastHorizon(input.forecastHorizon);
  const form = new FormData();
  input.files.forEach((file) => form.append("files", file));
  form.append("store_id", input.storeId);
  if (input.forecastDate) form.append("forecast_date", input.forecastDate);
  form.append("forecast_horizon", String(horizon));
  return request<ImportCreateResponse>("/api/v1/imports", {
    method: "POST",
    headers: {
      "Idempotency-Key": input.idempotencyKey ?? createIdempotencyKey(),
    },
    body: form,
    requestId: input.requestId,
    signal: input.signal,
    timeoutMs: input.timeoutMs,
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
  options: MutationOptions = {},
): Promise<ImportStatusResponse> {
  return request<ImportStatusResponse>(
    `/api/v1/imports/${encodeURIComponent(importId)}/confirm`,
    jsonRequest("POST", { mappings }, options),
  );
}

export async function processImport(
  importId: string,
  options: MutationOptions = {},
): Promise<ImportStatusResponse> {
  return request<ImportStatusResponse>(
    `/api/v1/imports/${encodeURIComponent(importId)}/process`,
    {
      method: "POST",
      headers: {
        accept: "application/json",
        ...(options.idempotencyKey
          ? { "Idempotency-Key": options.idempotencyKey }
          : {}),
      },
      requestId: options.requestId,
      signal: options.signal,
      timeoutMs: options.timeoutMs,
    },
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

export async function createInventoryCount(input: {
  storeId: string;
  countedAt: string;
  lines: Array<{
    lotId: string;
    countedQuantity: number;
    unit: string;
    note?: string;
  }>;
  idempotencyKey?: string;
  requestId?: string;
  signal?: AbortSignal;
}): Promise<ApiRecord> {
  return request<ApiRecord>(
    `${storePath(input.storeId)}/inventory-counts`,
    jsonRequest(
      "POST",
      {
        counted_at: input.countedAt,
        lines: input.lines.map((line) => ({
          lot_id: line.lotId,
          counted_quantity: line.countedQuantity,
          unit: line.unit,
          ...(line.note?.trim() ? { note: line.note.trim() } : {}),
        })),
      },
      {
        idempotent: true,
        idempotencyKey: input.idempotencyKey,
        requestId: input.requestId,
        signal: input.signal,
      },
    ),
  );
}

export async function createInventoryAdjustment(input: {
  storeId: string;
  occurredAt: string;
  reference?: string;
  lines: Array<{
    lotId: string;
    expectedVersion: number;
    quantityDelta: number;
    unit: string;
    reason: string;
    note?: string;
  }>;
  idempotencyKey?: string;
  requestId?: string;
  signal?: AbortSignal;
}): Promise<ApiRecord> {
  return request<ApiRecord>(
    `${storePath(input.storeId)}/inventory-adjustments`,
    jsonRequest(
      "POST",
      {
        occurred_at: input.occurredAt,
        ...(input.reference?.trim()
          ? { reference: input.reference.trim() }
          : {}),
        lines: input.lines.map((line) => ({
          lot_id: line.lotId,
          expected_version: line.expectedVersion,
          quantity_delta: line.quantityDelta,
          unit: line.unit,
          reason: line.reason,
          ...(line.note?.trim() ? { note: line.note.trim() } : {}),
        })),
      },
      {
        idempotent: true,
        idempotencyKey: input.idempotencyKey,
        requestId: input.requestId,
        signal: input.signal,
      },
    ),
  );
}

export async function getInventoryMovements(input: {
  storeId: string;
  ingredientId?: string;
  lotId?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
  signal?: AbortSignal;
}): Promise<unknown> {
  const query = new URLSearchParams();
  if (input.ingredientId) query.set("ingredient_id", input.ingredientId);
  if (input.lotId) query.set("lot_id", input.lotId);
  if (input.dateFrom) query.set("date_from", input.dateFrom);
  if (input.dateTo) query.set("date_to", input.dateTo);
  if (input.page !== undefined) query.set("page", String(input.page));
  if (input.pageSize !== undefined) query.set("page_size", String(input.pageSize));
  return request<unknown>(
    `${storePath(input.storeId)}/inventory-movements${query.size ? `?${query.toString()}` : ""}`,
    { signal: input.signal },
  );
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
  idempotencyKey?: string;
  requestId?: string;
  signal?: AbortSignal;
}): Promise<ApiRecord> {
  return request<ApiRecord>(
    `${storePath(input.storeId)}/products`,
    jsonRequest("POST", input.payload, {
      idempotent: true,
      idempotencyKey: input.idempotencyKey,
      requestId: input.requestId,
      signal: input.signal,
    }),
  );
}

export async function updateMenuProduct(input: {
  storeId: string;
  productId: string;
  payload: ApiRecord;
  idempotencyKey?: string;
  requestId?: string;
  signal?: AbortSignal;
}): Promise<ApiRecord> {
  return request<ApiRecord>(
    `${storePath(input.storeId)}/products/${encodeURIComponent(input.productId)}`,
    jsonRequest("PATCH", input.payload, {
      idempotencyKey: input.idempotencyKey,
      requestId: input.requestId,
      signal: input.signal,
    }),
  );
}

export async function replaceMenuComponents(input: {
  storeId: string;
  productId: string;
  version: number;
  components: MenuComponentDraft[];
  idempotencyKey?: string;
  requestId?: string;
  signal?: AbortSignal;
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
      {
        idempotent: true,
        idempotencyKey: input.idempotencyKey,
        requestId: input.requestId,
        signal: input.signal,
      },
    ),
  );
}

export async function getSupplierConstraints(
  storeId: string,
): Promise<unknown> {
  return request<unknown>(`${storePath(storeId)}/supplier-constraints`);
}

export async function getInventoryConstraints(input: {
  storeId: string;
  ingredientId?: string | null;
  constraintType?: string | null;
  asOfDate?: string | null;
}): Promise<InventoryConstraint[]> {
  const query = new URLSearchParams();
  if (input.ingredientId?.trim()) query.set("ingredient_id", input.ingredientId.trim());
  if (input.constraintType?.trim()) query.set("constraint_type", input.constraintType.trim());
  if (input.asOfDate?.trim()) query.set("as_of_date", input.asOfDate.trim());
  const response = await request<unknown>(
    `${storePath(input.storeId)}/inventory-constraints${query.size ? `?${query}` : ""}`,
  );
  const source = Array.isArray(response)
    ? response
    : isRecord(response) && Array.isArray(response.items)
      ? response.items
      : isRecord(response) && Array.isArray(response.inventory_constraints)
        ? response.inventory_constraints
        : [];
  return source.filter(isRecord).map((row) => ({
    constraintId: String(row.constraint_id ?? ""),
    storeId: String(row.store_id ?? input.storeId),
    ingredientId: row.ingredient_id == null ? null : String(row.ingredient_id),
    ingredientName: row.ingredient_name == null ? null : String(row.ingredient_name),
    constraintType: String(row.constraint_type ?? ""),
    value: typeof row.value === "number" || typeof row.value === "string" ? row.value : "",
    unit: row.unit == null ? null : String(row.unit),
    effectiveDate: row.effective_date == null ? null : String(row.effective_date),
    endDate: row.end_date == null ? null : String(row.end_date),
    version: Number(row.version ?? 0),
    active: row.active !== false,
  }));
}

export async function saveRecipe(input: {
  storeId: string;
  productId: string;
  effectiveFrom: string;
  version: number;
  yieldQuantity?: number;
  processLossRate?: number;
  lines: Array<{
    ingredientId: string;
    quantity: number;
    unit: string;
  }>;
  idempotencyKey?: string;
  requestId?: string;
  signal?: AbortSignal;
}): Promise<ApiRecord> {
  return request<ApiRecord>(
    `${storePath(input.storeId)}/products/${encodeURIComponent(input.productId)}/recipe`,
    jsonRequest(
      "PUT",
      {
        effective_from: input.effectiveFrom,
        version: input.version,
        ...(input.yieldQuantity !== undefined
          ? { yield_quantity: input.yieldQuantity }
          : {}),
        ...(input.processLossRate !== undefined
          ? { process_loss_rate: input.processLossRate }
          : {}),
        lines: input.lines.map((line) => ({
          ingredient_id: line.ingredientId,
          quantity: line.quantity,
          unit: line.unit,
        })),
      },
      {
        idempotencyKey: input.idempotencyKey,
        requestId: input.requestId,
        signal: input.signal,
      },
    ),
  );
}

export async function getRecipe(input: {
  storeId: string;
  productId: string;
  onDate?: string;
  signal?: AbortSignal;
}): Promise<RecipeDetail> {
  const query = new URLSearchParams();
  if (input.onDate) query.set("on_date", input.onDate);
  return request<RecipeDetail>(
    `${storePath(input.storeId)}/products/${encodeURIComponent(input.productId)}/recipe${query.size ? `?${query.toString()}` : ""}`,
    { signal: input.signal },
  );
}

export async function getRecipeVersions(input: {
  storeId: string;
  productId: string;
  signal?: AbortSignal;
}): Promise<unknown> {
  return request<unknown>(
    `${storePath(input.storeId)}/products/${encodeURIComponent(input.productId)}/recipe-versions`,
    { signal: input.signal },
  );
}

export async function saveSupplierConstraint(input: {
  storeId: string;
  constraintId?: string;
  payload: ApiRecord;
  idempotencyKey?: string;
  requestId?: string;
  signal?: AbortSignal;
}): Promise<ApiRecord> {
  const source = input.payload;
  const payload: ApiRecord = {
    supplier_id: source.supplier_id,
    ingredient_id: source.ingredient_id,
    unit_cost: source.unit_cost,
    moq: source.moq,
    pack_size: source.pack_size,
    order_unit: source.order_unit,
    base_unit: source.base_unit,
    lead_time_days: source.lead_time_days,
    shelf_life_days: source.shelf_life_days,
    effective_date: source.effective_date,
  };
  if (source.version !== undefined) payload.version = source.version;
  for (const key of Object.keys(payload)) {
    if (payload[key] === undefined) delete payload[key];
  }
  const path = input.constraintId
    ? `${storePath(input.storeId)}/supplier-constraints/${encodeURIComponent(input.constraintId)}`
    : `${storePath(input.storeId)}/supplier-constraints`;
  return request<ApiRecord>(
    path,
    jsonRequest(input.constraintId ? "PUT" : "POST", payload, {
      idempotencyKey: input.idempotencyKey,
      requestId: input.requestId,
      signal: input.signal,
    }),
  );
}

export async function saveAliases(
  storeId: string,
  aliases: Array<{
    sourceName: string;
    canonicalName: string;
    ingredientId?: string;
  }>,
  options: MutationOptions = {},
): Promise<ApiRecord> {
  return request<ApiRecord>(
    `${storePath(storeId)}/aliases`,
    jsonRequest(
      "PUT",
      {
        aliases: aliases.map((alias) => ({
          source_name: alias.sourceName,
          canonical_name: alias.canonicalName,
          ...(alias.ingredientId
            ? { ingredient_id: alias.ingredientId }
            : {}),
        })),
      },
      options,
    ),
  );
}

export async function saveSettings(
  storeId: string,
  settings: {
    monthlyBudget: number;
    forecastHorizon: number;
    defaultStrategy?: LegacyStrategy;
    safetyPolicy?: string;
    version?: number;
  },
  options: MutationOptions = {},
): Promise<ApiRecord> {
  const horizon = assertForecastHorizon(settings.forecastHorizon);
  return request<ApiRecord>(
    `${storePath(storeId)}/settings`,
    jsonRequest(
      "PUT",
      {
        monthly_budget: settings.monthlyBudget,
        forecast_horizon: horizon,
        ...(settings.defaultStrategy
          ? { default_strategy: settings.defaultStrategy }
          : {}),
        ...(settings.safetyPolicy
          ? { safety_policy: settings.safetyPolicy }
          : {}),
        ...(settings.version !== undefined ? { version: settings.version } : {}),
      },
      options,
    ),
  );
}

export async function getSettings(
  storeId: string,
  signal?: AbortSignal,
): Promise<ApiRecord> {
  return request<ApiRecord>(`${storePath(storeId)}/settings`, { signal });
}

export async function saveCalendar(
  storeId: string,
  calendar: Array<{
    date: string;
    holiday: boolean;
    promotion: boolean;
    promotionNote: string;
  }>,
  options: MutationOptions = {},
): Promise<ApiRecord> {
  return request<ApiRecord>(
    `${storePath(storeId)}/calendar-features`,
    jsonRequest(
      "PUT",
      {
        items: calendar.map((day) => ({
          date: day.date,
          holiday: day.holiday,
          promotion: day.promotion,
          promotion_note: day.promotionNote,
        })),
      },
      options,
    ),
  );
}

export async function createForecastRun(input: {
  storeId: string;
  cutoffDate: string;
  horizonDays: number;
  productIds?: string[];
  ingredientIds?: string[];
  idempotencyKey?: string;
  requestId?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
}): Promise<ForecastRunMetadata> {
  const horizon = assertForecastHorizon(input.horizonDays);
  return request<ForecastRunMetadata>(
    `${storePath(input.storeId)}/forecast-runs`,
    jsonRequest(
      "POST",
      {
        cutoff_date: input.cutoffDate,
        horizon_days: horizon,
        quantiles: [0.25, 0.5, 0.75],
        scope: {
          product_ids: input.productIds ?? [],
          ingredient_ids: input.ingredientIds ?? [],
        },
        use_latest_calendar: true,
      },
      {
        idempotent: true,
        idempotencyKey: input.idempotencyKey,
        requestId: input.requestId,
        signal: input.signal,
        timeoutMs: input.timeoutMs,
      },
    ),
  );
}

export async function getForecastRun(
  storeId: string,
  forecastRunId: string,
  options: ShelfCashRequestOptions = {},
): Promise<ForecastRunMetadata> {
  return request<ForecastRunMetadata>(
    `${storePath(storeId)}/forecast-runs/${encodeURIComponent(forecastRunId)}`,
    options,
  );
}

export async function getForecastResult(
  storeId: string,
  forecastRunId: string,
  options: ShelfCashRequestOptions = {},
): Promise<ForecastRunResult> {
  return request<ForecastRunResult>(
    `${storePath(storeId)}/forecast-runs/${encodeURIComponent(forecastRunId)}/result`,
    options,
  );
}

export async function trainForecastModel(input: {
  storeId: string;
  cutoffDate: string;
  modelVersion?: string;
  historyDays?: number;
  idempotencyKey?: string;
  requestId?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
}): Promise<ApiRecord> {
  return request<ApiRecord>(
    "/api/v1/forecast-models/train",
    jsonRequest(
      "POST",
      {
        store_id: input.storeId,
        cutoff_date: input.cutoffDate,
        ...(input.modelVersion?.trim()
          ? { model_version: input.modelVersion.trim() }
          : {}),
        ...(input.historyDays !== undefined
          ? { history_days: input.historyDays }
          : {}),
      },
      {
        idempotent: true,
        idempotencyKey: input.idempotencyKey,
        requestId: input.requestId,
        signal: input.signal,
        timeoutMs: input.timeoutMs,
      },
    ),
  );
}

export async function createIngredientDemand(input: {
  storeId: string;
  forecastRunId: string;
  idempotencyKey?: string;
  requestId?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
}): Promise<IngredientDemandRun> {
  return request<IngredientDemandRun>(
    `${storePath(input.storeId)}/forecast-runs/${encodeURIComponent(input.forecastRunId)}/ingredient-demand`,
    jsonRequest("POST", {}, {
      idempotent: true,
      idempotencyKey: input.idempotencyKey,
      requestId: input.requestId,
      signal: input.signal,
      timeoutMs: input.timeoutMs,
    }),
  );
}

export async function getIngredientDemand(
  storeId: string,
  forecastRunId: string,
  options: ShelfCashRequestOptions = {},
): Promise<IngredientDemandRun> {
  return request<IngredientDemandRun>(
    `${storePath(storeId)}/forecast-runs/${encodeURIComponent(forecastRunId)}/ingredient-demand`,
    options,
  );
}

export async function createProcurementPlans(input: {
  storeId: string;
  forecastRunId: string;
  strategies?: CoreStrategy[];
  useOpenPurchaseOrders?: boolean;
  budgetOverride?: number;
  idempotencyKey?: string;
  requestId?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
}): Promise<ProcurementPlanRun> {
  const strategies = input.strategies ?? ["lean", "balanced", "protected"];
  if (
    strategies.length < 1 ||
    strategies.length > 3 ||
    new Set(strategies).size !== strategies.length ||
    strategies.some(
      (strategy) => !(["lean", "balanced", "protected"] as const).includes(strategy),
    )
  ) {
    throw new RangeError(
      "strategies must contain one to three unique lean/balanced/protected values.",
    );
  }
  return request<ProcurementPlanRun>(
    `${storePath(input.storeId)}/forecast-runs/${encodeURIComponent(input.forecastRunId)}/procurement-plans`,
    jsonRequest(
      "POST",
      {
        strategies,
        use_open_purchase_orders: input.useOpenPurchaseOrders ?? true,
        use_latest_inventory: true,
        ...(input.budgetOverride !== undefined
          ? { budget_override: input.budgetOverride }
          : {}),
      },
      {
        idempotent: true,
        idempotencyKey: input.idempotencyKey,
        requestId: input.requestId,
        signal: input.signal,
        timeoutMs: input.timeoutMs,
      },
    ),
  );
}

export async function getProcurementPlans(input: {
  storeId: string;
  forecastRunId: string;
  procurementPlanRunId?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
}): Promise<ProcurementPlanRun> {
  const query = new URLSearchParams();
  if (input.procurementPlanRunId) {
    query.set("procurement_plan_run_id", input.procurementPlanRunId);
  }
  return request<ProcurementPlanRun>(
    `${storePath(input.storeId)}/forecast-runs/${encodeURIComponent(input.forecastRunId)}/procurement-plans${query.size ? `?${query.toString()}` : ""}`,
    { signal: input.signal, timeoutMs: input.timeoutMs },
  );
}

export async function createPlanRun(input: {
  storeId: string;
  forecastRunId: string;
  strategy: LegacyStrategy;
  budgetLimit: number;
  asOfDate: string;
  includeOpenPurchaseOrders?: boolean;
  idempotencyKey?: string;
  requestId?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
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
        include_open_purchase_orders: input.includeOpenPurchaseOrders ?? true,
      },
      {
        idempotent: true,
        idempotencyKey: input.idempotencyKey,
        requestId: input.requestId,
        signal: input.signal,
        timeoutMs: input.timeoutMs,
      },
    ),
  );
}

export async function getPlanRun(
  storeId: string,
  planRunId: string,
  options: ShelfCashRequestOptions = {},
): Promise<PlanRunResponse> {
  return request<PlanRunResponse>(
    `${storePath(storeId)}/plan-runs/${encodeURIComponent(planRunId)}`,
    options,
  );
}

export async function getPlanResult(
  storeId: string,
  planRunId: string,
  options: ShelfCashRequestOptions = {},
): Promise<PlanRunResultResponse> {
  return request<PlanRunResultResponse>(
    `${storePath(storeId)}/plan-runs/${encodeURIComponent(planRunId)}/result`,
    options,
  );
}

function exactRunStatus(value: unknown): RunStatus {
  const status = String(value ?? "").toLowerCase();
  if (["running", "completed", "blocked", "failed"].includes(status)) {
    return status as RunStatus;
  }
  throw new ShelfCashApiError(
    {
      code: "UNEXPECTED_RUN_STATUS",
      message: "Backend trả trạng thái tác vụ không thuộc contract.",
      details: { status: value },
      request_id: null,
    },
    502,
  );
}

async function delay(
  milliseconds: number,
  signal?: AbortSignal,
): Promise<void> {
  if (signal?.aborted) {
    throw new ShelfCashApiError(
      {
        code: "REQUEST_ABORTED",
        message: "Yêu cầu đã bị hủy.",
        details: {},
        request_id: null,
      },
      499,
    );
  }
  await new Promise<void>((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      reject(
        new ShelfCashApiError(
          {
            code: "REQUEST_ABORTED",
            message: "Yêu cầu đã bị hủy.",
            details: {},
            request_id: null,
          },
          499,
        ),
      );
    };
    const finish = () => {
      signal?.removeEventListener("abort", abort);
      resolve();
    };
    const timer = setTimeout(finish, milliseconds);
    signal?.addEventListener("abort", abort, { once: true });
  });
}

async function waitForRun<
  TStatus extends {
    status: string;
    failure_code?: string | null;
    failure_message?: string | null;
  },
  TResult,
>(
  getStatus: (options: ShelfCashRequestOptions) => Promise<TStatus>,
  getResult: (options: ShelfCashRequestOptions) => Promise<TResult>,
  options: RunWaitOptions = {},
): Promise<TResult> {
  const timeoutMs = options.timeoutMs ?? 90_000;
  const startedAt = Date.now();
  while (Date.now() - startedAt <= timeoutMs) {
    const status = await getStatus({
      signal: options.signal,
      timeoutMs: options.requestTimeoutMs,
    });
    const exactStatus = exactRunStatus(status.status);
    if (exactStatus === "completed") {
      return getResult({
        signal: options.signal,
        timeoutMs: options.requestTimeoutMs,
      });
    }
    if (exactStatus === "blocked" || exactStatus === "failed") {
      const code =
        status.failure_code ||
        (exactStatus === "blocked" ? "RUN_BLOCKED" : "RUN_FAILED");
      throw new ShelfCashApiError(
        {
          code,
          message:
            status.failure_message ||
            (exactStatus === "blocked"
              ? "Tác vụ bị chặn và sẽ không được tiếp tục tự động."
              : "Backend không thể hoàn tất tác vụ."),
          details: { status: exactStatus },
          request_id: null,
        },
        code === "MODEL_NOT_READY" ? 503 : 409,
      );
    }
    await delay(options.pollIntervalMs ?? 1_000, options.signal);
  }
  throw new ShelfCashApiError(
    {
      code: "JOB_TIMEOUT",
      message: "Backend xử lý lâu hơn dự kiến. Bạn có thể thử lại sau.",
      details: { timeout_ms: timeoutMs },
      request_id: null,
    },
    408,
  );
}

export async function waitForForecastResult(
  storeId: string,
  forecastRunId: string,
  options: RunWaitOptions = {},
): Promise<ForecastRunResult> {
  return waitForRun(
    (requestOptions) =>
      getForecastRun(storeId, forecastRunId, requestOptions),
    (requestOptions) =>
      getForecastResult(storeId, forecastRunId, requestOptions),
    options,
  );
}

export async function waitForIngredientDemand(
  storeId: string,
  forecastRunId: string,
  options: RunWaitOptions = {},
): Promise<IngredientDemandRun> {
  return waitForRun(
    (requestOptions) =>
      getIngredientDemand(storeId, forecastRunId, requestOptions),
    (requestOptions) =>
      getIngredientDemand(storeId, forecastRunId, requestOptions),
    options,
  );
}

export async function waitForProcurementPlans(input: {
  storeId: string;
  forecastRunId: string;
  procurementPlanRunId: string;
  options?: RunWaitOptions;
}): Promise<ProcurementPlanRun> {
  return waitForRun(
    (requestOptions) =>
      getProcurementPlans({
        storeId: input.storeId,
        forecastRunId: input.forecastRunId,
        procurementPlanRunId: input.procurementPlanRunId,
        signal: requestOptions.signal ?? undefined,
        timeoutMs:
          typeof requestOptions.timeoutMs === "number"
            ? requestOptions.timeoutMs
            : undefined,
      }),
    (requestOptions) =>
      getProcurementPlans({
        storeId: input.storeId,
        forecastRunId: input.forecastRunId,
        procurementPlanRunId: input.procurementPlanRunId,
        signal: requestOptions.signal ?? undefined,
        timeoutMs:
          typeof requestOptions.timeoutMs === "number"
            ? requestOptions.timeoutMs
            : undefined,
      }),
    input.options,
  );
}

export async function waitForPlanResult(
  storeId: string,
  planRunId: string,
  options: RunWaitOptions = {},
): Promise<PlanRunResultResponse> {
  return waitForRun(
    (requestOptions) => getPlanRun(storeId, planRunId, requestOptions),
    (requestOptions) => getPlanResult(storeId, planRunId, requestOptions),
    options,
  );
}

export async function createPurchaseOrders(input: {
  storeId: string;
  planRunId: string;
  lines: Array<{
    recommendationId: string;
    orderQuantityOverride: number;
  }>;
  idempotencyKey?: string;
  requestId?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
}): Promise<PurchaseOrderCreateResponse> {
  return request<PurchaseOrderCreateResponse>(
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
      {
        idempotent: true,
        idempotencyKey: input.idempotencyKey,
        requestId: input.requestId,
        signal: input.signal,
        timeoutMs: input.timeoutMs,
      },
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

export async function getPurchaseOrder(input: {
  storeId: string;
  poId: string;
  signal?: AbortSignal;
}): Promise<PurchaseOrderRecord> {
  return request<PurchaseOrderRecord>(
    `${storePath(input.storeId)}/purchase-orders/${encodeURIComponent(input.poId)}`,
    { signal: input.signal },
  );
}

export async function updatePurchaseOrder(input: {
  storeId: string;
  poId: string;
  version: number;
  lineUpdates: Array<{
    poLineId: string;
    orderQuantity: number;
  }>;
  idempotencyKey?: string;
  requestId?: string;
  signal?: AbortSignal;
}): Promise<PurchaseOrderRecord> {
  return request<PurchaseOrderRecord>(
    `${storePath(input.storeId)}/purchase-orders/${encodeURIComponent(input.poId)}`,
    jsonRequest(
      "PATCH",
      {
        version: input.version,
        line_updates: input.lineUpdates.map((line) => ({
          po_line_id: line.poLineId,
          order_quantity: line.orderQuantity,
        })),
      },
      {
        idempotencyKey: input.idempotencyKey,
        requestId: input.requestId,
        signal: input.signal,
      },
    ),
  );
}

export async function confirmPurchaseOrder(input: {
  storeId: string;
  poId: string;
  version: number;
  confirmedAt: string;
  idempotencyKey?: string;
  requestId?: string;
  signal?: AbortSignal;
}): Promise<PurchaseOrderRecord> {
  if (!isTimezoneAwareDateTime(input.confirmedAt)) {
    throw new RangeError("confirmedAt must include a timezone offset.");
  }
  return request<PurchaseOrderRecord>(
    `${storePath(input.storeId)}/purchase-orders/${encodeURIComponent(input.poId)}/confirm`,
    jsonRequest(
      "POST",
      {
        version: input.version,
        confirmed_at: input.confirmedAt,
      },
      {
        idempotent: true,
        idempotencyKey: input.idempotencyKey,
        requestId: input.requestId,
        signal: input.signal,
      },
    ),
  );
}

export async function receivePurchaseOrder(input: {
  storeId: string;
  poId: string;
  version: number;
  receivedAt: string;
  deliveryReference?: string;
  lines: Array<{
    poLineId: string;
    lots: Array<{
      quantity: number;
      expiryDate?: string;
      supplierLotCode?: string;
    }>;
  }>;
  idempotencyKey: string;
  requestId?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
}): Promise<PurchaseOrderRecord> {
  if (!isTimezoneAwareDateTime(input.receivedAt)) {
    throw new RangeError("receivedAt must include a timezone offset.");
  }
  if (!input.idempotencyKey.trim()) {
    throw new RangeError("Receive requires a stable Idempotency-Key.");
  }
  return request<PurchaseOrderRecord>(
    `${storePath(input.storeId)}/purchase-orders/${encodeURIComponent(input.poId)}/receive`,
    jsonRequest(
      "POST",
      {
        version: input.version,
        received_at: input.receivedAt,
        ...(input.deliveryReference?.trim()
          ? { delivery_reference: input.deliveryReference.trim() }
          : {}),
        lines: input.lines.map((line) => ({
          po_line_id: line.poLineId,
          lots: line.lots.map((lot) => ({
            quantity: lot.quantity,
            ...(lot.expiryDate ? { expiry_date: lot.expiryDate } : {}),
            ...(lot.supplierLotCode?.trim()
              ? { supplier_lot_code: lot.supplierLotCode.trim() }
              : {}),
          })),
        })),
      },
      {
        idempotent: true,
        idempotencyKey: input.idempotencyKey,
        requestId: input.requestId,
        signal: input.signal,
        timeoutMs: input.timeoutMs,
      },
    ),
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
