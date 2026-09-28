import type {
  ApiError,
  ExplanationChatMessage,
  ExplanationRequest,
} from "./types";
import type { ExplanationTransportResult } from "./shelfcash-client";

export const DEFAULT_SUGGESTED_PROMPTS = [
  "Tại sao chọn kế hoạch này?",
  "Tại sao chọn Balanced?",
  "Rủi ro chính của kế hoạch này là gì?",
  "Tại sao cần nhập nguyên liệu này?",
];

export const EXPLANATION_RISK_LABELS: Record<string, string> = {
  // Dung tích & sức chứa
  CAPACITY_NOT_EVALUATED: "Chưa đủ dữ liệu để đánh giá giới hạn sức chứa kho.",
  STORAGE_CAPACITY_EXCEEDED: "Khối lượng hàng vượt quá sức chứa cho phép của kho.",
  SHELF_CAPACITY_PRESSURE: "Áp lực sức chứa kệ hàng tại cửa hàng.",

  // Căng thẳng & thiếu hàng
  STRESS_SHORTAGE_OBSERVED: "Ghi nhận nguy cơ thiếu hàng trong kịch bản nhu cầu tăng cao đột biến (stress test).",
  SHORTAGE_OBSERVED: "Dự kiến có tình trạng thiếu hàng trong kỳ kế hoạch.",
  STOCKOUT_RISK_DETECTED: "Phát hiện nguy cơ cạn kho đối với một số nguyên liệu.",
  HIGH_STOCKOUT_PROBABILITY: "Xác suất cạn kho ở mức đáng lưu ý.",
  LEAN_HIGHER_STOCKOUT_RISK: "Chiến lược Tiết kiệm có rủi ro thiếu hàng cao hơn nếu nhu cầu tăng bất thường.",

  // Kịch bản & mô phỏng
  UNWEIGHTED_DESIGN_SCENARIOS_USE_EQUAL_CANDIDATE_WEIGHTS: "Các kịch bản đánh giá rủi ro hiện đang được tính với tỷ trọng đồng đều.",
  SCENARIO_HISTORY_INSUFFICIENT: "Chưa đủ dữ liệu lịch sử để mô phỏng toàn diện các kịch bản bất thường.",
  RISK_METRIC_NOT_AVAILABLE: "Một số chỉ số rủi ro chi tiết chưa đủ dữ liệu để tính toán.",
  MONTE_CARLO_DISABLED: "Mô phỏng ngẫu nhiên Monte Carlo hiện đang tắt, sử dụng mô hình định lượng chuẩn.",
  SHORTAGE_COST_FALLBACK_USED: "Chi phí thiếu hàng đang dùng mức ước tính định mức thay thế.",

  // Tồn kho & hạn sử dụng
  AGGREGATE_MODEL_COUNTS_UNKNOWN_EXPIRY_LOT: "Một phần tồn kho chưa xác định được hạn sử dụng hoặc thông tin lô cụ thể.",
  AGGREGATE_MODEL_EXCLUDED_PRESTART_EXPIRED_LOT: "Đã loại trừ lượng tồn kho hết hạn trước chu kỳ tính toán.",
  EXPIRING_INVENTORY: "Một phần tồn kho hiện tại sắp đến hạn sử dụng.",
  SHELF_LIFE_PRESSURE: "Hạn sử dụng ngắn tạo áp lực cần tiêu thụ nhanh.",
  EXCESS_INVENTORY_RISK: "Nguy cơ tồn kho dư thừa vượt mức nhu cầu thực tế.",

  // Cung ứng & ràng buộc vận hành
  DEMAND_EXCEEDS_AVAILABLE_SUPPLY: "Nhu cầu dự báo vượt quá lượng hàng khả dụng hiện tại.",
  LEAD_TIME_PRESSURE: "Cần lưu ý thời gian giao hàng để tránh thiếu hụt trong lúc chờ hàng về.",
  SUPPLIER_LEAD_TIME_UNCERTAINTY: "Thời gian giao hàng của nhà cung cấp có thể biến động.",
  PACK_SIZE_ROUNDING: "Số lượng đặt mua được làm tròn theo quy cách đóng gói.",
  MOQ_CONSTRAINT: "Số lượng đặt mua bị ràng buộc bởi ngưỡng tối thiểu (MOQ) của nhà cung cấp.",
  MOQ_ROUNDING: "Đã điều chỉnh lượng mua theo số lượng đặt hàng tối thiểu của nhà cung cấp.",
  HARD_BUDGET_CAP: "Ngân sách mua hàng đã chạm mức giới hạn trần.",
  BUDGET_LIMIT_REACHED: "Kế hoạch đã tận dụng tối đa hạn mức ngân sách được phân bổ.",
  SERVICE_LEVEL_FLOOR: "Tỷ lệ đáp ứng đơn hàng đang ở mức sàn tối thiểu cho phép.",
};

export function humanizeRiskItem(item: string): string {
  if (!item || typeof item !== "string") return "";
  const trimmed = item.trim();
  if (!trimmed) return "";

  // 1. Direct dictionary match
  if (EXPLANATION_RISK_LABELS[trimmed]) {
    return EXPLANATION_RISK_LABELS[trimmed];
  }

  // 2. Case-insensitive dictionary match
  const upperKey = trimmed.toUpperCase();
  if (EXPLANATION_RISK_LABELS[upperKey]) {
    return EXPLANATION_RISK_LABELS[upperKey];
  }

  // 3. If it is already a natural sentence (contains lowercase, spaces, punctuation), preserve it
  const isScreamingSnake = /^[A-Z0-9_]{3,}$/.test(trimmed);
  if (!isScreamingSnake) {
    return trimmed;
  }

  // 4. Fallback for unknown enum codes: humanize snake_case cleanly
  return trimmed
    .toLowerCase()
    .split("_")
    .filter(Boolean)
    .join(" ")
    .replace(/^./, (c) => c.toUpperCase());
}

export function createExplanationRequest(params: {
  question?: string | null;
  ingredientId?: string | null;
  detailLevel?: "simple" | "manager" | "technical";
  language?: "vi" | "en";
}): ExplanationRequest {
  const text = params.question?.trim() || null;
  return {
    language: params.language ?? "vi",
    detail_level: params.detailLevel ?? "simple",
    question: text,
    ingredient_id: params.ingredientId ?? null,
  };
}

export function mapExplanation422(
  error: ApiError,
  originalRequest: ExplanationRequest,
): ExplanationChatMessage {
  const requestId = error.request_id || "";
  const id = `guidance-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  // Branch ONLY on error.code, NEVER on error.message
  switch (error.code) {
    case "EXPLANATION_QUERY_UNSUPPORTED":
      return {
        id,
        kind: "guidance",
        reason: "unsupported",
        text: "Mình chỉ có thể giải thích kế hoạch, chiến lược, rủi ro hoặc nguyên liệu trong Decision Run này. Bạn có thể hỏi, ví dụ: “Tại sao chọn Balanced?” hoặc “Tại sao cần nhập [nguyên liệu]?”",
        suggestedPrompts: [
          "Tại sao chọn Balanced?",
          "Rủi ro chính của kế hoạch này là gì?",
          "Tại sao cần nhập nguyên liệu này?",
        ],
        requestId,
        timestamp: Date.now(),
      };

    case "INGREDIENT_RESOLUTION_NOT_FOUND":
      return {
        id,
        kind: "guidance",
        reason: "ingredient_not_found",
        text: "Mình chưa xác định được nguyên liệu này trong Decision Run hiện tại. Hãy chọn một nguyên liệu trong kế hoạch hoặc hỏi về kế hoạch chung.",
        suggestedPrompts: [
          "Xem nguyên liệu trong kế hoạch",
          "Hỏi về kế hoạch chung",
        ],
        requestId,
        timestamp: Date.now(),
      };

    case "INGREDIENT_RESOLUTION_AMBIGUOUS": {
      // Candidates read ONLY from error.details.candidates
      const rawCandidates = Array.isArray(error.details?.candidates)
        ? error.details.candidates
        : [];
      const candidates = rawCandidates
        .filter(
          (c: unknown): c is { ingredient_id: unknown; ingredient_name?: unknown } =>
            Boolean(c && typeof c === "object" && "ingredient_id" in (c as Record<string, unknown>)),
        )
        .map((c) => ({
          ingredient_id: String(c.ingredient_id),
          ingredient_name: String(c.ingredient_name || c.ingredient_id),
        }));

      return {
        id,
        kind: "guidance",
        reason: "ingredient_ambiguous",
        text: "Có nhiều nguyên liệu có thể khớp với câu hỏi. Bạn muốn hỏi nguyên liệu nào?",
        candidates,
        retry: {
          question: originalRequest.question ?? "",
        },
        requestId,
        timestamp: Date.now(),
      };
    }

    case "INGREDIENT_QUESTION_MISMATCH":
      return {
        id,
        kind: "guidance",
        reason: "ingredient_mismatch",
        text: "Nguyên liệu bạn chọn khác với nguyên liệu được nêu trong câu hỏi. Hãy chọn đúng nguyên liệu hoặc sửa lại câu hỏi.",
        suggestedPrompts: [
          "Giữ nguyên nguyên liệu đã chọn",
          "Đổi nguyên liệu",
        ],
        requestId,
        timestamp: Date.now(),
      };

    case "DECISION_RUN_INGREDIENT_NOT_FOUND":
      return {
        id,
        kind: "guidance",
        reason: "ingredient_unavailable",
        text: "Nguyên liệu này không còn có dữ liệu trong Decision Run đang xem.",
        suggestedPrompts: ["Hỏi về kế hoạch chung"],
        requestId,
        timestamp: Date.now(),
      };

    default:
      // Request validation or unrecognized 422
      return {
        id,
        kind: "guidance",
        reason: "invalid_request",
        text: "Câu hỏi chưa đúng định dạng. Hãy thử lại với một câu ngắn hơn.",
        requestId,
        timestamp: Date.now(),
      };
  }
}

export function mapTransportResultToMessage(
  result: ExplanationTransportResult,
  originalRequest: ExplanationRequest,
): ExplanationChatMessage {
  const id = `assistant-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  if (result.status === 200) {
    return {
      id,
      kind: "answer",
      text: result.body.answer,
      response: result.body,
      showEvidence: false,
      timestamp: Date.now(),
    };
  }

  if (result.status === 422) {
    return mapExplanation422(result.body, originalRequest);
  }

  if (result.status === 404) {
    return {
      id,
      kind: "stale_resource",
      text: "Decision Run này không còn tồn tại hoặc đã hết hạn.",
      timestamp: Date.now(),
    };
  }

  // 503 or network failure
  return {
    id,
    kind: "recoverable_error",
    text: "Chưa thể lấy lời giải thích lúc này. Thử lại.",
    request: originalRequest,
    status: typeof result.status === "number" ? result.status : undefined,
    timestamp: Date.now(),
  };
}
