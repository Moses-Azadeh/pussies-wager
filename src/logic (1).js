import { ALL_TEAMS, STAGES, BET_AMOUNT } from './data.js'

// ── DRAFT ─────────────────────────────────────────────────────────────────────
// Rules:
// - All 48 teams assigned, none left out
// - Every player gets exactly the same number of teams (ceil(48/n))
// - Duplicates allowed ONLY to achieve equality — max 2 players per team
// - Draft order: snake priority, highest priority picks first from their ranking
// - Duplicates are the LOWEST rated teams (worst avg rank across all players)
//   so nobody duplicates a strong team — duplicates are the weakest teams
export function runDraft(rankings, priorityOrder) {
  const n = (priorityOrder || []).length
  if (n === 0) return {}

  const teamsEach = Math.ceil(48 / n)       // e.g. 9 players → 6 each (54 slots)
  const totalSlots = teamsEach * n           // e.g. 54
  const duplicatesNeeded = totalSlots - 48   // e.g. 6 duplicates

  const assigned = {}
  priorityOrder.forEach(p => { assigned[p] = [] })

  const teamNames = ALL_TEAMS.map(t => t.name)
  const ownerCount = {}  // how many players own each team
  teamNames.forEach(t => { ownerCount[t] = 0 })

  // ── Phase 1: standard snake draft for all 48 unique teams ──
  const taken = new Set()
  const queue = [...priorityOrder]

  while (taken.size < 48 && queue.length > 0) {
    const player = queue.shift()
    if (assigned[player].length >= teamsEach) continue
    const ranked = rankings[player] || teamNames
    const pick = ranked.find(t => !taken.has(t))
    if (pick) {
      assigned[player].push(pick)
      taken.add(pick)
      ownerCount[pick]++
      queue.push(player)
    }
  }

  // ── Phase 2: assign duplicates — lowest-priority teams get duplicated ──
  // "Lowest priority" = ranked lowest on average across all players' rankings
  // This ensures duplicates are the teams everyone rated as least likely to win
  const needsTopUp = priorityOrder.filter(p => assigned[p].length < teamsEach)

  if (needsTopUp.length > 0) {
    // Score each team by average ranking position across all players (higher = ranked lower = worse)
    const avgRank = {}
    teamNames.forEach(t => {
      const positions = priorityOrder.map(p => {
        const ranked = rankings[p] || teamNames
        const idx = ranked.indexOf(t)
        return idx >= 0 ? idx : ranked.length // if not found, put at end
      })
      avgRank[t] = positions.reduce((a, b) => a + b, 0) / positions.length
    })

    // Eligible for duplication: owned by exactly 1 player, sorted worst first (highest avg rank)
    const eligible = teamNames
      .filter(t => ownerCount[t] === 1)
      .sort((a, b) => avgRank[b] - avgRank[a]) // worst team first

    let dupIdx = 0
    for (const player of needsTopUp) {
      while (assigned[player].length < teamsEach && dupIdx < eligible.length) {
        const team = eligible[dupIdx]
        // Don't give the player a team they already own
        if (!assigned[player].includes(team)) {
          assigned[player].push(team)
          ownerCount[team]++
        }
        dupIdx++
      }
    }
  }

  return assigned
}

// ── MICRO-BET FINDER ─────────────────────────────────────────────────────────
// Now returns ARRAY of bets (supports duplicates — multiple owners per team)
// Each unique owner1/owner2 pair is a separate bet
export function findMicroBets(assignments, match) {
  if (!assignments || !match?.team1 || !match?.team2) return []
  const { team1, team2, stage } = match

  // Final has no micro-bet — winner takes main pot
  if (stage === 'f') return []

  const stageInfo = STAGES.find(s => s.key === stage)
  if (!stageInfo) return []

  const betAmt = parseFloat(((BET_AMOUNT * stageInfo.pct) / 100).toFixed(2))

  // Find all owners of each team (can be multiple due to duplicates)
  const owners1 = []
  const owners2 = []
  Object.entries(assignments).forEach(([p, teams]) => {
    if (Array.isArray(teams)) {
      if (teams.includes(team1)) owners1.push(p)
      if (teams.includes(team2)) owners2.push(p)
    }
  })

  // Generate all unique cross-pairs (owner of team1 vs owner of team2)
  const bets = []
  for (const o1 of owners1) {
    for (const o2 of owners2) {
      if (o1 === o2) continue // same player owns both — no bet
      // Avoid duplicate pairs (o1 vs o2 same as o2 vs o1)
      const exists = bets.some(b =>
        (b.owner1 === o1 && b.owner2 === o2) ||
        (b.owner1 === o2 && b.owner2 === o1)
      )
      if (!exists) {
        bets.push({
          owner1: o1, owner2: o2, team1, team2,
          stage: stageInfo.key,
          stageLabel: stageInfo.label,
          shortLabel: stageInfo.shortLabel,
          betAmt,
          winnerId: match.winner
            ? (match.winner === team1 ? o1 : match.winner === team2 ? o2 : null)
            : null,
        })
      }
    }
  }
  return bets
}

// Legacy single-bet finder (used by MatchCard for display — returns first bet or null)
export function findMicroBet(assignments, match) {
  const bets = findMicroBets(assignments, match)
  return bets.length > 0 ? bets[0] : null
}

// ── LEADERBOARD ───────────────────────────────────────────────────────────────
export function calcLeaderboard(players, assignments, matches) {
  const totals = {}
  ;(players || []).forEach(p => { totals[p] = 0 })
  ;(matches || []).forEach(m => {
    const bets = findMicroBets(assignments || {}, m)
    bets.forEach(bet => {
      if (!m.winner) return
      const winner = m.winner === bet.team1 ? bet.owner1 : m.winner === bet.team2 ? bet.owner2 : null
      const loser = winner === bet.owner1 ? bet.owner2 : bet.owner1
      if (!winner) return
      totals[winner] = (totals[winner] || 0) + bet.betAmt
      totals[loser]  = (totals[loser]  || 0) - bet.betAmt
    })
  })
  return totals
}

// ── DEBTS ─────────────────────────────────────────────────────────────────────
export function calcDebts(players, assignments, matches) {
  const pairMap = {}
  ;(matches || []).forEach(m => {
    const bets = findMicroBets(assignments || {}, m)
    bets.forEach(bet => {
      if (!m.winner) return
      const winner = m.winner === bet.team1 ? bet.owner1 : m.winner === bet.team2 ? bet.owner2 : null
      if (!winner) return
      const loser = winner === bet.owner1 ? bet.owner2 : bet.owner1
      const [a, b] = [winner, loser].sort()
      const key = `${a}|||${b}`
      const current = pairMap[key] || 0
      pairMap[key] = winner === a ? current + bet.betAmt : current - bet.betAmt
    })
  })
  const debts = []
  Object.entries(pairMap).forEach(([key, net]) => {
    if (Math.abs(net) < 0.001) return
    const [a, b] = key.split('|||')
    if (net > 0) {
      debts.push({ from: b, to: a, amount: parseFloat(net.toFixed(2)) })
    } else {
      debts.push({ from: a, to: b, amount: parseFloat(Math.abs(net).toFixed(2)) })
    }
  })
  return debts.sort((a, b) => b.amount - a.amount)
}

// ── FAIR SHUFFLE ──────────────────────────────────────────────────────────────
export function fairShuffle(arr) {
  const array = [...arr]
  const randomValues = new Uint32Array(array.length)
  crypto.getRandomValues(randomValues)
  for (let i = array.length - 1; i > 0; i--) {
    const j = randomValues[i] % (i + 1);
    [array[i], array[j]] = [array[j], array[i]]
  }
  return array
}
