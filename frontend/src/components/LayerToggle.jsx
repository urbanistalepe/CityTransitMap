import './LayerToggle.css'

const LAYERS = [
  { id: 'traffic',      label: 'Traffic',            color: '#FF453A' },
  { id: 'wms',          label: 'Heatmap Población',  color: '#0A84FF' },
  { id: 'accessibility', label: 'Accesibilidad',     color: '#30D158' },
  { id: 'transport',    label: 'Transporte',        color: '#5E5CE6' },
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
