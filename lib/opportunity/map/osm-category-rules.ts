import type { OpportunityPoiCategory } from "../types";

/**
 * Centralized OpenStreetMap tag classification rules for ShelfCash Opportunity Discovery.
 *
 * Rules:
 * - competitor: F&B coffee, tea, beverage, and dessert places (cafe, bubble_tea, coffee_shop, ice_cream)
 * - university: educational institutions (university, college, school)
 * - transit: public transit stops and stations (bus_stop, bus_station, subway_entrance, train_station, platform)
 * - supporting_retail: retail drivers (convenience, supermarket, mall, department_store)
 */

export function classifyOsmElement(
  tags?: Record<string, string>
): OpportunityPoiCategory | null {
  if (!tags) return null;

  const amenity = tags.amenity?.toLowerCase();
  const shop = tags.shop?.toLowerCase();
  const highway = tags.highway?.toLowerCase();
  const publicTransport = tags.public_transport?.toLowerCase();
  const railway = tags.railway?.toLowerCase();
  const building = tags.building?.toLowerCase();
  const cuisine = tags.cuisine?.toLowerCase();

  // 1. Competitor (Coffee, Tea, Beverage, F&B directly comparable)
  if (
    amenity === "cafe" ||
    amenity === "bubble_tea" ||
    amenity === "ice_cream" ||
    shop === "coffee" ||
    shop === "tea" ||
    shop === "beverages" ||
    (amenity === "fast_food" && (cuisine?.includes("coffee") || cuisine?.includes("tea")))
  ) {
    return "competitor";
  }

  // 2. University / School (Educational context)
  if (
    amenity === "university" ||
    amenity === "college" ||
    amenity === "school" ||
    building === "university" ||
    building === "college" ||
    building === "school"
  ) {
    return "university";
  }

  // 3. Transit (Bus, metro, station)
  if (
    highway === "bus_stop" ||
    amenity === "bus_station" ||
    railway === "subway_entrance" ||
    railway === "station" ||
    publicTransport === "station" ||
    publicTransport === "stop_position" ||
    publicTransport === "platform"
  ) {
    return "transit";
  }

  // 4. Supporting Retail (Convenience, supermarket, malls)
  if (
    shop === "convenience" ||
    shop === "supermarket" ||
    shop === "mall" ||
    shop === "department_store" ||
    amenity === "marketplace"
  ) {
    return "supporting_retail";
  }

  return null;
}

/**
 * Fallback name helper if OSM object lacks a clean name tag.
 */
export function getFallbackPoiName(
  category: OpportunityPoiCategory,
  tags?: Record<string, string>
): string {
  const brand = tags?.brand || tags?.operator;
  if (brand) return brand;

  switch (category) {
    case "competitor":
      return "Quán cà phê / Đồ uống";
    case "university":
      return "Cơ sở giáo dục / Trường học";
    case "transit":
      return "Trạm dừng / Điểm giao thông";
    case "supporting_retail":
      return "Cửa hàng bán lẻ / Siêu thị";
    default:
      return "Địa điểm xung quanh";
  }
}
