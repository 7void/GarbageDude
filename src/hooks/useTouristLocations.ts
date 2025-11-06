import { useEffect, useState } from 'react'
import { collection, onSnapshot } from 'firebase/firestore'
import type { DocumentData } from 'firebase/firestore'
import { db } from '../services/firebaseConfig'

export interface TouristLocation {
  id: string
  name: string
  latitude: number
  longitude: number
  timestamp: Date | null
  safetyScore?: number
}

export function useTouristLocations() {
  const [locations, setLocations] = useState<TouristLocation[]>([])

  useEffect(() => {
    const colRef = collection(db, 'users')
    const unsub = onSnapshot(colRef, snap => {
      const next: TouristLocation[] = []
      snap.forEach(doc => {
        const data = doc.data() as DocumentData
        const loc = data?.lastKnownLocation
        if (loc && typeof loc.latitude === 'number' && typeof loc.longitude === 'number') {
          next.push({
            id: doc.id,
            name: data.name,
            latitude: loc.latitude,
            longitude: loc.longitude,
            timestamp: loc.timestamp?.toDate?.() || null,
            safetyScore: typeof data?.safetyScore === 'number' ? data.safetyScore : undefined
          })
        }
      })
      setLocations(next)
    })
    return () => unsub()
  }, [])

  return locations
}
