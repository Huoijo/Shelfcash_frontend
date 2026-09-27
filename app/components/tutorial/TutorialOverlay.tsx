"use client";

import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Sparkles, X } from "lucide-react";
import { useTutorial } from "./TutorialContext";

interface TargetRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export function TutorialOverlay() {
  const { isActive, currentStep, nextStep, prevStep, skipTutorial, currentStepIndex } = useTutorial();
  const [targetRect, setTargetRect] = useState<TargetRect | null>(null);
  const [targetFound, setTargetFound] = useState(true);
  const [tooltipPos, setTooltipPos] = useState<{ top: number; left: number; placement: string }>({
    top: 0,
    left: 0,
    placement: "bottom",
  });
  const tooltipRef = useRef<HTMLDivElement>(null);

  // Locate target and compute bounding box
  useEffect(() => {
    if (!isActive || !currentStep) return;

    if (!currentStep.target) {
      const resetTimer = setTimeout(() => {
        setTargetRect(null);
        setTargetFound(true);
      }, 0);
      return () => clearTimeout(resetTimer);
    }

    let retries = 0;
    const maxRetries = 6;
    let timer: NodeJS.Timeout | null = null;
    let activeElement: Element | null = null;

    const locate = () => {
      const el = document.querySelector(`[data-tutorial-id="${currentStep.target}"]`);
      if (el) {
        activeElement = el;
        el.classList.add("tutorial-highlighted-target");

        // Check prefers-reduced-motion
        const reduceMotion =
          typeof window !== "undefined" &&
          window.matchMedia("(prefers-reduced-motion: reduce)").matches;

        // Measure sticky headers so we don't scroll under them
        const banner = document.querySelector<HTMLElement>(".tutorial-banner");
        const header = document.querySelector<HTMLElement>(".top-header");
        const headerHeight =
          (banner?.getBoundingClientRect().height || 0) +
          (header?.getBoundingClientRect().height || 0);
        const topSafeOffset = headerHeight + 14;

        const rect = el.getBoundingClientRect();
        const preferred = currentStep.placement || "bottom";

        // Smart scroll:
        // Smart scroll:
        // When preferred placement is "bottom", scroll element to topSafeOffset
        // When preferred placement is "top", leave comfortable space above element (~180px) for the tooltip card
        if (preferred === "bottom") {
          const elementTopInDoc = rect.top + window.scrollY;
          const targetY = Math.max(0, elementTopInDoc - topSafeOffset);
          window.scrollTo({
            top: targetY,
            behavior: reduceMotion ? "auto" : "smooth",
          });
        } else if (preferred === "top") {
          const elementTopInDoc = rect.top + window.scrollY;
          const targetY = Math.max(0, elementTopInDoc - topSafeOffset - 180);
          window.scrollTo({
            top: targetY,
            behavior: reduceMotion ? "auto" : "smooth",
          });
        } else if (rect.height > 220) {
          const elementTopInDoc = rect.top + window.scrollY;
          const targetY = Math.max(0, elementTopInDoc - topSafeOffset);
          window.scrollTo({
            top: targetY,
            behavior: reduceMotion ? "auto" : "smooth",
          });
        } else {
          el.scrollIntoView({
            behavior: reduceMotion ? "auto" : "smooth",
            block: "center",
          });
        }

        // Compute rect after scroll/layout stability
        const updateRect = () => {
          const rect = el.getBoundingClientRect();
          setTargetRect({
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height,
          });
          setTargetFound(true);
        };

        // Immediate + delayed after smooth scroll
        updateRect();
        timer = setTimeout(updateRect, 300);
      } else if (retries < maxRetries) {
        retries++;
        timer = setTimeout(locate, 150);
      } else {
        // Target missing fallback: don't crash
        setTargetRect(null);
        setTargetFound(false);
      }
    };

    locate();

    return () => {
      if (timer) clearTimeout(timer);
      if (activeElement) {
        activeElement.classList.remove("tutorial-highlighted-target");
      }
      if (typeof document !== "undefined") {
        document.querySelectorAll(".tutorial-highlighted-target").forEach((node) => {
          node.classList.remove("tutorial-highlighted-target");
        });
      }
    };
  }, [isActive, currentStep]);

  // Recalculate spotlight and tooltip on window resize or scroll
  useEffect(() => {
    if (!isActive || !currentStep?.target) return;

    const handleUpdate = () => {
      const el = document.querySelector(`[data-tutorial-id="${currentStep.target}"]`);
      if (el) {
        const rect = el.getBoundingClientRect();
        setTargetRect({
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height,
        });
      }
    };

    window.addEventListener("resize", handleUpdate, { passive: true });
    window.addEventListener("scroll", handleUpdate, { passive: true });

    return () => {
      window.removeEventListener("resize", handleUpdate);
      window.removeEventListener("scroll", handleUpdate);
    };
  }, [isActive, currentStep]);

  // Adaptive tooltip positioning
  useLayoutEffect(() => {
    let animId: number | null = null;
    animId = requestAnimationFrame(() => {
      if (!targetRect || !tooltipRef.current) {
        // Centered fallback if no target
        if (typeof window !== "undefined") {
          setTooltipPos({
            top: window.innerHeight / 2 - 100,
            left: Math.max(16, window.innerWidth / 2 - 170),
            placement: "center",
          });
        }
        return;
      }

      const banner = document.querySelector<HTMLElement>(".tutorial-banner");
      const header = document.querySelector<HTMLElement>(".top-header");
      const topSafeLimit =
        (banner?.getBoundingClientRect().height || 0) +
        (header?.getBoundingClientRect().height || 0) +
        12;

      const tooltipEl = tooltipRef.current;
      const tooltipWidth = tooltipEl.offsetWidth || 350;
      const tooltipHeight = tooltipEl.offsetHeight || 150;
      const padding = 12;

      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      // Preferred placement from step or default
      const preferred = currentStep?.placement || "bottom";

      // Collision helper: returns true if tooltip rect overlaps targetRect
      const doesOverlap = (t: number, l: number) => {
        return !(
          l + tooltipWidth <= targetRect.left ||
          l >= targetRect.left + targetRect.width ||
          t + tooltipHeight <= targetRect.top ||
          t >= targetRect.top + targetRect.height
        );
      };

      let calculatedTop = 0;
      let calculatedLeft = 0;
      let actualPlacement = preferred;

      // Candidate 1: Bottom placement
      const bottomTop = targetRect.top + targetRect.height + padding;
      let bottomLeft = targetRect.left + targetRect.width / 2 - tooltipWidth / 2;
      bottomLeft = Math.max(16, Math.min(viewportWidth - tooltipWidth - 16, bottomLeft));
      const fitsBottom =
        bottomTop + tooltipHeight <= viewportHeight - 16 && !doesOverlap(bottomTop, bottomLeft);

      // Candidate 2: Top placement
      const topTop = targetRect.top - tooltipHeight - padding;
      let topLeft = targetRect.left + targetRect.width / 2 - tooltipWidth / 2;
      topLeft = Math.max(16, Math.min(viewportWidth - tooltipWidth - 16, topLeft));
      const fitsTop = topTop >= topSafeLimit && !doesOverlap(topTop, topLeft);

      // Candidate 3: Right placement
      const rightLeft = targetRect.left + targetRect.width + padding;
      let rightTop = targetRect.top + targetRect.height / 2 - tooltipHeight / 2;
      rightTop = Math.max(topSafeLimit, Math.min(viewportHeight - tooltipHeight - 16, rightTop));
      const fitsRight =
        rightLeft + tooltipWidth <= viewportWidth - 16 && !doesOverlap(rightTop, rightLeft);

      // Candidate 4: Left placement
      const leftLeft = targetRect.left - tooltipWidth - padding;
      let leftTop = targetRect.top + targetRect.height / 2 - tooltipHeight / 2;
      leftTop = Math.max(topSafeLimit, Math.min(viewportHeight - tooltipHeight - 16, leftTop));
      const fitsLeft = leftLeft >= 16 && !doesOverlap(leftTop, leftLeft);

      // Selection prioritizing collision-free placement
      if (preferred === "bottom") {
        if (fitsBottom) {
          calculatedTop = bottomTop;
          calculatedLeft = bottomLeft;
          actualPlacement = "bottom";
        } else if (fitsTop) {
          calculatedTop = topTop;
          calculatedLeft = topLeft;
          actualPlacement = "top";
        } else if (fitsRight) {
          calculatedTop = rightTop;
          calculatedLeft = rightLeft;
          actualPlacement = "right";
        } else if (fitsLeft) {
          calculatedTop = leftTop;
          calculatedLeft = leftLeft;
          actualPlacement = "left";
        } else {
          // Guaranteed collision-free bottom placement outside the target table
          calculatedTop = targetRect.top + targetRect.height + 8;
          calculatedLeft = bottomLeft;
          actualPlacement = "bottom";
        }
      } else if (preferred === "top") {
        if (fitsTop) {
          calculatedTop = topTop;
          calculatedLeft = topLeft;
          actualPlacement = "top";
        } else if (fitsBottom) {
          calculatedTop = bottomTop;
          calculatedLeft = bottomLeft;
          actualPlacement = "bottom";
        } else if (fitsRight) {
          calculatedTop = rightTop;
          calculatedLeft = rightLeft;
          actualPlacement = "right";
        } else if (fitsLeft) {
          calculatedTop = leftTop;
          calculatedLeft = leftLeft;
          actualPlacement = "left";
        } else {
          calculatedTop = targetRect.top - tooltipHeight - 8;
          calculatedLeft = topLeft;
          actualPlacement = "top";
        }
      } else if (preferred === "right") {
        if (fitsRight) {
          calculatedTop = rightTop;
          calculatedLeft = rightLeft;
          actualPlacement = "right";
        } else if (fitsBottom) {
          calculatedTop = bottomTop;
          calculatedLeft = bottomLeft;
          actualPlacement = "bottom";
        } else if (fitsTop) {
          calculatedTop = topTop;
          calculatedLeft = topLeft;
          actualPlacement = "top";
        } else {
          calculatedTop = bottomTop;
          calculatedLeft = bottomLeft;
          actualPlacement = "bottom";
        }
      } else {
        if (fitsLeft) {
          calculatedTop = leftTop;
          calculatedLeft = leftLeft;
          actualPlacement = "left";
        } else if (fitsBottom) {
          calculatedTop = bottomTop;
          calculatedLeft = bottomLeft;
          actualPlacement = "bottom";
        } else if (fitsTop) {
          calculatedTop = topTop;
          calculatedLeft = topLeft;
          actualPlacement = "top";
        } else {
          calculatedTop = bottomTop;
          calculatedLeft = bottomLeft;
          actualPlacement = "bottom";
        }
      }

      setTooltipPos({
        top: calculatedTop,
        left: calculatedLeft,
        placement: actualPlacement,
      });
    });

    return () => {
      if (animId !== null) cancelAnimationFrame(animId);
    };
  }, [targetRect, currentStep]);

  if (!isActive || !currentStep || currentStep.type === "welcome" || currentStep.type === "completion") {
    return null;
  }

  const isActionStep = currentStep.type === "action";
  const breathingSpace = 8; // 8px breathing space as per prompt

  return (
    <div className="tutorial-overlay-container" aria-live="polite">
      {/* 1. Backdrop Dim Overlay (~48% dark overlay when no spotlight, transparent when spotlight frame handles cutout) */}
      <div
        className={`tutorial-backdrop ${isActionStep ? "is-action-step" : ""} ${targetRect ? "has-spotlight" : ""}`}
        onClick={isActionStep ? undefined : skipTutorial}
      />

      {/* 2. Spotlight Cutout / Ring around Target */}
      {targetRect ? (
        <div
          className={`tutorial-spotlight-frame ${isActionStep ? "has-pulse" : ""}`}
          style={{
            top: targetRect.top - breathingSpace,
            left: targetRect.left - breathingSpace,
            width: targetRect.width + breathingSpace * 2,
            height: targetRect.height + breathingSpace * 2,
          }}
        >
          {isActionStep ? <div className="tutorial-action-pulse-ring" /> : null}
        </div>
      ) : null}

      {/* 3. Tooltip Card */}
      <div
        className={`tutorial-tooltip placement-${tooltipPos.placement}`}
        ref={tooltipRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tutorial-step-title"
        aria-describedby="tutorial-step-body"
        style={{
          top: tooltipPos.top,
          left: tooltipPos.left,
        }}
      >
        <div className="tutorial-tooltip-header">
          <span className="tutorial-tooltip-eyebrow">
            <Sparkles size={13} className="tutorial-sparkle-icon" />
            {currentStep.eyebrow || `BƯỚC ${currentStep.stepNumber || currentStepIndex} / ${currentStep.totalSteps || 9}`}
          </span>
          <button
            type="button"
            className="tutorial-close-btn"
            onClick={skipTutorial}
            aria-label="Thoát hướng dẫn"
            title="Thoát hướng dẫn (Esc)"
          >
            <X size={15} />
          </button>
        </div>

        <h3 id="tutorial-step-title" className="tutorial-tooltip-title">
          {currentStep.title}
        </h3>

        <p id="tutorial-step-body" className="tutorial-tooltip-body">
          {currentStep.body}
        </p>

        {!targetFound && currentStep.target ? (
          <div className="tutorial-target-fallback-hint">
            <small>Đang ở chế độ tổng quan. Bạn có thể nhấn Tiếp tục để chuyển bước.</small>
          </div>
        ) : null}

        <div className="tutorial-tooltip-footer">
          <div className="tutorial-progress-indicator">
            <span className="tutorial-step-dots">
              {Array.from({ length: currentStep.totalSteps || 9 }).map((_, idx) => (
                <span
                  key={idx}
                  className={`tutorial-dot ${
                    (currentStep.stepNumber ?? currentStepIndex) === idx + 1
                      ? "is-active"
                      : (currentStep.stepNumber ?? currentStepIndex) > idx + 1
                        ? "is-completed"
                        : ""
                  }`}
                />
              ))}
            </span>
          </div>

          <div className="tutorial-tooltip-actions">
            {currentStepIndex > 1 ? (
              <button
                type="button"
                className="tutorial-btn-back"
                onClick={prevStep}
              >
                <ArrowLeft size={13} /> Quay lại
              </button>
            ) : null}

            <button
              type="button"
              className="tutorial-btn-skip"
              onClick={skipTutorial}
            >
              Bỏ qua
            </button>

            {/* In ACTION steps: do NOT show primary "Next" button unless target is not found (fallback) */}
            {!isActionStep || !targetFound ? (
              <button
                type="button"
                className="tutorial-btn-next"
                onClick={nextStep}
              >
                Tiếp tục <ArrowRight size={13} />
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
