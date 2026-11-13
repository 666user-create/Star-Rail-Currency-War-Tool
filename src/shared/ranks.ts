/**
 * 货币战争职级（赛季 2「入画奇航」起）。
 *
 * 官方结算界面显示「A5 紫金1」这种格式：大段位 A0–A8 + 小段位。
 *
 * 关于小段位：**每个大段的档数不同**，由玩家提供的完整职级表确定：
 *   A0 黑铁 3 · A1 青铜 3 · A2 翠钢 3 · A3 钴银 5 · A4 冰钛 7
 *   A5 紫金 9 · A6 投资大师 9 · A7 资本帝王 9 · A8 财富造物主 20
 * 早期版本只有 A8 设了上限 20、其余不限制（当时的乐观设计），
 * 会放过「紫金99」这种非法输入，也无法判断某档是否已满，故改为按表限制。
 *
 * 来源：游戏内「职级奖励」界面 + 结算界面实测截图（2026-11-11/12, 4.7）
 *      + 玩家提供的完整职级档数表（2026-11-13）。
 */
export interface RankOption {
  /** 稳定标识（A0–A8） */
  code: string
  /** 大段位名 */
  label: string
  /** 该大段的小段位档数（该档满级 = 这个数） */
  maxSub: number
}

export const RANKS: RankOption[] = [
  { code: 'A0', label: '黑铁', maxSub: 3 },
  { code: 'A1', label: '青铜', maxSub: 3 },
  { code: 'A2', label: '翠钢', maxSub: 3 },
  { code: 'A3', label: '钴银', maxSub: 5 },
  { code: 'A4', label: '冰钛', maxSub: 7 },
  { code: 'A5', label: '紫金', maxSub: 9 },
  { code: 'A6', label: '投资大师', maxSub: 9 },
  { code: 'A7', label: '资本帝王', maxSub: 9 },
  { code: 'A8', label: '财富造物主', maxSub: 20 }
]

/**
 * 小段位上限。
 *
 * **只限制 A8（财富造物主）最多 20 档**——这是官方真正的满级点，
 * 到了就该提示「已到达最高段位」。
 * 各档档数以 RANKS[].maxSub 为准。
 */
export const MAX_SUB_A8 = 20

/** 取某档的小段位上限；未知 code 返回 Infinity（不认识就不限制）。 */
export function maxSubLevel(code: string): number {
  const rank = rankByCode(code)
  return rank ? rank.maxSub : Number.POSITIVE_INFINITY
}

/**
 * 小段位是否超出该档上限（用于数据体检/输入校验）。
 *
 * 超限的历史数据（例如另一个赛季留下的「财富造物主50」）不应被当成
 * 「合法满级」—— 所以这里单独判定，而不是在解析时悄悄夹断。
 */
export function isSubOverflow(value: RankValue | null): boolean {
  if (!value) return false
  const cap = maxSubLevel(value.code)
  return Number.isFinite(cap) && value.sub > cap
}

/**
 * 小段位是否已满（用于「到达最高段位」判定）。
 *
 * 用「正好等于上限」而不是「>= 上限」：历史/异常数据里的 50 档
 * 会被解析成超限值，若用 >= 会把脏数据误判成满级并弹出满级贺卡。
 */
export function isMaxRank(value: RankValue | null): boolean {
  if (!value) return false
  const rank = rankByCode(value.code)
  if (!rank) return false
  return rank.code === 'A8' && value.sub === rank.maxSub
}

export interface RankValue {
  /** 大段位 code，如 A5 */
  code: string
  /** 小段位，如 1；未填时为 0 */
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
 * 把职级压成可排序的数值：大段序号 × 1000 + 小段位。
 * 例：A0黑铁1 → 1；A5紫金3 → 5003；A6投资大师7 → 6007；A8财富造物主20 → 8020。
 * 无法解析返回 null（调用方视为缺数据，跳过该点）。
 *
 * 超限的小段位（历史数据里的「财富造物主50」）在**这里**夹到该档上限，
 * 保证排序不会越过阶梯（50 不会排到满级之上）；
 * 但解析本身保留原值，好让数据体检能发现它（见 isSubOverflow）。
 */
export function rankToScore(value: string): number | null {
  const parsed = parseRank(value)
  if (!parsed) return null
  const index = RANKS.findIndex((item) => item.code === parsed.code)
  if (index < 0) return null
  const cap = maxSubLevel(parsed.code)
  const sub = Number.isFinite(cap) ? Math.min(parsed.sub, cap) : parsed.sub
  // 小段位 0（未填）按 0 处理，仍能体现大段间的先后
  return index * SUB_LEVEL_BASE + Math.max(0, sub)
}

/**
 * 某一局涨了几个小段（跨大段也能算）。
 *
 * 同一大段内：直接相减。
 * 跨大段：先补满旧档（旧档上限 − 旧小段位），再加上新档的小段位。
 *   例：资本帝王9 → 财富造物主3 = (9−9)+3 = +3
 *       紫金1 → 投资大师1     = (9−1)+1 = +9
 *
 * 任一侧小段位缺失（0）时返回 null —— 缺数据就显示「—」，
 * 不要用猜出来的数字误导（0 档并不是「第 0 档」）。
 */
export function subLevelGain(from: RankValue | null, to: RankValue | null): number | null {
  if (!from || !to) return null
  if (from.sub <= 0 || to.sub <= 0) return null
  if (from.code === to.code) return Math.max(0, to.sub - from.sub)
  const fromIdx = RANKS.findIndex((item) => item.code === from.code)
  const toIdx = RANKS.findIndex((item) => item.code === to.code)
  if (fromIdx < 0 || toIdx < 0 || toIdx <= fromIdx) return null
  const fromCap = maxSubLevel(from.code)
  if (!Number.isFinite(fromCap)) return null
  return Math.max(0, fromCap - from.sub) + to.sub
}

/** 构造一个 RankValue（给只拿到 code/sub 的调用方用）。 */
export function rankValue(code: string, sub: number): RankValue | null {
  const rank = rankByCode(code)
  return rank ? { code: rank.code, sub } : null
}

/** 把 RankValue 拼成显示文本：「A5 紫金1」/「A8 财富造物主3」。 */
export function formatRank(value: RankValue | null): string {
  if (!value) return ''
  const rank = rankByCode(value.code)
  if (!rank) return ''
  return value.sub > 0 ? `${rank.code} ${rank.label}${value.sub}` : `${rank.code} ${rank.label}`
}

/**
 * 用于界面展示的段位文本：**不带 A 前缀**，只有「段位名 + 小段位」。
 *
 * 为什么不带前缀：数据库里历史数据的写法不统一，
 * 有的录成「A7 资本帝王2」，有的是「资本帝王5」，
 * 同一列表里混着显示会忽有忽无，看着像数据错了。
 * 统一去掉前缀后视觉一致，且正好贴合游戏内「资本帝王2」的写法。
 *
 * 例：'A7 资本帝王2' → '资本帝王2'；'A8 财富造物主20' → '财富造物主20'；
 *     'A5 紫金' → '紫金'
 */
export function displayRank(value: string | null | undefined): string {
  const raw = String(value ?? '').trim()
  if (!raw) return ''
  const parsed = parseRank(raw)
  if (!parsed) return raw
  const rank = rankByCode(parsed.code)
  if (!rank) return raw
  return parsed.sub > 0 ? `${rank.label}${parsed.sub}` : rank.label
}

/**
 * 解析历史/手填文本为结构化的 RankValue。
 * 兼容格式：
 * - "A5 紫金1" / "A5紫金1" / "紫金1" / "A5"        → { code:'A5', sub:1|0 }
 * - "财富造物主50"（旧赛季数据，超出 A8 的 20 档）  → { code:'A8', sub:50 }
 * - 无法识别                                        → null
 *
 * 注意：这里**不夹断超限的小段位**，保留原值，让 isSubOverflow 能发现它；
 * 需要保证排序合法时用 rankToScore（它内部会夹到上限）。
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

  // 2) 找小段位：取名称/code 后面的数字
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
  return { code: rank.code, sub }
}
