"use client";

import {
  AlertCircle,
  Boxes,
  ClipboardList,
  LogOut,
  Store,
  Truck,
  User,
} from "lucide-react";
import type { UserSession } from "../../../lib/auth";

export type StaffTabKey = "today" | "receiving" | "counts" | "issues";

export interface StaffNavigationProps {
  activeTab: StaffTabKey;
  onSelectTab: (tab: StaffTabKey) => void;
  session: UserSession;
  onLogout: () => void;
}

export const STAFF_NAV_ITEMS: Array<{
  key: StaffTabKey;
  label: string;
  icon: typeof ClipboardList;
}> = [
  { key: "today", label: "Hôm nay", icon: ClipboardList },
  { key: "receiving", label: "Nhận hàng", icon: Truck },
  { key: "counts", label: "Kiểm kho", icon: Boxes },
  { key: "issues", label: "Báo vấn đề", icon: AlertCircle },
];

export function StaffSidebar({
  activeTab,
  onSelectTab,
  session,
  onLogout,
}: StaffNavigationProps) {
  return (
    <aside className="staff-sidebar" aria-label="Thanh điều hướng Chi nhánh">
      {/* Brand Header */}
      <div className="staff-brand">
        <div className="staff-brand-badge">
          <i>SC</i>
        </div>
        <div className="staff-brand-text">
          <span className="staff-brand-title">ShelfCash</span>
          <span className="staff-brand-sub">CHI NHÁNH</span>
        </div>
      </div>

      {/* Store Context */}
      <div className="staff-store-card">
        <div className="staff-store-icon">
          <Store size={15} />
        </div>
        <div className="staff-store-info">
          <span className="staff-store-label">Cửa hàng</span>
          <strong className="staff-store-name">{session.storeName}</strong>
        </div>
      </div>

      {/* Main Navigation Links */}
      <nav className="staff-nav-list" aria-label="Menu chức năng nhân viên">
        {STAFF_NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.key;
          return (
            <button
              key={item.key}
              type="button"
              className={`staff-nav-btn ${isActive ? "active" : ""}`}
              onClick={() => onSelectTab(item.key)}
              aria-current={isActive ? "page" : undefined}
            >
              <Icon size={18} className="staff-nav-icon" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Staff Profile & Logout at bottom */}
      <div className="staff-footer-section">
        <div className="staff-user-badge">
          <div className="staff-user-avatar">
            <User size={15} />
          </div>
          <div className="staff-user-details">
            <span className="staff-user-name">{session.name}</span>
            <span className="staff-user-role">{session.roleLabel || "Nhân viên chi nhánh"}</span>
          </div>
        </div>
        <button
          type="button"
          className="staff-logout-btn"
          onClick={onLogout}
          title="Đăng xuất khỏi phiên làm việc"
        >
          <LogOut size={16} />
          <span>Đăng xuất</span>
        </button>
      </div>
    </aside>
  );
}

export function StaffBottomNav({
  activeTab,
  onSelectTab,
}: {
  activeTab: StaffTabKey;
  onSelectTab: (tab: StaffTabKey) => void;
}) {
  return (
    <nav className="staff-bottom-nav" aria-label="Thanh điều hướng di động">
      {STAFF_NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        const isActive = activeTab === item.key;
        return (
          <button
            key={item.key}
            type="button"
            className={`staff-bottom-btn ${isActive ? "active" : ""}`}
            onClick={() => onSelectTab(item.key)}
            aria-current={isActive ? "page" : undefined}
          >
            <Icon size={20} className="staff-bottom-icon" />
            <span className="staff-bottom-label">{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
