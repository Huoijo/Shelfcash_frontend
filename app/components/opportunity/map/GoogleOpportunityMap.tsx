"use client";

import React, { useEffect, useRef, useState } from "react";
import type {
  OpportunityAnalysisLocation,
  OpportunityPoi,
  OpportunityPoiCategory,
  OpportunityRunStatus,
} from "../../../../lib/opportunity/types";

export interface GoogleOpportunityMapProps {
  center: OpportunityAnalysisLocation;
  radiusKm: number;
  pois: OpportunityPoi[];
  isScanning: boolean;
  status: OpportunityRunStatus;
  activeCategoryFilter?: OpportunityPoiCategory | null;
  onLocationSelect?: (location: OpportunityAnalysisLocation) => void;
}

const CATEGORY_META: Record<
  OpportunityPoiCategory,
  { color: string; label: string }
> = {
  competitor: { color: "#e11d48", label: "Cửa hàng / Đối thủ" },
  university: { color: "#2563eb", label: "Trường / Đại học" },
  transit: { color: "#d97706", label: "Transit" },
  supporting_retail: { color: "#059669", label: "Retail bổ trợ" },
};

function createPoiMarkerIcon(color: string, isDimmed: boolean): google.maps.Icon {
  const opacity = isDimmed ? 0.3 : 1.0;
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 26 26" fill="none">
      <circle cx="13" cy="13" r="10" fill="${color}" fill-opacity="${opacity}" stroke="#ffffff" stroke-width="2.5" />
      <circle cx="13" cy="13" r="4" fill="#ffffff" fill-opacity="${opacity}" />
    </svg>
  `;

  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new google.maps.Size(24, 24),
    anchor: new google.maps.Point(12, 12),
  };
}

function createCenterMarkerIcon(): google.maps.Icon {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 36 36" fill="none">
      <circle cx="18" cy="18" r="14" fill="#047857" stroke="#ffffff" stroke-width="3" />
      <circle cx="18" cy="18" r="7" fill="#10b981" />
      <circle cx="18" cy="18" r="3" fill="#ffffff" />
    </svg>
  `;

  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new google.maps.Size(32, 32),
    anchor: new google.maps.Point(16, 16),
  };
}

// Clean restrained styling for Google Map matching ShelfCash aesthetic
const SHELFCASH_MAP_STYLES: google.maps.MapTypeStyle[] = [
  { featureType: "poi", elementType: "labels", stylers: [{ visibility: "off" }] },
  { featureType: "transit", elementType: "labels", stylers: [{ visibility: "off" }] },
  { featureType: "landscape", elementType: "geometry", stylers: [{ color: "#f8fafc" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#e2e8f0" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#ffffff" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#cbd5e1" }] },
];

export function GoogleOpportunityMap({
  center,
  radiusKm,
  pois,
  isScanning,
  status,
  activeCategoryFilter,
  onLocationSelect,
}: GoogleOpportunityMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const centerMarkerRef = useRef<google.maps.Marker | null>(null);
  const radiusCircleRef = useRef<google.maps.Circle | null>(null);
  const poiMarkersRef = useRef<Map<string, google.maps.Marker>>(new Map());
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);

  const [sweepAngle, setSweepAngle] = useState(0);

  // Radar sweep animation
  useEffect(() => {
    if (!isScanning) {
      setSweepAngle(0);
      return;
    }

    // Check prefers-reduced-motion
    const prefersReducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (prefersReducedMotion) {
      return;
    }

    let frameId: number;
    const start = performance.now();
    const PERIOD = 2000; // ~2s per rotation as required

    const tick = (now: number) => {
      const elapsed = now - start;
      const angle = ((elapsed % PERIOD) / PERIOD) * 360;
      setSweepAngle(angle);
      frameId = requestAnimationFrame(tick);
    };

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [isScanning]);

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current || typeof window.google === "undefined") return;

    const zoomLevel = radiusKm <= 1 ? 15 : radiusKm <= 2 ? 14 : radiusKm <= 3 ? 14 : 13;

    const map = new google.maps.Map(mapContainerRef.current, {
      center: { lat: center.lat, lng: center.lng },
      zoom: zoomLevel,
      disableDefaultUI: true,
      zoomControl: true,
      zoomControlOptions: {
        position: google.maps.ControlPosition.RIGHT_BOTTOM,
      },
      styles: SHELFCASH_MAP_STYLES,
      clickableIcons: false,
    });

    mapInstanceRef.current = map;
    infoWindowRef.current = new google.maps.InfoWindow();

    // Map click handler for selecting location
    const clickListener = map.addListener(
      "click",
      (event: google.maps.MapMouseEvent) => {
        if (!event.latLng || !onLocationSelect) return;
        const lat = event.latLng.lat();
        const lng = event.latLng.lng();

        // Reverse geocoding if available, or approximate label
        const geocoder = new google.maps.Geocoder();
        geocoder.geocode({ location: { lat, lng } }, (results, geoStatus) => {
          let address = `Tọa độ: ${lat.toFixed(4)}, ${lng.toFixed(4)}`;
          let label = "Vị trí khảo sát";

          if (geoStatus === "OK" && results && results[0]) {
            address = results[0].formatted_address;
            const route = results[0].address_components.find((c) =>
              c.types.includes("route")
            );
            if (route) {
              label = route.long_name;
            }
          }

          onLocationSelect({
            lat,
            lng,
            label,
            address,
            source: "map",
          });
        });
      }
    );

    return () => {
      google.maps.event.removeListener(clickListener);
    };
  }, []);

  // Update Center Marker & Radius Circle
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const latLng = new google.maps.LatLng(center.lat, center.lng);

    // Pan map to new center
    map.panTo(latLng);
    const zoomLevel = radiusKm <= 1 ? 15 : radiusKm <= 2 ? 14 : radiusKm <= 3 ? 14 : 13;
    map.setZoom(zoomLevel);

    // Center Marker
    if (!centerMarkerRef.current) {
      const marker = new google.maps.Marker({
        position: latLng,
        map,
        icon: createCenterMarkerIcon(),
        title: center.label,
        zIndex: 100,
      });

      marker.addListener("click", () => {
        if (!infoWindowRef.current) return;
        const subtitle =
          center.source === "store"
            ? "ShelfCash Flagship Coffee · Cửa hàng hiện tại"
            : "Vị trí khảo sát";
        infoWindowRef.current.setContent(`
          <div style="padding: 4px 6px; font-family: system-ui, -apple-system, sans-serif;">
            <div style="font-weight: 700; font-size: 13px; color: #0f172a;">${center.label}</div>
            <div style="font-size: 11px; color: #047857; font-weight: 600; margin-top: 2px;">${subtitle}</div>
            ${center.address ? `<div style="font-size: 11px; color: #64748b; margin-top: 2px;">${center.address}</div>` : ""}
          </div>
        `);
        infoWindowRef.current.open(map, marker);
      });

      centerMarkerRef.current = marker;
    } else {
      centerMarkerRef.current.setPosition(latLng);
      centerMarkerRef.current.setTitle(center.label);
    }

    // Radius Circle
    if (!radiusCircleRef.current) {
      const circle = new google.maps.Circle({
        strokeColor: "#059669",
        strokeOpacity: 0.85,
        strokeWeight: 1.5,
        fillColor: "#10b981",
        fillOpacity: 0.08,
        map,
        center: latLng,
        radius: radiusKm * 1000,
        clickable: false,
      });
      radiusCircleRef.current = circle;
    } else {
      radiusCircleRef.current.setCenter(latLng);
      radiusCircleRef.current.setRadius(radiusKm * 1000);
    }
  }, [center, radiusKm]);

  // Update POI Markers
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const existingMap = poiMarkersRef.current;
    const currentPoiIds = new Set(pois.map((p) => p.id));

    // Remove obsolete markers
    existingMap.forEach((marker, id) => {
      if (!currentPoiIds.has(id)) {
        marker.setMap(null);
        existingMap.delete(id);
      }
    });

    // Create or update markers
    pois.forEach((poi) => {
      const isDimmed = Boolean(
        activeCategoryFilter && poi.category !== activeCategoryFilter
      );
      const meta = CATEGORY_META[poi.category] || CATEGORY_META.competitor;

      let marker = existingMap.get(poi.id);
      if (!marker) {
        marker = new google.maps.Marker({
          position: { lat: poi.lat, lng: poi.lng },
          map,
          icon: createPoiMarkerIcon(meta.color, isDimmed),
          title: `${poi.name} (${meta.label})`,
          zIndex: isDimmed ? 1 : 10,
        });

        marker.addListener("click", () => {
          if (!infoWindowRef.current) return;
          infoWindowRef.current.setContent(`
            <div style="padding: 4px 6px; font-family: system-ui, -apple-system, sans-serif;">
              <div style="font-weight: 700; font-size: 13px; color: #0f172a;">${poi.name}</div>
              <div style="font-size: 11px; color: ${meta.color}; font-weight: 600; margin-top: 2px;">${meta.label}</div>
              ${
                poi.distanceMeters !== undefined
                  ? `<div style="font-size: 11px; color: #64748b; margin-top: 2px;">Khoảng cách: ~${poi.distanceMeters} m</div>`
                  : ""
              }
            </div>
          `);
          infoWindowRef.current.open(map, marker);
        });

        existingMap.set(poi.id, marker);
      } else {
        marker.setPosition({ lat: poi.lat, lng: poi.lng });
        marker.setIcon(createPoiMarkerIcon(meta.color, isDimmed));
        marker.setZIndex(isDimmed ? 1 : 10);
      }
    });
  }, [pois, activeCategoryFilter]);

  // Clean up all markers on unmount
  useEffect(() => {
    return () => {
      poiMarkersRef.current.forEach((marker) => marker.setMap(null));
      poiMarkersRef.current.clear();
      if (centerMarkerRef.current) {
        centerMarkerRef.current.setMap(null);
        centerMarkerRef.current = null;
      }
      if (radiusCircleRef.current) {
        radiusCircleRef.current.setMap(null);
        radiusCircleRef.current = null;
      }
    };
  }, []);

  return (
    <div className="opp-map-viewport-wrapper" role="region" aria-label="Google Maps phân tích">
      {/* Map Target Canvas */}
      <div ref={mapContainerRef} className="opp-google-map-canvas" />

      {/* Radar Sweep Effect during scanning */}
      {isScanning && (
        <div className="opp-map-radar-overlay" aria-hidden="true">
          <div
            className="opp-map-radar-sweeper"
            style={{ transform: `rotate(${sweepAngle}deg)` }}
          />
        </div>
      )}

      {/* Map Overlay Badge */}
      <div className="opp-map-overlay-badge">
        <span className="opp-map-active-dot" />
        <span>Bản đồ trực tuyến · Bán kính {radiusKm} km</span>
      </div>
    </div>
  );
}
