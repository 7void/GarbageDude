import { useEffect, useMemo, useState } from 'react'
import type { Bin, Picker } from '../types'

function randomInRange(min: number, max: number) {
  return Math.random() * (max - min) + min
}

function jitter(value: number, amount = 0.1) {
  const v = value + (Math.random() * 2 - 1) * amount
  return Math.min(1, Math.max(0, v))
}

// A few seeded bins around a reference point (e.g., city center)
function seedBins(center: { lat: number; lon: number }): Bin[] {
  const make = (i: number, dLat: number, dLon: number): Bin => ({
    id: `bin-${i}`,
    name: `Bin ${i}`,
    latitude: center.lat + dLat,
    longitude: center.lon + dLon,
    fillLevel: Math.random() * 0.8 + 0.1,
    areaImportance: Math.random() * 0.7 + 0.3,
    capacityLiters: Math.round(randomInRange(60, 240)),
    lastUpdated: new Date(),
  })
  return [
    make(1, 0.010, 0.010),
    make(2, -0.008, 0.016),
    make(3, 0.005, -0.011),
    make(4, -0.015, -0.006),
    make(5, 0.014, 0.004),
    make(6, -0.006, 0.010),
    make(7, 0.013, -0.014),
    make(8, -0.011, -0.012),
    make(9, 0.002, 0.018),
    make(10, -0.004, -0.016),
  ]
}

function seedPickers(center: { lat: number; lon: number }): Picker[] {
  return [
    {
      id: 'picker-1',
      name: 'Picker Alpha',
      latitude: center.lat + 0.002,
      longitude: center.lon - 0.004,
      capacityLiters: 1200,
      currentLoadLiters: 200,
      speedKmph: 20,
    },
    {
      id: 'picker-2',
      name: 'Picker Bravo',
      latitude: center.lat - 0.006,
      longitude: center.lon + 0.008,
      capacityLiters: 1000,
      currentLoadLiters: 350,
      speedKmph: 18,
    },
  ]
}

export function useBins() {
  const [bins, setBins] = useState<Bin[]>(() => seedBins({ lat: 12.9716, lon: 77.5946 }))
  const [jitterPaused, setJitterPaused] = useState(false)
  // If set, Bin 1 (id: bin-1) will reflect this external fill level (0..1)
  const [bin1Override, setBin1Override] = useState<number | null>(null)

  // Simulate periodic fill updates
  useEffect(() => {
    const t = setInterval(() => {
      if (jitterPaused) return
      setBins(prev => prev.map(b => {
        if (b.id === 'bin-1' && bin1Override != null) {
          // keep external value, still refresh timestamp periodically
          return { ...b, fillLevel: bin1Override, lastUpdated: new Date() }
        }
        return {
          ...b,
          fillLevel: jitter(b.fillLevel, 0.05),
          lastUpdated: new Date(),
        }
      }))
    }, 5000)
    return () => clearInterval(t)
  }, [jitterPaused, bin1Override])

  const reset = () => setBins(seedBins({ lat: 12.9716, lon: 77.5946 }))
  const randomize = () => setBins(prev => prev.map(b => ({ ...b, fillLevel: Math.random(), lastUpdated: new Date() })))

  return { bins, setBins, reset, randomize, pauseJitter: (pause: boolean) => setJitterPaused(pause), setBin1Override }
}

export function usePickers() {
  const [pickers, setPickers] = useState<Picker[]>(() => seedPickers({ lat: 12.9716, lon: 77.5946 }))

  // Optional drift to simulate movement
  useEffect(() => {
    // Disabled by default; enable with VITE_ENABLE_PICKER_DRIFT=true
    if (import.meta.env.VITE_ENABLE_PICKER_DRIFT !== 'true') return
    const t = setInterval(() => {
      setPickers(prev => prev.map(p => ({
        ...p,
        latitude: p.latitude + randomInRange(-0.0005, 0.0005),
        longitude: p.longitude + randomInRange(-0.0005, 0.0005),
      })))
    }, 7000)
    return () => clearInterval(t)
  }, [])

  const reset = () => setPickers(seedPickers({ lat: 12.9716, lon: 77.5946 }))

  return { pickers, setPickers, reset }
}

export function useWasteData() {
  const { bins, setBins, reset: resetBins, randomize, pauseJitter, setBin1Override } = useBins()
  const { pickers, setPickers, reset: resetPickers } = usePickers()

  return useMemo(() => ({
    bins,
    pickers,
    setBins,
    setPickers,
    setBin1Override,
    resetAll: () => { resetBins(); resetPickers() },
    randomizeBins: randomize,
    pauseFillUpdates: pauseJitter,
  }), [bins, pickers, setBins, setPickers, resetBins, resetPickers, randomize, pauseJitter])
}
