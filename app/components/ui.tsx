"use client";

import {
  AlertCircle,
  CheckCircle2,
  LoaderCircle,
  X,
} from "lucide-react";
import { forwardRef, useEffect, useId, useRef, useState } from "react";
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

/**
 * Định dạng chuỗi nhập số tiền tự động thêm dấu phẩy phân tách hàng nghìn (ví dụ: 5000000 -> "5,000,000")
 */
export function formatMoneyInput(raw: string): string {
  const digitsOnly = raw.replace(/\D/g, "");
  if (!digitsOnly) return "";
  const num = Number(digitsOnly);
  if (!Number.isFinite(num)) return "";
  return num.toLocaleString("en-US");
}

/**
 * Chuyển chuỗi đã định dạng dấu phẩy trở lại thành số nguyên (ví dụ: "5,000,000" -> 5000000)
 */
export function parseMoneyInput(value: string): number | undefined {
  const clean = value.replace(/,/g, "").trim();
  if (clean === "") return undefined;
  const num = Number(clean);
  return Number.isFinite(num) ? num : undefined;
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
  description,
  guidance,
  action,
}: {
  title: string;
  subtitle?: string;
  description?: string;
  guidance?: ReactNode;
  action?: ReactNode;
}) {
  const text = subtitle ?? description;
  return (
    <div className="section-heading">
      <div>
        <h2>
          <span className="section-heading-title">{title}</span>
          {guidance}
        </h2>
        {text ? <p>{text}</p> : null}
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

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: "primary" | "secondary" | "quiet" | "danger";
    busy?: boolean;
  }
>(function Button(
  {
    variant = "secondary",
    busy = false,
    children,
    className,
    disabled,
    ...props
  },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cn("button", `button-${variant}`, className)}
      disabled={disabled || busy}
      {...props}
    >
      {busy ? <LoaderCircle size={16} className="spin" /> : null}
      {children}
    </button>
  );
});

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

export function GuidanceHint({
  content,
  label = "Xem hướng dẫn",
  defaultOpen = false,
}: {
  content: ReactNode;
  label?: string;
  defaultOpen?: boolean;
}) {
  const id = useId();
  const ref = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <span
      className="guidance-hint"
      ref={ref}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        aria-describedby={open ? id : undefined}
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((current) => !current)}
        onFocus={() => setOpen(true)}
        onPointerDown={(event) => event.preventDefault()}
        type="button"
      >
        !
      </button>
      {open ? <span id={id} role="tooltip">{content}</span> : null}
    </span>
  );
}

export function InfoTip({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return <GuidanceHint content={children} label={label} />;
}

export function Confidence({
  title,
  detail,
}: {
  title: string;
  detail?: string;
}) {
  return (
    <div className="confidence">
      <span>{title}</span>
      {detail ? <strong>{detail}</strong> : null}
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
  id,
}: {
  tone: "success" | "warning" | "error" | "info";
  children: ReactNode;
  id?: string;
}) {
  return (
    <div id={id} className={`notice notice-${tone}`}>
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
