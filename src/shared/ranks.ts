/**
 * 货币战争职级（赛季 2「入画奇航」起）。
 *
 * 官方结算界面显示「A5 紫金1」这种格式：大段位 A0–A8 + 小段位 1/2/3。
 * 小段位顺序：数字越大越高（紫金1 < 紫金2 < 紫金3）。
 * 但 A8（财富造物主）是最高档，官方实测只有「A8 财富造物主」不带小段位编号，
 * 所以 `subLevels` 用 0 表示「该档没有小段位」。
 *
 * 来源：游戏内「职级奖励」界面 + 结算界面实测截图（2026-11-11, 4.7）。
 */
export interface RankOption {
  /** 稳定标识（A0–A8） */
  code: string
  /** 大段位名 */
  label: string
  /** 该档是否有小段位（1/2/3）。A8 没有 */
  hasSubLevel: boolean
}

export const RANKS: RankOption[] = [
  { code: 'A0', label: '黑铁', hasSubLevel: true },
  { code: 'A1', label: '青铜', hasSubLevel: true },
  { code: 'A2', label: '翠钢', hasSubLevel: true },
  { code: 'A3', label: '钴银', hasSubLevel: true },
  { code: 'A4', label: '冰钛', hasSubLevel: true },
  { code: 'A5', label: '紫金', hasSubLevel: true },
  { code: 'A6', label: '投资大师', hasSubLevel: true },
  { code: 'A7', label: '资本帝王', hasSubLevel: true },
  { code: 'A8', label: '财富造物主', hasSubLevel: false }
]

/**
 * 小段位不做成固定枚举：实测每个大段的档数不同
 * （紫金只到 3，资本帝王能到 7），官方也没公开完整表。
 * 所以界面用输入框让用户手填，这里只在解析时接受任意正整数。
 */

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
 * 每档大段内的小段位基数（用于把「A6 投资大师7」压成一个可排序的标量）。
 *
 * 为什么取 10 而不是实测档数：各档上限不同且官方未公开（紫金 3、资本帝王至少 7），
 * 取 10 留足余量，保证「A6 任意小段」永远排在「A7 任意小段」之前。
 * 玩家实际能填到的小段位不可能超过 10，所以不会出现跨档串位。
 */
const SUB_LEVEL_BASE = 10

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

/**
 * 把数值还原成基准展示用的档位标签（不带小段位）。
 * 只用于图表 Y 轴刻度，精确的小段位信息由点本身携带。
 */
export function scoreToRankLabel(score: number): string {
  const index = Math.floor(score / SUB_LEVEL_BASE)
  const rank = RANKS[Math.min(Math.max(index, 0), RANKS.length - 1)]
  return rank ? `${rank.code} ${rank.label}` : ''
}

/** 把 RankValue 拼成显示文本：「A5 紫金1」/「A8 财富造物主」。 */
export function formatRank(value: RankValue | null): string {
  if (!value) return ''
  const rank = rankByCode(value.code)
  if (!rank) return ''
  return rank.hasSubLevel && value.sub > 0 ? `${rank.code} ${rank.label}${value.sub}` : `${rank.code} ${rank.label}`
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

  // 2) 找小段位：该档有小段位时，取名称/code 后面的数字。
  //    不限制上限——实测资本帝王能到 7，各档上限不同，官方未公开完整表。
  let sub = 0
  if (rank.hasSubLevel) {
    // 优先匹配「紫金1」「资本帝王7」这种紧跟名称的
    const afterName = new RegExp(`${rank.label}\\s*(\\d{1,2})`).exec(text)
    if (afterName) sub = Number(afterName[1])
    if (sub === 0) {
      // 退而求其次：code 后面的数字
      const afterCode = new RegExp(`${rank.code}\\s*(\\d{1,2})`, 'i').exec(text)
      if (afterCode) sub = Number(afterCode[1])
    }
  }
  return { code: rank.code, sub }
}
