/** Great-circle distance between two coordinates, in kilometers. */
export function haversineDistanceKm(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
) {
  const R = 6371;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLon = ((b.longitude - a.longitude) * Math.PI) / 180;
  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;

  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);

  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/** Google Maps "Go to Location" deep link: the stored map URL if there is
 * one, otherwise a directions link built from coordinates. Null if neither
 * is available. */
export function buildGoToLocationUrl(input: {
  mapUrl?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}) {
  if (input.mapUrl) return input.mapUrl;
  if (input.latitude != null && input.longitude != null) {
    return `https://www.google.com/maps/dir/?api=1&destination=${input.latitude},${input.longitude}`;
  }
  return null;
}
