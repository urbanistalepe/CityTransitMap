import { useEffect, useRef, useState, useCallback } from 'react'
import 'mapbox-gl/dist/mapbox-gl.css'
import { useMap } from './hooks/useMap'
import { fetchCities, fetchDensity } from './services/api'
import CitySelector from './components/CitySelector'
import LayerToggle from './components/LayerToggle'
import Legend from './components/Legend'
import LogoBadge from './components/LogoBadge'
import TransitEditor from './components/TransitEditor'
import StatusModal from './components/StatusModal'
import './App.css'

// Output variable for edited/added stops — populated when "Run Edit" is pressed.
// Each entry: { lat, long, medio_transporte, frecuencia }
export let editedTransitStops = []
if (typeof window !== 'undefined') window.editedTransitStops = editedTransitStops

let stopCounter = 0
const nextStopId = () => `stop-${++stopCounter}`

export default function App() {
  const mapContainerRef = useRef(null)

  const [cities, setCities] = useState([])
  const [activeCityId, setActiveCityId] = useState('boston')
  const [activeCity, setActiveCity] = useState(null)
  const [layers, setLayers] = useState({ traffic: false, density: false, wms: false, transport: false, accessibility: false })
  const [densityMeta, setDensityMeta] = useState(null)

  // Transit editor state
  const [transitLines, setTransitLines] = useState([])
  const [activeLineId, setActiveLineId] = useState(null)
  const [editing, setEditing] = useState(false)
  const [opacities, setOpacities] = useState({ traffic: 0.9, density: 0.8, wms: 0.85, transport: 0.85, accessibility: 0.8 })
  const [statusModal, setStatusModal] = useState({ visible: false, type: 'success', message: '' })

  const map = useMap(mapContainerRef, activeCity)

  // Load city list from backend on mount
  useEffect(() => {
    fetchCities()
      .then(data => {
        setCities(data.cities)
        setActiveCity(data.cities.find(c => c.id === 'boston'))
      })
      .catch(console.error)
  }, [])

  // Update activeCity object when selection changes
  useEffect(() => {
    const city = cities.find(c => c.id === activeCityId)
    if (city) setActiveCity(city)
  }, [activeCityId, cities])

  // Fetch density whenever layer is toggled on OR city changes (while layer is on)
  useEffect(() => {
    if (!layers.density) return
    setDensityMeta({ loading: true })
    fetchDensity(activeCityId)
      .then(geojson => {
        if (map.setDensityData) map.setDensityData(geojson)
        setDensityMeta({
          loading: false,
          count: geojson.metadata?.count ?? geojson.features.length,
          cache: geojson.metadata?.cache,
        })
      })
      .catch(err => setDensityMeta({ loading: false, error: err.message }))
  }, [layers.density, activeCityId, map])

  // Sync layer visibility
  useEffect(() => { if (map.setLayerVisible) map.setLayerVisible('traffic-layer', layers.traffic) }, [layers.traffic, map])
  useEffect(() => { if (map.setLayerVisible) map.setLayerVisible('density-layer', layers.density) }, [layers.density, map])
  useEffect(() => { if (map.setLayerVisible) map.setLayerVisible('wms-layer', layers.wms) }, [layers.wms, map])
  useEffect(() => { if (map.setLayerVisible) map.setLayerVisible('transport-layer', layers.transport) }, [layers.transport, map])
  useEffect(() => { if (map.setLayerVisible) map.setLayerVisible('stops-layer', layers.transport) }, [layers.transport, map])
  useEffect(() => { if (map.setLayerVisible) map.setLayerVisible('accessibility-layer', layers.accessibility) }, [layers.accessibility, map])

  // Sync layer opacities
  useEffect(() => { if (map.setLayerOpacity) map.setLayerOpacity('traffic-layer', opacities.traffic) }, [opacities.traffic, map])
  useEffect(() => { if (map.setLayerOpacity) map.setLayerOpacity('density-layer', opacities.density) }, [opacities.density, map])
  useEffect(() => { if (map.setLayerOpacity) map.setLayerOpacity('wms-layer', opacities.wms) }, [opacities.wms, map])
  useEffect(() => { if (map.setLayerOpacity) map.setLayerOpacity('transport-layer', opacities.transport) }, [opacities.transport, map])
  useEffect(() => { if (map.setLayerOpacity) map.setLayerOpacity('stops-layer', opacities.transport) }, [opacities.transport, map])
  useEffect(() => { if (map.setLayerOpacity) map.setLayerOpacity('accessibility-layer', opacities.accessibility) }, [opacities.accessibility, map])

  // Sync transit editor visibility (rides on the existing Transporte tab)
  useEffect(() => {
    if (map.setTransitEditVisible) map.setTransitEditVisible(layers.transport)
    if (!layers.transport) {
      setEditing(false)
      if (map.setTransitEditing) map.setTransitEditing(false)
    }
  }, [layers.transport, map])

  // Push edited lines into the map source whenever they change
  useEffect(() => { if (map.setTransitEditData) map.setTransitEditData(transitLines) }, [transitLines, map])

  // Track active line for click-to-add
  useEffect(() => { if (map.setActiveTransitLine) map.setActiveTransitLine(activeLineId) }, [activeLineId, map])

  // Track editing flag for the map handlers
  useEffect(() => { if (map.setTransitEditing) map.setTransitEditing(editing) }, [editing, map])

  // Map handlers — add a stop on click, move a stop on drag
  useEffect(() => {
    if (map.setTransitHandlers) {
      map.setTransitHandlers({
        onAddStop: (lineId, coords) => {
          setTransitLines(prev => prev.map(l =>
            l.id === lineId
              ? { ...l, stops: [...l.stops, { id: nextStopId(), coords }] }
              : l
          ))
        },
        onMoveStop: (lineId, stopId, coords) => {
          setTransitLines(prev => prev.map(l =>
            l.id === lineId
              ? { ...l, stops: l.stops.map(s => s.id === stopId ? { ...s, coords } : s) }
              : l
          ))
        },
        onDeleteStop: (lineId, stopId) => {
          setTransitLines(prev => prev.map(l =>
            l.id === lineId
              ? { ...l, stops: l.stops.filter(s => s.id !== stopId) }
              : l
          ))
        },
      })
    }
  }, [map])

  const toggleLayer = useCallback((id) => {
    setLayers(prev => ({ ...prev, [id]: !prev[id] }))
  }, [])

  const handleCitySelect = useCallback((id) => {
    setActiveCityId(id)
    if (layers.density) setDensityMeta({ loading: true })
  }, [layers.density])

  const handleToggleEdit = useCallback(() => {
    setEditing(prev => {
      const next = !prev
      if (next && transitLines.length === 0) {
        const id = `line-auto-${Date.now()}`
        const newLine = {
          id,
          name: 'Line 1',
          color: '#0A84FF',
          medium: 'bus',
          frequency: 10,
          stops: [],
        }
        setTransitLines([newLine])
        setActiveLineId(id)
      } else if (next && !activeLineId && transitLines.length > 0) {
        setActiveLineId(transitLines[0].id)
      }
      return next
    })
  }, [transitLines, activeLineId])

  const handleRunEdit = useCallback(async () => {
    const flat = transitLines.flatMap(l =>
      l.stops.map(s => ({
        lat: s.coords[1],
        lng: s.coords[0],
        line_name: l.name,
        line_color: l.color,
        transport_mode: l.medium,
        frequency: l.frequency
      }))
    )
    
    editedTransitStops = flat
    if (typeof window !== 'undefined') window.editedTransitStops = flat
    
    if (flat.length === 0) {
      setStatusModal({ visible: true, type: 'error', message: 'Draw at least one stop before saving.' })
      return
    }

    try {
      const response = await fetch('/api/transit/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stops: flat })
      })
      
      const contentType = response.headers.get('content-type')
      let resData
      if (contentType && contentType.includes('application/json')) {
        resData = await response.json()
      } else {
        const text = await response.text()
        throw new Error(text || `Error ${response.status}: ${response.statusText}`)
      }

      if (response.ok) {
        console.log('[Transit Editor] Guardado en PostgreSQL:', resData)
        setStatusModal({ 
          visible: true, 
          type: 'success', 
          message: `Successfully saved ${resData.count} stops in the itm_drawr schema.` 
        })
      } else {
        throw new Error(resData.detail || 'Server response error')
      }
    } catch (err) {
      console.error('[Transit Editor] Error saving to DB:', err)
      setStatusModal({ visible: true, type: 'error', message: `Could not save: ${err.message}` })
    }

    setEditing(false)
  }, [transitLines])

  return (
    <div className="app">
      <div 
        ref={mapContainerRef} 
        className="map-container" 
      />

      <div className="city-label">
        <span className="city-label-name">{activeCity?.name ?? '…'}</span>
        <span className="city-label-country">{activeCity?.country ?? ''}</span>
      </div>

      <div className="controls-bar">
        <CitySelector cities={cities} activeCity={activeCityId} onSelect={handleCitySelect} />
        <div className="controls-divider" />
        <LayerToggle
          active={layers}
          onToggle={toggleLayer}
          opacities={opacities}
          onOpacityChange={(id, val) => setOpacities(prev => ({ ...prev, [id]: val }))}
          densityStatus={
            densityMeta?.loading ? '…'
              : densityMeta?.count ? `${densityMeta.count.toLocaleString()} bldgs`
                : null
          }
        />
      </div>

      <TransitEditor
        visible={layers.transport}
        editing={editing}
        onToggleEdit={handleToggleEdit}
        lines={transitLines}
        setLines={setTransitLines}
        activeLineId={activeLineId}
        setActiveLineId={setActiveLineId}
        onRunEdit={handleRunEdit}
      />

      <div className="legends-container">
        <Legend
          trafficVisible={layers.traffic}
          densityVisible={layers.density}
          wmsVisible={layers.wms}
          transportVisible={layers.transport}
          accessibilityVisible={layers.accessibility}
          densityMeta={densityMeta}
        />
      </div>

      <StatusModal
        visible={statusModal.visible}
        type={statusModal.type}
        message={statusModal.message}
        onClose={() => setStatusModal(prev => ({ ...prev, visible: false }))}
      />
    </div>
  )
}
