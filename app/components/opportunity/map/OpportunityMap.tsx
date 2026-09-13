"use client";

import React, { useCallback, useEffect, useState } from "react";
import { getOpportunityConfig } from "../../../../lib/opportunity/config";
import { isGoogleMapsLoaded, loadGoogleMapsScript } from "../../../../lib/opportunity/google-maps-loader";
import type {
  OpportunityAnalysisLocation,
  OpportunityPoi,
  OpportunityPoiCategory,
  OpportunityRunStatus,
} from "../../../../lib/opportunity/types";
import { FallbackOpportunityScanner } from "./FallbackOpportunityScanner";
import { GoogleOpportunityMap } from "./GoogleOpportunityMap";
import { OSMOpportunityMap } from "./OSMOpportunityMap";

export interface OpportunityMapProps {
  center: OpportunityAnalysisLocation;
  radiusKm: number;
  pois: OpportunityPoi[];
  isScanning: boolean;
  status: OpportunityRunStatus;
  activeCategoryFilter?: OpportunityPoiCategory | null;
  onLocationSelect?: (location: OpportunityAnalysisLocation) => void;
}

export function OpportunityMap({
  center,
  radiusKm,
  pois,
  isScanning,
  status,
  activeCategoryFilter,
  onLocationSelect,
}: OpportunityMapProps) {
  const config = getOpportunityConfig();
  const mapProvider = config.mapProvider;
  const shouldAttemptGoogle =
    mapProvider === "google" && config.googleMapsApiKeyAvailable;

  const [googleReady, setGoogleReady] = useState(() => isGoogleMapsLoaded());
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  const initGoogleMaps = useCallback(async () => {
    if (!shouldAttemptGoogle) {
      setGoogleReady(false);
      return;
    }

    if (isGoogleMapsLoaded()) {
      setGoogleReady(true);
      setLoadError(null);
      return;
    }

    try {
      setLoadError(null);
      await loadGoogleMapsScript({ apiKey: config.googleMapsApiKey });
      setGoogleReady(true);
    } catch (err) {
      setGoogleReady(false);
      setLoadError(
        err instanceof Error
          ? err.message
          : "Không thể tải Google Maps. Đang chuyển sang chế độ dự phòng."
      );
    }
  }, [shouldAttemptGoogle, config.googleMapsApiKey]);

  useEffect(() => {
    if (mapProvider === "google") {
      initGoogleMaps();
    }
  }, [initGoogleMaps, mapProvider, retryCount]);

  const handleRetry = () => {
    setRetryCount((prev) => prev + 1);
  };

  // 1. OSM Provider (Primary default - Leaflet + OpenStreetMap)
  if (mapProvider === "osm") {
    return (
      <OSMOpportunityMap
        center={center}
        radiusKm={radiusKm}
        pois={pois}
        isScanning={isScanning}
        status={status}
        activeCategoryFilter={activeCategoryFilter}
        onLocationSelect={onLocationSelect}
        onError={(err) => setLoadError(err.message)}
      />
    );
  }

  // 2. Google Provider (Optional legacy / future)
  if (shouldAttemptGoogle && googleReady) {
    return (
      <GoogleOpportunityMap
        center={center}
        radiusKm={radiusKm}
        pois={pois}
        isScanning={isScanning}
        status={status}
        activeCategoryFilter={activeCategoryFilter}
        onLocationSelect={onLocationSelect}
      />
    );
  }

  // 3. Fallback Scanner (When provider is none or real map load fails)
  return (
    <FallbackOpportunityScanner
      center={center}
      radiusKm={radiusKm}
      pois={pois}
      isScanning={isScanning}
      status={status}
      activeCategoryFilter={activeCategoryFilter}
      errorMessage={loadError}
      onRetryMap={shouldAttemptGoogle ? handleRetry : undefined}
      onLocationSelect={onLocationSelect}
    />
  );
}
