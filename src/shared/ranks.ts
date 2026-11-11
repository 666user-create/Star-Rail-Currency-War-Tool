/**
 * 货币战争职级（赛季 2「入画奇航」起，官方结算界面共 9 档 A0–A8）。
 *
 * 来源：游戏内「职级奖励」界面。
 * 用户可能还会遇到旧赛季的自定义职级文本（如「财富造物主50」），
 * 所以这里的下拉框允许额外保留非标准值，不强制只能选列表项。
 */
export interface RankOption {
  /** 稳定标识（A0–A8） */
  code: string
  /** 界面显示名 */
  label: string
  /** 完整显示（含编号），用于展示 */
  full: string
}

export const RANKS: RankOption[] = [
  { code: 'A0', label: '黑铁', full: 'A0 黑铁' },
  { code: 'A1', label: '青铜', full: 'A1 青铜' },
  { code: 'A2', label: '翠钢', full: 'A2 翠钢' },
  { code: 'A3', label: '钴银', full: 'A3 钴银' },
  { code: 'A4', label: '冰钛', full: 'A4 冰钛' },
  { code: 'A5', label: '紫金', full: 'A5 紫金' },
  { code: 'A6', label: '投资大师', full: 'A6 投资大师' },
  { code: 'A7', label: '资本帝王', full: 'A7 资本帝王' },
  { code: 'A8', label: '财富造物主', full: 'A8 财富造物主' }
]

/** 按 code 取职级；找不到返回 null。 */
export function rankByCode(code: string): RankOption | null {
  const trimmed = (code ?? '').trim().toUpperCase()
  return RANKS.find((item) => item.code === trimmed) ?? null
}

/**
 * 把历史记录里的职级文本归一化到某个标准职级。
 * 兼容旧数据：
 * - "A5 紫金" / "紫金" / "A5"      → A5 紫金
 * - "财富造物主50" / "财富造物主"   → A8 财富造物主
 * - 无法识别                        → null（调用方保留原文，不让用户丢数据）
 */
export function matchRank(value: string): RankOption | null {
  const text = (value ?? '').trim()
  if (!text) return null

  // 1) 精确 code
  const byCode = rankByCode(text)
  if (byCode) return byCode

  // 2) 以 code 开头（"A5 紫金"）
  const codeMatch = /^([Aa][0-8])\b/.exec(text)
  if (codeMatch) {
    const hit = rankByCode(codeMatch[1])
    if (hit) return hit
  }

  // 3) 包含名称（"财富造物主50"、"A6 投资大师"）
  // 从高档往低找，避免「投资大师」被「大师」之类的短名误匹配
  for (let i = RANKS.length - 1; i >= 0; i--) {
    if (text.includes(RANKS[i].label)) return RANKS[i]
  }
  return null
}
