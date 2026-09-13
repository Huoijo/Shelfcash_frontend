export type OpportunityMode = "disabled" | "preview" | "live";
export type OpportunityMapProvider = "none" | "osm" | "google";

export interface OpportunityConfig {
  mode: OpportunityMode;
  mapProvider: OpportunityMapProvider;
  googleMapsApiKeyAvailable: boolean;
  googleMapsApiKey?: string;
}

/**
 * Returns the current Opportunity feature mode based on VITE_SHELFCASH_OPPORTUNITY_MODE
 * or legacy NEXT_PUBLIC_SHELFCASH_OPPORTUNITY_MODE.
 * Safely falls back to "disabled" if undefined or unrecognized.
 */
export function getOpportunityMode(): OpportunityMode {
  const envMode = (
    process.env.VITE_SHELFCASH_OPPORTUNITY_MODE ||
    process.env.NEXT_PUBLIC_SHELFCASH_OPPORTUNITY_MODE
  )?.trim().toLowerCase();

  if (envMode === "preview" || envMode === "live" || envMode === "disabled") {
    return envMode;
  }
  return "disabled";
}

export function isOpportunityEnabled(): boolean {
  const mode = getOpportunityMode();
  return mode === "preview" || mode === "live";
}

/**
 * Returns the configured Opportunity Map Provider.
 * Supports: "none" | "osm" | "google".
 * Safely falls back to "none" if undefined or unrecognized.
 */
export function getOpportunityMapProvider(): OpportunityMapProvider {
  const envProvider = (
    process.env.VITE_SHELFCASH_MAP_PROVIDER ||
    process.env.NEXT_PUBLIC_SHELFCASH_MAP_PROVIDER
  )?.trim().toLowerCase();

  if (envProvider === "osm" || envProvider === "google" || envProvider === "none") {
    return envProvider;
  }
  return "osm";
}

/**
 * Returns the Google Maps browser key if present and non-empty.
 */
export function getGoogleMapsApiKey(): string | undefined {
  const key = (
    process.env.VITE_GOOGLE_MAPS_API_KEY ||
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
  )?.trim();
  return key && key.length > 0 ? key : undefined;
}

/**
 * Centralized, validated Opportunity configuration object.
 */
export function getOpportunityConfig(): OpportunityConfig {
  const mode = getOpportunityMode();
  const rawProvider = getOpportunityMapProvider();
  const apiKey = getGoogleMapsApiKey();
  const googleMapsApiKeyAvailable = Boolean(apiKey);

  return {
    mode,
    mapProvider: rawProvider,
    googleMapsApiKeyAvailable,
    googleMapsApiKey: apiKey,
  };
}
