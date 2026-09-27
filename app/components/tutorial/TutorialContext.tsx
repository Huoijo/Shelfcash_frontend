"use client";

import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import {
  DEFAULT_TUTORIAL_PREFERENCES,
  getStoredTutorialPreferences,
  saveTutorialPreferences,
  shouldShowFirstRunWelcome,
  type AppExperienceMode,
  type TutorialPreferences,
  type TutorialStep,
} from "../../../lib/tutorial/types";
import { TUTORIAL_STEPS } from "../../../lib/tutorial/tutorial-steps";

interface TutorialContextValue {
  mode: AppExperienceMode;
  isActive: boolean;
  currentStepIndex: number;
  currentStep: TutorialStep | null;
  preferences: TutorialPreferences;
  showWelcome: boolean;
  showCompletion: boolean;
  startTutorial: () => void;
  exitTutorial: () => void;
  nextStep: () => void;
  prevStep: () => void;
  skipTutorial: () => void;
  dismissWelcome: () => void;
  completeTutorial: () => void;
  finishTutorial: () => void;
  replayTutorial: () => void;
  triggerAction: (targetId: string, actionType?: string) => void;
  markHintCompleted: (hintId: string) => void;
}

const TutorialContext = createContext<TutorialContextValue | null>(null);

export function useTutorial(): TutorialContextValue {
  const context = useContext(TutorialContext);
  if (!context) {
    return {
      mode: "live",
      isActive: false,
      currentStepIndex: 0,
      currentStep: null,
      preferences: DEFAULT_TUTORIAL_PREFERENCES,
      showWelcome: false,
      showCompletion: false,
      startTutorial: () => {},
      exitTutorial: () => {},
      nextStep: () => {},
      prevStep: () => {},
      skipTutorial: () => {},
      dismissWelcome: () => {},
      completeTutorial: () => {},
      finishTutorial: () => {},
      replayTutorial: () => {},
      triggerAction: () => {},
      markHintCompleted: () => {},
    };
  }
  return context;
}

export function TutorialProvider({
  children,
  hasMeaningfulActivity = false,
  onNavigate,
}: {
  children: React.ReactNode;
  hasMeaningfulActivity?: boolean;
  onNavigate?: (page: "today" | "future" | "plan" | "import" | "simulator", activeView?: "today" | "future") => void;
}) {
  const [preferences, setPreferences] = useState<TutorialPreferences>(() => {
    if (typeof window !== "undefined") {
      return getStoredTutorialPreferences();
    }
    return DEFAULT_TUTORIAL_PREFERENCES;
  });
  const [welcomeDismissedThisSession, setWelcomeDismissedThisSession] = useState(false);
  const [mode, setMode] = useState<AppExperienceMode>("live");
  const [isActive, setIsActive] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [showCompletion, setShowCompletion] = useState(false);

  const showWelcome =
    !isActive &&
    !showCompletion &&
    !welcomeDismissedThisSession &&
    shouldShowFirstRunWelcome(preferences, hasMeaningfulActivity);

  const currentStep = isActive && currentStepIndex >= 0 && currentStepIndex < TUTORIAL_STEPS.length
    ? TUTORIAL_STEPS[currentStepIndex]
    : null;

  // Sync navigation when current step changes
  useEffect(() => {
    if (!isActive || !currentStep) return;
    if (currentStep.targetPage && onNavigate) {
      onNavigate(currentStep.targetPage, currentStep.targetActiveView);
    }
  }, [isActive, currentStep, onNavigate]);

  const startTutorial = useCallback(() => {
    setWelcomeDismissedThisSession(true);
    setShowCompletion(false);
    setMode("tutorial");
    setIsActive(true);
    // Find Step 1
    setCurrentStepIndex(1);
    const firstStep = TUTORIAL_STEPS[1];
    if (firstStep?.targetPage && onNavigate) {
      onNavigate(firstStep.targetPage, firstStep.targetActiveView);
    }
  }, [onNavigate]);

  const exitTutorial = useCallback(() => {
    setIsActive(false);
    setMode("live");
    setShowCompletion(false);
    onNavigate?.("today", "today");
  }, [onNavigate]);

  const skipTutorial = useCallback(() => {
    setIsActive(false);
    setMode("live");
    setShowCompletion(false);
    setPreferences((prev) => {
      const updated: TutorialPreferences = {
        ...prev,
        dismissed: true,
      };
      saveTutorialPreferences(updated);
      return updated;
    });
    onNavigate?.("today", "today");
  }, [onNavigate]);

  const dismissWelcome = useCallback(() => {
    setWelcomeDismissedThisSession(true);
    setPreferences((prev) => {
      const updated: TutorialPreferences = {
        ...prev,
        dismissed: true,
      };
      saveTutorialPreferences(updated);
      return updated;
    });
  }, []);

  const completeTutorial = useCallback(() => {
    setIsActive(false);
    setShowCompletion(true);
    setPreferences((prev) => {
      const updated: TutorialPreferences = {
        ...prev,
        completed: true,
      };
      saveTutorialPreferences(updated);
      return updated;
    });
  }, []);

  const finishTutorial = useCallback(() => {
    setShowCompletion(false);
    setMode("live");
    onNavigate?.("today", "today");
  }, [onNavigate]);

  const replayTutorial = useCallback(() => {
    startTutorial();
  }, [startTutorial]);

  const nextStep = useCallback(() => {
    if (!isActive) return;
    const nextIndex = currentStepIndex + 1;
    if (nextIndex >= TUTORIAL_STEPS.length) {
      completeTutorial();
      return;
    }
    const nextStepObj = TUTORIAL_STEPS[nextIndex];
    if (nextStepObj?.type === "completion") {
      completeTutorial();
      return;
    }
    setCurrentStepIndex(nextIndex);
  }, [isActive, currentStepIndex, completeTutorial]);

  const prevStep = useCallback(() => {
    if (!isActive) return;
    const prevIndex = Math.max(1, currentStepIndex - 1);
    setCurrentStepIndex(prevIndex);
  }, [isActive, currentStepIndex]);

  const triggerAction = useCallback(
    (targetId: string, actionType: string = "click") => {
      if (!isActive || !currentStep) return;

      if (currentStep.type === "action") {
        const matchesTarget = currentStep.target === targetId;
        const matchesAction = !currentStep.expectedAction || currentStep.expectedAction === actionType;

        if (matchesTarget && matchesAction) {
          // If this is step 7 (draft-po), advance to completion
          if (currentStep.id === "draft-po") {
            completeTutorial();
          } else {
            nextStep();
          }
        }
      }
    },
    [isActive, currentStep, completeTutorial, nextStep],
  );

  const markHintCompleted = useCallback(
    (hintId: string) => {
      if (preferences.completedHints?.includes(hintId)) return;
      const updated: TutorialPreferences = {
        ...preferences,
        completedHints: [...(preferences.completedHints ?? []), hintId],
      };
      setPreferences(updated);
      saveTutorialPreferences(updated);
    },
    [preferences],
  );

  // Global keyboard listener for Esc, Left/Right arrow
  useEffect(() => {
    if (!isActive) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        exitTutorial();
      } else if (e.key === "ArrowRight" && currentStep && currentStep.type !== "action") {
        nextStep();
      } else if (e.key === "ArrowLeft" && currentStep && currentStepIndex > 1) {
        prevStep();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isActive, currentStep, currentStepIndex, exitTutorial, nextStep, prevStep]);

  return (
    <TutorialContext.Provider
      value={{
        mode,
        isActive,
        currentStepIndex,
        currentStep,
        preferences,
        showWelcome,
        showCompletion,
        startTutorial,
        exitTutorial,
        nextStep,
        prevStep,
        skipTutorial,
        dismissWelcome,
        completeTutorial,
        finishTutorial,
        replayTutorial,
        triggerAction,
        markHintCompleted,
      }}
    >
      {children}
    </TutorialContext.Provider>
  );
}
