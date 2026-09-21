"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  OpportunityAnalysisLocation,
  OpportunityPoi,
  OpportunityPoiCategory,
  OpportunityRunStatus,
} from "../../../../lib/opportunity/types";
import { calculateBearingDegrees, formatDistance } from "../../../../lib/opportunity/map/geo-utils";
import { reverseGeocodeNominatim } from "../../../../lib/opportunity/map/nominatim-service";

export interface OSMOpportunityMapProps {
  center: OpportunityAnalysisLocation;
  radiusKm: number;
  pois: OpportunityPoi[];
  isScanning: boolean;
  status: OpportunityRunStatus;
  activeCategoryFilter?: OpportunityPoiCategory | null;
  onLocationSelect?: (location: OpportunityAnalysisLocation) => void;
  onError?: (error: Error) => void;
  onProgressUpdate?: (revealedCount: number, totalCount: number) => void;
}

const CATEGORY_COLORS: Record<OpportunityPoiCategory, { bg: string; border: string; text: string; label: string }> = {
  competitor: {
    bg: "#ef4444",
    border: "#991b1b",
    text: "#ffffff",
    label: "Cửa hàng / Đối thủ",
  },
  university: {
    bg: "#3b82f6",
    border: "#1d4ed8",
    text: "#ffffff",
    label: "Trường / Đại học",
  },
  transit: {
    bg: "#f97316",
    border: "#c2410c",
    text: "#ffffff",
    label: "Transit",
  },
  supporting_retail: {
    bg: "#10b981",
    border: "#047857",
    text: "#ffffff",
    label: "Retail bổ trợ",
  },
};

import type * as L from "leaflet";

export function OSMOpportunityMap({
  center,
  radiusKm,
  pois,
  isScanning,
  status,
  activeCategoryFilter,
  onLocationSelect,
  onError,
  onProgressUpdate,
}: OSMOpportunityMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const circleRef = useRef<L.Circle | null>(null);
  const centerMarkerRef = useRef<L.Marker | null>(null);
  const poiLayerRef = useRef<L.LayerGroup | null>(null);
  const poiMarkersMapRef = useRef<Map<string, L.Marker>>(new Map());

  const [mapLoaded, setMapLoaded] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);

  // Radar geometry state strictly derived from Leaflet map projection
  const [radarGeometry, setRadarGeometry] = useState<{
    x: number;
    y: number;
    radiusPx: number;
  } | null>(null);

  // Radar rotation sweep angle (0 to 360)
  const [sweepAngle, setSweepAngle] = useState(0);

  // Progressive POI discovery: set of POI IDs that have been revealed by the radar
  const [revealedPoiIds, setRevealedPoiIds] = useState<Set<string>>(new Set());

  // In-radius POIs with precomputed bearings
  const inRadiusPoisWithBearing = useMemo(() => {
    const radiusMeters = radiusKm * 1000;
    return pois
      .filter((poi) => poi.distanceMeters <= radiusMeters)
      .map((poi) => ({
        ...poi,
        bearing: calculateBearingDegrees(center.lat, center.lng, poi.lat, poi.lng),
      }));
  }, [pois, radiusKm, center.lat, center.lng]);

  // Mutable ref so map event listeners always invoke the latest geometry calculator
  const updateRadarGeometryRef = useRef<() => void>(() => {});

  // Update radar geometry on Leaflet move, zoom, or resize
  const updateRadarGeometry = useCallback(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    try {
      const circle = circleRef.current;
      const centerLatLng = circle ? circle.getLatLng() : [center.lat, center.lng];
      const centerPt = map.latLngToContainerPoint(centerLatLng as [number, number]);

      let radiusPx = 0;

      // 1. Direct Leaflet internal projected radius if available (exact pixel radius of circle SVG)
      if (circle && typeof (circle as unknown as { _radius?: number })._radius === "number" && (circle as unknown as { _radius: number })._radius > 0) {
        radiusPx = Math.round((circle as unknown as { _radius: number })._radius);
      } else if (circle) {
        // 2. Leaflet circle bounds projection
        const bounds = circle.getBounds();
        const centerLng = typeof centerLatLng === "object" && "lng" in centerLatLng ? centerLatLng.lng : center.lng;
        const northPt = map.latLngToContainerPoint([bounds.getNorth(), centerLng]);
        radiusPx = Math.round(Math.abs(centerPt.y - northPt.y));
      } else {
        // 3. Fallback projection using spherical offset
        const radiusMeters = radiusKm * 1000;
        const latOffset = radiusMeters / 111319.5;
        const edgePt = map.latLngToContainerPoint([center.lat + latOffset, center.lng]);
        radiusPx = Math.round(Math.hypot(edgePt.x - centerPt.x, edgePt.y - centerPt.y));
      }

      if (radiusPx > 0) {
        setRadarGeometry({
          x: Math.round(centerPt.x),
          y: Math.round(centerPt.y),
          radiusPx,
        });
      }
    } catch {
      // Container point projection might fail if container not ready
    }
  }, [center.lat, center.lng, radiusKm]);

  useEffect(() => {
    updateRadarGeometryRef.current = updateRadarGeometry;
  }, [updateRadarGeometry]);

  // Reset revealed POIs whenever center or radius changes
  useEffect(() => {
    setRevealedPoiIds(new Set());
    setSweepAngle(0);
    if (poiLayerRef.current) {
      poiLayerRef.current.clearLayers();
    }
    poiMarkersMapRef.current.clear();
  }, [center.lat, center.lng, radiusKm]);

  // When scan completes or status is completed, reveal all in-radius POIs
  useEffect(() => {
    if (status === "completed") {
      const allIds = new Set(inRadiusPoisWithBearing.map((p) => p.id));
      setRevealedPoiIds(allIds);
      if (onProgressUpdate) {
        onProgressUpdate(allIds.size, allIds.size);
      }
    }
  }, [status, inRadiusPoisWithBearing, onProgressUpdate]);

  // Radar sweep animation and progressive bearing reveal during active scan
  useEffect(() => {
    if (!isScanning) {
      setSweepAngle(0);
      return;
    }

    // Check prefers-reduced-motion
    const prefersReducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (prefersReducedMotion) {
      // Instantly reveal in-radius POIs without rotation
      const allIds = new Set(inRadiusPoisWithBearing.map((p) => p.id));
      setRevealedPoiIds(allIds);
      if (onProgressUpdate) {
        onProgressUpdate(allIds.size, allIds.size);
      }
      return;
    }

    // Start with empty revealed set for fresh discovery
    setRevealedPoiIds(new Set());
    setSweepAngle(0);

    let animationFrameId: number;
    const startTime = performance.now();
    const DURATION_MS = 4500; // Controlled 4.5 second rotation
    const discoveredIds = new Set<string>();

    const animate = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / DURATION_MS);
      const angle = progress * 360;

      setSweepAngle(angle);

      // Check which POIs the leading beam has crossed
      let newlyAdded = false;
      for (const poi of inRadiusPoisWithBearing) {
        if (!discoveredIds.has(poi.id)) {
          // If angle >= bearing, beam has crossed this POI
          if (angle >= poi.bearing) {
            discoveredIds.add(poi.id);
            newlyAdded = true;
          }
        }
      }

      if (newlyAdded) {
        const nextSet = new Set(discoveredIds);
        setRevealedPoiIds(nextSet);
        if (onProgressUpdate) {
          onProgressUpdate(nextSet.size, inRadiusPoisWithBearing.length);
        }
      }

      if (progress < 1) {
        animationFrameId = requestAnimationFrame(animate);
      } else {
        // Complete rotation: guarantee 100% of in-radius POIs are revealed
        const fullSet = new Set(inRadiusPoisWithBearing.map((p) => p.id));
        setRevealedPoiIds(fullSet);
        if (onProgressUpdate) {
          onProgressUpdate(fullSet.size, fullSet.size);
        }
      }
    };

    animationFrameId = requestAnimationFrame(animate);

    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [isScanning, inRadiusPoisWithBearing, onProgressUpdate]);

  // Initialize Leaflet map
  useEffect(() => {
    let isMounted = true;

    async function initLeaflet() {
      if (!containerRef.current || mapInstanceRef.current) return;

      try {
        const L = (await import("leaflet")).default;

        if (!isMounted || !containerRef.current) return;

        // Create Leaflet map instance
        const map = L.map(containerRef.current, {
          center: [center.lat, center.lng],
          zoom: radiusKm <= 1 ? 15 : radiusKm <= 3 ? 14 : 13,
          zoomControl: false,
          attributionControl: true,
        });

        // Add standard OpenStreetMap tiles
        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>',
        }).addTo(map);

        // Zoom control in top-right
        L.control.zoom({ position: "topright" }).addTo(map);

        // Feature group for POI markers
        const poiLayer = L.layerGroup().addTo(map);
        poiLayerRef.current = poiLayer;

        // Click listener on map to select analysis center
        map.on("click", async (e: L.LeafletMouseEvent) => {
          const lat = e.latlng.lat;
          const lng = e.latlng.lng;

          if (onLocationSelect) {
            onLocationSelect({
              id: `map_click_${Date.now()}`,
              label: "Vị trí khảo sát",
              address: `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
              lat,
              lng,
              source: "map",
            });

            try {
              const rev = await reverseGeocodeNominatim(lat, lng);
              onLocationSelect({
                id: `map_click_${Date.now()}`,
                label: rev.label,
                address: rev.address,
                lat,
                lng,
                source: "map",
              });
            } catch {
              // Ignore failure, coordinates fallback is in place
            }
          }
        });

        // Recompute radar position on map move / zoom / animation
        const handleMapTransform = () => {
          updateRadarGeometryRef.current();
        };

        map.on("move", handleMapTransform);
        map.on("zoom", handleMapTransform);
        map.on("moveend", handleMapTransform);
        map.on("zoomend", handleMapTransform);
        map.on("viewreset", handleMapTransform);
        map.on("resize", handleMapTransform);

        mapInstanceRef.current = map;
        setMapLoaded(true);

        setTimeout(() => {
          map.invalidateSize();
          updateRadarGeometryRef.current();
        }, 150);
      } catch (err: unknown) {
        console.error("Leaflet initialization failed:", err);
        const errMsg = err instanceof Error ? err.message : "Failed to load Leaflet map.";
        setInitError(errMsg);
        if (onError) onError(err instanceof Error ? err : new Error(errMsg));
      }
    }

    initLeaflet();

    return () => {
      isMounted = false;
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        circleRef.current = null;
        centerMarkerRef.current = null;
        poiLayerRef.current = null;
      }
    };
  }, []);

  // Update center marker and radius circle
  useEffect(() => {
    if (!mapLoaded || !mapInstanceRef.current) return;

    const map = mapInstanceRef.current;

    async function updateCenterAndRadius() {
      const L = (await import("leaflet")).default;
      const radiusMeters = radiusKm * 1000;

      // 1. Center Marker (ShelfCash distinctive Target icon)
      if (centerMarkerRef.current) {
        centerMarkerRef.current.remove();
      }

      const centerHtml = `
        <div class="leaflet-center-marker ${center.source === "store" ? "store-center" : "survey-center"}">
          <div class="center-pulse"></div>
          <div class="center-dot">◎</div>
        </div>
      `;

      const centerIcon = L.divIcon({
        className: "custom-leaflet-marker",
        html: centerHtml,
        iconSize: [36, 36],
        iconAnchor: [18, 18],
      });

      const popupHtml = `
        <div class="leaflet-opp-popup">
          <div class="popup-title">${center.source === "store" ? "ShelfCash Flagship Coffee & Tea" : "Vị trí khảo sát"}</div>
          <div class="popup-subtitle">${center.label || "Điểm phân tích cơ hội"}</div>
          ${center.address ? `<div class="popup-address">${center.address}</div>` : ""}
          <div class="popup-badge">${center.source === "store" ? "Cửa hàng hiện tại" : "Tọa độ khảo sát"}</div>
        </div>
      `;

      const marker = L.marker([center.lat, center.lng], {
        icon: centerIcon,
        zIndexOffset: 1000,
      }).bindPopup(popupHtml);

      marker.addTo(map);
      centerMarkerRef.current = marker;

      // 2. Geographic Radius Circle
      if (circleRef.current) {
        circleRef.current.remove();
      }

      const circle = L.circle([center.lat, center.lng], {
        radius: radiusMeters,
        color: "#10b981", // ShelfCash green border
        weight: 2,
        opacity: 0.85,
        fillColor: "#10b981",
        fillOpacity: 0.08,
      }).addTo(map);

      circleRef.current = circle;

      // Immediate radar sync with the newly added circle
      updateRadarGeometryRef.current();

      // Smooth pan / fit bounds
      map.flyToBounds(circle.getBounds(), {
        padding: [30, 30],
        duration: 0.75,
      });

      // Update radar geometry precisely when fly animation completes
      map.once("moveend", () => {
        updateRadarGeometryRef.current();
      });

      // Fallback timer to ensure exact geometry after animation settles
      setTimeout(() => {
        updateRadarGeometryRef.current();
      }, 800);
    }

    updateCenterAndRadius();
  }, [mapLoaded, center.lat, center.lng, center.label, center.address, center.source, radiusKm]);

  // Update POI markers on map: incrementally add newly discovered POIs without destroying existing ones
  useEffect(() => {
    if (!mapLoaded || !poiLayerRef.current) return;

    let isCancelled = false;

    async function updatePois() {
      const L = (await import("leaflet")).default;
      const layer = poiLayerRef.current;
      if (!layer || isCancelled) return;

      const currentMarkerMap = poiMarkersMapRef.current;

      // Only render POIs that have been discovered by the radar
      const visiblePois = inRadiusPoisWithBearing.filter((poi) =>
        revealedPoiIds.has(poi.id)
      );
      const visiblePoiIdSet = new Set(visiblePois.map((p) => p.id));

      // 1. Remove markers that are no longer in visible set (e.g. on reset or filter change)
      for (const [id, marker] of currentMarkerMap.entries()) {
        if (!visiblePoiIdSet.has(id)) {
          layer.removeLayer(marker);
          currentMarkerMap.delete(id);
        }
      }

      // 2. Incrementally add newly discovered POIs and update filter styling without re-creating DOM
      visiblePois.forEach((poi) => {
        const isMatch = !activeCategoryFilter || activeCategoryFilter === poi.category;

        if (currentMarkerMap.has(poi.id)) {
          const existingMarker = currentMarkerMap.get(poi.id)!;
          existingMarker.setOpacity(isMatch ? 1 : 0.25);
          existingMarker.setZIndexOffset(isMatch ? 500 : 100);

          const el = existingMarker.getElement();
          if (el) {
            const markerDiv = el.querySelector(".leaflet-poi-marker");
            if (markerDiv) {
              markerDiv.classList.toggle("poi-visible", isMatch);
              markerDiv.classList.toggle("poi-dimmed", !isMatch);
            }
          }
          return;
        }

        const catConfig = CATEGORY_COLORS[poi.category] || {
          bg: "#6b7280",
          border: "#374151",
          text: "#ffffff",
          label: "Địa điểm",
        };

        const opacityClass = isMatch ? "poi-visible" : "poi-dimmed";

        const markerHtml = `
          <div class="leaflet-poi-marker ${opacityClass}" style="--poi-color: ${catConfig.bg}; --poi-border: ${catConfig.border};">
            <div class="poi-pin-circle">
              <span class="poi-initial">${poi.category[0].toUpperCase()}</span>
            </div>
          </div>
        `;

        const poiIcon = L.divIcon({
          className: "custom-leaflet-poi",
          html: markerHtml,
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        });

        const popupHtml = `
          <div class="leaflet-opp-popup poi-popup">
            <div class="popup-title">${poi.name}</div>
            <div class="popup-category" style="color: ${catConfig.bg}; font-weight: 600;">
              ${catConfig.label}
            </div>
            <div class="popup-distance">Khoảng cách: <strong>${formatDistance(poi.distanceMeters)}</strong></div>
          </div>
        `;

        const marker = L.marker([poi.lat, poi.lng], {
          icon: poiIcon,
          opacity: isMatch ? 1 : 0.25,
          zIndexOffset: isMatch ? 500 : 100,
        }).bindPopup(popupHtml);

        layer.addLayer(marker);
        currentMarkerMap.set(poi.id, marker);
      });
    }

    updatePois();

    return () => {
      isCancelled = true;
    };
  }, [mapLoaded, inRadiusPoisWithBearing, revealedPoiIds, activeCategoryFilter]);

  // Window resize handler
  useEffect(() => {
    const handleResize = () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.invalidateSize();
        updateRadarGeometry();
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [updateRadarGeometry]);

  return (
    <div className="relative w-full h-full min-h-[420px] rounded-xl overflow-hidden border border-slate-200 shadow-inner bg-slate-100 flex flex-col">
      {initError && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-red-50/90 p-4 text-center">
          <div className="text-red-700 text-sm max-w-sm">
            <p className="font-semibold">Lỗi khởi tạo bản đồ OpenStreetMap</p>
            <p className="mt-1 text-xs">{initError}</p>
          </div>
        </div>
      )}

      {/* Map Canvas */}
      <div
        ref={containerRef}
        id="osm-opportunity-map-container"
        className="w-full flex-1 min-h-[420px] z-0"
      />

      {/* Radar Overlay: STRICTLY CLIPPED INSIDE GEOGRAPHIC CIRCLE */}
      {isScanning && radarGeometry && (
        <div
          className="absolute pointer-events-none z-20 overflow-hidden"
          style={{
            left: `${radarGeometry.x - radarGeometry.radiusPx}px`,
            top: `${radarGeometry.y - radarGeometry.radiusPx}px`,
            width: `${radarGeometry.radiusPx * 2}px`,
            height: `${radarGeometry.radiusPx * 2}px`,
            borderRadius: "50%",
            boxShadow: "0 0 0 1px rgba(16, 185, 129, 0.4)",
          }}
          aria-hidden="true"
        >
          {/* Rotating Sweep Beam with Trailing Wedge inside clipped container */}
          <div
            className="opp-leaflet-radar-sweep"
            style={{
              transform: `rotate(${sweepAngle}deg)`,
            }}
          >
            {/* Crisp leading scanner ray / thanh radar */}
            <div className="opp-leaflet-radar-beam-line" />
          </div>
        </div>
      )}

      {/* Scanning status banner */}
      {isScanning && (
        <div className="absolute top-4 left-4 z-30 bg-emerald-900/90 backdrop-blur-md text-emerald-100 px-3.5 py-1.5 rounded-full text-xs font-medium border border-emerald-500/40 flex items-center gap-2.5 shadow-lg">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping shrink-0" />
          <span>
            Đang quét khu vực {radiusKm} km...{" "}
            <strong>
              {revealedPoiIds.size} / {inRadiusPoisWithBearing.length} điểm
            </strong>
          </span>
        </div>
      )}

      {/* Map Interactive Hint & Legend bar */}
      <div className="absolute bottom-2 left-2 z-10 bg-white/90 backdrop-blur-sm px-2.5 py-1 rounded shadow-sm border border-slate-200/80 text-[11px] text-slate-600 flex items-center gap-3">
        <span className="flex items-center gap-1 font-medium text-emerald-700">
          <span className="w-2.5 h-2.5 rounded-full border-2 border-emerald-600 bg-emerald-200 inline-block" />
          Bán kính {radiusKm} km
        </span>
        <span className="text-slate-400">|</span>
        <span>
          {revealedPoiIds.size > 0
            ? `${revealedPoiIds.size} địa điểm phát hiện`
            : "Chưa quét khu vực"}
        </span>
        <span className="text-slate-400">|</span>
        <span>Click map để chọn vị trí mới</span>
      </div>
    </div>
  );
}

