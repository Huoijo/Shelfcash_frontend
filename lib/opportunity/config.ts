export type OpportunityMode = "disabled" | "preview" | "live";

/**
 * Returns the current Opportunity feature mode based on NEXT_PUBLIC_SHELFCASH_OPPORTUNITY_MODE.
 * Safely falls back to "disabled" if undefined or unrecognized.
 */
export function getOpportunityMode(): OpportunityMode {
  const envMode = process.env.NEXT_PUBLIC_SHELFCASH_OPPORTUNITY_MODE?.trim().toLowerCase();
  if (envMode === "preview" || envMode === "live" || envMode === "disabled") {
    return envMode;
  }
  return "disabled";
}

export function isOpportunityEnabled(): boolean {
  const mode = getOpportunityMode();
  return mode === "preview" || mode === "live";
}
