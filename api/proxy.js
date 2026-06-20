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
  'Korea Republic': 'South Korea', 'Republic of Korea': 'South Korea', 'Korea Rep.': 'South Korea', 'Korea Rep': 'South Korea',
  'Bosnia and Herzegovina': 'Bosnia-Herzegovina', 'Bosnia & Herzegovina': 'Bosnia-Herzegovina', 'Bosnia': 'Bosnia-Herzegovina', 'Bosnia and Herzegowina': 'Bosnia-Herzegovina',
  "Côte d'Ivoire": 'Ivory Coast', "Cote d'Ivoire": 'Ivory Coast', 'Cote dIvoire': 'Ivory Coast', 'Ivory Coast': 'Ivory Coast',
  'Türkiye': 'Turkey', 'Turkiye': 'Turkey',
  'Curaçao': 'Curacao',
  'Congo DR': 'DR Congo', 'Democratic Republic of Congo': 'DR Congo', 'Congo, DR': 'DR Congo', 'Congo (DR)': 'DR Congo', 'Democratic Republic of the Congo': 'DR Congo',
  'Cabo Verde': 'Cape Verde',
  'IR Iran': 'Iran', 'Islamic Republic of Iran': 'Iran',
  'United States': 'USA', 'United States of America': 'USA',
  'Czech Republic': 'Czechia',
  'Holland': 'Netherlands',
  'KSA': 'Saudi Arabia',
  'RSA': 'South Africa',
}

// Canonical team list — the single source of truth
const CANONICAL_TEAMS = [
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
]

// Strip accents, lowercase, remove punctuation — for fuzzy matching
function fuzzyKey(s) {
  return (s || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // strip accents
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '') // remove spaces, hyphens, punctuation
}

// Build a fuzzy lookup from canonical names + all known aliases
const FUZZY_LOOKUP = {}
CANONICAL_TEAMS.forEach(t => { FUZZY_LOOKUP[fuzzyKey(t)] = t })
Object.entries(TEAM_NAME_MAP).forEach(([variant, canonical]) => {
  FUZZY_LOOKUP[fuzzyKey(variant)] = canonical
})
// Extra fuzzy aliases that punctuation-stripping alone won't catch
const EXTRA_FUZZY = {
  'korearepublic': 'South Korea', 'republicofkorea': 'South Korea', 'southkorea': 'South Korea',
  'czechrepublic': 'Czechia',
  'unitedstates': 'USA', 'unitedstatesofamerica': 'USA', 'usa': 'USA', 'usmnt': 'USA',
  'caboverde': 'Cape Verde',
  'congodr': 'DR Congo', 'drcongo': 'DR Congo', 'democraticrepublicofcongo': 'DR Congo', 'democraticrepublicofthecongo': 'DR Congo',
  'cotedivoire': 'Ivory Coast', 'ivorycoast': 'Ivory Coast',
  'bosniaandherzegovina': 'Bosnia-Herzegovina', 'bosniaherzegovina': 'Bosnia-Herzegovina',
  'turkiye': 'Turkey', 'turkey': 'Turkey',
  'iriran': 'Iran', 'islamicrepublicofiran': 'Iran',
}
Object.entries(EXTRA_FUZZY).forEach(([k, v]) => { FUZZY_LOOKUP[k] = v })

function normTeam(name) {
  if (!name) return ''
  // 1. Exact alias match
  if (TEAM_NAME_MAP[name]) return TEAM_NAME_MAP[name]
  // 2. Exact canonical match
  if (CANONICAL_TEAMS.includes(name)) return name
  // 3. Fuzzy match (accent/case/punctuation-insensitive)
  const fk = fuzzyKey(name)
  if (FUZZY_LOOKUP[fk]) return FUZZY_LOOKUP[fk]
  // 4. No match — return original so it's flagged
  return name
}

// Map football-data.org stage enum to our stage keys
// football-data.org uses: GROUP_STAGE, LAST_16, QUARTER_FINALS, SEMI_FINALS, FINAL
// (the 2026 format also has a round of 32 — may appear as ROUND_OF_32 or LAST_32)
function mapStage(stage, group) {
  const s = (stage || '').toUpperCase()
  if (s.includes('GROUP') || group) return 'gs'
  if (s.includes('LAST_32') || s.includes('ROUND_OF_32') || s.includes('32')) return 'r32'
  if (s.includes('LAST_16') || s.includes('ROUND_OF_16') || s.includes('16')) return 'r16'
  if (s.includes('QUARTER')) return 'qf'
  if (s.includes('SEMI')) return 'sf'
  if (s.includes('FINAL') && !s.includes('SEMI') && !s.includes('QUARTER')) return 'f'
  if (s.includes('3RD') || s.includes('THIRD')) return 'sf' // third-place playoff → treat as SF-level
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
      const rawMatches = Array.isArray(data.matches) ? data.matches : []

      const WC_TEAMS = new Set(CANONICAL_TEAMS)
      const unrecognised = new Set()

      const statusCounts = {}
      let finishedNoWinnerCount = 0

      const matches = rawMatches.map(m => {
        const rawHome = m.homeTeam?.name || m.homeTeam?.shortName || ''
        const rawAway = m.awayTeam?.name || m.awayTeam?.shortName || ''
        const team1 = normTeam(rawHome)
        const team2 = normTeam(rawAway)
        const status = (m.status || '').toUpperCase()
        statusCounts[status] = (statusCounts[status] || 0) + 1
        const live = ['LIVE', 'IN_PLAY', 'PAUSED'].includes(status)
        const finished = ['FINISHED', 'AWARDED'].includes(status)
        const scoreWinner = m.score?.winner // 'HOME_TEAM' | 'AWAY_TEAM' | 'DRAW' | null
        const winner = finished
          ? (scoreWinner === 'HOME_TEAM' ? team1
            : scoreWinner === 'AWAY_TEAM' ? team2
            : null) // DRAW or missing winner field — no payout, but still "finished"
          : null
        if (finished && !winner) finishedNoWinnerCount++

        // Track unrecognised names — store the EXACT raw string so it can be mapped
        if (rawHome && !WC_TEAMS.has(team1)) unrecognised.add(rawHome)
        if (rawAway && !WC_TEAMS.has(team2)) unrecognised.add(rawAway)

        return {
          team1, team2,
          stage: mapStage(m.stage, m.group),
          date: m.utcDate || new Date().toISOString(),
          live, finished, winner,
        }
      }).filter(m => m.team1 && m.team2 && WC_TEAMS.has(m.team1) && WC_TEAMS.has(m.team2))

      return res.status(200).json({
        matches,
        unrecognised: [...unrecognised],
        totalReturned: rawMatches.length,
        statusCounts,        // e.g. { SCHEDULED: 50, FINISHED: 14, DRAW... }
        finishedNoWinnerCount, // finished matches with no winner (draws or missing data)
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
