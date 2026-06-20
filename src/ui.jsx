import { useState, useRef, useEffect } from 'react'
import { TEAM_MAP, STAGES } from './data.js'
import { findMicroBet } from './logic.js'

export const css = `
  @import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:ital,wght@0,400;0,600;0,700;0,800;0,900;1,700&family=Barlow:wght@300;400;500;600&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --bg: #080C10;
    --surface: #0F1520;
    --surface2: #161E2E;
    --surface3: #1C2638;
    --border: rgba(255,255,255,0.06);
    --border2: rgba(255,255,255,0.12);
    --text: #E8EDF2;
    --dim: #4A5A70;
    --mid: #7A8A9E;
    --accent: #00E5FF;
    --accent2: #FF4D6D;
    --gold: #FFD700;
    --green: #00E676;
    --red: #FF4D6D;
    --fd: 'Barlow Condensed', sans-serif;
    --fb: 'Barlow', sans-serif;
  }
  html, body { height: 100%; background: var(--bg); color: var(--text); font-family: var(--fb); -webkit-font-smoothing: antialiased; }
  #root { min-height: 100%; }
  ::-webkit-scrollbar { width: 2px; }
  ::-webkit-scrollbar-thumb { background: #1E2A38; border-radius: 2px; }
  select option { background: #161E2E; }

  @keyframes fadeUp { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:translateY(0); } }
  @keyframes pop { from { opacity:0; transform:scale(0.94); } to { opacity:1; transform:scale(1); } }
  @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }

  .fade-up { animation: fadeUp 0.4s ease both; }
  .pop { animation: pop 0.3s ease both; }
  .pulse { animation: pulse 2s ease-in-out infinite; }

  input::placeholder { color: var(--dim); }
  input:focus { outline: none; border-color: var(--accent) !important; }
  select:focus { outline: none; }
  button:active { transform: scale(0.97); }

  .drag-item { touch-action: none; }
  .drag-item.dragging { opacity: 0.25; }
  .drag-item.over { background: rgba(0,229,255,0.07) !important; border-color: rgba(0,229,255,0.3) !important; }
`

export function Btn({ children, onClick, variant='primary', style, disabled, small, full }) {
  const v = {
    primary:   { background:'var(--accent)', color:'#000', border:'none' },
    danger:    { background:'var(--accent2)', color:'#fff', border:'none' },
    ghost:     { background:'transparent', color:'var(--mid)', border:'1px solid var(--border2)' },
    dim:       { background:'var(--surface2)', color:'var(--mid)', border:'1px solid var(--border)' },
    outline:   { background:'transparent', color:'var(--accent)', border:'1px solid var(--accent)' },
  }
  return (
    <button onClick={disabled ? undefined : onClick} style={{
      display:'inline-flex', alignItems:'center', justifyContent:'center', gap:6,
      borderRadius:10, padding: small ? '7px 14px' : '13px 24px',
      fontFamily:'var(--fd)', fontWeight:700, fontSize: small ? 11 : 14,
      letterSpacing:'0.08em', textTransform:'uppercase',
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.35 : 1, transition:'opacity 0.15s, transform 0.1s',
      width: full ? '100%' : undefined,
      ...v[variant], ...style,
    }}>{children}</button>
  )
}

export function Input({ value, onChange, placeholder, style, type='text', maxLength, onKeyDown }) {
  return (
    <input type={type} value={value} onChange={onChange} placeholder={placeholder}
      maxLength={maxLength} onKeyDown={onKeyDown}
      style={{
        background:'var(--surface2)', border:'1px solid var(--border)',
        borderRadius:10, padding:'12px 16px', color:'var(--text)', fontSize:15,
        fontFamily:'var(--fb)', transition:'border-color 0.2s', width:'100%', ...style,
      }}
    />
  )
}

export function Sel({ value, onChange, children, style }) {
  return (
    <select value={value} onChange={onChange} style={{
      background:'var(--surface2)', border:'1px solid var(--border)',
      borderRadius:10, padding:'12px 14px', color:'var(--text)', fontSize:13,
      fontFamily:'var(--fb)', width:'100%', cursor:'pointer',
      appearance:'none', ...style,
    }}>{children}</select>
  )
}

export function Card({ children, style, accent }) {
  return (
    <div style={{
      position:'relative', overflow:'hidden',
      background:'var(--surface)', border:`1px solid ${accent ? accent+'30' : 'var(--border)'}`,
      borderRadius:14, padding:18,
      boxShadow: accent ? `0 0 32px ${accent}10` : 'none',
      ...style,
    }}>
      {accent && <div style={{ position:'absolute', top:0, left:0, right:0, height:2, background:`linear-gradient(90deg, transparent, ${accent}, transparent)`, opacity:0.6 }}/>}
      {children}
    </div>
  )
}

export function Badge({ children, color }) {
  return (
    <span style={{
      display:'inline-block', padding:'3px 9px', borderRadius:5,
      fontFamily:'var(--fd)', fontWeight:700, fontSize:10, letterSpacing:'0.1em', textTransform:'uppercase',
      background: color+'22', border:`1px solid ${color}55`, color,
    }}>{children}</span>
  )
}

export function Dot({ color, size=8 }) {
  return <span style={{ display:'inline-block', width:size, height:size, borderRadius:'50%', background:color, flexShrink:0 }} />
}

export function Avatar({ name, color, size=36 }) {
  return (
    <div style={{
      width:size, height:size, borderRadius:'50%',
      background:`${color}20`, border:`2px solid ${color}`,
      display:'flex', alignItems:'center', justifyContent:'center',
      fontFamily:'var(--fd)', fontWeight:900, fontSize:size*0.4, color, flexShrink:0,
    }}>{name?.charAt(0)?.toUpperCase()}</div>
  )
}

export function LiveDot() {
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:4, color:'var(--accent2)', fontSize:10, fontFamily:'var(--fd)', fontWeight:700, letterSpacing:'0.12em' }}>
      <span style={{ width:5, height:5, borderRadius:'50%', background:'var(--accent2)', display:'inline-block' }} className="pulse"/>
      LIVE
    </span>
  )
}

export function SectionHead({ title, sub }) {
  return (
    <div style={{ marginBottom:20 }}>
      <h2 style={{ fontFamily:'var(--fd)', fontWeight:900, fontSize:26, letterSpacing:'0.04em', textTransform:'uppercase', lineHeight:1 }}>{title}</h2>
      {sub && <p style={{ color:'var(--mid)', fontSize:12, marginTop:5, lineHeight:1.5 }}>{sub}</p>}
    </div>
  )
}

export function Tabs({ tabs, active, onChange }) {
  return (
    <div style={{ display:'flex', borderBottom:'1px solid var(--border)', marginBottom:18 }}>
      {tabs.map(([key, label]) => (
        <button key={key} onClick={() => onChange(key)} style={{
          flex:1, background:'none', border:'none',
          color: active===key ? 'var(--text)' : 'var(--dim)',
          fontFamily:'var(--fd)', fontWeight:700, fontSize:11,
          letterSpacing:'0.07em', padding:'10px 0', cursor:'pointer',
          borderBottom: active===key ? '2px solid var(--accent)' : '2px solid transparent',
          textTransform:'uppercase', transition:'color 0.2s',
        }}>{label}</button>
      ))}
    </div>
  )
}

// ── TOUCH + MOUSE drag-to-reorder list (works on mobile) ─────────────────────
export function DragList({ items, onReorder }) {
  const [dragIdx, setDragIdx] = useState(null)
  const [overIdx, setOverIdx] = useState(null)
  const listRef = useRef(null)
  const touchDragIdx = useRef(null)
  const itemHeightRef = useRef(52) // approx row height

  // Desktop drag events
  const onDragStart = (i) => setDragIdx(i)
  const onDragEnter = (i) => setOverIdx(i)
  const onDragEnd = () => {
    if (dragIdx !== null && overIdx !== null && dragIdx !== overIdx) {
      const next = [...items]
      const [moved] = next.splice(dragIdx, 1)
      next.splice(overIdx, 0, moved)
      onReorder(next)
    }
    setDragIdx(null); setOverIdx(null)
  }

  // Touch events for mobile
  const onTouchStart = (e, i) => {
    touchDragIdx.current = i
    setDragIdx(i)
  }

  const onTouchMove = (e) => {
    e.preventDefault()
    const touch = e.touches[0]
    const list = listRef.current
    if (!list) return
    const rect = list.getBoundingClientRect()
    const relY = touch.clientY - rect.top
    const h = itemHeightRef.current
    const idx = Math.max(0, Math.min(items.length - 1, Math.floor(relY / h)))
    setOverIdx(idx)
  }

  const onTouchEnd = () => {
    const from = touchDragIdx.current
    const to = overIdx
    if (from !== null && to !== null && from !== to) {
      const next = [...items]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      onReorder(next)
    }
    touchDragIdx.current = null
    setDragIdx(null); setOverIdx(null)
  }

  return (
    <div ref={listRef} style={{ display:'flex', flexDirection:'column', gap:3 }}>
      {items.map((name, i) => {
        const t = TEAM_MAP[name] || { name, flag:'🏴', group:'?' }
        const isDragging = dragIdx === i
        const isOver = overIdx === i && dragIdx !== i
        return (
          <div
            key={name}
            className={`drag-item${isDragging ? ' dragging' : ''}${isOver ? ' over' : ''}`}
            draggable
            onDragStart={() => onDragStart(i)}
            onDragEnter={() => onDragEnter(i)}
            onDragEnd={onDragEnd}
            onTouchStart={e => onTouchStart(e, i)}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
            style={{
              display:'flex', alignItems:'center', gap:10,
              padding:'11px 12px', borderRadius:9, minHeight:itemHeightRef.current,
              background: isOver ? 'rgba(0,229,255,0.07)' : 'var(--surface2)',
              border:`1px solid ${isOver ? 'rgba(0,229,255,0.3)' : 'var(--border)'}`,
              cursor:'grab', userSelect:'none',
              opacity: isDragging ? 0.25 : 1,
              transition:'background 0.1s, border-color 0.1s, opacity 0.1s',
            }}
          >
            <span style={{ color:'var(--dim)', fontSize:10, minWidth:22, textAlign:'right', fontFamily:'var(--fd)', fontWeight:700 }}>{i+1}</span>
            <span style={{ fontSize:20 }}>{t.flag}</span>
            <span style={{ flex:1, fontSize:14, fontFamily:'var(--fb)', fontWeight:500 }}>{t.name}</span>
            <span style={{ fontSize:9, color:'var(--dim)', fontFamily:'var(--fd)', fontWeight:700, letterSpacing:'0.1em' }}>G{t.group}</span>
            <span style={{ color:'var(--dim)', fontSize:18, marginLeft:2, lineHeight:1 }}>⠿</span>
          </div>
        )
      })}
    </div>
  )
}

// Match card with micro-bet overlay
export function MatchCard({ match, assignments, playerColor, myName, onRemove }) {
  const t1 = TEAM_MAP[match.team1] || { name:match.team1, flag:'🏴' }
  const t2 = TEAM_MAP[match.team2] || { name:match.team2, flag:'🏴' }
  const bet = findMicroBet(assignments, match)
  const stage = STAGES.find(s => s.key === match.stage)
  // "finished" = full-time, whether or not there's a winner (draws have no winner but ARE finished)
  const finished = match.finished ?? !!match.winner
  const isDraw = finished && !match.winner

  const isMine = bet && (bet.owner1 === myName || bet.owner2 === myName)
  const iWin = finished && bet && bet.winnerId === myName
  const iLose = finished && bet && bet.winnerId && bet.winnerId !== myName

  return (
    <div style={{
      position:'relative', borderRadius:14, overflow:'hidden',
      background:'var(--surface)',
      border:`1px solid ${isMine ? (iWin ? '#00E67640' : iLose ? '#FF4D6D40' : '#ffffff15') : 'var(--border)'}`,
      marginBottom:10,
    }} className="pop">
      {bet && <div style={{ height:2, background:`linear-gradient(90deg, ${playerColor(bet.owner1)}, ${playerColor(bet.owner2)})` }}/>}
      <div style={{ padding:'14px 16px' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
          <Badge color='#8A9AB0'>{stage?.shortLabel || '?'}</Badge>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            {match.live && <LiveDot />}
            {finished && !match.live && <span style={{ fontSize:10, color:'var(--green)', fontFamily:'var(--fd)', fontWeight:700, letterSpacing:'0.1em' }}>{isDraw ? 'FT · DRAW' : 'FT'}</span>}
            {!finished && !match.live && match.date && (
              <span style={{ fontSize:10, color:'var(--dim)', fontFamily:'var(--fb)' }}>
                {new Date(match.date).toLocaleDateString('en-GB', { day:'numeric', month:'short' })}
              </span>
            )}
            {onRemove && <button onClick={onRemove} style={{ background:'none', border:'none', color:'var(--dim)', fontSize:14, cursor:'pointer', padding:'0 2px' }}>✕</button>}
          </div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <div style={{ flex:1, display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ fontSize:26 }}>{t1.flag}</span>
            <span style={{ fontFamily:'var(--fd)', fontWeight:700, fontSize:17, color: match.winner===match.team1 ? 'var(--gold)' : 'var(--text)' }}>{match.team1}</span>
          </div>
          <div style={{ padding:'4px 8px', background:'var(--surface2)', borderRadius:6, fontFamily:'var(--fd)', fontWeight:800, fontSize:11, color:'var(--dim)', letterSpacing:'0.12em' }}>VS</div>
          <div style={{ flex:1, display:'flex', alignItems:'center', gap:8, justifyContent:'flex-end' }}>
            <span style={{ fontFamily:'var(--fd)', fontWeight:700, fontSize:17, textAlign:'right', color: match.winner===match.team2 ? 'var(--gold)' : 'var(--text)' }}>{match.team2}</span>
            <span style={{ fontSize:26 }}>{t2.flag}</span>
          </div>
        </div>
        {bet && (
          <div style={{ marginTop:12, padding:'10px 14px', borderRadius:10, background:'rgba(0,0,0,0.25)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
              <Dot color={playerColor(bet.owner1)} size={7}/>
              <span style={{ fontFamily:'var(--fd)', fontWeight:700, fontSize:13, color: myName===bet.owner1 ? playerColor(bet.owner1) : 'var(--mid)' }}>{bet.owner1}</span>
              <span style={{ color:'var(--dim)', fontSize:10 }}>vs</span>
              <Dot color={playerColor(bet.owner2)} size={7}/>
              <span style={{ fontFamily:'var(--fd)', fontWeight:700, fontSize:13, color: myName===bet.owner2 ? playerColor(bet.owner2) : 'var(--mid)' }}>{bet.owner2}</span>
            </div>
            <div style={{ textAlign:'right', flexShrink:0, marginLeft:8 }}>
              <div style={{ fontFamily:'var(--fd)', fontWeight:900, fontSize:20, letterSpacing:'-0.02em', color: iWin ? 'var(--green)' : iLose ? 'var(--red)' : 'var(--gold)' }}>£{bet.betAmt}</div>
              {finished && (
                bet.winnerId
                  ? <div style={{ fontSize:10, color: iWin ? 'var(--green)' : 'var(--red)', fontFamily:'var(--fd)', fontWeight:700 }}>
                      {iWin ? '↑ YOU WIN' : `→ ${bet.winnerId} wins`}
                    </div>
                  : <div style={{ fontSize:10, color:'var(--dim)', fontFamily:'var(--fd)', fontWeight:700 }}>DRAW · NO PAYOUT</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
