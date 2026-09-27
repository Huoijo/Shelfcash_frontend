# ShelfCash FE ↔ BE Integration State

> **Living Engineering Artifact & Handoff Document**  
> This document serves as the persistent navigation, invariant, and state layer for the ShelfCash Frontend ↔ Backend integration refactor. Future agents must read this document first before inspecting targeted files. It complements, but does not replace, runtime OpenAPI, backend contracts, and tests.

---

## 1. Metadata & Verification Header

- **Artifact Purpose:** Canonical integration state, locked invariants, data authority, and handoff guide.
- **Last Updated:** 2026-09-21
- **Frontend Branch:** `main`
- **Frontend HEAD Commit:** `6be176374b21fc44a831b1e712d55d44163d75cc`
- **Backend Contract/Source Version Last Verified:**
  - Contract Specs: `frontend-backend-api-contract.md`, `strategy-selection-presentation-fe-contract.md`
  - Canonical Remote Backend: `origin/main` commit `9fcfbb038c0acd127dc8bee77b884c6411341cc6`
  - Local Stale Reference: `feature/candidate-catalog` commit `a828b96d8ab5b0769916b8efe25674eee2eb7232` (STALE, missing brief presentation)
- **Runtime OpenAPI Verification Status:** `UNVERIFIED` (Runtime backend not running during audit)
- **Live E2E Verification Status:** `UNVERIFIED` (Local backend runtime not active)
- **Last Accepted Patch:** `PATCH 6.1 — FINALIZED WITH DOCUMENTED DEBT`

---

## 2. Source of Truth Hierarchy

When resolving contract or implementation questions, strictly follow this order:

1. **Runtime `/openapi.json`:** Strongest API schema truth when live backend runtime is reachable.
2. **Latest Backend Handoff Contracts:** `frontend-backend-api-contract.md` and `strategy-selection-presentation-fe-contract.md`.
3. **Latest Official Backend Main Implementation:** Backend `origin/main` (commit `9fcfbb0` or later).
4. **Frontend Integration Artifact (`docs/FE_BACKEND_INTEGRATION_STATE.md`):** Context, boundaries, and navigation map.
5. **Historical Patch Reports:** Audit history only; superseded by current codebase and this living artifact.
6. **Local / Outdated Backend Checkouts:** Must NEVER override newer contracts or canonical main branch.

---

## 3. Current Architecture

```text
Browser Client
     │
     ▼
/api/shelfcash/...  (Next.js App Route)
     │
     ▼
Server BFF Proxy: lib/backend-proxy.ts  (Route whitelist + secret header injection)
     │
     ▼
ShelfCash FastAPI Backend
```

### Core Decision Flow
```text
POST /api/v1/stores/{store_id}/decision-runs
     │
     ▼
Raw DecisionPackage Polling (GET /decision-runs/{id})
     │  (Poll until terminal: "success" | "failed" | "infeasible")
     ▼
GET /api/v1/decision-runs/{id}/brief  [INV-001 Canonical Authority]
     │
     ▼
DecisionBriefFacts
     │
     ▼
adaptManagerDecisionViewModel() (lib/decision-view.ts)
     │
     ▼
Manager-facing UI (DecisionBriefWorkspace, TodayView, PlanView)
```

---

## 4. Locked Integration Invariants

| ID | Invariant Rule | Where Enforced | Relevant Tests |
| :--- | :--- | :--- | :--- |
| **INV-001** | **Manager Brief Authority:** Manager-facing Decision business truth comes exclusively from `GET /api/v1/decision-runs/{id}/brief`. Never extract business metrics from raw `DecisionPackage`. | `lib/decision-view.ts`<br>`app/components/DecisionBriefWorkspace.tsx`<br>`app/views/TodayView.tsx` | `tests/decision-run.test.ts`<br>`tests/manager-decision-binding.test.tsx` |
| **INV-002** | **No Raw Manager Fallback:** If `/brief` is loading, unavailable, or failed, the UI renders explicit loading/error/unavailable states. It must NEVER construct synthetic manager metrics from raw `DecisionPackage`. | `lib/decision-view.ts`<br>`app/components/DecisionBriefWorkspace.tsx` | `tests/manager-decision-binding.test.tsx` |
| **INV-003** | **Grounded Strategy Copy:** Strategy explanation renders verbatim from `brief.strategy_selection_presentation` (`headline`, `summary`, `status_label`, `note`, `message`, `detail_lines`). No FE-generated heuristics or regex. | `lib/decision-view.ts`<br>`lib/strategy-alternatives.ts`<br>`app/components/DecisionBriefWorkspace.tsx` | `tests/strategy-alternatives.test.tsx`<br>`tests/grounded-strategy-presentation.test.tsx` |
| **INV-004** | **No Strategy Metric Fabrication:** No artificial multipliers (`* 0.85`, `* 1.20`, `* 0.88`, `* 1.15`). Comparative metrics must come from `brief.strategy_comparison`. | `lib/strategy-alternatives.ts`<br>`app/components/DecisionBriefWorkspace.tsx` | `tests/strategy-alternatives.test.tsx` |
| **INV-005** | **No Silent Live Mock:** Live missing data must never silently fall back to realistic mock data. Mock fixtures are isolated strictly to preview modes. | `lib/decision-view.ts`<br>`app/views/TodayView.tsx` | `tests/manager-decision-binding.test.tsx` |
| **INV-006** | **Null Is Not Zero:** Backend `null` = unavailable / not computed (`"—"`). Numeric `0` = genuine zero (`"0 ₫"`, `"0%"`). Missing demand/stock metrics in risk engine $\rightarrow$ `unknown` / `missing_data`. | `app/components/ui.tsx`<br>`lib/risk-engine.ts` | `tests/data-semantics-resilience.test.ts` |
| **INV-007** | **Stable Idempotent Retry:** Mutation retries with identical intent preserve the same `Idempotency-Key` and request identity across retries. | `lib/backend-proxy.ts`<br>`app/ShelfCashApp.tsx`<br>`app/views/ImportView.tsx` | `tests/proxy.test.ts`<br>`tests/data-semantics-resilience.test.ts` |
| **INV-008** | **PO Lineage:** Draft Purchase Order creation preserves active `forecast_run_id` (compat `plan_run_id`). No dependency on orphaned `workflowSnapshot`. | `app/ShelfCashApp.tsx` | `tests/planning-workflow.test.ts` |
| **INV-009** | **What-if Isolation:** `POST /decision-runs/{id}/what-if` is a read-only scenario simulation. Its response must never overwrite the canonical Decision Brief. | `lib/decision-view.ts`<br>`app/components/DecisionCenterWorkspace.tsx` | `tests/decision-center-workspace.test.tsx` |
| **INV-010** | **Authoritative Store Scope:** Live backend requests require a validated active store ID. Never silently fall back to `"STORE_001"`. | `app/views/ImportView.tsx`<br>`app/ShelfCashApp.tsx` | `tests/data-semantics-resilience.test.ts`<br>`tests/planning-workflow.test.ts` |
| **INV-011** | **Explicit Error vs Business State:** Distinguish network failures (error) from `recommendation.available=false` or `no_feasible_strategy` (valid business states) and missing metrics (unavailable). | `lib/decision-view.ts`<br>`app/components/DecisionBriefWorkspace.tsx` | `tests/decision-run.test.ts` |
| **INV-012** | **Raw Decision Technical Boundary:** Raw `DecisionPackage` is restricted to lifecycle polling, technical diagnostics, simulation inspection, and 7-day daily demand bucket visualization. | `app/ShelfCashApp.tsx`<br>`lib/decision-diagnostics.ts`<br>`app/components/SimulationResultPanel.tsx` | `tests/decision-diagnostics.test.ts` |
| **INV-013** | **Dirty Working Tree Awareness:** Accepted integration patches may exist in the working tree and untracked files without being committed into current HEAD. Future agents must inspect `git status`, `git diff --stat`, and untracked files before using HEAD as the complete implementation state. Never reset, checkout, restore, or discard accepted integration work merely because it is uncommitted. | Agent Protocol / Workspace Guardrails | `git status --short`<br>`git diff --stat` |
| **INV-014** | **Explicit Tutorial Isolation:** Tutorial/demo data and simulated mutations may only be used when Tutorial Mode is explicitly active (`mode === "tutorial"`). Tutorial state must never silently enter Live Manager workflows or live backend mutations. In Tutorial Mode, What-if simulation executes locally, Draft PO creates simulated local records, and ZERO live backend mutations are dispatched. Live Mode must never consume tutorial state. | `app/ShelfCashApp.tsx`<br>`app/components/tutorial/TutorialContext.tsx`<br>`lib/tutorial/tutorial-fixture.ts` | `tests/tutorial-tour.test.tsx` |
| **INV-015** | **Explanation Conversation Integrity:** `/explanation` responses must remain within the conversation model. A handled 422 is assistant guidance, not a page error. Frontend branches on backend error `code`, never human-readable `message`, never performs silent semantic retry, and never invents a rejected explanation locally. | `lib/explanation-chat.ts`<br>`app/components/DecisionExplanationDrawer.tsx`<br>`lib/shelfcash-client.ts` | `tests/explanation-chat-contract.test.tsx` |

---

## 5. Data Authority Matrix

| Concern | Canonical Source | Allowed Secondary Source | Strictly Forbidden |
| :--- | :--- | :--- | :--- |
| **Manager Recommendation** | `brief.recommendation` | None | Raw `decision.recommended_plan` |
| **Strategy Presentation** | `brief.strategy_selection_presentation` | None | Hardcoded copy, reason code narratives |
| **Strategy Comparison** | `brief.strategy_comparison` | None | Fabricated multipliers (`0.85`, `1.2`) |
| **Decision Status Polling** | `GET /decision-runs/{id}` | None | Indefinite polling without backoff |
| **Technical Diagnostics** | Raw `DecisionPackage` (`critic_findings`, solver metrics) | None | Presenting solver logs as manager guidance |
| **7-Day Daily Demand** | Raw `decision.ingredient_demand` | None (brief lacks daily date buckets) | Fabricating daily curves |
| **What-if Simulation** | `POST /decision-runs/{id}/what-if` response | None | Mutating canonical Decision Brief |
| **Purchase Order State** | `GET /purchase-orders` (Page envelope) | None | Discarding pagination metadata |
| **Store Identity** | Session/Context `storeId` | Explicit `defaultStoreId` | Hardcoded fallback to `"STORE_001"` |

---

## 6. Raw `DecisionPackage` Allowed Usages

| File | Field / Method | Purpose | Manager Facing? | Why Raw Is Required | Can `/brief` Replace Today? |
| :--- | :--- | :--- | :---: | :--- | :--- |
| `app/ShelfCashApp.tsx` | `pollDecisionRun` | Decision run lifecycle polling | No | Brief does not exist until run completes | No (lifecycle pre-requisite) |
| `app/components/DecisionBriefWorkspace.tsx` | `decision.critic_findings`, `warnings` | Technical diagnostic inspect panel | No (collapsible) | Brief contains high-level facts, not solver critic logs | No (technical diagnostics) |
| `app/components/SimulationResultPanel.tsx` | Entire `decision` | Simulation technical inspection | No | Technical simulation panel for debugging | No |
| `app/components/DecisionCenterWorkspace.tsx` | `decision.ingredient_demand` | 7-day daily ingredient bucket visualization | Yes (drilldown) | `/brief` currently lacks daily `target_date` demand breakdown | Not until backend adds daily buckets to brief |
| `lib/decision-diagnostics.ts` | Solver telemetry & constraints | Diagnostics engine | No | Technical solver evaluation | No |
| `lib/risk-engine.ts` | `decision.procurement_rows` | Fallback receipt modeling if brief absent | Operational | Offline/test simulation fallback | Yes, when brief is supplied |

---

## 7. Patch History

- **PATCH 1 — DONE (Purchase Order Lineage):** Removed orphaned `workflowSnapshot` dependency. Replaced with canonical `forecast_run_id` lineage.
- **PATCH 2 — DONE (Contract Plumbing):** Added proxy routes for inventory constraints and business constraint types. Wired mutation idempotency.
- **PATCH 3 — DONE (Grounded Strategy Presentation):** Replaced fake heuristic multipliers with `brief.strategy_selection_presentation` grounded copy.
- **PATCH 3.1 — DONE (Contract Hardening):** Confirmed local backend checkout was stale relative to `origin/main`. Quarantined solver diagnostics from manager copy.
- **PATCH 4 — DONE (Manager Decision Binding):** Bound manager view to `GET /decision-runs/{id}/brief`. Eliminated live 7-day mock fallback in `TodayView`.
- **PATCH 4.1 — DONE (Manager Truth Hardening):** Removed raw `DecisionPackage` fallback for manager business metrics. Explicit loading/error/unavailable states.
- **PATCH 5 — PASS WITH FOLLOW-UP (Data Semantics & Resilience):** Enforced null $\neq$ zero; removed live `STORE_001` fallback in `ImportView`; bounded import polling (120s); added `Page<T>` and preserved PO pagination metadata.
- **PATCH 6 — DONE WITH DOCUMENTED DEBT (Final Cleanup, Contract Closure & Regression):** Safely decommissioned confirmed dead `DecisionCenter.tsx`; removed deprecated `getDecisionExplanation()` and `getDecisionWhatIf()` helpers; typed `getInventoryMovements`, `getHistory`, and `getPurchaseOrders` with canonical `Page<T>` contracts; fixed `app/chatgpt-auth.ts:1` syntax corruption; validated all locked invariants (INV-001 through INV-013); 261/261 tests pass.
- **PATCH 6.1 — FINALIZED WITH DOCUMENTED DEBT (Final Verification Hardening):** Restored strict Backend contract types in `lib/types.ts` (`DecisionBriefFacts` recommendation, forecast, risk, and store_id required); proved STORE_001 data-flow safety (zero live leak); explained test count delta (262 $\rightarrow$ 261) by safe removal of dead DecisionCenter test; resolved 40 type errors in active views/workspaces (`ForecastChart`, `ProcurementDecisionWorkspace`, `DecisionBriefWorkspace`, `DecisionCenterWorkspace`); global TSC down from 92 to 52 errors (45 Preview-only Google Maps debt + 7 pre-existing baseline active debt); targeted linter 100% clean (0 errors); 261/261 tests pass; build passes.

---

## 8. Pagination, Store Identity & Import State (Post-PATCH 6)

### A. Pagination Status Matrix
| API / List | Backend Pagination | FE Metadata Preserved | UI Consumes Metadata | Status |
| :--- | :---: | :---: | :---: | :--- |
| **Purchase Orders** | Yes (`Page`) | Yes (`adaptPaginatedOrders`) | Yes (shows visible/total) | **DONE** |
| **Inventory Movements** | Yes (`Page`) | Yes (`Page<InventoryMovementRecord>`) | No active UI view | **CLIENT DONE / UNUSED IN UI** |
| **Imports List** | Yes (`Page`) | Not exposed in FE client | No active UI view | **AVAILABLE / UNUSED** |
| **Sales / Usage / PO History** | Yes (`Page`) | Yes (`Page<SalesHistoryRow \| ...>`) | Ingestion/bootstrap only | **CLIENT DONE / UNUSED IN UI** |
| **Menu Products** | Yes (`MenuList`) | Yes (`MenuListResponse`) | Yes (`total` preserved) | **DONE** |

### B. Store Identity Audit Matrix
| File | Usage | Context | Safe? | Action / Classification |
| :--- | :--- | :--- | :---: | :--- |
| `app/views/ImportView.tsx` | Form state | Live API | **Safe** | Hardcoded fallback removed; raises `STORE_NOT_SELECTED`. |
| `lib/opportunity/api-service.ts` | Service defaults | Preview | **Safe** | Quarantined under `PREVIEW_OPPORTUNITY_STORE_ID = "STORE_001"`. |
| `app/views/OpportunityView.tsx` | Default prop | Preview | **Safe** | Preview module isolated from live planning. |
| `lib/auth.ts` | Demo accounts | Demo Auth | **Safe** | Local demo profile login ("quản lý" / "nhân viên"). |
| `lib/data.ts` | `initialData` | Offline State | **Safe** | Fallback bootstrap fixture when uninitialized. |
| `tests/*` | Test fixtures | Testing | **Safe** | Test isolation. |

### C. Import Resume Debt
- **Current State:** Polling timeout raises `CLIENT_TIMEOUT`, preserving `import_id` and idempotency key so the user can click "Đồng bộ" without restarting mutations.
- **Hard-Refresh Recovery Decision:** Full browser hard-refresh clears in-memory React state. Attempting full multi-step file/mapping reconstruction across reloads without backend session state is fragile and introduces large UX scope creep. Kept as documented future debt.

---

## 9. Important File Responsibilities

- **`lib/backend-proxy.ts`:** Route whitelist for Next.js BFF proxy and server-side secret header injection.
- **`lib/shelfcash-client.ts`:** Canonical HTTP transport client and endpoint query definitions.
- **`lib/decision-view.ts`:** Canonical adapter (`adaptManagerDecisionViewModel`) mapping `/brief` facts to manager UI state.
- **`lib/contract-adapters.ts`:** Response normalization, safety envelopes, and `adaptPaginatedOrders`.
- **`lib/risk-engine.ts`:** 7-day forward stock simulation with explicit `missing_data` semantics.
- **`lib/types.ts`:** Canonical TypeScript types matching backend schemas (including `Page<T>`).
- **`lib/simulation-orchestration.ts`:** Orchestrates Forecast $\rightarrow$ Decision run lifecycle.
- **`app/ShelfCashApp.tsx`:** Top-level application state, run lineage, and operational synchronization.
- **`app/components/DecisionBriefWorkspace.tsx`:** Manager decision view and separated technical diagnostics.
- **`app/components/DecisionCenterWorkspace.tsx`:** Operational decision planning workspace and 7-day bucket chart.
- **`app/views/TodayView.tsx`:** Manager-facing operational cockpit.
- **`app/views/ImportView.tsx`:** Bounded import polling, mapping confirmation, and store validation.
- **`app/views/PlanView.tsx`:** Procurement view displaying paginated order status.

---

## 10. Preview / Not Connected Modules

1. **Opportunity Analysis (`lib/opportunity/`, `app/views/OpportunityView.tsx`):**
   - Status: Preview / Disconnected. Uses `PREVIEW_OPPORTUNITY_STORE_ID`. Must not leak into live procurement.
2. **Forecast Benchmark (`app/components/forecast/`):**
   - Status: Demo / Mock fixture evaluation.
3. **Staff Portal (`app/components/staff/`):**
   - Status: Feature-flagged scaffold.

---

## 11. Known Baseline Debt (Post-PATCH 6.1)

- **`app/chatgpt-auth.ts:1`:** **RESOLVED.** Baseline syntax corruption corrected.
- **Active Workspace & Type Hardening:** All 40 type errors in active decision workspaces (`ForecastChart`, `ProcurementDecisionWorkspace`, `DecisionBriefWorkspace`, `DecisionCenterWorkspace`) and `ShelfCashApp` forecast response typing were completely resolved.
- **Remaining Pre-existing Category B Debt (52 errors total):**
  1. **Disconnected Opportunity Preview (45 errors in 6 files):** `lib/opportunity/google-maps-loader.ts` and `app/components/opportunity/map/GoogleOpportunityMap.tsx` require Google Maps global types (`@types/google.maps`). Quarantined strictly under preview boundary (`PREVIEW_OPPORTUNITY_STORE_ID`).
  2. **ShelfCashApp Pre-Phase 1 Legacy Stubs (4 errors):** Stubs for `updateInventoryPolicy`, `updateSupplierConstraints`, `updatePurchaseOrder`, and `trainForecastModel` remain in top-level state container from pre-audit commits.
  3. **PlanView Unreachable Comparison Checks (3 errors):** Lines 1082, 1088, 1097 checking `focus === "plan"` after earlier return in line 923.
  *Note:* All 261 tests, contract adapters, core decision workspaces, and logic test suites compile and pass with 0 errors.

---

## 12. Verification Status

- **`npm run test:logic`:** `281 / 281 PASS` (100% — includes 10 new tests in `tests/tutorial-tour.test.tsx` verifying first-run welcome, dismiss persistence, completion persistence, live safety with 0 mutations, action gating, missing-target resilience, and INV-014 banner)
- **`npm run build`:** `PASS` (Vinext production build succeeded)
- **Global TypeScript (`npx tsc --noEmit`):** `EXIT 2 (53 errors)` — Pre-existing Opportunity Preview Google Maps debt + legacy stubs. 0 errors in tutorial code.
- **Targeted Production Linter on Tutorial:** `PASS` (`0 errors, 0 warnings` on `lib/tutorial/*.ts`, `app/components/tutorial/*.tsx`, `tests/tutorial-tour.test.tsx`).
- **Runtime Backend OpenAPI:** `UNVERIFIED` (Backend runtime not active locally during audit).
- **Live E2E Verification:** `UNVERIFIED` (Local runtime not active).

---

## 13. Null-Semantic Rules

- `formatVnd(value)`: `null`/`undefined` $\rightarrow$ `"—"`; `0` $\rightarrow$ `"0 ₫"`.
- `formatNullablePercent(value)`: `null`/`undefined` $\rightarrow$ `"—"`; `0` $\rightarrow$ `"0%"`.
- `formatNullableQuantity(value, unit)`: `null`/`undefined` $\rightarrow$ `"—"`; `0` $\rightarrow$ `"0"`.
- `risk-engine`: Missing demand (`p50 == null`) or initial stock $\rightarrow$ `severity: "unknown"`, `basis: "missing_data"`.
- **Intentional `?? 0` Retained:** Allowed strictly for mathematical accumulators (`reduce`), UI counters (`array.length ?? 0`), and pagination indices.

---

## 14. Import Lifecycle State

```text
POST /api/v1/imports  -->  returns { import_id }
     │
     ▼
GET /api/v1/imports/{id}  (poll schema mapping)
     │
     ▼
POST /api/v1/imports/{id}/confirm  (idempotent)
     │
     ▼
POST /api/v1/imports/{id}/process  (idempotent)
     │
     ▼
GET /api/v1/imports/{id}/result
     │  (Bounded polling: 120s max, 2s interval)
     ├── Success  --> IngestionResult displayed
     └── Timeout  --> CLIENT_TIMEOUT (phase remains "processing", import_id preserved)
```

---

## 15. Next Work (Post-PATCH 6 Handoff)

1. **Runtime OpenAPI Verification:** Validate all endpoints against live `/openapi.json` once backend runtime is running on port 8000.
2. **Controlled Live E2E Smoke:** Run live smoke flow (forecast run $\rightarrow$ decision run $\rightarrow$ brief $\rightarrow$ draft PO) against live staging/test backend.
3. **Opportunity Type Definitions:** Add `@types/google.maps` if Opportunity preview module is scheduled for connection to production.
4. **Decommission Pre-Phase 2 Stubs:** Refactor remaining legacy stubs in `app/ShelfCashApp.tsx`.

---

## 16. Targeted Files for Next Scope

- **If validating runtime OpenAPI:** `docs/FE_BACKEND_INTEGRATION_STATE.md`, `lib/backend-proxy.ts`
- **If resolving Opportunity baseline debt:** `lib/opportunity/google-maps-loader.ts`, `app/components/opportunity/map/GoogleOpportunityMap.tsx`
- **If cleaning legacy stubs:** `app/ShelfCashApp.tsx`

---

## 17. Future Agent Startup Protocol

1. **Read This Artifact First:** Understand current invariants and boundaries.
2. **Review Backend Spec:** Read `frontend-backend-api-contract.md` and `strategy-selection-presentation-fe-contract.md`.
3. **Verify Git State:** Run `git status`, `git diff --stat`, and check `HEAD`.
4. **Inspect Targeted Files Only:** Do not perform a global codebase audit.
5. **Respect Locked Invariants:** Treat `INV-001` through `INV-012` as non-negotiable regression constraints.
6. **Implement & Validate:** Run `npm run test:logic`, `npm run build`, and ESLint on modified files.
7. **Update Artifact:** Append patch result and update verification status upon acceptance.

---

## 18. Tutorial Mode Architecture & Isolation (INV-014)

### Experience Boundary
```ts
export type AppExperienceMode = "live" | "tutorial";
```
When `mode === "tutorial"`, the application operates under an isolated simulation boundary:
1. **Mock / Fixture Grounding:** Grounded in deterministic fixtures (`lib/tutorial/tutorial-fixture.ts`) reusing existing canonical structures in `lib/mock-data.ts`.
2. **Zero Live Mutation:** Live mutation endpoints (`/what-if`, `/purchase-orders`, `/imports`) are completely intercepted. What-if recalculates locally via `getTutorialWhatIfResponse()`, and Draft PO generation creates local simulated records (`getTutorialDraftOrders()`) with 0 network calls.
3. **Live Mode Protection:** Live Mode never reads tutorial state; switching to Live restores canonical live state immediately.
4. **Persistent Banner:** A subtle but sticky disclaimer banner (`TutorialBanner.tsx`) displays `"Đang ở chế độ hướng dẫn — dữ liệu mẫu"` and provides an instant `"Thoát hướng dẫn"` button.

### Persistence & Experienced User Guardrails
- **Storage Key:** `shelfcash_tutorial_prefs_v1` in `localStorage`.
- **First-run Logic:** Only users with `completed === false`, `dismissed === false`, and `hasMeaningfulActivity === false` are shown the non-intrusive `TutorialWelcomeCard`.
- **Experienced Users:** Users who have completed the tour, dismissed the card, or entered real business data are never interrupted automatically.
- **Manual Replay:** Header `HelpMenu` (`? Trợ giúp`) provides persistent, unobtrusive access to "Tham quan ShelfCash" and step guides at any time.

### Core Tutorial Architecture Files
- `lib/tutorial/types.ts`: Core type model, preferences schema, storage helpers.
- `lib/tutorial/tutorial-fixture.ts`: Deterministic mock fixtures derived from `lib/mock-data.ts`.
- `lib/tutorial/tutorial-steps.ts`: 7-step guided story (Today $\rightarrow$ Risk $\rightarrow$ 7-day $\rightarrow$ Decision $\rightarrow$ Strategy $\rightarrow$ What-if $\rightarrow$ Draft PO).
- `app/components/tutorial/TutorialContext.tsx`: State controller (`TutorialProvider`, `useTutorial`) managing step progress, actions, and navigation.
- `app/components/tutorial/TutorialOverlay.tsx`: Spotlight cutout, backdrop overlay, action pulse ring, and adaptive tooltip positioning.
- `app/components/tutorial/TutorialWelcomeCard.tsx`: First-run invitation card.
- `app/components/tutorial/TutorialCompletionCard.tsx`: Visual flow completion card.
- `app/components/tutorial/TutorialBanner.tsx`: Persistent tutorial mode banner.
- `app/components/tutorial/HelpMenu.tsx`: Header help dropdown for manual replay.
- `app/components/tutorial/TutorialBeacon.tsx`: Lightweight contextual feature discovery beacon.
- `tests/tutorial-tour.test.tsx`: Comprehensive integration test suite for tour logic, live safety, and INV-014.

---

## 19. Explanation Chat Contract (PATCH 7)

### Core Rules & Invariants
- **Interactive Q&A Only:** `/explanation` (`POST /api/v1/decision-runs/{decision_run_id}/explanation`) is strictly an interactive conversational tool. It is NEVER auto-fetched on Decision page mount, nor does it serve as the default strategy-card narrative source (preserving INV-001/INV-002).
- **200 Success:** Renders `response.answer` in a normal assistant answer bubble. Stores full `ExplanationSuccess` with citations, claims, assumptions, risks, and entity references for optional on-demand evidence disclosure.
- **Deterministic Fallback:** When `response.provider === "deterministic_fallback"`, this is treated as a normal valid answer. No error alert, degraded-service warning, or retry button is displayed.
- **No-Feasible Result:** If the backend produces a response indicating "no feasible plan", it is rendered normally as a valid business result, never converted to a toast or failure banner (INV-011).
- **422 is Chat Guidance:** Handled 422 HTTP responses are assistant guidance bubbles within the chat transcript (`ExplanationChatMessage.kind === "guidance"`). They NEVER become page-level errors, toasts, reloads, or Decision Run resets.
- **Branch on `error.code` Only:** Frontend branches strictly on `error.code`, NEVER on `error.message`. `message` is for diagnostics/support only.
- **Row-Level Actions:** Row actions from Demand / Procurement rows send the canonical `ingredient_id` (`row.ingredient_id`), never displayed ingredient names.
- **Free-Text Ingredient Resolution:** Free-text queries omit `ingredient_id`. The backend owns entity resolution; frontend performs NO local search or fuzzy matching.
- **Ambiguous Resolution:** When receiving `INGREDIENT_RESOLUTION_AMBIGUOUS`, candidates are derived strictly from `error.details.candidates`. Selecting a candidate retries the original question with the chosen canonical ID.
- **503 / Network Failure:** Renders recoverable assistant bubble with explicit "Thử lại" button. Original request parameters are preserved exactly; NO automatic retry loop or page reload.
- **Transcript Preservation:** Transcript is preserved across handled failures (422, 503, 404, network); user message never disappears.
- **Privacy & Diagnostics:** No raw LLM diagnostics or stack traces are shown to users. `requestId` is stored for support/debug and hidden by default.
- **Tutorial Mode:** In Tutorial Mode (`isTutorial = true`), simulated locally via `buildMockExplanation` with ZERO live backend mutations or network calls (preserving INV-014).

### Core Implementation Files
- `lib/types.ts`: `ExplanationRequest`, `ExplanationSuccess`, `ApiError`, `ExplanationChatMessage`.
- `lib/shelfcash-client.ts`: `postExplanation()` returning typed `ExplanationTransportResult` (200, 422, 404, 503, network_error).
- `lib/explanation-chat.ts`: `mapExplanation422()`, `mapTransportResultToMessage()`, `createExplanationRequest()`.
- `app/components/DecisionExplanationDrawer.tsx`: Conversational AI chat drawer.
- `app/components/DecisionBriefWorkspace.tsx`: Integration into Decision Brief and row-level AI CTA.
- `tests/explanation-chat-contract.test.tsx`: 16 comprehensive contract integration tests (Tests 42 to 57).

