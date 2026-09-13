import type { OpportunityPoi } from "../types";
import type { OverpassResponse, SearchNearbyPoisParams } from "./types";
import { classifyOsmElement, getFallbackPoiName } from "./osm-category-rules";
import { calculateDistanceMeters } from "./geo-utils";

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];

const OVERPASS_TIMEOUT_SECONDS = 15;

// In-memory cache for nearby POI scans
// Key: lat(3 decimals)_lng(3 decimals)_radiusMeters
const poiCache = new Map<string, OpportunityPoi[]>();

function getCacheKey(lat: number, lng: number, radiusMeters: number): string {
  return `${lat.toFixed(3)}_${lng.toFixed(3)}_${radiusMeters}`;
}

/**
 * Builds a single, unified Overpass QL query covering all 4 target POI categories:
 * - competitor (cafe, bubble tea, tea/coffee shops)
 * - university (university, college, school)
 * - transit (bus stop, bus station, subway, platform)
 * - supporting_retail (convenience, supermarket, mall)
 */
function buildOverpassQuery(lat: number, lng: number, radiusMeters: number): string {
  return `[out:json][timeout:${OVERPASS_TIMEOUT_SECONDS}];
(
  // 1. Competitor
  nwr["amenity"="cafe"](around:${radiusMeters},${lat},${lng});
  nwr["amenity"="bubble_tea"](around:${radiusMeters},${lat},${lng});
  nwr["shop"="coffee"](around:${radiusMeters},${lat},${lng});
  nwr["shop"="tea"](around:${radiusMeters},${lat},${lng});

  // 2. University / School
  nwr["amenity"="university"](around:${radiusMeters},${lat},${lng});
  nwr["amenity"="college"](around:${radiusMeters},${lat},${lng});
  nwr["amenity"="school"](around:${radiusMeters},${lat},${lng});

  // 3. Transit
  nwr["highway"="bus_stop"](around:${radiusMeters},${lat},${lng});
  nwr["amenity"="bus_station"](around:${radiusMeters},${lat},${lng});
  nwr["railway"="subway_entrance"](around:${radiusMeters},${lat},${lng});
  nwr["public_transport"="platform"](around:${radiusMeters},${lat},${lng});

  // 4. Supporting Retail
  nwr["shop"="convenience"](around:${radiusMeters},${lat},${lng});
  nwr["shop"="supermarket"](around:${radiusMeters},${lat},${lng});
  nwr["shop"="mall"](around:${radiusMeters},${lat},${lng});
);
out center qt 60;`;
}

/**
 * Searches nearby POIs using Overpass API with a single consolidated query.
 *
 * Requirements:
 * - Triggered ONLY on explicit scan action
 * - Bounded timeout (15s)
 * - Fallback endpoint if primary is busy/down
 * - Deduplicates elements by stable ID (type + id)
 * - Strictly filters by distance <= radiusMeters
 * - Caches result in memory for session reuse
 */
export async function searchNearbyOsmPois(
  params: SearchNearbyPoisParams
): Promise<OpportunityPoi[]> {
  const { lat, lng, radiusMeters } = params;
  const cacheKey = getCacheKey(lat, lng, radiusMeters);

  if (poiCache.has(cacheKey)) {
    return poiCache.get(cacheKey)!;
  }

  const query = buildOverpassQuery(lat, lng, radiusMeters);

  let lastError: unknown = null;

  for (const endpoint of OVERPASS_ENDPOINTS) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), (OVERPASS_TIMEOUT_SECONDS + 2) * 1000);

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Accept": "application/json",
        },
        body: `data=${encodeURIComponent(query)}`,
        signal: params.signal || controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Overpass HTTP error: ${response.status} ${response.statusText}`);
      }

      const data: OverpassResponse = await response.json();

      if (!data.elements || !Array.isArray(data.elements)) {
        throw new Error("Invalid Overpass response structure");
      }

      // Process and normalize
      const seenIds = new Set<string>();
      const normalizedPois: OpportunityPoi[] = [];

      for (const el of data.elements) {
        const stableId = `osm_${el.type}_${el.id}`;
        if (seenIds.has(stableId)) continue;
        seenIds.add(stableId);

        // Get coordinates (node has lat/lon, way/relation has center)
        const itemLat = el.lat ?? el.center?.lat;
        const itemLon = el.lon ?? el.center?.lon;
        if (typeof itemLat !== "number" || typeof itemLon !== "number") {
          continue;
        }

        const distanceMeters = calculateDistanceMeters(lat, lng, itemLat, itemLon);
        if (distanceMeters > radiusMeters) {
          continue;
        }

        const category = classifyOsmElement(el.tags);
        if (!category) continue;

        const rawName = el.tags?.name || el.tags?.["name:vi"] || el.tags?.["name:en"];
        const name = rawName || getFallbackPoiName(category, el.tags);

        normalizedPois.push({
          id: stableId,
          name,
          lat: itemLat,
          lng: itemLon,
          category,
          distanceMeters,
          provider: "osm",
          providerId: String(el.id),
        });
      }

      // Sort deterministically by distance ascending
      normalizedPois.sort((a, b) => a.distanceMeters - b.distanceMeters);

      poiCache.set(cacheKey, normalizedPois);
      return normalizedPois;
    } catch (err: unknown) {
      clearTimeout(timeoutId);
      lastError = err;
      if ((err as Error)?.name === "AbortError") {
        console.warn(`Overpass request to ${endpoint} timed out or was aborted.`);
      } else {
        console.warn(`Overpass request to ${endpoint} failed:`, err);
      }
      // Try next endpoint if available
    }
  }

  throw lastError || new Error("Không thể kết nối đến máy chủ bản đồ Overpass.");
}
