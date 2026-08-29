import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { LoginView } from "../app/views/LoginView.tsx";
import { StaffShell } from "../app/components/staff/StaffShell.tsx";
import { StaffTodayView } from "../app/views/staff/StaffTodayView.tsx";
import { StaffReceivingView } from "../app/views/staff/StaffReceivingView.tsx";
import { StaffInventoryCountView } from "../app/views/staff/StaffInventoryCountView.tsx";
import { StaffIssueReportView } from "../app/views/staff/StaffIssueReportView.tsx";
import type { UserSession } from "../lib/auth.ts";

const mockStaffSession: UserSession = {
  userId: "user-staff-01",
  name: "Nguyễn Văn A",
  email: "staff01@shelfcash.vn",
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
  loggedInAt: "2026-08-29T10:00:00Z",
};

test("LoginView renders portal switch [Quản lý | Nhân viên]", () => {
  const markup = renderToStaticMarkup(<LoginView onLogin={() => undefined} />);
  assert.match(markup, /Quản lý/);
  assert.match(markup, /Nhân viên/);
  assert.match(markup, /Đăng nhập Quản lý/);
});

test("StaffShell renders desktop sidebar and mobile bottom navigation with 4 canonical staff features", () => {
  const markup = renderToStaticMarkup(
    <StaffShell session={mockStaffSession} onLogout={() => undefined} />
  );

  // Brand & Store Context
  assert.match(markup, /ShelfCash/);
  assert.match(markup, /CHI NHÁNH/);
  assert.match(markup, /ShelfCash Flagship Coffee &amp; Tea|ShelfCash Flagship Coffee & Tea/);
  assert.match(markup, /Nguyễn Văn A/);
  assert.match(markup, /Nhân viên chi nhánh/);

  // 4 Features in navigation
  assert.match(markup, /Hôm nay/);
  assert.match(markup, /Nhận hàng/);
  assert.match(markup, /Kiểm kho/);
  assert.match(markup, /Báo vấn đề/);

  // Does not leak manager analytics / settings features
  assert.doesNotMatch(markup, /Kế hoạch nhập/);
  assert.doesNotMatch(markup, /Nhập dữ liệu/);
  assert.doesNotMatch(markup, /Định lượng/);
  assert.doesNotMatch(markup, /Cài đặt/);
});

test("Staff views render clean empty states with zero fake operational records", () => {
  // 1. Today View
  const todayMarkup = renderToStaticMarkup(<StaffTodayView session={mockStaffSession} />);
  assert.match(todayMarkup, /HÔM NAY/);
  assert.match(todayMarkup, /Không có nhiệm vụ để hiển thị/);

  // 2. Receiving View
  const receivingMarkup = renderToStaticMarkup(<StaffReceivingView session={mockStaffSession} />);
  assert.match(receivingMarkup, /NHẬN HÀNG/);
  assert.match(receivingMarkup, /Chưa có lịch nhận hàng/);

  // 3. Inventory Count View
  const countMarkup = renderToStaticMarkup(<StaffInventoryCountView session={mockStaffSession} />);
  assert.match(countMarkup, /KIỂM KHO/);
  assert.match(countMarkup, /Chưa có phiên kiểm kho/);

  // 4. Issue Report View
  const issueMarkup = renderToStaticMarkup(<StaffIssueReportView session={mockStaffSession} />);
  assert.match(issueMarkup, /BÁO VẤN ĐỀ/);
  assert.match(issueMarkup, /Lệch tồn kho thực tế/);
  assert.match(issueMarkup, /Chưa có báo cáo nào/);
});
