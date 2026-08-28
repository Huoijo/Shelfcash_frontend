export type ManagedRequestKind =
  | "import"
  | "forecast"
  | "ingredient_demand"
  | "planning"
  | "decision"
  | "what_if"
  | "explanation";

export type ManagedRequestStatus =
  | "draft"
  | "submitting"
  | "accepted"
  | "processing"
  | "completed"
  | "failed"
  | "waiting"
  | "client_timeout"
  | "delivery_unknown"
  | "cancelled";

export type ErrorPolicyAction =
  | "HALT"
  | "RETRY_BOUNDED"
  | "WAIT_AND_POLL"
  | "REQUIRE_USER_ACTION";

export interface ApiError {
  status: number;
  code: string;
  message: string;
  details?: unknown;
  requestId?: string;
}

export interface FileMetadataSafe {
  name: string;
  size: number;
  lastModified?: number;
  fingerprint?: string;
}

export interface ManagedRequest {
  clientRequestId: string;
  kind: ManagedRequestKind;
  status: ManagedRequestStatus;
  backendBaseUrl: string;
  endpoint: string;
  method: string;
  serverRequestId?: string;
  resourceId?: string;
  idempotencyKey?: string;
  createdAt: string;
  updatedAt: string;
  lastCheckedAt?: string;
  httpStatus?: number;
  retryCount: number;
  error?: {
    code?: string;
    message: string;
    details?: unknown;
    requestId?: string;
  };
  fileMetadata?: FileMetadataSafe;
  requestFingerprint?: string;
  displayLabel?: string;
  notificationDismissed?: boolean;
}

export interface ManagedRequestRegistry {
  version: 1;
  requests: ManagedRequest[];
  lastSavedAt: string;
}

export interface ConnectionConfig {
  backendBaseUrl: string;
  updatedAt: string;
}
