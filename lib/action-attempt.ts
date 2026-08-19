export type ActionAttemptStatus =
  | "idle"
  | "loading"
  | "success"
  | "error"
  | "unknown";

export interface ActionAttemptState {
  attemptId: number;
  status: ActionAttemptStatus;
  message?: string;
}

/**
 * Keeps async feedback tied to both the resource being changed and the user's
 * most recent attempt. A late completion from a previous attempt is ignored.
 */
export function createActionAttemptStore() {
  const states = new Map<string, ActionAttemptState>();
  const latestAttempts = new Map<string, number>();

  function isCurrent(actionKey: string, attemptId: number): boolean {
    return latestAttempts.get(actionKey) === attemptId;
  }

  function start(actionKey: string): number {
    const attemptId = (latestAttempts.get(actionKey) ?? 0) + 1;
    latestAttempts.set(actionKey, attemptId);
    // A retry only clears feedback for this action. Feedback for other actions
    // remains visible and cannot be accidentally dismissed.
    states.set(actionKey, { attemptId, status: "loading" });
    return attemptId;
  }

  function settle(
    actionKey: string,
    attemptId: number,
    status: Exclude<ActionAttemptStatus, "idle" | "loading">,
    message: string,
  ): boolean {
    if (!isCurrent(actionKey, attemptId)) return false;
    states.set(actionKey, { attemptId, status, message });
    return true;
  }

  return {
    start,
    isCurrent,
    succeed: (actionKey: string, attemptId: number, message: string) =>
      settle(actionKey, attemptId, "success", message),
    fail: (actionKey: string, attemptId: number, message: string) =>
      settle(actionKey, attemptId, "error", message),
    unknown: (actionKey: string, attemptId: number, message: string) =>
      settle(actionKey, attemptId, "unknown", message),
    get: (actionKey: string): ActionAttemptState | undefined =>
      states.get(actionKey),
    entries: (): Array<[string, ActionAttemptState]> => Array.from(states.entries()),
    clear: (actionKey: string): void => {
      states.delete(actionKey);
    },
  };
}
