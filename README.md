# ShelfCash · React + Node.js

Ứng dụng quản lý tồn kho và lập kế hoạch nhập hàng cho cửa hàng nhỏ. Giao diện
được thiết kế theo hướng quiet/liminal: ít chữ, nhiều khoảng thở và tập trung vào
việc người dùng cần xử lý.

## Công nghệ

- React 19 + TypeScript cho giao diện.
- Node.js `>=22.13.0` và server routes làm proxy bảo mật cho backend.
- Recharts cho biểu đồ dự báo.
- SheetJS để đọc/ghi Excel và CSV.
- pdf-lib để tạo PDF có hỗ trợ tiếng Việt.

## Chức năng

- Tổng quan và cảnh báo cần xử lý hôm nay.
- Nhập nhiều file Excel/CSV qua ShelfCash backend.
- Duyệt mapping do rule hoặc Qwen gợi ý trước khi xử lý.
- Giữ nguyên tệp và tiến trình nhập khi chuyển giữa các mục trong cùng phiên.
- Theo dõi health của backend và LLM provider.
- Quản lý tồn kho theo lô, hạn sử dụng và trạng thái backend.
- Quản lý Menu gồm món lẻ, combo, giá bán và thành phần combo.
- Quản lý sản phẩm, công thức và phiên bản công thức.
- Dự báo sản phẩm P25/P50/P75 và interval đã calibration.
- Chuyển forecast qua BOM thành ingredient demand có contribution drill-down.
- So sánh ba kịch bản core: lean, balanced và protected.
- Chạy bridge legacy chỉ ngay trước khi tạo Draft PO theo nhà cung cấp.
- Sửa Draft, xác nhận, và nhận hàng một phần/nhiều lô đến khi hoàn tất.
- Xuất PO sang Excel và PDF.
- Quản lý MOQ, quy cách, lead time, tồn an toàn, alias và ngân sách.

## Chạy trên máy

```bash
npm install
cp .env.example .env.local
npm run dev
```

Điền địa chỉ backend và API key vào `.env.local`:

```dotenv
SHELFCASH_BACKEND_URL=http://127.0.0.1:8000
SHELFCASH_API_KEY=
SHELFCASH_STORE_ID=
```

Sau đó mở địa chỉ được hiển thị trong terminal. Node.js 22 LTS trở lên được
khuyến nghị.

## Kết nối ShelfCash backend

Frontend gọi backend thông qua server route Node.js. `SHELFCASH_API_KEY` chỉ tồn
tại ở server và không được gửi xuống trình duyệt. Lớp proxy hỗ trợ:

- `GET /health`
- `GET /api/v1/llm/health`
- `POST /api/v1/llm/map-sheet`
- Toàn bộ import workflow dưới `/api/v1/imports`
- Bootstrap, kho, sản phẩm, recipe, supplier, alias, settings và calendar theo
  `/api/v1/stores/{store_id}/...`
- Menu qua `GET /menu`, Product CRUD và `PUT /products/{product_id}/components`
- Forecast run, ingredient demand, core procurement plans, legacy plan bridge và
  toàn bộ vòng đời Purchase Order theo ShelfCash API Contract v1

Luồng nhập trên giao diện là:

```text
upload nhiều file → duyệt mapping → confirm → process → lấy result
```

Sau khi import hoàn tất, frontend gọi lại `GET
/api/v1/stores/{store_id}/bootstrap`. Backend và database là nguồn dữ liệu chính
thức. Frontend không có forecast/planner fallback cục bộ. Quy trình nghiệp vụ là:

```text
forecast-runs → ingredient-demand → procurement-plans (3 strategy)
             → chọn strategy → legacy plan-runs bridge → Draft PO
```

Draft PO chỉ gửi `plan_run_id`, `recommendation_id` và số lượng override. Backend
kiểm tra MOQ/pack size; confirm giữ ngân sách; receive tạo inventory lot và chuyển
chi phí từ reserved sang spent. Retry timeout giữ nguyên `Idempotency-Key`.

Backend vẫn có thể giữ cấu hình:

```dotenv
CORS_ORIGINS=http://localhost:5173,http://localhost:3000
```

Do frontend dùng proxy server-to-server, API key không cần xuất hiện trong
`NEXT_PUBLIC_*` hay mã React.

## Kiểm tra

```bash
npm run test:logic
npm run lint
npm run build
```

Bộ kiểm tra bao phủ transport/request ID/idempotency, import state machine,
adapter bootstrap/lot/forecast/demand/core plan/PO, strategy bridge, model
readiness, allowlist proxy, parser Excel/CSV và xuất Excel/PDF.

## Cấu trúc chính

```text
app/
  api/            Proxy backend và xuất PO
  components/     Thành phần giao diện dùng chung
  views/          Bảy màn hình nghiệp vụ
lib/
  data.ts         Dữ liệu khởi tạo
  ingestion.ts    Chuẩn hóa response và đồng bộ vào giao diện
  menu.ts         Adapter, validation và payload contract cho Menu/combo
  logic.ts        Chỉ nhận diện schema/mapping cho file mẫu cục bộ
  api-contract.ts Kiểu API canonical và chuẩn hóa Decimal/date
  planning-workflow.ts Orchestrator forecast → demand → core → PO bridge
  contract-adapters.ts Adapter response backend sang view model
  shelfcash-client.ts  API client cho ShelfCash API Contract v1
  types.ts        Kiểu dữ liệu dùng chung
tests/            Kiểm tra logic và API
```

Dữ liệu mẫu chỉ được dùng để tạo file tải xuống từ `/api/sample`. Lần render đầu
khởi tạo trạng thái rỗng; danh mục sản phẩm và nguyên liệu chỉ xuất hiện sau khi
frontend đọc được `bootstrap` từ backend. Sau mọi write thành công, frontend đọc
lại bootstrap hoặc resource liên quan thay vì xem React state là source of
truth.

Ở bước duyệt import, frontend dùng đúng `CANONICAL_SCHEMAS` trong
`lib/canonical-schemas.ts`. Qwen chỉ đưa ra gợi ý ban đầu; người dùng phải chọn
loại dữ liệu, nối toàn bộ header, không trùng field và có đủ `core_fields` trước
khi nút xác nhận được mở khóa.

Font DejaVu Sans trong `public/fonts` được dùng để xuất PDF tiếng Việt và tuân
theo giấy phép của dự án DejaVu Fonts. Giao diện web tự phục vụ Noto Sans và
Noto Serif từ `public/fonts/ui`; cả hai tuân theo SIL Open Font License 1.1 được
đính kèm trong cùng thư mục.
