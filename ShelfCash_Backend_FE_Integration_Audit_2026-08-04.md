# BIÊN BẢN TỔNG HỢP KỸ THUẬT

## Cơ chế hoạt động Backend ShelfCash và logic tích hợp Frontend đề xuất

**Ngày đối chiếu:** 04/08/2026  
**Nguồn phân tích:** shelfCash_backend-main(1).zip  
**Revision trong archive:** bc54ac1822befa916da72d90cd1df2d8fb0cfd1d  
**Migration head thực tế:** 20260804_0016  
**Mục đích:** dùng làm nguồn kỹ thuật để Codex chỉnh lại frontend ShelfCash theo đúng backend hiện tại.

---

## 0. Mức độ kiểm chứng

Biên bản này ưu tiên source code thực tế theo thứ tự:

1. Router FastAPI trong app/api.
2. Pydantic request/response schema trong app/schemas.
3. Service, repository và SQLAlchemy model.
4. Alembic migration.
5. Test theo route và hành vi.
6. Tài liệu trong docs chỉ dùng để đối chiếu, không được ưu tiên hơn code.

Kết quả kiểm tra:

- Có **61 API operation thực tế** và manifest hiện tại cũng có **61 operation**.
- Toàn bộ app, forecast core và script vượt qua kiểm tra cú pháp bằng compileall.
- Repo chứa 142 hàm test, nhưng môi trường phân tích không có dependency FastAPI/SQLAlchemy/LightGBM nên không chạy runtime test.
- README.md, API_IMPLEMENTATION_STATUS.md và API_OPERATION_BEHAVIOR_AUDIT.md vẫn còn các con số cũ như 53 operation, migration 0008 hoặc forecast “model-blocked”. Các thông tin đó đã lỗi thời so với source hiện tại.

Kết luận: khi sửa frontend, Codex phải coi **biên bản này và source router/service hiện tại** là nguồn đúng; không khôi phục logic theo contract cũ.

---

## 1. Kết luận điều hành

Backend hiện tại đã có đủ chuỗi nghiệp vụ chính:

1. Nhập Excel/CSV.
2. Rule/Qwen gợi ý loại sheet và mapping cột.
3. Người dùng xác nhận hoặc bỏ qua từng sheet.
4. Chuẩn hóa và ghi dữ liệu canonical vào database theo transaction.
5. Huấn luyện Forecast Core.
6. Dự báo nhu cầu sản phẩm P25/P50/P75.
7. Recipe/BOM chuyển nhu cầu sản phẩm thành nhu cầu nguyên liệu.
8. Mô phỏng tồn kho theo lot, hạn dùng và FEFO.
9. Tạo ba kịch bản mua hàng.
10. Tạo, xác nhận và nhận Purchase Order.

Backend **không còn chỉ là placeholder**. Forecast Core dùng LightGBM quantile, calibration và artifacts thật. Planning cũng chạy thật, nhưng cần mô tả chính xác là **decision planning theo luật xác định**, chưa phải mathematical optimizer dùng solver.

Frontend nên dùng các endpoint store-scoped:

- /api/v1/stores/{store_id}/forecast-runs
- /api/v1/stores/{store_id}/forecast-runs/{forecast_run_id}/ingredient-demand
- /api/v1/stores/{store_id}/forecast-runs/{forecast_run_id}/procurement-plans
- /api/v1/stores/{store_id}/plan-runs
- /api/v1/stores/{store_id}/purchase-orders

Hai endpoint /api/v1/forecasts và /api/v1/forecasts/{id} đã deprecated, không dùng cho code frontend mới.

Các nguyên tắc frontend quan trọng nhất:

- Không tự tạo dữ liệu forecast hoặc plan giả khi backend báo MODEL_NOT_READY.
- Không coi purchase history là đã tăng tồn kho.
- Không gán recipe trực tiếp cho combo.
- Không bỏ qua version khi update.
- Không tái sử dụng Idempotency-Key cho một payload đã thay đổi.
- Không xóa file người dùng vừa chọn khi chuyển tab hoặc khi upload lỗi.
- Nếu loại dữ liệu là unknown/không xác định, gửi skip=true khi xác nhận và không xử lý sheet đó.
- Giới hạn forecast hiện tại trên UI là 1–7 ngày, dù một vài schema/settings cho phép tới 90.

---

## 2. Kiến trúc và cơ chế chạy tổng thể

Backend là ứng dụng FastAPI đồng bộ, dùng SQLAlchemy, Alembic và mặc định SQLite.

~~~mermaid
flowchart TD
    FE["React frontend"] --> API["FastAPI /api/v1"]
    API --> Import["Import + mapping"]
    API --> Domain["Catalog, inventory, history"]
    API --> Forecast["Forecast Core"]
    Forecast --> BOM["Recipe/BOM expansion"]
    BOM --> Plan["Inventory simulation + planning"]
    Plan --> PO["Purchase Order lifecycle"]
    Import --> DB["Canonical database"]
    Domain --> DB
    Forecast --> DB
    BOM --> DB
    Plan --> DB
    PO --> DB
~~~

### 2.1 Startup

Khi FastAPI khởi động:

- Tạo thư mục upload, result và forecast artifact nếu chưa có.
- Tạo database engine và session factory.
- Khởi tạo LLM provider.
- Nếu LLM_PROVIDER=local_qwen thì load model một lần trong lifespan.
- Khởi tạo ImportService, CatalogApiService, MenuService, RecipeApiService, OperationalService, ForecastService, DecisionPlanningService và CompletionService.

Ứng dụng **không tự chạy Alembic migration** và không tự seed store. Deployment phải chạy:

1. alembic upgrade head
2. python -m scripts.seed_database, hoặc tự tạo store hợp lệ bằng cơ chế triển khai riêng.

### 2.2 Đặc điểm xử lý

- Các request hiện chạy đồng bộ; chưa có queue/background worker.
- Import process, forecast training, forecast inference và planning có thể giữ request lâu.
- Mỗi nghiệp vụ chính ghi database theo transaction.
- Import business persistence là all-or-nothing: một row lỗi làm rollback toàn bộ lần process.
- Forecast run, demand run, planning run và plan result được persist; GET chỉ đọc kết quả đã lưu, không inference lại.
- Audit log và idempotency record được ghi cho nhiều mutation quan trọng.

---

## 3. Quy ước giao tiếp toàn cục

### 3.1 Base URL

Route thật trong backend:

- Public health: /health
- API versioned: /api/v1/...

Nếu deployment có reverse proxy prefix như /api/shelfcash thì frontend phải cấu hình một API root duy nhất. Ví dụ:

- API_ROOT=/api/shelfcash
- Health = API_ROOT + /health
- Versioned API = API_ROOT + /api/v1

Không hardcode nhiều biến thể URL trong từng component.

### 3.2 API key

Khi SHELFCASH_API_KEY trong backend khác rỗng, các endpoint protected yêu cầu:

    X-ShelfCash-Key: <key>

Public:

- GET /health
- GET /api/v1/llm/health

POST /api/v1/llm/map-sheet và gần như toàn bộ endpoint /api/v1 còn lại được bảo vệ.

Trong production, không đặt secret thật trong VITE_* vì giá trị này được build vào JavaScript phía client. Nên dùng Node/BFF hoặc reverse proxy để chèn header. Với bản demo nội bộ, nếu vẫn đưa key vào frontend thì phải hiểu đây không phải biện pháp bảo mật production.

### 3.3 Request ID

Frontend nên tạo UUID cho mỗi request và gửi:

    X-Request-ID: <uuid>

Backend luôn trả X-Request-ID và error body có request_id. UI lỗi nên có nút “Sao chép mã yêu cầu” để tra log.

### 3.4 Error envelope

Mọi lỗi chuẩn có dạng:

~~~json
{
  "code": "VERSION_CONFLICT",
  "message": "Phiên bản dữ liệu đã thay đổi.",
  "details": {
    "expected_version": 2,
    "current_version": 3
  },
  "request_id": "..."
}
~~~

Frontend không được chỉ đọc message. Phải điều hướng hành vi bằng HTTP status + code.

### 3.5 Idempotency

Mutation hỗ trợ idempotency nhận:

    Idempotency-Key: <uuid ổn định cho một lần người dùng bấm>

Quy tắc:

- Tạo key mới khi người dùng bắt đầu một hành động mới.
- Giữ nguyên key khi retry do timeout/mất mạng nhưng payload không đổi.
- Nếu payload đổi, bắt buộc tạo key mới.
- Sau MODEL_NOT_READY, nếu model đã được train và người dùng chạy forecast lại, phải tạo key mới; nếu dùng key cũ backend sẽ replay blocked run cũ.

### 3.6 Dữ liệu số và ngày

Backend hiện chưa nhất quán hoàn toàn:

- Decimal trong inventory, recipe, supplier term và PO thường serialize thành chuỗi.
- Forecast/planning thường trả float.
- Tiền VND dùng integer.

Frontend nên có:

    type DecimalLike = string | number

và một hàm chuyển số tập trung. Không cộng chuỗi trực tiếp.

Ngày YYYY-MM-DD là local business date, không parse rồi chuyển timezone nếu chỉ để hiển thị ngày. Datetime cho PO confirm/receive phải có timezone offset, ví dụ 2026-08-04T17:30:00+07:00.

### 3.7 Pagination

Envelope phổ biến:

~~~json
{
  "items": [],
  "page": 1,
  "page_size": 50,
  "total": 0
}
~~~

Một số endpoint vẫn trả page=1/page_size=50 cố định dù dữ liệu không thật sự được paginate. Frontend vẫn nên giữ type Page<T>, nhưng không giả định mọi list đều hỗ trợ chuyển trang.

---

## 4. Mô hình dữ liệu nghiệp vụ

| Nhóm | Thực thể chính | Ý nghĩa |
|---|---|---|
| Cửa hàng | stores, store_settings, budget_periods | Store, cấu hình và ngân sách theo tháng |
| Catalog | ingredients, ingredient_aliases, products, suppliers | Danh mục canonical theo store |
| Menu | products, product_bundle_lines | Single/variant/combo; Menu là read model, không phải bảng riêng |
| Recipe | recipe_versions, recipe_lines | Recipe có version và khoảng hiệu lực |
| Tồn kho | inventory_lots, inventory_movements | Số dư được tính từ tổng movement theo lot |
| Lịch sử | sales_daily, usage_daily, purchase_receipts | Sales, usage, purchase là ba nguồn riêng |
| Điều kiện | supplier_ingredient_terms, inventory_constraints | MOQ/pack/cost khác safety stock/capacity |
| Import | import_jobs, files, profiles, mappings, issues | Workflow import normalized |
| Forecast | forecast_model_versions, forecast_runs, forecast_predictions | Model/artifact, run và kết quả |
| Planning | ingredient_demand_runs/predictions, procurement_plan_runs/plans/lines | BOM và ba kịch bản planning |
| Tương thích FE/PO | plan_runs, recommendations, purchase_orders, purchase_order_lines | Bridge từ plan sang Draft PO |
| Hạ tầng | audit_logs, idempotency_records | Truy vết và chống ghi lặp |

Điểm cần hiểu đúng:

- Product single có recipe.
- Product combo không có recipe trực tiếp; combo chứa component product, mỗi component single mới có recipe.
- Inventory lot không lưu “on hand” như một cột cập nhật liên tục; on hand là tổng quantity_delta trong movements.
- Supplier term và inventory constraint là hai nguồn khác nhau, phải join bằng ingredient_id nếu hiển thị chung.

---

## 5. Cơ chế Import

### 5.1 State machine

Public status:

~~~mermaid
stateDiagram-v2
    [*] --> awaiting_review
    awaiting_review --> confirmed: confirm mapping
    confirmed --> processed: process thành công
    confirmed --> failed: process lỗi
    failed --> [*]
    processed --> [*]
~~~

Internal status mapping:

| Internal | Public |
|---|---|
| mapping_required | awaiting_review |
| confirmed | confirmed |
| processing | confirmed |
| completed | processed |
| failed | failed |

Vì processing vẫn public là confirmed và process đang chạy đồng bộ, frontend nên dùng loading state của chính POST /process thay vì polling public status để suy ra processing.

### 5.2 Upload và mapping

POST /api/v1/imports dùng multipart/form-data:

- files: một hoặc nhiều file, append cùng key files.
- store_id: bắt buộc.
- forecast_date: tùy chọn.
- forecast_horizon: mặc định 7.
- Idempotency-Key: khuyến nghị.

Giới hạn mặc định:

- 10 file/request.
- 12 MB/file.
- 50 MB/request.
- 30 sheet/file.
- 100.000 row/sheet.
- 8 sample row gửi vào mapper/Qwen.
- Định dạng: .xlsx, .xls, .xlsm, .csv.

Frontend **không tự đặt Content-Type** cho FormData; browser phải tự thêm multipart boundary.

Backend:

1. Sanitize filename.
2. Đọc và profile từng sheet.
3. Chỉ gửi profile + tối đa 8 sample row vào Qwen, không gửi toàn workbook.
4. Rule mapper chạy trước.
5. Nếu confidence đủ ngưỡng thì dùng rule.
6. Nếu thấp và Qwen sẵn sàng thì gọi Qwen.
7. Nếu Qwen lỗi/không có thì dùng rule fallback và requires_review=true.
8. Lưu file, profile, mapping suggestion và issue vào DB.

Response có ba biểu diễn liên quan:

- sheets: profile + mapping theo từng sheet.
- profiles: profile phẳng.
- suggested_mappings: mapping phẳng.

Frontend nên join bằng profile_id. Không join bằng sheet_name vì tên sheet có thể trùng giữa nhiều file.

### 5.3 Canonical sheet types

| sheet_type | Core fields | Side effect khi process |
|---|---|---|
| inventory | ingredient_name, on_hand | Tạo/resolve ingredient; tạo hoặc reconcile lot; ghi movement opening_balance/physical_count_adjustment |
| sales_history | date, product_name, quantity_sold | Tạo/resolve product; upsert sales aggregate |
| usage_history | date, ingredient_name, quantity_used | Tạo/resolve ingredient; upsert usage |
| recipes | product_name, ingredient_name, ingredient_quantity | Resolve product/ingredient; tạo recipe version |
| purchase_history | purchase_date, ingredient_name, quantity_received | Ghi purchase receipt; **không tăng inventory** |
| supplier_constraints | supplier_name, ingredient_name, minimum_order_quantity, order_unit, package_size, package_base_unit | Tạo supplier/ingredient nếu cần; tạo version supplier term |
| calendar_features | date | Upsert calendar |
| business_constraints | constraint_type, value | Ghi settings hoặc inventory constraint có version |
| menu | product_sku, item_type, product_name, selling_price | Upsert product và relational combo components |
| unknown | không có | Không persist row |

### 5.4 Confirm mapping

POST /api/v1/imports/{import_id}/confirm:

~~~json
{
  "mappings": [
    {
      "profile_id": "...",
      "sheet_type": "sales_history",
      "column_mapping": {
        "Ngày": "date",
        "Tên sản phẩm": "product_name",
        "Số lượng": "quantity_sold"
      },
      "skip": false
    }
  ]
}
~~~

Mỗi source column nên có key trong column_mapping; value là canonical field hoặc null.

Nếu người dùng chọn “Không xác định”:

~~~json
{
  "profile_id": "...",
  "sheet_type": "unknown",
  "column_mapping": {},
  "skip": true
}
~~~

Không gọi thêm logic phân tích cho sheet đó, không bắt người dùng map cột, và không tạo business data.

### 5.5 Process

POST /api/v1/imports/{import_id}/process chỉ hợp lệ sau confirmed.

Backend:

1. Normalize row theo mapping.
2. Validate core fields.
3. Nếu có row invalid: rollback toàn bộ business persistence.
4. Nếu hợp lệ: persist tất cả sheet trong một transaction.
5. Lưu canonical result JSON.
6. Chuyển trạng thái processed.

Gọi process lần nữa sau thành công là idempotent ở mức nghiệp vụ và trả kết quả cũ. Nếu import đã failed thì không thể confirm/process lại bằng API hiện tại; frontend phải hướng dẫn người dùng tạo import mới.

GET /api/v1/imports/{id}/result chỉ hợp lệ khi đã có result; trước đó trả IMPORT_NOT_READY, HTTP 425.

### 5.6 Side effect dễ hiểu sai

- Import inventory có tác động tới lot/movement.
- Import purchase_history chỉ là lịch sử nhập hàng; không tạo tồn kho.
- POST purchase-history/batch cũng bắt buộc inventory_effect=record_only và trả inventory_applied=false.
- Import sales_history không tự rebuild usage_history.
- POST sales-history/batch có thể rebuild usage từ recipe và trả warning RECIPE_NOT_FOUND.
- Vì vậy UI không được dùng một toast chung “Đã cập nhật tồn kho” cho mọi loại file.

### 5.7 Logic frontend cho wizard

1. File[] nằm trong store cấp page/app, không nằm trong component tab dễ bị unmount.
2. Chuyển mục trong ứng dụng không làm mất File[].
3. Upload lỗi không clear File[].
4. Chỉ clear khi người dùng bấm “Xóa”, “Bắt đầu lại” hoặc toàn workflow đã processed thành công.
5. Sau POST imports, render review theo profile_id.
6. Tự điền suggestion nhưng luôn cho sửa.
7. Với requires_review=true, đánh dấu rõ và bắt xác nhận.
8. Với unknown, chỉ có lựa chọn bỏ qua hoặc đổi sang loại hợp lệ.
9. Disable nút Process trước khi confirm thành công.
10. Trong lúc process, disable double submit.
11. Sau processed, refetch bootstrap/dashboard và mọi query domain có thể bị thay đổi.
12. Nếu failed, giữ file và mapping trên UI để người dùng sửa ở import mới; không hiển thị nút “Retry cùng import” vì backend không cho.

---

## 6. Bootstrap và Dashboard

### 6.1 Bootstrap

GET /api/v1/stores/{store_id}/bootstrap trả snapshot cho lần mở app:

- today
- store
- ingredients
- inventory
- products
- menu
- active recipes
- supplier_constraints
- aliases
- future_calendar
- settings
- latest_runs
- open_purchase_orders
- data_freshness.menu_updated_at

Khuyến nghị:

- Dùng bootstrap để hydrate app lần đầu.
- Không gọi lại bootstrap ở mỗi lần chuyển route.
- Với bảng lớn/lịch sử, dùng endpoint chuyên biệt có pagination.
- Sau mutation, invalidate đúng query; chỉ refetch bootstrap khi thay đổi ảnh hưởng nhiều domain.

Giới hạn cần biết:

- Bootstrap lấy tối đa 200 inventory lot.
- Chỉ trả recipe đang active theo ngày server.
- Recipe trong bootstrap không có yield_quantity/process_loss_rate; trang chỉnh recipe phải gọi endpoint recipe riêng.
- latest_runs chỉ có ID, không có status/result đầy đủ.

### 6.2 Dashboard

GET /api/v1/stores/{store_id}/dashboard trả:

- ingredient_count
- active_product_count
- inventory_lot_count
- stockout_count
- low_stock_count
- expiring_lot_count
- open_po_count
- monthly_budget, reserved_budget, spent_budget, remaining_budget
- latest_sales_date
- latest_forecast_status
- latest_plan_status
- data_notes

Lưu ý hiện tại:

- Inventory service chỉ phát status stockout, expired, expiring, healthy.
- Không có status low, nên low_stock_count hiện luôn bằng 0.
- Frontend không nên quảng bá “low stock” như tín hiệu đáng tin cho tới khi backend sửa; có thể ẩn card hoặc ghi “chưa được tính”.
- data_notes hiện luôn là mảng rỗng.

---

## 7. Catalog, Menu, Combo và Recipe

### 7.1 Chọn endpoint đúng

- Trang Menu chính: GET /stores/{store_id}/menu vì có filter, pagination và summary.
- Dropdown product: GET /stores/{store_id}/products?active=true hoặc dữ liệu bootstrap.
- Dropdown ingredient: GET /stores/{store_id}/ingredients?active=true.
- Recipe chi tiết: GET /stores/{store_id}/products/{product_id}/recipe.
- Recipe history: GET /stores/{store_id}/products/{product_id}/recipe-versions.

GET /products hiện cũng trả shape giàu thông tin từ MenuService, nhưng không có pagination envelope.

### 7.2 Product

Single:

- item_type=single
- không được có components
- có thể có recipe

Combo:

- item_type=combo
- selling_unit phải là combo
- phải có 1–20 component
- component chỉ được là active single product
- không cho nested combo
- không cho self-reference
- không có recipe trực tiếp

item_type là immutable sau khi tạo.

PATCH product và PUT components yêu cầu product.version hiện tại. Sau thành công phải lấy version mới từ response, không tự cộng ở client.

Không thể deactivate một single product đang được active combo sử dụng.

### 7.3 Menu response

Mỗi item gồm:

- product_id, sku, product
- item_type, selling_unit
- price, active, status
- list_price, discount_rate, savings_amount
- components
- version, created_at, updated_at

Với combo, list_price/discount/savings được backend tính lại từ component. Frontend chỉ hiển thị, không dùng dữ liệu Excel cũ làm source of truth.

### 7.4 Recipe

PUT recipe:

~~~json
{
  "effective_from": "2026-08-05",
  "version": 1,
  "yield_quantity": 1,
  "process_loss_rate": 0.05,
  "lines": [
    {
      "ingredient_id": "...",
      "quantity": 0.15,
      "unit": "lít"
    }
  ]
}
~~~

Ý nghĩa version ở đây là **version recipe mới nhất hiện tại**, không phải product.version:

- Chưa có recipe: gửi version=0.
- Đang có recipe version 1: gửi version=1 để tạo version 2.

Backend:

- Convert mọi line về base_unit của ingredient.
- Không cho duplicate ingredient.
- effective_from mới phải sau recipe trước.
- Recipe trùng content hash được reuse.
- Version trước được đóng effective_to = effective_from mới - 1 ngày.
- yield_quantity > 0.
- process_loss_rate thuộc [0,1).

Frontend phải ẩn/disable tab Recipe cho combo và hiển thị component editor thay thế.

---

## 8. Inventory, History, Supplier và Settings

### 8.1 Inventory là dữ liệu theo lot

GET /stores/{store_id}/inventory trả từng lot, không phải một row aggregate cho mỗi ingredient.

Field chính:

- lot_id
- ingredient_id, ingredient, sku
- on_hand
- usable_quantity
- expiring_quantity
- expired_quantity
- unit, unit_cost
- received_date, expiry_date
- supplier_id, supplier
- status
- last_counted_at
- version

Status hiện có:

- stockout: balance <= 0
- expired: còn balance nhưng expiry_date < today
- expiring: hết hạn trong 0–7 ngày
- healthy

usable_quantity hiện loại cả lượng expiring và expired khỏi lượng usable. Nếu trang tổng hợp theo ingredient, frontend phải group các lot cùng ingredient_id và vẫn giữ khả năng drill-down theo FEFO/hạn dùng.

### 8.2 Physical count

POST /stores/{store_id}/inventory-counts:

~~~json
{
  "counted_at": "2026-08-04T17:00:00+07:00",
  "lines": [
    {
      "lot_id": "...",
      "counted_quantity": 12.5,
      "unit": "kg",
      "note": "Kiểm kho cuối ngày"
    }
  ]
}
~~~

Backend tính delta = counted quantity - current balance rồi ghi movement physical_count_adjustment. Endpoint này không yêu cầu expected_version, nhưng vẫn trả version mới.

### 8.3 Manual adjustment

POST /stores/{store_id}/inventory-adjustments:

~~~json
{
  "occurred_at": "2026-08-04T17:10:00+07:00",
  "reference": "ADJ-20260804-01",
  "lines": [
    {
      "lot_id": "...",
      "expected_version": 3,
      "quantity_delta": -1.2,
      "unit": "kg",
      "reason": "waste",
      "note": "Hư hỏng"
    }
  ]
}
~~~

Reason:

- waste, expired, damaged, correction_decrease: delta phải âm.
- correction_increase: delta phải dương.
- other: bắt buộc note.

Tồn kho sau điều chỉnh không được âm. VERSION_CONFLICT phải làm frontend refetch lot rồi yêu cầu người dùng xác nhận lại.

### 8.4 Sales batch

POST /stores/{store_id}/sales-history/batch:

- source chỉ nhận pos, manual, integration.
- Business key trong request là date + product_id.
- Nếu cùng business key đã tồn tại nhưng nội dung khác: DUPLICATE_REQUEST.
- Nếu recipe có hiệu lực, backend rebuild usage.
- Nếu product là combo, backend mở rộng thành component single rồi dùng recipe của từng component.
- Thiếu recipe không rollback sales; response có warning RECIPE_NOT_FOUND.

Frontend nên hiển thị sales “đã ghi” tách khỏi warning “chưa rebuild đủ usage”.

### 8.5 Purchase batch

POST /stores/{store_id}/purchase-history/batch:

- source: supplier_invoice, manual, integration.
- inventory_effect hiện chỉ chấp nhận record_only.
- Không tạo lot/movement.
- Response có inventory_applied=false.

Không nên đặt nút này dưới nhãn “Nhập kho”. Tên đúng là “Ghi lịch sử mua hàng”. Muốn nhập kho thực tế từ PO phải dùng receive PO.

### 8.6 Supplier term

Supplier term gồm:

- ingredient_id, supplier_id
- unit_cost
- moq
- pack_size
- order_unit
- lead_time_days
- unit
- version, active

PUT supplier constraint không sửa row cũ; backend tạo version mới và deactivate version cũ.

Backend hiện **không có supplier CRUD/list độc lập**. Supplier được tạo chủ yếu qua import. Frontend chỉ nên cho chọn supplier_id đã tồn tại từ supplier constraints/purchase history/bootstrap. Nếu muốn form “Tạo nhà cung cấp mới”, đó là backend scope mới chứ không phải chỉ sửa frontend.

### 8.7 Inventory constraint

GET /stores/{store_id}/inventory-constraints chỉ đọc:

- safety_stock
- maximum_stock
- minimum_stock
- reorder_point
- shelf_life_target
- service_level_target
- storage_capacity
- warehouse_capacity
- maximum_storage_volume
- budget

Không có POST/PUT inventory-constraint. Dữ liệu này hiện được nhập qua business_constraints sheet. Vì vậy frontend nên:

- Hiển thị read-only.
- Cho filter ingredient_id, constraint_type, as_of_date.
- Nếu muốn sửa, hướng người dùng sang import điều kiện kinh doanh.
- Không tạo form lưu giả vào settings.

Supplier term và inventory constraint phải join bằng ingredient_id khi cần một bảng tổng hợp.

### 8.8 Settings và budget

GET settings trả:

- monthly_budget
- reserved_budget
- spent_budget
- remaining_budget
- forecast_horizon
- default_strategy
- safety_policy
- version
- updated_at

PUT settings:

~~~json
{
  "monthly_budget": 50000000,
  "forecast_horizon": 7,
  "default_strategy": "balanced",
  "version": 2
}
~~~

Frontend nên giới hạn default_strategy thành economy, balanced, safe. Dù schema cho forecast_horizon tới 90, Forecast Core hiện chỉ chạy tối đa 7 ngày; UI nên cap 7 để tránh request chắc chắn lỗi.

Budget:

- Draft PO chưa reserve tiền.
- Confirm PO chuyển tiền từ remaining sang reserved.
- Receive chuyển chi phí đã nhận từ reserved sang spent.
- remaining_budget = monthly - reserved - spent.

### 8.9 Calendar

PUT calendar upsert theo date:

~~~json
{
  "items": [
    {
      "date": "2026-08-05",
      "holiday": false,
      "promotion": true,
      "promotion_note": "Giảm 10%"
    }
  ]
}
~~~

Backend tự tính weekend. API read hiện không trả is_store_closed, temperature, rainfall dù model DB/import hỗ trợ. Frontend calendar editor theo API hiện tại chỉ nên sửa holiday/promotion/promotion_note.

---

## 9. Forecast Core

### 9.1 Training

POST /api/v1/forecast-models/train:

~~~json
{
  "store_id": "STORE_001",
  "cutoff_date": "2026-08-04",
  "model_version": "forecast-core-v0.1.0",
  "history_days": 365
}
~~~

Backend:

1. Đọc sales_history theo store trong history window.
2. Đọc calendar đến cutoff + maximum horizon.
3. Validate và build daily panel.
4. Demand reconstruction minh bạch; stockout biết rõ bị censored khỏi target train.
5. Tạo lag/rolling/calendar features.
6. Split theo thời gian.
7. Walk-forward evaluation.
8. Train LightGBM quantile cho P25/P50/P75.
9. Sửa quantile crossing.
10. Fit conformal quantile calibrator.
11. So sánh Seasonal Naive và ETS.
12. Ghi artifact vào runtime/forecast_artifacts/{store_id}/{model_version}.
13. Activate model mới; model active trước đó chuyển inactive.

Yêu cầu mặc định cho split:

- 84 target dates cho train.
- 28 ngày calibration.
- 28 ngày test.
- Tổng tối thiểu 140 target dates.

Thiếu dữ liệu trả INSUFFICIENT_TRAINING_DATA. Training chạy đồng bộ và có thể lâu; chỉ nên đặt trong màn hình admin/model readiness, không tự train mỗi lần người dùng mở forecast.

Backend chưa có endpoint list/get model version. Frontend hiện chỉ biết model chưa sẵn sàng khi forecast trả MODEL_NOT_READY, hoặc biết training thành công từ response train.

### 9.2 Forecast request canonical cho frontend

POST /stores/{store_id}/forecast-runs:

~~~json
{
  "cutoff_date": "2026-08-04",
  "horizon_days": 7,
  "quantiles": [0.25, 0.5, 0.75],
  "scope": {
    "product_ids": [],
    "ingredient_ids": []
  },
  "use_latest_calendar": true
}
~~~

Ràng buộc thực:

- quantiles phải đúng [0.25, 0.5, 0.75] và đúng thứ tự.
- horizon thực tế tối đa FORECAST_MAX_HORIZON, mặc định 7.
- Request schema nhận scope dạng object có value là array.
- product_ids hiện được persist nhưng không lọc inference.
- ingredient_ids chỉ được dùng ở bước BOM sau forecast.

Frontend không được hứa “forecast chỉ các product đã chọn” theo scope hiện tại. Nếu cần filter hiển thị, filter client-side sau khi nhận kết quả; planning vẫn dựa trên forecast persisted đầy đủ.

### 9.3 Forecast result

Metadata:

- forecast_run_id
- store_id
- status
- engine_status
- cutoff_date
- horizon_days
- model_version
- warnings
- failure_code, failure_message
- created_at, completed_at
- result_url

Prediction:

- product_id, product_name
- target_date, horizon
- p25, p50, p75
- interval_lower, interval_upper
- baseline_p50
- calibration_source
- warnings

target_date là cutoff + horizon. interval_lower/interval_upper là interval sau calibration và không nên bị frontend thay thế bằng p25/p75.

### 9.4 Forecast state

~~~mermaid
stateDiagram-v2
    [*] --> running
    running --> completed
    running --> failed
    [*] --> blocked: model unavailable
    completed --> [*]
    failed --> [*]
    blocked --> [*]
~~~

Hiện POST chạy đồng bộ, thường trả completed ngay khi thành công. Frontend vẫn nên viết state handling có thể polling để tương thích tương lai:

1. POST tạo run.
2. Nếu status=completed, GET result.
3. Nếu running, polling metadata có backoff.
4. Nếu blocked/failed, dừng polling.
5. Chỉ render chart khi predictions có dữ liệu.

Nếu model chưa sẵn sàng:

- Backend tạo một blocked forecast run persisted.
- HTTP response là 503 MODEL_NOT_READY.
- details có forecast_run_id và engine_status=model_unavailable.

Frontend phải hiển thị “Model chưa sẵn sàng” và CTA train/admin. Không dùng fallback/mock forecast.

### 9.5 Warning cần hiển thị

| Warning | Ý nghĩa UI |
|---|---|
| STOCKOUT_INFORMATION_MISSING | Lịch sử không có cờ hết hàng; dự báo dựa trên sales quan sát |
| CALENDAR_FEATURES_MISSING | Thiếu biến lịch |
| MODEL_WORSE_THAN_SEASONAL_NAIVE | Model test kém baseline |
| UNSEEN_PRODUCT | Product chưa thấy khi train |
| CALIBRATION_FALLBACK_GLOBAL | Dùng calibrator global |
| INSUFFICIENT_SEASONAL_HISTORY | Thiếu seasonal lag |
| INSUFFICIENT_HISTORY | Chuỗi product còn ngắn |
| STORE_PLANNED_CLOSED | Ngày đóng cửa; forecast được đưa về 0 |

Warning không đồng nghĩa request failed. UI nên dùng badge/tooltips thay vì toast lỗi toàn màn hình.

---

## 10. Recipe/BOM và Ingredient Demand

POST /stores/{store_id}/forecast-runs/{forecast_run_id}/ingredient-demand:

1. Chỉ nhận forecast run completed có persisted predictions.
2. Lấy recipe có hiệu lực theo từng product và từng target_date.
3. Với mỗi line:

    ingredient demand = product quantile × recipe quantity / yield quantity × (1 + process loss rate)

4. Convert về base_unit của ingredient.
5. Cộng contribution từ mọi product dùng cùng ingredient trong cùng ngày.
6. Persist P25/P50/P75 theo ingredient/day.

Response có:

- ingredient_demand_run_id
- status, warnings, failure
- predictions
- mỗi prediction có contributions giải thích product nào đóng góp bao nhiêu

Thiếu recipe không bỏ qua âm thầm:

- RECIPE_NOT_FOUND: product chưa có recipe.
- RECIPE_NOT_EFFECTIVE: có version nhưng không hiệu lực tại target date.
- RECIPE_YIELD_INVALID
- RECIPE_LINE_INVALID
- INGREDIENT_UNIT_CONVERSION_FAILED

Frontend nên có bước “Kiểm tra khả năng lập kế hoạch” ngay sau forecast:

- Gọi ingredient-demand.
- Nếu thành công, render bảng nguyên liệu và phần drill-down contributions.
- Nếu lỗi recipe, điều hướng tới đúng product/recipe cần bổ sung rồi yêu cầu chạy forecast/planning lại.

INGREDIENT_SCOPE_NO_MATCH có thể tạo demand run completed nhưng predictions rỗng. Không coi đây là “không cần mua”; đây là scope không khớp.

---

## 11. Procurement Planning

### 11.1 Mapping chiến lược

| Nhãn UI | Core strategy | Legacy plan strategy | Quantile |
|---|---|---|---|
| Tiết kiệm | lean | economy | P25 |
| Cân bằng | balanced | balanced | P50 |
| An toàn | protected | safe | P75 |

Không truyền economy/safe vào core procurement-plans. Không truyền protected vào UI contract cũ nếu muốn giữ default_strategy nhất quán.

### 11.2 Thuật toán thực tế

Với mỗi strategy và ingredient:

1. Chọn demand P25/P50/P75.
2. Đọc inventory lot có received_date <= cutoff.
3. Tính movement balance tới cutoff.
4. Nếu bật, đưa PO ordered/partially_received chưa giao vào inbound.
5. Mô phỏng theo ngày:
   - inbound tới trước;
   - lot hết hạn bị loại;
   - tiêu thụ theo FEFO;
   - tính shortage, waste, ending inventory và stockout date.
6. Đọc safety_stock và maximum_stock.
7. Nếu thiếu safety stock, fallback bằng 0 và warning.
8. Tính raw required từ shortage và safety gap; cap theo maximum stock nếu có.
9. Chọn supplier term theo khả năng đến trước thiếu hàng, sau đó theo giá, lead time và supplier ID.
10. Làm tròn theo pack_size và MOQ.
11. Mô phỏng lại với proposed inbound.
12. Đánh dấu budget/supplier violation.
13. Chọn balanced nếu feasible; nếu không, chọn feasible đầu tiên theo thứ tự request.

Đây là **rule-based deterministic planning**, chưa phải optimization solver:

- Không tối ưu tổ hợp supplier.
- Không giảm số lượng để tự khớp ngân sách.
- Không giải bài toán multi-objective.
- Nếu cost > budget thì plan bị đánh dấu infeasible.
- Storage capacity chưa được enforce.

Frontend nên dùng các từ “kế hoạch đề xuất”, “mô phỏng” và “kịch bản”, không ghi “tối ưu toàn cục”.

### 11.3 Core procurement plans

POST /stores/{store_id}/forecast-runs/{forecast_run_id}/procurement-plans:

~~~json
{
  "strategies": ["lean", "balanced", "protected"],
  "use_open_purchase_orders": true,
  "use_latest_inventory": true,
  "budget_override": 42000000
}
~~~

use_latest_inventory=false hiện luôn bị từ chối. What-if inventory chưa hỗ trợ.

Response:

- procurement_plan_run_id
- recommended_strategy
- plans
- mỗi plan có feasibility, cost, shortage, waste, fill rate, metrics, warnings, daily projections và lines.

Line có:

- ingredient_id
- supplier_id, supplier_term_id
- order_date, expected_arrival_date
- raw_required_quantity
- order_quantity, rounding_excess
- unit, pack_count
- unit_cost, line_cost
- moq, pack_size, lead_time_days
- reason_codes, warnings

### 11.4 Cách nối planning với Purchase Order

Core procurement plan line hiện không trả recommendation_id và endpoint tạo PO lại yêu cầu recommendation_id từ legacy plan result. Vì vậy có một bridge bắt buộc.

Luồng frontend đề xuất:

1. Forecast completed.
2. POST ingredient-demand một lần.
3. POST core procurement-plans với cả ba strategy để so sánh và lấy recommended_strategy chuẩn từ backend.
4. Người dùng chọn một strategy.
5. Ngay trước khi tạo Draft PO, POST /stores/{store_id}/plan-runs cho strategy đã chọn:

~~~json
{
  "forecast_run_id": "...",
  "strategy": "balanced",
  "budget_limit": 42000000,
  "as_of_date": "2026-08-04",
  "include_open_purchase_orders": true
}
~~~

6. as_of_date bắt buộc bằng forecast cutoff_date.
7. GET /plan-runs/{plan_run_id}/result.
8. Lấy recommendation_id từ plan_lines.
9. POST purchase-orders.

Bridge này chạy lại một strategy, vì vậy frontend phải hiển thị timestamp/snapshot và cảnh báo nếu inventory/settings đã thay đổi giữa lúc xem comparison và lúc tạo PO.

Chỉ line có recommendation_id khác null mới có thể gửi sang Purchase Order. Plan có thể infeasible vì budget nhưng vẫn có recommendation; frontend có thể cho tạo Draft để chỉnh, song phải cảnh báo rõ và hiểu rằng bước confirm mới enforce remaining budget. Line thiếu supplier/recommendation phải bị loại khỏi payload chứ không được tự bịa ID.

Nếu muốn tránh core comparison, có thể tạo ba legacy plan run tuần tự, nhưng không nên gọi song song vì demand run có unique constraint theo forecast. Ngoài ra mỗi legacy run đơn lẻ có thể tự đánh dấu strategy của nó là recommended, nên không phù hợp để suy ra đề xuất toàn cục.

### 11.5 Warning/violation

| Code | UI |
|---|---|
| SAFETY_STOCK_NOT_CONFIGURED | Safety stock fallback 0 |
| SUPPLIER_TERM_NOT_FOUND | Không có nhà cung cấp hợp lệ; line order=0 |
| URGENT_STOCKOUT_RISK | Hàng tới sau ngày có nguy cơ thiếu |
| MOQ_ROUNDING | Tăng số lượng để đủ MOQ |
| PACK_SIZE_ROUNDING | Làm tròn theo quy cách |
| BUDGET_EXCEEDED | Plan infeasible; backend không tự cắt line |
| STORAGE_CAPACITY_NOT_CONFIGURED | Capacity chưa được planner enforce |
| BUDGET_NOT_CONFIGURED | Không có budget source |
| RESERVED_INVENTORY_NOT_AVAILABLE | Reserved inventory chưa được mô hình hóa |

Không ẩn line có supplier_id=null hoặc order_quantity=0. Đây là constraint violation cần người dùng giải quyết.

---

## 12. Purchase Order

### 12.1 State machine

~~~mermaid
stateDiagram-v2
    [*] --> draft
    draft --> ordered: confirm
    ordered --> partially_received: receive một phần
    ordered --> received: receive đủ
    partially_received --> partially_received: receive tiếp
    partially_received --> received: receive đủ
    received --> [*]
~~~

Không có cancel/reject/delete endpoint.

### 12.2 Tạo Draft PO

POST /stores/{store_id}/purchase-orders:

~~~json
{
  "plan_run_id": "...",
  "lines": [
    {
      "recommendation_id": "...",
      "order_quantity_override": 20
    }
  ]
}
~~~

Backend:

- Chỉ nhận completed legacy plan.
- Validate recommendation thuộc plan/store.
- Override phải > 0, >= MOQ và chia hết pack_size.
- Group line theo supplier.
- Có thể trả nhiều draft order trong mảng orders.
- Draft chưa reserve budget.
- Backend không chặn tạo Draft chỉ vì planning scenario infeasible; budget được enforce ở bước confirm.

Frontend phải xử lý response là {orders: PurchaseOrder[]}, không giả định chỉ có một PO.

### 12.3 Sửa Draft

PATCH /purchase-orders/{po_id}:

~~~json
{
  "version": 1,
  "line_updates": [
    {
      "po_line_id": "...",
      "order_quantity": 30
    }
  ]
}
~~~

Chỉ draft được sửa. Các line không xuất hiện trong line_updates được giữ nguyên. Sau response phải thay toàn bộ PO state bằng object backend trả về.

### 12.4 Confirm

POST /purchase-orders/{po_id}/confirm:

~~~json
{
  "version": 2,
  "confirmed_at": "2026-08-04T18:00:00+07:00"
}
~~~

Backend:

- Chỉ draft.
- Kiểm tra version.
- Kiểm tra remaining budget.
- Reserve toàn bộ total.
- Chuyển status ordered.

BUDGET_EXCEEDED ở bước confirm là lỗi nghiệp vụ; giữ draft để người dùng giảm quantity hoặc điều chỉnh budget.

### 12.5 Receive

POST /purchase-orders/{po_id}/receive:

~~~json
{
  "version": 3,
  "received_at": "2026-08-06T09:00:00+07:00",
  "delivery_reference": "DELIVERY-20260806-001",
  "lines": [
    {
      "po_line_id": "...",
      "lots": [
        {
          "quantity": 10,
          "expiry_date": "2026-08-20",
          "supplier_lot_code": "LOT-A"
        }
      ]
    }
  ]
}
~~~

Backend:

- Chỉ ordered/partially_received.
- Không cho nhận vượt ordered quantity.
- expiry_date không được trước received date.
- Tạo inventory lot.
- Tạo receipt movement.
- Tạo purchase receipt với inventory_effect=applied.
- Chuyển chi phí đã nhận từ reserved sang spent.
- Nếu chưa đủ: partially_received.
- Nếu đủ: received.

Receive hỗ trợ Idempotency-Key và frontend bắt buộc giữ cùng key khi retry do timeout.

---

## 13. Danh mục 61 API operation thực tế

### 13.1 Health, LLM và Import

| # | Method | Path | Vai trò frontend |
|---:|---|---|---|
| 1 | GET | /health | Kiểm tra service + database |
| 2 | GET | /api/v1/llm/health | Hiển thị khả năng Qwen; LLM unavailable không làm import ngừng hoàn toàn |
| 3 | POST | /api/v1/llm/map-sheet | Map thử một SheetProfile; thường không cần gọi riêng trong wizard vì POST imports đã map |
| 4 | POST | /api/v1/imports | Upload multipart, profile và nhận suggestion |
| 5 | GET | /api/v1/import-schemas | Lấy canonical type/field để dựng mapping UI |
| 6 | GET | /api/v1/imports/{import_id} | Đọc trạng thái và mapping của một import |
| 7 | POST | /api/v1/imports/{import_id}/confirm | Xác nhận/skip mapping |
| 8 | POST | /api/v1/imports/{import_id}/process | Normalize + persist transaction |
| 9 | GET | /api/v1/imports/{import_id}/result | Đọc canonical result |
| 10 | GET | /api/v1/stores/{store_id}/imports | Lịch sử import có filter/pagination |

### 13.2 Bootstrap, Dashboard và Inventory

| # | Method | Path | Vai trò frontend |
|---:|---|---|---|
| 11 | GET | /api/v1/stores/{store_id}/bootstrap | Hydrate snapshot ban đầu |
| 12 | GET | /api/v1/stores/{store_id}/dashboard | KPI dashboard |
| 13 | GET | /api/v1/stores/{store_id}/inventory | List lot tồn kho |
| 14 | POST | /api/v1/stores/{store_id}/inventory-counts | Ghi kiểm kho vật lý |
| 15 | POST | /api/v1/stores/{store_id}/inventory-adjustments | Ghi điều chỉnh có reason/version |
| 16 | GET | /api/v1/stores/{store_id}/inventory-movements | Audit movement |

### 13.3 Catalog, Menu và Recipe

| # | Method | Path | Vai trò frontend |
|---:|---|---|---|
| 17 | GET | /api/v1/stores/{store_id}/ingredients | List/filter ingredient |
| 18 | POST | /api/v1/stores/{store_id}/ingredients | Tạo ingredient |
| 19 | PATCH | /api/v1/stores/{store_id}/ingredients/{ingredient_id} | Update bằng optimistic version |
| 20 | GET | /api/v1/stores/{store_id}/products | List product cho selector |
| 21 | POST | /api/v1/stores/{store_id}/products | Tạo single/combo |
| 22 | PATCH | /api/v1/stores/{store_id}/products/{product_id} | Update product |
| 23 | GET | /api/v1/stores/{store_id}/menu | Trang Menu có summary/pagination |
| 24 | PUT | /api/v1/stores/{store_id}/products/{product_id}/components | Replace toàn bộ component combo |
| 25 | GET | /api/v1/stores/{store_id}/products/{product_id}/recipe | Recipe hiện tại/theo on_date |
| 26 | PUT | /api/v1/stores/{store_id}/products/{product_id}/recipe | Tạo/reuse recipe version |
| 27 | GET | /api/v1/stores/{store_id}/products/{product_id}/recipe-versions | Lịch sử recipe |

### 13.4 History

| # | Method | Path | Vai trò frontend |
|---:|---|---|---|
| 28 | GET | /api/v1/stores/{store_id}/sales-history | List/filter sales |
| 29 | GET | /api/v1/stores/{store_id}/usage-history | List/filter usage |
| 30 | GET | /api/v1/stores/{store_id}/purchase-history | List/filter receipt history |
| 31 | POST | /api/v1/stores/{store_id}/sales-history/batch | Ghi sales + thử rebuild usage |
| 32 | POST | /api/v1/stores/{store_id}/purchase-history/batch | Ghi purchase record_only |

### 13.5 Supplier, Constraint, Alias, Settings và Calendar

| # | Method | Path | Vai trò frontend |
|---:|---|---|---|
| 33 | GET | /api/v1/stores/{store_id}/supplier-constraints | Active supplier terms |
| 34 | GET | /api/v1/stores/{store_id}/inventory-constraints | Effective business/inventory constraints |
| 35 | POST | /api/v1/stores/{store_id}/supplier-constraints | Tạo supplier term |
| 36 | PUT | /api/v1/stores/{store_id}/supplier-constraints/{constraint_id} | Tạo version term mới |
| 37 | GET | /api/v1/stores/{store_id}/aliases | List alias |
| 38 | PUT | /api/v1/stores/{store_id}/aliases | Bulk upsert alias |
| 39 | GET | /api/v1/stores/{store_id}/settings | Settings + budget state |
| 40 | PUT | /api/v1/stores/{store_id}/settings | Update settings bằng version |
| 41 | GET | /api/v1/stores/{store_id}/calendar-features | List calendar |
| 42 | PUT | /api/v1/stores/{store_id}/calendar-features | Bulk upsert calendar |

### 13.6 Forecast

| # | Method | Path | Vai trò frontend |
|---:|---|---|---|
| 43 | POST | /api/v1/stores/{store_id}/forecast-runs | **Canonical FE:** tạo persisted forecast |
| 44 | GET | /api/v1/stores/{store_id}/forecast-runs/{forecast_run_id} | Metadata/status |
| 45 | GET | /api/v1/stores/{store_id}/forecast-runs/{forecast_run_id}/result | Persisted predictions |
| 46 | POST | /api/v1/forecast-models/train | Admin train/activate model |
| 47 | POST | /api/v1/forecasts | Deprecated; không dùng code mới |
| 48 | GET | /api/v1/forecasts/{forecast_run_id} | Deprecated; không dùng code mới |

### 13.7 Ingredient Demand và Planning

| # | Method | Path | Vai trò frontend |
|---:|---|---|---|
| 49 | POST | /api/v1/stores/{store_id}/forecast-runs/{forecast_run_id}/ingredient-demand | Generate persisted BOM demand |
| 50 | GET | /api/v1/stores/{store_id}/forecast-runs/{forecast_run_id}/ingredient-demand | Read demand + contributions |
| 51 | POST | /api/v1/stores/{store_id}/forecast-runs/{forecast_run_id}/procurement-plans | Generate 1–3 core strategy plans |
| 52 | GET | /api/v1/stores/{store_id}/forecast-runs/{forecast_run_id}/procurement-plans | Read planning run, có query procurement_plan_run_id |
| 53 | POST | /api/v1/stores/{store_id}/plan-runs | Tạo legacy bridge plan có recommendations |
| 54 | GET | /api/v1/stores/{store_id}/plan-runs/{plan_run_id} | Bridge metadata |
| 55 | GET | /api/v1/stores/{store_id}/plan-runs/{plan_run_id}/result | Bridge result có recommendation_id |

### 13.8 Purchase Order

| # | Method | Path | Vai trò frontend |
|---:|---|---|---|
| 56 | POST | /api/v1/stores/{store_id}/purchase-orders | Tạo một hoặc nhiều draft từ recommendations |
| 57 | GET | /api/v1/stores/{store_id}/purchase-orders | List PO |
| 58 | GET | /api/v1/stores/{store_id}/purchase-orders/{po_id} | PO detail |
| 59 | PATCH | /api/v1/stores/{store_id}/purchase-orders/{po_id} | Sửa quantity khi draft |
| 60 | POST | /api/v1/stores/{store_id}/purchase-orders/{po_id}/confirm | Reserve budget, draft → ordered |
| 61 | POST | /api/v1/stores/{store_id}/purchase-orders/{po_id}/receive | Nhận lot, cập nhật kho và budget |

---

## 14. Kiến trúc frontend đề xuất

Không phụ thuộc frontend đang dùng Redux, Zustand hay TanStack Query, nên tách thành các lớp sau.

### 14.1 API transport duy nhất

Một client chịu trách nhiệm:

- Ghép API_ROOT và /api/v1 đúng một lần.
- Gắn X-Request-ID.
- Gắn X-ShelfCash-Key qua BFF/proxy nếu có.
- Không gắn JSON Content-Type khi body là FormData.
- Parse error envelope.
- Chuẩn hóa lỗi network/timeout.
- Nhận AbortSignal.

Không gọi fetch/axios trực tiếp rải rác trong component.

### 14.2 Domain API module

Nên có module riêng:

- healthApi
- importApi
- bootstrapApi
- catalogApi
- menuApi
- recipeApi
- inventoryApi
- historyApi
- settingsApi
- forecastApi
- planningApi
- purchaseOrderApi

Mỗi module dùng type rõ ràng, không trả any ra component.

### 14.3 Query keys

Query key phải luôn chứa store_id:

- ["bootstrap", storeId]
- ["dashboard", storeId]
- ["menu", storeId, filters]
- ["ingredients", storeId, filters]
- ["inventory", storeId, filters]
- ["settings", storeId]
- ["forecast-run", storeId, runId]
- ["ingredient-demand", storeId, forecastRunId]
- ["procurement-plan-run", storeId, forecastRunId, planningRunId]
- ["plan-run", storeId, planRunId]
- ["purchase-orders", storeId]

Khi đổi store, không tái sử dụng cache của store cũ.

### 14.4 Local workflow state

Các state không nên chỉ sống trong component route:

- Import draft: File[], forecast date/horizon, mapping draft, import_id.
- Forecast wizard: cutoff, horizon, selected product display filter.
- Planning comparison: forecast_run_id, ingredient_demand_run_id, procurement_plan_run_id.
- Selected strategy và bridge plan_run_id.
- Draft PO edits chưa submit.

File object không serialize trực tiếp vào localStorage. Muốn sống qua refresh trình duyệt phải dùng IndexedDB; nếu chỉ cần sống qua chuyển tab, store in-memory cấp app là đủ.

### 14.5 Invalidation matrix

| Mutation | Query cần invalidate/refetch |
|---|---|
| Import processed | bootstrap, dashboard, menu, products, ingredients, recipes, inventory, all histories, supplier terms, inventory constraints, settings, calendar |
| Ingredient create/update/alias | ingredients, aliases, bootstrap; đánh dấu forecast/planning cũ là snapshot |
| Product/menu/component update | menu, products, bootstrap; recipe selector |
| Recipe update | recipe, recipe versions, bootstrap; ingredient-demand/planning hiện tại trở nên stale |
| Inventory count/adjustment | inventory, movements, dashboard, bootstrap; planning trở nên stale |
| Sales batch | sales, usage, dashboard; forecast cũ trở nên stale |
| Purchase batch record_only | purchase history; không invalidate inventory |
| Supplier term update | supplier terms, bootstrap; planning cũ trở nên stale |
| Settings/calendar update | settings/calendar/bootstrap/dashboard; forecast/planning cũ trở nên stale |
| Forecast completed | forecast metadata/result, bootstrap latest_runs |
| Planning completed | demand/planning/result, bootstrap latest_runs |
| PO created/edited | purchase orders, bootstrap open PO |
| PO confirmed | purchase orders, settings/budget, dashboard, bootstrap; planning state thay đổi vì open inbound |
| PO received | PO, inventory, movements, purchase history, settings/budget, dashboard, bootstrap |

Backend không tự đánh dấu run cũ “stale”. Frontend phải hiển thị created_at/completed_at và nút “Chạy lại” sau khi input quan trọng thay đổi.

### 14.6 Route guard theo dữ liệu

- Không có store hợp lệ: dừng domain queries, hiển thị cấu hình store.
- Chưa processed import: cho xem mapping/import history, chưa cho hứa model sẵn sàng.
- MODEL_NOT_READY: route forecast vẫn mở nhưng hiển thị readiness state.
- Forecast chưa completed: disable planning.
- Ingredient demand lỗi recipe: disable procurement plan và link sửa recipe.
- Plan infeasible: vẫn cho xem chi tiết, nhưng disable tạo PO với line invalid.
- PO không draft: disable edit.
- PO received: read-only.

---

## 15. TypeScript contract tối thiểu nên có

~~~typescript
export type DecimalLike = string | number;

export interface ApiErrorBody {
  code: string;
  message: string;
  details: Record<string, unknown>;
  request_id: string | null;
}

export interface Page<T> {
  items: T[];
  page: number;
  page_size: number;
  total: number;
}

export type ImportStatus =
  | "awaiting_review"
  | "confirmed"
  | "processed"
  | "failed";

export type RunStatus =
  | "running"
  | "completed"
  | "blocked"
  | "failed";

export interface ForecastRunMetadata {
  forecast_run_id: string;
  store_id: string;
  status: RunStatus;
  engine_status: string;
  cutoff_date: string;
  horizon_days: number;
  model_version: string | null;
  warnings: string[];
  failure_code: string | null;
  failure_message: string | null;
  created_at: string;
  completed_at: string | null;
  result_url: string;
}

export interface ForecastPrediction {
  product_id: string;
  product_name: string;
  target_date: string;
  horizon: number;
  p25: number;
  p50: number;
  p75: number;
  interval_lower: number;
  interval_upper: number;
  baseline_p50: number;
  calibration_source: string;
  warnings: string[];
}

export type CoreStrategy = "lean" | "balanced" | "protected";
export type LegacyStrategy = "economy" | "balanced" | "safe";

export interface PlanLine {
  ingredient_id: string;
  supplier_id: string | null;
  supplier_term_id: string | null;
  order_date: string;
  expected_arrival_date: string | null;
  raw_required_quantity: number;
  order_quantity: number;
  rounding_excess: number;
  unit: string;
  pack_count: number | null;
  unit_cost: number | null;
  line_cost: number;
  moq: number | null;
  pack_size: number | null;
  lead_time_days: number | null;
  reason_codes: string[];
  warnings: string[];
}

export type PurchaseOrderStatus =
  | "draft"
  | "ordered"
  | "partially_received"
  | "received";
~~~

Không dùng type trên để ép backend thành shape khác. Với endpoint untyped hoặc Decimal string, bổ sung interface đúng response thực tế và normalize tại boundary.

---

## 16. Chính sách xử lý lỗi cho UI

| HTTP/code | Hành vi frontend |
|---|---|
| 400 invalid_file_extension/invalid_excel_file/too_many_files | Giữ file selection, chỉ rõ file/giới hạn |
| 401 unauthorized | Dừng retry, báo cấu hình/xác thực |
| 404 STORE_NOT_FOUND | Dừng mọi store query; không tự thay bằng STORE_001 |
| 404 RESOURCE_NOT_FOUND | Refetch resource/list; thông báo item đã mất |
| 409 VERSION_CONFLICT | Refetch object, mở dialog so sánh và yêu cầu submit lại |
| 409 DUPLICATE_REQUEST | Nếu do đổi payload nhưng giữ key, tạo action/key mới; nếu business duplicate, hiển thị record đã tồn tại |
| 409 INVALID_STATE_TRANSITION | Refetch status và cập nhật nút theo state mới |
| 409 FORECAST_RUN_NOT_COMPLETED | Không chạy planning; quay về forecast |
| 409 BUDGET_EXCEEDED | Giữ Draft PO, cho giảm quantity/chỉnh budget |
| 422 validation_error | Map details.errors vào field form |
| 422 MAPPING_INCOMPLETE | Quay lại sheet mapping và highlight core field |
| 422 RECIPE_NOT_FOUND/RECIPE_NOT_EFFECTIVE | Link product recipe cần sửa |
| 422 supplier/business constraint errors | Hiển thị constraint và unit liên quan |
| 425 IMPORT_NOT_READY | Không gọi result trước process; nếu xảy ra, trở lại import status |
| 503 MODEL_NOT_READY | Readiness state, không render forecast giả |
| 503 DATABASE_NOT_READY | Trang service unavailable; retry có backoff |
| 500 | Hiển thị request_id; không tự lặp mutation |

Tên code không hoàn toàn đồng nhất chữ hoa: Pydantic dùng validation_error, Excel ingestion dùng lowercase. Client phải chấp nhận cả hai.

---

## 17. Những nợ kỹ thuật/gap ảnh hưởng frontend

### P0 — Phải workaround trong frontend hiện tại

1. **Forecast horizon lệch contract:** settings/schema cho tới 90, service mặc định chỉ 7. UI cap 7.
2. **product_ids trong forecast scope chưa có hiệu lực:** chỉ filter hiển thị phía client, không mô tả là backend scoped inference.
3. **Core plan chưa nối trực tiếp sang PO:** cần legacy plan bridge để có recommendation_id.
4. **Purchase history không tăng kho:** chỉ PO receive/import inventory tác động inventory.
5. **Import failed là terminal:** không hiện retry cùng import.
6. **Decimal shape không nhất quán:** normalize ở API boundary.
7. **Run cũ không tự stale:** dùng timestamp và invalidation.

### P1 — UI phải ẩn/read-only hoặc ghi chú

1. Không có supplier CRUD/list độc lập.
2. Inventory constraint chỉ có GET; update qua import.
3. Dashboard low_stock_count không hoạt động vì inventory không phát status low.
4. Bootstrap truncate inventory ở 200 lot.
5. Import status detail không expose failure_code/failure_message.
6. Import result không expose business_write_summary dù DB có lưu.
7. Calendar GET/PUT không expose is_store_closed, temperature, rainfall.
8. Không có endpoint list/model readiness cho forecast model.
9. Không có cancel/delete PO.
10. PO list trả page cố định; chưa có filter/status query.

### P1 — Planner chưa dùng hết constraint đã lưu

Planner hiện dùng:

- safety_stock
- maximum_stock
- supplier term
- inventory lot/expiry
- open PO
- budget override/settings/budget period

Planner hiện chưa thực thi đầy đủ:

- minimum_stock
- reorder_point
- shelf_life_target
- service_level_target
- storage_capacity
- warehouse_capacity
- maximum_storage_volume
- business constraint budget trong inventory_constraints

STORAGE_CAPACITY_NOT_CONFIGURED hiện được thêm vào plan warning mà không thực sự resolve/enforce capacity. Frontend không được nói rằng mọi constraint đã được optimization sử dụng.

### P2 — Cần backend cải thiện sau

1. Background jobs/SSE hoặc polling contract thật cho train/forecast/planning.
2. Một planning endpoint duy nhất vừa trả ba strategy vừa tạo PO-ready recommendation.
3. Capability endpoint trả max horizon, model readiness và feature flags.
4. Aggregate inventory endpoint theo ingredient + low-stock policy.
5. Supplier CRUD.
6. Inventory constraint write API.
7. Import retry/reopen workflow.
8. API schema/response_model đầy đủ cho các endpoint hiện trả dict.
9. Chuẩn hóa Decimal thành một dạng nhất quán.
10. Đồng bộ README/docs với 61 operation và migration 0016.

---

## 18. Acceptance criteria khi Codex sửa frontend

### Hạ tầng API

- Chỉ có một API client và một cấu hình API_ROOT.
- Không hardcode STORE_001 nếu user/store context chưa xác nhận.
- X-Request-ID được gửi và request_id hiển thị khi lỗi.
- Mutation được hỗ trợ dùng Idempotency-Key ổn định qua retry.
- FormData không bị gắn Content-Type thủ công.
- Không còn gọi endpoint deprecated /forecasts.

### Import

- Chọn file rồi chuyển mục khác không mất file.
- Upload lỗi không mất file.
- Review mapping render theo profile_id.
- unknown không thực hiện gì và confirm bằng skip=true.
- Chỉ process sau confirm.
- Sau processed, dữ liệu domain được refetch.
- failed không có nút retry cùng import.

### Menu/Recipe

- Menu dùng /menu.
- Combo hiện component, không hiện recipe editor.
- Single hiện recipe editor.
- Update gửi version hiện tại và thay state bằng response mới.
- Không cho nested combo/inactive component ở UI.

### Forecast

- Horizon UI 1–7.
- Quantiles cố định P25/P50/P75.
- MODEL_NOT_READY không tạo mock.
- Có loading/running/completed/blocked/failed.
- Chart đọc persisted result.
- Warning hiển thị ở global và từng prediction.

### Planning

- Ingredient-demand được tạo/đọc trước comparison.
- Ba strategy dùng lean/balanced/protected ở core.
- UI label đúng Tiết kiệm/Cân bằng/An toàn.
- Hiển thị recommended_strategy, feasibility, cost, shortage, waste, fill rate, violation và warning.
- Line thiếu supplier không bị ẩn.
- Tạo PO đi qua selected legacy plan bridge để có recommendation_id.
- budget_limit dùng current remaining budget hoặc giá trị người dùng xác nhận, không mặc định lại monthly budget.

### Purchase Order

- POST create xử lý nhiều orders theo supplier.
- Chỉ draft được sửa.
- Confirm gửi timezone-aware datetime và version mới nhất.
- Receive hỗ trợ partial lot, Idempotency-Key và invalidate đúng inventory/budget/history.
- Không có nút cancel/delete giả.

### Kiểm thử

- Unit test API client/error parser/number normalizer.
- Test import state survives route changes.
- Test VERSION_CONFLICT refetch.
- Test MODEL_NOT_READY.
- Test planning strategy mapping.
- Test core-plan → legacy bridge → PO.
- Test PO draft → ordered → partially_received/received.
- Build/typecheck/lint và test hiện có đều phải pass.

---

## 19. Prompt có thể gửi trực tiếp cho Codex sửa frontend

~~~text
Bạn đang sửa frontend ShelfCash để tích hợp đúng với backend hiện tại.

Nguồn sự thật:
1. Đọc toàn bộ file “ShelfCash_Backend_FE_Integration_Audit_2026-08-04.md” đính kèm.
2. Kiểm tra source frontend thực tế trước khi sửa.
3. Không dùng README/API contract cũ nếu mâu thuẫn với biên bản hoặc source backend hiện tại.
4. Chỉ sửa frontend; không sửa backend trong task này.

Mục tiêu:
- Tạo một lớp API client/type/error handling tập trung.
- Chuyển toàn bộ màn hình sang đúng các store-scoped endpoint.
- Hoàn thiện import wizard, Menu/Recipe, Inventory, Forecast, Planning và Purchase Order theo state machine trong biên bản.
- Xóa mọi mock/fallback tạo forecast hoặc plan giả.

Yêu cầu bắt buộc:

1. API transport
- Dùng một API_ROOT; ghép /health và /api/v1 đúng một lần.
- Gắn X-Request-ID cho mọi request.
- Với mutation hỗ trợ idempotency, tạo một Idempotency-Key cho một user action và giữ nguyên khi retry cùng payload.
- Không đặt Content-Type thủ công cho FormData.
- Parse error envelope {code,message,details,request_id}.
- Có DecimalLike normalizer và xử lý date-only không lệch timezone.

2. Import
- File[] phải sống qua chuyển route/tab; không clear khi upload lỗi.
- POST multipart /api/v1/imports.
- Render profiles/suggested_mappings theo profile_id.
- Khi “Loại dữ liệu = Không xác định”, không map/xử lý; confirm bằng skip=true.
- Chỉ POST process sau confirm thành công.
- Import failed là terminal; cho tạo import mới, không retry cùng import.
- Sau processed, invalidate/refetch toàn bộ domain data liên quan.

3. Menu và Recipe
- Trang Menu dùng GET /stores/{store_id}/menu.
- Single dùng recipe; combo dùng components và tuyệt đối không có recipe trực tiếp.
- PUT recipe dùng recipe version hiện tại (0 nếu chưa có).
- PATCH product và PUT components gửi product.version hiện tại.
- Sau mutation dùng response backend làm state mới.

4. Forecast
- Dùng POST /stores/{store_id}/forecast-runs và hai GET store-scoped.
- Không dùng deprecated /forecasts.
- UI cap horizon 1–7 và gửi quantiles đúng [0.25,0.5,0.75].
- Xử lý running/completed/blocked/failed.
- Khi MODEL_NOT_READY, hiển thị readiness/admin train action; không dùng mock.
- Chỉ render chart từ persisted predictions.

5. Planning
- Sau forecast completed, POST ingredient-demand và hiển thị contributions.
- POST core procurement-plans với strategies [lean,balanced,protected] để so sánh.
- Mapping UI:
  Tiết kiệm = lean = economy = P25
  Cân bằng = balanced = balanced = P50
  An toàn = protected = safe = P75
- Hiển thị feasibility, recommended_strategy, cost, shortage, waste, fill rate, constraint violations, warnings và line thiếu supplier.
- Khi người dùng chọn strategy để tạo Draft PO, tạo legacy plan-run tương ứng để lấy recommendation_id, rồi mới POST purchase-orders.
- as_of_date phải bằng forecast cutoff_date.
- budget_limit dùng remaining budget hiện tại hoặc giá trị người dùng xác nhận.

6. Purchase Order
- POST create có thể trả nhiều orders; render theo supplier.
- Draft mới được PATCH.
- Confirm và receive gửi version mới nhất và datetime có timezone.
- Receive hỗ trợ partial lots.
- Invalidate PO, inventory, movements, purchase history, budget, dashboard và bootstrap theo đúng mutation.

7. Không vượt contract
- Không tạo form supplier mới vì backend chưa có supplier CRUD.
- Inventory constraint chỉ read-only; chỉnh qua import.
- Không hiển thị low_stock_count như dữ liệu đáng tin.
- Không có nút cancel/delete PO giả.
- Không nói planning là global optimizer; gọi là kế hoạch/mô phỏng rule-based.

Quy trình làm việc:
1. Audit code frontend và liệt kê chỗ đang gọi sai endpoint/shape/state.
2. Lập plan theo module.
3. Sửa trực tiếp trong worktree hiện tại, không zip, không commit/push nếu tôi chưa yêu cầu.
4. Giữ nguyên UI style hiện có trừ chỗ cần sửa UX cho state/error.
5. Viết/điều chỉnh test cho các flow bắt buộc.
6. Chạy typecheck, lint, test và build.
7. Kết thúc bằng bảng: file đã sửa, behavior trước/sau, endpoint dùng, test result và nợ còn lại.

Acceptance criteria nằm trong mục 18 của biên bản và phải được kiểm tra đầy đủ.
~~~

---

## 20. Kết luận cuối

Frontend hiện nên coi backend như một hệ thống **snapshot + state machine**:

- Import tạo canonical state.
- Forecast tạo persisted product-demand snapshot.
- BOM tạo persisted ingredient-demand snapshot.
- Planning tạo persisted procurement snapshot.
- Legacy plan bridge tạo recommendation có thể chuyển thành PO.
- PO confirm/receive mới tạo tác động ngân sách và tồn kho vận hành.

Nếu frontend giữ đúng ID của từng run, version của từng resource, idempotency key của từng action và invalidation theo mutation, toàn bộ chuỗi có thể hoạt động ổn định mà không cần tạo dữ liệu giả hoặc suy đoán ngoài contract.
