"use client";

import { useReducer, useRef } from "react";
import {
  createActionAttemptStore,
  type ActionAttemptState,
} from "../../lib/action-attempt";

export function useActionAttempts() {
  const store = useRef(createActionAttemptStore());
  const [, refresh] = useReducer((value: number) => value + 1, 0);

  function update<T>(operation: () => T): T {
    const result = operation();
    refresh();
    return result;
  }

  return {
    begin: (actionKey: string) => update(() => store.current.start(actionKey)),
    isCurrent: (actionKey: string, attemptId: number) =>
      store.current.isCurrent(actionKey, attemptId),
    succeed: (actionKey: string, attemptId: number, message: string) =>
      update(() => store.current.succeed(actionKey, attemptId, message)),
    fail: (actionKey: string, attemptId: number, message: string) =>
      update(() => store.current.fail(actionKey, attemptId, message)),
    unknown: (actionKey: string, attemptId: number, message: string) =>
      update(() => store.current.unknown(actionKey, attemptId, message)),
    clear: (actionKey: string) => update(() => store.current.clear(actionKey)),
    get: (actionKey: string): ActionAttemptState | undefined =>
      store.current.get(actionKey),
    entries: (): Array<[string, ActionAttemptState]> => store.current.entries(),
  };
}
