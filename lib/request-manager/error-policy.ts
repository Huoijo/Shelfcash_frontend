import type { ApiError, ErrorPolicyAction } from "./types";
import { ShelfCashApiError } from "../shelfcash-client";

/**
 * Standardizes any caught error, Response object, or API error into a normalized ApiError
 */
export function parseApiError(error: unknown): ApiError {
  if (error instanceof ShelfCashApiError) {
    return {
      status: error.status,
      code: error.code || `HTTP_${error.status}`,
      message: error.message || "Đã xảy ra lỗi khi kết nối với máy chủ.",
      details: error.details,
      requestId: error.requestId || error.request_id || undefined,
    };
  }

  if (error && typeof error === "object") {
    const obj = error as Record<string, unknown>;

    // Case: Object returned from fetch envelope
    const status = typeof obj.status === "number" ? obj.status : 0;
    const code =
      typeof obj.code === "string"
        ? obj.code
        : status > 0
          ? `HTTP_${status}`
          : "UNKNOWN_ERROR";
    const message =
      typeof obj.message === "string"
        ? obj.message
        : "Đã xảy ra lỗi không xác định.";
    const details = obj.details;
    const requestId =
      typeof obj.requestId === "string"
        ? obj.requestId
        : typeof obj.request_id === "string"
          ? obj.request_id
          : undefined;

    return { status, code, message, details, requestId };
  }

  if (typeof error === "string") {
    return {
      status: 0,
      code: "UNKNOWN_ERROR",
      message: error,
    };
  }

  return {
    status: 0,
    code: "UNKNOWN_ERROR",
    message: "Đã xảy ra lỗi không xác định.",
  };
}

/**
 * Central Error Policy Registry
 * Determines whether the error is terminal (HALT), transiently retryable (RETRY_BOUNDED),
 * or requires bounded waiting/polling (WAIT_AND_POLL).
 */
export function resolveErrorPolicy(
  error: ApiError,
  context?: { method?: string; isPolling?: boolean },
): ErrorPolicyAction {
  const code = (error.code || "").toUpperCase();
  const status = error.status;

  // 1. Special 409 and 425 polling states (MUST BE BOUNDED)
  if (code === "IMPORT_NOT_READY" || status === 425) {
    return "WAIT_AND_POLL";
  }
  if (code === "IMPORT_PROCESSING") {
    return "WAIT_AND_POLL";
  }

  // 2. Transient upstream & service readiness errors (502, 503, 504)
  if (
    code === "LLM_PROVIDER_ERROR" ||
    code === "MODEL_NOT_READY" ||
    code === "DATABASE_NOT_READY" ||
    code === "LLM_UNAVAILABLE" ||
    status === 502 ||
    status === 503 ||
    status === 504
  ) {
    // Only retry transiently if it's not a configuration fault
    if (code === "BACKEND_NOT_CONFIGURED") {
      return "HALT";
    }
    return "RETRY_BOUNDED";
  }

  // 3. Network connection errors
  if (code === "NETWORK_ERROR" || status === 0) {
    // If we were doing a GET poll, retry bounded.
    if (context?.method?.toUpperCase() === "GET" || context?.isPolling) {
      return "RETRY_BOUNDED";
    }
    // If it was a POST/PUT/PATCH whose delivery is unknown, we HALT the auto-resubmit
    return "HALT";
  }

  // 4. HTTP 400 Bad Request family
  if (
    status === 400 ||
    [
      "INVALID_FILE_EXTENSION",
      "INVALID_CSV_FILE",
      "INVALID_EXCEL_FILE",
      "TOO_MANY_ROWS",
      "TOO_MANY_SHEETS",
      "TOO_MANY_FILES",
      "INVALID_INPUT",
    ].includes(code)
  ) {
    return "REQUIRE_USER_ACTION";
  }

  // 5. HTTP 401 Unauthorized
  if (status === 401 || code === "UNAUTHORIZED") {
    return "HALT";
  }

  // 6. HTTP 404 Resource Not Found family
  if (
    status === 404 ||
    [
      "STORE_NOT_FOUND",
      "RESOURCE_NOT_FOUND",
      "IMPORT_NOT_FOUND",
      "FORECAST_ARTIFACT_NOT_FOUND",
      "FORECAST_RUN_NOT_FOUND",
      "PLANNING_RUN_NOT_FOUND",
      "DECISION_RUN_NOT_FOUND",
      "RECIPE_NOT_FOUND",
      "ENDPOINT_NOT_ALLOWED",
    ].includes(code)
  ) {
    return "HALT";
  }

  // 7. HTTP 409 Conflict family
  if (
    status === 409 ||
    [
      "VERSION_CONFLICT",
      "DUPLICATE_REQUEST",
      "BUDGET_EXCEEDED",
      "INVALID_STATE_TRANSITION",
      "PURCHASE_RECEIPT_DUPLICATE",
      "DUPLICATE_SALES_DAILY_RECORD",
      "INVENTORY_LOT_METADATA_CONFLICT",
      "INVENTORY_SNAPSHOT_DUPLICATE_BATCH",
      "RECIPE_NOT_ALLOWED_FOR_COMBO",
      "DUPLICATE_PRODUCT_SKU",
      "DUPLICATE_PRODUCT_NAME",
      "PRODUCT_TYPE_IMMUTABLE",
      "PRODUCT_IN_ACTIVE_COMBO",
      "SKU_CONFLICT",
      "MISSING_SKU_FOR_DUPLICATE_NAME",
      "FORECAST_INFERENCE_FAILED",
      "FORECAST_RUN_NOT_COMPLETED",
      "INGREDIENT_DEMAND_INCOMPLETE",
      "DECISION_ENGINE_LEGACY",
      "PROCUREMENT_PLAN_INFEASIBLE",
      "PLANNING_PERSISTENCE_INCONSISTENCY",
    ].includes(code)
  ) {
    return "HALT";
  }

  // 8. HTTP 413 Payload Too Large
  if (
    status === 413 ||
    code === "FILE_TOO_LARGE" ||
    code === "REQUEST_TOO_LARGE"
  ) {
    return "REQUIRE_USER_ACTION";
  }

  // 9. HTTP 422 Unprocessable Entity / Validation Error family
  if (
    status === 422 ||
    [
      "VALIDATION_ERROR",
      "MAPPING_INCOMPLETE",
      "INSUFFICIENT_TRAINING_DATA",
      "FORMULA_VALUE_UNAVAILABLE",
      "INVENTORY_BATCH_ID_REQUIRED",
      "INVENTORY_SNAPSHOT_DUPLICATE_BATCH",
      "INVENTORY_SNAPSHOT_FUTURE_DATE",
      "INVENTORY_SNAPSHOT_OUT_OF_ORDER",
      "BUSINESS_CONSTRAINT_TYPE_UNSUPPORTED",
      "BUSINESS_CONSTRAINT_VALUE_INVALID",
      "BUSINESS_CONSTRAINT_UNIT_INVALID",
      "BUSINESS_CONSTRAINT_EFFECTIVE_DATE_INVALID",
      "INGREDIENT_NOT_FOUND",
      "CORE_FIELDS_MISSING",
      "COMBO_COMPONENT_PARSE_ERROR",
      "INVALID_PRODUCT_UNIT",
      "COMBO_SELF_REFERENCE",
      "COMBO_COMPONENT_DUPLICATE",
      "INVALID_PRICE",
      "COMBO_COMPONENTS_REQUIRED",
      "COMBO_NESTING_NOT_SUPPORTED",
      "INACTIVE_COMBO_COMPONENT",
      "INVALID_MENU_ITEM_TYPE",
      "INVALID_MENU_STATUS",
      "AMBIGUOUS_PRODUCT_VARIANT",
      "FORECAST_INPUT_INVALID",
      "BUSINESS_CONSTRAINT_AMBIGUOUS",
      "BUSINESS_CONSTRAINT_UNIT_CONVERSION_FAILED",
      "BUSINESS_CONSTRAINT_DIMENSION_MISMATCH",
      "BUSINESS_CONSTRAINT_CORRECTION_BLOCKED",
      "FORECAST_HORIZON_MISMATCH",
      "INGREDIENT_UNIT_CONVERSION_FAILED",
      "INVENTORY_LOT_UNIT_INVALID",
      "RECIPE_YIELD_INVALID",
      "RECIPE_LINE_INVALID",
      "RECIPE_NOT_EFFECTIVE",
      "OPTIMIZATION_INFEASIBLE",
      "WHAT_IF_EXECUTION_FAILED",
      "DECISION_RUN_INGREDIENT_NOT_FOUND",
      "SUPPLIER_TERM_INVALID",
    ].includes(code)
  ) {
    return "REQUIRE_USER_ACTION";
  }

  // 10. HTTP 500 Internal Error family
  if (
    status === 500 ||
    [
      "INTERNAL_ERROR",
      "FORECAST_ARTIFACT_INVALID",
      "FORECAST_FEATURE_TYPE_INVALID",
      "FORECAST_PREDICTIONS_MISSING",
    ].includes(code)
  ) {
    return "HALT";
  }

  // 11. Client Timeouts & Job Timeouts
  if (code === "JOB_TIMEOUT" || code === "REQUEST_TIMEOUT" || status === 408) {
    return "HALT";
  }

  // 12. Fallback for any other status:
  // 4xx -> HALT
  // 5xx -> HALT (no endless retry)
  return "HALT";
}
