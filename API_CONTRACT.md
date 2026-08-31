# SHELFCASH BACKEND API CONTRACT — ĐẶC TẢ CHI TIẾT CHO ĐỘI BACKEND

**Phiên bản:** 2.1 · **Ngày cập nhật:** 29/08/2026  
**Mục đích:** Tài liệu này mô tả **chính xác** từng API endpoint mà Frontend ShelfCash đang sử dụng (Manager Portal) và đặc tả hợp đồng tương lai cho Chi nhánh (Staff / Branch Operations Portal). Backend cần đối chiếu tài liệu này để triển khai API đồng bộ.

---

## MỤC LỤC

| # | Nhóm | Trang FE sử dụng |
|---|---|---|
| 1 | [Health Check](#1-health-check) | Tất cả (kiểm tra kết nối) |
| 2 | [Store Bootstrap](#2-store-bootstrap) | Tất cả (khởi tạo) |
| 3 | [Data Import Pipeline (4 bước)](#3-data-import-pipeline) | Nhập dữ liệu |
| 4 | [Inventory & Lots](#4-inventory--lots) | Kho |
| 5 | [Inventory Counts & Adjustments](#5-inventory-counts--adjustments) | Kho (tab Kiểm kê & Điều chỉnh) |
| 6 | [Menu Products](#6-menu-products) | Danh mục Menu |
| 7 | [Recipes (Định lượng)](#7-recipes-định-lượng) | Định lượng |
| 8 | [Supplier Constraints](#8-supplier-constraints) | Cài đặt |
| 9 | [Inventory Constraints](#9-inventory-constraints) | Cài đặt |
| 10 | [Settings, Aliases, Calendar](#10-settings-aliases-calendar) | Cài đặt |
| 11 | [Forecast Runs](#11-forecast-runs) | Kế hoạch nhập |
| 12 | [Decision Runs (Trung tâm quyết định)](#12-decision-runs) | Hôm nay + Kế hoạch nhập |
| 13 | [Decision Brief](#13-decision-brief) | Hôm nay + Kế hoạch nhập |
| 14 | [Explanation & What-If](#14-explanation--what-if) | Kế hoạch nhập |
| 15 | [Purchase Orders](#15-purchase-orders) | Kế hoạch nhập + Nhận hàng |
| 16 | [Staff / Branch Operations API](#16-staff--branch-operations-api) | Staff Portal (Chi nhánh) — Proposed |
| 17 | [Opportunity Recommendation](#17-opportunity-recommendation) | Khám phá cơ hội (Manager) — Proposed |

---

## QUY ƯỚC CHUNG

### Base URL
```
Production: https://<domain>/api/v1
FE Proxy:   /api/shelfcash/api/v1
```

### Headers bắt buộc
| Header | Giá trị | Khi nào |
|--------|---------|---------|
| `Content-Type` | `application/json` | Mọi request JSON |
| `Content-Type` | `multipart/form-data` | Upload file |
| `Idempotency-Key` | UUID v4 | Mọi POST/PUT/PATCH mutation |

### Error Envelope (mọi lỗi 4xx/5xx)
```json
{
  "code": "MODEL_NOT_READY",
  "message": "Mô hình dự báo chưa được huấn luyện.",
  "details": { "store_id": "STORE_001" },
  "request_id": "req-abc123"
}
```

### store_id mặc định trong mock
```
STORE_001
```

---

## 1. HEALTH CHECK

### `GET /health`
**Trang FE:** Dùng khi khởi tạo app, kiểm tra kết nối server.  
**FE mong đợi:** Nếu response OK → hiển thị "Đã kết nối". Nếu fail → "Máy chủ chưa kết nối".

#### Expected Response `200`:
```json
{
  "status": "ok",
  "provider": "shelfcash-backend",
  "timestamp": "2026-08-20T10:00:00.000Z"
}
```

### `GET /api/v1/llm/health`
**Trang FE:** Kiểm tra LLM service (Qwen) cho gợi ý mapping cột.

#### Expected Response `200`:
```json
{
  "status": "ok",
  "provider": "qwen-2.5-72b",
  "timestamp": "2026-08-20T10:00:00.000Z"
}
```

---

## 2. STORE BOOTSTRAP

### `GET /api/v1/stores/{store_id}/bootstrap`

**Trang FE:** Gọi 1 lần khi app khởi tạo. Mọi trang đều phụ thuộc vào dữ liệu này.  
**FE mong đợi:** Trả về TOÀN BỘ trạng thái vận hành của cửa hàng để dựng giao diện.

> ⚠️ **ĐÂY LÀ API QUAN TRỌNG NHẤT.** Frontend dùng response này để render:
> - Sidebar navigation counters
> - Trang "Hôm nay" (Decision Pipeline, Attention Alerts)
> - Trang "Kho" (Danh sách nguyên liệu, chi tiết lô hàng FEFO)
> - Trang "Menu" & "Định lượng"
> - Trang "Cài đặt" (NCC, Ràng buộc, Lịch)

#### Expected Response `200` (ĐẦY ĐỦ 10 nguyên liệu, 11 lô, 12 món):

```json
{
  "today": "2026-08-20",
  "store": {
    "store_id": "STORE_001",
    "store_name": "ShelfCash Flagship Coffee & Tea",
    "timezone": "Asia/Ho_Chi_Minh",
    "currency": "VND"
  },

  "inventory": [
    {
      "lot_id": "lot-sua-01",
      "batch_id": "LOT-SUA-20260818-01",
      "ingredient_id": "milk-fresh",
      "ingredient": "Sữa tươi",
      "sku": "NL-SUA-001",
      "unit": "L",
      "on_hand": 18,
      "quantity": 18,
      "usable_quantity": 18,
      "expiring_quantity": 0,
      "expired_quantity": 0,
      "unit_cost": 34000,
      "received_date": "2026-08-18",
      "expiry_date": "2026-09-30",
      "supplier": "Sữa Việt Distribution",
      "supplier_name": "Sữa Việt Distribution",
      "supplier_id": "sup-sua-viet",
      "storage_location": "Kho lạnh A",
      "status": "healthy",
      "snapshot_date": "2026-08-19",
      "version": 1
    },
    {
      "lot_id": "lot-suadac-01",
      "batch_id": "LOT-SUADAC-20260817-01",
      "ingredient_id": "condensed-milk",
      "ingredient": "Sữa đặc",
      "sku": "NL-SUADAC-001",
      "unit": "L",
      "on_hand": 1.67,
      "quantity": 1.67,
      "usable_quantity": 1.67,
      "expiring_quantity": 0,
      "expired_quantity": 0,
      "unit_cost": 47000,
      "received_date": "2026-08-17",
      "expiry_date": "2026-09-30",
      "supplier": "Sữa Việt Distribution",
      "supplier_name": "Sữa Việt Distribution",
      "supplier_id": "sup-sua-viet",
      "storage_location": "Kho lạnh A",
      "status": "healthy",
      "snapshot_date": "2026-08-19",
      "version": 1
    },
    {
      "lot_id": "lot-matcha-01",
      "batch_id": "LOT-MATCHA-20260812-01",
      "ingredient_id": "matcha-powder",
      "ingredient": "Bột matcha",
      "sku": "NL-MATCHA-001",
      "unit": "kg",
      "on_hand": 1.2,
      "quantity": 1.2,
      "usable_quantity": 1.2,
      "expiring_quantity": 0,
      "expired_quantity": 0,
      "unit_cost": 480000,
      "received_date": "2026-08-12",
      "expiry_date": "2027-02-12",
      "supplier": "Matcha House Supply",
      "supplier_name": "Matcha House Supply",
      "supplier_id": "sup-matcha-house",
      "storage_location": "Kho khô · Kệ A2",
      "status": "healthy",
      "snapshot_date": "2026-08-19",
      "version": 1
    },
    {
      "lot_id": "lot-duong-01",
      "batch_id": "LOT-DUONG-20260810-01",
      "ingredient_id": "sugar",
      "ingredient": "Đường",
      "sku": "NL-DUONG-001",
      "unit": "kg",
      "on_hand": 15,
      "quantity": 15,
      "usable_quantity": 15,
      "expiring_quantity": 0,
      "expired_quantity": 0,
      "unit_cost": 22000,
      "received_date": "2026-08-10",
      "expiry_date": "2027-08-10",
      "supplier": "Thực phẩm Minh Long",
      "supplier_name": "Thực phẩm Minh Long",
      "supplier_id": "sup-minh-long",
      "storage_location": "Kho khô · Kệ B1",
      "status": "healthy",
      "snapshot_date": "2026-08-19",
      "version": 1
    },
    {
      "lot_id": "lot-ly500-01",
      "batch_id": "LOT-LY500-20260815-01",
      "ingredient_id": "plastic-cups-500",
      "ingredient": "Ly nhựa 500ml",
      "sku": "NL-LY-500",
      "unit": "cái",
      "on_hand": 350,
      "quantity": 350,
      "usable_quantity": 350,
      "expiring_quantity": 0,
      "expired_quantity": 0,
      "unit_cost": 750,
      "received_date": "2026-08-15",
      "expiry_date": "2028-12-31",
      "supplier": "Bao bì Việt Pack",
      "supplier_name": "Bao bì Việt Pack",
      "supplier_id": "sup-viet-pack",
      "storage_location": "Kho bao bì · Kệ P1",
      "status": "healthy",
      "snapshot_date": "2026-08-19",
      "version": 1
    },
    {
      "lot_id": "lot-chuoi-01",
      "batch_id": "LOT-CHUOI-20260818-01",
      "ingredient_id": "banana",
      "ingredient": "Chuối",
      "sku": "NL-CHUOI-001",
      "unit": "kg",
      "on_hand": 8,
      "quantity": 8,
      "usable_quantity": 8,
      "expiring_quantity": 8,
      "expired_quantity": 0,
      "unit_cost": 24000,
      "received_date": "2026-08-18",
      "expiry_date": "2026-08-26",
      "supplier": "Nông sản An Phú",
      "supplier_name": "Nông sản An Phú",
      "supplier_id": "sup-an-phu",
      "storage_location": "Kho mát · Kệ F1",
      "status": "expiring",
      "snapshot_date": "2026-08-19",
      "version": 1
    },
    {
      "lot_id": "lot-tran-01",
      "batch_id": "LOT-TRAN-20260816-01",
      "ingredient_id": "tapioca-pearls",
      "ingredient": "Trân châu",
      "sku": "NL-TRANCHAU-001",
      "unit": "kg",
      "on_hand": 4,
      "quantity": 4,
      "usable_quantity": 4,
      "expiring_quantity": 0,
      "expired_quantity": 0,
      "unit_cost": 48000,
      "received_date": "2026-08-16",
      "expiry_date": "2026-10-15",
      "supplier": "Nguyên liệu Trà Việt",
      "supplier_name": "Nguyên liệu Trà Việt",
      "supplier_id": "sup-tra-viet",
      "storage_location": "Kho khô · Kệ B3",
      "status": "healthy",
      "snapshot_date": "2026-08-19",
      "version": 1
    },
    {
      "lot_id": "lot-traden-01",
      "batch_id": "LOT-TRADEN-20260811-01",
      "ingredient_id": "black-tea",
      "ingredient": "Trà đen",
      "sku": "NL-TRADEN-001",
      "unit": "kg",
      "on_hand": 2.5,
      "quantity": 2.5,
      "usable_quantity": 2.5,
      "expiring_quantity": 0,
      "expired_quantity": 0,
      "unit_cost": 140000,
      "received_date": "2026-08-11",
      "expiry_date": "2027-02-11",
      "supplier": "Nguyên liệu Trà Việt",
      "supplier_name": "Nguyên liệu Trà Việt",
      "supplier_id": "sup-tra-viet",
      "storage_location": "Kho khô · Kệ A4",
      "status": "healthy",
      "snapshot_date": "2026-08-19",
      "version": 1
    },
    {
      "lot_id": "lot-cam-01",
      "batch_id": "LOT-CAM-20260819-01",
      "ingredient_id": "orange",
      "ingredient": "Cam",
      "sku": "NL-CAM-001",
      "unit": "kg",
      "on_hand": 3.28,
      "quantity": 3.28,
      "usable_quantity": 3.28,
      "expiring_quantity": 3.28,
      "expired_quantity": 0,
      "unit_cost": 27520,
      "received_date": "2026-08-19",
      "expiry_date": "2026-08-24",
      "supplier": "Nông sản An Phú",
      "supplier_name": "Nông sản An Phú",
      "supplier_id": "sup-an-phu",
      "storage_location": "Kho mát · Kệ F2",
      "status": "expiring",
      "snapshot_date": "2026-08-19",
      "version": 1
    },
    {
      "lot_id": "lot-cam-02",
      "batch_id": "LOT-CAM-20260820-01",
      "ingredient_id": "orange",
      "ingredient": "Cam",
      "sku": "NL-CAM-001",
      "unit": "kg",
      "on_hand": 5.0,
      "quantity": 5.0,
      "usable_quantity": 5.0,
      "expiring_quantity": 0,
      "expired_quantity": 0,
      "unit_cost": 27520,
      "received_date": "2026-08-20",
      "expiry_date": "2026-08-29",
      "supplier": "Nông sản An Phú",
      "supplier_name": "Nông sản An Phú",
      "supplier_id": "sup-an-phu",
      "storage_location": "Kho mát · Kệ F2",
      "status": "healthy",
      "snapshot_date": "2026-08-19",
      "version": 1
    },
    {
      "lot_id": "lot-cafe-01",
      "batch_id": "LOT-CAFE-20260814-01",
      "ingredient_id": "coffee-beans",
      "ingredient": "Cà phê hạt",
      "sku": "NL-CAFE-001",
      "unit": "kg",
      "on_hand": 5,
      "quantity": 5,
      "usable_quantity": 5,
      "expiring_quantity": 0,
      "expired_quantity": 0,
      "unit_cost": 180000,
      "received_date": "2026-08-14",
      "expiry_date": "2027-02-14",
      "supplier": "Highland Roastery Supply",
      "supplier_name": "Highland Roastery Supply",
      "supplier_id": "sup-highland",
      "storage_location": "Kho khô · Kệ C1",
      "status": "healthy",
      "snapshot_date": "2026-08-19",
      "version": 1
    }
  ],

  "products": [
    { "product_id": "PROD_CAFE_DEN", "sku": "SP-CAFE-DEN", "product": "Cà phê đen đá", "price": 29000, "item_type": "single", "status": "active", "selling_unit": "ly", "recipe_status": "Hoàn chỉnh", "recipe_version": 1, "effective_date": "2026-08-01", "recipe_yield_quantity": 1, "recipe_process_loss_rate": 0.05 },
    { "product_id": "PROD_CAFE_SUA", "sku": "SP-CAFE-SUA", "product": "Cà phê sữa đá", "price": 35000, "item_type": "single", "status": "active", "selling_unit": "ly", "recipe_status": "Hoàn chỉnh", "recipe_version": 1, "effective_date": "2026-08-01", "recipe_yield_quantity": 1, "recipe_process_loss_rate": 0.05 },
    { "product_id": "PROD_TRA_DAO", "sku": "SP-TRA-DAO", "product": "Trà đào", "price": 39000, "item_type": "single", "status": "active", "selling_unit": "ly", "recipe_status": "Hoàn chỉnh", "recipe_version": 1, "effective_date": "2026-08-01", "recipe_yield_quantity": 1, "recipe_process_loss_rate": 0.02 },
    { "product_id": "PROD_TRA_SUA", "sku": "SP-TRA-SUA", "product": "Trà sữa trân châu", "price": 45000, "item_type": "single", "status": "active", "selling_unit": "ly", "recipe_status": "Hoàn chỉnh", "recipe_version": 2, "effective_date": "2026-08-10", "recipe_yield_quantity": 1, "recipe_process_loss_rate": 0.03 },
    { "product_id": "PROD_MATCHA_LATTE", "sku": "SP-MATCHA-LATTE", "product": "Matcha Latte", "price": 49000, "item_type": "single", "status": "active", "selling_unit": "ly", "recipe_status": "Hoàn chỉnh", "recipe_version": 1, "effective_date": "2026-08-01", "recipe_yield_quantity": 1, "recipe_process_loss_rate": 0.02 },
    { "product_id": "PROD_SINH_TO_CHUOI", "sku": "SP-SINH-TO-CHUOI", "product": "Sinh tố chuối", "price": 45000, "item_type": "single", "status": "active", "selling_unit": "ly", "recipe_status": "Hoàn chỉnh", "recipe_version": 1, "effective_date": "2026-08-01", "recipe_yield_quantity": 1, "recipe_process_loss_rate": 0.05 },
    { "product_id": "PROD_NUOC_CAM", "sku": "SP-NUOC-CAM", "product": "Nước cam", "price": 42000, "item_type": "single", "status": "active", "selling_unit": "ly", "recipe_status": "Hoàn chỉnh", "recipe_version": 1, "effective_date": "2026-08-01", "recipe_yield_quantity": 1, "recipe_process_loss_rate": 0.08 },
    { "product_id": "PROD_SIGNATURE_COFFEE", "sku": "SP-SIGNATURE-COFFEE", "product": "Cà phê sữa đặc biệt", "price": 49000, "item_type": "single", "status": "active", "selling_unit": "ly", "recipe_status": "Hoàn chỉnh", "recipe_version": 1, "effective_date": "2026-08-05", "recipe_yield_quantity": 1, "recipe_process_loss_rate": 0.04 },
    { "product_id": "PROD_MATCHA_CREAM", "sku": "SP-MATCHA-CREAM", "product": "Matcha Kem Sữa", "price": 55000, "item_type": "single", "status": "active", "selling_unit": "ly", "recipe_status": "Hoàn chỉnh", "recipe_version": 1, "effective_date": "2026-08-05", "recipe_yield_quantity": 1, "recipe_process_loss_rate": 0.02 },
    { "product_id": "PROD_BLACK_MILK_TEA", "sku": "SP-BLACK-MILK-TEA", "product": "Trà đen sữa", "price": 42000, "item_type": "single", "status": "inactive", "selling_unit": "ly", "recipe_status": "Hoàn chỉnh", "recipe_version": 1, "effective_date": "2026-08-01", "recipe_yield_quantity": 1, "recipe_process_loss_rate": 0.03 },
    { "product_id": "COMBO_BREAKFAST", "sku": "SP-COMBO-SANG", "product": "Combo Cà phê sáng", "price": 59000, "item_type": "combo", "status": "active", "selling_unit": "combo", "recipe_status": "Hoàn chỉnh", "recipe_version": 1, "effective_date": "2026-08-01", "recipe_yield_quantity": 1, "recipe_process_loss_rate": 0 },
    { "product_id": "COMBO_FRIENDS", "sku": "SP-COMBO-BAN-BE", "product": "Combo Bạn bè", "price": 119000, "item_type": "combo", "status": "active", "selling_unit": "combo", "recipe_status": "Hoàn chỉnh", "recipe_version": 1, "effective_date": "2026-08-01", "recipe_yield_quantity": 1, "recipe_process_loss_rate": 0 }
  ],

  "menu": "<<< Xem mục 6. Menu Products bên dưới >>>",

  "recipes": [
    {
      "product_id": "PROD_CAFE_DEN",
      "product": "Cà phê đen đá",
      "recipe_version": 1,
      "effective_from": "2026-08-01",
      "yield_quantity": 1,
      "process_loss_rate": 0.05,
      "lines": [
        { "ingredient_id": "coffee-beans", "ingredient_name": "Cà phê hạt", "quantity": 0.022, "unit": "kg" },
        { "ingredient_id": "sugar", "ingredient_name": "Đường", "quantity": 0.015, "unit": "kg" },
        { "ingredient_id": "plastic-cups-500", "ingredient_name": "Ly nhựa 500ml", "quantity": 1, "unit": "cái" }
      ]
    }
  ],

  "supplier_constraints": [
    {
      "ingredient_id": "milk-fresh",
      "ingredient": "Sữa tươi",
      "supplier_id": "sup-sua-viet",
      "supplier_name": "Sữa Việt Distribution",
      "lead_time_days": 2,
      "moq": 24,
      "pack_size": 24,
      "unit_cost": 34000,
      "unit": "L",
      "version": 1
    }
  ],

  "aliases": [],
  "future_calendar": [],

  "settings": {
    "monthly_budget": 15000000,
    "spent_budget": 3200000,
    "remaining_budget": 11800000,
    "forecast_horizon": 7,
    "default_strategy": "An toàn"
  },

  "latest_runs": {
    "forecast_run_id": "forecast-run-mock-happy-path",
    "plan_run_id": "decision-run-mock-happy-path"
  },

  "data_freshness": {
    "inventory_synced_at": "2026-08-20T10:00:00.000Z",
    "sales_synced_at": "2026-08-20T10:00:00.000Z"
  }
}
```

> **Lưu ý quan trọng:**
> - `inventory` phải trả đầy đủ 11 lô (Cam có 2 lô: lot-cam-01 expiring + lot-cam-02 healthy)
> - `status` chỉ có 4 giá trị: `"healthy"`, `"expiring"`, `"expired"`, `"stockout"`
> - `supplier` và `supplier_name` phải có cùng giá trị (FE dùng cả hai)
> - `snapshot_date` là ngày kiểm kho của lô hàng
> - `on_hand` và `quantity` phải có cùng giá trị
> - Combo (item_type: "combo") KHÔNG có recipe lines, chỉ có components

---

## 3. DATA IMPORT PIPELINE

### Bước 1: `POST /api/v1/imports`

**Trang FE:** Nhập dữ liệu → Chọn tệp → Tải lên  
**FE gửi:** `multipart/form-data` với files Excel/CSV + `store_id` + `forecast_date` + `forecast_horizon`  
**FE mong đợi:** Backend nhận diện 6 loại sheet, trả lại profiles + mapping gợi ý.

#### 6 loại sheet canonical mà FE hiểu:
| `sheet_type` | Mô tả | Trường bắt buộc (core fields) |
|---|---|---|
| `sales_history` | Doanh thu bán hàng | `date`, `product_name`, `quantity_sold` |
| `inventory` | Tồn kho & lô hàng | `ingredient_name`, `on_hand`, `unit` |
| `menu` | Danh mục menu | `product_name`, `selling_price` |
| `recipes` | Công thức định lượng | `product_name`, `ingredient_name`, `ingredient_quantity` |
| `supplier_constraints` | Nhà cung cấp | `supplier_name`, `lead_time_days` |
| `calendar_features` | Lịch & sự kiện | `event_date`, `event_name` |

#### Expected Response `200`:
```json
{
  "import_id": "IMP_1724140800000",
  "status": "uploaded",
  "source": "rule",
  "requires_review": false,
  "profiles": [
    {
      "profile_id": "prof_sales_01",
      "file_name": "Doanh_thu_Ban_hang.xlsx",
      "sheet_name": "DoanhThu",
      "sheet_type": "sales_history",
      "detected_sheet_type": "sales_history",
      "row_count": 1250,
      "columns": ["Ngày", "Tên sản phẩm", "Số lượng bán", "Giá bán", "Doanh thu", "Hết hàng"],
      "sample_rows": [
        { "Ngày": "2026-08-19", "Tên sản phẩm": "Cà phê sữa", "Số lượng bán": 45, "Giá bán": 25000, "Doanh thu": 1125000, "Hết hàng": 0 },
        { "Ngày": "2026-08-19", "Tên sản phẩm": "Bạc xỉu", "Số lượng bán": 30, "Giá bán": 30000, "Doanh thu": 900000, "Hết hàng": 0 },
        { "Ngày": "2026-08-19", "Tên sản phẩm": "Trà đào cam sả", "Số lượng bán": 28, "Giá bán": 35000, "Doanh thu": 980000, "Hết hàng": 0 }
      ],
      "mapping": {
        "Ngày": "date",
        "Tên sản phẩm": "product_name",
        "Số lượng bán": "quantity_sold",
        "Giá bán": "selling_price",
        "Doanh thu": "revenue",
        "Hết hàng": "is_stockout"
      }
    },
    {
      "profile_id": "prof_inventory_02",
      "file_name": "Ton_kho_Lo_hang.xlsx",
      "sheet_name": "TonKho",
      "sheet_type": "inventory",
      "detected_sheet_type": "inventory",
      "row_count": 11,
      "columns": ["Mã lô", "Tên nguyên liệu", "Tồn hiện tại", "Đơn vị", "Hạn sử dụng", "Tên kho"],
      "sample_rows": [
        { "Mã lô": "LOT-20260815-CA", "Tên nguyên liệu": "Cam", "Tồn hiện tại": 3.28, "Đơn vị": "kg", "Hạn sử dụng": "2026-08-24", "Tên kho": "Kho mát" }
      ],
      "mapping": {
        "Mã lô": "batch_id",
        "Tên nguyên liệu": "ingredient_name",
        "Tồn hiện tại": "on_hand",
        "Đơn vị": "unit",
        "Hạn sử dụng": "expiry_date",
        "Tên kho": "warehouse_name"
      }
    },
    {
      "profile_id": "prof_menu_03",
      "file_name": "Menu_Mon_an.xlsx",
      "sheet_name": "Menu",
      "sheet_type": "menu",
      "detected_sheet_type": "menu",
      "row_count": 12,
      "columns": ["Mã món", "Tên món", "Giá bán", "Đơn vị bán", "Loại món"],
      "sample_rows": [
        { "Mã món": "SP-CFS", "Tên món": "Cà phê sữa", "Giá bán": 25000, "Đơn vị bán": "ly", "Loại món": "single" }
      ],
      "mapping": {
        "Mã món": "product_sku",
        "Tên món": "product_name",
        "Giá bán": "selling_price",
        "Đơn vị bán": "selling_unit",
        "Loại món": "item_type"
      }
    },
    {
      "profile_id": "prof_recipes_04",
      "file_name": "Dinh_luong_Cong_thuc.xlsx",
      "sheet_name": "CongThuc",
      "sheet_type": "recipes",
      "detected_sheet_type": "recipes",
      "row_count": 12,
      "columns": ["Tên món", "Tên nguyên liệu", "Định lượng nguyên liệu", "Đơn vị nguyên liệu"],
      "sample_rows": [
        { "Tên món": "Cà phê sữa", "Tên nguyên liệu": "Cà phê hạt", "Định lượng nguyên liệu": 0.025, "Đơn vị nguyên liệu": "kg" }
      ],
      "mapping": {
        "Tên món": "product_name",
        "Tên nguyên liệu": "ingredient_name",
        "Định lượng nguyên liệu": "ingredient_quantity",
        "Đơn vị nguyên liệu": "ingredient_unit"
      }
    },
    {
      "profile_id": "prof_suppliers_05",
      "file_name": "Nha_cung_cap_Dieu_kien.xlsx",
      "sheet_name": "NhaCungCap",
      "sheet_type": "supplier_constraints",
      "detected_sheet_type": "supplier_constraints",
      "row_count": 4,
      "columns": ["Tên nhà cung cấp", "Tên nguyên liệu", "Thời gian giao (ngày)", "Số lượng đặt tối thiểu", "Đơn giá"],
      "sample_rows": [
        { "Tên nhà cung cấp": "Nông sản Đà Lạt", "Tên nguyên liệu": "Cam", "Thời gian giao (ngày)": 2, "Số lượng đặt tối thiểu": 10, "Đơn giá": 27500 }
      ],
      "mapping": {
        "Tên nhà cung cấp": "supplier_name",
        "Tên nguyên liệu": "ingredient_name",
        "Thời gian giao (ngày)": "lead_time_days",
        "Số lượng đặt tối thiểu": "minimum_order_quantity",
        "Đơn giá": "unit_price"
      }
    },
    {
      "profile_id": "prof_calendar_06",
      "file_name": "Lich_Su_kien_Ngay_le.xlsx",
      "sheet_name": "LichSuKien",
      "sheet_type": "calendar_features",
      "detected_sheet_type": "calendar_features",
      "row_count": 3,
      "columns": ["Ngày", "Tên khuyến mãi", "Có khuyến mãi", "Ngày lễ"],
      "sample_rows": [
        { "Ngày": "2026-09-02", "Tên khuyến mãi": "Quốc khánh 2/9", "Có khuyến mãi": 1, "Ngày lễ": 1 }
      ],
      "mapping": {
        "Ngày": "date",
        "Tên khuyến mãi": "promotion_name",
        "Có khuyến mãi": "is_promotion",
        "Ngày lễ": "is_holiday"
      }
    }
  ],
  "suggested_mappings": {},
  "warnings": [],
  "errors": []
}
```

### Bước 2: `POST /api/v1/imports/{import_id}/confirm`

**FE gửi:**
```json
{
  "mappings": [
    {
      "profile_id": "prof_sales_01",
      "sheet_type": "sales_history",
      "column_mapping": { "Ngày": "date", "Tên sản phẩm": "product_name", "Số lượng bán": "quantity_sold" },
      "skip": false
    },
    {
      "profile_id": "prof_unknown_07",
      "sheet_type": "unknown",
      "column_mapping": {},
      "skip": true
    }
  ]
}
```

**Expected Response `200`:**
```json
{ "import_id": "IMP_xxx", "status": "confirmed" }
```

### Bước 3: `POST /api/v1/imports/{import_id}/process`

**FE gửi:** Body rỗng `{}`. FE mong đợi backend ghi dữ liệu vào DB.

**Expected Response `200`:**
```json
{ "import_id": "IMP_xxx", "status": "completed" }
```

### Bước 4: `GET /api/v1/imports/{import_id}/result`

**FE mong đợi:** Tổng kết số liệu đã nạp, để hiển thị màn "Hoàn tất".

**Expected Response `200`:**
```json
{
  "store_id": "STORE_001",
  "forecast_date": "2026-08-20",
  "forecast_horizon": 7,
  "inventory": [],
  "sales_history": [],
  "recipes": [],
  "menu": [],
  "supplier_constraints": [],
  "calendar_features": [],
  "validation_summary": {
    "total_rows": 1292,
    "valid_rows": 1292,
    "error_rows": 0
  },
  "ingestion_metadata": {
    "processed_at": "2026-08-20T10:00:00Z",
    "engine": "excel_ingestion_pipeline"
  }
}
```

---

## 4. INVENTORY & LOTS

### `GET /api/v1/stores/{store_id}/inventory`

**Trang FE:** Kho → Danh sách lô hàng  
**FE mong đợi:** Trả mảng giống `inventory` trong Bootstrap (xem mục 2).

---

## 5. INVENTORY COUNTS & ADJUSTMENTS

### `POST /api/v1/stores/{store_id}/inventory-counts`

**Trang FE:** Kho → Chi tiết nguyên liệu → Tab "Dữ liệu" → Kiểm kê  
**FE gửi:**
```json
{
  "counted_at": "2026-08-20T17:00:00+07:00",
  "counts": [
    { "lot_id": "lot-sua-01", "counted_quantity": 17.5, "reason": "Kiểm kê cuối ngày", "expected_version": 1 }
  ]
}
```

### `POST /api/v1/stores/{store_id}/inventory-adjustments`

**Trang FE:** Kho → Chi tiết nguyên liệu → Tab "Dữ liệu" → Điều chỉnh  
**FE gửi:**
```json
{
  "adjusted_at": "2026-08-20T17:00:00+07:00",
  "adjustments": [
    { "lot_id": "lot-chuoi-01", "quantity_delta": -2, "adjustment_type": "waste_expired", "reason": "Chuối dập hỏng", "expected_version": 1 }
  ]
}
```

---

## 6. MENU PRODUCTS

### `GET /api/v1/stores/{store_id}/menu`

**Trang FE:** Menu → Danh sách món  
**FE mong đợi:** Object `{ items: [...] }` chứa 12 MenuItem records.

#### Expected Response (1 single + 1 combo ví dụ):
```json
{
  "items": [
    {
      "product_id": "PROD_CAFE_SUA",
      "sku": "SP-CAFE-SUA",
      "product": "Cà phê sữa đá",
      "category": "Cà phê",
      "item_type": "single",
      "selling_unit": "ly",
      "price": 35000,
      "list_price": 35000,
      "savings_amount": 0,
      "discount_rate": 0,
      "status": "active",
      "currency": "VND",
      "version": 1,
      "components": [],
      "created_at": "2026-08-01T00:00:00Z",
      "updated_at": "2026-08-15T00:00:00Z"
    },
    {
      "product_id": "COMBO_BREAKFAST",
      "sku": "SP-COMBO-SANG",
      "product": "Combo Cà phê sáng",
      "category": "Combo",
      "item_type": "combo",
      "selling_unit": "combo",
      "price": 59000,
      "list_price": 64000,
      "savings_amount": 5000,
      "discount_rate": 0.078125,
      "status": "active",
      "currency": "VND",
      "version": 1,
      "components": [
        { "component_product_id": "PROD_CAFE_SUA", "sku": "SP-CAFE-SUA", "product": "Cà phê sữa đá", "quantity": 1, "selling_unit": "ly", "unit_price": 35000, "line_list_price": 35000 },
        { "component_product_id": "PROD_CAFE_DEN", "sku": "SP-CAFE-DEN", "product": "Cà phê đen đá", "quantity": 1, "selling_unit": "ly", "unit_price": 29000, "line_list_price": 29000 }
      ],
      "created_at": "2026-08-01T00:00:00Z",
      "updated_at": "2026-08-15T00:00:00Z"
    }
  ]
}
```

> **Lưu ý cho combo:**
> - `list_price` = tổng `line_list_price` các component
> - `savings_amount` = `list_price - price`
> - `discount_rate` = `savings_amount / list_price`
> - Combo KHÔNG có recipe trực tiếp (recipe = tổng recipe các single bên trong)

### `POST /api/v1/stores/{store_id}/products` — Tạo món mới
### `PATCH /api/v1/stores/{store_id}/products/{product_id}` — Sửa món
### `PUT /api/v1/stores/{store_id}/products/{product_id}/components` — Sửa combo

---

## 7. RECIPES (Định lượng)

### `GET /api/v1/stores/{store_id}/products/{product_id}/recipe`

**Trang FE:** Định lượng → Chọn 1 món → Xem công thức  
**FE mong đợi:** Chi tiết định lượng 1 món (chỉ single, không áp dụng cho combo).

#### Expected Response cho `PROD_TRA_SUA`:
```json
{
  "product_id": "PROD_TRA_SUA",
  "product": "Trà sữa trân châu",
  "recipe_version_id": "rec-ver-PROD_TRA_SUA-v2",
  "version": 2,
  "effective_from": "2026-08-10",
  "effective_to": null,
  "yield_quantity": 1,
  "process_loss_rate": 0.03,
  "lines": [
    { "ingredient_id": "black-tea", "ingredient_name": "Trà đen", "ingredient": "Trà đen", "quantity": 0.015, "ingredient_quantity": 0.015, "unit": "kg", "ingredient_unit": "kg" },
    { "ingredient_id": "condensed-milk", "ingredient_name": "Sữa đặc", "ingredient": "Sữa đặc", "quantity": 0.035, "ingredient_quantity": 0.035, "unit": "L", "ingredient_unit": "L" },
    { "ingredient_id": "milk-fresh", "ingredient_name": "Sữa tươi", "ingredient": "Sữa tươi", "quantity": 0.06, "ingredient_quantity": 0.06, "unit": "L", "ingredient_unit": "L" },
    { "ingredient_id": "tapioca-pearls", "ingredient_name": "Trân châu", "ingredient": "Trân châu", "quantity": 0.05, "ingredient_quantity": 0.05, "unit": "kg", "ingredient_unit": "kg" },
    { "ingredient_id": "sugar", "ingredient_name": "Đường", "ingredient": "Đường", "quantity": 0.015, "ingredient_quantity": 0.015, "unit": "kg", "ingredient_unit": "kg" },
    { "ingredient_id": "plastic-cups-500", "ingredient_name": "Ly nhựa 500ml", "ingredient": "Ly nhựa 500ml", "quantity": 1, "ingredient_quantity": 1, "unit": "cái", "ingredient_unit": "cái" }
  ]
}
```

> **Lưu ý:** Mỗi dòng recipe phải có CẢ hai cặp trường:
> - `quantity` + `unit` (canonical)
> - `ingredient_quantity` + `ingredient_unit` (alias, giá trị giống nhau)
> - `ingredient_name` + `ingredient` (alias, giá trị giống nhau)

### `PUT /api/v1/stores/{store_id}/products/{product_id}/recipe` — Cập nhật định lượng

**FE gửi:**
```json
{
  "effective_from": "2026-08-21",
  "yield_quantity": 1,
  "process_loss_rate": 0.03,
  "lines": [
    { "ingredient_id": "black-tea", "quantity": 0.015, "unit": "kg" },
    { "ingredient_id": "condensed-milk", "quantity": 0.04, "unit": "L" }
  ]
}
```

---

## 8. SUPPLIER CONSTRAINTS

### `GET /api/v1/stores/{store_id}/supplier-constraints`

**Trang FE:** Cài đặt → Nhà cung cấp

#### Expected Response (10 dòng, 1 per nguyên liệu):
```json
[
  { "ingredient_id": "milk-fresh", "ingredient": "Sữa tươi", "supplier_id": "sup-sua-viet", "supplier_name": "Sữa Việt Distribution", "lead_time_days": 2, "moq": 24, "pack_size": 24, "unit_cost": 34000, "unit": "L", "version": 1 },
  { "ingredient_id": "condensed-milk", "ingredient": "Sữa đặc", "supplier_id": "sup-sua-viet", "supplier_name": "Sữa Việt Distribution", "lead_time_days": 3, "moq": 24, "pack_size": 24, "unit_cost": 47000, "unit": "L", "version": 1 },
  { "ingredient_id": "matcha-powder", "ingredient": "Bột matcha", "supplier_id": "sup-matcha-house", "supplier_name": "Matcha House Supply", "lead_time_days": 4, "moq": 2, "pack_size": 1, "unit_cost": 480000, "unit": "kg", "version": 1 },
  { "ingredient_id": "sugar", "ingredient": "Đường", "supplier_id": "sup-minh-long", "supplier_name": "Thực phẩm Minh Long", "lead_time_days": 2, "moq": 20, "pack_size": 10, "unit_cost": 22000, "unit": "kg", "version": 1 },
  { "ingredient_id": "plastic-cups-500", "ingredient": "Ly nhựa 500ml", "supplier_id": "sup-viet-pack", "supplier_name": "Bao bì Việt Pack", "lead_time_days": 3, "moq": 500, "pack_size": 500, "unit_cost": 750, "unit": "cái", "version": 1 },
  { "ingredient_id": "banana", "ingredient": "Chuối", "supplier_id": "sup-an-phu", "supplier_name": "Nông sản An Phú", "lead_time_days": 1, "moq": 5, "pack_size": 5, "unit_cost": 24000, "unit": "kg", "version": 1 },
  { "ingredient_id": "tapioca-pearls", "ingredient": "Trân châu", "supplier_id": "sup-tra-viet", "supplier_name": "Nguyên liệu Trà Việt", "lead_time_days": 2, "moq": 10, "pack_size": 5, "unit_cost": 48000, "unit": "kg", "version": 1 },
  { "ingredient_id": "black-tea", "ingredient": "Trà đen", "supplier_id": "sup-tra-viet", "supplier_name": "Nguyên liệu Trà Việt", "lead_time_days": 3, "moq": 5, "pack_size": 1, "unit_cost": 140000, "unit": "kg", "version": 1 },
  { "ingredient_id": "orange", "ingredient": "Cam", "supplier_id": "sup-an-phu", "supplier_name": "Nông sản An Phú", "lead_time_days": 1, "moq": 10, "pack_size": 5, "unit_cost": 27520, "unit": "kg", "version": 1 },
  { "ingredient_id": "coffee-beans", "ingredient": "Cà phê hạt", "supplier_id": "sup-highland", "supplier_name": "Highland Roastery Supply", "lead_time_days": 3, "moq": 5, "pack_size": 5, "unit_cost": 180000, "unit": "kg", "version": 1 }
]
```

---

## 9. INVENTORY CONSTRAINTS

### `GET /api/v1/stores/{store_id}/inventory-constraints`
**Trang FE:** Cài đặt → Ràng buộc tồn kho (safety stock, max stock, etc.)

---

## 10. SETTINGS, ALIASES, CALENDAR

### `GET /api/v1/stores/{store_id}/settings`
Response giống `settings` trong Bootstrap.

### `PUT /api/v1/stores/{store_id}/settings`
**FE gửi:** `{ "forecast_horizon": 7, "default_strategy": "An toàn" }`

### `PUT /api/v1/stores/{store_id}/aliases`
### `PUT /api/v1/stores/{store_id}/calendar-features`

---

## 11. FORECAST RUNS

### `POST /api/v1/stores/{store_id}/forecast-runs`

**Trang FE:** Kế hoạch nhập → Bước "Dự báo"  
**FE gửi:** `{ "horizon_days": 7, "as_of_date": "2026-08-20" }`

**Expected Response `200`:**
```json
{
  "forecast_run_id": "forecast-run-mock-happy-path",
  "status": "completed",
  "created_at": "2026-08-20T10:00:00Z"
}
```

### `GET /api/v1/stores/{store_id}/forecast-runs/{forecast_run_id}/result`

**Expected Response `200`:**
```json
{
  "forecast_run_id": "forecast-run-mock-happy-path",
  "status": "completed",
  "products": [
    {
      "product_id": "milk-fresh",
      "product": "Sữa tươi",
      "unit": "L",
      "forecast": [
        { "date": "2026-08-20", "p25": 5.2, "p50": 7.0, "p75": 8.5 },
        { "date": "2026-08-21", "p25": 5.5, "p50": 7.5, "p75": 9.0 },
        { "date": "2026-08-22", "p25": 6.0, "p50": 8.2, "p75": 10.0 },
        { "date": "2026-08-23", "p25": 7.2, "p50": 9.8, "p75": 12.0 },
        { "date": "2026-08-24", "p25": 6.8, "p50": 9.2, "p75": 11.2 },
        { "date": "2026-08-25", "p25": 5.8, "p50": 7.8, "p75": 9.5 },
        { "date": "2026-08-26", "p25": 5.5, "p50": 6.5, "p75": 7.8 }
      ]
    }
  ]
}
```

---

## 12. DECISION RUNS

### `POST /api/v1/stores/{store_id}/decision-runs`

**Trang FE:** Kế hoạch nhập → Bấm "Chạy phân tích"  
**FE mong đợi:** Backend tạo Decision Run (forecast + demand + procurement).

**Expected Response `200`:**
```json
{
  "decision_run_id": "decision-run-mock-happy-path",
  "status": "completed",
  "created_at": "2026-08-20T10:00:00Z"
}
```

### `GET /api/v1/decision-runs/{decision_run_id}`

**Trang FE:** Kế hoạch nhập → Workspace hiển thị 3 kịch bản mua hàng.

**Expected Response `200`:**
```json
{
  "decision_run_id": "decision-run-mock-happy-path",
  "status": "completed",
  "as_of_date": "2026-08-20",
  "horizon_days": 7,
  "recommended_strategy": "protected",
  "business_metrics": {
    "projected_purchase_cost": 8338000,
    "expected_fill_rate": 0.988,
    "stockout_probability": 0.015,
    "expected_waste_quantity": 0
  },
  "recommended_plan": {
    "valid": true,
    "items": [
      { "ingredient_id": "milk-fresh", "ingredient_name": "Sữa tươi", "quantity": 48, "unit": "L", "supplier_name": "Sữa Việt Distribution", "supplier_id": "sup-sua-viet", "order_date": "2026-08-20", "expected_arrival_date": "2026-08-22", "estimated_cost": 1632000 },
      { "ingredient_id": "condensed-milk", "ingredient_name": "Sữa đặc", "quantity": 24, "unit": "L", "supplier_name": "Sữa Việt Distribution", "supplier_id": "sup-sua-viet", "order_date": "2026-08-20", "expected_arrival_date": "2026-08-23", "estimated_cost": 1128000 },
      { "ingredient_id": "matcha-powder", "ingredient_name": "Bột matcha", "quantity": 3, "unit": "kg", "supplier_name": "Matcha House Supply", "supplier_id": "sup-matcha-house", "order_date": "2026-08-20", "expected_arrival_date": "2026-08-24", "estimated_cost": 1440000 },
      { "ingredient_id": "sugar", "ingredient_name": "Đường", "quantity": 30, "unit": "kg", "supplier_name": "Thực phẩm Minh Long", "supplier_id": "sup-minh-long", "order_date": "2026-08-20", "expected_arrival_date": "2026-08-22", "estimated_cost": 660000 },
      { "ingredient_id": "plastic-cups-500", "ingredient_name": "Ly nhựa 500ml", "quantity": 1000, "unit": "cái", "supplier_name": "Bao bì Việt Pack", "supplier_id": "sup-viet-pack", "order_date": "2026-08-20", "expected_arrival_date": "2026-08-23", "estimated_cost": 750000 },
      { "ingredient_id": "banana", "ingredient_name": "Chuối", "quantity": 20, "unit": "kg", "supplier_name": "Nông sản An Phú", "supplier_id": "sup-an-phu", "order_date": "2026-08-20", "expected_arrival_date": "2026-08-21", "estimated_cost": 480000 },
      { "ingredient_id": "tapioca-pearls", "ingredient_name": "Trân châu", "quantity": 15, "unit": "kg", "supplier_name": "Nguyên liệu Trà Việt", "supplier_id": "sup-tra-viet", "order_date": "2026-08-20", "expected_arrival_date": "2026-08-22", "estimated_cost": 720000 },
      { "ingredient_id": "black-tea", "ingredient_name": "Trà đen", "quantity": 6, "unit": "kg", "supplier_name": "Nguyên liệu Trà Việt", "supplier_id": "sup-tra-viet", "order_date": "2026-08-20", "expected_arrival_date": "2026-08-23", "estimated_cost": 840000 },
      { "ingredient_id": "orange", "ingredient_name": "Cam", "quantity": 25, "unit": "kg", "supplier_name": "Nông sản An Phú", "supplier_id": "sup-an-phu", "order_date": "2026-08-20", "expected_arrival_date": "2026-08-21", "estimated_cost": 688000 }
    ]
  },
  "strategies": [
    { "strategy": "protected", "feasible": true, "business_metrics": { "projected_purchase_cost": 8338000, "expected_fill_rate": 0.988, "stockout_probability": 0.015 } },
    { "strategy": "balanced", "feasible": true, "business_metrics": { "projected_purchase_cost": 7650000, "expected_fill_rate": 0.965, "stockout_probability": 0.038 } },
    { "strategy": "lean", "feasible": true, "business_metrics": { "projected_purchase_cost": 6890000, "expected_fill_rate": 0.920, "stockout_probability": 0.082 } }
  ],
  "inventory_risk": [
    { "ingredient_id": "milk-fresh", "ingredient_name": "Sữa tươi", "stockout_probability": 0.08, "expected_shortage": 0, "days_of_supply": 2.1, "risk_category": "high" },
    { "ingredient_id": "condensed-milk", "ingredient_name": "Sữa đặc", "stockout_probability": 0.08, "expected_shortage": 0, "days_of_supply": 1.2, "risk_category": "high" },
    { "ingredient_id": "coffee-beans", "ingredient_name": "Cà phê hạt", "stockout_probability": 0.005, "expected_shortage": 0, "days_of_supply": 8.5, "risk_category": "low" }
  ]
}
```

> **3 chiến lược mà FE hiển thị:**
> - `protected` (An toàn): Fill Rate 98.8%, Chi phí 8.338.000 ₫
> - `balanced` (Cân bằng): Fill Rate 96.5%, Chi phí 7.650.000 ₫
> - `lean` (Tiết kiệm): Fill Rate 92.0%, Chi phí 6.890.000 ₫

---

## 13. DECISION BRIEF

### `GET /api/v1/decision-runs/{decision_run_id}/brief`

**Trang FE:** "Hôm nay" → Decision Pipeline Strip + Attention Summary + 2 Semantic Lanes  
**FE mong đợi:** Tóm tắt kế hoạch nhập hàng + nhu cầu nguyên liệu + rủi ro.

#### Expected Response `200`:
```json
{
  "decision_run_id": "decision-run-mock-happy-path",
  "store_id": "STORE_001",
  "status": "completed",
  "forecast": {
    "forecast_run_id": "forecast-run-mock-happy-path",
    "model_version": "v2.4-stochastic-saa",
    "horizon_days": 7,
    "cutoff_date": "2026-08-20"
  },
  "recommendation": {
    "available": true,
    "strategy": "protected",
    "summary": "Kế hoạch nhập hàng An toàn (Protected) được đề xuất: Nhập 9 nguyên liệu thiết yếu với tổng chi phí 8.338.000 ₫ nhằm duy trì Fill Rate 98.8% và ngăn chặn rủi ro thiếu hàng.",
    "total_purchase_cost": 8338000,
    "expected_fill_rate": 0.988
  },
  "procurement_rows": [
    { "ingredient_id": "milk-fresh", "ingredient_name": "Sữa tươi", "supplier_id": "sup-sua-viet", "supplier_name": "Sữa Việt Distribution", "quantity": 48, "unit": "L", "pack_count": 2, "pack_size": 24, "order_date": "2026-08-20", "arrival_date": "2026-08-22", "purchase_cost": 1632000, "reason_codes": ["DEMAND_EXCEEDS_AVAILABLE_SUPPLY", "LEAD_TIME_PRESSURE", "PACK_SIZE_ROUNDING"] },
    { "ingredient_id": "condensed-milk", "ingredient_name": "Sữa đặc", "supplier_id": "sup-sua-viet", "supplier_name": "Sữa Việt Distribution", "quantity": 24, "unit": "L", "pack_count": 1, "pack_size": 24, "order_date": "2026-08-20", "arrival_date": "2026-08-23", "purchase_cost": 1128000, "reason_codes": ["DEMAND_EXCEEDS_AVAILABLE_SUPPLY", "LEAD_TIME_PRESSURE", "PACK_SIZE_ROUNDING"] },
    { "ingredient_id": "banana", "ingredient_name": "Chuối", "supplier_id": "sup-an-phu", "supplier_name": "Nông sản An Phú", "quantity": 20, "unit": "kg", "pack_count": 4, "pack_size": 5, "order_date": "2026-08-20", "arrival_date": "2026-08-21", "purchase_cost": 480000, "reason_codes": ["DEMAND_EXCEEDS_AVAILABLE_SUPPLY", "EXPIRING_INVENTORY", "PACK_SIZE_ROUNDING"] },
    { "ingredient_id": "orange", "ingredient_name": "Cam", "supplier_id": "sup-an-phu", "supplier_name": "Nông sản An Phú", "quantity": 25, "unit": "kg", "pack_count": 5, "pack_size": 5, "order_date": "2026-08-20", "arrival_date": "2026-08-21", "purchase_cost": 688000, "reason_codes": ["DEMAND_EXCEEDS_AVAILABLE_SUPPLY", "PACK_SIZE_ROUNDING"] }
  ],
  "ingredient_demand": [
    { "ingredient_id": "milk-fresh", "ingredient_name": "Sữa tươi", "unit": "L", "p25": 42, "p50": 56, "p75": 68, "contributions": [] },
    { "ingredient_id": "condensed-milk", "ingredient_name": "Sữa đặc", "unit": "L", "p25": 16, "p50": 22, "p75": 28, "contributions": [] },
    { "ingredient_id": "banana", "ingredient_name": "Chuối", "unit": "kg", "p25": 26, "p50": 36, "p75": 45, "contributions": [] },
    { "ingredient_id": "orange", "ingredient_name": "Cam", "unit": "kg", "p25": 22, "p50": 32, "p75": 40, "contributions": [] },
    { "ingredient_id": "coffee-beans", "ingredient_name": "Cà phê hạt", "unit": "kg", "p25": 8.5, "p50": 11.5, "p75": 14.5, "contributions": [] }
  ],
  "risk": {
    "stockout_probability": 0.015,
    "expected_fill_rate": 0.988,
    "shortage_quantity": 0,
    "waste_quantity": 0
  },
  "critic": {
    "hard_violations": [],
    "warnings": ["Sữa đặc và Bột matcha có thời gian giao hàng 3-4 ngày, cần gửi đơn đặt hàng sớm trong hôm nay."]
  },
  "evidence": [],
  "data_availability": {
    "sales_history": "available",
    "inventory": "available",
    "recipes": "available"
  },
  "generated_at": "2026-08-20T10:00:00.000Z"
}
```

---

## 14. EXPLANATION & WHAT-IF

### `POST /api/v1/decision-runs/{decision_run_id}/explanation`

**Trang FE:** Kế hoạch nhập → Bấm "Giải thích"  
**FE gửi:**
```json
{ "language": "vi", "detail_level": "simple", "question": "Tại sao chọn kế hoạch này?" }
```

**Expected Response `200`:**
```json
{
  "source": "shelfcash-decision-engine-v2",
  "language": "vi",
  "detail_level": "simple",
  "intent": "explain_procurement_plan",
  "decision_run_id": "decision-run-mock-happy-path",
  "summary": "Giải thích cơ sở ra quyết định của thuật toán tối ưu nhập hàng ShelfCash",
  "answer": "Chiến lược An toàn (Protected) được chọn vì mô hình phát hiện biến động nhu cầu tăng vào dịp cuối tuần sắp tới. Kế hoạch đảm bảo tỷ lệ đáp ứng đơn hàng (Fill Rate) đạt 98.8% với chi phí 8.338.000 ₫ (vẫn nằm trong 68% ngân sách khả dụng).",
  "why_this_plan": [
    "Bảo vệ nguồn cung trước nhu cầu cao điểm cuối tuần",
    "Tối ưu chi phí vận chuyển bằng cách gộp đơn NCC",
    "Làm tròn theo quy cách đóng gói (thùng/bao) giúp hưởng giá sỉ"
  ],
  "main_risks": [
    "Nhà cung cấp Sữa Việt có thể giao trễ nếu đặt sau 15:00 hôm nay",
    "Chuối có 3kg sắp hết hạn cần ưu tiên xuất kho trước (FEFO)"
  ],
  "tradeoffs": [
    "Chi phí tồn trữ cao hơn 8.5% so với chiến lược Tiết kiệm để đổi lấy 98.8% Fill Rate"
  ],
  "important_assumptions": [
    "Lead time nhà cung cấp đúng cam kết (1-3 ngày)",
    "Không có biến động đột biến ngoài dự báo thời tiết"
  ]
}
```

### `POST /api/v1/decision-runs/{decision_run_id}/what-if`

**Trang FE:** Kế hoạch nhập → Mô phỏng thay đổi  
**FE gửi:**
```json
{
  "demand_multiplier": 1.2,
  "supplier_delay_days": 1,
  "budget_limit": null,
  "strategy": null
}
```

**FE mong đợi:** So sánh baseline vs hypothetical + giải thích bằng tiếng Việt.

**Expected Response `200`:**
```json
{
  "scenario_id": "what-if-1724140800000",
  "comparison": {
    "purchase_cost_delta": 1734288,
    "expected_fill_rate_delta": -0.018,
    "stockout_probability_delta": 0.024
  },
  "baseline": { "procurement_rows": "<<< same as brief >>>", "ingredient_demand": "<<< same as brief >>>" },
  "hypothetical": { "procurement_rows": "<<< adjusted quantities >>>", "ingredient_demand": "<<< scaled p50 >>>" },
  "grounded_explanation": {
    "source": "mock-simulator",
    "language": "vi",
    "detail_level": "simple",
    "intent": "what_if_analysis",
    "decision_run_id": "decision-run-mock-happy-path",
    "summary": "Kết quả giả lập thay đổi",
    "answer": "Khi nhu cầu tăng 20% và trễ giao hàng 1 ngày, chi phí nhập hàng dự kiến tăng thêm 1.734.288 ₫ để bảo đảm không đứt gãy nguồn cung."
  }
}
```

---

## 15. PURCHASE ORDERS

### `GET /api/v1/stores/{store_id}/purchase-orders`
**Trang FE:** Kế hoạch nhập → Lịch sử đơn hàng  
**FE mong đợi:** Danh sách các đơn đặt hàng đã tạo từ Decision Run.

### `POST /api/v1/stores/{store_id}/purchase-orders`
**Trang FE:** Kế hoạch nhập → Tạo đơn đặt hàng từ kịch bản chọn  
**Headers:** `Idempotency-Key: <UUID>`

### `POST /api/v1/stores/{store_id}/purchase-orders/{po_id}/receive`
**Trang FE:** Chi nhánh / Nhân viên (Nhận hàng)  
**Mục đích:** Xác nhận hàng thực nhận từ PO đã duyệt, tạo lô hàng (lots) mới vào kho và hỗ trợ nhận một phần (partial receipt).  
**Headers:** `Idempotency-Key: <UUID>`

#### Request Payload:
```json
{
  "received_at": "2026-08-29T10:30:00+07:00",
  "received_by": "user-staff-001",
  "lines": [
    {
      "line_id": "POL_001",
      "ingredient_id": "black-tea",
      "received_quantity": 0.95,
      "unit": "kg",
      "lots": [
        {
          "batch_id": "LOT-TRA-20260829-01",
          "quantity": 0.95,
          "expiry_date": "2027-02-28",
          "storage_location": "Kho khô A",
          "condition": "accepted"
        }
      ],
      "note": "Giao thiếu 0.05kg do hao hụt bao bì nhà xe"
    }
  ]
}
```

*Supported `condition`:* `accepted`, `damaged`, `short_delivery`, `wrong_item`, `rejected`.

#### Expected Response `200`:
```json
{
  "po_id": "PO_001",
  "status": "partially_received",
  "received_at": "2026-08-29T10:30:00+07:00",
  "created_lots": [
    {
      "lot_id": "lot-generated-001",
      "batch_id": "LOT-TRA-20260829-01",
      "ingredient_id": "black-tea",
      "quantity": 0.95,
      "unit": "kg"
    }
  ]
}
```

---

## 16. STAFF / BRANCH OPERATIONS API
> ⚠️ **STATUS: PROPOSED — BACKEND NOT IMPLEMENTED**  
> Frontend hiện đang sử dụng UI shell rỗng với feature flags để sẵn sàng kết nối khi Backend hoàn thiện.

### Nguyên tắc thiết kế:
1. **Không tạo endpoint song song:** Tái sử dụng `POST .../inventory-counts` và `POST .../purchase-orders/{po_id}/receive` cho nghiệp vụ kho và nhận hàng.
2. **Bảo mật phân quyền:** Frontend Portal Mode (`requested_portal`) chỉ là UI Intent. Backend phải là thẩm quyền bảo mật duy nhất xác thực `role`, `permissions` và `allowed_portals`.
3. **Idempotency:** Mọi mutation (nhận hàng, kiểm kho, gửi báo cáo) bắt buộc có header `Idempotency-Key`.

---

### 16.1. Authentication & Portal Context

#### `POST /api/v1/auth/login`
**Mục đích:** Xác thực người dùng và phân quyền portal truy cập.

#### Request:
```json
{
  "username": "staff01",
  "password": "••••••••",
  "requested_portal": "staff"
}
```

#### Expected Response `200` (Staff):
```json
{
  "session": {
    "user_id": "user-staff-001",
    "name": "Nguyễn Văn A",
    "email": "staff01@shelfcash.vn",
    "role": "store_staff",
    "role_label": "Nhân viên chi nhánh",
    "store_id": "STORE_001",
    "store_name": "ShelfCash Flagship Coffee & Tea",
    "allowed_portals": ["staff"],
    "permissions": [
      "STAFF_VIEW_TASKS",
      "STAFF_RECEIVE_GOODS",
      "STAFF_COUNT_INVENTORY",
      "STAFF_REPORT_ISSUE"
    ]
  }
}
```

#### Expected Response `200` (Manager):
```json
{
  "session": {
    "user_id": "user-01",
    "name": "Nguyễn Minh Tuấn",
    "email": "admin@shelfcash.vn",
    "role": "store_manager",
    "role_label": "Quản lý cửa hàng",
    "store_id": "STORE_001",
    "store_name": "ShelfCash Flagship Coffee & Tea",
    "allowed_portals": ["manager", "staff"],
    "permissions": ["ALL"]
  }
}
```

---

### 16.2. Staff Bootstrap

#### `GET /api/v1/stores/{store_id}/staff/bootstrap`
**Mục đích:** Tải cấu hình và số liệu tổng quan nhẹ cho ca làm việc của chi nhánh.

#### Expected Response `200`:
```json
{
  "today": "2026-08-29",
  "store": {
    "store_id": "STORE_001",
    "store_name": "ShelfCash Flagship Coffee & Tea",
    "timezone": "Asia/Ho_Chi_Minh"
  },
  "staff": {
    "user_id": "user-staff-001",
    "name": "Nguyễn Văn A",
    "role": "store_staff"
  },
  "summary": {
    "pending_tasks": 0,
    "receipts_due_today": 0,
    "inventory_counts_due": 0,
    "open_issues": 0
  }
}
```

---

### 16.3. Staff Tasks (Hôm nay)

#### `GET /api/v1/stores/{store_id}/staff/tasks`
**Query params:** `date=2026-08-29`, `status=pending`  
**Mục đích:** Danh sách công việc cần làm trong ca (WHAT, WHEN, ACTION). Không chứa analytics phức tạp.

#### Expected Response `200`:
```json
{
  "date": "2026-08-29",
  "summary": {
    "pending": 2,
    "in_progress": 1,
    "completed": 3
  },
  "tasks": [
    {
      "task_id": "TASK_001",
      "task_type": "receive_goods",
      "title": "Nhận hàng Tea Source VN (1 kg Trà đen)",
      "status": "pending",
      "priority": "normal",
      "due_at": "2026-08-29T10:00:00+07:00",
      "source_type": "purchase_order",
      "source_id": "PO_001",
      "action": {
        "destination": "receiving",
        "resource_id": "PO_001"
      }
    }
  ]
}
```

#### `PATCH /api/v1/stores/{store_id}/staff/tasks/{task_id}`
**Headers:** `Idempotency-Key: <UUID>`  
**Request:**
```json
{
  "status": "completed",
  "completed_at": "2026-08-29T10:42:00+07:00"
}
```

---

### 16.4. Staff Receipts (Nhận hàng)

#### `GET /api/v1/stores/{store_id}/staff/receipts`
**Query params:** `date=2026-08-29`, `status=due`  
**Expected Response `200`:**
```json
{
  "items": [
    {
      "po_id": "PO_001",
      "supplier_id": "sup-tra-viet",
      "supplier_name": "Nguyên liệu Trà Việt",
      "expected_delivery_date": "2026-08-29",
      "status": "due",
      "lines": [
        {
          "line_id": "POL_001",
          "ingredient_id": "black-tea",
          "ingredient_name": "Trà đen",
          "ordered_quantity": 1,
          "unit": "kg"
        }
      ]
    }
  ]
}
```

*(Mutation xác nhận nhận hàng sử dụng canonical endpoint `POST /api/v1/stores/{store_id}/purchase-orders/{po_id}/receive` tại Section 15).*

---

### 16.5. Staff Inventory Count Sessions (Kiểm kho)

#### `GET /api/v1/stores/{store_id}/staff/inventory-counts`
**Query params:** `date=2026-08-29`, `status=pending`  
**Expected Response `200`:**
```json
{
  "sessions": [
    {
      "count_session_id": "COUNT_001",
      "title": "Kiểm kho cuối ca",
      "due_at": "2026-08-29T22:00:00+07:00",
      "status": "pending",
      "items": [
        {
          "lot_id": "lot-sua-01",
          "ingredient_id": "milk-fresh",
          "ingredient_name": "Sữa tươi",
          "system_quantity": 18,
          "unit": "L",
          "expected_version": 1
        }
      ]
    }
  ]
}
```

*(Mutation gửi kết quả kiểm kho sử dụng canonical endpoint `POST /api/v1/stores/{store_id}/inventory-counts` tại Section 5).*

---

### 16.6. Operational Issues (Báo vấn đề)

#### `GET /api/v1/stores/{store_id}/operational-issues`
**Query params:** `status=open`, `reported_by=user-staff-001`  
**Expected Response `200`:**
```json
{
  "items": []
}
```

#### `POST /api/v1/stores/{store_id}/operational-issues`
**Headers:** `Idempotency-Key: <UUID>`  
**Request:**
```json
{
  "issue_type": "stock_mismatch",
  "reported_at": "2026-08-29T14:20:00+07:00",
  "reported_by": "user-staff-001",
  "ingredient_id": "milk-fresh",
  "lot_id": "lot-sua-01",
  "po_id": null,
  "system_quantity": 8,
  "observed_quantity": 0,
  "unit": "L",
  "note": "Không còn hàng thực tế tại kho lạnh."
}
```

*Supported `issue_type`:* `stock_mismatch`, `damaged_goods`, `expired_goods`, `delivery_shortage`, `wrong_item`, `stockout`, `other`.

#### Expected Response `201`:
```json
{
  "issue_id": "ISSUE_001",
  "status": "open",
  "issue_type": "stock_mismatch",
  "reported_at": "2026-08-29T14:20:00+07:00",
  "reported_by": "user-staff-001",
  "store_id": "STORE_001"
}
```

---

### 16.7. Staff Error Codes (Tương lai)
Khi Backend xử lý các mutation của Staff, bổ sung các mã lỗi chuẩn:
* `STAFF_PERMISSION_DENIED`
* `TASK_NOT_FOUND`
* `TASK_ALREADY_COMPLETED`
* `TASK_STATE_CONFLICT`
* `RECEIPT_NOT_FOUND`
* `RECEIPT_ALREADY_COMPLETED`
* `RECEIVED_QUANTITY_INVALID`
* `LOT_METADATA_REQUIRED`
* `COUNT_SESSION_NOT_FOUND`
* `COUNT_SESSION_ALREADY_COMPLETED`
* `COUNT_VARIANCE_REVIEW_REQUIRED`
* `OPERATIONAL_ISSUE_NOT_FOUND`
* `OPERATIONAL_ISSUE_INVALID`

---

## 17. OPPORTUNITY RECOMMENDATION

> ⚠️ **TRẠNG THÁI: PROPOSED / BACKEND CHƯA TRIỂN KHAI**  
> Frontend hiện đang sử dụng **Preview Mode (Dev Adapter)** độc lập. Khi Backend triển khai các endpoint dưới đây, frontend sẽ chuyển sang **Live Mode** thông qua biến môi trường `NEXT_PUBLIC_SHELFCASH_OPPORTUNITY_MODE=live`.

### 17.1. Tạo phiên quét cơ hội (Create Opportunity Run)
`POST /api/v1/stores/{store_id}/opportunity-runs`  
**Headers:** `Content-Type: application/json`

#### Request Body:
```json
{
  "radius_km": 3,
  "trial_budget": 2000000
}
```

#### Expected Response `201`:
```json
{
  "run_id": "opp-run-1725102000",
  "store_id": "STORE_001",
  "radius_km": 3,
  "trial_budget": 2000000,
  "status": "scanning",
  "current_stage_index": 1,
  "total_stages": 5,
  "progress_percent": 20,
  "stage_message": "Đang quét khu vực 3 km...",
  "scanned_count": 12,
  "total_pois_count": 31,
  "created_at": "2026-08-31T19:30:00.000Z"
}
```

---

### 17.2. Lấy trạng thái phiên quét (Get Opportunity Run Status)
`GET /api/v1/stores/{store_id}/opportunity-runs/{run_id}`

#### Expected Response `200`:
```json
{
  "run_id": "opp-run-1725102000",
  "store_id": "STORE_001",
  "status": "completed",
  "progress_percent": 100,
  "stage_message": "Hoàn tất phân tích cơ hội.",
  "created_at": "2026-08-31T19:30:00.000Z",
  "completed_at": "2026-08-31T19:30:04.000Z"
}
```

---

### 17.3. Lấy kết quả đề xuất & danh mục thử nghiệm (Get Opportunity Result)
`GET /api/v1/stores/{store_id}/opportunity-runs/{run_id}/result`

#### Expected Response `200`:
```json
{
  "run_id": "opp-run-1725102000",
  "store_id": "STORE_001",
  "status": "completed",
  "local_context": {
    "radius_km": 3,
    "total_pois": 31,
    "scanned_pois": 31,
    "metrics": [
      { "key": "university", "label": "Trường / Đại học", "count": 6 },
      { "key": "transit", "label": "Transit", "count": 4 },
      { "key": "competition", "label": "Cạnh tranh", "count": 18 },
      { "key": "retail", "label": "Retail bổ trợ", "count": 11 }
    ],
    "signals": [
      { "key": "students", "label": "Sinh viên cao" },
      { "key": "to_go", "label": "Mang đi mạnh" },
      { "key": "rainy_season", "label": "Mùa mưa" }
    ]
  },
  "ranked_candidates": [
    {
      "id": "cand-tra-lai",
      "name": "Trà Lài",
      "category": "Trà & Giải khát",
      "domain": "same_domain",
      "opportunity_score": 0.82,
      "rank": 1,
      "criteria": {
        "area_fit": "Cao",
        "ingredient_leverage": "Rất cao",
        "menu_differentiation": "Tốt",
        "complexity": "Thấp"
      },
      "price_range": { "min": 32000, "max": 38000 },
      "trial_cost": 480000,
      "key_highlights": [
        "Dùng lại nguyên liệu hiện có",
        "Phù hợp nhóm khách quanh khu vực"
      ],
      "why_path": [
        "Đại học tập trung cao",
        "Nhóm khách sinh viên",
        "Ưu tiên nhanh / mang đi",
        "Trà Lài",
        "Tận dụng nguyên liệu hiện có",
        "Chi phí thử thấp"
      ],
      "reusable_ingredients": ["Trà xanh hoa lài", "Đường mía", "Đá viên"],
      "new_ingredients": ["Hoa lài sấy khô trang trí"]
    }
  ],
  "trial_portfolio": {
    "budget": 2000000,
    "allocated_cost": 1620000,
    "remaining_budget": 380000,
    "candidate_count": 3,
    "items": [
      {
        "candidate_id": "cand-tra-lai",
        "candidate_name": "Trà Lài",
        "trial_cost": 480000,
        "score": 0.82,
        "selected": true
      }
    ]
  }
}
```

---

## PHỤ LỤC: DANH SÁCH IDs TOÀN HỆ THỐNG

### 10 Nguyên liệu (Ingredient IDs)
| ID | Tên | Đơn vị | NCC |
|---|---|---|---|
| `milk-fresh` | Sữa tươi | L | Sữa Việt Distribution |
| `condensed-milk` | Sữa đặc | L | Sữa Việt Distribution |
| `matcha-powder` | Bột matcha | kg | Matcha House Supply |
| `sugar` | Đường | kg | Thực phẩm Minh Long |
| `plastic-cups-500` | Ly nhựa 500ml | cái | Bao bì Việt Pack |
| `banana` | Chuối | kg | Nông sản An Phú |
| `tapioca-pearls` | Trân châu | kg | Nguyên liệu Trà Việt |
| `black-tea` | Trà đen | kg | Nguyên liệu Trà Việt |
| `orange` | Cam | kg | Nông sản An Phú |
| `coffee-beans` | Cà phê hạt | kg | Highland Roastery Supply |

### 6 Nhà cung cấp (Supplier IDs)
| ID | Tên | Lead Time |
|---|---|---|
| `sup-sua-viet` | Sữa Việt Distribution | 2-3 ngày |
| `sup-matcha-house` | Matcha House Supply | 4 ngày |
| `sup-minh-long` | Thực phẩm Minh Long | 2 ngày |
| `sup-viet-pack` | Bao bì Việt Pack | 3 ngày |
| `sup-an-phu` | Nông sản An Phú | 1 ngày |
| `sup-tra-viet` | Nguyên liệu Trà Việt | 2-3 ngày |
| `sup-highland` | Highland Roastery Supply | 3 ngày |

### 12 Sản phẩm Menu (Product IDs)
| ID | Tên | Loại | Giá |
|---|---|---|---|
| `PROD_CAFE_DEN` | Cà phê đen đá | single | 29.000 ₫ |
| `PROD_CAFE_SUA` | Cà phê sữa đá | single | 35.000 ₫ |
| `PROD_TRA_DAO` | Trà đào | single | 39.000 ₫ |
| `PROD_TRA_SUA` | Trà sữa trân châu | single | 45.000 ₫ |
| `PROD_MATCHA_LATTE` | Matcha Latte | single | 49.000 ₫ |
| `PROD_SINH_TO_CHUOI` | Sinh tố chuối | single | 45.000 ₫ |
| `PROD_NUOC_CAM` | Nước cam | single | 42.000 ₫ |
| `PROD_SIGNATURE_COFFEE` | Cà phê sữa đặc biệt | single | 49.000 ₫ |
| `PROD_MATCHA_CREAM` | Matcha Kem Sữa | single | 55.000 ₫ |
| `PROD_BLACK_MILK_TEA` | Trà đen sữa | single (inactive) | 42.000 ₫ |
| `COMBO_BREAKFAST` | Combo Cà phê sáng | combo | 59.000 ₫ |
| `COMBO_FRIENDS` | Combo Bạn bè | combo | 119.000 ₫ |

### 2 Lô hàng gần hạn (Expiring Lots)
| Lot ID | Nguyên liệu | Hạn sử dụng | Số ngày còn lại (từ 20/08) |
|---|---|---|---|
| `lot-cam-01` | Cam (3.28 kg) | 2026-08-24 | **4 ngày** |
| `lot-chuoi-01` | Chuối (8 kg) | 2026-08-26 | **6 ngày** |

---

> **Tài liệu được tạo tự động từ `lib/mock-data.ts`, `lib/mock-service.ts`, `lib/types.ts` và `lib/api-contract.ts` của ShelfCash Frontend.**
