import type { GeoJSONLineString } from '../types'

export type RoadRoute = {
  lineString: GeoJSONLineString
  distanceKm: number
  durationMin: number
}

// Calls Mapbox Directions API to get a road-following route for given waypoints
// waypoints: array of [lon, lat]
export async function getRoadRoute(waypoints: [number, number][], profile: 'driving' | 'walking' | 'cycling' = 'driving'): Promise<RoadRoute> {
  const token = import.meta.env.VITE_MAPBOX_TOKEN
  if (!token) throw new Error('Missing VITE_MAPBOX_TOKEN')
  if (!waypoints || waypoints.length < 2) throw new Error('At least 2 waypoints required')

  const coords = waypoints.map(([lon, lat]) => `${lon},${lat}`).join(';')
  const url = `https://api.mapbox.com/directions/v5/mapbox/${profile}/${coords}?geometries=geojson&overview=full&steps=false&access_token=${encodeURIComponent(token)}`
  const res = await fetch(url)
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Directions failed (${res.status}): ${text || res.statusText}`)
  }
  const data = await res.json()
  const route = data?.routes?.[0]
  if (!route?.geometry) throw new Error('No route geometry returned')

  const lineString: GeoJSONLineString = route.geometry
  const distanceKm = typeof route.distance === 'number' ? route.distance / 1000 : 0
  const durationMin = typeof route.duration === 'number' ? route.duration / 60 : 0
  return { lineString, distanceKm, durationMin }
}
