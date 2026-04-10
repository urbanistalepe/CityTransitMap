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
          <div className="legend-lines-grid" style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(2, 1fr)', 
            gap: '8px', 
            marginBottom: '10px' 
          }}>
            {[
              { name: 'Red', color: '#DA291C' },
              { name: 'Orange', color: '#ED8B00' },
              { name: 'Blue', color: '#003DA5' },
              { name: 'Green', color: '#00843D' },
              { name: 'Silver', color: '#7C878E' },
              { name: 'Other', color: '#5E5CE6' }
            ].map(l => (
              <div key={l.name} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <div style={{ width: '12px', height: '3px', background: l.color, borderRadius: '1.5px' }} />
                <span style={{ fontSize: '10px', color: '#999' }}>{l.name}</span>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#30D158', border: '1px solid white' }} />
            <span style={{ fontSize: '10px', color: '#888' }}>Estaciones</span>
          </div>
          <div className="legend-meta">
            GeoServer WFS · Estilo por atributo LINE
          </div>
        </div>
      )}
    </div>
  )
}
