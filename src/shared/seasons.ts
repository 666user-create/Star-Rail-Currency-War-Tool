/**
 * 货币战争赛季清单。
 * 官方公布来源：HoYoverse 2026-10-25 年度回顾（第二赛季名 "Voyage Into the Canvas"）。
 * 第一赛季「零和博弈」于 2026-11-11 06:00 (UTC+8) 结束；第二赛季开始日期官方尚未公布。
 * 新增赛季只需在此追加；开始日期公布后补上 startAt。
 */
export interface SeasonOption {
  /** 用于存储与统计的赛季标识 */
  id: string
  /** 界面显示名 */
  label: string
  /** 赛季开始时间（毫秒）。未知则留空，仅作显示与默认值参考 */
  startAt?: number
  /** 赛季结束时间（毫秒） */
  endAt?: number
}

export const SEASONS: SeasonOption[] = [
  { id: '零和博弈', label: '零和博弈', startAt: Date.UTC(2025, 10, 5), endAt: Date.UTC(2026, 10, 10, 22) },
  { id: '入画奇航', label: '入画奇航' }
]

/** 按当前时间推测的默认赛季：优先取已开始且未结束的；都在未来则取最近将开始的；都过期取最后一个。 */
export function defaultSeason(now = Date.now()): string {
  const active = SEASONS.find((season) => (season.startAt == null || now >= season.startAt)
    && (season.endAt == null || now < season.endAt))
  if (active) return active.id
  const upcoming = SEASONS.find((season) => season.startAt != null && now < season.startAt)
  if (upcoming) return upcoming.id
  return SEASONS[SEASONS.length - 1].id
}

/** 校验并归一化用户选择的赛季：空值回落默认赛季，已知赛季用 id，未知自定义名保留原文。 */
export function normalizeSeason(value: string): string {
  const trimmed = (value ?? '').trim().slice(0, 80)
  if (!trimmed) return defaultSeason()
  const known = SEASONS.find((season) => season.id === trimmed || season.label === trimmed)
  return known ? known.id : trimmed
}
