export const ALL_TEAMS = [
  { name: "Argentina", flag: "🇦🇷", group: "A" },
  { name: "France", flag: "🇫🇷", group: "B" },
  { name: "England", flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", group: "C" },
  { name: "Brazil", flag: "🇧🇷", group: "D" },
  { name: "Spain", flag: "🇪🇸", group: "E" },
  { name: "Germany", flag: "🇩🇪", group: "F" },
  { name: "Portugal", flag: "🇵🇹", group: "G" },
  { name: "Netherlands", flag: "🇳🇱", group: "H" },
  { name: "Belgium", flag: "🇧🇪", group: "A" },
  { name: "Croatia", flag: "🇭🇷", group: "B" },
  { name: "Uruguay", flag: "🇺🇾", group: "C" },
  { name: "Switzerland", flag: "🇨🇭", group: "D" },
  { name: "USA", flag: "🇺🇸", group: "E" },
  { name: "Mexico", flag: "🇲🇽", group: "F" },
  { name: "Morocco", flag: "🇲🇦", group: "G" },
  { name: "Senegal", flag: "🇸🇳", group: "H" },
  { name: "Japan", flag: "🇯🇵", group: "A" },
  { name: "South Korea", flag: "🇰🇷", group: "B" },
  { name: "Colombia", flag: "🇨🇴", group: "C" },
  { name: "Denmark", flag: "🇩🇰", group: "D" },
  { name: "Austria", flag: "🇦🇹", group: "E" },
  { name: "Turkey", flag: "🇹🇷", group: "F" },
  { name: "Ecuador", flag: "🇪🇨", group: "G" },
  { name: "Poland", flag: "🇵🇱", group: "H" },
  { name: "Australia", flag: "🇦🇺", group: "A" },
  { name: "Serbia", flag: "🇷🇸", group: "B" },
  { name: "Ukraine", flag: "🇺🇦", group: "C" },
  { name: "Hungary", flag: "🇭🇺", group: "D" },
  { name: "Czech Republic", flag: "🇨🇿", group: "E" },
  { name: "Wales", flag: "🏴󠁧󠁢󠁷󠁬󠁳󠁿", group: "F" },
  { name: "Cameroon", flag: "🇨🇲", group: "G" },
  { name: "Ghana", flag: "🇬🇭", group: "H" },
  { name: "Tunisia", flag: "🇹🇳", group: "A" },
  { name: "Nigeria", flag: "🇳🇬", group: "B" },
  { name: "Algeria", flag: "🇩🇿", group: "C" },
  { name: "Egypt", flag: "🇪🇬", group: "D" },
  { name: "Iran", flag: "🇮🇷", group: "E" },
  { name: "Saudi Arabia", flag: "🇸🇦", group: "F" },
  { name: "Qatar", flag: "🇶🇦", group: "G" },
  { name: "Bolivia", flag: "🇧🇴", group: "H" },
  { name: "Venezuela", flag: "🇻🇪", group: "A" },
  { name: "Canada", flag: "🇨🇦", group: "B" },
  { name: "Honduras", flag: "🇭🇳", group: "C" },
  { name: "Jamaica", flag: "🇯🇲", group: "D" },
  { name: "Costa Rica", flag: "🇨🇷", group: "E" },
  { name: "Panama", flag: "🇵🇦", group: "F" },
  { name: "Chile", flag: "🇨🇱", group: "G" },
  { name: "Peru", flag: "🇵🇪", group: "H" },
]

export const TEAM_MAP = Object.fromEntries(ALL_TEAMS.map(t => [t.name, t]))

export const STAGES = [
  { key: "r32", label: "Round of 32",   shortLabel: "R32", pct: 10 },
  { key: "r16", label: "Round of 16",   shortLabel: "R16", pct: 20 },
  { key: "qf",  label: "Quarter-Final", shortLabel: "QF",  pct: 30 },
  { key: "sf",  label: "Semi-Final",    shortLabel: "SF",  pct: 40 },
  { key: "f",   label: "Final",         shortLabel: "FIN", pct: 60 },
]

export const PLAYER_COLORS = [
  "#FF4D6D","#FF9F1C","#2EC4B6","#4CC9F0","#C77DFF",
  "#F72585","#43AA8B","#FFD60A","#06D6A0","#FF6B6B","#A8DADC","#E9C46A",
]

export const BET_AMOUNT = 5
export const MAX_PLAYERS = 12
