export interface NominatimRawResult {
  place_id: number;
  licence?: string;
  osm_type?: string;
  osm_id?: number;
  lat: string;
  lon: string;
  display_name: string;
  name?: string;
  type?: string;
  importance?: number;
  address?: {
    road?: string;
    suburb?: string;
    city_district?: string;
    city?: string;
    state?: string;
    country?: string;
    postcode?: string;
    [key: string]: string | undefined;
  };
}

export interface OverpassElement {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: {
    lat: number;
    lon: number;
  };
  tags?: Record<string, string>;
}

export interface OverpassResponse {
  version: number;
  generator: string;
  osm3s?: {
    timestamp_osm_base?: string;
    copyright?: string;
  };
  elements: OverpassElement[];
}

export interface SearchNearbyPoisParams {
  lat: number;
  lng: number;
  radiusMeters: number;
  signal?: AbortSignal;
}

export interface NominatimSearchParams {
  query: string;
  countryCode?: string;
  limit?: number;
  signal?: AbortSignal;
}
