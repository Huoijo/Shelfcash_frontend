import type { TutorialStep } from "./types";

export const TUTORIAL_STEPS: TutorialStep[] = [
  // Step 0: Welcome (modal / explain)
  {
    id: "welcome",
    type: "welcome",
    title: "Khám phá ShelfCash",
    body: "Bạn sẽ thử một quy trình nhập hàng hoàn chỉnh bằng dữ liệu mẫu — từ tải dữ liệu, thiết lập trung tâm quyết định, nhận diện rủi ro đến tạo Draft PO.",
    metadata: "Khoảng 4 phút · 11 bước · Không ảnh hưởng dữ liệu thật",
    targetPage: "import",
  },

  // Step 1: Upload Data (point)
  {
    id: "import-data",
    stepNumber: 1,
    totalSteps: 11,
    type: "point",
    target: "import-dropzone",
    targetPage: "import",
    eyebrow: "BƯỚC 1 / 11",
    title: "Tải dữ liệu kinh doanh",
    body: "Kéo thả tệp Excel/CSV doanh thu, tồn kho hoặc tải tệp mẫu của ShelfCash để chuẩn hóa dữ liệu bán hàng và nguyên vật liệu.",
    placement: "bottom",
  },

  // Step 2: Cutoff Date (point)
  {
    id: "decision-cutoff-date",
    stepNumber: 2,
    totalSteps: 11,
    type: "point",
    target: "decision-cutoff-date",
    targetPage: "simulator",
    eyebrow: "BƯỚC 2 / 11",
    title: "Ngày chốt dữ liệu dự báo",
    body: "Chọn mốc ngày chốt dữ liệu lịch sử để hệ thống phân tích doanh số và tính toán dự báo nhu cầu cho các ngày tiếp theo.",
    placement: "bottom",
  },

  // Step 3: Budget Override (point)
  {
    id: "decision-budget",
    stepNumber: 3,
    totalSteps: 11,
    type: "point",
    target: "decision-budget",
    targetPage: "simulator",
    eyebrow: "BƯỚC 3 / 11",
    title: "Thiết lập ngân sách tối đa",
    body: "Đặt trần ngân sách chi mua nguyên vật liệu giúp tối ưu danh mục nhập hàng mà không vượt quá dòng tiền khả dụng.",
    placement: "bottom",
  },

  // Step 4: Decision Engine Mode (point)
  {
    id: "decision-engine-mode",
    stepNumber: 4,
    totalSteps: 11,
    type: "point",
    target: "decision-engine-mode",
    targetPage: "simulator",
    eyebrow: "BƯỚC 4 / 11",
    title: "Lựa chọn mô hình quyết định",
    body: "Chọn Deterministic (Xác định) cho nhu cầu ổn định hoặc Stochastic (Xác suất) để phòng ngừa rủi ro biến động.",
    placement: "bottom",
  },

  // Step 5: Today Overview (point)
  {
    id: "today-summary",
    stepNumber: 5,
    totalSteps: 11,
    type: "point",
    target: "today-summary",
    targetPage: "today",
    targetActiveView: "today",
    eyebrow: "BƯỚC 5 / 11",
    title: "Bắt đầu từ hôm nay",
    body: "Đây là nơi ShelfCash tổng hợp những việc cần bạn chú ý ngay.",
    placement: "bottom",
  },

  // Step 6: Ingredient Risk (action)
  {
    id: "risk-item",
    stepNumber: 6,
    totalSteps: 11,
    type: "action",
    target: "risk-item",
    targetPage: "today",
    targetActiveView: "today",
    eyebrow: "BƯỚC 6 / 11",
    title: "Kiểm tra nguyên liệu rủi ro",
    body: "Bấm vào chữ \"Xem nhu cầu & ràng buộc\" tại dòng Sữa tươi để mở bảng phân tích rủi ro và các phương án xử lý.",
    expectedAction: "click",
    actionHint: "Bấm \"Xem nhu cầu & ràng buộc\"",
    placement: "bottom",
  },

  // Step 7: 7-Day Outlook (point)
  {
    id: "future-heatmap",
    stepNumber: 7,
    totalSteps: 11,
    type: "point",
    target: "future-heatmap",
    targetPage: "future",
    targetActiveView: "future",
    eyebrow: "BƯỚC 7 / 11",
    title: "Nhìn xa hơn 7 ngày",
    body: "Màu sắc giúp bạn nhận biết ngày và nguyên liệu có nguy cơ thiếu hàng.",
    placement: "bottom",
  },

  // Step 8: Decision Recommendation (point)
  {
    id: "decision-recommendation",
    stepNumber: 8,
    totalSteps: 11,
    type: "point",
    target: "decision-recommendation",
    targetPage: "plan",
    eyebrow: "BƯỚC 8 / 11",
    title: "Biến dự báo thành quyết định",
    body: "ShelfCash không chỉ dự báo nhu cầu mà còn chuyển chúng thành một kế hoạch nhập hàng cụ thể.",
    placement: "bottom",
  },

  // Step 9: Strategy Selection (point / explain)
  {
    id: "strategy-section",
    stepNumber: 9,
    totalSteps: 11,
    type: "point",
    target: "strategy-section",
    targetPage: "plan",
    eyebrow: "BƯỚC 9 / 11",
    title: "Ba cách sử dụng vốn",
    body: "ShelfCash đánh giá các chiến lược Tiết kiệm, Cân bằng và An toàn trước khi đề xuất một phương án.",
    placement: "bottom",
  },

  // Step 10A: Open What-if & input conditions (point)
  {
    id: "what-if-open",
    stepNumber: 10,
    totalSteps: 11,
    type: "point",
    target: "what-if-button",
    targetPage: "plan",
    eyebrow: "BƯỚC 10 / 11",
    title: "Thiết lập điều kiện giả lập",
    body: "Nhập số tiền vào ô \"Ngân sách tối đa (₫)\" hoặc điều chỉnh hệ số nhu cầu, ngày giao trễ để thử nghiệm kịch bản mới.",
    placement: "top",
  },

  // Step 10B: What-if Simulation (action)
  {
    id: "what-if-simulate",
    stepNumber: 10,
    totalSteps: 11,
    type: "action",
    target: "what-if-submit",
    targetPage: "plan",
    eyebrow: "BƯỚC 10 / 11",
    title: "Chạy giả lập kịch bản",
    body: "Bấm nút \"Chạy giả lập kịch bản\" để hệ thống tính toán phương án mới theo điều kiện bạn vừa thiết lập.",
    expectedAction: "submit",
    actionHint: "Bấm vào đây",
    placement: "top",
  },

  // What-if Result Coachmark (explain)
  {
    id: "what-if-result",
    type: "explain",
    target: "what-if-result",
    targetPage: "plan",
    eyebrow: "KẾT QUẢ GIẢ LẬP",
    title: "Kết quả so sánh với kế hoạch gốc",
    body: "Hệ thống hiển thị chênh lệch chi phí, mức độ đáp ứng (Fill Rate) và rủi ro thiếu hàng để bạn so sánh mà không làm thay đổi kế hoạch gốc.",
    placement: "top",
  },

  // Step 11: Draft PO (action)
  {
    id: "draft-po",
    stepNumber: 11,
    totalSteps: 11,
    type: "action",
    target: "draft-po-button",
    targetPage: "plan",
    eyebrow: "BƯỚC 11 / 11",
    title: "Từ quyết định đến hành động",
    body: "Khi đã hài lòng với kế hoạch, bạn có thể tạo Draft PO để kiểm tra trước khi gửi.",
    expectedAction: "click",
    placement: "bottom",
  },

  // Completion
  {
    id: "completion",
    type: "completion",
    title: "Bạn đã hoàn thành quy trình ShelfCash",
    body: "Tải dữ liệu → Trung tâm quyết định → Nhận diện rủi ro → Chọn chiến lược → What-if → Draft PO",
  },
];
