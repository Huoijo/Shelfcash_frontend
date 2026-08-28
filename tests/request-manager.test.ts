import assert from "node:assert/strict";
import test from "node:test";
import { RequestManager, DEFAULT_MAX_POLL_DURATION_MS } from "../lib/request-manager/request-manager";
import { parseApiError, resolveErrorPolicy } from "../lib/request-manager/error-policy";
import {
  loadManagedRequestRegistry,
  pruneOldRequests,
  saveManagedRequestRegistry,
  computeRequestFingerprint,
} from "../lib/request-manager/persistence";
import type { ManagedRequestRegistry, ManagedRequest } from "../lib/request-manager/types";

// Mock localStorage for node environment
class MockLocalStorage {
  private store: Record<string, string> = {};
  getItem(key: string): string | null {
    return this.store[key] ?? null;
  }
  setItem(key: string, value: string): void {
    this.store[key] = String(value);
  }
  removeItem(key: string): void {
    delete this.store[key];
  }
  clear(): void {
    this.store = {};
  }
}

// Attach global window & localStorage for tests
if (typeof (globalThis as unknown as Record<string, unknown>).window === "undefined") {
  (globalThis as unknown as Record<string, unknown>).window = {
    localStorage: new MockLocalStorage(),
    location: { origin: "http://localhost:3000" },
  };
}

test("Scenario 1: Refresh import recovery resumes status check to completion", async () => {
  const manager = new RequestManager();
  const req = manager.createRequest({
    kind: "import",
    endpoint: "/api/v1/imports",
    method: "POST",
    backendBaseUrl: "http://localhost:8000",
  });
  manager.updateRequest(req.clientRequestId, {
    status: "processing",
    resourceId: "import-123",
  });

  let pollCount = 0;
  const result = await manager.pollUntilComplete(
    req.clientRequestId,
    async () => {
      pollCount++;
      if (pollCount < 2) {
        return { status: "processing" };
      }
      return { status: "completed", httpStatus: 200, result: { rows: 50 } };
    },
    { pollIntervalMs: 10, maxDurationMs: 1000 },
  );

  assert.equal(result.success, true);
  assert.deepEqual(result.result, { rows: 50 });
  const updated = manager.getRequest(req.clientRequestId);
  assert.equal(updated?.status, "completed");
  assert.equal(updated?.backendBaseUrl, "http://localhost:8000");
});

test("Scenario 2: New request coexists while old request is processing without overwrite", () => {
  const manager = new RequestManager();
  const reqA = manager.createRequest({
    kind: "import",
    endpoint: "/api/v1/imports",
    method: "POST",
    displayLabel: "file_a.xlsx",
  });
  manager.updateRequest(reqA.clientRequestId, { status: "processing" });

  const reqB = manager.createRequest({
    kind: "import",
    endpoint: "/api/v1/imports",
    method: "POST",
    displayLabel: "file_b.xlsx",
  });

  const allRequests = manager.getRequests();
  assert.equal(allRequests.length >= 2, true);
  assert.equal(manager.getRequest(reqA.clientRequestId)?.status, "processing");
  assert.equal(manager.getRequest(reqB.clientRequestId)?.status, "submitting");
});

test("Scenario 3: Validation error (422 MAPPING_INCOMPLETE) halts pipeline and stops polling immediately", async () => {
  const parsed = parseApiError({
    status: 422,
    code: "MAPPING_INCOMPLETE",
    message: "Chưa ghép đủ các cột bắt buộc.",
    request_id: "req-err-422",
  });
  assert.equal(parsed.code, "MAPPING_INCOMPLETE");
  assert.equal(parsed.status, 422);
  assert.equal(parsed.requestId, "req-err-422");

  const policy = resolveErrorPolicy(parsed);
  assert.equal(policy, "REQUIRE_USER_ACTION");

  const manager = new RequestManager();
  const req = manager.createRequest({
    kind: "import",
    endpoint: "/api/v1/imports/123/confirm",
    method: "POST",
  });

  let pollCount = 0;
  const outcome = await manager.pollUntilComplete(
    req.clientRequestId,
    async () => {
      pollCount++;
      throw parsed;
    },
    { pollIntervalMs: 10, maxDurationMs: 1000 },
  );

  assert.equal(outcome.success, false);
  assert.equal(pollCount, 1); // HALT -> stops on first poll attempt
  assert.equal(manager.getRequest(req.clientRequestId)?.status, "failed");
});

test("Scenario 4: 503 MODEL_NOT_READY retries boundedly up to limit then halts", async () => {
  const error503 = parseApiError({
    status: 503,
    code: "MODEL_NOT_READY",
    message: "Mô hình dự báo đang khởi động.",
  });
  assert.equal(resolveErrorPolicy(error503), "RETRY_BOUNDED");

  const manager = new RequestManager();
  const req = manager.createRequest({
    kind: "forecast",
    endpoint: "/api/v1/stores/s1/forecast-runs",
    method: "POST",
  });

  let pollCount = 0;
  const outcome = await manager.pollUntilComplete(
    req.clientRequestId,
    async () => {
      pollCount++;
      throw error503;
    },
    { pollIntervalMs: 10, maxDurationMs: 2000, maxTransientRetries: 2 },
  );

  assert.equal(outcome.success, false);
  // Initial attempt (1) + maxTransientRetries (2) = 3 total attempts
  assert.equal(pollCount, 3);
  assert.equal(manager.getRequest(req.clientRequestId)?.status, "failed");
});

test("Scenario 5: 425 IMPORT_NOT_READY triggers WAIT_AND_POLL boundedly", async () => {
  const error425 = parseApiError({
    status: 425,
    code: "IMPORT_NOT_READY",
    message: "Dữ liệu đang được import vào hệ thống.",
  });
  assert.equal(resolveErrorPolicy(error425), "WAIT_AND_POLL");

  const manager = new RequestManager();
  const req = manager.createRequest({
    kind: "import",
    endpoint: "/api/v1/imports/123/result",
    method: "GET",
  });

  let pollCount = 0;
  const outcome = await manager.pollUntilComplete(
    req.clientRequestId,
    async () => {
      pollCount++;
      if (pollCount <= 2) {
        throw error425;
      }
      return { status: "completed", httpStatus: 200, result: { done: true } };
    },
    { pollIntervalMs: 10, maxDurationMs: 1000 },
  );

  assert.equal(outcome.success, true);
  assert.equal(pollCount, 3);
  assert.equal(manager.getRequest(req.clientRequestId)?.status, "completed");
});

test("Scenario 6: Duplicate request prevention identifies identical file and payload fingerprint", () => {
  const manager = new RequestManager();
  const fp = computeRequestFingerprint("import", "STORE_001", { name: "orders.xlsx", size: 1024 });

  const req = manager.createRequest({
    kind: "import",
    endpoint: "/api/v1/imports",
    method: "POST",
    requestFingerprint: fp,
  });
  manager.updateRequest(req.clientRequestId, { status: "processing" });

  const duplicate = manager.checkDuplicate("import", fp);
  assert.equal(duplicate?.clientRequestId, req.clientRequestId);

  const error409 = parseApiError({
    status: 409,
    code: "DUPLICATE_REQUEST",
    message: "Yêu cầu này đã tồn tại.",
  });
  assert.equal(resolveErrorPolicy(error409), "HALT");
});

test("Scenario 7: Backend URL changes do not mutate existing requests' original backendBaseUrl", () => {
  const manager = new RequestManager();
  manager.setBackendBaseUrl("http://backend-old.example.com");

  const reqA = manager.createRequest({
    kind: "import",
    endpoint: "/api/v1/imports",
    method: "POST",
  });
  assert.equal(reqA.backendBaseUrl, "http://backend-old.example.com");

  // User switches backend URL
  manager.setBackendBaseUrl("http://backend-new.example.com");

  const reqB = manager.createRequest({
    kind: "forecast",
    endpoint: "/api/v1/stores/s1/forecast-runs",
    method: "POST",
  });

  assert.equal(manager.getRequest(reqA.clientRequestId)?.backendBaseUrl, "http://backend-old.example.com");
  assert.equal(manager.getRequest(reqB.clientRequestId)?.backendBaseUrl, "http://backend-new.example.com");
});

test("Scenario 8: POST network error/reconciliation marks delivery_unknown instead of blind re-POST", () => {
  const manager = new RequestManager();
  const req = manager.createRequest({
    kind: "import",
    endpoint: "/api/v1/imports",
    method: "POST",
  });
  assert.equal(req.status, "submitting");

  // App reloads/reconciles before response arrived
  manager.reconcileOnStartup();

  const reconciled = manager.getRequest(req.clientRequestId);
  assert.equal(reconciled?.status, "delivery_unknown");
  assert.equal(reconciled?.error?.code, "DELIVERY_UNKNOWN");
});

test("Scenario 9: HTTP 201 Created is treated as success", async () => {
  const manager = new RequestManager();
  const req = manager.createRequest({
    kind: "planning",
    endpoint: "/api/v1/stores/s1/procurement-plans",
    method: "POST",
  });

  const outcome = await manager.pollUntilComplete(
    req.clientRequestId,
    async () => {
      return { status: "completed", httpStatus: 201, result: { plan_id: "plan-99" } };
    },
    { pollIntervalMs: 10 },
  );

  assert.equal(outcome.success, true);
  assert.equal(manager.getRequest(req.clientRequestId)?.status, "completed");
  assert.equal(manager.getRequest(req.clientRequestId)?.httpStatus, 201);
});

test("Scenario 10: Persisted failed request remains failed after startup hydration without restarting polling", () => {
  const manager = new RequestManager();
  const req = manager.createRequest({
    kind: "decision",
    endpoint: "/api/v1/decision-runs/d1",
    method: "POST",
  });
  manager.updateRequest(req.clientRequestId, {
    status: "failed",
    error: { code: "OPTIMIZATION_INFEASIBLE", message: "Không thể tối ưu kế hoạch." },
  });

  manager.reconcileOnStartup();

  const hydrated = manager.getRequest(req.clientRequestId);
  assert.equal(hydrated?.status, "failed");
  assert.equal(hydrated?.error?.code, "OPTIMIZATION_INFEASIBLE");
});

test("Scenario 11: Unknown upstream errors are normalized and eventually halt without infinite spinner", async () => {
  const unknownError = parseApiError({
    status: 418,
    code: "http_error",
    message: "I am a teapot upstream error.",
  });
  assert.equal(unknownError.status, 418);
  assert.equal(unknownError.code, "http_error");

  const policy = resolveErrorPolicy(unknownError);
  assert.equal(policy, "HALT");

  const manager = new RequestManager();
  const req = manager.createRequest({
    kind: "explanation",
    endpoint: "/api/v1/decision-runs/d1/explanation",
    method: "POST",
  });

  const outcome = await manager.pollUntilComplete(
    req.clientRequestId,
    async () => {
      throw unknownError;
    },
    { pollIntervalMs: 10 },
  );

  assert.equal(outcome.success, false);
  assert.equal(manager.getRequest(req.clientRequestId)?.status, "failed");
});

test("Retention pruning keeps active requests and purges stale finished items", () => {
  const now = Date.now();
  const registry: ManagedRequestRegistry = {
    version: 1,
    lastSavedAt: new Date().toISOString(),
    requests: [
      {
        clientRequestId: "req-active-1",
        kind: "import",
        status: "processing",
        backendBaseUrl: "http://localhost:8000",
        endpoint: "/api/v1/imports",
        method: "POST",
        createdAt: new Date(now - 10000).toISOString(),
        updatedAt: new Date(now - 10000).toISOString(),
        retryCount: 0,
      },
      {
        clientRequestId: "req-stale-failed",
        kind: "import",
        status: "failed",
        backendBaseUrl: "http://localhost:8000",
        endpoint: "/api/v1/imports",
        method: "POST",
        // 10 days old -> should be pruned
        createdAt: new Date(now - 10 * 24 * 60 * 60 * 1000).toISOString(),
        updatedAt: new Date(now - 10 * 24 * 60 * 60 * 1000).toISOString(),
        retryCount: 0,
      },
    ],
  };

  const pruned = pruneOldRequests(registry);
  assert.equal(pruned.requests.some((r) => r.clientRequestId === "req-active-1"), true);
  assert.equal(pruned.requests.some((r) => r.clientRequestId === "req-stale-failed"), false);
});
