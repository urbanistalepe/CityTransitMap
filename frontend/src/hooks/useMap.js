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

// Transit edit layer paints — same visual language as the MBTA lines and stops
const TRANSIT_EDIT_LINE_PAINT = {
  'line-width': ['interpolate', ['linear'], ['zoom'], 10, 2, 14, 4.5, 18, 9],
  'line-color': ['get', 'color'],
  'line-opacity': 0.95,
}

const TRANSIT_EDIT_STOP_CIRCLE_PAINT = {
  'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 4, 14, 6.5, 18, 10],
  'circle-color': '#ffffff',
  'circle-stroke-width': 2.5,
  'circle-stroke-color': ['get', 'color'],
  'circle-pitch-alignment': 'map',
}

const TRANSIT_EDIT_STOP_HALO_PAINT = {
  'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 8, 14, 12, 18, 18],
  'circle-color': ['get', 'color'],
  'circle-opacity': 0.18,
  'circle-pitch-alignment': 'map',
}

export function useMap(containerRef, city) {
  const mapRef = useRef(null)
  const layerReadyRef = useRef(false)

  // Refs the dynamic event handlers read from — kept up to date by setters below
  const editingRef = useRef(false)
  const activeLineIdRef = useRef(null)
  const onAddStopRef = useRef(null)
  const onMoveStopRef = useRef(null)
  const onDeleteStopRef = useRef(null)

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
          '/api/proxy/wms?layers=cityscience:vw_heatmap_poblacion&srs=EPSG:3857&width=512&height=512&bbox={bbox-epsg-3857}'
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

      // Accessibility WMS Layer
      map.addSource('accessibility-source', {
        type: 'raster',
        tiles: [
          '/api/proxy/wms?layers=cityscience:accessibility_accs_h3&srs=EPSG:3857&width=512&height=512&bbox={bbox-epsg-3857}'
        ],
        tileSize: 512,
      })
      map.addLayer({
        id: 'accessibility-layer',
        type: 'raster',
        source: 'accessibility-source',
        layout: { visibility: 'none' },
        paint: { 'raster-opacity': 0.8, 'raster-fade-duration': 0 }
      })

      // Transport: WMS layer (Replacing broken WFS source)
      map.addSource('transport-source', {
        type: 'raster',
        tiles: [
          '/api/proxy/wms?layers=cityscience:transport&srs=EPSG:3857&width=512&height=512&bbox={bbox-epsg-3857}'
        ],
        tileSize: 512,
      })
      map.addLayer({
        id: 'transport-layer',
        type: 'raster',
        source: 'transport-source',
        layout: { visibility: 'none' },
        paint: { 'raster-opacity': 0.85, 'raster-fade-duration': 0 }
      })

      // Interaction for Transport Layer
      map.on('click', 'transport-layer', (e) => {
        if (editingRef.current) return
        const props = e.features[0].properties;
        new mapboxgl.Popup()
          .setLngLat(e.lngLat)
          .setHTML(`
            <div style="color: #333; font-family: -apple-system, system-ui, sans-serif; padding: 4px; min-width: 140px;">
              <div style="font-weight: 700; border-bottom: 2px solid #5E5CE6; margin-bottom: 8px; color: #5E5CE6; padding-bottom: 4px;">Atributos Transporte</div>
              <div style="max-height: 200px; overflow-y: auto; font-size: 11px;">
                ${Object.entries(props).map(([k, v]) => `
                  <div style="margin-bottom: 4px;">
                    <span style="color: #888; font-weight: 500;">${k}:</span>
                    <span style="color: #111; float: right; margin-left: 8px;">${v}</span>
                  </div>
                `).join('')}
              </div>
            </div>
          `)
          .addTo(map);
      });

      map.on('mouseenter', 'transport-layer', () => { map.getCanvas().style.cursor = 'pointer' });
      map.on('mouseleave', 'transport-layer', () => { map.getCanvas().style.cursor = '' });

      // MBTA Stops: Vector WFS layer (Points)
      map.addSource('stops-source', {
        type: 'geojson',
        data: '/api/proxy/wfs?typeName=cityscience:MBTA_Stops&maxFeatures=2000'
      })
      map.addLayer({
        id: 'stops-layer',
        type: 'circle',
        source: 'stops-source',
        layout: { visibility: 'none' },
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 3, 15, 8],
          'circle-color': '#ffffff',
          'circle-stroke-width': 2,
          'circle-stroke-color': '#000000',
          'circle-opacity': 0.9
        }
      })

      // Interaction for Stops Layer
      map.on('click', 'stops-layer', (e) => {
        if (editingRef.current) return
        const props = e.features[0].properties;
        new mapboxgl.Popup()
          .setLngLat(e.lngLat)
          .setHTML(`
            <div style="color: #333; font-family: -apple-system, sans-serif; padding: 4px; min-width: 160px;">
              <div style="font-weight: 700; border-bottom: 2px solid #30D158; margin-bottom: 8px; color: #30D158; padding-bottom: 4px;">Parada MBTA</div>
              <div style="font-size: 11px;">
                ${Object.entries(props).map(([k, v]) => `
                  <div style="margin-bottom: 2px;">
                    <span style="color: #777;">${k}:</span>
                    <span style="color: #000; float: right; margin-left: 10px;">${v}</span>
                  </div>
                `).join('')}
              </div>
            </div>
          `)
          .addTo(map);
      });

      map.on('mouseenter', 'stops-layer', () => { map.getCanvas().style.cursor = 'pointer' });
      map.on('mouseleave', 'stops-layer', () => { map.getCanvas().style.cursor = '' });

      // ── Transit edit sources + layers ─────────────────────────────────
      map.addSource('transit-edit-lines', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      })
      map.addSource('transit-edit-stops', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      })

      map.addLayer({
        id: 'transit-edit-lines-layer',
        type: 'line',
        source: 'transit-edit-lines',
        layout: { visibility: 'none', 'line-join': 'round', 'line-cap': 'round' },
        paint: TRANSIT_EDIT_LINE_PAINT,
      })
      map.addLayer({
        id: 'transit-edit-stops-halo',
        type: 'circle',
        source: 'transit-edit-stops',
        layout: { visibility: 'none' },
        paint: TRANSIT_EDIT_STOP_HALO_PAINT,
      })
      map.addLayer({
        id: 'transit-edit-stops-layer',
        type: 'circle',
        source: 'transit-edit-stops',
        layout: { visibility: 'none' },
        paint: TRANSIT_EDIT_STOP_CIRCLE_PAINT,
      })

      // Map click — add a stop to the active line when in edit mode
      map.on('click', (e) => {
        if (!editingRef.current) return
        if (!activeLineIdRef.current) return
        // Ignore clicks on an existing edited stop (handled by drag)
        const hits = map.queryRenderedFeatures(e.point, {
          layers: ['transit-edit-stops-layer'],
        })
        if (hits.length > 0) return
        onAddStopRef.current?.(activeLineIdRef.current, [e.lngLat.lng, e.lngLat.lat])
      })

      // Hover affordance on edited stops
      map.on('mouseenter', 'transit-edit-stops-layer', () => {
        if (editingRef.current) map.getCanvas().style.cursor = 'grab'
      })
      map.on('mouseleave', 'transit-edit-stops-layer', () => {
        if (editingRef.current) map.getCanvas().style.cursor = 'crosshair'
      })

      // Right click to delete a stop
      map.on('contextmenu', 'transit-edit-stops-layer', (e) => {
        if (!editingRef.current) return
        e.preventDefault()
        const f = e.features?.[0]
        if (!f) return
        onDeleteStopRef.current?.(f.properties.lineId, f.properties.stopId)
      })

      // Drag stops
      let draggingStop = null

      const onMove = (ev) => {
        if (!draggingStop) return
        const { lng, lat } = ev.lngLat
        onMoveStopRef.current?.(draggingStop.lineId, draggingStop.stopId, [lng, lat])
        map.getCanvas().style.cursor = 'grabbing'
      }

      const onUp = () => {
        if (!draggingStop) return
        draggingStop = null
        map.getCanvas().style.cursor = editingRef.current ? 'crosshair' : ''
        map.off('mousemove', onMove)
        map.off('touchmove', onMove)
        map.dragPan.enable()
      }

      map.on('mousedown', 'transit-edit-stops-layer', (ev) => {
        if (!editingRef.current) return
        const f = ev.features?.[0]
        if (!f) return
        ev.preventDefault()
        draggingStop = {
          lineId: f.properties.lineId,
          stopId: f.properties.stopId,
        }
        map.dragPan.disable()
        map.getCanvas().style.cursor = 'grabbing'
        map.on('mousemove', onMove)
        map.once('mouseup', onUp)
      })

      map.on('touchstart', 'transit-edit-stops-layer', (ev) => {
        if (!editingRef.current) return
        if (ev.points.length !== 1) return
        const f = ev.features?.[0]
        if (!f) return
        ev.preventDefault()
        draggingStop = {
          lineId: f.properties.lineId,
          stopId: f.properties.stopId,
        }
        map.dragPan.disable()
        map.on('touchmove', onMove)
        map.once('touchend', onUp)
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

  const setLayerOpacity = useCallback((layerId, opacity) => {
    const map = mapRef.current
    if (!map || !layerReadyRef.current) return
    const layer = map.getLayer(layerId)
    if (!layer) return
    let prop = ''
    switch (layer.type) {
      case 'raster': prop = 'raster-opacity'; break
      case 'line':   prop = 'line-opacity'; break
      case 'fill':   prop = 'fill-opacity'; break
      case 'circle': prop = 'circle-opacity'; break
      case 'heatmap': prop = 'heatmap-opacity'; break
      default: return
    }
    map.setPaintProperty(layerId, prop, opacity)
  }, [])

  const setDensityData = useCallback((geojson) => {
    const map = mapRef.current
    if (!map || !layerReadyRef.current) return
    const src = map.getSource('density-source')
    if (src) src.setData(geojson)
  }, [])

  const setTransitEditVisible = useCallback((visible) => {
    const map = mapRef.current
    if (!map || !layerReadyRef.current) return
    const v = visible ? 'visible' : 'none'
    map.setLayoutProperty('transit-edit-lines-layer', 'visibility', v)
    map.setLayoutProperty('transit-edit-stops-layer', 'visibility', v)
    map.setLayoutProperty('transit-edit-stops-halo', 'visibility', v)
  }, [])

  const setTransitEditData = useCallback((lines) => {
    const map = mapRef.current
    if (!map || !layerReadyRef.current) return

    const lineFeatures = lines
      .filter(l => l.stops.length >= 2)
      .map(l => ({
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: l.stops.map(s => s.coords),
        },
        properties: {
          lineId: l.id,
          color: l.color,
          name: l.name,
          medium: l.medium,
          frequency: l.frequency,
        },
      }))

    const stopFeatures = lines.flatMap(l =>
      l.stops.map(s => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: s.coords },
        properties: {
          lineId: l.id,
          stopId: s.id,
          color: l.color,
          medium: l.medium,
          frequency: l.frequency,
        },
      }))
    )

    map.getSource('transit-edit-lines')?.setData({
      type: 'FeatureCollection',
      features: lineFeatures,
    })
    map.getSource('transit-edit-stops')?.setData({
      type: 'FeatureCollection',
      features: stopFeatures,
    })
  }, [])

  const setTransitEditing = useCallback((editing) => {
    editingRef.current = editing
    const map = mapRef.current
    if (map) map.getCanvas().style.cursor = editing ? 'crosshair' : ''
  }, [])

  const setActiveTransitLine = useCallback((id) => {
    activeLineIdRef.current = id
  }, [])

  const setTransitHandlers = useCallback(({ onAddStop, onMoveStop, onDeleteStop }) => {
    onAddStopRef.current = onAddStop
    onMoveStopRef.current = onMoveStop
    onDeleteStopRef.current = onDeleteStop
  }, [])

  return {
    setLayerVisible,
    setLayerOpacity,
    setDensityData,
    setTransitEditVisible,
    setTransitEditData,
    setTransitEditing,
    setActiveTransitLine,
    setTransitHandlers,
  }
}
