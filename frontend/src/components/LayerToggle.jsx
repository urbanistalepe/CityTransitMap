import './LayerToggle.css'

const LAYERS = [
  { id: 'traffic',  label: 'Traffic',            color: '#FF453A' },
  { id: 'density',  label: 'Population Density',  color: '#fd8d3c' },
  { id: 'wms',      label: 'Heatmap Población',  color: '#0A84FF' },
]

export default function LayerToggle({ active, onToggle, densityStatus }) {
  return (
    <div className="layer-toggle">
      {LAYERS.map(layer => (
        <button
          key={layer.id}
          className={`pill-btn ${active[layer.id] ? 'active' : ''}`}
          onClick={() => onToggle(layer.id)}
        >
          <span className="pill-dot" style={{ '--dot-color': layer.color }} />
          <span>{layer.label}</span>
          {layer.id === 'density' && active.density && densityStatus && (
            <span className="pill-status">{densityStatus}</span>
          )}
        </button>
      ))}
    </div>
  )
}
