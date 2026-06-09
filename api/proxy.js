const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY
const FIREBASE_URL  = process.env.FIREBASE_URL
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*'

const rateLimitMap = new Map()
function isRateLimited(ip) {
  const now = Date.now()
  const window = 10 * 60 * 1000
  const max = 10
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

async function callAnthropic(body, headers = {}) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
      ...headers,
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Anthropic ${res.status}: ${err}`)
  }
  return res.json()
}

export default async function handler(req, res) {
  cors(res)
  if (req.method === 'OPTIONS') return res.status(200).end()

  const { action } = req.query

  // ── Fetch live WC matches ──────────────────────────────────────────────────
  if (action === 'fetch-matches') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

    const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown'
    if (isRateLimited(ip)) return res.status(429).json({ error: 'Too many requests — wait a few minutes' })
    if (!ANTHROPIC_KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' })

    try {
      const WC_TEAMS = [
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

      const prompt = `You are a World Cup 2026 data assistant. Today is ${new Date().toISOString().split('T')[0]}.

The FIFA World Cup 2026 group stage started on June 11, 2026. Search for the latest match results and upcoming fixtures.

Return ONLY a valid JSON array. No markdown, no backticks, no explanation — just the raw JSON array.

Each match object must have exactly these fields:
- team1: string (use exact team names from this list: ${WC_TEAMS.join(', ')})
- team2: string (same list)
- stage: "gs" for group stage, "r32" for round of 32, "r16" for round of 16, "qf" for quarter-final, "sf" for semi-final, "f" for final
- date: ISO date string (e.g. "2026-06-11T20:00:00Z")
- live: boolean — true ONLY if the match is happening right now at this exact moment
- winner: string or null — MUST be null if live is true. Only set to the winning team's name when the match is completely finished (after full time, extra time, and penalties if needed)

Include: all completed group stage matches with correct winners, plus upcoming fixtures for the next 7 days.
Maximum 60 matches total.

Return [] if no matches have been played yet.`

      // Step 1: initial call with web search tool
      const messages = [{ role: 'user', content: prompt }]
      const tools = [{ type: 'web_search_20250305', name: 'web_search' }]

      let data = await callAnthropic({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 4000,
        tools,
        messages,
      }, { 'anthropic-beta': 'web-search-2025-03-05' })

      // Step 2: handle tool use loop (web search may require multiple turns)
      let iterations = 0
      while (data.stop_reason === 'tool_use' && iterations < 5) {
        iterations++
        const assistantMsg = { role: 'assistant', content: data.content }
        
        // Build tool results
        const toolResults = []
        for (const block of data.content) {
          if (block.type === 'tool_use') {
            // The web_search tool is server-side — Anthropic handles it
            // We just need to pass back an empty tool_result to continue
            toolResults.push({
              type: 'tool_result',
              tool_use_id: block.id,
              content: 'Search completed by Anthropic servers.',
            })
          }
        }

        const userToolMsg = { role: 'user', content: toolResults }
        messages.push(assistantMsg, userToolMsg)

        data = await callAnthropic({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 4000,
          tools,
          messages,
        }, { 'anthropic-beta': 'web-search-2025-03-05' })
      }

      // Step 3: extract text from final response
      const text = (data.content || [])
        .filter(c => c.type === 'text')
        .map(c => c.text)
        .join('')

      const clean = text.replace(/```json|```/g, '').trim()
      
      // Find JSON array in the response
      const arrayMatch = clean.match(/\[[\s\S]*\]/)
      if (!arrayMatch) {
        return res.status(200).json({ matches: [], debug: clean.slice(0, 300) })
      }

      let parsed
      try { parsed = JSON.parse(arrayMatch[0]) }
      catch { return res.status(200).json({ matches: [], debug: clean.slice(0, 300) }) }

      if (!Array.isArray(parsed)) return res.status(200).json({ matches: [] })

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
