"use client";

import React, { useState } from "react";
import { Sparkles, X } from "lucide-react";
import { useTutorial } from "./TutorialContext";

export function TutorialBeacon({
  hintId,
  title,
  message,
  onAction,
}: {
  hintId: string;
  title: string;
  message: string;
  onAction?: () => void;
}) {
  const { preferences, markHintCompleted } = useTutorial();
  const [open, setOpen] = useState(false);

  // If hint already completed/dismissed, don't render beacon
  if (preferences.completedHints?.includes(hintId)) {
    return null;
  }

  const handleDismiss = () => {
    setOpen(false);
    markHintCompleted(hintId);
  };

  const handleExplore = () => {
    setOpen(false);
    markHintCompleted(hintId);
    onAction?.();
  };

  return (
    <div className="tutorial-beacon-wrapper">
      <button
        type="button"
        className="tutorial-beacon-dot"
        onClick={() => setOpen((prev) => !prev)}
        aria-label={`Gợi ý: ${title}`}
        title={`Gợi ý: ${title}`}
      >
        <span className="beacon-pulse-core" />
      </button>

      {open ? (
        <div className="tutorial-beacon-popover" role="dialog" aria-modal="false">
          <div className="beacon-popover-header">
            <span className="beacon-title">
              <Sparkles size={13} /> {title}
            </span>
            <button
              type="button"
              className="beacon-close-btn"
              onClick={handleDismiss}
              aria-label="Đóng"
            >
              <X size={13} />
            </button>
          </div>
          <p className="beacon-body">{message}</p>
          <div className="beacon-actions">
            <button
              type="button"
              className="beacon-action-btn"
              onClick={handleExplore}
            >
              Xem ngay
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
