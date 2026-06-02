import { ALL_TEAMS, STAGES, BET_AMOUNT } from './data.js'

export function runDraft(rankings, priorityOrder) {
  const n = (priorityOrder || []).length
  if (n === 0) return {}
  const teamsEach = Math.floor(48 / n)
  const totalToAssign = teamsEach * n
  const assigned = {}
  const taken = new Set()
  priorityOrder.forEach(p => { assigned[p] = [] })
  const queue = [...priorityOrder]
  const teamNames = ALL_TEAMS.map(t => t.name)
  while (taken.size < totalToAssign && queue.length > 0) {
    const player = queue.shift()
    if (assigned[player].length >= teamsEach) continue
    const ranked = rankings[player] || teamNames
    const pick = ranked.find(t => !taken.has(t))
    if (pick) {
      assigned[player].push(pick)
      taken.add(pick)
      queue.push(player)
    }
  }
  return assigned
}

export function findMicroBet(assignments, match) {
  if (!assignments || !match?.team1 || !match?.team2) return null
  const { team1, team2, stage } = match
  let owner1 = null, owner2 = null
  Object.entries(assignments).forEach(([p, teams]) => {
    if (Array.isArray(teams)) {
      if (teams.includes(team1)) owner1 = p
      if (teams.includes(team2)) owner2 = p
    }
  })
  if (!owner1 || !owner2 || owner1 === owner2) return null
  const stageInfo = STAGES.find(s => s.key === stage)
  if (!stageInfo) return null
  const betAmt = parseFloat(((BET_AMOUNT * stageInfo.pct) / 100).toFixed(2))
  return {
    owner1, owner2, team1, team2,
    stage: stageInfo.key,
    stageLabel: stageInfo.label,
    shortLabel: stageInfo.shortLabel,
    betAmt,
    winnerId: match.winner
      ? (match.winner === team1 ? owner1 : match.winner === team2 ? owner2 : null)
      : null,
  }
}

export function calcLeaderboard(players, assignments, matches) {
  const totals = {}
  ;(players || []).forEach(p => { totals[p] = 0 })
  ;(matches || []).forEach(m => {
    const bet = findMicroBet(assignments || {}, m)
    if (!bet || !m.winner) return
    if (m.winner === bet.team1) {
      totals[bet.owner1] = (totals[bet.owner1] || 0) + bet.betAmt
      totals[bet.owner2] = (totals[bet.owner2] || 0) - bet.betAmt
    } else if (m.winner === bet.team2) {
      totals[bet.owner2] = (totals[bet.owner2] || 0) + bet.betAmt
      totals[bet.owner1] = (totals[bet.owner1] || 0) - bet.betAmt
    }
  })
  return totals
}

export function calcDebts(players, assignments, matches) {
  const pairMap = {}
  ;(matches || []).forEach(m => {
    const bet = findMicroBet(assignments || {}, m)
    if (!bet || !m.winner) return
    const winner = m.winner === bet.team1 ? bet.owner1 : m.winner === bet.team2 ? bet.owner2 : null
    if (!winner) return
    const loser = winner === bet.owner1 ? bet.owner2 : bet.owner1
    const [a, b] = [winner, loser].sort()
    const key = `${a}|||${b}`
    const current = pairMap[key] || 0
    pairMap[key] = winner === a ? current + bet.betAmt : current - bet.betAmt
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
