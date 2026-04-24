import './LayerToggle.css'

const LAYERS = [
  { id: 'traffic',      label: 'Traffic',            color: '#FF453A', type: 'line' },
  { id: 'wms',          label: 'Population Heatmap', color: '#0A84FF', type: 'raster' },
  { id: 'accessibility', label: 'Accessibility',     color: '#30D158', type: 'raster' },
  { id: 'transport',    label: 'Transit',           color: '#5E5CE6', type: 'raster' },
]

export default function LayerToggle({ active, onToggle, opacities, onOpacityChange, densityStatus }) {
  return (
    <div className="layer-toggle">
      {LAYERS.map(layer => {
        const isActive = active[layer.id]
        return (
          <div key={layer.id} className="layer-item">
            <button
              className={`pill-btn ${isActive ? 'active' : ''}`}
              onClick={() => onToggle(layer.id)}
            >
              <span className="pill-dot" style={{ '--dot-color': layer.color }} />
              <span>{layer.label}</span>
            </button>
            
            {isActive && opacities && (
              <div className="opacity-slider-wrapper">
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={opacities[layer.id] * 100}
                  onChange={(e) => onOpacityChange(layer.id, e.target.value / 100)}
                  className="opacity-slider"
                  style={{ '--accent-color': layer.color }}
                />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
