import { useEffect, useRef, useCallback } from 'react'
import mapboxgl from 'mapbox-gl'

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN

const MAPBOX_STYLE = 'mapbox://styles/mapbox/dark-v11'

const DENSITY_HEATMAP_PAINT = {
  'heatmap-weight': [
    'interpolate', ['linear'],
    ['coalesce', ['to-number', ['get', 'levels'], 1], 1],
    1, 0.4, 10, 1.0,
  ],
  'heatmap-intensity': [
    'interpolate', ['linear'], ['zoom'],
    9, 0.6, 12, 1.4, 15, 2.2,
  ],
  'heatmap-radius': [
    'interpolate', ['linear'], ['zoom'],
    9, 14, 12, 24, 15, 42,
  ],
  'heatmap-opacity': 0.82,
  'heatmap-color': [
    'interpolate', ['linear'], ['heatmap-density'],
    0, 'rgba(0,0,0,0)',
    0.05, 'rgba(255,237,160,0.45)',
    0.20, 'rgba(254,217,118,0.62)',
    0.35, 'rgba(254,178,76,0.74)',
    0.50, 'rgba(253,141,60,0.84)',
    0.65, 'rgba(240,59,32,0.90)',
    0.80, 'rgba(189,0,38,0.95)',
    1.0, 'rgba(128,0,38,1.00)',
  ],
}

const TRAFFIC_LINE_PAINT = {
  'line-width': ['interpolate', ['linear'], ['zoom'], 10, 1.5, 14, 4, 18, 8],
  'line-color': [
    'match', ['get', 'congestion'],
    'low', '#30D158',
    'moderate', '#FFD60A',
    'heavy', '#FF9F0A',
    'severe', '#FF453A',
    '#8E0020',
  ],
  'line-opacity': 0.9,
}

export function useMap(containerRef, city) {
  const mapRef = useRef(null)
  const layerReadyRef = useRef(false)

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: MAPBOX_STYLE,
      center: city?.center ?? [-71.0589, 42.3601],
      zoom: city?.zoom ?? 12.5,
      pitch: 45,
      bearing: -17.6,
      antialias: true,
    })

    map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), 'bottom-right')

    map.on('load', () => {
      // Traffic
      map.addSource('mapbox-traffic', { type: 'vector', url: 'mapbox://mapbox.mapbox-traffic-v1' })
      map.addLayer({
        id: 'traffic-layer', type: 'line', source: 'mapbox-traffic',
        'source-layer': 'traffic',
        layout: { visibility: 'none', 'line-join': 'round', 'line-cap': 'round' },
        paint: TRAFFIC_LINE_PAINT,
      })

      // Density
      map.addSource('density-source', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      map.addLayer({
        id: 'density-layer', type: 'heatmap', source: 'density-source',
        layout: { visibility: 'none' }, paint: DENSITY_HEATMAP_PAINT,
      })

      // WMS: Back to 512px tiles. 
      // Tiling artifacts are now solved by the backend proxy using oversampling + cropping.
      map.addSource('wms-source', {
        type: 'raster',
        tiles: [
          '/api/proxy/wms?layers=cityscience:vw_heatmap_poblacion&srs=EPSG:3857&bbox={bbox-epsg-3857}'
        ],
        tileSize: 512,
      })
      map.addLayer({
        id: 'wms-layer',
        type: 'raster',
        source: 'wms-source',
        layout: { visibility: 'none' },
        paint: { 'raster-opacity': 0.85, 'raster-fade-duration': 0 }
      })

      layerReadyRef.current = true
    })

    mapRef.current = map
    return () => {
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
        layerReadyRef.current = false
      }
    }
  }, [])

  useEffect(() => {
    if (!mapRef.current || !city) return
    mapRef.current.flyTo({ center: city.center, zoom: city.zoom, duration: 1800 })
  }, [city?.id])

  const setLayerVisible = useCallback((layerId, visible) => {
    const map = mapRef.current
    if (!map || !layerReadyRef.current) return
    map.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none')
  }, [])

  const setDensityData = useCallback((geojson) => {
    const map = mapRef.current
    if (!map || !layerReadyRef.current) return
    const src = map.getSource('density-source')
    if (src) src.setData(geojson)
  }, [])

  return { setLayerVisible, setDensityData }
}
