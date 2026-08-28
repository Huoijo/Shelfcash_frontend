import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import {
  Confidence,
  GuidanceHint,
  PageHeader,
  SectionHeading,
  StatCard,
  SummaryGrid,
  formatMoneyInput,
  parseMoneyInput,
} from "../app/components/ui.tsx";

test("PageHeader renders cleanly with or without a description", () => {
  const withoutDescription = renderToStaticMarkup(
    <PageHeader title="Kho" />,
  );
  const withDescription = renderToStaticMarkup(
    <PageHeader title="Kho" subtitle="Chọn một dòng để xem chi tiết." />,
  );

  assert.match(withoutDescription, /<h1>Kho<\/h1>/);
  assert.doesNotMatch(withoutDescription, /<p>/);
  assert.match(withDescription, /Chọn một dòng để xem chi tiết\./);
});

test("SectionHeading does not reserve markup for an absent description", () => {
  const html = renderToStaticMarkup(<SectionHeading title="Nguyên liệu" />);

  assert.match(html, /section-heading-title">Nguyên liệu<\/span>/);
  assert.doesNotMatch(html, /<p>/);
});

test("StatCard renders its hierarchy, status and a numeric zero", () => {
  const html = renderToStaticMarkup(
    <StatCard
      label="Thiếu công thức"
      value={0}
      description="Chỉ tính món lẻ đang bán"
      status="warning"
    />,
  );

  assert.match(html, /class="stat-card stat-card-warning"/);
  assert.match(html, />Thiếu công thức</);
  assert.match(html, /<strong>0<\/strong>/);
  assert.match(html, />Chỉ tính món lẻ đang bán</);
});

test("StatCard safely handles optional content, loading and empty values", () => {
  const withoutDescription = renderToStaticMarkup(
    <StatCard label="Không có mô tả" value={12} />,
  );

  const empty = renderToStaticMarkup(
    <StatCard label="Chưa có dữ liệu" value={undefined} />,
  );
  const nullValue = renderToStaticMarkup(
    <StatCard label="Chưa đồng bộ" value={null} />,
  );
  const loading = renderToStaticMarkup(
    <StatCard label="Đang xử lý" value={undefined} loading status="info" />,
  );

  assert.doesNotMatch(withoutDescription, /<small>/);
  assert.match(empty, /<strong>—<\/strong>/);
  assert.match(nullValue, /<strong>—<\/strong>/);
  assert.match(loading, /aria-busy="true"/);
  assert.match(loading, /stat-card-skeleton/);
  assert.match(loading, /aria-label="Đang tải"/);
});

test("GuidanceHint exposes an accessible, keyboard-focusable guidance button", () => {
  const html = renderToStaticMarkup(
    <GuidanceHint
      content="Chọn một dòng để xem tồn kho, lô và lịch sử sử dụng."
      defaultOpen
      label="Xem hướng dẫn chọn nguyên liệu"
    />,
  );

  assert.match(
    html,
    /aria-label="Xem hướng dẫn chọn nguyên liệu"/,
  );
  assert.match(html, /<button/);
  assert.match(html, /type="button"/);
  assert.match(html, /role="tooltip"/);
  assert.match(html, /Chọn một dòng để xem tồn kho, lô và lịch sử sử dụng\./);
});

test("GuidanceHint supports tap toggling, focus, Escape and outside dismissal", () => {
  const source = readFileSync(
    new URL("../app/components/ui.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /onClick=\{\(\) => setOpen\(\(current\) => !current\)\}/);
  assert.match(source, /onFocus=\{\(\) => setOpen\(true\)\}/);
  assert.match(source, /onPointerDown=\{\(event\) => event\.preventDefault\(\)\}/);
  assert.match(source, /event\.key === "Escape"/);
  assert.match(source, /document\.addEventListener\("pointerdown"/);
});

test("Confidence does not render an empty detail wrapper", () => {
  const html = renderToStaticMarkup(<Confidence title="Độ tin cậy 94%" />);

  assert.match(html, /Độ tin cậy 94%/);
  assert.doesNotMatch(html, /<strong>/);
});

test("SummaryGrid renders every dynamic card with the requested column layout", () => {
  const values = [0, 3, 7];
  const html = renderToStaticMarkup(
    <SummaryGrid columns={3}>
      {values.map((value, index) => (
        <StatCard key={index} label={`Chỉ số ${index + 1}`} value={value} />
      ))}
    </SummaryGrid>,
  );

  assert.match(html, /class="summary-grid summary-grid-3"/);
  assert.equal(html.match(/class="stat-card stat-card-neutral"/g)?.length, 3);
  assert.match(html, /<strong>0<\/strong>/);
});

test("formatMoneyInput adds thousand commas and filters non-digits", () => {
  assert.equal(formatMoneyInput(""), "");
  assert.equal(formatMoneyInput("5000000"), "5,000,000");
  assert.equal(formatMoneyInput("123456789"), "123,456,789");
  assert.equal(formatMoneyInput("5,000,000"), "5,000,000");
  assert.equal(formatMoneyInput("abc5000000xyz"), "5,000,000");
  assert.equal(formatMoneyInput("0"), "0");
});

test("parseMoneyInput converts comma-separated string back to numeric value", () => {
  assert.equal(parseMoneyInput(""), undefined);
  assert.equal(parseMoneyInput("   "), undefined);
  assert.equal(parseMoneyInput("5,000,000"), 5000000);
  assert.equal(parseMoneyInput("123,456,789"), 123456789);
  assert.equal(parseMoneyInput("5000000"), 5000000);
  assert.equal(parseMoneyInput("0"), 0);
});
