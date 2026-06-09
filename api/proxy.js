// Vercel serverless function — secure backend proxy
// Keeps API keys server-side, handles CORS, rate-limits fetch requests

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY
const FIREBASE_URL  = process.env.FIREBASE_URL
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*'

// Simple in-memory rate limit: max 10 fetch calls per 10 minutes per IP
const rateLimitMap = new Map()
function isRateLimited(ip) {
  const now = Date.now()
  const window = 10 * 60 * 1000
  const max = 10
  const entry = rateLimitMap.get(ip) || { count: 0, start: now }
  if (now - entry.start > window) {
    rateLimitMap.set(ip, { count: 1, start: now })
    return false
  }
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

export default async function handler(req, res) {
  cors(res)
  if (req.method === 'OPTIONS') return res.status(200).end()

  const { action } = req.query

  // ── Fetch live WC matches ──────────────────────────────────────────────────
  if (action === 'fetch-matches') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

    const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown'
    if (isRateLimited(ip)) {
      return res.status(429).json({ error: 'Too many requests — wait a few minutes' })
    }

    if (!ANTHROPIC_KEY) {
      return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured on server' })
    }

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_KEY,
          'anthropic-version': '2023-06-01',
          'anthropic-beta': 'web-search-2025-03-05',
        },
        body: JSON.stringify({
          model: 'claude-opus-4-5',
          max_tokens: 2000,
          tools: [{ type: 'web_search_20250305', name: 'web_search' }],
          messages: [{
            role: 'user',
            content: `Search for the latest FIFA World Cup 2026 match results and upcoming fixtures. Use the exact official FIFA team names. Return ONLY a raw JSON array — no markdown, no backticks, no explanation whatsoever. Each object must have: { "team1": string, "team2": string, "stage": one of "gs" (group stage) / "r32" / "r16" / "qf" / "sf" / "f" (final), "date": ISO string, "live": boolean (true ONLY if the match is happening right now), "winner": string or null (MUST be null if live:true, only set to team name when match is 100% finished including extra time and penalties) }. Include all completed matches and upcoming group stage fixtures. Max 60 matches. If the 2026 World Cup has not yet started return [].`
          }]
        })
      })

      if (!response.ok) {
        const err = await response.text()
        return res.status(502).json({ error: `Anthropic error: ${response.status}`, detail: err })
      }

      const data = await response.json()
      const text = (data.content || []).map(c => c.text || '').join('')
      const clean = text.replace(/```json|```/g, '').trim()

      let parsed
      try { parsed = JSON.parse(clean) }
      catch { return res.status(502).json({ error: 'Could not parse match data', raw: clean.slice(0, 200) }) }

      if (!Array.isArray(parsed)) return res.status(502).json({ error: 'Unexpected response format' })

      return res.status(200).json({ matches: parsed })

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
        body: JSON.stringify(body)
      })
      const data = await r.json()
      return res.status(200).json({ ok: true, data })
    } catch (e) {
      return res.status(500).json({ error: e.message })
    }
  }

  return res.status(404).json({ error: 'Unknown action' })
}
