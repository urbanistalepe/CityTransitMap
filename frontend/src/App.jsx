import { useEffect, useRef, useState, useCallback } from 'react'
import 'mapbox-gl/dist/mapbox-gl.css'
import { useMap } from './hooks/useMap'
import { fetchCities, fetchDensity } from './services/api'
import CitySelector from './components/CitySelector'
import LayerToggle from './components/LayerToggle'
import Legend from './components/Legend'
import LogoBadge from './components/LogoBadge'
import TransitEditor from './components/TransitEditor'
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

  const {
    setLayerVisible,
    setDensityData,
    setTransitEditVisible,
    setTransitEditData,
    setTransitEditing,
    setActiveTransitLine,
    setTransitHandlers,
  } = useMap(mapContainerRef, activeCity)

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
        setDensityData(geojson)
        setDensityMeta({
          loading: false,
          count: geojson.metadata?.count ?? geojson.features.length,
          cache: geojson.metadata?.cache,
        })
      })
      .catch(err => setDensityMeta({ loading: false, error: err.message }))
  }, [layers.density, activeCityId])

  // Sync layer visibility
  useEffect(() => { setLayerVisible('traffic-layer', layers.traffic) }, [layers.traffic])
  useEffect(() => { setLayerVisible('density-layer', layers.density) }, [layers.density])
  useEffect(() => { setLayerVisible('wms-layer', layers.wms) }, [layers.wms])
  useEffect(() => { setLayerVisible('transport-layer', layers.transport) }, [layers.transport])
  useEffect(() => { setLayerVisible('stops-layer', layers.transport) }, [layers.transport])
  useEffect(() => { setLayerVisible('accessibility-layer', layers.accessibility) }, [layers.accessibility])

  // Sync transit editor visibility (rides on the existing Transporte tab)
  useEffect(() => {
    setTransitEditVisible(layers.transport)
    if (!layers.transport) {
      setEditing(false)
      setTransitEditing(false)
    }
  }, [layers.transport])

  // Push edited lines into the map source whenever they change
  useEffect(() => { setTransitEditData(transitLines) }, [transitLines])

  // Track active line for click-to-add
  useEffect(() => { setActiveTransitLine(activeLineId) }, [activeLineId])

  // Track editing flag for the map handlers
  useEffect(() => { setTransitEditing(editing) }, [editing])

  // Map handlers — add a stop on click, move a stop on drag
  useEffect(() => {
    setTransitHandlers({
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
    })
  }, [setTransitHandlers])

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
      // If turning on and no lines exist, create the first one automatically
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

  const handleRunEdit = useCallback(() => {
    // Flatten every stop with its line's medium + frequency
    const flat = transitLines.flatMap(l =>
      l.stops.map(s => ({
        lat: s.coords[1],
        long: s.coords[0],
        medio_transporte: l.medium,
        frecuencia: l.frequency,
      }))
    )
    editedTransitStops = flat
    if (typeof window !== 'undefined') window.editedTransitStops = flat
    // eslint-disable-next-line no-console
    console.log('[Transit Editor] editedTransitStops =', flat)
    setEditing(false)
  }, [transitLines])

  return (
    <div className="app">
      <div ref={mapContainerRef} className="map-container" />

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

      {/* <LogoBadge /> */}
    </div>
  )
}
