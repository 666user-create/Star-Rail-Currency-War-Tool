import type { AppSettings, PetActivity } from './types'

export const IDLE_ACTIVITY_SECONDS: Record<PetActivity, readonly [number, number]> = {
  low: [90, 180], normal: [40, 90], high: [20, 45]
}

/** 旧配置自动补齐陪伴偏好；无效输入不能使待机计时器变成紧密循环。 */
export function normalizeSettings(value: unknown): AppSettings {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}

  /** 赛季时间映射：只保留「非空字符串 → 有限数字」的条目，忽略脏数据。 */
  const isFiniteMap = (input: unknown): Record<string, number> | undefined => {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return undefined
    const out: Record<string, number> = {}
    for (const [key, raw] of Object.entries(input as Record<string, unknown>)) {
      if (typeof raw !== 'number' || !Number.isFinite(raw)) continue
      const name = key.trim().slice(0, 80)
      if (!name) continue
      out[name] = raw
    }
    return Object.keys(out).length ? out : undefined
  }
  const result: AppSettings = {
    gamePath: typeof source.gamePath === 'string' ? source.gamePath : '',
    quietMode: typeof source.quietMode === 'boolean' ? source.quietMode : false,
    idleAnimations: typeof source.idleAnimations === 'boolean' ? source.idleAnimations : true,
    idleTalk: typeof source.idleTalk === 'boolean' ? source.idleTalk : true,
    activity: source.activity === 'low' || source.activity === 'high' ? source.activity : 'normal'
  }
  if (typeof source.petX === 'number' && Number.isFinite(source.petX)) result.petX = source.petX
  if (typeof source.petY === 'number' && Number.isFinite(source.petY)) result.petY = source.petY
  if (source.petStyle === 'official' || source.petStyle === 'sprite' || source.petStyle === 'svg' || source.petStyle === '3d') result.petStyle = source.petStyle
  if (typeof source.recordSeason === 'string' && source.recordSeason.trim()) result.recordSeason = source.recordSeason.trim().slice(0, 80)
  const starts = isFiniteMap(source.seasonStarts)
  if (starts) result.seasonStarts = starts
  const ends = isFiniteMap(source.seasonEnds)
  if (ends) result.seasonEnds = ends
  if (typeof source.screenshotDir === 'string' && source.screenshotDir.trim()) result.screenshotDir = source.screenshotDir.trim().slice(0, 320)
  return result
}

export function idleDelayMs(activity: PetActivity, random = Math.random()): number {
  const [min, max] = IDLE_ACTIVITY_SECONDS[activity] ?? IDLE_ACTIVITY_SECONDS.normal
  const fraction = Number.isFinite(random) ? Math.max(0, Math.min(1, random)) : 0.5
  return (min + (max - min) * fraction) * 1000
}
