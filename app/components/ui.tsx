"use client";

import {
  AlertCircle,
  CheckCircle2,
  CircleHelp,
  LoaderCircle,
  X,
} from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import type { InventoryStatus } from "../../lib/types";

export function cn(
  ...values: Array<string | false | null | undefined>
): string {
  return values.filter(Boolean).join(" ");
}

export function formatVnd(value: number): string {
  return `${Math.round(value).toLocaleString("vi-VN")} ₫`;
}

export function formatQuantity(value: number, unit = ""): string {
  const digits = Math.abs(value - Math.round(value)) < 0.001 ? 0 : 2;
  return `${value.toLocaleString("vi-VN", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}${unit ? ` ${unit}` : ""}`;
}

export function formatDate(value: string): string {
  const [year, month, day] = value.slice(0, 10).split("-");
  return `${day}/${month}/${year}`;
}

export function PageHeader({
  title,
  subtitle,
  context,
  action,
}: {
  title: string;
  subtitle?: string;
  context?: string;
  action?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div className="page-header-copy">
        <h1>{title}</h1>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
      {action || context ? (
        <div className="page-header-side">
          {action}
          {context ? <span className="page-header-context">{context}</span> : null}
        </div>
      ) : null}
    </header>
  );
}

export function SectionHeading({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="section-heading">
      <div>
        <h2>{title}</h2>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}

export type StatCardStatus =
  | "neutral"
  | "success"
  | "warning"
  | "danger"
  | "info";

export type StatCardProps = {
  label: string;
  value: ReactNode;
  description?: string;
  status?: StatCardStatus;
  icon?: ReactNode;
  loading?: boolean;
  className?: string;
  children?: ReactNode;
};

export function StatCard({
  label,
  value,
  description,
  status = "neutral",
  icon,
  loading = false,
  className,
  children,
}: StatCardProps) {
  return (
    <article
      className={cn("stat-card", `stat-card-${status}`, className)}
      aria-busy={loading || undefined}
    >
      <div className="stat-card-label">
        <span>{label}</span>
        {icon ? (
          <span className="stat-card-icon">{icon}</span>
        ) : (
          <i aria-hidden="true" />
        )}
      </div>
      <strong>
        {loading ? (
          <span className="stat-card-skeleton" aria-label="Đang tải" />
        ) : value == null ? (
          "—"
        ) : (
          value
        )}
      </strong>
      {description ? <small>{description}</small> : null}
      {children}
    </article>
  );
}

export function SummaryGrid({
  children,
  columns,
  className,
}: {
  children: ReactNode;
  columns?: 2 | 3 | 4 | 5;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "summary-grid",
        columns && `summary-grid-${columns}`,
        className,
      )}
    >
      {children}
    </div>
  );
}

export function Metric({
  label,
  value,
  note,
  tone = "pine",
}: {
  label: string;
  value: ReactNode;
  note: string;
  tone?: "pine" | "red" | "amber" | "blue";
}) {
  const status: StatCardStatus =
    tone === "red"
      ? "danger"
      : tone === "amber"
        ? "warning"
        : tone === "blue"
          ? "info"
          : "neutral";
  return (
    <StatCard
      label={label}
      value={value}
      description={note}
      status={status}
    />
  );
}

export function StatusPill({
  status,
  label,
}: {
  status: InventoryStatus;
  label: string;
}) {
  return <span className={`status-pill status-${status}`}>{label}</span>;
}

export function Button({
  variant = "secondary",
  busy = false,
  children,
  className,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "quiet" | "danger";
  busy?: boolean;
}) {
  return (
    <button
      className={cn("button", `button-${variant}`, className)}
      disabled={disabled || busy}
      {...props}
    >
      {busy ? <LoaderCircle size={16} className="spin" /> : null}
      {children}
    </button>
  );
}

export function AlertRow({
  title,
  body,
  tone = "pine",
  onClick,
}: {
  title: string;
  body?: ReactNode;
  tone?: "pine" | "red" | "amber" | "blue";
  onClick?: () => void;
}) {
  const content = (
    <>
      <i aria-hidden="true" className={`alert-accent alert-${tone}`} />
      <span>
        <strong>{title}</strong>
        {body ? <small>{body}</small> : null}
      </span>
    </>
  );
  if (onClick) {
    return (
      <button className="alert-row alert-row-button" onClick={onClick}>
        {content}
      </button>
    );
  }
  return <div className="alert-row">{content}</div>;
}

export function InfoTip({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <details className="info-tip">
      <summary aria-label={label}>
        <CircleHelp aria-hidden="true" size={17} />
      </summary>
      <span role="tooltip">{children}</span>
    </details>
  );
}

export function Confidence({
  title,
  detail,
}: {
  title: string;
  detail: string;
}) {
  return (
    <div className="confidence">
      <span>{title}</span>
      <strong>{detail}</strong>
    </div>
  );
}

export function Details({
  summary,
  children,
  open,
}: {
  summary: string;
  children: ReactNode;
  open?: boolean;
}) {
  return (
    <details className="details" open={open}>
      <summary>{summary}</summary>
      <div className="details-body">{children}</div>
    </details>
  );
}

export function Notice({
  tone,
  children,
}: {
  tone: "success" | "warning" | "error" | "info";
  children: ReactNode;
}) {
  return (
    <div className={`notice notice-${tone}`}>
      {tone === "success" ? (
        <CheckCircle2 size={17} />
      ) : (
        <AlertCircle size={17} />
      )}
      <span>{children}</span>
    </div>
  );
}

export function Toast({
  message,
  tone,
  onClose,
}: {
  message: string;
  tone: "success" | "error";
  onClose: () => void;
}) {
  return (
    <div className={`toast toast-${tone}`} role="status">
      {tone === "success" ? (
        <CheckCircle2 size={18} />
      ) : (
        <AlertCircle size={18} />
      )}
      <span>{message}</span>
      <button aria-label="Đóng thông báo" onClick={onClose}>
        <X size={16} />
      </button>
    </div>
  );
}

export function TabList<T extends string>({
  items,
  value,
  onChange,
}: {
  items: readonly T[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="tab-list" role="tablist">
      {items.map((item) => (
        <button
          key={item}
          role="tab"
          aria-selected={value === item}
          className={value === item ? "active" : ""}
          onClick={() => onChange(item)}
        >
          {item}
        </button>
      ))}
    </div>
  );
}
