// Official FIFA World Cup 2026 teams and groups (verified from FIFA standings)
export const ALL_TEAMS = [
  // GROUP A
  { name: "Mexico",               flag: "🇲🇽", group: "A" },
  { name: "South Africa",         flag: "🇿🇦", group: "A" },
  { name: "South Korea",          flag: "🇰🇷", group: "A" },
  { name: "Czechia",              flag: "🇨🇿", group: "A" },

  // GROUP B
  { name: "Canada",               flag: "🇨🇦", group: "B" },
  { name: "Bosnia-Herzegovina",   flag: "🇧🇦", group: "B" },
  { name: "Qatar",                flag: "🇶🇦", group: "B" },
  { name: "Switzerland",          flag: "🇨🇭", group: "B" },

  // GROUP C
  { name: "Brazil",               flag: "🇧🇷", group: "C" },
  { name: "Morocco",              flag: "🇲🇦", group: "C" },
  { name: "Haiti",                flag: "🇭🇹", group: "C" },
  { name: "Scotland",             flag: "🏴󠁧󠁢󠁳󠁣󠁴󠁿", group: "C" },

  // GROUP D
  { name: "USA",                  flag: "🇺🇸", group: "D" },
  { name: "Paraguay",             flag: "🇵🇾", group: "D" },
  { name: "Australia",            flag: "🇦🇺", group: "D" },
  { name: "Turkey",               flag: "🇹🇷", group: "D" },

  // GROUP E
  { name: "Germany",              flag: "🇩🇪", group: "E" },
  { name: "Curacao",              flag: "🇨🇼", group: "E" },
  { name: "Ivory Coast",          flag: "🇨🇮", group: "E" },
  { name: "Ecuador",              flag: "🇪🇨", group: "E" },

  // GROUP F
  { name: "Netherlands",          flag: "🇳🇱", group: "F" },
  { name: "Japan",                flag: "🇯🇵", group: "F" },
  { name: "Sweden",               flag: "🇸🇪", group: "F" },
  { name: "Tunisia",              flag: "🇹🇳", group: "F" },

  // GROUP G
  { name: "Belgium",              flag: "🇧🇪", group: "G" },
  { name: "Egypt",                flag: "🇪🇬", group: "G" },
  { name: "Iran",                 flag: "🇮🇷", group: "G" },
  { name: "New Zealand",          flag: "🇳🇿", group: "G" },

  // GROUP H
  { name: "Spain",                flag: "🇪🇸", group: "H" },
  { name: "Cape Verde",           flag: "🇨🇻", group: "H" },
  { name: "Saudi Arabia",         flag: "🇸🇦", group: "H" },
  { name: "Uruguay",              flag: "🇺🇾", group: "H" },

  // GROUP I
  { name: "France",               flag: "🇫🇷", group: "I" },
  { name: "Senegal",              flag: "🇸🇳", group: "I" },
  { name: "Iraq",                 flag: "🇮🇶", group: "I" },
  { name: "Norway",               flag: "🇳🇴", group: "I" },

  // GROUP J
  { name: "Argentina",            flag: "🇦🇷", group: "J" },
  { name: "Algeria",              flag: "🇩🇿", group: "J" },
  { name: "Austria",              flag: "🇦🇹", group: "J" },
  { name: "Jordan",               flag: "🇯🇴", group: "J" },

  // GROUP K
  { name: "Portugal",             flag: "🇵🇹", group: "K" },
  { name: "DR Congo",             flag: "🇨🇩", group: "K" },
  { name: "Uzbekistan",           flag: "🇺🇿", group: "K" },
  { name: "Colombia",             flag: "🇨🇴", group: "K" },

  // GROUP L
  { name: "England",              flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", group: "L" },
  { name: "Croatia",              flag: "🇭🇷", group: "L" },
  { name: "Ghana",                flag: "🇬🇭", group: "L" },
  { name: "Panama",               flag: "🇵🇦", group: "L" },
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
