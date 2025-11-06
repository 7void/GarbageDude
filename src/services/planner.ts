import type { Bin, Picker, PlannedRouteResult, PlannedRouteSegment, RoutePlanSettings } from '../types'

function haversineKm(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
  const R = 6371
  const dLat = (b.latitude - a.latitude) * Math.PI / 180
  const dLon = (b.longitude - a.longitude) * Math.PI / 180
  const lat1 = a.latitude * Math.PI / 180
  const lat2 = b.latitude * Math.PI / 180
  const sinDLat = Math.sin(dLat / 2)
  const sinDLon = Math.sin(dLon / 2)
  const c = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon
  const d = 2 * Math.atan2(Math.sqrt(c), Math.sqrt(1 - c))
  return R * d
}

export function planRouteForPicker(picker: Picker, bins: Bin[], settings: RoutePlanSettings): PlannedRouteResult {
  const { maxBins, maxDistanceKm, weights } = settings

  const available = bins.slice()
  let current = { latitude: picker.latitude, longitude: picker.longitude }
  const order: PlannedRouteSegment[] = []
  let totalDistanceKm = 0

  const remainingCapacity = () => Math.max(0, picker.capacityLiters - picker.currentLoadLiters - order.reduce((acc, seg) => {
    const b = bins.find(x => x.id === seg.binId)
    return acc + (b ? b.capacityLiters * b.fillLevel : 0)
  }, 0))

  const score = (b: Bin) => {
    const d = haversineKm(current, b)
    const fill = b.fillLevel // 0-1
    const imp = b.areaImportance // 0-1
    const distPenalty = 1 / (1 + d) // closer -> higher value
    return weights.weightFill * fill + weights.weightImportance * imp + weights.weightDistance * distPenalty
  }

  while (available.length && order.length < maxBins) {
    // filter out bins that would overflow capacity massively (simple heuristic)
    const cap = remainingCapacity()
    const candidates = available.filter(b => (b.capacityLiters * b.fillLevel) <= (cap + 100))
    if (!candidates.length) break

    candidates.sort((a, b) => score(b) - score(a))
    const next = candidates[0]
    const dKm = haversineKm(current, next)
    if (maxDistanceKm != null && totalDistanceKm + dKm > maxDistanceKm) break

    totalDistanceKm += dKm
    order.push({ binId: next.id, coordinate: [next.longitude, next.latitude], distanceFromPrevKm: dKm })
    current = next
    const ix = available.findIndex(b => b.id === next.id)
    available.splice(ix, 1)
  }

  // Estimate time from average speed (kmph)
  const avgSpeed = Math.max(5, picker.speedKmph || 15)
  const estimatedTimeMin = (totalDistanceKm / avgSpeed) * 60

  const coordinates = [[picker.longitude, picker.latitude], ...order.map(s => s.coordinate)]

  return {
    pickerId: picker.id,
    order,
    totalDistanceKm,
    estimatedTimeMin,
    lineString: {
      type: 'LineString',
      coordinates,
    },
  }
}
