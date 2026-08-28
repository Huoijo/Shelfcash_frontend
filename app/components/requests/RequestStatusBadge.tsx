"use client";

import type { ManagedRequestStatus } from "../../../lib/request-manager/types";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Clock,
  HelpCircle,
  Loader2,
  Send,
  XCircle,
} from "lucide-react";

export function RequestStatusBadge({ status }: { status: ManagedRequestStatus }) {
  switch (status) {
    case "submitting":
      return (
        <span className="req-status-badge submitting">
          <Send size={12} /> Đang gửi
        </span>
      );
    case "accepted":
      return (
        <span className="req-status-badge accepted">
          <Clock size={12} /> Đã tiếp nhận
        </span>
      );
    case "processing":
      return (
        <span className="req-status-badge processing">
          <Loader2 size={12} className="animate-spin" /> Đang xử lý
        </span>
      );
    case "waiting":
      return (
        <span className="req-status-badge waiting">
          <Clock size={12} /> Chờ dữ liệu
        </span>
      );
    case "completed":
      return (
        <span className="req-status-badge completed">
          <CheckCircle2 size={12} /> Hoàn thành
        </span>
      );
    case "failed":
      return (
        <span className="req-status-badge failed">
          <XCircle size={12} /> Thất bại
        </span>
      );
    case "client_timeout":
      return (
        <span className="req-status-badge timeout">
          <AlertTriangle size={12} /> Đã dừng chờ tự động
        </span>
      );
    case "delivery_unknown":
      return (
        <span className="req-status-badge unknown">
          <HelpCircle size={12} /> Chưa rõ gửi thành công
        </span>
      );
    case "cancelled":
      return (
        <span className="req-status-badge cancelled">
          <AlertCircle size={12} /> Đã hủy
        </span>
      );
    default:
      return <span className="req-status-badge default">{status}</span>;
  }
}
