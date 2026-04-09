import './Legend.css'

const TRAFFIC_STOPS = [
  { color: '#30D158', label: 'Free flow' },
  { color: '#FFD60A', label: '' },
  { color: '#FF9F0A', label: '' },
  { color: '#FF453A', label: '' },
  { color: '#8E0020', label: 'Congested' },
]

const DENSITY_STOPS = [
  'rgba(255,237,160,0.75)',
  '#fdb364', '#fd8d3c', '#f03b20', '#bd0026', '#800026',
]

export default function Legend({ trafficVisible, densityVisible, wmsVisible, transportVisible, densityMeta }) {
  return (
    <div className="legends">
      {/* ... (traffic and density remain same) ... */}
      {trafficVisible && (
        <div className="legend slide-up">
          <div className="legend-title">Traffic Flow</div>
          <div className="legend-scale">
            {TRAFFIC_STOPS.map((s, i) => (
              <div key={i} className="legend-swatch" style={{ background: s.color }} />
            ))}
          </div>
          <div className="legend-labels">
            <span>Free flow</span>
            <span>Congested</span>
          </div>
        </div>
      )}

      {densityVisible && (
        <div className="legend slide-up">
          <div className="legend-title">Population Density</div>
          <div className="legend-scale">
            {DENSITY_STOPS.map((c, i) => (
              <div key={i} className="legend-swatch" style={{ background: c }} />
            ))}
          </div>
          <div className="legend-labels">
            <span>Low</span>
            <span>High</span>
          </div>
          {densityMeta && (
            <div className="legend-meta">
              {densityMeta.loading
                ? '⟳ Loading OSM buildings…'
                : densityMeta.error
                ? '⚠ ' + densityMeta.error
                : `${densityMeta.count?.toLocaleString()} buildings · OpenStreetMap`}
            </div>
          )}
        </div>
      )}
      {wmsVisible && (
        <div className="legend slide-up">
          <div className="legend-title">Heatmap Población</div>
          <div className="legend-scale">
            <div className="legend-swatch" style={{ background: '#0A84FF', width: '100%', opacity: 0.7 }} />
          </div>
          <div className="legend-meta">
            GeoServer WMS Layer · Heatmap Población
          </div>
        </div>
      )}
      {transportVisible && (
        <div className="legend slide-up">
          <div className="legend-title">Transporte (MBTA)</div>
          <div className="legend-scale" style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div style={{ width: '20px', height: '3px', background: '#5E5CE6' }} />
              <span style={{ fontSize: '10px', color: '#888' }}>Líneas</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#30D158', border: '1px solid white' }} />
              <span style={{ fontSize: '10px', color: '#888' }}>Estaciones</span>
            </div>
          </div>
          <div className="legend-meta">
            GeoServer WFS · Datos Vectoriales
          </div>
        </div>
      )}
    </div>
  )
}
