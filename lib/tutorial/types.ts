export type AppExperienceMode = "live" | "tutorial";

export type TutorialStepType = "explain" | "point" | "action" | "welcome" | "completion";

export type ExpectedAction = "click" | "change" | "submit";

export interface TutorialStep {
  id: string;
  stepNumber?: number;
  totalSteps?: number;
  type: TutorialStepType;
  title: string;
  body: string;
  eyebrow?: string;
  metadata?: string;
  target?: string;
  placement?: "top" | "bottom" | "left" | "right";
  expectedAction?: ExpectedAction;
  targetPage?: "today" | "future" | "plan" | "import" | "simulator";
  targetActiveView?: "today" | "future";
}

export interface TutorialPreferences {
  tutorialVersion: number;
  completed: boolean;
  dismissed: boolean;
  completedHints?: string[];
}

export const TUTORIAL_VERSION = 1;
export const TUTORIAL_PREFERENCES_KEY = "shelfcash:tutorial-preferences";

export const DEFAULT_TUTORIAL_PREFERENCES: TutorialPreferences = {
  tutorialVersion: TUTORIAL_VERSION,
  completed: false,
  dismissed: false,
  completedHints: [],
};

/**
 * Read tutorial preferences from local storage safely
 */
export function getStoredTutorialPreferences(): TutorialPreferences {
  if (typeof window === "undefined") {
    return DEFAULT_TUTORIAL_PREFERENCES;
  }
  try {
    const raw = window.localStorage.getItem(TUTORIAL_PREFERENCES_KEY);
    if (!raw) return DEFAULT_TUTORIAL_PREFERENCES;
    const parsed = JSON.parse(raw) as Partial<TutorialPreferences>;
    return {
      tutorialVersion: parsed.tutorialVersion ?? TUTORIAL_VERSION,
      completed: Boolean(parsed.completed),
      dismissed: Boolean(parsed.dismissed),
      completedHints: Array.isArray(parsed.completedHints) ? parsed.completedHints : [],
    };
  } catch {
    return DEFAULT_TUTORIAL_PREFERENCES;
  }
}

/**
 * Save tutorial preferences to local storage safely
 */
export function saveTutorialPreferences(preferences: TutorialPreferences): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(TUTORIAL_PREFERENCES_KEY, JSON.stringify(preferences));
  } catch {
    // LocalStorage quota or access error handled gracefully
  }
}

/**
 * Determine whether to show the non-intrusive First-run Welcome Card.
 * Rules:
 * 1. User has NOT completed the tutorial.
 * 2. User has NOT dismissed the welcome card.
 * 3. User does NOT have meaningful existing business activity.
 */
export function shouldShowFirstRunWelcome(
  preferences: TutorialPreferences,
  hasMeaningfulActivity: boolean,
): boolean {
  if (preferences.completed || preferences.dismissed) {
    return false;
  }
  if (hasMeaningfulActivity) {
    return false;
  }
  return true;
}
