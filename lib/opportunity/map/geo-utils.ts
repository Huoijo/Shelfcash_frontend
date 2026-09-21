/**
 * Geographic utility functions for distance calculation and formatting.
 */

const EARTH_RADIUS_METERS = 6371000; // Earth mean radius in meters

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * Calculates the great-circle distance between two geographic coordinates
 * using the Haversine formula.
 *
 * @param lat1 Latitude of point 1 in degrees
 * @param lon1 Longitude of point 1 in degrees
 * @param lat2 Latitude of point 2 in degrees
 * @param lon2 Longitude of point 2 in degrees
 * @returns Distance in meters
 */
export function calculateDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const radLat1 = toRadians(lat1);
  const radLat2 = toRadians(lat2);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(radLat1) * Math.cos(radLat2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(EARTH_RADIUS_METERS * c);
}

/**
 * Formats a distance in meters to a human-friendly Vietnamese string.
 * Examples: 480 m, 1.2 km, 3.5 km
 */
export function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `${meters} m`;
  }
  const km = (meters / 1000).toFixed(1).replace(".", ",");
  return `${km} km`;
}

function toDegrees(radians: number): number {
  return (radians * 180) / Math.PI;
}

/**
 * Calculates geographic bearing from center to target point in degrees.
 * Returns value between 0° and 360° where:
 * 0° = North, 90° = East, 180° = South, 270° = West.
 */
export function calculateBearingDegrees(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const dLon = toRadians(lon2 - lon1);
  const rLat1 = toRadians(lat1);
  const rLat2 = toRadians(lat2);

  const y = Math.sin(dLon) * Math.cos(rLat2);
  const x =
    Math.cos(rLat1) * Math.sin(rLat2) -
    Math.sin(rLat1) * Math.cos(rLat2) * Math.cos(dLon);

  const brng = toDegrees(Math.atan2(y, x));
  return Math.round(((brng + 360) % 360) * 10) / 10;
}

