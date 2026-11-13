export type MatchResult = 'win' | 'loss' | 'suspected'
export type MatchSource = 'demo' | 'manual' | 'ocr'

export interface Match {
  id: number
  startedAt: number | null
  endedAt: number
  durationSec: number | null
  result: MatchResult
  /** 阵容：角色名列表 */
  lineup: string[]
  /** 羁绊：名称列表。数量不做自动识别，用户可自行写成「减益×2」 */
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
  winRate: number
  totalDurationSec: number
  avgDurationSec: number | null
  bestWinStreak: number
  bestLossStreak: number
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
  /**
   * 该局结束后玩家所在段位的可排序数值（大段序号×1000 + 小段位）。
   * 例：A0黑铁1=1、A5紫金3=5003、A6投资大师7=6007、A8财富造物主20=8020。
   * 这是**绝对位置**，不是累加值 —— 大段间有晋级赛，累加会算错。
   */
  cumulative: number
  /**
   * 该局**开始时**的段位分数（来自 rank_before）。
   *
   * 用来算「这一把涨了多少小段」时必须用它，而不是上一局的结算后段位 ——
   * 两者可能不一致（玩家会补录/修正段位），用上一局算会得出错误涨幅
   * （实例：某局 before=A8财富造物主3(8003)、after=财富造物主6(8006)，
   *  真实涨幅 +3，用上一局的 8000 算却成了 +6）。
   * 未填写时为 null，此时才回落到上一局的结算后段位。
   */
  before: number | null
  /** 该点对应的原始段位文本（如「A6 投资大师7」），用于图表提示 */
  label: string
  /** 该局结果；用于在走势图上把失败局标红。未记录时为 null */
  result: 'win' | 'loss' | null
}

/** 满级贺图所需的全量数据 */
export interface CelebrationData {
  /** 赛季名 */
  season: string
  /** 最终职级文本（如「A8 财富造物主20」） */
  finalRank: string
  /** 大段 code（如 A8） */
  rankCode: string
  /** 大段名（如 财富造物主） */
  rankLabel: string
  /** 小段位（如 20） */
  subLevel: number
  /** 达成时间（毫秒时间戳） */
  achievedAt: number
  /** 总对局 */
  total: number
  /** 胜场 */
  wins: number
  /** 负场 */
  losses: number
  /** 胜率 0~1 */
  winRate: number
  /** 总时长（秒） */
  totalDurationSec: number
  /** 最长连胜 */
  bestWinStreak: number
  /** 平均小队血量 */
  avgSquadHp: number | null
  /** 段位走势（每局一个点） */
  curve: RankPoint[]
  /** 整个赛季打了多少天 */
  seasonDays: number
}

export interface DurationBucket {
  label: string
  count: number
}

export interface HourBucket {
  hour: number
  count: number
}

/** 评级分布的一格。评级来自结算界面的 SSS/SS/S/A/B/C 等档位 */
export interface RatingBucket {
  /** 评级名（SSS / SS / S / A / B / C …） */
  label: string
  /** 该评级的对局数 */
  count: number
  /** 该评级占「有评级对局」的比例 0~1 */
  ratio: number
  /** 该评级里的胜场数 */
  wins: number
}

export type DialogueEvent =
  | 'click' | 'win' | 'loss' | 'winStreak' | 'lossStreak'
  | 'start' | 'end' | 'idle' | 'launch' | 'needGamePath' | 'checkUpdate'

export interface DialogueContext {
  [key: string]: string | number | undefined
}

export type PetActivity = 'low' | 'normal' | 'high'

export interface AppSettings {
  gamePath: string
  /**
   * 「货币战争启动!」用哪种方式启动游戏：
   * - 'launcher'：启动官方 launcher.exe（唯一受支持入口，打开启动器界面，
   *   还需再手动点一次「开始游戏」）。**默认值**。
   * - 'game'：直接启动 Game\StarRail.exe。官方新版已封死，会弹「现在已经不支持」，
   *   仅部分仍允许直启的旧版本可用。
   *
   * 默认 'launcher'：官方开始菜单的快捷方式也只指向 launcher.exe 且不带参数，
   * 直启游戏 exe 已不受支持。
   */
  /** 当前使用的存档名（多账号/多存档用）。默认 main */
  archiveName?: string
  launchMode?: 'game' | 'launcher'
  recordSeason?: string
  /** 用户填写的赛季开始时间：赛季 id → 毫秒时间戳（优先于代码内置值） */
  seasonStarts?: Record<string, number>
  /** 用户填写的赛季结束时间 */
  seasonEnds?: Record<string, number>
  quietMode: boolean
  idleAnimations: boolean
  idleTalk: boolean
  activity: PetActivity
  /** 截图保存目录；为空表示使用默认位置（data/screenshots 或 userData） */
  screenshotDir?: string
  petX?: number
  petY?: number
  petStyle?: 'official' | 'sprite' | 'svg' | '3d'
}

/** 一个存档（对应一个账号的数据库）的信息 */
export interface ArchiveInfo {
  /** 存档名（main 为默认存档） */
  name: string
  /** 该存档的对局数 */
  count: number
  /** 数据库文件大小（字节） */
  size: number
  /** 创建时间（毫秒） */
  createdAt: number
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

/** 自定义托盘菜单的状态与动作 */
export interface TrayMenuState {
  petHidden: boolean
  quietMode: boolean
  recording: boolean
}
export type TrayMenuAction = 'toggle-pet' | 'toggle-quiet' | 'open-panel' | 'open-settings' | 'quit'

export interface PetApi {
  listMatches(limit?: number, season?: string | null): Promise<Match[]>
  getMatch(id: number): Promise<Match | null>
  /** 删除一条战绩；返回被删记录（不存在返回 null） */
  removeMatch(id: number): Promise<Match | null>
  /** 库里出现过的赛季名（用于界面提示） */
  seasons(): Promise<string[]>
  /** 以下统计均可传 season 做隔离；不传则统计全部 */
  overview(season?: string | null): Promise<OverviewStats>
  lineupStats(season?: string | null): Promise<LineupStat[]>
  bondStats(season?: string | null): Promise<BondStat[]>
  rankCurve(season?: string | null): Promise<RankPoint[]>
  durationHistogram(season?: string | null): Promise<DurationBucket[]>
  hourHistogram(season?: string | null): Promise<HourBucket[]>
  /** 评级分布（只统计有评级的对局） */
  ratingStats(season?: string | null): Promise<RatingBucket[]>
  /** 满级贺图数据；未达 A8 满级时返回 null */
  celebrationData(season?: string | null): Promise<CelebrationData | null>
  /** 用隐藏窗口渲染贺图并导出 PNG；返回保存路径，取消返回 null */
  saveCelebrationCapture(dataJson: string, suggestedName: string): Promise<string | null>
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
  /** 修改已保存的战绩（落子无悔取消） */
  updateMatch(id: number, input: DraftInput): Promise<Match>
  discardDraft(id: string): Promise<void>
  draftScreenshot(id: string): Promise<string | null>
  matchScreenshot(id: number): Promise<string | null>
  /** 用系统看图器打开草稿/战绩的原图 */
  openDraftImage(id: string): Promise<boolean>
  openMatchImage(id: number): Promise<boolean>
  onRecordsChanged(listener: () => void): () => void
  /** 面板打开时自动选中指定的待确认草稿（结束计时后触发） */
  onDraftFocus(listener: (id: string) => void): () => void
  onRecordingChange(listener: (change: RecordingChange) => void): () => void
  launchGame(): Promise<boolean>
  /** 导出全部战绩为 CSV，返回保存路径与导出条数 */
  exportCsv(): Promise<{ ok: boolean; canceled?: boolean; path?: string; count?: number; error?: string }>
  /** 备份当前数据库到用户指定位置 */
  backupData(): Promise<{ ok: boolean; canceled?: boolean; path?: string; error?: string }>
  /** 用备份文件恢复当前数据库 */
  restoreData(): Promise<{ ok: boolean; canceled?: boolean; error?: string }>
  /** 列出所有存档（多账号） */
  listArchives(): Promise<ArchiveInfo[]>
  /** 新建一个空存档 */
  createArchive(name: string): Promise<{ ok: boolean; name?: string; error?: string }>
  /** 切换到指定存档（会清空当前账号的计时与草稿） */
  switchArchive(name: string): Promise<{ ok: boolean; name?: string; error?: string }>
  /** 删除指定存档（不能删当前使用的） */
  deleteArchive(name: string): Promise<{ ok: boolean; error?: string }>
  getSettings(): Promise<AppSettings>
  setSettings(patch: Partial<AppSettings>): Promise<AppSettings>
  /** 打开文件夹选择器，返回选中路径（取消返回 null） */
  pickScreenshotDir(): Promise<string | null>
  /** 当前实际生效的截图目录 */
  currentScreenshotDir(): Promise<string>
  onSettingsChanged(listener: (settings: AppSettings) => void): () => void
  petVisibility(): Promise<boolean>
  onPetVisibility(listener: (visible: boolean) => void): () => void
  petHide(): void
  petShow(): void
  sprite(): Promise<string | null>
  officialModel(): Promise<{ obj: string; tex: string; cool: string; warm: string } | null>
  panelToggle(): void
  /** 最小化面板窗口 */
  panelMinimize(): void
  /** 切换最大化/还原，返回切换后的最大化状态 */
  panelToggleMaximize(): Promise<boolean>
  /** 查询面板是否处于最大化 */
  panelIsMaximized(): Promise<boolean>
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
  /** 手动检查更新（忽略 24 小时节流） */
  checkUpdate(): Promise<UpdateCheckResult>
  /** 打开下载页（Gitee Releases） */
  openDownloadPage(): Promise<void>
  // —— 首次设置向导 ——
  detectGamePath(): Promise<{ path: string | null; message: string }>
  pickGamePath(): Promise<string | null>
  /** 运行模型提取；进度通过 onWizardProgress 推送 */
  runExtraction(gamePath: string): Promise<void>
  onWizardProgress(listener: (event: { line: string; percent: number }) => void): () => void
  completeWizard(config: { gamePath: string; screenshotDir: string; launchMode?: 'game' | 'launcher' }): Promise<void>
  // —— 自定义托盘菜单 ——
  trayMenuState(): Promise<TrayMenuState>
  onTrayMenuState(listener: (state: TrayMenuState) => void): () => void
  trayMenuAction(action: TrayMenuAction): void
  trayMenuClose(): void
}

/** 版本检查结果 */
export interface UpdateCheckResult {
  /** 是否有新版本 */
  hasUpdate: boolean
  /** 远程最新版本号（去掉前缀 v）；检查失败为 null */
  latest: string | null
  /** 当前版本 */
  current: string
  /** 下载页地址 */
  downloadPage: string
}
