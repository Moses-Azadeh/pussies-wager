// All DB and API calls go through /api/proxy — keys never leave the server

const BASE = '/api/proxy'

async function apiFetch(action, body) {
  const opts = {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  }
  const res = await fetch(`${BASE}?action=${action}`, opts)
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
  return res.json()
}

export async function dbGet() {
  const { data } = await apiFetch('db-get')
  return data
}

export async function dbSet(value) {
  await apiFetch('db-set', value)
}

// Real-time subscription using Firebase SSE directly
// Firebase URL is stored in the game state after first load — we read it from env once
const FIREBASE_URL = import.meta.env.VITE_FIREBASE_URL

export function dbSubscribe(callback) {
  if (!FIREBASE_URL) {
    console.warn('VITE_FIREBASE_URL not set — real-time updates disabled')
    return () => {}
  }
  // Firebase Realtime Database SSE
  const es = new EventSource(`${FIREBASE_URL}/game.json`)
  es.addEventListener('put', e => {
    try { callback(JSON.parse(e.data)?.data ?? null) } catch {}
  })
  es.onerror = () => {} // silently reconnect
  return () => es.close()
}

export async function fetchLiveMatches() {
  const { matches, error } = await apiFetch('fetch-matches', {})
  if (error) throw new Error(error)
  return matches || []
}
