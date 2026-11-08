export type MatchResult = 'win' | 'loss' | 'interrupted' | 'suspected'
export type MatchSource = 'demo' | 'manual' | 'ocr'

export interface Match {
  id: number
  startedAt: number | null
  endedAt: number
  durationSec: number | null
  result: MatchResult
  /** 阵容：角色名列表 */
  lineup: string[]
  /** 羁绊：名称（可选带 ×数量） */
  bonds: string[]
  rankChange: number | null
  season: string
  source: MatchSource
  screenshotPath: string | null
  confidence: number | null
  note: string | null
  mode: 'standard' | 'overclock' | null
  rankBefore: string | null
  rankAfter: string | null
  rating: string | null
  squadHp: number | null
}

export type RecordFields = Pick<Match, 'result' | 'lineup' | 'bonds' | 'rankChange' | 'season' | 'note' | 'mode' | 'rankBefore' | 'rankAfter' | 'rating' | 'squadHp'>
export type OcrPageKind = 'settlement' | 'history' | 'unknown'
/** 截图中的归一化区域坐标，供本地图标匹配使用。 */
export interface ImageRegion { x: number; y: number; width: number; height: number }
export interface VisionRegions {
  lineup?: ImageRegion
  bonds?: ImageRegion
  counts?: Array<ImageRegion & { text: string }>
}
export interface OcrAnalysis {
  text: string
  pageKind: OcrPageKind
  fields: Partial<RecordFields>
  warnings: string[]
  vision?: VisionRegions
}
export interface RecordingDraft {
  id: string
  createdAt: number
  startedAt: number | null
  endedAt: number
  durationSec: number | null
  status: 'capturing' | 'recognizing' | 'review'
  screenshotPath: string | null
  fields: RecordFields
  pageKind: OcrPageKind
  ocrText: string
  warnings: string[]
  error: string | null
}
export type DraftInput = RecordFields & { endedAt: number; durationSec: number | null }

export interface OverviewStats {
  total: number
  wins: number
  losses: number
  interrupted: number
  winRate: number
  totalDurationSec: number
  avgDurationSec: number | null
  bestWinStreak: number
  bestLossStreak: number
  maxRankHours: number
  maxRankGames: number
  knownDurationGames: number
  unknownDurationGames: number
  /** 平均小队生命值（仅统计已填写血量的对局；无则 null） */
  avgSquadHp: number | null
  /** 已知血量的对局数 */
  knownSquadHpGames: number
}

export interface LineupStat {
  lineup: string
  games: number
  wins: number
  winRate: number
}

/** 羁绊统计（与阵容分开） */
export interface BondStat {
  bond: string
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

export type PetActivity = 'low' | 'normal' | 'high'

export interface AppSettings {
  gamePath: string
  recordSeason?: string
  quietMode: boolean
  idleAnimations: boolean
  idleTalk: boolean
  activity: PetActivity
  petX?: number
  petY?: number
  petStyle?: 'official' | 'sprite' | 'svg' | '3d'
}

/** 窗口相对坐标矩形（setShape 区域单元） */
export interface PetRect {
  x: number
  y: number
  width: number
  height: number
}

export interface PetBubbleContent {
  text: string
}

export interface RecordingChange {
  startedAt: number | null
  match: Match | null
}

export interface PetBubbleView {
  content: PetBubbleContent | null
  side: import('./bubblePlacement').BubbleSide
  revision: number
}

export interface PetApi {
  listMatches(limit?: number): Promise<Match[]>
  getMatch(id: number): Promise<Match | null>
  overview(): Promise<OverviewStats>
  lineupStats(): Promise<LineupStat[]>
  bondStats(): Promise<BondStat[]>
  rankCurve(): Promise<RankPoint[]>
  durationHistogram(): Promise<DurationBucket[]>
  hourHistogram(): Promise<HourBucket[]>
  isRecording(): Promise<number | null>
  recordStart(): Promise<number>
  recordEnd(): Promise<RecordingDraft | null>
  listDrafts(): Promise<RecordingDraft[]>
  importScreenshot(): Promise<RecordingDraft | null>
  importClipboardImage(): Promise<RecordingDraft | null>
  canPasteImage(): Promise<boolean>
  recognizeDraft(id: string): Promise<RecordingDraft>
  replaceDraftScreenshot(id: string): Promise<RecordingDraft>
  /** 用剪贴板图片替换草稿截图并重新识别 */
  replaceDraftWithClipboard(id: string): Promise<RecordingDraft>
  captureDraft(id: string): Promise<RecordingDraft>
  confirmDraft(id: string, input: DraftInput): Promise<Match>
  discardDraft(id: string): Promise<void>
  draftScreenshot(id: string): Promise<string | null>
  matchScreenshot(id: number): Promise<string | null>
  onRecordsChanged(listener: () => void): () => void
  /** 面板打开时自动选中指定的待确认草稿（结束计时后触发） */
  onDraftFocus(listener: (id: string) => void): () => void
  onRecordingChange(listener: (change: RecordingChange) => void): () => void
  launchGame(): Promise<boolean>
  getSettings(): Promise<AppSettings>
  setSettings(patch: Partial<AppSettings>): Promise<AppSettings>
  onSettingsChanged(listener: (settings: AppSettings) => void): () => void
  petVisibility(): Promise<boolean>
  onPetVisibility(listener: (visible: boolean) => void): () => void
  petHide(): void
  petShow(): void
  sprite(): Promise<string | null>
  officialModel(): Promise<{ obj: string; tex: string; cool: string; warm: string } | null>
  panelToggle(): void
  /** setShape 区域（窗口相对坐标），覆盖本体、动效头顶和菜单；气泡使用独立窗口。 */
  petShape(rects: PetRect[]): void
  petBubble(content: PetBubbleContent | null): void
  bubbleView(): Promise<PetBubbleView>
  onBubbleView(listener: (view: PetBubbleView) => void): () => void
  bubbleMeasure(height: number, revision: number): void
  petMenu(open: boolean): void
  timerShape(rect: PetRect, startedAt: number | null): void
  settingsOpen(): void
  petDrag(action: 'start' | 'move' | 'end'): void
  quit(): void
}
