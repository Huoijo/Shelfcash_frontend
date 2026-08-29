"use client";

import { AlertCircle, FileText, Send } from "lucide-react";
import { useState } from "react";
import type { UserSession } from "../../../lib/auth";

interface StaffIssueReportViewProps {
  session: UserSession;
}

export function StaffIssueReportView({ session }: StaffIssueReportViewProps) {
  const [issueType, setIssueType] = useState<string>("stock_mismatch");
  const [ingredientName, setIngredientName] = useState<string>("");
  const [observedQuantity, setObservedQuantity] = useState<string>("");
  const [description, setDescription] = useState<string>("");

  return (
    <div className="staff-view-container">
      <header className="staff-view-header">
        <div className="staff-header-info">
          <h1 className="staff-view-title">BÁO VẤN ĐỀ</h1>
          <p className="staff-view-subtitle">Gửi báo cáo bất thường vận hành đến quản lý cửa hàng</p>
        </div>
      </header>

      {/* ── REPORT FORM SHELL ── */}
      <section className="staff-content-card" aria-label="Biểu mẫu báo cáo vấn đề">
        <h2 className="staff-section-title">Tạo báo cáo mới</h2>
        <form className="staff-issue-form" onSubmit={(e) => e.preventDefault()}>
          <div className="staff-form-row">
            <label className="staff-form-label">
              <span>Loại vấn đề</span>
              <select
                className="staff-select-input"
                value={issueType}
                onChange={(e) => setIssueType(e.target.value)}
              >
                <option value="stock_mismatch">Lệch tồn kho thực tế</option>
                <option value="damaged_goods">Hàng hỏng / đổ vỡ</option>
                <option value="expired_goods">Hàng hết hạn sử dụng</option>
                <option value="delivery_shortage">Giao thiếu số lượng</option>
                <option value="wrong_item">Giao sai mặt hàng</option>
                <option value="stockout">Hết hàng đột xuất</option>
                <option value="other">Vấn đề khác</option>
              </select>
            </label>
          </div>

          <div className="staff-form-row staff-form-grid-2">
            <label className="staff-form-label">
              <span>Nguyên liệu / Mặt hàng liên quan</span>
              <input
                type="text"
                className="staff-text-input"
                placeholder="VD: Sữa tươi, Cam, Trà đen..."
                value={ingredientName}
                onChange={(e) => setIngredientName(e.target.value)}
              />
            </label>

            <label className="staff-form-label">
              <span>Số lượng ghi nhận thực tế</span>
              <input
                type="text"
                className="staff-text-input"
                placeholder="VD: 0 L, 2 kg..."
                value={observedQuantity}
                onChange={(e) => setObservedQuantity(e.target.value)}
              />
            </label>
          </div>

          <div className="staff-form-row">
            <label className="staff-form-label">
              <span>Mô tả chi tiết</span>
              <textarea
                className="staff-textarea-input"
                rows={3}
                placeholder="Mô tả hiện trạng thực tế tại quầy hoặc kho..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </label>
          </div>

          <div className="staff-form-actions">
            <button
              type="button"
              className="staff-submit-button"
              disabled
              title="Tính năng đang được kết nối với hệ thống quản lý"
            >
              <Send size={15} />
              <span>Gửi báo cáo</span>
            </button>
            <span className="staff-form-hint">
              Hệ thống sẽ ghi nhận và thông báo cho Quản lý cửa hàng.
            </span>
          </div>
        </form>
      </section>

      {/* ── HISTORY EMPTY STATE ── */}
      <section className="staff-content-card" aria-label="Lịch sử báo cáo">
        <h2 className="staff-section-title">Lịch sử báo cáo gần đây</h2>
        <div className="staff-empty-state">
          <div className="staff-empty-icon">
            <FileText size={28} />
          </div>
          <h3 className="staff-empty-title">Chưa có báo cáo nào</h3>
          <p className="staff-empty-description">
            Các vấn đề được báo cáo trong ca làm việc sẽ được liệt kê tại đây.
          </p>
        </div>
      </section>
    </div>
  );
}
