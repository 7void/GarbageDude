// src/types.ts

// Smart Waste Management domain types

export interface LatLng {
  latitude: number
  longitude: number
}

export interface Bin extends LatLng {
  id: string
  name: string
  // 0.0 - 1.0 (0% empty, 100% full)
  fillLevel: number
  // 0.0 - 1.0 (relative importance of the area)
  areaImportance: number
  capacityLiters: number
  lastUpdated: Date
}

export interface Picker extends LatLng {
  id: string
  name: string
  capacityLiters: number
  currentLoadLiters: number
  speedKmph: number
}

export interface WeightSettings {
  weightFill: number // influence of bin fill level
  weightImportance: number // influence of area importance
  weightDistance: number // penalty by distance from picker (higher = more penalty)
}

export interface RoutePlanSettings {
  maxBins: number
  maxDistanceKm?: number
  weights: WeightSettings
}

export interface PlannedRouteSegment {
  binId: string
  coordinate: [number, number] // [longitude, latitude]
  distanceFromPrevKm: number
}

export interface PlannedRouteResult {
  pickerId: string
  order: PlannedRouteSegment[]
  totalDistanceKm: number
  estimatedTimeMin: number
  lineString: GeoJSON.LineString
}

export type GeoJSONLineString = GeoJSON.LineString
