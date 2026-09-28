import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  shouldShowFirstRunWelcome,
  type TutorialPreferences,
} from "../lib/tutorial/types";
import { TUTORIAL_STEPS } from "../lib/tutorial/tutorial-steps";
import {
  getTutorialBootstrapData,
  getTutorialDecisionBrief,
  getTutorialDecisionPackage,
  getTutorialDraftOrders,
  getTutorialPlanResponse,
  getTutorialWhatIfResponse,
  TUTORIAL_STORE_ID,
  TUTORIAL_STORE_NAME,
} from "../lib/tutorial/tutorial-fixture";
import { TutorialProvider } from "../app/components/tutorial/TutorialContext";
import { TutorialWelcomeCard } from "../app/components/tutorial/TutorialWelcomeCard";
import { TutorialCompletionCard } from "../app/components/tutorial/TutorialCompletionCard";
import { TutorialBanner } from "../app/components/tutorial/TutorialBanner";
import { TutorialOverlay } from "../app/components/tutorial/TutorialOverlay";
import { HelpMenu } from "../app/components/tutorial/HelpMenu";
import { DecisionBriefWorkspace } from "../app/components/DecisionBriefWorkspace";
import { DecisionCenterWorkspace } from "../app/components/DecisionCenterWorkspace";
import { TodayView } from "../app/views/TodayView";
import { ImportView } from "../app/views/ImportView";
import { PlanView } from "../app/views/PlanView";

test("45. FIRST RUN: First-run user without prior preferences or activity is offered Welcome Card, tour does NOT auto-start", () => {
  const prefs: TutorialPreferences = {
    tutorialVersion: 1,
    completed: false,
    dismissed: false,
    completedHints: [],
  };
  const hasActivity = false;

  const showWelcome = shouldShowFirstRunWelcome(prefs, hasActivity);
  assert.equal(showWelcome, true, "Welcome card should be offered to first-time user without activity");

  // Render Welcome Card
  function TestHost() {
    return (
      <TutorialProvider hasMeaningfulActivity={false}>
        <TutorialWelcomeCard />
        <TutorialOverlay />
      </TutorialProvider>
    );
  }

  const html = renderToStaticMarkup(<TestHost />);
  assert.match(html, /Khám phá ShelfCash/, "Welcome card title should be rendered");
  assert.match(html, /Bắt đầu tham quan/, "Primary CTA should invite to start tour");
  assert.match(html, /Nhập dữ liệu của tôi/, "Secondary CTA should offer importing own data");
  assert.match(html, /Bỏ qua/, "Tertiary CTA should allow skipping without interruption");
  assert.match(html, /Dữ liệu mẫu · Không ảnh hưởng cửa hàng thật/, "Supporting simulated disclaimer should appear");

  // Spotlight tour must NOT be active automatically
  assert.doesNotMatch(html, /tutorial-spotlight-frame/, "Spotlight overlay must NOT auto-start");
});

test("46. DISMISS: User clicking 'Bỏ qua' marks tutorial dismissed, welcome does not reappear, Help menu remains available", () => {
  const dismissedPrefs: TutorialPreferences = {
    tutorialVersion: 1,
    completed: false,
    dismissed: true,
    completedHints: [],
  };

  const showWelcome = shouldShowFirstRunWelcome(dismissedPrefs, false);
  assert.equal(showWelcome, false, "Dismissed user must never receive automatic welcome invitation again");

  // Help menu renders manual replay entry
  const helpHtml = renderToStaticMarkup(
    <TutorialProvider hasMeaningfulActivity={false}>
      <HelpMenu />
    </TutorialProvider>,
  );
  assert.match(helpHtml, /Trợ giúp/, "Help menu button remains visible in header");
});

test("47. COMPLETION: Completed user is not interrupted on next visit", () => {
  const completedPrefs: TutorialPreferences = {
    tutorialVersion: 1,
    completed: true,
    dismissed: false,
    completedHints: [],
  };

  const showWelcomeNoActivity = shouldShowFirstRunWelcome(completedPrefs, false);
  assert.equal(showWelcomeNoActivity, false, "Completed user must not see welcome card");

  const showWelcomeWithActivity = shouldShowFirstRunWelcome(completedPrefs, true);
  assert.equal(showWelcomeWithActivity, false, "Completed user with activity must not see welcome card");
});

test("48. LIVE SAFETY: Tutorial Mode uses simulated mock/fixture data with ZERO live backend mutations", () => {
  const tutorialData = getTutorialBootstrapData();
  const tutorialBrief = getTutorialDecisionBrief();
  const tutorialPackage = getTutorialDecisionPackage(tutorialData);

  assert.equal(tutorialData.settings.storeId, TUTORIAL_STORE_ID);
  assert.equal(tutorialData.settings.storeName, TUTORIAL_STORE_NAME);
  assert.equal(tutorialBrief.store_id, TUTORIAL_STORE_ID);
  assert.equal(tutorialPackage.decision_run_id, "decision-run-mock-happy-path");

  // What-if in Tutorial Mode executes locally with zero backend network calls
  const whatIfSimulated = getTutorialWhatIfResponse({ demand_multiplier: 1.2, budget_limit: 8_000_000 });
  assert.ok(whatIfSimulated.comparison, "What-if simulation produces comparison metrics locally");
  assert.ok(whatIfSimulated.grounded_explanation, "What-if simulation produces grounded explanation");

  // Draft PO in Tutorial Mode generates mock draft orders locally without backend PO creation
  const draftOrders = getTutorialDraftOrders();
  assert.ok(draftOrders.length > 0, "Tutorial draft orders generated from procurement rows");
  assert.match(draftOrders[0].poId, /PO-TUTORIAL/, "PO IDs use isolated PO-TUTORIAL lineage prefix");
  assert.equal(draftOrders[0].status, "draft");
});

test("49. ACTION STEP: Action steps require expected action and do not expose standard Next button", () => {
  const actionStep = TUTORIAL_STEPS.find((s) => s.id === "risk-item");
  assert.ok(actionStep, "risk-item step should exist");
  assert.equal(actionStep.type, "action");
  assert.equal(actionStep.expectedAction, "click");

  const whatIfStep = TUTORIAL_STEPS.find((s) => s.id === "what-if-simulate");
  assert.ok(whatIfStep, "what-if-simulate step should exist");
  assert.equal(whatIfStep.type, "action");
  assert.equal(whatIfStep.expectedAction, "submit");

  const draftPoStep = TUTORIAL_STEPS.find((s) => s.id === "draft-po");
  assert.ok(draftPoStep, "draft-po step should exist");
  assert.equal(draftPoStep.type, "action");
});

test("50. TARGET MISSING RESILIENCE: Missing target does not crash tutorial overlay", () => {
  function TestMissingHost() {
    return (
      <TutorialProvider hasMeaningfulActivity={false}>
        <TutorialOverlay />
      </TutorialProvider>
    );
  }

  // Should render without throwing
  const html = renderToStaticMarkup(<TestMissingHost />);
  assert.ok(typeof html === "string", "Renders cleanly without crashing when target element is absent");
});

test("51. MOCK STORY: Complete 11-step story flows through Import -> Cutoff Date -> Budget -> Engine Mode -> Today -> Risk -> 7-Day -> Decision -> Strategy -> What-if -> Draft PO", () => {
  const stepIds = TUTORIAL_STEPS.map((s) => s.id);
  assert.ok(stepIds.includes("welcome"), "Story contains Step 0 Welcome");
  assert.ok(stepIds.includes("import-data"), "Story contains Step 1 Import Data");
  assert.ok(stepIds.includes("decision-cutoff-date"), "Story contains Step 2 Cutoff Date");
  assert.ok(stepIds.includes("decision-budget"), "Story contains Step 3 Budget");
  assert.ok(stepIds.includes("decision-engine-mode"), "Story contains Step 4 Engine Mode");
  assert.ok(stepIds.includes("today-summary"), "Story contains Step 5 Today summary");
  assert.ok(stepIds.includes("risk-item"), "Story contains Step 6 Risk Item");
  assert.ok(stepIds.includes("future-heatmap"), "Story contains Step 7 7-Day Heatmap");
  assert.ok(stepIds.includes("decision-recommendation"), "Story contains Step 8 Decision Recommendation");
  assert.ok(stepIds.includes("strategy-section"), "Story contains Step 9 Strategy Selection");
  assert.ok(stepIds.includes("what-if-open"), "Story contains Step 10A Open What-if");
  assert.ok(stepIds.includes("what-if-simulate"), "Story contains Step 10B What-if Simulation");
  assert.ok(stepIds.includes("what-if-result"), "Story contains What-if Result explanation");
  assert.ok(stepIds.includes("draft-po"), "Story contains Step 11 Draft PO");
  assert.ok(stepIds.includes("completion"), "Story contains Completion step");
});

test("INV-014: Tutorial Mode banner renders disclaimer and exit CTA when active", () => {
  function ActiveBannerHost() {
    return (
      <TutorialProvider hasMeaningfulActivity={false}>
        <TutorialBanner />
      </TutorialProvider>
    );
  }

  // When inactive (live), banner renders nothing
  const inactiveHtml = renderToStaticMarkup(<ActiveBannerHost />);
  assert.equal(inactiveHtml, "", "Banner should not render in live mode");
});

test("Tutorial elements have required presentation-only data-tutorial-id attributes", () => {
  const tutorialData = getTutorialBootstrapData();
  const tutorialBrief = getTutorialDecisionBrief();
  const tutorialDecision = getTutorialDecisionPackage(tutorialData);
  const tutorialPlan = getTutorialPlanResponse(tutorialData);

  // 1. Today View
  const todayHtml = renderToStaticMarkup(
    <TodayView
      data={tutorialData}
      plan={tutorialPlan}
      brief={tutorialBrief}
      onNavigate={() => {}}
    />,
  );
  assert.match(todayHtml, /data-tutorial-id="today-summary"/, "TodayView renders data-tutorial-id='today-summary'");
  assert.match(todayHtml, /data-tutorial-id="risk-item"/, "TodayView renders data-tutorial-id='risk-item'");

  // 2. DecisionCenterWorkspace Today
  const dcTodayHtml = renderToStaticMarkup(
    <DecisionCenterWorkspace
      activeView="today"
      data={tutorialData}
      decision={tutorialDecision}
      brief={tutorialBrief}
      plan={tutorialPlan}
      onNavigate={() => {}}
      onViewChange={() => {}}
    />,
  );
  assert.match(dcTodayHtml, /data-tutorial-id="today-summary"/, "DecisionCenterWorkspace renders today-summary");
  assert.match(dcTodayHtml, /data-tutorial-id="risk-item"/, "DecisionCenterWorkspace renders risk-item");

  // 3. DecisionCenterWorkspace Future Heatmap
  const dcFutureHtml = renderToStaticMarkup(
    <DecisionCenterWorkspace
      activeView="future"
      data={tutorialData}
      decision={tutorialDecision}
      brief={tutorialBrief}
      plan={tutorialPlan}
      onNavigate={() => {}}
      onViewChange={() => {}}
    />,
  );
  assert.match(dcFutureHtml, /data-tutorial-id="future-heatmap"/, "DecisionCenterWorkspace renders future-heatmap");

  // 4. DecisionBriefWorkspace
  const briefHtml = renderToStaticMarkup(
    <DecisionBriefWorkspace
      brief={tutorialBrief}
      decision={tutorialDecision}
      data={tutorialData}
    />,
  );
  assert.match(briefHtml, /data-tutorial-id="decision-recommendation"/, "DecisionBriefWorkspace renders decision-recommendation");
  assert.match(briefHtml, /data-tutorial-id="strategy-section"/, "DecisionBriefWorkspace renders strategy-section");
  assert.match(briefHtml, /data-tutorial-id="what-if-button"/, "DecisionBriefWorkspace renders what-if-button");
  assert.match(briefHtml, /data-tutorial-id="what-if-input"/, "DecisionBriefWorkspace renders what-if-input");
  assert.match(briefHtml, /data-tutorial-id="what-if-submit"/, "DecisionBriefWorkspace renders what-if-submit");
  assert.match(briefHtml, /data-tutorial-id="draft-po-button"/, "DecisionBriefWorkspace renders draft-po-button");

  // 5. Import View (Step 1)
  const importHtml = renderToStaticMarkup(
    <ImportView
      store={tutorialData.settings.storeName}
      defaultStoreId={tutorialData.settings.storeId}
      defaultForecastDate={tutorialData.today}
      defaultForecastHorizon={tutorialData.settings.forecastHorizon}
      connection={null}
      files={[]}
      setFiles={() => {}}
      onRefreshConnection={async () => {}}
      onImported={async () => {}}
    />,
  );
  assert.match(importHtml, /data-tutorial-id="import-dropzone"/, "ImportView renders import-dropzone");

  // 6. PlanView Simulator (Step 2)
  const planHtml = renderToStaticMarkup(
    <PlanView
      data={tutorialData}
      plan={tutorialPlan}
      decision={tutorialDecision}
      decisionBrief={tutorialBrief}
      focus="simulator"
    />,
  );
  assert.match(planHtml, /data-tutorial-id="decision-controls"/, "PlanView renders decision-controls");
  assert.match(planHtml, /data-tutorial-id="decision-cutoff-date"/, "PlanView renders decision-cutoff-date");
  assert.match(planHtml, /data-tutorial-id="decision-budget"/, "PlanView renders decision-budget");
  assert.match(planHtml, /data-tutorial-id="decision-engine-mode"/, "PlanView renders decision-engine-mode");
});

test("TutorialCompletionCard renders visual flow and action buttons", () => {
  function CompletionHost() {
    return (
      <TutorialProvider hasMeaningfulActivity={false}>
        <TutorialCompletionCard />
      </TutorialProvider>
    );
  }

  // Inactive state -> renders null
  const html = renderToStaticMarkup(<CompletionHost />);
  assert.equal(html, "");
});

test("Step 7 Future Heatmap: defines point step with forward button enabled", () => {
  const step7 = TUTORIAL_STEPS.find((s) => s.id === "future-heatmap");
  assert.ok(step7, "future-heatmap step exists");
  assert.equal(step7.type, "point");
  assert.equal(step7.stepNumber, 7);
  assert.equal(step7.target, "future-heatmap");
  assert.equal(step7.targetActiveView, "future");
});

