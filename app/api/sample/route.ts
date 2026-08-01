import * as XLSX from "xlsx";
import { buildBootstrapData, addDays } from "../../../lib/data";

export async function GET() {
  const data = buildBootstrapData();
  const workbook = XLSX.utils.book_new();
  const sales = [
    ["Ngày GD", "Tên hàng", "SL", "Giá", "Ghi chú"],
    [addDays(data.today, -6), "ST Chuoi", 12, 35_000, ""],
    [addDays(data.today, -5), "ST Chuoi", 15, 35_000, ""],
    [addDays(data.today, -4), "Ca phe sua", 7, 29_000, ""],
    [addDays(data.today, -3), "Tra dao", 10, 32_000, ""],
    [addDays(data.today, -2), "ST Chuoi", 18, 31_500, "Khuyến mãi 10%"],
    [addDays(data.today, -1), "Matcha sua", 4, 39_000, ""],
  ];
  const inventory = [
    ["Tên nguyên liệu", "Tồn kho", "Đơn vị", "Hạn sử dụng", "Ngày kiểm kho"],
    ["Sữa Vinamilk 1L", 7, "lít", addDays(data.today, 6), data.today],
    ["Banana loại 1", 12, "kg", addDays(data.today, 2), addDays(data.today, -1)],
    ["Đường", 18, "kg", addDays(data.today, 140), addDays(data.today, -5)],
  ];
  const purchases = [
    ["Ngày nhập", "Nguyên liệu", "Số lượng", "Đơn giá", "Nhà cung cấp", "HSD"],
    [addDays(data.today, -21), "Sữa tươi", 24, 32_000, "ABC Food", addDays(data.today, 14)],
    [addDays(data.today, -18), "Chuối", 15, 25_000, "Nông sản An Phú", addDays(data.today, 4)],
  ];
  const recipes = [
    ["Tên sản phẩm", "Nguyên liệu", "Định lượng", "ĐVT"],
    ["Sinh tố chuối", "Chuối", 0.12, "kg"],
    ["Sinh tố chuối", "Sữa tươi", 0.15, "lít"],
    ["Sinh tố chuối", "Đường", 0.02, "kg"],
  ];
  const menu = [
    [
      "Mã món",
      "Loại",
      "Tên món / Combo",
      "Thành phần combo",
      "ĐVT",
      "Tổng giá lẻ",
      "Mức giảm",
      "Giá bán",
      "Tiết kiệm",
      "Trạng thái",
    ],
    [
      "MON-001",
      "Món lẻ",
      "Sinh tố chuối",
      "—",
      "ly",
      35_000,
      0,
      35_000,
      0,
      "Đang bán",
    ],
    [
      "MON-002",
      "Món lẻ",
      "Trà sữa trân châu",
      "—",
      "ly",
      39_000,
      0,
      39_000,
      0,
      "Đang bán",
    ],
    [
      "CMB-001",
      "Combo",
      "Combo Cặp Đôi",
      "1 × Trà sữa trân châu + 1 × Sinh tố chuối",
      "combo",
      74_000,
      0.09,
      67_000,
      7_000,
      "Đang bán",
    ],
  ];

  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet(sales),
    "Bán hàng",
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet(inventory),
    "Kiểm kho",
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet(purchases),
    "Nhập kho",
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet(recipes),
    "Công thức",
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet(menu),
    "06_Menu",
  );

  const bytes = XLSX.write(workbook, {
    type: "array",
    bookType: "xlsx",
  }) as ArrayBuffer;
  return new Response(bytes, {
    headers: {
      "content-type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition":
        'attachment; filename="shelfcash_du_lieu_mau.xlsx"',
    },
  });
}
