export type MatchResult = 'win' | 'loss' | 'interrupted' | 'suspected'
export type MatchSource = 'demo' | 'manual' | 'ocr'

export interface Match {
  id: number
  startedAt: number
  endedAt: number
  durationSec: number
  result: MatchResult
  lineup: string[]
  rankChange: number | null
  season: string
  source: MatchSource
  screenshotPath: string | null
  confidence: number | null
  note: string | null
}

export interface OverviewStats {
  total: number
  wins: number
  losses: number
  interrupted: number
  winRate: number
  totalDurationSec: number
  avgDurationSec: number
  bestWinStreak: number
  bestLossStreak: number
  maxRankHours: number
  maxRankGames: number
}

export interface LineupStat {
  lineup: string
  games: number
  wins: number
  winRate: number
}

export interface RankPoint {
  time: number
  cumulative: number
}

export interface DurationBucket {
  label: string
  count: number
}

export interface HourBucket {
  hour: number
  count: number
}

export type DialogueEvent =
  | 'click' | 'win' | 'loss' | 'winStreak' | 'lossStreak'
  | 'start' | 'end' | 'idle' | 'launch' | 'needGamePath'

export interface DialogueContext {
  [key: string]: string | number | undefined
}

export interface AppSettings {
  gamePath: string
  petX?: number
  petY?: number
}

export interface PetApi {
  listMatches(limit?: number): Promise<Match[]>
  getMatch(id: number): Promise<Match | null>
  overview(): Promise<OverviewStats>
  lineupStats(): Promise<LineupStat[]>
  rankCurve(): Promise<RankPoint[]>
  durationHistogram(): Promise<DurationBucket[]>
  hourHistogram(): Promise<HourBucket[]>
  isRecording(): Promise<number | null>
  recordStart(): Promise<number>
  recordEnd(): Promise<Match | null>
  launchGame(): Promise<boolean>
  getSettings(): Promise<AppSettings>
  setSettings(patch: Partial<AppSettings>): Promise<AppSettings>
  panelToggle(): void
  settingsOpen(): void
  petDrag(action: 'start' | 'end'): void
  quit(): void
}
