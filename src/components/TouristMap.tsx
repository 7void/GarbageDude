import { useState } from 'react'
import Map, { Marker, Popup } from 'react-map-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { useTouristLocations } from '../hooks/useTouristLocations'

export default function TouristMap() {
  const locations = useTouristLocations()
  const [selected, setSelected] = useState<string | null>(null)
  const token = import.meta.env.VITE_MAPBOX_TOKEN || ''
  const selObj = locations.find(l => l.id === selected) || null

  return (
    <div className="w-full map-container panel card-elevated">
      <Map
        initialViewState={{ longitude: 78.9629, latitude: 20.5937, zoom: 5 }}
        mapStyle="mapbox://styles/mapbox/dark-v11"
        mapboxAccessToken={token}
        attributionControl={false}
      >
        {/* overlay info card */}
        <div className="absolute right-6 top-6 panel rounded-lg p-3 text-sm" style={{width: 220}}>
          <div className="text-xs muted">Live tourists</div>
          <div className="text-lg font-semibold mt-1">{locations.length}</div>
          <div className="mt-2 text-xs muted">Showing latest known positions. Click a marker for details.</div>
        </div>

        {locations.map(l => (
          <Marker key={l.id} longitude={l.longitude} latitude={l.latitude} anchor="bottom">
            <div className="flex items-center justify-center">
              <button
                onClick={(e) => { e.stopPropagation(); setSelected(l.id) }}
                className="w-4 h-4 bg-emerald-400 rounded-full ring-2 ring-white shadow"
                title={l.id}
              />
              <span className="ml-2 w-3 h-3 marker-pulse" aria-hidden />
            </div>
          </Marker>
        ))}

        {selObj && (
          <Popup
            longitude={selObj.longitude}
            latitude={selObj.latitude}
            anchor="top"
            closeOnClick={false}
            onClose={() => setSelected(null)}
            className="!p-0"
          >
            <div className="panel rounded-lg p-3" style={{minWidth: 180}}>
              <div className="text-sm font-semibold">{selObj.id}</div>
              <div className="text-xs muted">{selObj.timestamp ? selObj.timestamp.toLocaleString() : 'No time'}</div>
              <div className="mt-2 text-xs">Lat: {selObj.latitude.toFixed(4)} • Lon: {selObj.longitude.toFixed(4)}</div>
            </div>
          </Popup>
        )}
      </Map>

      {/* marker pulse styles inline to avoid adding a separate CSS file */}
      <style>{`
        .marker-pulse{ width:10px; height:10px; border-radius:999px; background: rgba(52,211,153,0.12); box-shadow:0 0 0 4px rgba(52,211,153,0.06); margin-left:6px; }
        .marker-pulse::after{ content:''; display:block; width:100%; height:100%; border-radius:999px; background: rgba(52,211,153,0.18); animation: pulse 1.8s infinite; }
        @keyframes pulse{ 0%{ transform: scale(0.6); opacity:1 } 70%{ transform: scale(1.6); opacity:0 } 100%{ transform: scale(1.6); opacity:0 } }
      `}</style>
    </div>
  )
}
