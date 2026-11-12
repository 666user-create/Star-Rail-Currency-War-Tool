/**
 * 货币战争职级（赛季 2「入画奇航」起）。
 *
 * 官方结算界面显示「A5 紫金1」这种格式：大段位 A0–A8 + 小段位。
 *
 * 关于小段位：**所有大段都允许填小段位**。
 * 早期版本按「A8 是最高档、截图上没带编号」把 A8 设成不可填，是错的
 * ——官方截图只是没显示，不代表不能有（实测 A6 能到 9）。
 * 现在统一允许填任意数字。
 *
 * 来源：游戏内「职级奖励」界面 + 结算界面实测截图（2026-11-11/12, 4.7）。
 */
export interface RankOption {
  /** 稳定标识（A0–A8） */
  code: string
  /** 大段位名 */
  label: string
}

export const RANKS: RankOption[] = [
  { code: 'A0', label: '黑铁' },
  { code: 'A1', label: '青铜' },
  { code: 'A2', label: '翠钢' },
  { code: 'A3', label: '钴银' },
  { code: 'A4', label: '冰钛' },
  { code: 'A5', label: '紫金' },
  { code: 'A6', label: '投资大师' },
  { code: 'A7', label: '资本帝王' },
  { code: 'A8', label: '财富造物主' }
]

/**
 * 小段位上限。
 *
 * **只限制 A8（财富造物主）最多 20 档**——这是官方真正的满级点，
 * 到了就该提示「已到达最高段位」。
 *
 * 其他大段不设上限，用户填多少算多少（乐观设计：
 * 各档实际档数官方没公开，与其猜错卡住用户，不如放开）。
 * 明显离谱的输入（比如五位数字）由输入框自身限制为最多两位。
 */
export const MAX_SUB_A8 = 20

/** 取某档的小段位上限；非 A8 返回 Infinity（不限制）。 */
export function maxSubLevel(code: string): number {
  const key = (code ?? '').trim().toUpperCase()
  return key === 'A8' ? MAX_SUB_A8 : Number.POSITIVE_INFINITY
}

/** 小段位是否已满（用于「到达最高段位」判定）。 */
export function isMaxRank(value: RankValue | null): boolean {
  if (!value) return false
  const rank = rankByCode(value.code)
  if (!rank) return false
  return rank.code === 'A8' && value.sub >= MAX_SUB_A8
}

export interface RankValue {
  /** 大段位 code，如 A5 */
  code: string
  /** 小段位，如 1；A8 或未填时为 0 */
  sub: number
}

/** 按 code 取大段位；找不到返回 null。 */
export function rankByCode(code: string): RankOption | null {
  const trimmed = (code ?? '').trim().toUpperCase()
  return RANKS.find((item) => item.code === trimmed) ?? null
}

/**
 * 每档大段内的小段位基数（把「A6 投资大师7」压成一个可排序标量用）。
 *
 * 取 1000：只要大于任何一档可能填到的小段位数，就不会出现跨档倒挂。
 * A8 硬上限 20，其他档位用户自由填（乐观设计，不预设上限），1000 足够。
 */
const SUB_LEVEL_BASE = 1000

/**
 * 把职级压成可排序的数值：大段序号 × 10 + 小段位。
 * 例：A0黑铁1 → 1；A5紫金3 → 53；A6投资大师7 → 67；A8财富造物主 → 80。
 * 无法解析返回 null（调用方视为缺数据，跳过该点）。
 */
export function rankToScore(value: string): number | null {
  const parsed = parseRank(value)
  if (!parsed) return null
  const index = RANKS.findIndex((item) => item.code === parsed.code)
  if (index < 0) return null
  // 小段位 0（未填）按 0 处理，仍能体现大段间的先后
  return index * SUB_LEVEL_BASE + Math.max(0, parsed.sub)
}

/** 把 RankValue 拼成显示文本：「A5 紫金1」/「A8 财富造物主3」。 */
export function formatRank(value: RankValue | null): string {
  if (!value) return ''
  const rank = rankByCode(value.code)
  if (!rank) return ''
  return value.sub > 0 ? `${rank.code} ${rank.label}${value.sub}` : `${rank.code} ${rank.label}`
}

/**
 * 解析历史/手填文本为结构化的 RankValue。
 * 兼容格式：
 * - "A5 紫金1" / "A5紫金1" / "紫金1" / "A5"        → { code:'A5', sub:1|0 }
 * - "财富造物主50"（旧数据，带等级数字）           → { code:'A8', sub:0 }
 * - 无法识别                                        → null
 */
export function parseRank(value: string): RankValue | null {
  const text = (value ?? '').trim()
  if (!text) return null

  // 1) 找大段位：优先 code，其次名称
  let rank: RankOption | null = null
  const codeMatch = /([Aa][0-8])\b/.exec(text)
  if (codeMatch) rank = rankByCode(codeMatch[1])
  if (!rank) {
    // 从高档往低找，避免短名误匹配
    for (let i = RANKS.length - 1; i >= 0; i--) {
      if (text.includes(RANKS[i].label)) { rank = RANKS[i]; break }
    }
  }
  if (!rank) return null

  // 2) 找小段位：取名称/code 后面的数字。所有大段都允许有小段位。
  //    上限由各档 MAX_SUB 决定（A8 为 20，其余按实测放宽），这里只负责解析。
  let sub = 0
  {
    // 优先匹配「紫金1」「资本帝王7」这种紧跟名称的
    const afterName = new RegExp(`${rank.label}\\s*(\\d{1,2})`).exec(text)
    if (afterName) sub = Number(afterName[1])
    if (sub === 0) {
      // 退而求其次：code 后面的数字
      const afterCode = new RegExp(`${rank.code}\\s*(\\d{1,2})`, 'i').exec(text)
      if (afterCode) sub = Number(afterCode[1])
    }
  }
  return { code: rank.code, sub: Math.min(sub, maxSubLevel(rank.code)) }
}
