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
