import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { OpportunityScanner } from "../app/components/opportunity/OpportunityScanner";
import { LocalContextSummary } from "../app/components/opportunity/LocalContextSummary";
import { OpportunityCandidateCard } from "../app/components/opportunity/OpportunityCandidateCard";
import { OpportunityRanking } from "../app/components/opportunity/OpportunityRanking";
import { TrialPortfolioView } from "../app/components/opportunity/TrialPortfolioView";
import { StaffShell } from "../app/components/staff/StaffShell";
import {
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

test("OpportunityScanner renders idle state with budget and scan trigger", () => {
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

test("LocalContextSummary renders compact metrics without descriptive paragraphs under heading", () => {
  const markup = renderToStaticMarkup(
    <LocalContextSummary context={PREVIEW_LOCAL_CONTEXT} />
  );

  assert.match(markup, /BỐI CẢNH KHU VỰC/);
  assert.match(markup, /Trường \/ Đại học/);
  assert.match(markup, /Transit/);
  assert.match(markup, /Cạnh tranh/);
  assert.match(markup, /Retail bổ trợ/);
  assert.match(markup, /Sinh viên cao/);
  assert.match(markup, /Mang đi mạnh/);
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
      portfolio={{
        budget: 2000000,
        allocatedCost: 1040000,
        remainingBudget: 960000,
        candidateCount: 2,
        items: [],
      }}
      selectedCandidates={selectedCands}
      onRemoveCandidate={() => undefined}
    />
  );

  assert.match(markup, /DANH MỤC THỬ NGHIỆM/);
  assert.match(markup, /Ngân sách thử/);
  assert.match(markup, /Chi phí dự kiến/);
  assert.match(markup, /Bắt đầu thử nghiệm/);
});

test("StaffShell isolation: Staff portal NEVER renders Opportunity Recommendation", () => {
  const markup = renderToStaticMarkup(
    <StaffShell session={mockStaffSession} onLogout={() => undefined} />
  );

  assert.doesNotMatch(markup, /Khám phá cơ hội/);
  assert.doesNotMatch(markup, /KHÁM PHÁ/);
  assert.doesNotMatch(markup, /Opportunity/i);
});
