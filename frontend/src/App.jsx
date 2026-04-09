import { useEffect, useRef, useState, useCallback } from 'react'
import 'mapbox-gl/dist/mapbox-gl.css'
import { useMap } from './hooks/useMap'
import { fetchCities, fetchDensity } from './services/api'
import CitySelector from './components/CitySelector'
import LayerToggle from './components/LayerToggle'
import Legend from './components/Legend'
import LogoBadge from './components/LogoBadge'
import './App.css'

export default function App() {
  const mapContainerRef = useRef(null)

  const [cities, setCities] = useState([])
  const [activeCityId, setActiveCityId] = useState('boston')
  const [activeCity, setActiveCity] = useState(null)
  const [layers, setLayers] = useState({ traffic: false, density: false, wms: false, transport: false })
  const [densityMeta, setDensityMeta] = useState(null)

  const { setLayerVisible, setDensityData } = useMap(mapContainerRef, activeCity)

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

  const toggleLayer = useCallback((id) => {
    setLayers(prev => ({ ...prev, [id]: !prev[id] }))
  }, [])

  const handleCitySelect = useCallback((id) => {
    setActiveCityId(id)
    if (layers.density) setDensityMeta({ loading: true })
  }, [layers.density])

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

      <div className="legends-container">
        <Legend
          trafficVisible={layers.traffic}
          densityVisible={layers.density}
          wmsVisible={layers.wms}
          transportVisible={layers.transport}
          densityMeta={densityMeta}
        />
      </div>

      {/* <LogoBadge /> */}
    </div>
  )
}
