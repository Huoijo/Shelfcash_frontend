"use client";

import { PackageCheck, Truck } from "lucide-react";
import type { UserSession } from "../../../lib/auth";

interface StaffReceivingViewProps {
  session: UserSession;
}

export function StaffReceivingView({ session }: StaffReceivingViewProps) {
  return (
    <div className="staff-view-container">
      <header className="staff-view-header">
        <div className="staff-header-info">
          <h1 className="staff-view-title">NHẬN HÀNG</h1>
          <p className="staff-view-subtitle">Xác nhận hàng thực nhận từ đơn mua hàng</p>
        </div>
      </header>

      <section className="staff-content-card" aria-label="Danh sách đơn nhận hàng">
        <div className="staff-empty-state">
          <div className="staff-empty-icon">
            <Truck size={28} />
          </div>
          <h2 className="staff-empty-title">Chưa có lịch nhận hàng</h2>
          <p className="staff-empty-description">
            Hiện không có đơn đặt hàng nào dự kiến giao đến chi nhánh trong hôm nay.
          </p>
        </div>
      </section>
    </div>
  );
}
