"use client";

import { useState } from "react";
import type { ManagedRequest } from "../../../lib/request-manager/types";
import { AlertCircle, ChevronDown, ChevronUp, Copy, Check } from "lucide-react";

export function RequestErrorDetail({ request }: { request: ManagedRequest }) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const error = request.error;
  if (!error && request.status !== "failed" && request.status !== "client_timeout") {
    return null;
  }

  const requestId = error?.requestId || request.serverRequestId || request.clientRequestId;

  const handleCopy = () => {
    if (requestId) {
      navigator.clipboard.writeText(requestId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="request-error-detail-box">
      <div className="error-main-row">
        <AlertCircle size={16} className="text-danger flex-shrink-0" />
        <div className="error-text-content">
          <strong className="error-code-badge">{error?.code || "ERROR"}</strong>
          <p className="error-message-text">{error?.message || "Đã xảy ra lỗi khi thực thi yêu cầu."}</p>
        </div>
      </div>

      <div className="error-actions-row">
        {requestId ? (
          <div className="request-id-pill">
            <span>Mã yêu cầu: <code>{requestId}</code></span>
            <button
              type="button"
              className="copy-id-btn"
              onClick={handleCopy}
              title="Sao chép mã yêu cầu"
            >
              {copied ? <Check size={12} className="text-success" /> : <Copy size={12} />}
            </button>
          </div>
        ) : null}

        <button
          type="button"
          className="toggle-tech-details-btn"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? (
            <>
              Thu gọn chi tiết <ChevronUp size={13} />
            </>
          ) : (
            <>
              Xem chi tiết kỹ thuật <ChevronDown size={13} />
            </>
          )}
        </button>
      </div>

      {expanded ? (
        <div className="error-technical-panel">
          <div className="tech-meta-row">
            <span><strong>HTTP Status:</strong> {request.httpStatus || "N/A"}</span>
            <span><strong>Method:</strong> {request.method}</span>
            <span><strong>Endpoint:</strong> {request.endpoint}</span>
          </div>
          <div className="tech-meta-row">
            <span><strong>Backend URL:</strong> {request.backendBaseUrl || "Default Proxy"}</span>
            <span><strong>Tạo lúc:</strong> {new Date(request.createdAt).toLocaleString("vi-VN")}</span>
          </div>
          {error?.details ? (
            <div className="tech-details-json">
              <strong>Chi tiết phản hồi (details):</strong>
              <pre>{JSON.stringify(error.details, null, 2)}</pre>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
