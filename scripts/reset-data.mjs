#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const statePath = path.resolve(process.cwd(), ".mock-state.json");
const state = {
  isEmpty: true,
  updatedAt: new Date().toISOString(),
};

fs.writeFileSync(statePath, JSON.stringify(state, null, 2));

// Attempt to signal dev server if active
try {
  const ports = [5173, 3000, 8787];
  for (const port of ports) {
    fetch(`http://localhost:${port}/api/shelfcash/api/v1/mock/reset`, { method: "POST" }).catch(() => undefined);
  }
} catch {}

console.log("\n" + "=".repeat(62));
console.log("🧹 ShelfCash CLI: ĐÃ ĐƯA FE VỀ TRẠNG THÁI CHƯA CÓ DỮ LIỆU");
console.log("=".repeat(62));
console.log("  • Tồn kho & Lô hàng:    Trống (0 nguyên liệu, 0 lô)");
console.log("  • Menu & Định lượng:    Trống (0 món)");
console.log("  • Kế hoạch nhập hàng:   Chưa chạy / Chưa có dữ liệu");
console.log("  • File cấu hình:        .mock-state.json (isEmpty: true)");
console.log("-".repeat(62));
console.log("👉 Tải lại trang (F5) trên trình duyệt để kiểm tra trạng thái trống.");
console.log("👉 Mở mục 'Nhập dữ liệu' để test quy trình nạp 6 tệp Excel giả lập.");
console.log("=".repeat(62) + "\n");
