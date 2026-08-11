import assert from "node:assert/strict";
import test from "node:test";
import {
  decisionRunLifecycle,
  isTerminalDecisionRunStatus,
  shouldPollDecisionRun,
} from "../lib/decision-run.ts";

test("decision run lifecycle polls only canonical non-terminal statuses", () => {
  assert.equal(decisionRunLifecycle("queued"), "processing");
  assert.equal(decisionRunLifecycle("running"), "processing");
  assert.equal(shouldPollDecisionRun("queued"), true);
  assert.equal(shouldPollDecisionRun("running"), true);
  assert.equal(shouldPollDecisionRun("completed"), false);
  assert.equal(shouldPollDecisionRun("blocked"), false);
  assert.equal(shouldPollDecisionRun("failed"), false);
});

test("completed and non-feasible result statuses remain terminal", () => {
  assert.equal(decisionRunLifecycle("completed"), "completed");
  assert.equal(isTerminalDecisionRunStatus("completed"), true);
  assert.equal(isTerminalDecisionRunStatus("failed"), true);
  assert.equal(isTerminalDecisionRunStatus("blocked"), true);
});

test("an unknown decision status fails safe instead of polling forever", () => {
  assert.equal(decisionRunLifecycle("awaiting_review"), "unknown");
  assert.equal(shouldPollDecisionRun("awaiting_review"), false);
  assert.equal(isTerminalDecisionRunStatus("awaiting_review"), true);
});
