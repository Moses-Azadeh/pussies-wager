import { useState, useEffect, useCallback, useRef } from 'react'
import { ALL_TEAMS, TEAM_MAP, STAGES, PLAYER_COLORS, BET_AMOUNT, MAX_PLAYERS } from './data.js'
import { runDraft, findMicroBet, findMicroBets, calcLeaderboard, calcDebts, fairShuffle } from './logic.js'
import { dbGet, dbSet, dbSubscribe, fetchLiveMatches } from './storage.js'
import { css, Btn, Input, Sel, Card, Badge, Dot, Avatar, LiveDot, SectionHead, Tabs, DragList, MatchCard } from './ui.jsx'

const LOCAL_NAME_KEY  = 'wager_my_name'
const LOCAL_PIN_KEY   = 'wager_my_pin'

// ── Team name aliases (AI may return variants) ────────────────────────────────
// Covers all official FIFA 2026 teams and common AI/API name variants
const TEAM_ALIASES = {
  // South Korea
  'korea republic': 'South Korea',
  'republic of korea': 'South Korea',
  'korea rep.': 'South Korea',
  'korea rep': 'South Korea',

  // USA
  'united states': 'USA',
  'united states of america': 'USA',
  'u.s.a.': 'USA',
  'u.s.': 'USA',

  // Bosnia
  'bosnia and herzegovina': 'Bosnia-Herzegovina',
  'bosnia & herzegovina': 'Bosnia-Herzegovina',
  'bosnia': 'Bosnia-Herzegovina',

  // Ivory Coast
  "côte d'ivoire": 'Ivory Coast',
  "cote d'ivoire": 'Ivory Coast',
  'cote divoire': 'Ivory Coast',

  // Turkey
  'türkiye': 'Turkey',
  'turkiye': 'Turkey',

  // Curacao
  'curaçao': 'Curacao',

  // DR Congo
  'congo dr': 'DR Congo',
  'democratic republic of congo': 'DR Congo',
  'dr. congo': 'DR Congo',
  'congo, dr': 'DR Congo',
  'congo democratic republic': 'DR Congo',

  // Cape Verde
  'cabo verde': 'Cape Verde',

  // Iran
  'ir iran': 'Iran',
  'islamic republic of iran': 'Iran',

  // Scotland / England flags
  'scotland': 'Scotland',
  'england': 'England',
}
function normalise(raw) {
  if (!raw) return raw
  const lower = raw.trim().toLowerCase()
  if (TEAM_ALIASES[lower]) return TEAM_ALIASES[lower]
  const direct = ALL_TEAMS.find(t => t.name.toLowerCase() === lower)
  return direct ? direct.name : raw.trim()
}

// ── Optimistic DB write with retry ───────────────────────────────────────────
// Uses a ref to always have the latest game state, preventing race conditions
async function safeWrite(getLatest, patch, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const fresh = await dbGet()
      const next = { ...(fresh || getLatest()), ...patch }
      await dbSet(next)
      return next
    } catch (e) {
      if (i === retries - 1) throw e
      await new Promise(r => setTimeout(r, 300 * (i + 1)))
    }
  }
}

// ── MODALS ───────────────────────────────────────────────────────────────────
function Modal({ children }) {
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.8)', zIndex:1000,
      display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>
      <div style={{ background:'var(--surface)', border:'1px solid var(--border2)',
        borderRadius:16, padding:24, maxWidth:360, width:'100%' }}>
        {children}
      </div>
    </div>
  )
}

function ConfirmModal({ message, onConfirm, onCancel, danger }) {
  return (
    <Modal>
      <p style={{ fontSize:14, lineHeight:1.7, marginBottom:20, color:'var(--text)' }}>{message}</p>
      <div style={{ display:'flex', gap:10 }}>
        <Btn onClick={onCancel} variant="ghost" full>Cancel</Btn>
        <Btn onClick={onConfirm} variant={danger ? 'danger' : 'primary'} full>Confirm</Btn>
      </div>
    </Modal>
  )
}

function DraftHistoryModal({ game, getColor, onClose }) {
  const { priorityOrder, assignments, rankings } = game
  const picks = []
  const taken = new Set()
  const queue = [...(priorityOrder || [])]
  while (taken.size < 48 && queue.length > 0) {
    const player = queue.shift()
    const ranked = rankings[player] || ALL_TEAMS.map(t => t.name)
    const pick = ranked.find(t => !taken.has(t))
    if (pick) { picks.push({ player, team: pick, overall: picks.length + 1 }); taken.add(pick); queue.push(player) }
  }
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.9)', zIndex:1000,
      display:'flex', flexDirection:'column' }}>
      <div style={{ maxWidth:560, margin:'0 auto', width:'100%', display:'flex',
        flexDirection:'column', height:'100%' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
          padding:'20px 16px 14px' }}>
          <div>
            <div style={{ fontFamily:'var(--fd)', fontWeight:900, fontSize:22 }}>Draft History</div>
            <div style={{ fontSize:11, color:'var(--dim)', marginTop:3 }}>
              Priority: {(priorityOrder || []).join(' → ')}
            </div>
          </div>
          <Btn onClick={onClose} variant="ghost" small>✕ Close</Btn>
        </div>
        <div style={{ flex:1, overflowY:'auto', padding:'0 16px 40px' }}>
          {picks.map((p, i) => {
            const t = TEAM_MAP[p.team] || { flag:'🏴', group:'?' }
            const col = getColor(p.player)
            return (
              <div key={i} style={{ display:'flex', alignItems:'center', gap:10,
                padding:'9px 14px', borderRadius:9, marginBottom:4,
                background:'var(--surface)', border:'1px solid var(--border)' }}>
                <span style={{ color:'var(--dim)', fontSize:10, fontFamily:'var(--fd)',
                  fontWeight:700, minWidth:26, textAlign:'right' }}>#{p.overall}</span>
                <Avatar name={p.player} color={col} size={26}/>
                <span style={{ fontFamily:'var(--fd)', fontWeight:700, fontSize:15,
                  color:col, flex:1 }}>{p.player}</span>
                <span style={{ fontSize:18 }}>{t.flag}</span>
                <span style={{ fontFamily:'var(--fd)', fontWeight:700, fontSize:15 }}>{p.team}</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── APP ───────────────────────────────────────────────────────────────────────
export default function App() {
  // Identity
  const [myName, setMyName]         = useState('')
  const [myPin, setMyPin]           = useState('')
  const [nameInput, setNameInput]   = useState('')
  const [pinInput, setPinInput]     = useState('')
  const [pinConfirm, setPinConfirm] = useState('')
  const [joinError, setJoinError]   = useState('')
  const [isReturning, setIsReturning] = useState(false) // true = login, false = new join

  // Game state
  const [game, setGame]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [saveError, setSaveError] = useState('')
  const [lastSync, setLastSync]   = useState(null)
  const gameRef = useRef(null)

  // UI
  const [screen, setScreen]           = useState('home')
  const [tab, setTab]                 = useState('wagers')
  const [stageFilter, setStageFilter] = useState('all')
  const [matchForm, setMatchForm]     = useState({ team1:'', team2:'', stage:'gs', winner:'' })
  const [fetchingLive, setFetchingLive] = useState(false)
  const [liveMsg, setLiveMsg]           = useState('')
  const [confirm, setConfirm]           = useState(null)
  const [showDraftHistory, setShowDraftHistory] = useState(false)
  const [offlineWarning, setOfflineWarning]     = useState(false)

  const getColor = useCallback((name) => {
    const i = (game?.players || []).indexOf(name)
    return PLAYER_COLORS[i >= 0 ? i % PLAYER_COLORS.length : 0]
  }, [game])

  // Keep gameRef in sync for safe writes
  useEffect(() => { gameRef.current = game }, [game])

  // ── Load & subscribe ──────────────────────────────────────────────────────
  useEffect(() => {
    dbGet().then(data => {
      const init = data || {
        phase:'lobby', players:[], pins:{}, rankings:{},
        priorityOrder:[], assignments:{}, matches:[],
        liveMatches:[], lastLiveFetch:null, adminName:null
      }
      if (!data) dbSet(init)
      setGame(init)
      gameRef.current = init

      // Auto-login: if PIN saved locally and still valid in DB, log straight in
      const savedName = localStorage.getItem(LOCAL_NAME_KEY)
      const savedPin  = localStorage.getItem(LOCAL_PIN_KEY)
      if (savedName && savedPin) {
        if (init.players?.includes(savedName) && init.pins?.[savedName] === savedPin) {
          // Valid session — log in automatically, no screen shown
          setMyName(savedName)
          setMyPin(savedPin)
        } else {
          // Stale session (game reset, or PIN changed) — clear silently
          localStorage.removeItem(LOCAL_NAME_KEY)
          localStorage.removeItem(LOCAL_PIN_KEY)
        }
      }

      setLoading(false)
    }).catch(() => { setLoading(false); setOfflineWarning(true) })

    const unsub = dbSubscribe(data => {
      if (data) { setGame(data); gameRef.current = data; setLastSync(new Date()) }
    })
    return unsub
  }, [])

  // ── Push with race-condition-safe write ───────────────────────────────────
  const push = useCallback(async (patch) => {
    setSaving(true)
    setSaveError('')
    try {
      const next = await safeWrite(() => gameRef.current, patch)
      setGame(next)
      gameRef.current = next
      setLastSync(new Date())
    } catch (e) {
      setSaveError('Save failed — check your connection')
      setOfflineWarning(true)
    }
    setSaving(false)
  }, [])

  // ── Join (new player) ─────────────────────────────────────────────────────
  const handleJoin = async () => {
    const name = nameInput.trim()
    const pin  = pinInput.trim()
    if (!name)          return setJoinError('Enter your name')
    if (name.length > 20) return setJoinError('Max 20 characters')
    if (pin.length < 4)  return setJoinError('PIN must be at least 4 digits')
    if (pin !== pinConfirm) return setJoinError('PINs don\'t match')
    if (!/^\d+$/.test(pin)) return setJoinError('PIN must be numbers only')

    // Fetch fresh state to check name availability
    let fresh
    try { fresh = await dbGet() } catch { return setJoinError('Connection error — try again') }

    const nameLower = name.toLowerCase()
    if (fresh?.players?.some(p => p.toLowerCase() === nameLower))
      return setJoinError('That name is already taken')
    if ((fresh?.players?.length || 0) >= MAX_PLAYERS)
      return setJoinError('Game is full (max 12 players)')
    if (fresh?.phase === 'live')
      return setJoinError('The draft has already run — you can\'t join now')

    localStorage.setItem(LOCAL_NAME_KEY, name)
    localStorage.setItem(LOCAL_PIN_KEY, pin)
    setMyName(name); setMyPin(pin); setJoinError('')

    const newPlayers = [...(fresh?.players || []), name]
    const newPins    = { ...(fresh?.pins || {}), [name]: pin }
    const adminName  = fresh?.adminName || name
    await push({ players: newPlayers, pins: newPins, adminName })
  }

  // ── Login (returning player) ───────────────────────────────────────────────
  const handleLogin = async () => {
    const name = nameInput.trim()
    const pin  = pinInput.trim()
    if (!name) return setJoinError('Enter your name')
    if (!pin)  return setJoinError('Enter your PIN')

    let fresh
    try { fresh = await dbGet() } catch { return setJoinError('Connection error — try again') }

    const match = fresh?.players?.find(p => p.toLowerCase() === name.toLowerCase())
    if (!match) return setJoinError('Name not found in this game')
    if (fresh?.pins?.[match] !== pin) return setJoinError('Wrong PIN')

    localStorage.setItem(LOCAL_NAME_KEY, match)
    localStorage.setItem(LOCAL_PIN_KEY, pin)
    setMyName(match); setMyPin(pin); setJoinError('')
    setGame(fresh); gameRef.current = fresh
  }

  // ── Rankings ──────────────────────────────────────────────────────────────
  const myRanking = game?.rankings?.[myName] || ALL_TEAMS.map(t => t.name)
  const saveRanking = (ranked) => push({ rankings: { ...(gameRef.current?.rankings || {}), [myName]: ranked } })

  // ── Draft ─────────────────────────────────────────────────────────────────
  const handleRunDraft = () => {
    setConfirm({
      message: `Run the draft now for ${game.players.length} players? This cannot be undone without resetting the entire game.`,
      danger: false,
      onConfirm: async () => {
        setConfirm(null)
        const fresh = await dbGet()
        const finalRankings = { ...(fresh?.rankings || {}) }
        fresh.players.forEach(p => {
          if (!finalRankings[p]) finalRankings[p] = ALL_TEAMS.map(t => t.name)
        })
        const shuffled   = fairShuffle(fresh.players)
        const assignments = runDraft(finalRankings, shuffled)
        await push({ rankings: finalRankings, priorityOrder: shuffled, assignments, phase: 'live' })
      }
    })
  }

  // ── Matches ───────────────────────────────────────────────────────────────
  const handleAddMatch = () => {
    if (!matchForm.team1 || !matchForm.team2 || matchForm.team1 === matchForm.team2) return
    const current = gameRef.current
    const dup = (current?.matches || []).find(m =>
      (m.team1 === matchForm.team1 && m.team2 === matchForm.team2) ||
      (m.team1 === matchForm.team2 && m.team2 === matchForm.team1)
    )
    const doAdd = () => {
      const m = { ...matchForm, id: Date.now(), manual: true }
      push({ matches: [...((gameRef.current?.matches) || []), m] })
      setMatchForm({ team1:'', team2:'', stage:'r32', winner:'' })
      setConfirm(null)
    }
    if (dup) {
      setConfirm({
        message: `${matchForm.team1} vs ${matchForm.team2} already exists. Add it again anyway?`,
        danger: false, onConfirm: doAdd,
      })
    } else { doAdd() }
  }

  const handleRemoveMatch = (id) => {
    setConfirm({
      message: 'Remove this result? Any settled bets from it will be reversed on the leaderboard.',
      danger: true,
      onConfirm: () => {
        push({ matches: (gameRef.current?.matches || []).filter(m => m.id !== id) })
        setConfirm(null)
      }
    })
  }

  // ── Live fetch ────────────────────────────────────────────────────────────
  const handleFetchLive = async () => {
    setFetchingLive(true)
    setLiveMsg('Searching for World Cup matches…')
    try {
      const result = await fetchLiveMatches()
      const raw = Array.isArray(result?.matches) ? result.matches : []
      const proxyUnrecognised = Array.isArray(result?.unrecognised) ? result.unrecognised : []
      const statusCounts = result?.statusCounts || {}
      const finishedNoWinnerCount = result?.finishedNoWinnerCount || 0
      if (raw.length === 0) {
        const statusDump = Object.entries(statusCounts).map(([k,v])=>`${k}:${v}`).join(' ')
        setLiveMsg(`No matches returned — the tournament data may not be available yet, or check the API key in settings.${statusDump ? ` (statuses seen: ${statusDump})` : ''}`)
        setFetchingLive(false)
        return
      }
      const safe = raw.map(m => ({
        ...m,
        id:       m.id || `live-${normalise(m.team1)}-${normalise(m.team2)}-${m.stage}`,
        team1:    normalise(m.team1),
        team2:    normalise(m.team2),
        finished: !!m.finished, // true once full-time/awarded — even for a draw with no winner
        winner:   m.live ? null : (m.winner ? normalise(m.winner) : null),
      }))
      // Check for still-unrecognised teams after normalisation
      const stillUnrecognised = safe
        .flatMap(m => [m.team1, m.team2])
        .filter(name => !ALL_TEAMS.find(t => t.name === name))
        .filter((v, i, a) => a.indexOf(v) === i) // unique
      const unrecognised = [...new Set([...(proxyUnrecognised || []), ...stillUnrecognised])]
      await push({ liveMatches: safe, lastLiveFetch: new Date().toISOString() })
      const finishedCount = safe.filter(m => m.finished).length
      const withWinner = safe.filter(m => m.winner).length
      const drawnCount = safe.filter(m => m.finished && !m.winner).length
      const live = safe.filter(m => m.live).length
      const withBets = safe.filter(m => findMicroBet(gameRef.current?.assignments || {}, m)).length
      let msg = `✓ ${safe.length} matches — ${finishedCount} finished (${withWinner} decided, ${drawnCount} drawn) · ${live} live · ${withBets} with wagers`
      if (unrecognised && unrecognised.length > 0) msg += ` · ⚠ Unrecognised names: ${unrecognised.join(' | ')}`
      setLiveMsg(msg)
    } catch (e) {
      setLiveMsg(`⚠ ${e.message}`)
    }
    setFetchingLive(false)
  }

  // ── Derived state ─────────────────────────────────────────────────────────
  const allMatches = [
    ...(game?.liveMatches || []).map(m => ({ ...m, source:'live' })),
    ...(game?.matches || []).filter(m =>
      !(game?.liveMatches || []).some(lm => lm.team1 === m.team1 && lm.team2 === m.team2)
    ).map(m => ({ ...m, finished: m.finished ?? Boolean(m.winner), source:'manual' })),
  ]

  const leaderboard  = game ? calcLeaderboard(game.players, game.assignments, allMatches) : {}
  const sorted       = [...(game?.players || [])].sort((a, b) => (leaderboard[b]||0) - (leaderboard[a]||0))
  const myTeams      = game?.assignments?.[myName] || []
  const ranked       = Object.keys(game?.rankings || {})
  const myNet        = leaderboard[myName] || 0
  const myRank       = sorted.indexOf(myName) + 1
  const isAdmin      = game?.adminName === myName
  const finalMatch   = allMatches.find(m => m.stage === 'f' && m.winner)
  // All owners of the winning team (could be 2 if duplicated)
  const tournamentWinners = finalMatch
    ? Object.entries(game?.assignments || {})
        .filter(([,teams]) => teams.includes(finalMatch.winner))
        .map(([p]) => p)
    : []
  const tournamentWinner = tournamentWinners[0] || null
  const myBets = allMatches
    .flatMap(m => findMicroBets(game?.assignments||{}, m).map(bet => ({ match:m, bet })))
    .filter(({ bet }) => bet.owner1===myName || bet.owner2===myName)
  const allBets = allMatches
    .flatMap(m => findMicroBets(game?.assignments||{}, m).map(bet => ({ match:m, bet })))

  // Teams per player — ceil(48/n), duplicates fill the remainder
  const teamsEach = game?.players?.length ? Math.ceil(48 / game.players.length) : 0
  const duplicateCount = game?.players?.length ? (teamsEach * game.players.length) - 48 : 0

  // Debts
  const debts = game ? calcDebts(game.players, game.assignments, allMatches) : []
  const myDebts = debts.filter(d => d.from === myName || d.to === myName)

  // ═══════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════
  if (loading) return (
    <>
      <style>{css}</style>
      <div style={{ minHeight:'100vh', display:'flex', flexDirection:'column',
        alignItems:'center', justifyContent:'center', background:'var(--bg)', gap:16 }}>
        <span style={{ fontSize:52 }}>⚽</span>
        <div style={{ fontFamily:'var(--fd)', fontWeight:900, fontSize:13,
          letterSpacing:'0.2em', color:'var(--dim)' }} className="pulse">LOADING...</div>
      </div>
    </>
  )

  return (
    <>
      <style>{css}</style>

      {/* Modals */}
      {confirm && <ConfirmModal {...confirm} onCancel={() => setConfirm(null)} />}
      {showDraftHistory && game?.phase==='live' && (
        <DraftHistoryModal game={game} getColor={getColor} onClose={() => setShowDraftHistory(false)} />
      )}

      <div style={{ minHeight:'100vh', background:'var(--bg)', paddingBottom:80 }}>

        {/* TOP BAR */}
        <div style={{ position:'sticky', top:0, zIndex:99, background:'rgba(8,12,16,0.96)',
          backdropFilter:'blur(14px)', borderBottom:'1px solid var(--border)', padding:'0 16px' }}>
          <div style={{ maxWidth:560, margin:'0 auto', height:54, display:'flex',
            alignItems:'center', justifyContent:'space-between' }}>
            <div style={{ display:'flex', alignItems:'center', gap:10, cursor:'pointer' }}
              onClick={() => setScreen('home')}>
              <span style={{ fontSize:22 }}>⚽</span>
              <div>
                <div style={{ fontFamily:'var(--fd)', fontWeight:900, fontSize:17,
                  letterSpacing:'0.1em', lineHeight:1, textTransform:'uppercase' }}>The Wager</div>
                <div style={{ fontSize:9, color:'var(--dim)', letterSpacing:'0.18em',
                  fontFamily:'var(--fd)', textTransform:'uppercase' }}>World Cup 2026</div>
              </div>
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              {saveError && <span style={{ fontSize:9, color:'var(--red)', fontFamily:'var(--fd)' }}>⚠ SAVE ERROR</span>}
              {saving && <span style={{ fontSize:9, color:'var(--dim)', fontFamily:'var(--fd)', letterSpacing:'0.1em' }} className="pulse">SAVING…</span>}
              {!saving && !saveError && lastSync && <span style={{ fontSize:9, color:'var(--green)', fontFamily:'var(--fd)', letterSpacing:'0.1em' }}>● LIVE</span>}
              {myName && <Avatar name={myName} color={getColor(myName)} size={30} />}
            </div>
          </div>
        </div>

        {/* Offline banner */}
        {offlineWarning && (
          <div style={{ background:'#FF4D6D15', borderBottom:'1px solid #FF4D6D30',
            padding:'10px 16px', textAlign:'center', fontSize:12, color:'var(--red)' }}>
            ⚠ Connection issue — changes may not be saving. Check your internet.
            <button onClick={() => setOfflineWarning(false)}
              style={{ background:'none', border:'none', color:'var(--red)',
                marginLeft:12, cursor:'pointer', fontSize:12 }}>Dismiss</button>
          </div>
        )}

        <div style={{ maxWidth:560, margin:'0 auto', padding:'22px 16px' }}>

          {/* ══ JOIN / LOGIN SCREEN ══ */}
          {!myName && (
            <div className="fade-up">
              <div style={{ marginBottom:32, paddingTop:16 }}>
                <div style={{ fontFamily:'var(--fd)', fontWeight:900, fontSize:60,
                  letterSpacing:'0.06em', lineHeight:0.85, textTransform:'uppercase' }}>
                  THE<br/><span style={{ color:'var(--accent)' }}>WAGER</span>
                </div>
                <p style={{ color:'var(--mid)', fontSize:13, marginTop:14, lineHeight:1.7, maxWidth:340 }}>
                  Draft 48 World Cup teams. Win micro-bets every time your teams clash.
                </p>
              </div>

              {/* Toggle new / returning */}
              <div style={{ display:'flex', marginBottom:16, borderRadius:10, overflow:'hidden',
                border:'1px solid var(--border)' }}>
                {[false, true].map(returning => (
                  <button key={String(returning)} onClick={() => { setIsReturning(returning); setJoinError('') }}
                    style={{ flex:1, padding:'11px', background: isReturning===returning ? 'var(--accent)' : 'var(--surface)',
                      color: isReturning===returning ? '#000' : 'var(--mid)', border:'none',
                      fontFamily:'var(--fd)', fontWeight:700, fontSize:13,
                      letterSpacing:'0.08em', cursor:'pointer', textTransform:'uppercase' }}>
                    {returning ? 'Already joined' : 'New player'}
                  </button>
                ))}
              </div>

              <Card accent="var(--accent)" style={{ marginBottom:16 }}>
                <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                  <Input value={nameInput} onChange={e => { setNameInput(e.target.value); setJoinError('') }}
                    placeholder="Your name" maxLength={20}
                    onKeyDown={e => e.key==='Enter' && (isReturning ? handleLogin() : null)}
                    style={{ fontFamily:'var(--fd)', fontWeight:700, fontSize:17, letterSpacing:'0.03em' }} />
                  <Input value={pinInput} onChange={e => { setPinInput(e.target.value); setJoinError('') }}
                    placeholder={isReturning ? 'Your PIN' : 'Choose a 4-digit PIN'}
                    type="password" maxLength={8}
                    onKeyDown={e => e.key==='Enter' && (isReturning ? handleLogin() : null)} />
                  {!isReturning && (
                    <Input value={pinConfirm} onChange={e => { setPinConfirm(e.target.value); setJoinError('') }}
                      placeholder="Confirm PIN" type="password" maxLength={8}
                      onKeyDown={e => e.key==='Enter' && handleJoin()} />
                  )}
                  {joinError && <p style={{ color:'var(--red)', fontSize:12, fontFamily:'var(--fd)' }}>{joinError}</p>}
                  <Btn onClick={isReturning ? handleLogin : handleJoin} full>
                    {isReturning ? 'Log In →' : 'Join the Game →'}
                  </Btn>
                  {!isReturning && (
                    <p style={{ fontSize:11, color:'var(--dim)', textAlign:'center', lineHeight:1.5 }}>
                      Remember your PIN — you'll need it to log in on other devices
                    </p>
                  )}
                </div>
              </Card>

              {(game?.players?.length || 0) > 0 && (
                <div>
                  <div style={{ fontFamily:'var(--fd)', fontWeight:700, fontSize:11,
                    letterSpacing:'0.14em', color:'var(--dim)', textTransform:'uppercase', marginBottom:10 }}>
                    Already joined ({game.players.length})
                  </div>
                  <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
                    {game.players.map((p, i) => (
                      <div key={p} style={{ display:'flex', alignItems:'center', gap:6,
                        padding:'6px 12px', borderRadius:8, background:'var(--surface)',
                        border:`1px solid ${PLAYER_COLORS[i%PLAYER_COLORS.length]}30` }}>
                        <Dot color={PLAYER_COLORS[i%PLAYER_COLORS.length]} size={7}/>
                        <span style={{ fontFamily:'var(--fd)', fontWeight:700, fontSize:14 }}>{p}</span>
                        {game.adminName===p && <span style={{ fontSize:9, color:'var(--gold)', fontFamily:'var(--fd)', fontWeight:700 }}>ADMIN</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ══ LOBBY ══ */}
          {myName && game?.phase==='lobby' && screen==='home' && (
            <div className="fade-up">
              <SectionHead title="Lobby"
                sub={game.players.length >= 2
                  ? `${game.players.length} players · each gets ${Math.ceil(48/game.players.length)} teams · all 48 teams assigned · ${(Math.ceil(48/game.players.length)*game.players.length)-48} duplicate${((Math.ceil(48/game.players.length)*game.players.length)-48)!==1?'s':''}`
                  : 'Everyone ranks their teams, then the admin runs the draft.'} />

              <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:22 }}>
                {game.players.map((p, i) => {
                  const done = ranked.includes(p)
                  const isMe = p===myName
                  const isAdminP = game.adminName===p
                  return (
                    <div key={p} style={{ display:'flex', alignItems:'center',
                      justifyContent:'space-between', padding:'14px 16px', borderRadius:12,
                      background: done ? 'rgba(0,230,118,0.04)' : 'var(--surface)',
                      border:`1px solid ${done ? '#00E67628' : 'var(--border)'}` }}>
                      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                        <Avatar name={p} color={PLAYER_COLORS[i%PLAYER_COLORS.length]} size={32}/>
                        <div>
                          <div style={{ fontFamily:'var(--fd)', fontWeight:700, fontSize:17,
                            display:'flex', alignItems:'center', gap:6 }}>
                            {p}
                            {isMe && <span style={{ color:'var(--accent)', fontSize:10 }}>YOU</span>}
                            {isAdminP && <span style={{ color:'var(--gold)', fontSize:10 }}>ADMIN</span>}
                          </div>
                          <div style={{ fontSize:11, color:'var(--dim)' }}>
                            {done ? '✓ Rankings saved' : 'Not ranked yet'}
                          </div>
                        </div>
                      </div>
                      {isMe && <Btn onClick={() => setScreen('ranking')} small
                        variant={done ? 'ghost' : 'outline'}>{done ? 'Edit' : 'Rank →'}</Btn>}
                      {!isMe && done && <span style={{ fontSize:12, color:'var(--green)',
                        fontFamily:'var(--fd)', fontWeight:700 }}>✓</span>}
                    </div>
                  )
                })}
              </div>

              {isAdmin ? (
                ranked.length===game.players.length && game.players.length>=2
                  ? <Btn onClick={handleRunDraft} full>🎲 Run the Draft →</Btn>
                  : <div style={{ padding:'14px 16px', borderRadius:12, background:'var(--surface)',
                      border:'1px solid var(--border)', fontSize:13, color:'var(--mid)', textAlign:'center' }}>
                      {game.players.length < 2
                        ? 'Waiting for at least 2 players to join…'
                        : `Waiting for ${game.players.length-ranked.length} more player${game.players.length-ranked.length!==1?'s':''} to rank`}
                    </div>
              ) : (
                <div style={{ padding:'14px 16px', borderRadius:12, background:'var(--surface)',
                  border:'1px solid var(--border)', fontSize:13, color:'var(--mid)', textAlign:'center' }}>
                  {game.adminName} will run the draft when everyone's ready
                </div>
              )}
            </div>
          )}

          {/* ══ RANKING SCREEN ══ */}
          {myName && screen==='ranking' && (
            <div className="fade-up">
              <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:20 }}>
                <Btn onClick={() => setScreen('home')} variant="ghost" small>← Back</Btn>
                <div>
                  <div style={{ fontFamily:'var(--fd)', fontWeight:900, fontSize:22 }}>Your Rankings</div>
                  <div style={{ fontSize:11, color:'var(--dim)' }}>
                    Drag or touch to reorder — #1 = predicted winner
                  </div>
                </div>
              </div>
              <DragList items={myRanking} onReorder={saveRanking} />
              <Btn onClick={() => setScreen('home')} full style={{ marginTop:16 }}>Save & Back ✓</Btn>
            </div>
          )}

          {/* ══ LIVE HOME ══ */}
          {myName && game?.phase==='live' && screen==='home' && (
            <div className="fade-up">

              {/* Tournament winner banner */}
              {tournamentWinners.length > 0 && (
                <div style={{ marginBottom:16, padding:'14px 18px', borderRadius:14,
                  background:'linear-gradient(135deg,#FFD70018,#FFD70006)',
                  border:'1px solid #FFD70045', display:'flex', alignItems:'center', gap:12 }}>
                  <span style={{ fontSize:28 }}>🏆</span>
                  <div>
                    <div style={{ fontFamily:'var(--fd)', fontWeight:900, fontSize:13,
                      color:'var(--gold)', letterSpacing:'0.1em', textTransform:'uppercase' }}>
                      Tournament Winner{tournamentWinners.length > 1 ? 's' : ''}
                    </div>
                    <div style={{ fontFamily:'var(--fd)', fontWeight:700, fontSize:20 }}>
                      {tournamentWinners.join(' & ')}
                      {tournamentWinners.includes(myName) && <span style={{ color:'var(--accent)', marginLeft:8, fontSize:13 }}>— That's you! 🎉</span>}
                    </div>
                    <div style={{ fontSize:11, color:'var(--dim)', marginTop:2 }}>
                      {tournamentWinners.length > 1
                        ? `both own ${finalMatch.winner} · split £${(BET_AMOUNT*game.players.length).toFixed(0)} pot`
                        : `owns ${finalMatch.winner} · wins £${(BET_AMOUNT*game.players.length).toFixed(0)} main pot`
                      }
                    </div>
                  </div>
                </div>
              )}

              {/* My position card */}
              <Card accent={getColor(myName)} style={{ marginBottom:20 }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                  <div>
                    <div style={{ fontSize:10, color:'var(--mid)', fontFamily:'var(--fd)',
                      letterSpacing:'0.14em', marginBottom:6, textTransform:'uppercase' }}>Your Position</div>
                    <div style={{ fontFamily:'var(--fd)', fontWeight:900, fontSize:48,
                      letterSpacing:'-0.02em', lineHeight:1,
                      color: myNet>=0 ? 'var(--green)' : 'var(--red)' }}>
                      {myNet>=0?'+':''}£{myNet.toFixed(2)}
                    </div>
                    <div style={{ fontSize:11, color:'var(--dim)', marginTop:6 }}>
                      micro-bets · main £{(BET_AMOUNT*game.players.length).toFixed(0)} pot at final
                    </div>
                  </div>
                  <div style={{ textAlign:'right' }}>
                    <Avatar name={myName} color={getColor(myName)} size={44}/>
                    <div style={{ fontFamily:'var(--fd)', fontWeight:900, fontSize:28,
                      marginTop:6, color:'var(--dim)' }}>#{myRank}</div>
                    <div style={{ fontSize:10, color:'var(--dim)' }}>of {game.players.length}</div>
                  </div>
                </div>
              </Card>

              {/* Nav tiles */}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:10 }}>
                {[
                  { icon:'⚡', label:'My Wagers',   sub:`${myBets.length} active`,            action:()=>{ setScreen('myview'); setTab('wagers') } },
                  { icon:'🏆', label:'My Teams',    sub:`${myTeams.length} teams`,             action:()=>{ setScreen('myview'); setTab('myteams') } },
                  { icon:'📊', label:'Leaderboard', sub:`#${myRank} of ${game.players.length}`,action:()=>{ setScreen('myview'); setTab('table') } },
                  { icon:'📋', label:'Draft Log',   sub:'Full pick-by-pick',                   action:()=>setShowDraftHistory(true) },
                ].map(({ icon, label, sub, action }) => (
                  <div key={label} onClick={action} style={{ padding:'16px 14px', borderRadius:14,
                    background:'var(--surface)', border:'1px solid var(--border)',
                    cursor:'pointer', transition:'border-color 0.15s' }}
                    onMouseEnter={e=>e.currentTarget.style.borderColor='var(--border2)'}
                    onMouseLeave={e=>e.currentTarget.style.borderColor='var(--border)'}>
                    <div style={{ fontSize:24, marginBottom:8 }}>{icon}</div>
                    <div style={{ fontFamily:'var(--fd)', fontWeight:800, fontSize:16 }}>{label}</div>
                    <div style={{ fontSize:11, color:'var(--dim)', marginTop:2 }}>{sub}</div>
                  </div>
                ))}
              </div>

              <div onClick={()=>{ setScreen('myview'); setTab('allbets') }}
                style={{ padding:'14px 16px', borderRadius:14, background:'var(--surface)',
                  border:'1px solid var(--border)', cursor:'pointer', marginBottom:10,
                  display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <span style={{ fontSize:20 }}>🌍</span>
                  <div>
                    <div style={{ fontFamily:'var(--fd)', fontWeight:800, fontSize:15 }}>All Clashes</div>
                    <div style={{ fontSize:11, color:'var(--dim)' }}>{allBets.length} micro-bets across the group</div>
                  </div>
                </div>
                <span style={{ color:'var(--dim)', fontSize:18 }}>›</span>
              </div>

              {/* Debts summary on home */}
              {myDebts.length > 0 && (
                <div onClick={()=>{ setScreen('myview'); setTab('debts') }}
                  style={{ padding:'14px 16px', borderRadius:14, marginBottom:10, cursor:'pointer',
                    background: myDebts.some(d=>d.from===myName) ? 'rgba(255,77,109,0.06)' : 'rgba(0,230,118,0.06)',
                    border: `1px solid ${myDebts.some(d=>d.from===myName) ? '#FF4D6D40' : '#00E67640'}`,
                    display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                    <span style={{ fontSize:20 }}>💸</span>
                    <div>
                      <div style={{ fontFamily:'var(--fd)', fontWeight:800, fontSize:15 }}>Debts</div>
                      <div style={{ fontSize:11, color:'var(--dim)' }}>
                        {myDebts.filter(d=>d.from===myName).length > 0
                          ? `You owe in ${myDebts.filter(d=>d.from===myName).length} debt${myDebts.filter(d=>d.from===myName).length>1?'s':''}`
                          : `You're owed in ${myDebts.filter(d=>d.to===myName).length} debt${myDebts.filter(d=>d.to===myName).length>1?'s':''}`
                        }
                      </div>
                    </div>
                  </div>
                  <span style={{ color:'var(--dim)', fontSize:18 }}>›</span>
                </div>
              )}

              {isAdmin && (
                <Btn onClick={()=>setScreen('admin')} full variant="ghost" style={{ fontSize:12, marginTop:8 }}>
                  ⚙ Admin — Fetch Results & Manage Matches
                </Btn>
              )}
            </div>
          )}

          {/* ══ MY VIEW (tabbed) ══ */}
          {myName && game?.phase==='live' && screen==='myview' && (
            <div className="fade-up">
              <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:18 }}>
                <Btn onClick={()=>setScreen('home')} variant="ghost" small>← Home</Btn>
                <Avatar name={myName} color={getColor(myName)} size={28}/>
                <span style={{ fontFamily:'var(--fd)', fontWeight:900, fontSize:20 }}>{myName}</span>
              </div>

              <Tabs
                tabs={[['wagers','⚡ Mine'],['allbets','🌍 All'],['myteams','🏆 Teams'],['debts','💸 Debts'],['table','📊 Table']]}
                active={tab} onChange={setTab} />

              {/* Stage filter — shared across wager tabs */}
              {(tab==='wagers'||tab==='allbets') && (
                <div style={{ display:'flex', gap:6, marginBottom:14, overflowX:'auto', paddingBottom:2 }}>
                  {['all',...STAGES.map(s=>s.key)].map(s=>{
                    const label = s==='all' ? 'All' : STAGES.find(st=>st.key===s)?.shortLabel
                    const active = stageFilter===s
                    return (
                      <button key={s} onClick={()=>setStageFilter(s)} style={{
                        flexShrink:0, padding:'5px 13px', borderRadius:7,
                        background: active?'var(--accent)':'var(--surface2)',
                        border:`1px solid ${active?'var(--accent)':'var(--border)'}`,
                        color: active?'#000':'var(--mid)',
                        fontFamily:'var(--fd)', fontWeight:700, fontSize:11,
                        letterSpacing:'0.08em', cursor:'pointer', textTransform:'uppercase',
                      }}>{label}</button>
                    )
                  })}
                </div>
              )}

              {/* Wagers */}
              {tab==='wagers' && (
                myBets.filter(({match})=>stageFilter==='all'||match.stage===stageFilter).length===0
                  ? <div style={{ padding:'32px 20px', textAlign:'center', color:'var(--dim)', fontSize:13, lineHeight:1.6 }}>
                      No wagers yet for this stage. They appear when your teams meet others.
                    </div>
                  : myBets.filter(({match})=>stageFilter==='all'||match.stage===stageFilter)
                      .map(({match},i)=>(
                        <MatchCard key={match.id||i} match={match}
                          assignments={game.assignments} playerColor={getColor} myName={myName} />
                      ))
              )}

              {/* All Clashes — every micro-bet across the whole group */}
              {tab==='allbets' && (() => {
                const filtered = allBets.filter(({match})=>stageFilter==='all'||match.stage===stageFilter)
                if (filtered.length === 0) {
                  return <div style={{ padding:'32px 20px', textAlign:'center', color:'var(--dim)', fontSize:13, lineHeight:1.6 }}>
                    No clashes yet for this stage. They appear once assigned teams are drawn against each other.
                  </div>
                }
                // settled (finished, win/loss OR draw) first, then upcoming/live
                const settled = filtered.filter(({match})=>match.finished)
                const pending = filtered.filter(({match})=>!match.finished)
                const Row = ({match, bet}, i) => {
                  const w = match.winner
                  const o1won = w && w===bet.team1
                  const o2won = w && w===bet.team2
                  return (
                    <div key={(match.id||i)+'-'+bet.owner1+'-'+bet.owner2} style={{
                      padding:'12px 14px', borderRadius:11, marginBottom:6,
                      background:'var(--surface)', border:'1px solid var(--border)' }}>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
                        <span style={{ fontSize:10, fontFamily:'var(--fd)', fontWeight:700,
                          letterSpacing:'0.1em', color:'var(--dim)', textTransform:'uppercase' }}>
                          {STAGES.find(s=>s.key===match.stage)?.shortLabel||match.stage} · £{bet.betAmt.toFixed(2)}
                        </span>
                        {match.finished
                          ? <span style={{ fontSize:10, fontFamily:'var(--fd)', fontWeight:800, color:'var(--green)' }}>SETTLED</span>
                          : match.live
                            ? <span style={{ fontSize:10, fontFamily:'var(--fd)', fontWeight:800, color:'var(--gold)' }}>LIVE</span>
                            : <span style={{ fontSize:10, fontFamily:'var(--fd)', fontWeight:700, color:'var(--dim)' }}>UPCOMING</span>}
                      </div>
                      <div style={{ display:'flex', alignItems:'center', gap:8, fontSize:13 }}>
                        <span style={{ flex:1, fontWeight: o1won?800:500, color:o1won?'var(--green)':'var(--text)' }}>
                          {bet.team1} <span style={{ color:'var(--dim)', fontSize:11 }}>({bet.owner1})</span>
                        </span>
                        <span style={{ color:'var(--dim)', fontSize:11 }}>v</span>
                        <span style={{ flex:1, textAlign:'right', fontWeight: o2won?800:500, color:o2won?'var(--green)':'var(--text)' }}>
                          <span style={{ color:'var(--dim)', fontSize:11 }}>({bet.owner2})</span> {bet.team2}
                        </span>
                      </div>
                      {match.finished && <div style={{ marginTop:6, fontSize:11, color:'var(--mid)' }}>
                        {o1won ? `${bet.owner1} wins £${bet.betAmt.toFixed(2)} from ${bet.owner2}`
                          : o2won ? `${bet.owner2} wins £${bet.betAmt.toFixed(2)} from ${bet.owner1}`
                          : 'Draw — no payout'}
                      </div>}
                    </div>
                  )
                }
                return (
                  <div>
                    {settled.length>0 && <div style={{ fontFamily:'var(--fd)', fontWeight:800, fontSize:11,
                      letterSpacing:'0.14em', color:'var(--mid)', textTransform:'uppercase', margin:'4px 0 10px' }}>
                      Settled ({settled.length})</div>}
                    {settled.map(Row)}
                    {pending.length>0 && <div style={{ fontFamily:'var(--fd)', fontWeight:800, fontSize:11,
                      letterSpacing:'0.14em', color:'var(--mid)', textTransform:'uppercase', margin:'14px 0 10px' }}>
                      Upcoming ({pending.length})</div>}
                    {pending.map(Row)}
                  </div>
                )
              })()}

              {/* My Teams */}
              {tab==='myteams' && (
                <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                  {myTeams.map((team,i)=>{
                    const t = TEAM_MAP[team]||{name:team,flag:'🏴',group:'?'}
                    const tm = allMatches.filter(m=>m.team1===team||m.team2===team)
                    const wins = tm.filter(m=>m.winner===team).length
                    const isChamp = finalMatch?.winner===team
                    const hasBet = allBets.some(({bet})=>bet.team1===team||bet.team2===team)
                    return (
                      <div key={team} style={{ display:'flex', alignItems:'center', gap:12,
                        padding:'11px 14px', borderRadius:11, background:'var(--surface)',
                        border:`1px solid ${isChamp?'var(--gold)':hasBet?getColor(myName)+'30':'var(--border)'}` }}>
                        <span style={{ color:'var(--dim)', fontSize:10, fontFamily:'var(--fd)',
                          fontWeight:700, minWidth:20 }}>#{i+1}</span>
                        <span style={{ fontSize:24 }}>{t.flag}</span>
                        <div style={{ flex:1 }}>
                          <div style={{ fontFamily:'var(--fd)', fontWeight:700, fontSize:16 }}>{t.name}</div>
                          <div style={{ fontSize:10, color:'var(--dim)' }}>
                            Group {t.group}{tm.length>0?` · ${wins}W ${tm.length-wins}L`:''}
                            {hasBet&&!isChamp?' · 💰 active bet':''}
                          </div>
                        </div>
                        {isChamp&&<Badge color="var(--gold)">🏆 CHAMP</Badge>}
                        {!isChamp&&wins>0&&<Badge color="var(--green)">{wins}W</Badge>}
                      </div>
                    )
                  })}
                </div>
              )}

              {/* 💸 Debts tab */}
              {tab==='debts' && (
                <div>
                  {/* My debts summary — what I owe and what I'm owed */}
                  {myDebts.length === 0 && debts.length === 0 ? (
                    <div style={{ padding:'32px 20px', textAlign:'center', color:'var(--dim)', fontSize:13, lineHeight:1.6 }}>
                      No settled bets yet — debts appear once match results with winners are entered.
                    </div>
                  ) : (
                    <>
                      {/* My position */}
                      {myDebts.length > 0 && (
                        <div style={{ marginBottom:20 }}>
                          <div style={{ fontFamily:'var(--fd)', fontWeight:800, fontSize:11,
                            letterSpacing:'0.14em', color:'var(--mid)', textTransform:'uppercase', marginBottom:10 }}>
                            Your Debts
                          </div>
                          {myDebts.map((d, i) => {
                            const iOwe = d.from === myName
                            const other = iOwe ? d.to : d.from
                            return (
                              <div key={i} style={{ display:'flex', alignItems:'center', gap:12,
                                padding:'14px 16px', borderRadius:12, marginBottom:8,
                                background: iOwe ? 'rgba(255,77,109,0.06)' : 'rgba(0,230,118,0.06)',
                                border: `1px solid ${iOwe ? '#FF4D6D40' : '#00E67640'}` }}>
                                <div style={{ fontSize:22 }}>{iOwe ? '↑' : '↓'}</div>
                                <div style={{ flex:1 }}>
                                  <div style={{ fontFamily:'var(--fd)', fontWeight:700, fontSize:16 }}>
                                    {iOwe
                                      ? <span>You owe <span style={{ color: getColor(other) }}>{other}</span></span>
                                      : <span><span style={{ color: getColor(other) }}>{other}</span> owes you</span>
                                    }
                                  </div>
                                  <div style={{ fontSize:11, color:'var(--dim)', marginTop:2 }}>
                                    from settled micro-bets
                                  </div>
                                </div>
                                <div style={{ fontFamily:'var(--fd)', fontWeight:900, fontSize:28,
                                  letterSpacing:'-0.02em',
                                  color: iOwe ? 'var(--red)' : 'var(--green)' }}>
                                  {iOwe ? '-' : '+'}£{d.amount.toFixed(2)}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )}

                      {/* Full group debts */}
                      <div>
                        <div style={{ fontFamily:'var(--fd)', fontWeight:800, fontSize:11,
                          letterSpacing:'0.14em', color:'var(--mid)', textTransform:'uppercase', marginBottom:10 }}>
                          All Group Debts
                        </div>
                        {debts.length === 0 ? (
                          <div style={{ color:'var(--dim)', fontSize:13, padding:'12px 0' }}>All square — no debts yet.</div>
                        ) : debts.map((d, i) => {
                          const fromIsMe = d.from === myName
                          const toIsMe = d.to === myName
                          return (
                            <div key={i} style={{ display:'flex', alignItems:'center', gap:10,
                              padding:'12px 14px', borderRadius:11, marginBottom:6,
                              background:'var(--surface)',
                              border:`1px solid ${fromIsMe||toIsMe ? (fromIsMe?'#FF4D6D30':'#00E67630') : 'var(--border)'}` }}>
                              <Avatar name={d.from} color={getColor(d.from)} size={28}/>
                              <div style={{ fontFamily:'var(--fd)', fontWeight:700, fontSize:14,
                                color: fromIsMe ? 'var(--red)' : 'var(--text)' }}>{d.from}</div>
                              <div style={{ flex:1, display:'flex', alignItems:'center', gap:6,
                                justifyContent:'center' }}>
                                <div style={{ height:1, flex:1, background:'var(--border)' }}/>
                                <span style={{ fontSize:10, color:'var(--dim)', fontFamily:'var(--fd)',
                                  fontWeight:700, whiteSpace:'nowrap' }}>OWES</span>
                                <div style={{ height:1, flex:1, background:'var(--border)' }}/>
                              </div>
                              <div style={{ fontFamily:'var(--fd)', fontWeight:700, fontSize:14,
                                color: toIsMe ? 'var(--green)' : 'var(--text)' }}>{d.to}</div>
                              <Avatar name={d.to} color={getColor(d.to)} size={28}/>
                              <div style={{ fontFamily:'var(--fd)', fontWeight:900, fontSize:20,
                                color: fromIsMe ? 'var(--red)' : toIsMe ? 'var(--green)' : 'var(--gold)',
                                minWidth:56, textAlign:'right' }}>
                                £{d.amount.toFixed(2)}
                              </div>
                            </div>
                          )
                        })}
                        <div style={{ marginTop:12, padding:'12px 14px', borderRadius:10,
                          background:'var(--surface)', border:'1px solid var(--border)',
                          fontSize:12, color:'var(--dim)', lineHeight:1.6 }}>
                          Debts are netted — if you owe someone £0.50 and they owe you £0.30, it shows as you owing them £0.20.
                          Only settled matches (with a winner entered) count.
                          The main £{(BET_AMOUNT * game.players.length).toFixed(0)} pot is separate and paid at the end.
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Table */}
              {tab==='table' && (
                <div>
                  <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:16 }}>
                    {sorted.map((p,i)=>{
                      const net = leaderboard[p]||0
                      const isMe = p===myName
                      const isChamp = tournamentWinner===p
                      const pBets = allBets.filter(({bet})=>bet.owner1===p||bet.owner2===p)
                      const medal = i===0?'🥇':i===1?'🥈':i===2?'🥉':null
                      const totalIncPot = isChamp ? net + BET_AMOUNT*game.players.length : net
                      return (
                        <div key={p} style={{ display:'flex', alignItems:'center', gap:12,
                          padding:'13px 16px', borderRadius:12,
                          background: isMe?`${getColor(p)}0A`:'var(--surface)',
                          border:`1px solid ${isChamp?'var(--gold)':isMe?getColor(p)+'40':'var(--border)'}` }}>
                          <div style={{ fontFamily:'var(--fd)', fontWeight:900, fontSize:22,
                            color:'var(--dim)', minWidth:30, textAlign:'center' }}>
                            {medal||`#${i+1}`}
                          </div>
                          <Avatar name={p} color={getColor(p)} size={32}/>
                          <div style={{ flex:1 }}>
                            <div style={{ fontFamily:'var(--fd)', fontWeight:700, fontSize:17,
                              display:'flex', alignItems:'center', gap:6 }}>
                              {p}
                              {isMe&&<span style={{ color:'var(--accent)', fontSize:10 }}>YOU</span>}
                              {isChamp&&<span style={{ fontSize:12 }}>🏆</span>}
                            </div>
                            <div style={{ fontSize:10, color:'var(--dim)' }}>
                              {pBets.length} bets · {(game.assignments?.[p]||[]).length} teams
                            </div>
                          </div>
                          <div style={{ textAlign:'right' }}>
                            <div style={{ fontFamily:'var(--fd)', fontWeight:900, fontSize:22,
                              color: totalIncPot>0?'var(--green)':totalIncPot<0?'var(--red)':'var(--dim)' }}>
                              {totalIncPot>=0?'+':''}£{totalIncPot.toFixed(2)}
                            </div>
                            {isChamp&&(
                              <div style={{ fontSize:10, color:'var(--gold)', fontFamily:'var(--fd)',
                                fontWeight:700 }}>incl. £{(BET_AMOUNT*game.players.length).toFixed(0)} pot</div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  <div style={{ padding:'12px 16px', borderRadius:10, background:'var(--surface)',
                    border:'1px solid var(--border)', fontSize:12, color:'var(--dim)', lineHeight:1.7 }}>
                    <span style={{ color:'var(--gold)', fontFamily:'var(--fd)', fontWeight:700 }}>Main pot: </span>
                    £{(BET_AMOUNT*game.players.length).toFixed(0)} · owner of the tournament-winning team wins it.
                    Leaderboard shows total including pot where applicable.<br/>
                    <span style={{ color:'var(--mid)' }}>Micro-bets: GS 10% · R32 20% · R16 30% · QF 40% · SF 50% of £{BET_AMOUNT} · Final winner takes entire pot</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ══ ADMIN SCREEN ══ */}
          {myName && game?.phase==='live' && screen==='admin' && isAdmin && (
            <div className="fade-up">
              <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:20 }}>
                <Btn onClick={()=>setScreen('home')} variant="ghost" small>← Back</Btn>
                <div>
                  <div style={{ fontFamily:'var(--fd)', fontWeight:900, fontSize:22 }}>Admin</div>
                  <div style={{ fontSize:11, color:'var(--gold)' }}>Only visible to you ({myName})</div>
                </div>
              </div>

              {/* Live fetch */}
              <Card accent="var(--accent)" style={{ marginBottom:16 }}>
                <div style={{ fontFamily:'var(--fd)', fontWeight:800, fontSize:12,
                  letterSpacing:'0.14em', color:'var(--mid)', textTransform:'uppercase', marginBottom:10 }}>
                  Live World Cup Data
                </div>
                <div style={{ fontSize:12, color:'var(--dim)', marginBottom:12, lineHeight:1.6 }}>
                  Fetches live and completed match results from the web.
                  Safe to press mid-game — in-progress matches won't show a winner until full time.
                </div>
                <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
                  <Btn onClick={handleFetchLive} disabled={fetchingLive} small variant="outline">
                    {fetchingLive ? '🔄 Fetching…' : '🔄 Fetch Live Matches'}
                  </Btn>
                  {game.lastLiveFetch && (
                    <span style={{ fontSize:10, color:'var(--dim)' }}>
                      Last: {new Date(game.lastLiveFetch).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}
                    </span>
                  )}
                </div>
                {liveMsg && (
                  <div style={{ fontSize:11, color:'var(--accent)', marginTop:10,
                    fontFamily:'var(--fd)', fontWeight:600, lineHeight:1.5 }}>{liveMsg}</div>
                )}
              </Card>

              {/* Manual match entry */}
              <Card style={{ marginBottom:16 }}>
                <div style={{ fontFamily:'var(--fd)', fontWeight:800, fontSize:12,
                  letterSpacing:'0.14em', color:'var(--mid)', textTransform:'uppercase', marginBottom:12 }}>
                  Manual Match Entry
                </div>
                <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                    <Sel value={matchForm.team1} onChange={e=>setMatchForm(f=>({...f,team1:e.target.value}))}>
                      <option value="">Team 1</option>
                      {ALL_TEAMS.map(t=><option key={t.name} value={t.name}>{t.flag} {t.name}</option>)}
                    </Sel>
                    <Sel value={matchForm.team2} onChange={e=>setMatchForm(f=>({...f,team2:e.target.value}))}>
                      <option value="">Team 2</option>
                      {ALL_TEAMS.map(t=><option key={t.name} value={t.name}>{t.flag} {t.name}</option>)}
                    </Sel>
                  </div>
                  <Sel value={matchForm.stage} onChange={e=>setMatchForm(f=>({...f,stage:e.target.value}))}>
                    {STAGES.map(s=><option key={s.key} value={s.key}>{s.label} — {s.pct}% bet</option>)}
                  </Sel>
                  <Sel value={matchForm.winner} onChange={e=>setMatchForm(f=>({...f,winner:e.target.value}))}>
                    <option value="">Winner (leave blank if not finished)</option>
                    {[matchForm.team1,matchForm.team2].filter(Boolean).map(t=>(
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </Sel>
                  <Btn onClick={handleAddMatch} small>+ Add Match</Btn>
                </div>
              </Card>

              {/* Manual entries list */}
              {(game.matches||[]).length>0 && (
                <div style={{ marginBottom:16 }}>
                  <div style={{ fontFamily:'var(--fd)', fontSize:11, color:'var(--dim)',
                    letterSpacing:'0.12em', textTransform:'uppercase', marginBottom:10 }}>
                    Manual Entries
                  </div>
                  {(game.matches||[]).map(m=>(
                    <MatchCard key={m.id} match={m} assignments={game.assignments}
                      playerColor={getColor} myName={myName}
                      onRemove={()=>handleRemoveMatch(m.id)} />
                  ))}
                </div>
              )}

              {/* Danger zone */}
              <div style={{ padding:'16px', borderRadius:12,
                border:'1px solid #FF4D6D30', background:'#FF4D6D06' }}>
                <div style={{ fontFamily:'var(--fd)', fontWeight:700, fontSize:11,
                  letterSpacing:'0.14em', color:'var(--red)', textTransform:'uppercase', marginBottom:10 }}>
                  Danger Zone
                </div>
                <p style={{ fontSize:12, color:'var(--dim)', marginBottom:12, lineHeight:1.5 }}>
                  Resets everything — players, rankings, draft, results. Everyone will need to rejoin.
                </p>
                <Btn variant="danger" small onClick={()=>{
                  setConfirm({
                    message:'RESET the entire game? All players, rankings, the draft, and all match results will be permanently deleted. Everyone will need to rejoin and re-rank.',
                    danger:true,
                    onConfirm: async ()=>{
                      const init = { phase:'lobby', players:[], pins:{}, rankings:{},
                        priorityOrder:[], assignments:{}, matches:[],
                        liveMatches:[], lastLiveFetch:null, adminName:null }
                      await dbSet(init)
                      setGame(init)
                      localStorage.removeItem(LOCAL_NAME_KEY)
                      localStorage.removeItem(LOCAL_PIN_KEY)
                      setMyName(''); setMyPin(''); setNameInput(''); setPinInput('')
                      setScreen('home'); setConfirm(null)
                    }
                  })
                }}>Reset Entire Game</Btn>
              </div>
            </div>
          )}

        </div>
      </div>
    </>
  )
}
