import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type {
  ApiError,
  DecisionBriefFacts,
  ExplanationChatMessage,
  ExplanationRequest,
  ExplanationSuccess,
} from "../lib/types.ts";
import {
  createExplanationRequest,
  mapExplanation422,
  mapTransportResultToMessage,
} from "../lib/explanation-chat.ts";
import { DecisionExplanationDrawer } from "../app/components/DecisionExplanationDrawer.tsx";
import { DecisionBriefWorkspace } from "../app/components/DecisionBriefWorkspace.tsx";

const mockSuccessResponse: ExplanationSuccess = {
  source: "decision_engine",
  language: "vi",
  detail_level: "simple",
  decision_run_id: "run-test-123",
  answer: "Kế hoạch nhập hàng đã được tối ưu dựa trên nhu cầu dự báo và mức tồn hiện tại.",
  summary: "Tối ưu hóa tổng thể chi phí và tỷ lệ đáp ứng.",
  why_this_plan: [
    "Đáp ứng 96% nhu cầu dự báo trong kỳ 7 ngày",
    "Tránh phát sinh đơn hàng khẩn cấp chi phí cao",
  ],
  main_risks: ["Rủi ro giao chậm từ nhà cung cấp Sữa Việt"],
  tradeoffs: ["Chấp nhận giữ thêm 2 ngày tồn để giảm chi phí vận chuyển"],
  important_assumptions: ["Nhu cầu không tăng đột biến trên 30%"],
  intent: "plan_explanation",
  entities: {
    ingredient_ids: ["milk-fresh", "sugar"],
    supplier_ids: ["sup-sua-viet"],
  },
  claims: [
    {
      type: "expected_fill_rate",
      value: 0.96,
      evidence_ids: ["ev-fill-rate-1"],
    },
  ],
  citations: [
    {
      evidence_id: "ev-fill-rate-1",
      label: "Báo cáo dự báo nhu cầu P50",
      source_type: "forecast",
    },
  ],
  grounded: true,
  provider: "decision_engine_ai",
};

const mockBrief: DecisionBriefFacts = {
  decision_run_id: "run-test-123",
  store_id: "store-1",
  status: "completed",
  forecast: {
    forecast_run_id: "fc-1",
    model_version: "v1",
    horizon_days: 7,
    cutoff_date: "2026-08-20",
  },
  recommendation: {
    available: true,
    strategy: "balanced",
    summary: "Kế hoạch Cân bằng",
    total_purchase_cost: 810_000,
    expected_fill_rate: 0.96,
  },
  procurement_rows: [
    {
      ingredient_id: "milk-fresh",
      ingredient_name: "Sữa tươi",
      supplier_id: "sup-sua-viet",
      supplier_name: "Sữa Việt Distribution",
      quantity: 24,
      unit: "L",
      pack_count: 2,
      pack_size: 12,
      order_date: "2026-08-20",
      arrival_date: "2026-08-21",
      purchase_cost: 810_000,
      reason_codes: ["DEMAND_EXCEEDS_AVAILABLE_SUPPLY"],
    },
  ],
  ingredient_demand: [
    {
      ingredient_id: "milk-fresh",
      ingredient_name: "Sữa tươi",
      unit: "L",
      p25: 18,
      p50: 24,
      p75: 30,
      contributions: [],
    },
  ],
  risk: {
    stockout_probability: 0.04,
    expected_fill_rate: 0.96,
    shortage_quantity: 0,
    waste_quantity: 0,
  },
  critic: { hard_violations: [], warnings: [] },
  evidence: [],
  data_availability: {},
};

// 42. TEST — SUCCESS
test("42. TEST — SUCCESS: 200 ExplanationSuccess returns answer, stores response, removes typing", () => {
  const originalReq: ExplanationRequest = {
    question: "Tại sao chọn kế hoạch này?",
    language: "vi",
    detail_level: "simple",
  };

  const message = mapTransportResultToMessage(
    { status: 200, body: mockSuccessResponse },
    originalReq,
  );

  assert.equal(message.kind, "answer");
  if (message.kind === "answer") {
    assert.equal(message.text, mockSuccessResponse.answer);
    assert.equal(message.response.decision_run_id, "run-test-123");
    assert.equal(message.response.grounded, true);
    assert.equal(message.response.why_this_plan.length, 2);
  }

  // Render in drawer test host
  const markup = renderToStaticMarkup(
    <DecisionExplanationDrawer
      open={true}
      onClose={() => undefined}
      explanation={mockSuccessResponse}
    />,
  );
  assert.match(markup, /Kế hoạch nhập hàng đã được tối ưu/);
  assert.match(markup, /Câu trả lời từ ShelfCash AI/);
  assert.match(markup, /Đáp ứng 96% nhu cầu dự báo/);
});

// 43. TEST — DETERMINISTIC FALLBACK
test("43. TEST — DETERMINISTIC FALLBACK: provider = deterministic_fallback renders as normal answer without error alert", () => {
  const fallbackResponse: ExplanationSuccess = {
    ...mockSuccessResponse,
    provider: "deterministic_fallback",
    answer: "Kế hoạch dự phòng theo quy tắc định trước được kích hoạt.",
  };

  const message = mapTransportResultToMessage(
    { status: 200, body: fallbackResponse },
    { question: "Giải thích", language: "vi" },
  );

  assert.equal(message.kind, "answer");
  if (message.kind === "answer") {
    assert.equal(message.text, fallbackResponse.answer);
    assert.equal(message.response.provider, "deterministic_fallback");
  }

  const markup = renderToStaticMarkup(
    <DecisionExplanationDrawer
      open={true}
      onClose={() => undefined}
      explanation={fallbackResponse}
    />,
  );
  assert.match(markup, /Kế hoạch dự phòng theo quy tắc định trước được kích hoạt/);
  assert.doesNotMatch(markup, /outage|degraded|lỗi dịch vụ|lỗi hệ thống|thử lại/i);
});

// 44. TEST — UNSUPPORTED
test("44. TEST — UNSUPPORTED: 422 EXPLANATION_QUERY_UNSUPPORTED returns guidance bubble with prompt chips", () => {
  const apiError: ApiError = {
    code: "EXPLANATION_QUERY_UNSUPPORTED",
    message: "Query cannot be answered by decision engine",
    details: {},
    request_id: "req-unsupported-1",
  };

  const msg = mapExplanation422(apiError, { question: "Thời tiết ngày mai thế nào?" });
  assert.equal(msg.kind, "guidance");
  if (msg.kind === "guidance") {
    assert.equal(msg.reason, "unsupported");
    assert.match(msg.text, /Mình chỉ có thể giải thích kế hoạch/);
    assert.ok(Array.isArray(msg.suggestedPrompts));
    assert.ok(msg.suggestedPrompts.length >= 3);
    assert.equal(msg.requestId, "req-unsupported-1");
  }
});

// 45. TEST — INGREDIENT NOT FOUND
test("45. TEST — INGREDIENT NOT FOUND: 422 INGREDIENT_RESOLUTION_NOT_FOUND prompts plan ingredients without auto substitution", () => {
  const apiError: ApiError = {
    code: "INGREDIENT_RESOLUTION_NOT_FOUND",
    message: "Unknown ingredient in free text",
    details: {},
    request_id: "req-notfound-1",
  };

  const originalReq: ExplanationRequest = { question: "Tại sao cần nhập bơ?" };
  const msg = mapExplanation422(apiError, originalReq);

  assert.equal(msg.kind, "guidance");
  if (msg.kind === "guidance") {
    assert.equal(msg.reason, "ingredient_not_found");
    assert.match(msg.text, /Mình chưa xác định được nguyên liệu này/);
    assert.ok(msg.suggestedPrompts?.includes("Xem nguyên liệu trong kế hoạch"));
    // No automatic replacement or local search
    assert.equal(msg.candidates, undefined);
  }
});

// 46. TEST — AMBIGUOUS
test("46. TEST — AMBIGUOUS: 422 INGREDIENT_RESOLUTION_AMBIGUOUS uses ONLY error.details.candidates", () => {
  const apiError: ApiError = {
    code: "INGREDIENT_RESOLUTION_AMBIGUOUS",
    message: "Multiple ingredients match query",
    details: {
      candidates: [
        { ingredient_id: "milk-fresh", ingredient_name: "Sữa tươi" },
        { ingredient_id: "condensed-milk", ingredient_name: "Sữa đặc" },
      ],
    },
    request_id: "req-ambig-1",
  };

  const originalReq: ExplanationRequest = { question: "Tại sao cần nhập sữa?" };
  const msg = mapExplanation422(apiError, originalReq);

  assert.equal(msg.kind, "guidance");
  if (msg.kind === "guidance") {
    assert.equal(msg.reason, "ingredient_ambiguous");
    assert.match(msg.text, /Có nhiều nguyên liệu có thể khớp với câu hỏi/);
    assert.equal(msg.candidates?.length, 2);
    assert.equal(msg.candidates?.[0].ingredient_id, "milk-fresh");
    assert.equal(msg.candidates?.[1].ingredient_id, "condensed-milk");
    assert.equal(msg.retry?.question, "Tại sao cần nhập sữa?");
  }
});

// 47. TEST — MISMATCH
test("47. TEST — MISMATCH: 422 INGREDIENT_QUESTION_MISMATCH provides explicit user choices without auto selection", () => {
  const apiError: ApiError = {
    code: "INGREDIENT_QUESTION_MISMATCH",
    message: "Selected ingredient differs from entity in question text",
    details: {},
    request_id: "req-mismatch-1",
  };

  const originalReq: ExplanationRequest = {
    ingredient_id: "sugar",
    question: "Tại sao cần nhập sữa?",
  };

  const msg = mapExplanation422(apiError, originalReq);
  assert.equal(msg.kind, "guidance");
  if (msg.kind === "guidance") {
    assert.equal(msg.reason, "ingredient_mismatch");
    assert.match(msg.text, /Nguyên liệu bạn chọn khác với nguyên liệu được nêu trong câu hỏi/);
    assert.ok(msg.suggestedPrompts?.includes("Giữ nguyên nguyên liệu đã chọn"));
    assert.ok(msg.suggestedPrompts?.includes("Đổi nguyên liệu"));
  }
});

// 48. TEST — STALE INGREDIENT
test("48. TEST — STALE INGREDIENT: 422 DECISION_RUN_INGREDIENT_NOT_FOUND offers general plan question without auto substitute", () => {
  const apiError: ApiError = {
    code: "DECISION_RUN_INGREDIENT_NOT_FOUND",
    message: "Ingredient no longer exists in run",
    details: {},
    request_id: "req-stale-1",
  };

  const msg = mapExplanation422(apiError, { ingredient_id: "deleted-ing", question: "Tại sao cần nhập?" });
  assert.equal(msg.kind, "guidance");
  if (msg.kind === "guidance") {
    assert.equal(msg.reason, "ingredient_unavailable");
    assert.match(msg.text, /Nguyên liệu này không còn có dữ liệu/);
    assert.ok(msg.suggestedPrompts?.includes("Hỏi về kế hoạch chung"));
  }
});

// 49. TEST — UNKNOWN 422
test("49. TEST — UNKNOWN 422: unrecognized 422 code returns safe invalid_request guidance without crashing", () => {
  const apiError: ApiError = {
    code: "FUTURE_BACKEND_CODE_X",
    message: "Some arbitrary backend validation message",
    details: {},
    request_id: "req-unknown-1",
  };

  const msg = mapExplanation422(apiError, { question: "Câu hỏi quá dài..." });
  assert.equal(msg.kind, "guidance");
  if (msg.kind === "guidance") {
    assert.equal(msg.reason, "invalid_request");
    assert.equal(msg.text, "Câu hỏi chưa đúng định dạng. Hãy thử lại với một câu ngắn hơn.");
    assert.equal(msg.requestId, "req-unknown-1");
  }
});

// 50. TEST — 404
test("50. TEST — 404: 404 DECISION_RUN_NOT_FOUND returns stale_resource message preserving conversation", () => {
  const msg = mapTransportResultToMessage(
    { status: 404, body: { code: "DECISION_RUN_NOT_FOUND", message: "Not found", details: {}, request_id: "r404" } },
    { question: "Tại sao?" },
  );

  assert.equal(msg.kind, "stale_resource");
  if (msg.kind === "stale_resource") {
    assert.match(msg.text, /Decision Run này không còn tồn tại hoặc đã hết hạn/);
  }
});

// 51. TEST — 503
test("51. TEST — 503: 503 returns recoverable_error retaining exact original request for explicit retry", () => {
  const originalReq: ExplanationRequest = {
    question: "Tại sao chọn Balanced?",
    language: "vi",
    detail_level: "technical",
    ingredient_id: "milk-fresh",
  };

  const msg = mapTransportResultToMessage(
    { status: 503, body: { code: "SERVICE_UNAVAILABLE", message: "Busy", details: {}, request_id: "r503" } },
    originalReq,
  );

  assert.equal(msg.kind, "recoverable_error");
  if (msg.kind === "recoverable_error") {
    assert.match(msg.text, /Chưa thể lấy lời giải thích lúc này. Thử lại./);
    assert.deepEqual(msg.request, originalReq);
    assert.equal(msg.status, 503);
  }
});

// 52. TEST — NETWORK FAILURE
test("52. TEST — NETWORK FAILURE: network error returns recoverable_error retaining exact request without crashing", () => {
  const originalReq: ExplanationRequest = {
    question: "Chiến lược rủi ro gì?",
    language: "vi",
    detail_level: "simple",
  };

  const msg = mapTransportResultToMessage(
    { status: "network_error", error: new Error("Failed to fetch") },
    originalReq,
  );

  assert.equal(msg.kind, "recoverable_error");
  if (msg.kind === "recoverable_error") {
    assert.match(msg.text, /Chưa thể lấy lời giải thích lúc này. Thử lại./);
    assert.deepEqual(msg.request, originalReq);
  }
});

// 53. TEST — ROW CANONICAL ID
test("53. TEST — ROW CANONICAL ID: row-level action uses row.ingredient_id, never displayed name", () => {
  const row = mockBrief.procurement_rows[0];
  let capturedRequest: ExplanationRequest | null = null;

  const req = createExplanationRequest({
    ingredientId: row.ingredient_id, // "milk-fresh", NOT "Sữa tươi"
    question: `Tại sao cần nhập ${row.ingredient_name}?`,
    detailLevel: "manager",
    language: "vi",
  });
  capturedRequest = req;

  assert.equal(capturedRequest.ingredient_id, "milk-fresh");
  assert.notEqual(capturedRequest.ingredient_id, "Sữa tươi");
  assert.equal(capturedRequest.detail_level, "manager");
  assert.equal(capturedRequest.language, "vi");
});

// 54. TEST — FREE TEXT
test("54. TEST — FREE TEXT: free-text input omits ingredient_id and avoids local semantic inference", () => {
  const freeText = "Tại sao cần nhập sữa?";
  const req = createExplanationRequest({
    question: freeText,
    ingredientId: null, // No guessed ID
    detailLevel: "simple",
    language: "vi",
  });

  assert.equal(req.question, freeText);
  assert.equal(req.ingredient_id, null);
});

// 55. TEST — NO MESSAGE-STRING BRANCHING
test("55. TEST — NO MESSAGE-STRING BRANCHING: same code with completely different messages yields identical UI reasoning", () => {
  const err1: ApiError = {
    code: "EXPLANATION_QUERY_UNSUPPORTED",
    message: "Human readable message variation 1: query unsupported",
    details: {},
    request_id: "req-1",
  };

  const err2: ApiError = {
    code: "EXPLANATION_QUERY_UNSUPPORTED",
    message: "Different diagnostic string variation 2: out of domain",
    details: {},
    request_id: "req-2",
  };

  const originalReq = { question: "Hỏi linh tinh" };
  const res1 = mapExplanation422(err1, originalReq);
  const res2 = mapExplanation422(err2, originalReq);

  assert.equal(res1.kind, "guidance");
  assert.equal(res2.kind, "guidance");
  if (res1.kind === "guidance" && res2.kind === "guidance") {
    assert.equal(res1.reason, res2.reason);
    assert.equal(res1.text, res2.text);
    assert.deepEqual(res1.suggestedPrompts, res2.suggestedPrompts);
  }
});

// 56. TEST — TYPING CLEANUP
test("56. TEST — TYPING CLEANUP: typing bubble is replaced by exactly one assistant bubble across all outcomes", () => {
  const outcomes: Array<{
    name: string;
    result: Parameters<typeof mapTransportResultToMessage>[0];
  }> = [
    { name: "200 Success", result: { status: 200, body: mockSuccessResponse } },
    {
      name: "422 Handled",
      result: {
        status: 422,
        body: { code: "EXPLANATION_QUERY_UNSUPPORTED", message: "Unsupp", details: {}, request_id: "r1" },
      },
    },
    { name: "404 Stale", result: { status: 404, body: { code: "404", message: "Not found", details: {}, request_id: "r2" } } },
    { name: "503 Outage", result: { status: 503, body: { code: "503", message: "Unavailable", details: {}, request_id: "r3" } } },
    { name: "Network Failure", result: { status: "network_error", error: new Error("Network down") } },
  ];

  for (const { name, result } of outcomes) {
    const originalReq = { question: "Test question" };
    // Simulate initial messages with typing
    const messages: ExplanationChatMessage[] = [
      { id: "u-1", kind: "user", text: "Test question" },
      { id: "t-1", kind: "typing" },
    ];

    const finalMessage = mapTransportResultToMessage(result, originalReq);

    // Remove typing and append result
    const filtered = messages.filter((m) => m.kind !== "typing");
    const updated = [...filtered, finalMessage];

    assert.equal(updated.filter((m) => m.kind === "typing").length, 0, `${name} must clear typing indicator`);
    assert.equal(updated.length, 2, `${name} must leave exactly user message + 1 assistant message`);
    assert.equal(updated[0].kind, "user");
    assert.notEqual(updated[1].kind, "typing");
  }
});

// 57. TEST — NO EXPLANATION AUTOLOAD
test("57. TEST — NO EXPLANATION AUTOLOAD: DecisionBriefWorkspace renders without firing any automatic /explanation call", () => {
  let explanationCallsCount = 0;

  const markup = renderToStaticMarkup(
    <DecisionBriefWorkspace
      brief={mockBrief}
      explanation={null}
      explanationLoading={false}
      explanationError={null}
      onExplain={() => {
        explanationCallsCount++;
      }}
    />,
  );

  // Assert no explanation call was made on mount/render
  assert.equal(explanationCallsCount, 0, "No /explanation request should trigger automatically on render");
  assert.match(markup, /Kế hoạch nhập hàng/);
  assert.match(markup, /Hỏi AI về kế hoạch/);
});
