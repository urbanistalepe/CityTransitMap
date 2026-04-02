import { useState, useRef, useEffect } from 'react'
import './CitySelector.css'

export default function CitySelector({ cities, activeCity, onSelect }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const handler = (e) => { if (!ref.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const active = cities.find(c => c.id === activeCity)

  return (
    <div className="city-selector" ref={ref}>
      <button className="city-trigger" onClick={() => setOpen(o => !o)}>
        <span className="city-trigger-icon">⌖</span>
        <span className="city-trigger-name">{active?.name ?? 'Select city'}</span>
        <span className={`city-trigger-arrow ${open ? 'open' : ''}`}>›</span>
      </button>

      {open && (
        <div className="city-dropdown">
          {cities.map(city => (
            <button
              key={city.id}
              className={`city-option ${city.id === activeCity ? 'active' : ''}`}
              onClick={() => { onSelect(city.id); setOpen(false) }}
            >
              <span className="city-option-name">{city.name}</span>
              <span className="city-option-country">{city.country}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
