import { useMemo, useRef, useState } from 'react'
import Map, { Layer, Marker, Popup, Source } from 'react-map-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import type { Bin, Picker, PlannedRouteResult } from '../types'
import BinIcon from './icons/BinIcon'

interface WasteMapProps {
  bins: Bin[]
  pickers: Picker[]
  route?: PlannedRouteResult | null
  simPosition?: [number, number] | null // [lon, lat]
  simDistanceMeters?: number
  // When provided and simulation is running, keep the camera centered here
  followCenter?: [number, number] | null
  simRunning?: boolean
}

export default function WasteMap({ bins, pickers, route, simPosition, simDistanceMeters = 0, followCenter, simRunning }: WasteMapProps) {
  const mapToken = import.meta.env.VITE_MAPBOX_TOKEN || ''
  const mapRef = useRef<any>(null)
  const [popup, setPopup] = useState<{ type: 'bin' | 'picker'; id: string } | null>(null)

  // Normalize color strings and allow 8-digit hex (#RRGGBBAA)
  const normalizeColor = (c?: string) => {
    if (!c) return '#1e3a8a'
    const m = c.match(/^#([0-9a-fA-F]{8})$/)
    if (m) {
      const hex = m[1]
      const r = parseInt(hex.slice(0, 2), 16)
      const g = parseInt(hex.slice(2, 4), 16)
      const b = parseInt(hex.slice(4, 6), 16)
      const a = parseInt(hex.slice(6, 8), 16) / 255
      return `rgba(${r},${g},${b},${a.toFixed(3)})`
    }
    return c
  }
  const routeColor = normalizeColor((import.meta as any).env?.VITE_ROUTE_COLOR || '#6787e2ff')

  const center = useMemo(() => {
    if (pickers.length) return { longitude: pickers[0].longitude, latitude: pickers[0].latitude, zoom: 12 }
    if (bins.length) return { longitude: bins[0].longitude, latitude: bins[0].latitude, zoom: 12 }
    return { longitude: 80.1534, latitude: 12.8406, zoom: 12 } // V
  }, [bins, pickers])

  // If sim is running, split the route into covered and remaining parts
  const routeSource = useMemo(() => {
    if (!route) return null
    const ls = route.lineString
    if (!ls?.coordinates?.length) return null
    if (!simPosition || !simDistanceMeters) {
      return { type: 'Feature', geometry: ls, properties: {} } as any
    }
    // Build remaining segment by trimming from the start according to simDistanceMeters
    const remainingCoords: [number, number][] = []
    let remaining = simDistanceMeters / 1000 // km
    for (let i = 0; i < ls.coordinates.length - 1; i++) {
      const a = ls.coordinates[i] as [number, number]
      const b = ls.coordinates[i + 1] as [number, number]
      const segKm = haversineKm({ latitude: a[1], longitude: a[0] }, { latitude: b[1], longitude: b[0] })
      if (remaining > segKm) {
        remaining -= segKm
        continue
      } else {
        // Interpolate point within this segment
        const t = segKm === 0 ? 0 : (remaining / segKm)
        const cutLon = a[0] + (b[0] - a[0]) * t
        const cutLat = a[1] + (b[1] - a[1]) * t
        remainingCoords.push([cutLon, cutLat])
        // Push the rest of the coordinates from i+1
        for (let j = i + 1; j < ls.coordinates.length; j++) {
          remainingCoords.push(ls.coordinates[j] as [number, number])
        }
        break
      }
    }
    const geometry = remainingCoords.length ? { type: 'LineString', coordinates: remainingCoords } : { type: 'LineString', coordinates: [] }
    return { type: 'Feature', geometry, properties: {} } as any
  }, [route, simPosition, simDistanceMeters])

  // Center camera to follow the picker while sim is running
  useMemo(() => {
    if (!simRunning) return
    if (!followCenter) return
    const map = (mapRef as any)?.current?.getMap ? (mapRef as any).current.getMap() : (mapRef as any).current
    if (!map) return
    try {
      const [lon, lat] = followCenter
      const currentCenter = map.getCenter?.()
      const dx = currentCenter ? Math.abs(currentCenter.lng - lon) : Infinity
      const dy = currentCenter ? Math.abs(currentCenter.lat - lat) : Infinity
      // Only recenter if moved meaningfully to avoid spamming
      if (dx > 0.00005 || dy > 0.00005) {
        const zoom = map.getZoom?.() ?? 14
        map.easeTo({ center: [lon, lat], zoom, duration: 250 })
      }
    } catch { /* noop */ }
  }, [followCenter, simRunning])

  return (
    <div className="relative w-full h-full rounded overflow-hidden">
      <Map
        ref={mapRef}
        initialViewState={center}
        mapStyle="mapbox://styles/mapbox/streets-v12"
        mapboxAccessToken={mapToken}
        attributionControl={false}
        style={{ width: '100%', height: '100%' }}
        onClick={() => setPopup(null)}
      >
        {routeSource && (
          <Source id="route" type="geojson" data={routeSource}>
            <Layer id="route-line" type="line" layout={{ 'line-cap': 'round', 'line-join': 'round' }} paint={{ 'line-color': routeColor, 'line-width': 5, 'line-opacity': 0.95 }} />
          </Source>
        )}

        {/* Simulation marker removed; we move the actual picker now */}

        {pickers.map(p => (
          <Marker key={p.id} longitude={p.longitude} latitude={p.latitude} anchor="center">
            <button
              onClick={(e) => { e.stopPropagation(); setPopup({ type: 'picker', id: p.id }) }}
              className="w-4 h-4 rounded-full bg-red-500 border-2 border-white shadow"
              style={{ boxShadow: '0 0 6px rgba(0,0,0,0.4)' }}
              title={p.name}
            />
          </Marker>
        ))}

        {bins.map(b => (
          <Marker key={b.id} longitude={b.longitude} latitude={b.latitude} anchor="bottom">
            <button
              onClick={(e) => { e.stopPropagation(); setPopup({ type: 'bin', id: b.id }) }}
              className="bg-transparent p-0 shadow-none"
              title={`${b.name}: ${(b.fillLevel * 100).toFixed(0)}%`}
              style={{ lineHeight: 0, padding: 0, background: 'transparent', border: 'none' }}
            >
              <BinIcon level={b.fillLevel} size={28} title={`${b.name}: ${(b.fillLevel * 100).toFixed(0)}%`} />
            </button>
          </Marker>
        ))}

        {popup && popup.type === 'bin' && (() => {
          const b = bins.find(x => x.id === popup.id)
          if (!b) return null
          return (
            <Popup longitude={b.longitude} latitude={b.latitude} anchor="top" onClose={() => setPopup(null)}>
              <div className="text-xs text-black">
                <div className="font-semibold">{b.name}</div>
                <div>Fill: {(b.fillLevel * 100).toFixed(0)}%</div>
                <div>Importance: {(b.areaImportance * 100).toFixed(0)}%</div>
                <div>Capacity: {b.capacityLiters} L</div>
              </div>
            </Popup>
          )
        })()}

        {popup && popup.type === 'picker' && (() => {
          const p = pickers.find(x => x.id === popup.id)
          if (!p) return null
          return (
            <Popup longitude={p.longitude} latitude={p.latitude} anchor="top" onClose={() => setPopup(null)}>
              <div className="text-xs text-black">
                <div className="font-semibold">{p.name}</div>
                <div>Capacity: {p.capacityLiters} L</div>
                <div>Load: {p.currentLoadLiters} L</div>
                <div>Speed: {p.speedKmph} km/h</div>
              </div>
            </Popup>
          )
        })()}
      </Map>
    </div>
  )
}

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
