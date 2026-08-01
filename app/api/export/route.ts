import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import * as XLSX from "xlsx";
import type { PurchaseOrder } from "../../../lib/types";

function money(value: number): string {
  return `${Math.round(value).toLocaleString("vi-VN")} đ`;
}

function asciiFallback(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");
}

async function loadVietnameseFont(
  pdf: PDFDocument,
  request: Request,
): Promise<{ font: PDFFont; unicode: boolean }> {
  try {
    const response = await fetch(new URL("/fonts/DejaVuSans.ttf", request.url));
    if (!response.ok) throw new Error("font unavailable");
    pdf.registerFontkit(fontkit);
    const font = await pdf.embedFont(await response.arrayBuffer(), {
      subset: true,
    });
    return { font, unicode: true };
  } catch {
    return {
      font: await pdf.embedFont(StandardFonts.Helvetica),
      unicode: false,
    };
  }
}

function spreadsheet(order: PurchaseOrder): ArrayBuffer {
  const workbook = XLSX.utils.book_new();
  const rows: Array<Array<string | number>> = [
    ["SHELFCASH · ĐƠN ĐẶT HÀNG"],
    [],
    ["Mã đơn", order.poId],
    ["Nhà cung cấp", order.supplier],
    ["Ngày đặt", order.orderDate],
    ["Ngày giao dự kiến", order.deliveryDate],
    ["Chiến lược", order.strategy],
    ["Trạng thái", "Bản nháp — chưa gửi nhà cung cấp"],
    [],
    ["Nguyên liệu", "Đơn vị", "Số lượng", "Đơn giá", "Thành tiền", "Ghi chú"],
    ...order.lines.map((line) => [
      line.ingredient,
      line.unit,
      line.orderQty,
      line.unitCost,
      line.orderQty * line.unitCost,
      line.reason,
    ]),
    [],
    ["", "", "", "TỔNG CỘNG", order.total],
  ];
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet["!cols"] = [
    { wch: 24 },
    { wch: 12 },
    { wch: 14 },
    { wch: 16 },
    { wch: 18 },
    { wch: 48 },
  ];
  XLSX.utils.book_append_sheet(workbook, sheet, "Đơn đặt hàng");
  return XLSX.write(workbook, {
    type: "array",
    bookType: "xlsx",
  }) as ArrayBuffer;
}

async function pdf(order: PurchaseOrder, request: Request): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  const page = document.addPage([595.28, 841.89]);
  const { font, unicode } = await loadVietnameseFont(document, request);
  const text = (value: string) => (unicode ? value : asciiFallback(value));
  const { width, height } = page.getSize();

  page.drawRectangle({
    x: 36,
    y: height - 94,
    width: width - 72,
    height: 56,
    color: rgb(49 / 255, 94 / 255, 85 / 255),
  });
  page.drawText(text("ShelfCash · Đơn đặt hàng"), {
    x: 54,
    y: height - 69,
    size: 17,
    font,
    color: rgb(1, 1, 1),
  });

  const metadata = [
    `Mã đơn: ${order.poId}`,
    `Nhà cung cấp: ${order.supplier}`,
    `Ngày đặt: ${order.orderDate}`,
    `Ngày giao dự kiến: ${order.deliveryDate}`,
    `Chiến lược: ${order.strategy}`,
  ];
  let y = height - 122;
  for (const line of metadata) {
    page.drawText(text(line), {
      x: 42,
      y,
      size: 9,
      font,
      color: rgb(36 / 255, 48 / 255, 45 / 255),
    });
    y -= 16;
  }

  y -= 12;
  page.drawRectangle({
    x: 36,
    y: y - 7,
    width: width - 72,
    height: 25,
    color: rgb(232 / 255, 239 / 255, 235 / 255),
  });
  const columns = [42, 250, 344, 442];
  ["Nguyên liệu", "Số lượng", "Đơn giá", "Thành tiền"].forEach(
    (heading, index) => {
      page.drawText(text(heading), {
        x: columns[index],
        y,
        size: 8.5,
        font,
        color: rgb(36 / 255, 48 / 255, 45 / 255),
      });
    },
  );
  y -= 27;

  for (const line of order.lines) {
    page.drawText(text(line.ingredient), {
      x: columns[0],
      y,
      size: 8.5,
      font,
    });
    page.drawText(text(`${line.orderQty} ${line.unit}`), {
      x: columns[1],
      y,
      size: 8.5,
      font,
    });
    page.drawText(text(money(line.unitCost)), {
      x: columns[2],
      y,
      size: 8.5,
      font,
    });
    page.drawText(text(money(line.orderQty * line.unitCost)), {
      x: columns[3],
      y,
      size: 8.5,
      font,
    });
    page.drawLine({
      start: { x: 42, y: y - 7 },
      end: { x: width - 42, y: y - 7 },
      thickness: 0.5,
      color: rgb(216 / 255, 228 / 255, 225 / 255),
    });
    y -= 23;
  }

  page.drawText(text(`TỔNG CỘNG: ${money(order.total)}`), {
    x: 360,
    y: y - 8,
    size: 11,
    font,
    color: rgb(49 / 255, 94 / 255, 85 / 255),
  });
  page.drawText(
    text("Bản nháp do ShelfCash tạo. Cần xác nhận trước khi gửi nhà cung cấp."),
    {
      x: 42,
      y: 42,
      size: 8,
      font,
      color: rgb(95 / 255, 115 / 255, 112 / 255),
    },
  );
  return document.save();
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      order?: PurchaseOrder;
      format?: "xlsx" | "pdf";
    };
    if (!body.order || !body.format) {
      return Response.json(
        { message: "Thiếu đơn hàng hoặc định dạng xuất." },
        { status: 400 },
      );
    }
    const bytes =
      body.format === "xlsx"
        ? spreadsheet(body.order)
        : await pdf(body.order, request);
    const contentType =
      body.format === "xlsx"
        ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        : "application/pdf";
    const bodyBytes =
      bytes instanceof ArrayBuffer
        ? bytes
        : (Uint8Array.from(bytes).buffer as ArrayBuffer);
    return new Response(bodyBytes, {
      headers: {
        "content-type": contentType,
        "content-disposition": `attachment; filename="${body.order.poId}.${body.format}"`,
      },
    });
  } catch {
    return Response.json(
      { message: "Không thể xuất đơn hàng." },
      { status: 500 },
    );
  }
}
