"use client";

import React from "react";
import { Info, LogOut } from "lucide-react";
import { useTutorial } from "./TutorialContext";

export function TutorialBanner() {
  const { mode, exitTutorial } = useTutorial();

  if (mode !== "tutorial") return null;

  return (
    <div className="tutorial-mode-persistent-banner" role="status" aria-live="polite">
      <div className="tutorial-banner-content">
        <div className="tutorial-banner-left">
          <span className="tutorial-banner-badge">
            <Info size={14} /> Chế độ hướng dẫn
          </span>
          <strong className="tutorial-banner-title">
            Đang ở chế độ hướng dẫn — dữ liệu mẫu
          </strong>
          <span className="tutorial-banner-subtext">
            Mọi thao tác trong hướng dẫn không ảnh hưởng dữ liệu thật.
          </span>
        </div>
        <div className="tutorial-banner-right">
          <button
            type="button"
            className="tutorial-banner-exit-btn"
            onClick={exitTutorial}
          >
            <LogOut size={13} /> Thoát hướng dẫn
          </button>
        </div>
      </div>
    </div>
  );
}
