import { useMemo } from 'react'

/**
 * Calculates distance between two coordinates in km using Haversine formula.
 */
function getDistance(c1, c2) {
  const R = 6371 // Earth radius in km
  const dLat = (c2[1] - c1[1]) * (Math.PI / 180)
  const dLon = (c2[0] - c1[0]) * (Math.PI / 180)
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(c1[1] * (Math.PI / 180)) * Math.cos(c2[1] * (Math.PI / 180)) * 
    Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

export default function TransitKPIs({ lines, referenceCosts }) {
  const stats = useMemo(() => {
    if (!referenceCosts || referenceCosts.length === 0) return null

    let totalGlobalCost = 0
    let totalGlobalDistance = 0
    let totalGlobalStations = 0

    const lineStats = lines.map(line => {
      // 1. Calculate distance
      let distance = 0
      for (let i = 0; i < line.stops.length - 1; i++) {
        distance += getDistance(line.stops[i].coords, line.stops[i+1].coords)
      }

      // 2. Find matching cost category
      const modeMap = {
        'metro': 'Heavy Rail',
        'bus': 'Bus',
        'rail': 'Commuter Rail',
        'tram': 'Light Rail (Surface/Elevated)'
      }
      const categoryName = modeMap[line.medium] || 'Bus'
      const costRef = referenceCosts.find(c => c.category === categoryName) || referenceCosts[0]

      // 3. Calculate breakdown
      const trackCost = distance * (costRef.cost_km || 0)
      const stationCost = line.stops.length * (costRef.cost_station || 0)
      const subtotal = trackCost + stationCost
      const profServices = subtotal * (costRef.prof_services_pct || 0.25)
      const totalLineCost = subtotal + profServices

      totalGlobalCost += totalLineCost
      totalGlobalDistance += distance
      totalGlobalStations += line.stops.length

      return {
        id: line.id,
        name: line.name,
        color: line.color,
        distance,
        stations: line.stops.length,
        cost: totalLineCost
      }
    })

    return {
      lines: lineStats,
      totalCost: totalGlobalCost,
      totalDistance: totalGlobalDistance,
      totalStations: totalGlobalStations
    }
  }, [lines, referenceCosts])

  if (!stats || stats.totalDistance === 0) return null

  return (
    <div className="transit-kpis">
      <div className="kpi-header">Estimated Budget (MBTA Benchmark)</div>
      
      <div className="kpi-summary">
        <div className="kpi-main-val">
          ${(stats.totalCost / 1e6).toFixed(1)}M
        </div>
        <div className="kpi-main-label">Total Estimated Cost</div>
      </div>

      <div className="kpi-grid">
        <div className="kpi-item">
          <div className="kpi-val">{stats.totalDistance.toFixed(2)} km</div>
          <div className="kpi-label">Extension</div>
        </div>
        <div className="kpi-item">
          <div className="kpi-val">{stats.totalStations}</div>
          <div className="kpi-label">Stations</div>
        </div>
      </div>

      <div className="kpi-breakdown">
        {stats.lines.filter(l => l.distance > 0).map(l => (
          <div key={l.id} className="kpi-line-row">
            <span className="kpi-line-dot" style={{ background: l.color }} />
            <span className="kpi-line-name">{l.name}</span>
            <span className="kpi-line-cost">${(l.cost / 1e6).toFixed(2)}M</span>
          </div>
        ))}
      </div>
      
      <div className="kpi-disclaimer">
        * Based on average costs per km/station from representative MBTA cost benchmarks.
      </div>
    </div>
  )
}
