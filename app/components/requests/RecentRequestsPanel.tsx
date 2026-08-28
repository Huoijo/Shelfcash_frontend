"use client";

import { useState } from "react";
import type { ManagedRequest, ManagedRequestKind } from "../../../lib/request-manager/types";
import { useRecentRequests, useRequestManager } from "../../../lib/request-manager/use-request-manager";
import { RequestStatusBadge } from "./RequestStatusBadge";
import { RequestErrorDetail } from "./RequestErrorDetail";
import {
  Activity,
  ChevronDown,
  ChevronUp,
  Clock,
  EyeOff,
  FileSpreadsheet,
  Layers,
  RefreshCw,
  Server,
} from "lucide-react";

export function RecentRequestsPanel({
  kind,
  title = "Yêu cầu gần đây",
  onCheckStatus,
}: {
  kind?: ManagedRequestKind;
  title?: string;
  onCheckStatus?: (request: ManagedRequest) => Promise<void>;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [checkingId, setCheckingId] = useState<string | null>(null);
  const requests = useRecentRequests(kind, 6);
  const { hideRequest } = useRequestManager();

  if (!requests.length) {
    return null;
  }

  const handleCheck = async (req: ManagedRequest) => {
    if (!onCheckStatus) return;
    setCheckingId(req.clientRequestId);
    try {
      await onCheckStatus(req);
    } finally {
      setCheckingId(null);
    }
  };

  return (
    <section className="recent-requests-panel" aria-label="Lịch sử yêu cầu gần đây">
      <div className="recent-requests-header" onClick={() => setCollapsed(!collapsed)}>
        <div className="header-left">
          <Activity size={16} className="text-accent" />
          <h3>{title}</h3>
          <span className="count-pill">{requests.length}</span>
        </div>
        <button
          type="button"
          className="collapse-toggle-btn"
          aria-expanded={!collapsed}
          aria-label={collapsed ? "Mở rộng danh sách" : "Thu gọn danh sách"}
        >
          {collapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
        </button>
      </div>

      {!collapsed ? (
        <div className="recent-requests-list">
          {requests.map((req) => {
            const isChecking = checkingId === req.clientRequestId;
            const timeStr = new Date(req.createdAt).toLocaleTimeString("vi-VN", {
              hour: "2-digit",
              minute: "2-digit",
            });
            const dateStr = new Date(req.createdAt).toLocaleDateString("vi-VN", {
              day: "2-digit",
              month: "2-digit",
            });

            return (
              <article key={req.clientRequestId} className={`recent-request-card status-${req.status}`}>
                <div className="card-top-row">
                  <div className="req-identifier">
                    {req.fileMetadata ? (
                      <FileSpreadsheet size={15} className="req-kind-icon" />
                    ) : (
                      <Layers size={15} className="req-kind-icon" />
                    )}
                    <strong className="req-title" title={req.displayLabel || req.fileMetadata?.name || req.kind}>
                      {req.displayLabel || req.fileMetadata?.name || `Yêu cầu ${req.kind}`}
                    </strong>
                  </div>
                  <RequestStatusBadge status={req.status} />
                </div>

                <div className="card-meta-row">
                  <span className="req-time">
                    <Clock size={12} /> {timeStr} ({dateStr})
                  </span>
                  {req.backendBaseUrl ? (
                    <span className="req-server" title={`Backend: ${req.backendBaseUrl}`}>
                      <Server size={12} /> {req.backendBaseUrl.replace(/^https?:\/\//, "")}
                    </span>
                  ) : null}
                </div>

                {req.error || req.status === "failed" || req.status === "client_timeout" ? (
                  <RequestErrorDetail request={req} />
                ) : null}

                <div className="card-bottom-actions">
                  {onCheckStatus && (req.status === "processing" || req.status === "waiting" || req.status === "client_timeout" || req.status === "delivery_unknown") ? (
                    <button
                      type="button"
                      className="btn-check-status"
                      onClick={() => handleCheck(req)}
                      disabled={isChecking}
                    >
                      <RefreshCw size={13} className={isChecking ? "animate-spin" : ""} />
                      {isChecking ? "Đang kiểm tra..." : "Kiểm tra trạng thái"}
                    </button>
                  ) : null}

                  <button
                    type="button"
                    className="btn-hide-request"
                    onClick={() => hideRequest(req.clientRequestId)}
                    title="Ẩn yêu cầu này khỏi danh sách"
                  >
                    <EyeOff size={13} /> Ẩn
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
