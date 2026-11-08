import type { DraftInput, RecordFields } from './types'

export function validateDraftInput(value: unknown): DraftInput {
  if (!value || typeof value !== 'object') throw new Error('请检查本局记录内容')
  const input = value as DraftInput
  const text = (value: unknown, label: string, max: number): string | null => {
    if (value === null || value === undefined || value === '') return null
    if (typeof value !== 'string' || value.length > max) throw new Error(`${label}内容过长或格式不正确`)
    return value.trim() || null
  }
  const nullableInteger = (value: unknown, label: string, min: number, max: number): number | null => {
    if (value === null || value === undefined || value === '') return null
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) throw new Error(`请检查${label}`)
    return value
  }
  if (!['win', 'loss', 'interrupted', 'suspected'].includes(input.result)) throw new Error('请选择本局结果')
  if (!Number.isSafeInteger(input.endedAt) || input.endedAt < 0 || input.endedAt > Date.now() + 86400000) throw new Error('请检查结束时间')
  const durationSec = nullableInteger(input.durationSec, '对局时长', 0, Math.floor(input.endedAt / 1000))
  if (!Array.isArray(input.lineup) || input.lineup.length > 40 || input.lineup.some(item => typeof item !== 'string' || item.length > 80)) throw new Error('请检查阵容')
  if (!Array.isArray(input.bonds) || input.bonds.length > 40 || input.bonds.some(item => typeof item !== 'string' || item.length > 80)) throw new Error('请检查羁绊')
  if (input.mode !== null && input.mode !== 'standard' && input.mode !== 'overclock') throw new Error('请选择博弈模式，无法确定时留空')
  const fields: RecordFields = {
    result: input.result,
    lineup: [...new Set(input.lineup.map(item => item.trim()).filter(Boolean))],
    bonds: [...new Set(input.bonds.map(item => item.trim()).filter(Boolean))],
    rankChange: nullableInteger(input.rankChange, '职级变化', -999, 999),
    season: text(input.season, '赛季', 80) ?? '',
    note: text(input.note, '备注', 4000),
    mode: input.mode,
    rankBefore: text(input.rankBefore, '原职级', 120),
    rankAfter: text(input.rankAfter, '结算后职级', 120),
    rating: text(input.rating, '评分', 16)?.toUpperCase() ?? null,
    squadHp: nullableInteger(input.squadHp, '小队生命值', 0, 999)
  }
  return { ...fields, endedAt: input.endedAt, durationSec }
}
