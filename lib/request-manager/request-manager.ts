import type {
  ApiError,
  FileMetadataSafe,
  ManagedRequest,
  ManagedRequestKind,
  ManagedRequestRegistry,
  ManagedRequestStatus,
} from "./types";
import { parseApiError, resolveErrorPolicy } from "./error-policy";
import {
  loadManagedRequestRegistry,
  loadPersistedBackendBaseUrl,
  saveManagedRequestRegistry,
  savePersistedBackendBaseUrl,
} from "./persistence";
import { createIdempotencyKey, createRequestId } from "../shelfcash-client";

export const DEFAULT_POLL_INTERVAL_MS = 2_000;
export const DEFAULT_MAX_POLL_DURATION_MS = 120_000;
export const DEFAULT_MAX_TRANSIENT_RETRIES = 3;

export type RequestListener = (registry: ManagedRequestRegistry) => void;
export type StatusChecker<T = unknown> = (
  req: ManagedRequest,
  signal: AbortSignal,
) => Promise<{ status: "processing" | "waiting" | "completed" | "failed"; result?: T; error?: ApiError }>;

export class RequestManager {
  private registry: ManagedRequestRegistry;
  private listeners: Set<RequestListener> = new Set();
  private activeAbortControllers: Map<string, AbortController> = new Map();
  private currentBackendBaseUrl: string = "";
  private registeredPollers: Map<ManagedRequestKind, StatusChecker> = new Map();

  constructor() {
    this.registry = { version: 1, requests: [], lastSavedAt: new Date().toISOString() };
    if (typeof window !== "undefined") {
      this.currentBackendBaseUrl = loadPersistedBackendBaseUrl() || "";
      this.registry = loadManagedRequestRegistry();
    }
  }

  public init(): void {
    if (typeof window === "undefined") return;
    this.registry = loadManagedRequestRegistry();
    this.currentBackendBaseUrl = loadPersistedBackendBaseUrl() || "";
    this.reconcileOnStartup();
  }

  public setBackendBaseUrl(url: string): void {
    this.currentBackendBaseUrl = url.trim();
    savePersistedBackendBaseUrl(this.currentBackendBaseUrl);
  }

  public getBackendBaseUrl(): string {
    return this.currentBackendBaseUrl;
  }

  public registerPoller(kind: ManagedRequestKind, checker: StatusChecker): void {
    this.registeredPollers.set(kind, checker);
  }

  public subscribe(listener: RequestListener): () => void {
    this.listeners.add(listener);
    listener(this.registry);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    saveManagedRequestRegistry(this.registry);
    for (const listener of this.listeners) {
      try {
        listener(this.registry);
      } catch (err) {
        console.error("Error in RequestManager listener:", err);
      }
    }
  }

  public createRequest(input: {
    kind: ManagedRequestKind;
    endpoint: string;
    method: string;
    backendBaseUrl?: string;
    fileMetadata?: FileMetadataSafe;
    requestFingerprint?: string;
    displayLabel?: string;
    idempotencyKey?: string;
  }): ManagedRequest {
    const clientRequestId = createRequestId();
    const now = new Date().toISOString();
    const targetBaseUrl =
      input.backendBaseUrl || this.currentBackendBaseUrl || (typeof window !== "undefined" ? window.location.origin : "");

    const newRequest: ManagedRequest = {
      clientRequestId,
      kind: input.kind,
      status: "submitting",
      backendBaseUrl: targetBaseUrl,
      endpoint: input.endpoint,
      method: input.method.toUpperCase(),
      createdAt: now,
      updatedAt: now,
      retryCount: 0,
      idempotencyKey: input.idempotencyKey || createIdempotencyKey(),
      fileMetadata: input.fileMetadata,
      requestFingerprint: input.requestFingerprint,
      displayLabel: input.displayLabel,
    };

    // Prepend to requests list
    this.registry.requests = [newRequest, ...this.registry.requests];
    this.notify();
    return newRequest;
  }

  public updateRequest(
    clientRequestId: string,
    patch: Partial<ManagedRequest>,
  ): ManagedRequest | undefined {
    let target: ManagedRequest | undefined;
    this.registry.requests = this.registry.requests.map((req) => {
      if (req.clientRequestId === clientRequestId) {
        target = {
          ...req,
          ...patch,
          updatedAt: new Date().toISOString(),
        };
        return target;
      }
      return req;
    });

    if (target) {
      this.notify();
    }
    return target;
  }

  public getRequest(clientRequestId: string): ManagedRequest | undefined {
    return this.registry.requests.find((r) => r.clientRequestId === clientRequestId);
  }

  public getRequests(filter?: { kind?: ManagedRequestKind; activeOnly?: boolean }): ManagedRequest[] {
    return this.registry.requests.filter((r) => {
      if (filter?.kind && r.kind !== filter.kind) return false;
      if (filter?.activeOnly) {
        const isFinished =
          r.status === "completed" ||
          r.status === "failed" ||
          r.status === "client_timeout" ||
          r.status === "cancelled";
        return !isFinished;
      }
      return true;
    });
  }

  public checkDuplicate(
    kind: ManagedRequestKind,
    requestFingerprint: string,
  ): ManagedRequest | undefined {
    return this.registry.requests.find(
      (r) =>
        r.kind === kind &&
        r.requestFingerprint === requestFingerprint &&
        (r.status === "submitting" || r.status === "processing" || r.status === "waiting"),
    );
  }

  public hideRequest(clientRequestId: string): void {
    const controller = this.activeAbortControllers.get(clientRequestId);
    if (controller) {
      controller.abort();
      this.activeAbortControllers.delete(clientRequestId);
    }
    this.registry.requests = this.registry.requests.filter((r) => r.clientRequestId !== clientRequestId);
    this.notify();
  }

  public dismissNotification(clientRequestId: string): void {
    this.updateRequest(clientRequestId, { notificationDismissed: true });
  }

  /**
   * Bounded Polling Engine
   * Polls until complete, terminal error (HALT), or max deadline reached (client_timeout).
   */
  public async pollUntilComplete<T>(
    clientRequestId: string,
    checkFn: (signal: AbortSignal) => Promise<{
      status: "processing" | "waiting" | "completed" | "failed";
      result?: T;
      error?: unknown;
      httpStatus?: number;
      serverRequestId?: string;
    }>,
    options: {
      pollIntervalMs?: number;
      maxDurationMs?: number;
      maxTransientRetries?: number;
    } = {},
  ): Promise<{ success: boolean; result?: T; error?: ApiError }> {
    const pollInterval = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    const maxDuration = options.maxDurationMs ?? DEFAULT_MAX_POLL_DURATION_MS;
    const maxTransientRetries = options.maxTransientRetries ?? DEFAULT_MAX_TRANSIENT_RETRIES;

    const controller = new AbortController();
    this.activeAbortControllers.set(clientRequestId, controller);

    const deadline = Date.now() + maxDuration;
    let transientFailureCount = 0;

    try {
      while (Date.now() < deadline) {
        if (controller.signal.aborted) {
          this.updateRequest(clientRequestId, { status: "cancelled" });
          return { success: false, error: { status: 499, code: "CANCELLED", message: "Yêu cầu đã bị hủy." } };
        }

        try {
          this.updateRequest(clientRequestId, {
            status: "processing",
            lastCheckedAt: new Date().toISOString(),
          });

          const check = await checkFn(controller.signal);
          transientFailureCount = 0; // reset on successful response

          if (check.serverRequestId) {
            this.updateRequest(clientRequestId, { serverRequestId: check.serverRequestId });
          }

          if (check.status === "completed") {
            this.updateRequest(clientRequestId, {
              status: "completed",
              httpStatus: check.httpStatus ?? 200,
            });
            return { success: true, result: check.result };
          }

          if (check.status === "failed") {
            const apiErr = parseApiError(check.error);
            this.updateRequest(clientRequestId, {
              status: "failed",
              httpStatus: check.httpStatus || apiErr.status || 500,
              error: apiErr,
            });
            return { success: false, error: apiErr };
          }

          // status is "processing" or "waiting" -> continue polling
          if (check.status === "waiting") {
            this.updateRequest(clientRequestId, { status: "waiting" });
          }
        } catch (caught) {
          const apiErr = parseApiError(caught);
          const policy = resolveErrorPolicy(apiErr, { method: "GET", isPolling: true });

          if (policy === "HALT" || policy === "REQUIRE_USER_ACTION") {
            this.updateRequest(clientRequestId, {
              status: "failed",
              httpStatus: apiErr.status,
              error: apiErr,
            });
            return { success: false, error: apiErr };
          }

          if (policy === "RETRY_BOUNDED") {
            transientFailureCount++;
            if (transientFailureCount > maxTransientRetries) {
              this.updateRequest(clientRequestId, {
                status: "failed",
                httpStatus: apiErr.status,
                error: {
                  ...apiErr,
                  message: `${apiErr.message} (Đã thử lại ${maxTransientRetries} lần nhưng không thành công).`,
                },
              });
              return { success: false, error: apiErr };
            }
          }

          // If WAIT_AND_POLL, we continue until deadline
        }

        // Delay between poll iterations with exponential backoff for transient retries
        const backoffMultiplier = Math.min(4, Math.pow(1.5, transientFailureCount));
        const currentDelay = pollInterval * backoffMultiplier;
        await new Promise((resolve) => setTimeout(resolve, currentDelay));
      }

      // Max duration reached -> Mark as client_timeout (DO NOT falsely claim server failed!)
      this.updateRequest(clientRequestId, {
        status: "client_timeout",
        error: {
          code: "CLIENT_TIMEOUT",
          message: "Đã dừng chờ tự động do quá thời gian cho phép. Yêu cầu có thể vẫn đang được xử lý trên máy chủ.",
        },
      });
      return {
        success: false,
        error: {
          status: 408,
          code: "CLIENT_TIMEOUT",
          message: "Đã dừng chờ tự động do quá thời gian cho phép.",
        },
      };
    } finally {
      this.activeAbortControllers.delete(clientRequestId);
    }
  }

  /**
   * Reconcile pending requests upon app startup / browser reload
   */
  public reconcileOnStartup(): void {
    let changed = false;
    this.registry.requests = this.registry.requests.map((req) => {
      // 1. If request was 'submitting' when page closed/reloaded without response:
      // DO NOT blindly re-POST! Mark as 'delivery_unknown'.
      if (req.status === "submitting") {
        changed = true;
        return {
          ...req,
          status: "delivery_unknown",
          updatedAt: new Date().toISOString(),
          error: {
            code: "DELIVERY_UNKNOWN",
            message: "Không thể xác nhận máy chủ đã nhận yêu cầu hay chưa do trang đã được tải lại.",
          },
        };
      }

      // 2. If request is 'processing' or 'waiting' and has a poller registered
      if ((req.status === "processing" || req.status === "waiting") && req.resourceId) {
        const poller = this.registeredPollers.get(req.kind);
        if (poller) {
          // Resume bounded polling in the background
          setTimeout(() => {
            this.pollUntilComplete(req.clientRequestId, (signal) => poller(req, signal));
          }, 500);
        }
      }

      return req;
    });

    if (changed) {
      this.notify();
    }
  }
}

export const requestManager = new RequestManager();
