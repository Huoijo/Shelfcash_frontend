import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
  InfoTip,
  PageHeader,
  SectionHeading,
  StatCard,
  SummaryGrid,
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

  assert.match(html, /<h2>Nguyên liệu<\/h2>/);
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

test("InfoTip exposes an accessible label and supplemental tooltip content", () => {
  const html = renderToStaticMarkup(
    <InfoTip label="Giải thích số lượng đặt tối thiểu">
      Số lượng nhỏ nhất có thể đặt trong một lần.
    </InfoTip>,
  );

  assert.match(
    html,
    /aria-label="Giải thích số lượng đặt tối thiểu"/,
  );
  assert.match(html, /role="tooltip"/);
  assert.match(html, /Số lượng nhỏ nhất có thể đặt trong một lần\./);
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
