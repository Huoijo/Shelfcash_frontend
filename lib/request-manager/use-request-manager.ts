"use client";

import { useEffect, useState } from "react";
import type { ManagedRequest, ManagedRequestKind, ManagedRequestRegistry } from "./types";
import { requestManager } from "./request-manager";

export function useRequestManager() {
  const [registry, setRegistry] = useState<ManagedRequestRegistry>(() => {
    return {
      version: 1,
      requests: requestManager.getRequests(),
      lastSavedAt: new Date().toISOString(),
    };
  });

  useEffect(() => {
    requestManager.init();
    return requestManager.subscribe((next) => {
      setRegistry({ ...next, requests: [...next.requests] });
    });
  }, []);

  return {
    manager: requestManager,
    registry,
    requests: registry.requests,
    backendBaseUrl: requestManager.getBackendBaseUrl(),
    setBackendBaseUrl: (url: string) => requestManager.setBackendBaseUrl(url),
    createRequest: requestManager.createRequest.bind(requestManager),
    updateRequest: requestManager.updateRequest.bind(requestManager),
    hideRequest: requestManager.hideRequest.bind(requestManager),
    checkDuplicate: requestManager.checkDuplicate.bind(requestManager),
    dismissNotification: requestManager.dismissNotification.bind(requestManager),
  };
}

export function useManagedRequest(clientRequestId: string | null | undefined): ManagedRequest | undefined {
  const [request, setRequest] = useState<ManagedRequest | undefined>(() =>
    clientRequestId ? requestManager.getRequest(clientRequestId) : undefined,
  );

  useEffect(() => {
    if (!clientRequestId) {
      setRequest(undefined);
      return;
    }

    setRequest(requestManager.getRequest(clientRequestId));
    return requestManager.subscribe(() => {
      setRequest(requestManager.getRequest(clientRequestId));
    });
  }, [clientRequestId]);

  return request;
}

export function useRecentRequests(kind?: ManagedRequestKind, limit: number = 5): ManagedRequest[] {
  const { requests } = useRequestManager();
  return requests
    .filter((r) => (!kind ? true : r.kind === kind))
    .slice(0, limit);
}
