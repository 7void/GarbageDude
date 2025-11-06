import { useEffect, useMemo, useRef, useState } from 'react'
import { SlidersHorizontal, RefreshCw, Route as RouteIcon, Recycle, Play, Pause, RotateCcw, Truck } from 'lucide-react'
import WasteMap from '../components/WasteMap'
import { useWasteData } from '../hooks/useWasteData'
import { connectSerial, type SerialController } from '../services/serial'
import { planRouteForPicker } from '../services/planner'
import { getRoadRoute } from '../services/routing'
import type { PlannedRouteResult, RoutePlanSettings } from '../types'

export default function WasteDashboard() {
  const { bins, pickers, randomizeBins, setBins, setPickers, pauseFillUpdates, setBin1Override } = useWasteData()
  const [weights, setWeights] = useState({ weightFill: 0.6, weightImportance: 0.3, weightDistance: 0.4 })
  const [maxBins, setMaxBins] = useState(6)
  const [maxDistanceKm, setMaxDistanceKm] = useState<number | undefined>(20)
  const [route, setRoute] = useState<PlannedRouteResult | null>(null)
  const [selectedPickerId, setSelectedPickerId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // Simulation state
  const [simRunning, setSimRunning] = useState(false)
  const [simSpeed, setSimSpeed] = useState(1) // 1x..30x
  const [simPosition, setSimPosition] = useState<[number, number] | null>(null)
  const [followPicker, setFollowPicker] = useState(true)
  // Track a simulation session lifecycle (from Start until End/Reset)
  const [simSessionActive, setSimSessionActive] = useState(false)
  const simDistRef = useRef(0) // meters progressed along the route
  const simLastTsRef = useRef<number | null>(null)
  const rafRef = useRef<number | null>(null)
  // Track which bins were picked and remember their original fill to restore later
  const pickedRef = useRef<Set<string>>(new Set())
  const originalFillRef = useRef<Map<string, number>>(new Map())
  const serialRef = useRef<SerialController | null>(null)
  const [serialStatus, setSerialStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected')
  const [serialError, setSerialError] = useState<string | null>(null)
  const [baudRate, setBaudRate] = useState<number>(9600)

  const picker = useMemo(() => {
    return pickers.find(p => p.id === selectedPickerId) || pickers[0]
  }, [pickers, selectedPickerId])

  const compute = async () => {
    if (!picker) return
    setBusy(true)
    try {
      const settings: RoutePlanSettings = { maxBins, maxDistanceKm, weights }
      const res = planRouteForPicker(picker, bins, settings)

      // Convert greedy order into waypoint list starting at picker location
      const waypoints: [number, number][] = [[picker.longitude, picker.latitude], ...res.order.map(s => s.coordinate)]

      // Fetch road-following geometry
      if (waypoints.length >= 2) {
        const rr = await getRoadRoute(waypoints, 'driving')
        setRoute({
          ...res,
          totalDistanceKm: rr.distanceKm,
          estimatedTimeMin: rr.durationMin,
          lineString: rr.lineString,
        })
      } else {
        setRoute(res)
      }
    } catch (e) {
      console.error('route compute failed', e)
      setRoute(null)
    } finally {
      setBusy(false)
    }
  }

  // Simulation loop
  useEffect(() => {
    if (!simRunning || !route) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
      simLastTsRef.current = null
      return
    }
    const totalMeters = route.totalDistanceKm * 1000
    const speedMps = Math.max(1, (picker?.speedKmph || 15) * 1000 / 3600) * simSpeed

    const tick = (ts: number) => {
      if (!simRunning) return
      const last = simLastTsRef.current
      simLastTsRef.current = ts
      if (last != null) {
        const dt = (ts - last) / 1000 // sec
        simDistRef.current = Math.min(totalMeters, simDistRef.current + speedMps * dt)
        const pos = interpolateOnLineString(route.lineString, simDistRef.current)
        if (pos) {
          setSimPosition(pos)
          // move the actual picker marker along the route
          if (picker) {
            const id = picker.id
            setPickers(prev => prev.map(p => p.id === id ? { ...p, longitude: pos[0], latitude: pos[1] } : p))
          }
        }
        // Check pickups near planned bin stops and zero their fill when reached
        if (pos) {
          const thresholdMeters = 30 // trigger pickup within 30m of the bin
          for (const seg of route.order) {
            if (pickedRef.current.has(seg.binId)) continue
            const dKm = haversineKm({ latitude: pos[1], longitude: pos[0] }, { latitude: seg.coordinate[1], longitude: seg.coordinate[0] })
            if (dKm * 1000 <= thresholdMeters) {
              // snapshot original once
              if (!originalFillRef.current.has(seg.binId)) {
                const b = bins.find(x => x.id === seg.binId)
                if (b) originalFillRef.current.set(seg.binId, b.fillLevel)
              }
              // zero this bin's fill immediately
              setBins(prev => prev.map(b => b.id === seg.binId ? { ...b, fillLevel: 0, lastUpdated: new Date() } : b))
              pickedRef.current.add(seg.binId)
            }
          }
        }
        if (simDistRef.current >= totalMeters) {
          // reached end -> finalize session and restore fills
          setSimRunning(false)
          // keep picker's final position as new start; clear sim marker
          setSimPosition(null)
          finalizeSimulation()
          // hide route after simulation completes
          setRoute(null)
          return
        }
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [simRunning, route, simSpeed, picker])

  // Pause/resume fill jitter for the whole session lifespan
  useEffect(() => {
    pauseFillUpdates(simSessionActive)
  }, [simSessionActive, pauseFillUpdates])

  // Helper: restore any bins we changed
  const restorePickedBins = () => {
    if (originalFillRef.current.size === 0) return
    setBins(prev => prev.map(b => {
      const orig = originalFillRef.current.get(b.id)
      return orig != null ? { ...b, fillLevel: orig, lastUpdated: new Date() } : b
    }))
    // clear trackers
    pickedRef.current.clear()
    originalFillRef.current.clear()
  }

  const finalizeSimulation = () => {
    // On end (completed or not), end the session and restore fills
    setSimSessionActive(false)
    restorePickedBins()
  }

  // Cleanup serial on unmount
  useEffect(() => {
    return () => {
      if (serialRef.current) {
        serialRef.current.disconnect().catch(() => {})
        serialRef.current = null
      }
    }
  }, [])

  return (
    <div className="h-screen bg-[#0D1117] text-[#F0F6FC] antialiased">
      <div className="flex h-full overflow-x-hidden min-h-0">
        {/* Sidebar */}
        <aside className="w-[380px] bg-[#161B22] border-r border-[#30363D] flex-shrink-0 flex flex-col p-6 space-y-6 overflow-y-auto">
          {/* Brand */}
          <header className="flex items-center space-x-3">
            <div className="bg-emerald-500/10 p-2 rounded-lg">
              <Recycle className="text-emerald-400" size={24} />
            </div>
            <div>
              <h1 className="text-xl font-bold">Garbage Dude</h1>
              <p className="text-sm text-[#8B949E]">Smart Route Optimization</p>
            </div>
          </header>

          {/* Optimization Parameters */}
          <div className="bg-[#21262D] p-4 rounded-lg border border-[#30363D] flex flex-col space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <SlidersHorizontal size={18} className="text-[#8B949E]" />
                <h2 className="font-semibold text-lg">Optimization Parameters</h2>
              </div>
              <button title="Randomize bins" onClick={randomizeBins} className="p-1.5 text-[#8B949E] hover:text-[#F0F6FC] hover:bg-white/10 rounded-full transition-colors">
                <RefreshCw size={16} />
              </button>
            </div>
            <div className="space-y-5 pt-2 text-sm">
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-sm font-medium">Bin Fill Weight</label>
                  <span className="text-sm font-semibold text-emerald-400">{weights.weightFill.toFixed(2)}</span>
                </div>
                <input type="range" min={0} max={1} step={0.01} value={weights.weightFill}
                  onChange={e => setWeights(w => ({ ...w, weightFill: parseFloat(e.target.value) }))}
                  className="w-full ui-range"
                  style={{ ['--track-color' as any]: '#22C55E', ['--thumb-color' as any]: '#22C55E', ['--value' as any]: `${Math.round(weights.weightFill * 100)}%` }} />
              </div>
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-sm font-medium">Area Importance Weight</label>
                  <span className="text-sm font-semibold text-emerald-400">{weights.weightImportance.toFixed(2)}</span>
                </div>
                <input type="range" min={0} max={1} step={0.01} value={weights.weightImportance}
                  onChange={e => setWeights(w => ({ ...w, weightImportance: parseFloat(e.target.value) }))}
                  className="w-full ui-range"
                  style={{ ['--track-color' as any]: '#22C55E', ['--thumb-color' as any]: '#22C55E', ['--value' as any]: `${Math.round(weights.weightImportance * 100)}%` }} />
              </div>
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-sm font-medium">Distance Factor Weight</label>
                  <span className="text-sm font-semibold text-emerald-400">{weights.weightDistance.toFixed(2)}</span>
                </div>
                <input type="range" min={0} max={1} step={0.01} value={weights.weightDistance}
                  onChange={e => setWeights(w => ({ ...w, weightDistance: parseFloat(e.target.value) }))}
                  className="w-full ui-range"
                  style={{ ['--track-color' as any]: '#22C55E', ['--thumb-color' as any]: '#22C55E', ['--value' as any]: `${Math.round(weights.weightDistance * 100)}%` }} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 border-t border-[#30363D] pt-4">
              <div>
                <label className="block text-sm font-medium mb-1">Max Bins</label>
                <input className="w-full bg-[#0D1117] border border-[#30363D] rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  type="number" min={1} max={20} value={maxBins} onChange={e => setMaxBins(parseInt(e.target.value))} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Max Distance (km)</label>
                <input className="w-full bg-[#0D1117] border border-[#30363D] rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  type="number" min={1} max={200} value={maxDistanceKm ?? 50} onChange={e => setMaxDistanceKm(parseInt(e.target.value))} />
                <button className="text-xs text-[#8B949E] underline mt-1" onClick={() => setMaxDistanceKm(undefined)}>No limit</button>
              </div>
            </div>
            <button onClick={compute} disabled={busy || !picker}
              className="w-full bg-emerald-500 text-[#0D1117] py-2.5 px-4 rounded-lg font-semibold flex items-center justify-center gap-2 hover:bg-emerald-400 transition-colors">
              <RouteIcon size={18} /> Plan Optimal Route
            </button>
          </div>

          {/* Simulation Controls */}
          <div className="bg-[#21262D] p-4 rounded-lg border border-[#30363D] space-y-4 text-sm">
            <h2 className="font-semibold text-lg flex items-center gap-3"><Play size={18} className="text-[#8B949E]" /> Simulation Controls</h2>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={followPicker} onChange={e => setFollowPicker(e.target.checked)} />
              Keep camera centered on picker
            </label>
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-sm font-medium">Simulation Speed</label>
                <span className="text-sm font-semibold text-blue-400">{simSpeed}x</span>
              </div>
              <input type="range" min={1} max={100} step={1} value={simSpeed}
                onChange={e => setSimSpeed(parseInt(e.target.value))} className="w-full" />
            </div>
            <div className="flex gap-2">
              <button
                disabled={!route}
                onClick={() => {
                  if (!route) return
                  const start = route.lineString.coordinates[0]
                  setSimPosition([start[0], start[1]])
                  if (picker) {
                    const id = picker.id
                    setPickers(prev => prev.map(p => p.id === id ? { ...p, longitude: start[0], latitude: start[1] } : p))
                  }
                  simDistRef.current = 0
                  simLastTsRef.current = null
                  setSimSessionActive(true)
                  pickedRef.current.clear()
                  originalFillRef.current.clear()
                  for (const seg of route.order) {
                    const b = bins.find(x => x.id === seg.binId)
                    if (b) originalFillRef.current.set(seg.binId, b.fillLevel)
                  }
                  setSimRunning(true)
                }}
                className="flex-1 bg-blue-500 text-white py-2 px-3 rounded-md font-semibold text-sm hover:bg-blue-600 transition-colors inline-flex items-center justify-center gap-1.5">
                <Play size={18} /> Start
              </button>
              <button
                onClick={() => {
                  if (simRunning) {
                    setSimRunning(false)
                  } else {
                    simLastTsRef.current = null
                    setSimRunning(true)
                  }
                }}
                className="flex-1 bg-[#30363D] text-[#F0F6FC] py-2 px-3 rounded-md font-semibold text-sm hover:bg-slate-600 transition-colors inline-flex items-center justify-center gap-1.5">
                {simRunning ? <Pause size={18} /> : <Play size={18} />} {simRunning ? 'Pause' : 'Resume'}
              </button>
              <button
                onClick={() => {
                  setSimRunning(false)
                  setSimPosition(null)
                  simDistRef.current = 0
                  simLastTsRef.current = null
                  finalizeSimulation()
                  // also hide any existing route on reset
                  setRoute(null)
                }}
                className="flex-1 bg-[#30363D] text-[#F0F6FC] py-2 px-3 rounded-md font-semibold text-sm hover:bg-slate-600 transition-colors inline-flex items-center justify-center gap-1.5">
                <RotateCcw size={18} /> Reset
              </button>
            </div>
          </div>

          {/* Picker selection */}
          <div className="bg-[#21262D] p-4 rounded-lg border border-[#30363D] text-sm">
            <div className="flex items-center gap-2 mb-3"><Truck size={18} className="text-[#8B949E]" /><h3 className="font-semibold">Select Picker</h3></div>
            <div className="space-y-2">
              {pickers.map(p => {
                const checked = (picker?.id || selectedPickerId) === p.id
                const loadPct = Math.min(100, Math.max(0, Math.round((p.currentLoadLiters / p.capacityLiters) * 100)))
                return (
                  <label key={p.id} className={`block p-3 rounded-lg border-2 transition-all ${checked ? 'border-emerald-500 bg-emerald-500/10' : 'border-transparent hover:border-[#30363D]'}`}>
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-3">
                        <input type="radio" name="picker" checked={checked} onChange={() => setSelectedPickerId(p.id)} />
                        <span className="font-semibold">{p.name}</span>
                      </div>
                      <span className="text-xs text-[#8B949E]">ID: {p.id}</span>
                    </div>
                    <div className="mt-2 pl-8 space-y-1">
                      <p className="text-sm text-[#8B949E]">Load: {p.currentLoadLiters} / {p.capacityLiters} L</p>
                      <div className="w-full bg-[#30363D] rounded-full h-1.5">
                        <div className="bg-emerald-500 h-1.5 rounded-full" style={{ width: `${loadPct}%` }} />
                      </div>
                    </div>
                  </label>
                )
              })}
            </div>
          </div>

          {/* Arduino */}
          <div className="bg-[#21262D] p-4 rounded-lg border border-[#30363D] text-sm">
            <h3 className="font-semibold mb-3">Arduino</h3>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs text-[#8B949E] mb-1">Baud</label>
                <select value={baudRate} onChange={e => setBaudRate(parseInt(e.target.value))}
                  className="w-full bg-[#0D1117] border border-[#30363D] rounded-md px-2 py-2 text-sm">
                  {[9600, 19200, 38400, 57600, 115200].map(b => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>
              <div className="flex items-end gap-2">
                {serialStatus !== 'connected' ? (
                  <button
                    onClick={async () => {
                      try {
                        if (serialRef.current?.isConnected()) return
                        setSerialStatus('connecting')
                        setSerialError(null)
                        const ctl = await connectSerial((pct) => {
                          const level = Math.max(0, Math.min(1, pct / 100))
                          setBin1Override(level)
                          setBins(prev => prev.map(b => b.id === 'bin-1' ? { ...b, fillLevel: level, lastUpdated: new Date() } : b))
                        }, { baudRate, toggleDTR: true })
                        serialRef.current = ctl
                        setSerialStatus('connected')
                      } catch (err: any) {
                        console.error('Serial connect failed', err)
                        setSerialError(err?.message || String(err))
                        setSerialStatus('error')
                      }
                    }}
                    className="flex-1 bg-emerald-600 text-[#0D1117] py-2 px-3 rounded-md font-semibold text-sm hover:bg-emerald-500 transition-colors">
                    {serialStatus === 'connecting' ? 'Connecting…' : 'Connect'}
                  </button>
                ) : (
                  <button
                    onClick={async () => {
                      if (serialRef.current) {
                        await serialRef.current.disconnect().catch(() => {})
                        serialRef.current = null
                      }
                      setSerialStatus('disconnected')
                    }}
                    className="flex-1 bg-red-600 text-white py-2 px-3 rounded-md font-semibold text-sm hover:bg-red-500 transition-colors">
                    Disconnect
                  </button>
                )}
              </div>
            </div>
            {serialStatus === 'connected' && (
              <p className="text-xs text-emerald-400 mt-2">Serial: connected @ {baudRate} baud</p>
            )}
            {serialStatus === 'error' && serialError && (
              <p className="text-xs text-red-400 break-all mt-2">{serialError}</p>
            )}
          </div>
        </aside>

        {/* Main */}
  <main className="flex-1 h-full flex flex-col p-6 gap-6 overflow-y-auto min-h-0">
          {/* Map card */}
          <div className="rounded-xl relative overflow-hidden border border-[#30363D] bg-[#161B22] h-[480px] flex-shrink-0">
            <div className="absolute inset-0">
              <WasteMap
                bins={bins}
                pickers={pickers}
                route={route}
                simPosition={simPosition}
                simDistanceMeters={simDistRef.current}
                followCenter={followPicker && simRunning && picker ? [picker.longitude, picker.latitude] : null}
                simRunning={simRunning}
              />
            </div>
            {/* Chips */}
            <div className="absolute top-4 right-4 flex items-center gap-4 text-sm">
              <div className="bg-[#161B22]/80 backdrop-blur-md p-3 rounded-lg border border-[#30363D] shadow">
                <p className="text-[#8B949E]">Distance: <span className="font-semibold text-[#F0F6FC]">{route ? `${route.totalDistanceKm.toFixed(2)} km` : '-'}</span></p>
              </div>
              <div className="bg-[#161B22]/80 backdrop-blur-md p-3 rounded-lg border border-[#30363D] shadow">
                <p className="text-[#8B949E]">ETA: <span className="font-semibold text-[#F0F6FC]">{route ? `${route.estimatedTimeMin.toFixed(0)} min` : '-'}</span></p>
              </div>
              <div className="bg-[#161B22]/80 backdrop-blur-md p-3 rounded-lg border border-[#30363D] shadow">
                <p className="text-[#8B949E]">Stops: <span className="font-semibold text-[#F0F6FC]">{route ? route.order.length : 0}</span></p>
              </div>
            </div>
          </div>

          {/* Active bins */}
          <div className="min-h-[320px] bg-[#161B22] rounded-xl border border-[#30363D] flex flex-col p-4">
            <div className="flex items-center justify-between pb-3 px-2">
              <h2 className="font-semibold text-lg">Active Bins ({bins.length})</h2>
            </div>
            <div className="flex-1 overflow-y-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs text-[#8B949E] uppercase sticky top-0 bg-[#161B22] z-10">
                  <tr>
                    <th className="py-2 px-3 w-1/4">Bin</th>
                    <th className="py-2 px-3 w-1/4">Fill Level</th>
                    <th className="py-2 px-3 w-1/4">Importance</th>
                    <th className="py-2 px-3 w-1/4 text-right">Capacity Left</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#30363D]">
                  {bins.map(b => {
                    const fillPct = Math.round(b.fillLevel * 100)
                    const impPct = Math.round(b.areaImportance * 100)
                    const capLeft = Math.max(0, Math.round(b.capacityLiters * (1 - b.fillLevel)))
                    const fillColor = fillPct >= 80 ? '#EF4444' : fillPct >= 60 ? '#F59E0B' : '#22C55E'
                    return (
                      <tr key={b.id} className="hover:bg-[#21262D] transition-colors">
                        <td className="p-3 font-semibold">{b.name}</td>
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <div className="w-full bg-[#30363D] rounded-full h-1.5"><div className="h-1.5 rounded-full" style={{ width: `${fillPct}%`, background: fillColor }} /></div>
                            <span className="font-mono" style={{ color: fillColor }}>{fillPct}%</span>
                          </div>
                        </td>
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <div className="w-full bg-[#30363D] rounded-full h-1.5"><div className="bg-[#3B82F6] h-1.5 rounded-full" style={{ width: `${impPct}%` }} /></div>
                            <span className="font-mono text-[#3B82F6]">{impPct}%</span>
                          </div>
                        </td>
                        <td className="p-3 font-mono text-right">{capLeft} L</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}

// Utility: get a position along a LineString at a given distance (meters) assuming Earth distance approximation
function interpolateOnLineString(line: GeoJSON.LineString, distanceMeters: number): [number, number] | null {
  const coords = line.coordinates
  if (coords.length < 2) return null
  let remaining = distanceMeters / 1000 // to km
  for (let i = 0; i < coords.length - 1; i++) {
    const a = coords[i]
    const b = coords[i + 1]
    const segKm = haversineKm({ latitude: a[1], longitude: a[0] }, { latitude: b[1], longitude: b[0] })
    if (remaining <= segKm) {
      const t = segKm === 0 ? 0 : (remaining / segKm)
      const lon = a[0] + (b[0] - a[0]) * t
      const lat = a[1] + (b[1] - a[1]) * t
      return [lon, lat]
    }
    remaining -= segKm
  }
  return coords[coords.length - 1] as [number, number]
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
