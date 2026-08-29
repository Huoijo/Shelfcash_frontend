"use client";

import { Boxes, CheckSquare } from "lucide-react";
import type { UserSession } from "../../../lib/auth";

interface StaffInventoryCountViewProps {
  session: UserSession;
}

export function StaffInventoryCountView({ session }: StaffInventoryCountViewProps) {
  return (
    <div className="staff-view-container">
      <header className="staff-view-header">
        <div className="staff-header-info">
          <h1 className="staff-view-title">KIỂM KHO</h1>
          <p className="staff-view-subtitle">Kiểm kê số lượng thực tế theo phiên chỉ định</p>
        </div>
      </header>

      <section className="staff-content-card" aria-label="Danh sách phiên kiểm kho">
        <div className="staff-empty-state">
          <div className="staff-empty-icon">
            <Boxes size={28} />
          </div>
          <h2 className="staff-empty-title">Chưa có phiên kiểm kho</h2>
          <p className="staff-empty-description">
            Hiện không có lịch kiểm kê tồn kho nào được chỉ định cho ca làm việc này.
          </p>
        </div>
      </section>
    </div>
  );
}
