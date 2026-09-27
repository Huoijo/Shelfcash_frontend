"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Bot,
  ChevronDown,
  ChevronRight,
  Info,
  RefreshCw,
  Send,
  Sparkles,
  User,
  X,
} from "lucide-react";
import type {
  DecisionBriefFacts,
  DecisionExplanationResponse,
  ExplanationChatMessage,
  ExplanationDetailLevel,
  ExplanationRequest,
} from "../../lib/types";
import { postExplanation, type ExplanationTransportResult } from "../../lib/shelfcash-client";
import {
  DEFAULT_SUGGESTED_PROMPTS,
  createExplanationRequest,
  mapTransportResultToMessage,
} from "../../lib/explanation-chat";
import { buildMockExplanation } from "../../lib/mock-data";

export interface DecisionExplanationDrawerProps {
  open: boolean;
  onClose: () => void;
  decisionRunId?: string;
  brief?: DecisionBriefFacts | null;
  initialRequest?: ExplanationRequest | null;
  initialMessages?: ExplanationChatMessage[];
  isTutorial?: boolean;
  /** Backwards compatibility props */
  explanation?: DecisionExplanationResponse | null;
  loading?: boolean;
  error?: string | null;
  onAsk?: (request: ExplanationRequest) => void;
}

export function DecisionExplanationDrawer({
  open,
  onClose,
  decisionRunId,
  initialRequest,
  initialMessages,
  isTutorial = false,
  explanation,
  loading: externalLoading,
  error: externalError,
  onAsk,
}: DecisionExplanationDrawerProps) {
  const [messages, setMessages] = useState<ExplanationChatMessage[]>(() => {
    if (initialMessages && initialMessages.length > 0) {
      return initialMessages;
    }
    if (explanation) {
      return [
        {
          id: "seed-init",
          kind: "answer",
          text: explanation.answer,
          response: explanation,
          showEvidence: false,
          timestamp: Date.now(),
        },
      ];
    }
    return [];
  });
  const [question, setQuestion] = useState("");
  const [detailLevel, setDetailLevel] = useState<ExplanationDetailLevel>("simple");
  const [selectedIngredientId, setSelectedIngredientId] = useState<string | null>(
    initialRequest?.ingredient_id ?? null,
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [expandedEvidenceIds, setExpandedEvidenceIds] = useState<Record<string, boolean>>({});

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const initialRequestSentRef = useRef<string | null>(null);

  // Auto-scroll to bottom of chat
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Focus input when drawer opens
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [open]);

  // Handle send request
  const submitRequest = useCallback(
    async (requestToSend: ExplanationRequest) => {
      if (isSubmitting) return;

      const userText =
        requestToSend.question ??
        (requestToSend.ingredient_id
          ? `Tại sao cần nhập nguyên liệu này?`
          : "Giải thích kế hoạch nhập hàng này.");

      const userMsgId = `user-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const typingMsgId = `typing-${Date.now()}`;

      // 1. Append user message immediately
      // 2. Keep it visible
      // 3. Show transient assistant typing state
      setMessages((prev) => [
        ...prev,
        {
          id: userMsgId,
          kind: "user",
          text: userText,
          timestamp: Date.now(),
        },
        {
          id: typingMsgId,
          kind: "typing",
        },
      ]);

      setIsSubmitting(true);
      setQuestion("");

      // Notify parent onAsk if wired
      onAsk?.(requestToSend);

      try {
        let transportResult: ExplanationTransportResult;

        if (isTutorial || !decisionRunId) {
          // INV-014: In Tutorial Mode or offline mock, simulate locally with ZERO backend network calls
          await new Promise((resolve) => setTimeout(resolve, 350));
          const mockResponse = buildMockExplanation(requestToSend);
          transportResult = {
            status: 200,
            body: mockResponse,
          };
        } else {
          // Live contract call
          transportResult = await postExplanation(decisionRunId, requestToSend);
        }

        // 5. Remove typing state
        // 6. Append exactly ONE assistant-side result
        const assistantMessage = mapTransportResultToMessage(transportResult, requestToSend);

        setMessages((prev) => {
          const withoutTyping = prev.filter((m) => m.kind !== "typing");
          return [...withoutTyping, assistantMessage];
        });
      } catch {
        // Fallback for unexpected runtime failure
        const networkErrorMsg: ExplanationChatMessage = {
          id: `err-${Date.now()}`,
          kind: "recoverable_error",
          text: "Chưa thể lấy lời giải thích lúc này. Thử lại.",
          request: requestToSend,
          timestamp: Date.now(),
        };

        setMessages((prev) => {
          const withoutTyping = prev.filter((m) => m.kind !== "typing");
          return [...withoutTyping, networkErrorMsg];
        });
      } finally {
        setIsSubmitting(false);
      }
    },
    [decisionRunId, isSubmitting, isTutorial, onAsk],
  );

  // Handle initial row-level request if passed when opening drawer
  useEffect(() => {
    if (open && initialRequest && initialRequest.question) {
      const key = `${initialRequest.ingredient_id ?? ""}-${initialRequest.question}`;
      if (initialRequestSentRef.current !== key) {
        initialRequestSentRef.current = key;
        void submitRequest(initialRequest);
      }
    }
  }, [initialRequest, open, submitRequest]);

  // Free-text form submit
  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = question.trim();
    if (!trimmed || isSubmitting) return;

    if (trimmed.length > 2000) {
      alert("Câu hỏi không được vượt quá 2000 ký tự.");
      return;
    }

    const req = createExplanationRequest({
      question: trimmed,
      ingredientId: selectedIngredientId,
      detailLevel,
      language: "vi",
    });

    void submitRequest(req);
  };

  // Quick prompt click
  const handlePromptClick = (promptText: string) => {
    if (isSubmitting) return;
    const req = createExplanationRequest({
      question: promptText,
      ingredientId: selectedIngredientId,
      detailLevel,
      language: "vi",
    });
    void submitRequest(req);
  };

  // Retry from 503/network bubble
  const handleRetry = (originalRequest: ExplanationRequest) => {
    if (isSubmitting) return;
    void submitRequest(originalRequest);
  };

  // Ambiguous candidate selection retry
  const handleSelectCandidate = (candidate: { ingredient_id: string; ingredient_name: string }, originalQuestion: string) => {
    if (isSubmitting) return;
    setSelectedIngredientId(candidate.ingredient_id);
    const req = createExplanationRequest({
      question: originalQuestion,
      ingredientId: candidate.ingredient_id,
      detailLevel,
      language: "vi",
    });
    void submitRequest(req);
  };

  const toggleEvidence = (msgId: string) => {
    setExpandedEvidenceIds((prev) => ({
      ...prev,
      [msgId]: !prev[msgId],
    }));
  };

  return (
    <div
      className={`cockpit-drawer-overlay ${open ? "open" : ""}`}
      style={{ display: open ? "block" : "none" }}
      onClick={onClose}
      aria-modal="true"
      role="dialog"
    >
      <div className="cockpit-drawer-panel" onClick={(e) => e.stopPropagation()}>
        {/* Drawer Header */}
        <div className="cockpit-drawer-header">
          <div className="drawer-header-title">
            <Sparkles size={18} className="text-accent" />
            <div>
              <h3>Trợ lý lý giải quyết định AI</h3>
              <p>Giải thích logic và các đánh đổi đằng sau kế hoạch nhập</p>
            </div>
          </div>
          <div className="drawer-header-actions">
            <div className="detail-level-selector" title="Mức độ chi tiết">
              <button
                type="button"
                className={`detail-btn ${detailLevel === "simple" ? "active" : ""}`}
                onClick={() => setDetailLevel("simple")}
              >
                Cơ bản
              </button>
              <button
                type="button"
                className={`detail-btn ${detailLevel === "manager" ? "active" : ""}`}
                onClick={() => setDetailLevel("manager")}
              >
                Quản lý
              </button>
              <button
                type="button"
                className={`detail-btn ${detailLevel === "technical" ? "active" : ""}`}
                onClick={() => setDetailLevel("technical")}
              >
                Kỹ thuật
              </button>
            </div>
            <button className="drawer-close-btn" onClick={onClose} type="button" aria-label="Đóng">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Selected Context Indicator */}
        {selectedIngredientId ? (
          <div className="drawer-context-bar">
            <span>
              Đang gắn với nguyên liệu: <strong>{selectedIngredientId}</strong>
            </span>
            <button
              type="button"
              className="clear-context-btn"
              onClick={() => setSelectedIngredientId(null)}
            >
              Hỏi chung
            </button>
          </div>
        ) : null}

        {/* Drawer Body / Chat Area */}
        <div className="cockpit-drawer-body">
          {/* Quick Prompts Bar */}
          <div className="drawer-quick-prompts">
            <span className="quick-prompts-label">Gợi ý nhanh:</span>
            {DEFAULT_SUGGESTED_PROMPTS.map((q) => (
              <button
                key={q}
                className="quick-prompt-chip"
                disabled={isSubmitting}
                onClick={() => handlePromptClick(q)}
                type="button"
              >
                {q}
              </button>
            ))}
          </div>

          {/* External Error Notice if any legacy error passed */}
          {externalError ? <div className="chat-external-notice">{externalError}</div> : null}

          {/* Chat Messages Transcript */}
          {messages.length === 0 ? (
            <div className="drawer-empty-state">
              <Bot size={40} className="empty-state-bot" />
              <p>Chọn câu hỏi gợi ý ở trên hoặc nhập câu hỏi cụ thể để AI giải thích chi tiết kế hoạch.</p>
            </div>
          ) : (
            <div className="chat-transcript-area" role="log" aria-live="polite">
              {messages.map((msg) => {
                // 1. User Message
                if (msg.kind === "user") {
                  return (
                    <div key={msg.id} className="chat-row user-row">
                      <div className="chat-bubble user-bubble">
                        <p>{msg.text}</p>
                      </div>
                      <div className="chat-avatar user-avatar" aria-hidden="true">
                        <User size={14} />
                      </div>
                    </div>
                  );
                }

                // 2. Typing Indicator
                if (msg.kind === "typing") {
                  return (
                    <div key={msg.id} className="chat-row assistant-row typing-row">
                      <div className="chat-avatar assistant-avatar" aria-hidden="true">
                        <Bot size={14} />
                      </div>
                      <div className="chat-bubble assistant-bubble typing-bubble" aria-label="Đang suy nghĩ">
                        <span className="typing-dot" />
                        <span className="typing-dot" />
                        <span className="typing-dot" />
                      </div>
                    </div>
                  );
                }

                // 3. Assistant Answer
                if (msg.kind === "answer") {
                  const hasEvidence =
                    (msg.response.citations && msg.response.citations.length > 0) ||
                    (msg.response.claims && msg.response.claims.length > 0);
                  const isExpanded = Boolean(expandedEvidenceIds[msg.id]);

                  return (
                    <div key={msg.id} className="chat-row assistant-row">
                      <div className="chat-avatar assistant-avatar" aria-hidden="true">
                        <Bot size={14} />
                      </div>
                      <div className="chat-bubble assistant-bubble answer-bubble">
                        <div className="drawer-answer-badge">
                          <Bot size={14} /> Câu trả lời từ ShelfCash AI
                        </div>

                        <p className="drawer-answer-text">{msg.text}</p>

                        {msg.response.why_this_plan?.length ? (
                          <div className="drawer-sub-section">
                            <strong>Tại sao kế hoạch này tối ưu?</strong>
                            <ul>
                              {msg.response.why_this_plan.map((item, i) => (
                                <li key={i}>{item}</li>
                              ))}
                            </ul>
                          </div>
                        ) : null}

                        {msg.response.main_risks?.length ? (
                          <div className="drawer-sub-section warning-tone">
                            <strong>Rủi ro cần lưu ý:</strong>
                            <ul>
                              {msg.response.main_risks.map((item, i) => (
                                <li key={i}>{item}</li>
                              ))}
                            </ul>
                          </div>
                        ) : null}

                        {msg.response.tradeoffs?.length ? (
                          <div className="drawer-sub-section">
                            <strong>Các đánh đổi đã cân nhắc:</strong>
                            <ul>
                              {msg.response.tradeoffs.map((item, i) => (
                                <li key={i}>{item}</li>
                              ))}
                            </ul>
                          </div>
                        ) : null}

                        {/* Evidence & Citations disclosure */}
                        {hasEvidence ? (
                          <div className="chat-evidence-wrapper">
                            <button
                              type="button"
                              className="chat-evidence-toggle"
                              onClick={() => toggleEvidence(msg.id)}
                            >
                              {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                              Bằng chứng & trích dẫn ({msg.response.citations?.length || 0})
                            </button>
                            {isExpanded ? (
                              <div className="chat-evidence-panel">
                                {msg.response.citations?.length ? (
                                  <div className="evidence-sub-block">
                                    <span className="evidence-heading">Trích dẫn:</span>
                                    <ul>
                                      {msg.response.citations.map((c) => (
                                        <li key={c.evidence_id}>
                                          <strong>{c.label}</strong> ({c.source_type})
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                ) : null}
                                {msg.response.claims?.length ? (
                                  <div className="evidence-sub-block">
                                    <span className="evidence-heading">Xác thực:</span>
                                    <ul>
                                      {msg.response.claims.map((cl, idx) => (
                                        <li key={idx}>
                                          {cl.type}: {String(cl.value)} {cl.unit ?? ""}
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  );
                }

                // 4. Assistant Guidance (422 Handled Bubble)
                if (msg.kind === "guidance") {
                  return (
                    <div key={msg.id} className="chat-row assistant-row guidance-row">
                      <div className="chat-avatar assistant-avatar guidance-avatar" aria-hidden="true">
                        <Info size={14} />
                      </div>
                      <div className="chat-bubble assistant-bubble guidance-bubble">
                        <div className="guidance-header">
                          <Sparkles size={13} /> Hướng dẫn từ trợ lý
                        </div>
                        <p className="guidance-text">{msg.text}</p>

                        {/* Case: ambiguous candidates selection */}
                        {msg.candidates && msg.candidates.length > 0 ? (
                          <div className="guidance-candidates-list">
                            <span className="guidance-action-title">Chọn một nguyên liệu:</span>
                            <div className="guidance-candidates-grid">
                              {msg.candidates.map((cand) => (
                                <button
                                  key={cand.ingredient_id}
                                  type="button"
                                  className="candidate-choice-btn"
                                  disabled={isSubmitting}
                                  onClick={() => handleSelectCandidate(cand, msg.retry?.question || question)}
                                >
                                  {cand.ingredient_name}
                                </button>
                              ))}
                            </div>
                          </div>
                        ) : null}

                        {/* Case: prompt chips */}
                        {msg.suggestedPrompts && msg.suggestedPrompts.length > 0 ? (
                          <div className="guidance-prompts-list">
                            {msg.suggestedPrompts.map((p) => (
                              <button
                                key={p}
                                type="button"
                                className="guidance-prompt-btn"
                                disabled={isSubmitting}
                                onClick={() => handlePromptClick(p)}
                              >
                                {p}
                              </button>
                            ))}
                          </div>
                        ) : null}

                        {/* Hidden/Subtle request ID for support/debug */}
                        {msg.requestId ? (
                          <span className="guidance-request-meta" title={msg.requestId}>
                            Mã tra cứu: {msg.requestId.slice(0, 8)}…
                          </span>
                        ) : null}
                      </div>
                    </div>
                  );
                }

                // 5. Recoverable Transport Error (503 / network)
                if (msg.kind === "recoverable_error") {
                  return (
                    <div key={msg.id} className="chat-row assistant-row error-row">
                      <div className="chat-avatar assistant-avatar error-avatar" aria-hidden="true">
                        <AlertTriangle size={14} />
                      </div>
                      <div className="chat-bubble assistant-bubble error-bubble">
                        <p className="error-text">{msg.text}</p>
                        <button
                          type="button"
                          className="retry-action-btn"
                          disabled={isSubmitting}
                          onClick={() => handleRetry(msg.request)}
                        >
                          <RefreshCw size={12} /> Thử lại
                        </button>
                      </div>
                    </div>
                  );
                }

                // 6. Stale Resource (404)
                if (msg.kind === "stale_resource") {
                  return (
                    <div key={msg.id} className="chat-row assistant-row stale-row">
                      <div className="chat-avatar assistant-avatar stale-avatar" aria-hidden="true">
                        <AlertTriangle size={14} />
                      </div>
                      <div className="chat-bubble assistant-bubble stale-bubble">
                        <p>{msg.text}</p>
                        <div className="stale-actions">
                          <button type="button" className="stale-action-btn" onClick={onClose}>
                            Quay lại Decision hiện tại
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                }

                return null;
              })}
              <div ref={messagesEndRef} />
            </div>
          )}

          {/* Chat Input Form */}
          <form className="drawer-input-form" onSubmit={handleFormSubmit}>
            <input
              ref={inputRef}
              placeholder="Đặt câu hỏi về kế hoạch này... (tối đa 2000 ký tự)"
              value={question}
              maxLength={2000}
              onChange={(e) => setQuestion(e.target.value)}
              disabled={isSubmitting || externalLoading}
            />
            <button
              className="drawer-send-btn"
              disabled={!question.trim() || isSubmitting || externalLoading}
              type="submit"
            >
              <Send size={15} /> Hỏi
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
