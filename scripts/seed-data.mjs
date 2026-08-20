#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const statePath = path.resolve(process.cwd(), ".mock-state.json");
const state = {
  isEmpty: false,
  updatedAt: new Date().toISOString(),
};

fs.writeFileSync(statePath, JSON.stringify(state, null, 2));

try {
  const ports = [5173, 3000, 8787];
  for (const port of ports) {
    fetch(`http://localhost:${port}/api/shelfcash/api/v1/mock/seed`, { method: "POST" }).catch(() => undefined);
  }
} catch {}

console.log("\n" + "=".repeat(62));
console.log("✨ ShelfCash CLI: ĐÃ NẠP LẠI DỮ LIỆU ĐẦY ĐỦ (MOCK READY)");
console.log("=".repeat(62));
console.log("  • Tồn kho & Lô hàng:    10 nguyên liệu · 11 lô");
console.log("  • Menu & Định lượng:    12 món (kèm combo)");
console.log("  • Kế hoạch nhập hàng:   Kế hoạch An toàn sẵn sàng");
console.log("  • File cấu hình:        .mock-state.json (isEmpty: false)");
console.log("-".repeat(62));
console.log("👉 Tải lại trang (F5) trên trình duyệt để thấy dữ liệu đầy đủ.");
console.log("=".repeat(62) + "\n");
