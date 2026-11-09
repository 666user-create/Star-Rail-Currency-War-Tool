/**
 * 货币战争赛季清单。
 *
 * 官方时间（HoYoverse 4.7 版本前瞻，2026-11-07 公布）：
 * - 零和博弈：随 3.7 开启；2026-11-11 06:00 (UTC+8) 结束（4.6 版本关闭同时刻）
 * - 入画奇航：随 4.7 更新开启。4.7 于 2026-11-11 06:00 开始停机维护，
 *   官方公告维护约 5 小时 → 约 11:00 (UTC+8) 开服，赛季随之开启。
 *
 * 这里取「4.7 开服时间」作为入画奇航的 startAt。维护可能提前或延后，
 * 因此保留用户在界面上自行覆盖的能力（settings.seasonStarts）。
 */
export interface SeasonOption {
  /** 用于存储与统计的赛季标识 */
  id: string
  /** 界面显示名 */
  label: string
  /** 开始时间（毫秒）。用户填写值优先 */
  startAt?: number
  /** 结束时间（毫秒） */
  endAt?: number
}

export const SEASONS: SeasonOption[] = [
  // 第一赛季：2025-11-05 起，2026-11-11 06:00 (UTC+8) 结束
  { id: '零和博弈', label: '零和博弈', startAt: Date.UTC(2025, 10, 5), endAt: Date.UTC(2026, 10, 10, 22) },
  // 第二赛季：随 4.7 开服开启（维护 06:00 起约 5 小时），结束时间官方未公布
  { id: '入画奇航', label: '入画奇航', startAt: Date.UTC(2026, 10, 11, 3) }
]

/** 用户在界面上填写的赛季时间（毫秒），优先级高于 SEASONS 里的内置值 */
export interface SeasonTimeOverrides {
  /** 赛季 id → 开始时间 */
  starts?: Record<string, number>
  /** 赛季 id → 结束时间 */
  ends?: Record<string, number>
}

/** 把内置清单与用户填写值合并，得到实际生效的赛季定义。 */
export function resolvedSeasons(overrides: SeasonTimeOverrides = {}): SeasonOption[] {
  return SEASONS.map((season) => {
    const startAt = overrides.starts?.[season.id] ?? season.startAt
    const endAt = overrides.ends?.[season.id] ?? season.endAt
    return { ...season, startAt, endAt }
  })
}

/** 按当前时间推测默认赛季：优先取已开始且未结束的；都在未来则取最近将开始的；都过期取最后一个。 */
export function defaultSeason(now = Date.now(), overrides: SeasonTimeOverrides = {}): string {
  const seasons = resolvedSeasons(overrides)
  const active = seasons.find((season) => (season.startAt == null || now >= season.startAt)
    && (season.endAt == null || now < season.endAt))
  if (active) return active.id
  const upcoming = seasons.find((season) => season.startAt != null && now < season.startAt)
  if (upcoming) return upcoming.id
  return seasons[seasons.length - 1].id
}

/** 校验并归一化用户选择的赛季：空值回落默认赛季，已知赛季用 id，未知自定义名保留原文。 */
export function normalizeSeason(value: string, overrides: SeasonTimeOverrides = {}): string {
  const trimmed = (value ?? '').trim().slice(0, 80)
  if (!trimmed) return defaultSeason(Date.now(), overrides)
  const known = SEASONS.find((season) => season.id === trimmed || season.label === trimmed)
  return known ? known.id : trimmed
}

/** 该赛季是否已有明确的开始时间（内置或用户填写）。 */
export function hasStartTime(seasonId: string, overrides: SeasonTimeOverrides = {}): boolean {
  const season = resolvedSeasons(overrides).find((item) => item.id === seasonId)
  return season?.startAt != null
}

/** 把日期字符串（yyyy-MM-dd，本地时区）转成当天 00:00 的毫秒时间戳；非法返回 null。 */
export function parseStartDate(value: string): number | null {
  const trimmed = (value ?? '').trim()
  if (!trimmed) return null
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed)
  if (!match) return null
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3])
  const date = new Date(year, month - 1, day, 0, 0, 0, 0)
  if (Number.isNaN(date.getTime())) return null
  // 防止 2026-02-30 之类被自动滚动到 3 月
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null
  return date.getTime()
}

/** 毫秒时间戳 → yyyy-MM-dd（本地时区），用于回填输入框。 */
export function formatStartDate(ms?: number): string {
  if (ms == null) return ''
  const date = new Date(ms)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}
