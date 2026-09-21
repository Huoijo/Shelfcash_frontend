import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { OpportunityLocationWorkspace } from "../app/components/opportunity/OpportunityLocationWorkspace";
import { FallbackOpportunityScanner } from "../app/components/opportunity/map/FallbackOpportunityScanner";
import { OpportunityScanner } from "../app/components/opportunity/OpportunityScanner";
import { LocalContextSummary } from "../app/components/opportunity/LocalContextSummary";
import { OpportunityCandidateCard } from "../app/components/opportunity/OpportunityCandidateCard";
import { OpportunityRanking } from "../app/components/opportunity/OpportunityRanking";
import { TrialPortfolioView } from "../app/components/opportunity/TrialPortfolioView";
import { StaffShell } from "../app/components/staff/StaffShell";
import {
  CANONICAL_PREVIEW_POIS,
  DEFAULT_STORE_LOCATION,
  PREVIEW_CANDIDATE_CATALOG,
  PREVIEW_LOCAL_CONTEXT,
} from "../lib/opportunity/candidate-catalog";
import type { UserSession } from "../lib/auth";

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

test("OpportunityLocationWorkspace renders search, map, location card, radius, and scan action", () => {
  const markup = renderToStaticMarkup(
    <OpportunityLocationWorkspace
      storeName="ShelfCash Flagship Coffee"
      analysisLocation={DEFAULT_STORE_LOCATION}
      radiusKm={3}
      trialBudget={2000000}
      status="idle"
      pois={CANONICAL_PREVIEW_POIS}
      onLocationChange={() => undefined}
      onRadiusChange={() => undefined}
      onBudgetChange={() => undefined}
      onStartScan={() => undefined}
      onResetScan={() => undefined}
    />
  );

  // Search box
  assert.match(markup, /Tìm địa chỉ hoặc địa điểm/);

  // Analysis Location Card
  assert.match(markup, /ĐỊA ĐIỂM PHÂN TÍCH/);
  assert.match(markup, /Cửa hàng hiện tại/);
  assert.match(markup, /ShelfCash Flagship Coffee/);
  assert.match(markup, /268 Lý Thường Kiệt/);

  // Radius buttons
  assert.match(markup, /1 km/);
  assert.match(markup, /2 km/);
  assert.match(markup, /3 km/);

  // Budget & Scan trigger
  assert.match(markup, /Ngân sách thử nghiệm/);
  assert.match(markup, /QUÉT CƠ HỘI/);
});

test("OpportunityLocationWorkspace renders survey mode when searching non-store location", () => {
  const surveyLocation = {
    lat: 10.7937,
    lng: 106.7219,
    label: "Landmark 81",
    address: "720A Điện Biên Phủ, Bình Thạnh, TP.HCM",
    source: "search" as const,
  };

  const markup = renderToStaticMarkup(
    <OpportunityLocationWorkspace
      storeName="ShelfCash Flagship Coffee"
      analysisLocation={surveyLocation}
      radiusKm={5}
      trialBudget={2000000}
      status="idle"
      pois={CANONICAL_PREVIEW_POIS}
      onLocationChange={() => undefined}
      onRadiusChange={() => undefined}
      onBudgetChange={() => undefined}
      onStartScan={() => undefined}
      onResetScan={() => undefined}
    />
  );

  assert.match(markup, /Vị trí khảo sát/);
  assert.match(markup, /Landmark 81/);
  assert.match(markup, /Về cửa hàng/);
});

test("FallbackOpportunityScanner renders vector map, radius rings, target center, and POI markers", () => {
  const markup = renderToStaticMarkup(
    <FallbackOpportunityScanner
      center={DEFAULT_STORE_LOCATION}
      radiusKm={3}
      pois={CANONICAL_PREVIEW_POIS}
      isScanning={false}
      status="idle"
    />
  );

  assert.match(markup, /Bản đồ phân tích cơ hội/);
  assert.match(markup, /opp-vector-map-canvas/);
  assert.match(markup, /opp-map-center-target/);
  assert.match(markup, /opp-map-poi-marker/);
  assert.match(markup, /Highlands Coffee/);
});

test("OpportunityScanner backwards-compatible fallback renders idle state with budget and scan trigger", () => {
  const markup = renderToStaticMarkup(
    <OpportunityScanner
      storeName="ShelfCash Flagship Coffee"
      radiusKm={3}
      trialBudget={2000000}
      status="idle"
      onStartScan={() => undefined}
      onResetScan={() => undefined}
    />
  );

  assert.match(markup, /ShelfCash Flagship Coffee/);
  assert.match(markup, /Bán kính 3 km/);
  assert.match(markup, /Ngân sách thử nghiệm/);
  assert.match(markup, /Quét cơ hội/);
  assert.match(markup, /CỬA HÀNG/);
});

test("OpportunityCandidateCard renders ranking score and key criteria accurately without fake probability", () => {
  const cand = PREVIEW_CANDIDATE_CATALOG[0];
  const markup = renderToStaticMarkup(
    <OpportunityCandidateCard
      candidate={cand}
      isSelectedInPortfolio={false}
      onInspect={() => undefined}
      onTogglePortfolio={() => undefined}
    />
  );

  assert.match(markup, /Trà Lài/);
  assert.match(markup, /Điểm cơ hội/);
  assert.match(markup, /0\.82/);
  assert.doesNotMatch(markup, /82%/); // Must not display as fake probability percentage
  assert.match(markup, /CÙNG NGÀNH/);
  assert.match(markup, /Phù hợp khu vực/);
  assert.match(markup, /Tận dụng nguyên liệu/);
  assert.match(markup, /Xem lý do/);
  assert.match(markup, /Thêm vào thử nghiệm/);
});

test("LocalContextSummary renders compact metrics and supports interactive category filter selection", () => {
  const markup = renderToStaticMarkup(
    <LocalContextSummary
      context={PREVIEW_LOCAL_CONTEXT}
      activeCategoryFilter="university"
    />
  );

  assert.match(markup, /BỐI CẢNH KHU VỰC/);
  assert.match(markup, /Trường \/ Đại học/);
  assert.match(markup, /Transit/);
  assert.match(markup, /Cửa hàng \/ Đối thủ/);
  assert.match(markup, /Retail bổ trợ/);
  assert.match(markup, /Sinh viên cao/);
  assert.match(markup, /Mang đi mạnh/);
  assert.match(markup, /Đang lọc trên bản đồ/);
});

test("OpportunityRanking displays Top 3 by default with view all toggle", () => {
  const markup = renderToStaticMarkup(
    <OpportunityRanking
      candidates={PREVIEW_CANDIDATE_CATALOG}
      selectedCandidateIds={new Set(["cand-tra-lai"])}
      onInspect={() => undefined}
      onTogglePortfolio={() => undefined}
    />
  );

  assert.match(markup, /CƠ HỘI ĐÁNG THỬ/);
  assert.match(markup, /Trà Lài/);
  assert.match(markup, /Cà Phê Muối Biển/);
  assert.match(markup, /Cold Brew Cam Sả/);
  assert.match(markup, /Xem tất cả/);
});

test("TrialPortfolioView renders allocated budget, remaining budget, and item list", () => {
  const selectedCands = PREVIEW_CANDIDATE_CATALOG.slice(0, 2);
  const markup = renderToStaticMarkup(
    <TrialPortfolioView
      metrics={{
        budget: 2000000,
        selectedCandidateIds: selectedCands.map((c) => c.id),
        totalCost: 1040000,
        remainingBudget: 960000,
        utilizationRate: 0.52,
        utilizationPercent: 52,
        candidateCount: 2,
        feasible: true,
        violations: [],
        source: "optimizer",
      }}
      selectedCandidates={selectedCands}
      onRemoveCandidate={() => undefined}
    />
  );

  assert.match(markup, /DANH MỤC THỬ NGHIỆM/);
  assert.match(markup, /Ngân sách thử/);
  assert.match(markup, /Chi phí dự kiến/);
  assert.match(markup, /Bắt đầu thử nghiệm/);
  assert.match(markup, /Vì sao chọn danh mục này\?/);
});

test("StaffShell isolation: Staff portal NEVER renders Opportunity Recommendation", () => {
  const markup = renderToStaticMarkup(
    <StaffShell session={mockStaffSession} onLogout={() => undefined} />
  );

  assert.doesNotMatch(markup, /Khám phá cơ hội/);
  assert.doesNotMatch(markup, /KHÁM PHÁ/);
  assert.doesNotMatch(markup, /Opportunity/i);
});

test("Opportunity cards start unselected without pre-choosing items for customer", () => {
  const emptySelected = new Set<string>();

  const rankingMarkup = renderToStaticMarkup(
    <OpportunityRanking
      candidates={PREVIEW_CANDIDATE_CATALOG}
      selectedCandidateIds={emptySelected}
      onInspect={() => undefined}
      onTogglePortfolio={() => undefined}
    />
  );

  // All visible cards should prompt "Thêm vào thử nghiệm", none should say "Đã chọn thử"
  assert.doesNotMatch(rankingMarkup, /Đã chọn thử/);
  assert.match(rankingMarkup, /Thêm vào thử nghiệm/);
  assert.doesNotMatch(rankingMarkup, /is-selected/);

  const portfolioMarkup = renderToStaticMarkup(
    <TrialPortfolioView
      metrics={{
        budget: 2000000,
        selectedCandidateIds: [],
        totalCost: 0,
        remainingBudget: 2000000,
        utilizationRate: 0,
        utilizationPercent: 0,
        candidateCount: 0,
        feasible: false,
        violations: [{ code: "EMPTY_SELECTION", message: "Chưa có ứng viên nào được chọn." }],
        source: "optimizer",
      }}
      selectedCandidates={[]}
      onRemoveCandidate={() => undefined}
    />
  );

  assert.match(portfolioMarkup, /0 ứng viên đã chọn/);
  assert.match(portfolioMarkup, /Chưa có ứng viên nào được chọn/);
});

