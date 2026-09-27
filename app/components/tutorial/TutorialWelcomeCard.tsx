"use client";

import React from "react";
import { Compass, Sparkles, Upload, X } from "lucide-react";
import { useTutorial } from "./TutorialContext";

export function TutorialWelcomeCard({
  onOpenImport,
}: {
  onOpenImport?: () => void;
}) {
  const { showWelcome, startTutorial, dismissWelcome } = useTutorial();

  if (!showWelcome) return null;

  return (
    <div
      className="tutorial-welcome-floating-card"
      role="region"
      aria-label="Khám phá ShelfCash"
    >
      <div className="tutorial-welcome-header">
        <div className="tutorial-welcome-icon-title">
          <div className="tutorial-welcome-badge-icon">
            <Sparkles size={16} />
          </div>
          <h3 className="tutorial-welcome-title">Khám phá ShelfCash</h3>
        </div>
        <button
          type="button"
          className="tutorial-welcome-close-btn"
          onClick={dismissWelcome}
          aria-label="Đóng lời mời hướng dẫn"
        >
          <X size={16} />
        </button>
      </div>

      <p className="tutorial-welcome-body">
        Trong vài phút, bạn có thể thử một quy trình nhập hàng hoàn chỉnh bằng dữ liệu mẫu.
      </p>

      <div className="tutorial-welcome-meta">
        <small>Dữ liệu mẫu · Không ảnh hưởng cửa hàng thật</small>
      </div>

      <div className="tutorial-welcome-actions">
        <button
          type="button"
          className="tutorial-welcome-btn-primary"
          onClick={startTutorial}
        >
          <Compass size={15} /> Bắt đầu tham quan
        </button>

        <button
          type="button"
          className="tutorial-welcome-btn-secondary"
          onClick={() => {
            dismissWelcome();
            onOpenImport?.();
          }}
        >
          <Upload size={14} /> Nhập dữ liệu của tôi
        </button>

        <button
          type="button"
          className="tutorial-welcome-btn-tertiary"
          onClick={dismissWelcome}
        >
          Bỏ qua
        </button>
      </div>
    </div>
  );
}
