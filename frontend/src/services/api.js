const BASE = '/api'

export async function fetchCities() {
  const res = await fetch(`${BASE}/cities`)
  if (!res.ok) throw new Error('Could not load cities')
  return res.json()
}

export async function fetchDensity(cityId) {
  const res = await fetch(`${BASE}/density?city=${cityId}`)
  if (!res.ok) throw new Error(`Could not load density for ${cityId}`)
  return res.json()
}
