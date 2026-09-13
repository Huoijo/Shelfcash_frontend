import type { OpportunityAnalysisLocation } from "../types";
import type { NominatimRawResult, NominatimSearchParams } from "./types";

const NOMINATIM_BASE_URL = "https://nominatim.openstreetmap.org";
const MIN_REQUEST_INTERVAL_MS = 1000;

// In-memory cache for search results
const searchCache = new Map<string, OpportunityAnalysisLocation[]>();
// In-memory cache for reverse geocoding
const reverseCache = new Map<string, { label: string; address?: string }>();

let lastRequestTime = 0;
let activeAbortController: AbortController | null = null;

async function throttleRequest(): Promise<void> {
  const now = Date.now();
  const timeSinceLast = now - lastRequestTime;
  if (timeSinceLast < MIN_REQUEST_INTERVAL_MS) {
    await new Promise((resolve) =>
      setTimeout(resolve, MIN_REQUEST_INTERVAL_MS - timeSinceLast)
    );
  }
  lastRequestTime = Date.now();
}

function normalizeQuery(query: string): string {
  return query.trim().toLowerCase();
}

function parseDisplayName(displayName: string, name?: string): { label: string; address: string } {
  const parts = displayName.split(",").map((p) => p.trim());
  const label = name || parts[0] || "Địa điểm khảo sát";
  const address = parts.slice(1).join(", ") || displayName;
  return { label, address };
}

/**
 * Searches locations using OpenStreetMap Nominatim.
 *
 * Requirements:
 * - Only triggered on explicit action (e.g. Enter or [Tìm] button)
 * - Rate limited to <= 1 req/sec
 * - Cached by normalized query
 * - Cancels obsolete in-flight requests
 * - Country bias: Vietnam (vn) by default
 */
export async function searchNominatimLocation(
  params: NominatimSearchParams
): Promise<OpportunityAnalysisLocation[]> {
  const query = params.query.trim();
  if (!query) return [];

  const cacheKey = `${normalizeQuery(query)}_${params.countryCode || "vn"}_${params.limit || 6}`;
  if (searchCache.has(cacheKey)) {
    return searchCache.get(cacheKey)!;
  }

  // Cancel any prior active search request
  if (activeAbortController) {
    activeAbortController.abort();
  }
  activeAbortController = new AbortController();
  const signal = params.signal || activeAbortController.signal;

  await throttleRequest();

  const url = new URL(`${NOMINATIM_BASE_URL}/search`);
  url.searchParams.set("q", query);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("limit", String(params.limit || 6));
  url.searchParams.set("countrycodes", params.countryCode || "vn");

  try {
    const res = await fetch(url.toString(), {
      signal,
      headers: {
        "Accept": "application/json",
        "Accept-Language": "vi,en;q=0.8",
        // Note: Browsers may restrict setting User-Agent directly in fetch, but it is compliant with standard client headers
      },
    });

    if (!res.ok) {
      throw new Error(`Nominatim error: ${res.status} ${res.statusText}`);
    }

    const rawData: NominatimRawResult[] = await res.json();

    const results: OpportunityAnalysisLocation[] = rawData.map((item, index) => {
      const lat = parseFloat(item.lat);
      const lng = parseFloat(item.lon);
      const { label, address } = parseDisplayName(item.display_name, item.name);

      return {
        id: `nominatim_${item.place_id || index}`,
        label,
        address,
        lat,
        lng,
        source: "search" as const,
      };
    });

    searchCache.set(cacheKey, results);
    return results;
  } catch (err: unknown) {
    if ((err as Error)?.name === "AbortError") {
      return [];
    }
    console.error("Nominatim search error:", err);
    throw err;
  }
}

/**
 * Reverse geocodes lat/lng into human-readable label and address.
 */
export async function reverseGeocodeNominatim(
  lat: number,
  lng: number
): Promise<{ label: string; address?: string }> {
  // Round to ~4 decimals (~11m resolution) for cache hit efficiency
  const roundedLat = lat.toFixed(4);
  const roundedLng = lng.toFixed(4);
  const cacheKey = `${roundedLat},${roundedLng}`;

  if (reverseCache.has(cacheKey)) {
    return reverseCache.get(cacheKey)!;
  }

  await throttleRequest();

  const url = new URL(`${NOMINATIM_BASE_URL}/reverse`);
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lon", String(lng));
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("addressdetails", "1");

  try {
    const res = await fetch(url.toString(), {
      headers: {
        "Accept": "application/json",
        "Accept-Language": "vi,en;q=0.8",
      },
    });

    if (!res.ok) {
      return {
        label: "Vị trí khảo sát",
        address: `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
      };
    }

    const item: NominatimRawResult = await res.json();
    const { label, address } = parseDisplayName(item.display_name, item.name);
    const result = { label, address };

    reverseCache.set(cacheKey, result);
    return result;
  } catch (err) {
    console.warn("Reverse geocoding failed, using coordinates fallback:", err);
    return {
      label: "Vị trí khảo sát",
      address: `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
    };
  }
}
