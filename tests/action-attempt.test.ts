import assert from "node:assert/strict";
import test from "node:test";
import { createActionAttemptStore } from "../lib/action-attempt.ts";

test("a retry replaces its own error and ignores an older late callback", () => {
  const attempts = createActionAttemptStore();
  const first = attempts.start("purchase-order:update:PO-1");
  attempts.fail("purchase-order:update:PO-1", first, "Lỗi cũ");

  const retry = attempts.start("purchase-order:update:PO-1");
  assert.deepEqual(attempts.get("purchase-order:update:PO-1"), {
    attemptId: retry,
    status: "loading",
  });
  assert.equal(
    attempts.fail("purchase-order:update:PO-1", first, "Lỗi đến muộn"),
    false,
  );

  attempts.succeed("purchase-order:update:PO-1", retry, "Đã lưu đơn nháp.");
  assert.deepEqual(attempts.get("purchase-order:update:PO-1"), {
    attemptId: retry,
    status: "success",
    message: "Đã lưu đơn nháp.",
  });
});

test("a timeout is unknown until a later refetch resolves the same resource", () => {
  const attempts = createActionAttemptStore();
  const timeoutAttempt = attempts.start("import:IMP-1:process");
  attempts.unknown(
    "import:IMP-1:process",
    timeoutAttempt,
    "Máy chủ có thể vẫn đang xử lý.",
  );

  const refetchAttempt = attempts.start("import:IMP-1:process");
  attempts.succeed(
    "import:IMP-1:process",
    refetchAttempt,
    "Dữ liệu đã được xử lý và đồng bộ.",
  );

  assert.deepEqual(attempts.get("import:IMP-1:process"), {
    attemptId: refetchAttempt,
    status: "success",
    message: "Dữ liệu đã được xử lý và đồng bộ.",
  });
});

test("actions remain isolated and clearing one action does not dismiss another", () => {
  const attempts = createActionAttemptStore();
  const importAttempt = attempts.start("import:IMP-1:process");
  const inventoryAttempt = attempts.start("inventory:adjust:LOT-1");
  attempts.fail("import:IMP-1:process", importAttempt, "Tệp có dòng không hợp lệ.");
  attempts.fail("inventory:adjust:LOT-1", inventoryAttempt, "Phiên bản tồn kho đã thay đổi.");

  attempts.start("import:IMP-1:process");
  assert.equal(attempts.get("import:IMP-1:process")?.status, "loading");
  assert.deepEqual(attempts.get("inventory:adjust:LOT-1"), {
    attemptId: inventoryAttempt,
    status: "error",
    message: "Phiên bản tồn kho đã thay đổi.",
  });
});
