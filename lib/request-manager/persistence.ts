import type {
  ConnectionConfig,
  FileMetadataSafe,
  ManagedRequest,
  ManagedRequestRegistry,
} from "./types";

const STORAGE_KEY_REGISTRY = "shelfcash:request_registry:v1";
const STORAGE_KEY_CONNECTION = "shelfcash:connection_config:v1";
const MAX_SAVED_REQUESTS = 50;
const RETENTION_PERIOD_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Safely extracts non-binary metadata for a File object without storing Blobs in localStorage
 */
export function extractSafeFileMetadata(file: File): FileMetadataSafe {
  return {
    name: file.name,
    size: file.size,
    lastModified: file.lastModified,
    fingerprint: `${file.name}-${file.size}-${file.lastModified}`,
  };
}

/**
 * Computes a fingerprint string for request payload / file
 */
export function computeRequestFingerprint(
  kind: string,
  target: string,
  extra?: unknown,
): string {
  try {
    return `${kind}:${target}:${typeof extra === "object" ? JSON.stringify(extra) : String(extra ?? "")}`;
  } catch {
    return `${kind}:${target}`;
  }
}

/**
 * Loads the versioned ManagedRequestRegistry from localStorage
 */
export function loadManagedRequestRegistry(): ManagedRequestRegistry {
  if (typeof window === "undefined") {
    return { version: 1, requests: [], lastSavedAt: new Date().toISOString() };
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_REGISTRY);
    if (!raw) {
      return { version: 1, requests: [], lastSavedAt: new Date().toISOString() };
    }
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && parsed.version === 1 && Array.isArray(parsed.requests)) {
      return pruneOldRequests(parsed as ManagedRequestRegistry);
    }
  } catch (caught) {
    console.warn("Failed to parse ManagedRequestRegistry from localStorage:", caught);
  }

  return { version: 1, requests: [], lastSavedAt: new Date().toISOString() };
}

/**
 * Saves the versioned ManagedRequestRegistry to localStorage with retention pruning
 */
export function saveManagedRequestRegistry(registry: ManagedRequestRegistry): void {
  if (typeof window === "undefined") return;

  try {
    const pruned = pruneOldRequests(registry);
    pruned.lastSavedAt = new Date().toISOString();
    window.localStorage.setItem(STORAGE_KEY_REGISTRY, JSON.stringify(pruned));
  } catch (caught) {
    console.error("Failed to save ManagedRequestRegistry to localStorage:", caught);
  }
}

/**
 * Prunes completed / failed requests that exceed the retention window or max count.
 * Never prunes active (submitting / processing / waiting) requests!
 */
export function pruneOldRequests(registry: ManagedRequestRegistry): ManagedRequestRegistry {
  const now = Date.now();
  const active: ManagedRequest[] = [];
  const finished: ManagedRequest[] = [];

  for (const req of registry.requests) {
    const isFinished =
      req.status === "completed" ||
      req.status === "failed" ||
      req.status === "client_timeout" ||
      req.status === "cancelled";

    if (!isFinished) {
      active.push(req);
    } else {
      const age = now - new Date(req.updatedAt || req.createdAt).getTime();
      if (age < RETENTION_PERIOD_MS) {
        finished.push(req);
      }
    }
  }

  // Sort finished newest first and cap size
  finished.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const cappedFinished = finished.slice(0, Math.max(0, MAX_SAVED_REQUESTS - active.length));

  return {
    version: 1,
    requests: [...active, ...cappedFinished],
    lastSavedAt: registry.lastSavedAt || new Date().toISOString(),
  };
}

/**
 * Persist & retrieve connection settings (backendBaseUrl)
 */
export function loadPersistedBackendBaseUrl(): string {
  if (typeof window === "undefined") return "";
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_CONNECTION);
    if (!raw) return "";
    const parsed = JSON.parse(raw) as ConnectionConfig;
    return parsed?.backendBaseUrl || "";
  } catch {
    return "";
  }
}

export function savePersistedBackendBaseUrl(backendBaseUrl: string): void {
  if (typeof window === "undefined") return;
  try {
    const config: ConnectionConfig = {
      backendBaseUrl,
      updatedAt: new Date().toISOString(),
    };
    window.localStorage.setItem(STORAGE_KEY_CONNECTION, JSON.stringify(config));
  } catch (caught) {
    console.error("Failed to save ConnectionConfig to localStorage:", caught);
  }
}
