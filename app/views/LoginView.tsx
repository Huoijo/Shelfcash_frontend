"use client";

import {
  ArrowRight,
  Eye,
  EyeOff,
  Lock,
  User,
} from "lucide-react";
import { useState } from "react";
import type { PortalMode, UserSession } from "../../lib/auth";

interface LoginViewProps {
  onLogin: (session: UserSession) => void;
}

export function LoginView({ onLogin }: LoginViewProps) {
  const [portalMode, setPortalMode] = useState<PortalMode>("manager");
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("••••••••");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!username.trim()) {
      setErrorMessage("Vui lòng nhập tên đăng nhập.");
      return;
    }
    if (!password.trim()) {
      setErrorMessage("Vui lòng nhập mật khẩu.");
      return;
    }

    setBusy(true);
    setErrorMessage(null);

    setTimeout(() => {
      if (portalMode === "staff") {
        onLogin({
          userId: "user-staff-01",
          name: username === "staff" || username === "admin" ? "Nguyễn Văn A" : (username.includes("@") ? username.split("@")[0] : username),
          email: username.includes("@") ? username : `${username}@shelfcash.vn`,
          role: "store_staff",
          roleLabel: "Nhân viên chi nhánh",
          portal: "staff",
          allowedPortals: ["staff"],
          permissions: [
            "STAFF_VIEW_TASKS",
            "STAFF_RECEIVE_GOODS",
            "STAFF_COUNT_INVENTORY",
            "STAFF_REPORT_ISSUE",
          ],
          storeId: "STORE_001",
          storeName: "ShelfCash Flagship Coffee & Tea",
          mode: "mock",
          loggedInAt: new Date().toISOString(),
        });
      } else {
        onLogin({
          userId: "user-01",
          name: username === "admin" ? "Nguyễn Minh Tuấn" : (username.includes("@") ? username.split("@")[0] : username),
          email: username.includes("@") ? username : `${username}@shelfcash.vn`,
          role: "store_manager",
          roleLabel: "Quản lý cửa hàng",
          portal: "manager",
          allowedPortals: ["manager"],
          permissions: ["ALL"],
          storeId: "STORE_001",
          storeName: "ShelfCash Flagship Coffee & Tea",
          mode: "mock",
          loggedInAt: new Date().toISOString(),
        });
      }
      setBusy(false);
    }, 200);
  };

  return (
    <div className="login-page-bg">
      <div className="login-card">
        {/* Brand Header */}
        <div className="login-card-header">
          <div className="login-brand-badge">
            <i>SC</i>
          </div>
          <h1 className="login-title">ShelfCash</h1>
          <p className="login-subtitle">
            Hệ thống Dự báo Nhu cầu & Quyết định Nhập hàng
          </p>
        </div>

        {/* Portal Switch */}
        <div className="login-portal-switch-container">
          <div className="login-portal-switch" role="tablist" aria-label="Chọn giao diện đăng nhập">
            <button
              type="button"
              role="tab"
              aria-selected={portalMode === "manager"}
              className={`portal-switch-btn ${portalMode === "manager" ? "active" : ""}`}
              onClick={() => {
                setPortalMode("manager");
                if (username === "staff") setUsername("admin");
              }}
            >
              Quản lý
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={portalMode === "staff"}
              className={`portal-switch-btn ${portalMode === "staff" ? "active" : ""}`}
              onClick={() => {
                setPortalMode("staff");
                if (username === "admin") setUsername("staff");
              }}
            >
              Nhân viên
            </button>
          </div>
        </div>

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="login-form">
          {errorMessage && (
            <div className="login-alert-box">{errorMessage}</div>
          )}

          <div className="login-form-group">
            <label className="login-label">Tên đăng nhập / Email</label>
            <div className="login-input-container">
              <User size={16} className="login-input-icon" />
              <input
                type="text"
                className="login-text-input"
                placeholder={portalMode === "staff" ? "staff" : "admin"}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoFocus
                required
              />
            </div>
          </div>

          <div className="login-form-group">
            <label className="login-label">Mật khẩu</label>
            <div className="login-input-container">
              <Lock size={16} className="login-input-icon" />
              <input
                type={showPassword ? "text" : "password"}
                className="login-text-input"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button
                type="button"
                className="login-pwd-toggle"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
              >
                {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            className="login-primary-button"
            disabled={busy}
          >
            {busy ? (
              <span>Đang đăng nhập...</span>
            ) : (
              <>
                <span>
                  {portalMode === "staff" ? "Đăng nhập Chi nhánh" : "Đăng nhập Quản lý"}
                </span>
                <ArrowRight size={16} />
              </>
            )}
          </button>
        </form>

        {/* Footer info */}
        <div className="login-card-footer">
          <span>ShelfCash · AI Supply & Inventory Intelligence</span>
        </div>
      </div>
    </div>
  );
}
