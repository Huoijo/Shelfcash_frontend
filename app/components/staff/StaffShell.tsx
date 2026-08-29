"use client";

import { LogOut, Store } from "lucide-react";
import { useState } from "react";
import type { UserSession } from "../../../lib/auth";
import { StaffInventoryCountView } from "../../views/staff/StaffInventoryCountView";
import { StaffIssueReportView } from "../../views/staff/StaffIssueReportView";
import { StaffReceivingView } from "../../views/staff/StaffReceivingView";
import { StaffTodayView } from "../../views/staff/StaffTodayView";
import {
  StaffBottomNav,
  StaffSidebar,
  type StaffTabKey,
} from "./StaffNavigation";

export interface StaffShellProps {
  session: UserSession;
  onLogout: () => void;
}

export function StaffShell({ session, onLogout }: StaffShellProps) {
  const [activeTab, setActiveTab] = useState<StaffTabKey>("today");

  const renderActiveView = () => {
    switch (activeTab) {
      case "today":
        return <StaffTodayView session={session} onNavigateTab={setActiveTab} />;
      case "receiving":
        return <StaffReceivingView session={session} />;
      case "counts":
        return <StaffInventoryCountView session={session} />;
      case "issues":
        return <StaffIssueReportView session={session} />;
      default:
        return <StaffTodayView session={session} onNavigateTab={setActiveTab} />;
    }
  };

  return (
    <div className="staff-shell-root">
      {/* ── DESKTOP SIDEBAR ── */}
      <StaffSidebar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        session={session}
        onLogout={onLogout}
      />

      {/* ── MOBILE HEADER ── */}
      <header className="staff-mobile-top-header" aria-label="Tiêu đề di động">
        <div className="staff-mobile-brand">
          <div className="staff-brand-badge-small">
            <i>SC</i>
          </div>
          <div className="staff-mobile-title-wrap">
            <span className="staff-mobile-title">ShelfCash Chi nhánh</span>
            <span className="staff-mobile-store">{session.storeName}</span>
          </div>
        </div>
        <button
          type="button"
          className="staff-mobile-logout"
          onClick={onLogout}
          aria-label="Đăng xuất"
          title="Đăng xuất"
        >
          <LogOut size={18} />
        </button>
      </header>

      {/* ── MAIN CONTENT WORKSPACE ── */}
      <main className="staff-main-content" tabIndex={-1}>
        {renderActiveView()}
      </main>

      {/* ── MOBILE BOTTOM NAVIGATION ── */}
      <StaffBottomNav activeTab={activeTab} onSelectTab={setActiveTab} />
    </div>
  );
}
