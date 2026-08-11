import type { DecisionRunStatus } from "./types";

export type DecisionRunLifecycle =
  | "processing"
  | "completed"
  | "failed"
  | "unknown";

/**
 * Decision runs use `status` as their lifecycle. Engine metadata must never
 * control polling because a completed run can still carry engine warnings.
 */
export function decisionRunLifecycle(status: unknown): DecisionRunLifecycle {
  switch (String(status ?? "").trim().toLowerCase()) {
    case "queued":
    case "running":
      return "processing";
    case "completed":
      return "completed";
    case "failed":
    case "blocked":
      return "failed";
    default:
      return "unknown";
  }
}

export function shouldPollDecisionRun(status: unknown): boolean {
  return decisionRunLifecycle(status) === "processing";
}

export function isTerminalDecisionRunStatus(status: unknown): boolean {
  const lifecycle = decisionRunLifecycle(status);
  return lifecycle === "completed" || lifecycle === "failed" || lifecycle === "unknown";
}

export function isDecisionRunStatus(value: unknown): value is DecisionRunStatus {
  return decisionRunLifecycle(value) !== "unknown";
}
