export async function etaSeconds(lat1: number, lng1: number, lat2: number, lng2: number): Promise<number | null> {
  if (!process.env.MAPBOX_TOKEN) return null
  const url = `https://api.mapbox.com/directions-matrix/v1/mapbox/driving/${lng1},${lat1};${lng2},${lat2}?access_token=${process.env.MAPBOX_TOKEN}`
  const res = await fetch(url)
  if (!res.ok) return null
  const j = await res.json()
  const s = j?.durations?.[0]?.[1]
  return typeof s === 'number' ? s : null
}
