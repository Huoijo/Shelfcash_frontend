"use client";

import React from "react";
import { CheckCircle2, Upload } from "lucide-react";
import { useTutorial } from "./TutorialContext";

export function TutorialCompletionCard({
  onOpenImport,
}: {
  onOpenImport?: () => void;
}) {
  const { showCompletion, finishTutorial } = useTutorial();

  if (!showCompletion) return null;

  const flowSteps = [
    { label: "Tải dữ liệu", done: true },
    { label: "Trung tâm quyết định", done: true },
    { label: "Nhận diện rủi ro", done: true },
    { label: "Chọn chiến lược", done: true },
    { label: "What-if", done: true },
    { label: "Draft PO", done: true },
  ];

  return (
    <div className="tutorial-completion-overlay" role="dialog" aria-modal="true">
      <div className="tutorial-completion-card">
        <div className="tutorial-completion-badge">
          <CheckCircle2 size={36} className="text-emerald-500" />
        </div>

        <h2 className="tutorial-completion-title">
          Bạn đã hoàn thành quy trình ShelfCash
        </h2>

        <p className="tutorial-completion-desc">
          Bạn đã trải nghiệm quy trình ra quyết định hoàn chỉnh: từ tải dữ liệu, thiết lập trung tâm quyết định, phát hiện rủi ro,
          cân nhắc chiến lược chi phí, thử nghiệm kịch bản What-if cho đến tạo Draft PO.
        </p>

        {/* Visual Flow: Tải dữ liệu → Trung tâm quyết định → Nhận diện rủi ro → Chọn chiến lược → What-if → Draft PO */}
        <div className="tutorial-completion-flow">
          {flowSteps.map((step, idx) => (
            <React.Fragment key={step.label}>
              <div className="flow-step-item">
                <span className="flow-step-icon">
                  <CheckCircle2 size={14} />
                </span>
                <span className="flow-step-label">{step.label}</span>
              </div>
              {idx < flowSteps.length - 1 ? (
                <span className="flow-step-arrow" aria-hidden="true">
                  →
                </span>
              ) : null}
            </React.Fragment>
          ))}
        </div>

        <div className="tutorial-completion-actions">
          <button
            type="button"
            className="tutorial-btn-primary"
            onClick={() => {
              finishTutorial();
              onOpenImport?.();
            }}
          >
            <Upload size={16} /> Dùng dữ liệu của tôi
          </button>

          <button
            type="button"
            className="tutorial-btn-secondary"
            onClick={finishTutorial}
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}
