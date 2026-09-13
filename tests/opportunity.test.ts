import assert from "node:assert/strict";
import test from "node:test";
import {
  getGoogleMapsApiKey,
  getOpportunityConfig,
  getOpportunityMapProvider,
  getOpportunityMode,
  isOpportunityEnabled,
} from "../lib/opportunity/config";
import { getOpportunityService } from "../lib/opportunity/service";
import { OpportunityPreviewService } from "../lib/opportunity/preview-service";
import { OpportunityApiService } from "../lib/opportunity/api-service";
import {
  CANONICAL_PREVIEW_POIS,
  DEFAULT_STORE_LOCATION,
  PREVIEW_CANDIDATE_CATALOG,
  PREVIEW_LOCAL_CONTEXT,
  generatePreviewPoisForLocation,
} from "../lib/opportunity/candidate-catalog";
import type { OpportunityAnalysisLocation } from "../lib/opportunity/types";

test("Opportunity Config parser handles 3-state mode and safe fallback", () => {
  const originalEnv = process.env.NEXT_PUBLIC_SHELFCASH_OPPORTUNITY_MODE;

  try {
    process.env.NEXT_PUBLIC_SHELFCASH_OPPORTUNITY_MODE = "preview";
    assert.equal(getOpportunityMode(), "preview");
    assert.equal(isOpportunityEnabled(), true);

    process.env.NEXT_PUBLIC_SHELFCASH_OPPORTUNITY_MODE = "live";
    assert.equal(getOpportunityMode(), "live");
    assert.equal(isOpportunityEnabled(), true);

    process.env.NEXT_PUBLIC_SHELFCASH_OPPORTUNITY_MODE = "disabled";
    assert.equal(getOpportunityMode(), "disabled");
    assert.equal(isOpportunityEnabled(), false);

    // Unknown or empty falls back safely to disabled
    process.env.NEXT_PUBLIC_SHELFCASH_OPPORTUNITY_MODE = "unknown_xyz";
    assert.equal(getOpportunityMode(), "disabled");
    assert.equal(isOpportunityEnabled(), false);

    delete process.env.NEXT_PUBLIC_SHELFCASH_OPPORTUNITY_MODE;
    assert.equal(getOpportunityMode(), "disabled");
    assert.equal(isOpportunityEnabled(), false);
  } finally {
    process.env.NEXT_PUBLIC_SHELFCASH_OPPORTUNITY_MODE = originalEnv;
  }
});

test("Opportunity Config parser handles map provider and browser API key safely", () => {
  const origViteProvider = process.env.VITE_SHELFCASH_MAP_PROVIDER;
  const origNextProvider = process.env.NEXT_PUBLIC_SHELFCASH_MAP_PROVIDER;
  const origViteKey = process.env.VITE_GOOGLE_MAPS_API_KEY;
  const origNextKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  try {
    // 1. OSM Provider via VITE_
    process.env.VITE_SHELFCASH_MAP_PROVIDER = "osm";
    delete process.env.NEXT_PUBLIC_SHELFCASH_MAP_PROVIDER;
    assert.equal(getOpportunityMapProvider(), "osm");
    let cfg = getOpportunityConfig();
    assert.equal(cfg.mapProvider, "osm");

    // 2. Google Provider with key
    process.env.VITE_SHELFCASH_MAP_PROVIDER = "google";
    process.env.VITE_GOOGLE_MAPS_API_KEY = "test-fake-key-12345";
    assert.equal(getOpportunityMapProvider(), "google");
    assert.equal(getGoogleMapsApiKey(), "test-fake-key-12345");

    cfg = getOpportunityConfig();
    assert.equal(cfg.mapProvider, "google");
    assert.equal(cfg.googleMapsApiKeyAvailable, true);
    assert.equal(cfg.googleMapsApiKey, "test-fake-key-12345");

    // 3. Missing key for google -> key available is false
    delete process.env.VITE_GOOGLE_MAPS_API_KEY;
    delete process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    cfg = getOpportunityConfig();
    assert.equal(cfg.mapProvider, "google");
    assert.equal(cfg.googleMapsApiKeyAvailable, false);
    assert.equal(cfg.googleMapsApiKey, undefined);

    // 4. None provider
    process.env.VITE_SHELFCASH_MAP_PROVIDER = "none";
    assert.equal(getOpportunityMapProvider(), "none");
    cfg = getOpportunityConfig();
    assert.equal(cfg.mapProvider, "none");

    // 5. Invalid provider falls back to osm
    process.env.VITE_SHELFCASH_MAP_PROVIDER = "bing_or_mapbox";
    assert.equal(getOpportunityMapProvider(), "osm");
    cfg = getOpportunityConfig();
    assert.equal(cfg.mapProvider, "osm");
  } finally {
    process.env.VITE_SHELFCASH_MAP_PROVIDER = origViteProvider;
    process.env.NEXT_PUBLIC_SHELFCASH_MAP_PROVIDER = origNextProvider;
    process.env.VITE_GOOGLE_MAPS_API_KEY = origViteKey;
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY = origNextKey;
  }
});

test("Opportunity Service factory resolves proper adapter according to mode", () => {
  const previewService = getOpportunityService("preview");
  assert.ok(previewService instanceof OpportunityPreviewService);

  const liveService = getOpportunityService("live");
  assert.ok(liveService instanceof OpportunityApiService);

  const disabledFallbackService = getOpportunityService("disabled");
  assert.ok(disabledFallbackService instanceof OpportunityPreviewService);
});

test("Opportunity Preview Service creates run and builds deterministic portfolio under budget", async () => {
  const service = new OpportunityPreviewService();

  const run = await service.createRun({
    storeId: "STORE_001",
    storeName: "ShelfCash Flagship Coffee",
    radiusKm: 3,
    trialBudget: 2000000,
  });

  assert.ok(run.runId.startsWith("opp-run-"));
  assert.equal(run.storeId, "STORE_001");
  assert.equal(run.radiusKm, 3);
  assert.equal(run.trialBudget, 2000000);
  assert.equal(run.status, "scanning");
  assert.equal(run.totalPoisCount, 20);

  // Directly build result from run to verify portfolio optimization
  const result = service.buildResult(run);

  assert.equal(result.status, "completed");
  assert.equal(result.localContext.radiusKm, 3);
  assert.equal(result.localContext.metrics.length, 4);
  assert.equal(result.rankedCandidates.length, PREVIEW_CANDIDATE_CATALOG.length);

  // Verification of portfolio under 2.000.000 budget
  // Canonical bundle: #2 Cà Phê Muối (560k) + #5 Croissant Hạnh Nhân (750k) = 1.310k <= 2.000k
  assert.equal(result.trialPortfolio.budget, 2000000);
  assert.equal(result.trialPortfolio.allocatedCost, 1310000);
  assert.equal(result.trialPortfolio.remainingBudget, 690000);
  assert.equal(result.trialPortfolio.candidateCount, 2);

  const selectedItems = result.trialPortfolio.items.filter((i) => i.selected);
  assert.equal(selectedItems.length, 2);
  assert.equal(selectedItems[0]?.candidateName, "Cà Phê Muối Biển");
  assert.equal(selectedItems[1]?.candidateName, "Bánh Croissant Hạnh Nhân");
});

test("Store Location vs Analysis Location: custom location search does not mutate store identity", async () => {
  const service = new OpportunityPreviewService();

  assert.equal(DEFAULT_STORE_LOCATION.label, "ShelfCash Flagship Coffee");
  assert.equal(DEFAULT_STORE_LOCATION.source, "store");

  const customLocation: OpportunityAnalysisLocation = {
    lat: 10.7937,
    lng: 106.7219,
    label: "Landmark 81",
    address: "720A Điện Biên Phủ, Phường 22, Bình Thạnh, TP. Hồ Chí Minh",
    source: "search",
  };

  const run = await service.createRun({
    storeId: "STORE_001",
    storeName: "ShelfCash Flagship Coffee",
    analysisLocation: customLocation,
    radiusKm: 3,
    trialBudget: 2000000,
  });

  assert.equal(run.storeId, "STORE_001");
  assert.equal(run.storeName, "ShelfCash Flagship Coffee");
  assert.equal(run.analysisLocation?.label, "Landmark 81");
  assert.equal(run.analysisLocation?.source, "search");

  const result = service.buildResult(run);
  assert.equal(result.analysisLocation?.label, "Landmark 81");
  assert.equal(result.analysisLocation?.source, "search");
  assert.equal(result.storeId, "STORE_001");
});

test("POI Normalization & Local Context Invariant: metric cards count matches POI markers exactly", () => {
  assert.equal(CANONICAL_PREVIEW_POIS.length, 20);

  const competitors = CANONICAL_PREVIEW_POIS.filter((p) => p.category === "competitor");
  const universities = CANONICAL_PREVIEW_POIS.filter((p) => p.category === "university");
  const transit = CANONICAL_PREVIEW_POIS.filter((p) => p.category === "transit");
  const retail = CANONICAL_PREVIEW_POIS.filter((p) => p.category === "supporting_retail");

  assert.equal(competitors.length, 8);
  assert.equal(universities.length, 4);
  assert.equal(transit.length, 3);
  assert.equal(retail.length, 5);

  // Invariant verification on PREVIEW_LOCAL_CONTEXT
  const metricMap: Record<string, number> = {};
  PREVIEW_LOCAL_CONTEXT.metrics.forEach((m) => {
    metricMap[m.key] = m.count;
  });

  assert.equal(metricMap.competitor, 8);
  assert.equal(metricMap.university, 4);
  assert.equal(metricMap.transit, 3);
  assert.equal(metricMap.supporting_retail, 5);
});

test("generatePreviewPoisForLocation creates POIs relative to new center deterministically", () => {
  const customCenter: OpportunityAnalysisLocation = {
    lat: 10.7719,
    lng: 106.6983,
    label: "Chợ Bến Thành",
    source: "search",
  };

  const pois = generatePreviewPoisForLocation(customCenter, 3);
  assert.equal(pois.length, 20);
  // Center check: POIs should be clustered around customCenter
  const avgLat = pois.reduce((acc, p) => acc + p.lat, 0) / pois.length;
  const avgLng = pois.reduce((acc, p) => acc + p.lng, 0) / pois.length;

  assert.ok(Math.abs(avgLat - customCenter.lat) < 0.05);
  assert.ok(Math.abs(avgLng - customCenter.lng) < 0.05);
});

test("Opportunity Candidate Catalog maintains proper evidence, why paths, and boundaries", () => {
  assert.ok(PREVIEW_CANDIDATE_CATALOG.length >= 5);

  const top1 = PREVIEW_CANDIDATE_CATALOG[0];
  assert.equal(top1.name, "Trà Lài");
  assert.equal(top1.opportunityScore, 0.82);
  assert.equal(top1.domain, "same_domain");
  assert.ok(top1.whyPath.length >= 5);
  assert.ok(top1.reusableIngredients.length > 0);
});

test("Geo-utils calculates Haversine distance and formats distance correctly", async () => {
  const { calculateDistanceMeters, formatDistance } = await import(
    "../lib/opportunity/map/geo-utils"
  );

  // Distance between 268 Ly Thuong Kiet (10.7725, 106.6578) and 279 Nguyen Tri Phuong (10.7749, 106.6635)
  // Approximate straight-line distance is ~680m
  const dist = calculateDistanceMeters(10.7725, 106.6578, 10.7749, 106.6635);
  assert.ok(dist > 600 && dist < 750, `Distance ${dist} is within expected ~680m`);

  assert.equal(formatDistance(450), "450 m");
  assert.equal(formatDistance(1200), "1,2 km");
  assert.equal(formatDistance(3000), "3,0 km");
});

test("OSM tag rules classify POIs correctly into 4 opportunity categories", async () => {
  const { classifyOsmElement } = await import(
    "../lib/opportunity/map/osm-category-rules"
  );

  // Competitor
  assert.equal(classifyOsmElement({ amenity: "cafe" }), "competitor");
  assert.equal(classifyOsmElement({ amenity: "bubble_tea" }), "competitor");
  assert.equal(classifyOsmElement({ shop: "coffee" }), "competitor");

  // University / School
  assert.equal(classifyOsmElement({ amenity: "university" }), "university");
  assert.equal(classifyOsmElement({ amenity: "school" }), "university");
  assert.equal(classifyOsmElement({ building: "college" }), "university");

  // Transit
  assert.equal(classifyOsmElement({ highway: "bus_stop" }), "transit");
  assert.equal(classifyOsmElement({ amenity: "bus_station" }), "transit");
  assert.equal(classifyOsmElement({ railway: "subway_entrance" }), "transit");

  // Supporting Retail
  assert.equal(classifyOsmElement({ shop: "convenience" }), "supporting_retail");
  assert.equal(classifyOsmElement({ shop: "supermarket" }), "supporting_retail");
  assert.equal(classifyOsmElement({ shop: "mall" }), "supporting_retail");

  // Unrelated
  assert.equal(classifyOsmElement({ amenity: "hospital" }), null);
  assert.equal(classifyOsmElement({ shop: "hardware" }), null);
});

test("calculateBearingDegrees returns correct angles for cardinal directions", async () => {
  const { calculateBearingDegrees } = await import(
    "../lib/opportunity/map/geo-utils"
  );

  const centerLat = 10.0;
  const centerLng = 106.0;

  // Due North (same lon, higher lat) -> ~0°
  const northBearing = calculateBearingDegrees(centerLat, centerLng, centerLat + 0.1, centerLng);
  assert.ok(Math.abs(northBearing - 0) < 1 || Math.abs(northBearing - 360) < 1);

  // Due East (higher lon, same lat) -> ~90°
  const eastBearing = calculateBearingDegrees(centerLat, centerLng, centerLat, centerLng + 0.1);
  assert.ok(Math.abs(eastBearing - 90) < 2);

  // Due South (same lon, lower lat) -> ~180°
  const southBearing = calculateBearingDegrees(centerLat, centerLng, centerLat - 0.1, centerLng);
  assert.ok(Math.abs(southBearing - 180) < 1);

  // Due West (lower lon, same lat) -> ~270°
  const westBearing = calculateBearingDegrees(centerLat, centerLng, centerLat, centerLng - 0.1);
  assert.ok(Math.abs(westBearing - 270) < 2);
});

