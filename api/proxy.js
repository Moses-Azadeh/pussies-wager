const FOOTBALL_KEY  = process.env.FOOTBALL_DATA_KEY
const FIREBASE_URL  = process.env.FIREBASE_URL
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*'

const rateLimitMap = new Map()
function isRateLimited(ip) {
  const now = Date.now()
  const window = 10 * 60 * 1000
  const max = 20
  const entry = rateLimitMap.get(ip) || { count: 0, start: now }
  if (now - entry.start > window) { rateLimitMap.set(ip, { count: 1, start: now }); return false }
  if (entry.count >= max) return true
  entry.count++
  rateLimitMap.set(ip, entry)
  return false
}

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN)
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
}

// Map football-data.org team names to our canonical names
const TEAM_NAME_MAP = {
  'Korea Republic': 'South Korea', 'Republic of Korea': 'South Korea',
  'Bosnia and Herzegovina': 'Bosnia-Herzegovina', 'Bosnia & Herzegovina': 'Bosnia-Herzegovina',
  "Côte d'Ivoire": 'Ivory Coast', 'Cote d\'Ivoire': 'Ivory Coast',
  'Türkiye': 'Turkey', 'Turkiye': 'Turkey',
  'Curaçao': 'Curacao',
  'Congo DR': 'DR Congo', 'Democratic Republic of Congo': 'DR Congo', 'Congo, DR': 'DR Congo',
  'Cabo Verde': 'Cape Verde',
  'IR Iran': 'Iran', 'Islamic Republic of Iran': 'Iran',
  'United States': 'USA', 'United States of America': 'USA', 'USA': 'USA',
  'Czech Republic': 'Czechia',
  'Scotland': 'Scotland', 'England': 'England',
}

function normTeam(name) {
  return TEAM_NAME_MAP[name] || name
}

// Map football-data.org round names to our stage keys
function mapStage(round) {
  if (!round) return 'gs'
  const r = round.toLowerCase()
  if (r.includes('group')) return 'gs'
  if (r.includes('round of 32') || r.includes('round of thirty-two')) return 'r32'
  if (r.includes('round of 16') || r.includes('round of sixteen') || r.includes('last 16')) return 'r16'
  if (r.includes('quarter')) return 'qf'
  if (r.includes('semi')) return 'sf'
  if (r.includes('final') && !r.includes('semi') && !r.includes('quarter')) return 'f'
  return 'gs'
}

export default async function handler(req, res) {
  cors(res)
  if (req.method === 'OPTIONS') return res.status(200).end()

  const { action } = req.query

  // ── Fetch live WC matches from football-data.org ───────────────────────────
  if (action === 'fetch-matches') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

    const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown'
    if (isRateLimited(ip)) return res.status(429).json({ error: 'Too many requests — wait a few minutes' })

    if (!FOOTBALL_KEY) {
      return res.status(500).json({ error: 'FOOTBALL_DATA_KEY not configured — add it in Vercel environment variables' })
    }

    try {
      // FIFA World Cup 2026 competition code is WC, season 2026
      const response = await fetch('https://api.football-data.org/v4/competitions/WC/matches?season=2026', {
        headers: { 'X-Auth-Token': FOOTBALL_KEY }
      })

      if (!response.ok) {
        const err = await response.text()
        return res.status(502).json({ error: `football-data.org error: ${response.status}`, detail: err })
      }

      const data = await response.json()
      const rawMatches = data.matches || []

      const WC_TEAMS = new Set([
        "Mexico","South Africa","South Korea","Czechia",
        "Canada","Bosnia-Herzegovina","Qatar","Switzerland",
        "Brazil","Morocco","Haiti","Scotland",
        "USA","Paraguay","Australia","Turkey",
        "Germany","Curacao","Ivory Coast","Ecuador",
        "Netherlands","Japan","Sweden","Tunisia",
        "Belgium","Egypt","Iran","New Zealand",
        "Spain","Cape Verde","Saudi Arabia","Uruguay",
        "France","Senegal","Iraq","Norway",
        "Argentina","Algeria","Austria","Jordan",
        "Portugal","DR Congo","Uzbekistan","Colombia",
        "England","Croatia","Ghana","Panama"
      ])

      const unrecognised = new Set()

      const matches = rawMatches.map(m => {
        const rawHome = m.homeTeam?.name || ''
        const rawAway = m.awayTeam?.name || ''
        const team1 = normTeam(rawHome)
        const team2 = normTeam(rawAway)
        const status = m.status
        const live = status === 'LIVE' || status === 'IN_PLAY' || status === 'PAUSED'
        const finished = status === 'FINISHED'
        const winner = finished
          ? (m.score?.winner === 'HOME_TEAM' ? team1
            : m.score?.winner === 'AWAY_TEAM' ? team2
            : null)
          : null

        // Track unrecognised names
        if (rawHome && !WC_TEAMS.has(team1)) unrecognised.add(`"${rawHome}" → "${team1}"`)
        if (rawAway && !WC_TEAMS.has(team2)) unrecognised.add(`"${rawAway}" → "${team2}"`)

        return {
          team1, team2,
          stage: mapStage(m.stage || m.group || ''),
          date: m.utcDate || new Date().toISOString(),
          live, winner,
        }
      }).filter(m => m.team1 && m.team2)

      return res.status(200).json({
        matches,
        unrecognised: [...unrecognised],
      })

    } catch (e) {
      return res.status(500).json({ error: e.message })
    }
  }

  // ── Firebase proxy — read ──────────────────────────────────────────────────
  if (action === 'db-get') {
    if (!FIREBASE_URL) return res.status(500).json({ error: 'FIREBASE_URL not configured' })
    try {
      const r = await fetch(`${FIREBASE_URL}/game.json`)
      const data = await r.json()
      return res.status(200).json({ data })
    } catch (e) {
      return res.status(500).json({ error: e.message })
    }
  }

  // ── Firebase proxy — write ─────────────────────────────────────────────────
  if (action === 'db-set') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
    if (!FIREBASE_URL) return res.status(500).json({ error: 'FIREBASE_URL not configured' })
    try {
      const body = req.body
      const r = await fetch(`${FIREBASE_URL}/game.json`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await r.json()
      return res.status(200).json({ ok: true, data })
    } catch (e) {
      return res.status(500).json({ error: e.message })
    }
  }

  return res.status(404).json({ error: 'Unknown action' })
}
