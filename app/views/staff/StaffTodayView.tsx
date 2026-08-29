"use client";

import { CheckCircle2, ClipboardList, Clock } from "lucide-react";
import type { UserSession } from "../../../lib/auth";

interface StaffTodayViewProps {
  session: UserSession;
  onNavigateTab?: (tab: "today" | "receiving" | "counts" | "issues") => void;
}

export function StaffTodayView({ session, onNavigateTab }: StaffTodayViewProps) {
  const currentDate = new Date().toLocaleDateString("vi-VN", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  return (
    <div className="staff-view-container">
      {/* ── HEADER ── */}
      <header className="staff-view-header">
        <div className="staff-header-info">
          <span className="staff-date-badge">{currentDate}</span>
          <h1 className="staff-view-title">HÔM NAY</h1>
          <p className="staff-view-subtitle">{session.storeName}</p>
        </div>
      </header>

      {/* ── EMPTY QUEUE ── */}
      <section className="staff-content-card" aria-label="Danh sách nhiệm vụ hôm nay">
        <div className="staff-empty-state">
          <div className="staff-empty-icon">
            <ClipboardList size={28} />
          </div>
          <h2 className="staff-empty-title">Không có nhiệm vụ để hiển thị</h2>
          <p className="staff-empty-description">
            Ca làm việc hiện tại chưa có nhiệm vụ nào cần xử lý.
          </p>
        </div>
      </section>
    </div>
  );
}
