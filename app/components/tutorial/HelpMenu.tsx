"use client";

import React, { useEffect, useRef, useState } from "react";
import { Compass, HelpCircle, ChevronDown } from "lucide-react";
import { useTutorial } from "./TutorialContext";

export function HelpMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const { replayTutorial } = useTutorial();
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleOutsideClick);
    }
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [isOpen]);

  const handleStartTour = () => {
    setIsOpen(false);
    replayTutorial();
  };

  return (
    <div className="help-menu-container" ref={menuRef}>
      <button
        type="button"
        className="help-menu-trigger-btn"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        aria-haspopup="true"
        aria-label="Menu trợ giúp"
      >
        <HelpCircle size={15} />
        <span>Trợ giúp</span>
        <ChevronDown size={13} className={`help-chevron ${isOpen ? "is-open" : ""}`} />
      </button>

      {isOpen ? (
        <div className="help-menu-dropdown" role="menu">
          <button
            type="button"
            className="help-menu-item"
            role="menuitem"
            onClick={handleStartTour}
          >
            <Compass size={15} />
            <div className="help-menu-item-text">
              <strong>Tham quan ShelfCash</strong>
              <small>Thử quy trình nhập hàng hoàn chỉnh (dữ liệu mẫu)</small>
            </div>
          </button>
        </div>
      ) : null}
    </div>
  );
}
