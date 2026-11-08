import type { ImageRegion, OcrAnalysis, OcrPageKind, RecordFields, VisionRegions } from './types'

export interface OcrWord {
  text: string
  x: number
  y: number
  width: number
  height: number
}

export interface OcrLine {
  text: string
  words: OcrWord[]
}

export interface OcrDocument {
  text: string
  width: number
  height: number
  language?: string
  lines: OcrLine[]
  warnings?: string[]
  /** 同一张图的局部二次识别；坐标已映射回整图，不参与页面或胜负判断。 */
  regions?: Array<{ kind: 'header' | 'rating' | 'bonds'; variant?: string; lines: OcrLine[] }>
}

interface ParsedLine {
  text: string
  x: number | null
  y: number | null
  width: number
  height: number
}

const TRADITIONAL: Record<string, string> = {
  對: '对', 勝: '胜', 負: '负', 敗: '败', 標: '标', 準: '准', 財: '财',
  晉: '晋', 職: '职', 級: '级', 隊: '队', 陣: '阵', 羈: '羁', 絆: '绊',
  資: '资', 訊: '讯', 環: '环', 境: '境', 策: '策', 略: '略', 頻: '频',
  戰: '战', 績: '绩', 錄: '录', 頁: '页', 擴: '扩', 裝: '装', 置: '置'
}

function compact(text: string): string {
  return text.normalize('NFKC').replace(/[對勝負敗標準財晉職級隊陣羈絆資訊環境策略頻戰績錄頁擴裝置]/g,
    (char) => TRADITIONAL[char] ?? char).replace(/\s+/g, '')
}

function parseLine(line: OcrLine): ParsedLine {
  const words = Array.isArray(line.words)
    ? line.words.filter((word) => word && [word.x, word.y, word.width, word.height].every(Number.isFinite)
      && word.width > 0 && word.height > 0)
    : []
  if (words.length === 0) return { text: compact(line.text), x: null, y: null, width: 0, height: 0 }
  const x = Math.min(...words.map((word) => word.x))
  const y = Math.min(...words.map((word) => word.y))
  return {
    text: compact(line.text || words.map((word) => word.text).join(' ')), x, y,
    width: Math.max(...words.map((word) => word.x + word.width)) - x,
    height: Math.max(...words.map((word) => word.y + word.height)) - y
  }
}

function sameRow(a: ParsedLine, b: ParsedLine): boolean {
  if (a.y == null || b.y == null) return a === b
  return Math.abs(a.y + a.height / 2 - b.y - b.height / 2) <= Math.max(a.height, b.height) * 0.7
}

function rowFrom(anchor: ParsedLine, lines: ParsedLine[]): string {
  return lines.filter((line) => sameRow(anchor, line)
    && (line.x == null || anchor.x == null || line.x >= anchor.x - 2))
    .sort((a, b) => (a.x ?? 0) - (b.x ?? 0)).map((line) => line.text).join('')
}

function spatialSettlement(lines: ParsedLine[], width: number, height: number): boolean {
  if (width <= 0 || height <= 0) return false
  type Positioned = ParsedLine & { x: number; y: number }
  const positioned = lines.filter((line): line is Positioned => line.x != null && line.y != null
    && line.x >= 0 && line.y >= 0 && line.x + line.width <= width * 1.01 && line.y + line.height <= height * 1.01)
  const lineups = positioned.filter((line) => /我的阵容|MyLineup/i.test(line.text))
  const modes = positioned.filter((line) => /标准博弈|超频博弈|StandardGambit|Overclock(?:ed)?Gambit/i.test(line.text))
  const outcomes = positioned.filter((line) => /对局胜利|对局失败|对局失利|^(?:Victory|Defeat)$/i.test(line.text))
  const health = positioned.filter((line) => /小队生命值|SquadHP/i.test(line.text))
  if (lineups.length !== 1 || modes.length !== 1 || outcomes.length !== 1 || health.length !== 1 || readHp(lines) == null) return false
  const lineup = lineups[0], mode = modes[0], outcome = outcomes[0], hp = health[0]
  // 页脚漏读时，必须同时证实左侧结果区、右侧阵容区与其上方生命栏。
  if (mode.x + mode.width >= lineup.x || outcome.x + outcome.width / 2 >= lineup.x
    || outcome.y + outcome.height >= mode.y || outcome.y >= lineup.y + lineup.height
    || mode.y <= lineup.y || hp.x <= lineup.x || hp.y + hp.height >= lineup.y
    || Math.abs(outcome.x + outcome.width / 2 - mode.x - mode.width / 2) > width * 0.18) return false
  return positioned.some((line) => {
    if (line.x < lineup.x - width * 0.025) return false
    if (/羁绊(?:信息|资讯)|Bond[Il]nformation/i.test(line.text)) {
      return line.y > hp.y + hp.height && line.y + line.height < lineup.y
    }
    // 已见 OCR 会把繁体「資」识别为「負」；只在完整空间布局成立后容错这一处标签。
    if (/投资环境|投资策略|^投负策略$|[Il]nvestmentEnvironment|[Il]nvestmentStrategy/i.test(line.text)) {
      return line.y > lineup.y + lineup.height && line.y + line.height < height * 0.95
    }
    return false
  })
}

function detectPage(lines: ParsedLine[], width: number, height: number): OcrPageKind {
  const text = lines.map((line) => line.text).join('\n')
  // 战绩总览本身不能代表用户刚结束的这一局。
  if (/最新通关战绩|最新战绩|战绩总览|BattleRecords|RecentClearRecords/i.test(text)) return 'history'
  // 明确的历史标记优先于下一页或空间布局，避免历史详情被当成当前结算。
  if (/战绩详情|对局记录|MatchHistory|RecordDetails/i.test(text)
    || (/20\d{2}[.·•/年-]\d{1,2}[.·•/月-]\d{1,2}/.test(text) && /收藏|Favorite/i.test(text))) return 'history'
  const hasLineup = /我的阵容|MyLineup/i.test(text)
  // Windows OCR 会把英文大写 I 读成小写 l；只在已知界面标签中容错。
  const hasContext = /投资环境|投资策略|羁绊(?:信息|资讯)|[Il]nvestmentEnvironment|[Il]nvestmentStrategy|Bond[Il]nformation/i.test(text)
  const hasModeAndOutcome = /标准博弈|超频博弈|StandardGambit|Overclock(?:ed)?Gambit/i.test(text)
    && /对局胜利|对局失败|对局失利|Victory|Defeat/i.test(text)
  const hasSettlementNavigation = lines.some((line) =>
    /下一页|返回货币战争|NextPage|ReturntoCurrencyWars/i.test(line.text)
    && (line.y == null || height <= 0 || line.y > height * 0.6))
  if (hasLineup && (hasContext || hasModeAndOutcome) && hasSettlementNavigation) return 'settlement'
  if (spatialSettlement(lines, width, height)) return 'settlement'
  return 'unknown'
}

interface Rank { tier: string; level: number; label: string }

function readRanks(text: string): Rank[] {
  const ranks: Rank[] = []
  // 仅保留已核对过的游戏职级名称，不能套用其他游戏的通用段位。
  const chinese = /((?:财富)?造物主|资本帝王|投资大师|紫金)(\d{1,3})(?!\d)/g
  for (const match of text.matchAll(chinese)) {
    const tier = /造物主/.test(match[1]) ? '财富造物主' : match[1]
    ranks.push({ tier, level: Number(match[2]), label: `${tier}${Number(match[2])}` })
  }
  const english = /(WealthCreator|AmethystGold)(\d{1,3})(?!\d)/gi
  for (const match of text.matchAll(english)) {
    const tier = match[1].toLowerCase() === 'wealthcreator' ? '财富造物主' : '紫金'
    ranks.push({ tier, level: Number(match[2]), label: `${tier}${Number(match[2])}` })
  }
  return ranks
}

function uniqueRank(text: string): Rank | null {
  const ranks = readRanks(text)
  const unique = new Map(ranks.map((rank) => [rank.label, rank]))
  return unique.size === 1 ? [...unique.values()][0] : null
}

function readHp(lines: ParsedLine[]): number | null {
  const anchors = lines.filter((line) => /小队生命值|SquadHP/i.test(line.text))
  if (anchors.length !== 1) return null
  const match = rowFrom(anchors[0], lines).match(/(?:小队生命值|SquadHP)[^\d]{0,5}(\d{1,3})(?!\d)/i)
  return match ? Number(match[1]) : null
}

function visionRegions(document: OcrDocument, lines: ParsedLine[]): VisionRegions | undefined {
  if (document.width <= 0 || document.height <= 0) return undefined
  const lineup = lines.find((line) => /我的阵容|MyLineup/i.test(line.text))
  const bonds = lines.find((line) => /羁绊(?:信息|资讯)|Bond[Il]nformation/i.test(line.text))
  const investment = lines.find((line) => /投资环境|[Il]nvestmentEnvironment/i.test(line.text))
  const hp = lines.find((line) => /小队生命值|SquadHP/i.test(line.text))
  const right = hp?.x != null ? Math.min(document.width, hp.x + hp.width + hp.height * 0.7) : document.width * 0.92
  const region = (x: number, y: number, r: number, b: number): ImageRegion | undefined => {
    const left = Math.max(0, x), top = Math.max(0, y)
    const endX = Math.min(document.width, r), endY = Math.min(document.height, b)
    if (endX <= left || endY <= top) return undefined
    return { x: left / document.width, y: top / document.height, width: (endX - left) / document.width, height: (endY - top) / document.height }
  }
  const vision: VisionRegions = {}
  if (lineup?.x != null && lineup.y != null && investment?.y != null) {
    vision.lineup = region(lineup.x - document.width * 0.005, lineup.y + lineup.height + document.height * 0.008,
      right, investment.y - document.height * 0.008)
  }
  if (bonds?.x != null && bonds.y != null && lineup?.y != null) {
    vision.bonds = region(bonds.x - document.width * 0.005, bonds.y + bonds.height + document.height * 0.006,
      right, lineup.y - document.height * 0.008)
  }
  const countWords = [...document.lines, ...(document.regions ?? []).flatMap((entry) => entry.lines)]
    .flatMap((line) => Array.isArray(line.words) ? line.words : [])
    .filter((word) => word && /^\d{1,2}$/.test(compact(word.text))
      && [word.x, word.y, word.width, word.height].every(Number.isFinite) && word.width > 0 && word.height > 0)
  const counts = new Map<string, ImageRegion & { text: string }>()
  for (const word of countWords) {
    const bounds = region(word.x, word.y, word.x + word.width, word.y + word.height)
    if (!bounds) continue
    const text = compact(word.text)
    const key = `${text}:${Math.round((word.x + word.width / 2) / (document.width * 0.004))}:${Math.round((word.y + word.height / 2) / (document.height * 0.004))}`
    counts.set(key, { ...bounds, text })
  }
  if (counts.size > 0) vision.counts = [...counts.values()]
  return Object.values(vision).some(Boolean) ? vision : undefined
}

/**
 * 只从可解释的文字和同行区域生成候选，不用评级、生命值或图标数字猜胜负。
 * Windows OCR 没有提供可校准的置信度，因此不制造“百分之多少正确”的数值。
 */
export function parseOcrResult(document: OcrDocument): OcrAnalysis {
  const rawText = document.text || document.lines.map((line) => line.text).join('\n')
  const inputLines = document.lines.length > 0 ? document.lines
    : rawText.split(/[\r\n]+/).map((text) => ({ text, words: [] }))
  const lines = inputLines.map(parseLine).filter((line) => line.text.length > 0)
  const pageKind = detectPage(lines, document.width, document.height)
  const fields: Partial<RecordFields> = {}
  const warnings = [...(document.warnings ?? [])]

  if (pageKind === 'unknown') {
    warnings.push('未识别为货币战争结算或战绩页，胜负和职级请手动填写。')
    return { text: rawText, pageKind, fields, warnings }
  }
  if (lines.some((line) => line.text.includes('零和博弈'))) fields.season = '零和博弈'

  const modeLines = lines.filter((line) => /标准博弈|超频博弈|StandardGambit|Overclock(?:ed)?Gambit/i.test(line.text))
  const modes = new Set(modeLines.map((line) => /超频博弈|Overclock(?:ed)?Gambit/i.test(line.text) ? 'overclock' : 'standard'))
  if (modes.size === 1) fields.mode = [...modes][0] as 'standard' | 'overclock'
  else if (modes.size > 1) warnings.push('画面出现多种模式，未自动选择模式。')

  let before: Rank | null = null
  if (modeLines.length === 1) {
    before = uniqueRank(rowFrom(modeLines[0], lines))
    if (before) fields.rankBefore = before.label
  }

  const regions = (document.regions ?? []).map((entry) => ({ ...entry, parsed: entry.lines.map(parseLine) }))
  const hpValues = [readHp(lines), ...regions.filter((entry) => entry.kind === 'header').map((entry) => readHp(entry.parsed))]
    .filter((value): value is number => value != null)
  const uniqueHp = new Set(hpValues)
  if (uniqueHp.size === 1) fields.squadHp = hpValues[0]
  else if (uniqueHp.size > 1) warnings.push('生命值的多次识别结果不一致，已留空，请按原图核对。')

  const lineupHeading = lines.find((line) => /我的阵容|MyLineup/i.test(line.text))
  const outcomeLines = lines.filter((line) => {
    if (!/对局胜利|对局失败|对局失利|^(?:Victory|Defeat)$/i.test(line.text)) return false
    if (line.y == null || line.x == null || lineupHeading?.y == null || lineupHeading.x == null) return true
    // 胜负标题应在阵容区左侧、其标题附近或上方；聊天/页脚等区域的同名文字不采信。
    return line.y < lineupHeading.y + lineupHeading.height * 2
      && line.x + line.width / 2 < lineupHeading.x
      && (modeLines.length !== 1 || modeLines[0].y == null || line.y < modeLines[0].y)
  })
  const outcomes = new Set(outcomeLines.map((line) => /对局胜利|^Victory$/i.test(line.text) ? 'win' : 'loss'))
  // 历史页即使有“对局胜利”也只作为回看材料，不替当前记录自动决定胜负。
  if (pageKind === 'settlement' && outcomes.size === 1) fields.result = [...outcomes][0] as 'win' | 'loss'
  else if (pageKind === 'history') warnings.push('这是历史战绩画面，请核对对应场次并手动选择胜负；不推断职级变化。')
  else warnings.push(outcomes.size > 1 ? '画面出现互相冲突的胜负文字，请手动选择。' : '未读到明确胜负；SSS、SS 等评级不作为胜负依据。')

  // 只有明确的职级变更标签，才将右上方职级解释为“赛后职级”。
  if (pageKind === 'settlement') {
    const candidates: Array<{ rank: Rank; label: string }> = []
    const readChange = (source: ParsedLine[], header: boolean): void => {
      const changeLines = source.filter((line) => !/晋升等级|AscensionLevel/i.test(line.text)
        && (header ? /晋升|提升|下降|降低|职级不变|职级保持|新职级|Rank(?:Up|Down)|Promotedto/i
          : /职级(?:晋升|提升|下降|降低|不变|保持)|新职级|Rank(?:Up|Down)|Promotedto/i).test(line.text))
      if (changeLines.length !== 1) return
      const rank = uniqueRank(rowFrom(changeLines[0], source).split(/小队生命值|SquadHP/i)[0])
      if (rank) candidates.push({ rank, label: changeLines[0].text })
    }
    readChange(lines, false)
    for (const region of regions.filter((entry) => entry.kind === 'header')) readChange(region.parsed, true)
    if (new Set(candidates.map((entry) => entry.rank.label)).size === 1) {
      const after = candidates[0].rank
      if (after) {
        fields.rankAfter = after.label
        if (before && before.tier === after.tier) {
          const delta = after.level - before.level
          const label = candidates.map((entry) => entry.label).join(' ')
          const conflicts = (delta < 0 && /晋升|提升|RankUp|Promotedto/i.test(label))
            || (delta > 0 && /下降|降低|RankDown/i.test(label))
            || (delta !== 0 && /不变|保持/.test(label))
          if (conflicts) warnings.push('职级数字与晋升或下降提示不一致，未自动计算变化，请按原图核对。')
          else fields.rankChange = delta
        }
        else if (before) warnings.push('前后职级跨越不同阶位，无法直接换算段位变化，请人工核对。')
      }
    } else if (candidates.length > 1) warnings.push('赛后职级的多次识别结果不一致，未自动计算变化。')
  }

  // 大评级需要位于胜负标题下方、模式上方；孤立字母或头像旁数字不参与推断。
  if (outcomeLines.length === 1 && modeLines.length === 1) {
    const outcome = outcomeLines[0]
    const mode = modeLines[0]
    if (outcome.y != null && mode.y != null && mode.y > outcome.y) {
      const ratingLines = lines.filter((line) => /^(?:SSS|SS|S|A|B|C|D)$/.test(line.text)
        && line.y != null && line.y > outcome.y! + outcome.height && line.y < mode.y!
        && line.x != null && outcome.x != null
        && Math.abs(line.x + line.width / 2 - outcome.x - outcome.width / 2) < Math.max(document.width * 0.12, outcome.width))
      if (ratingLines.length === 1) fields.rating = ratingLines[0].text
    }
  }

  const ratingTitles = lines.filter((line) => /对局胜利|对局失败|对局失利|触发晋升赛|TriggerAscensionMatch|^(?:Victory|Defeat)$/i.test(line.text))
  const ratings = new Set<string>(fields.rating ? [fields.rating] : [])
  for (const region of regions.filter((entry) => entry.kind === 'rating')) {
    for (const line of region.parsed) {
      if (!/^(?:SSS|SS|S|A|B|C|D)$/i.test(line.text) || line.x == null || line.y == null || lineupHeading?.x == null) continue
      if (line.x + line.width / 2 >= lineupHeading.x || line.y > document.height * 0.75) continue
      const ratingY = line.y
      if (!ratingTitles.some((title) => title.y != null && ratingY > title.y + title.height)) continue
      ratings.add(line.text.toUpperCase())
    }
  }
  if (ratings.size === 1) fields.rating = [...ratings][0]
  else if (ratings.size > 1) {
    delete fields.rating
    warnings.push('评分的多次识别结果不一致，已留空，请按原图核对。')
  }

  warnings.push('角色头像和羁绊图标尚未识别，请按原图手动补充阵容。')
  const extraText = regions.filter((entry) => entry.parsed.length > 0)
    .map((entry) => `[局部识别·${entry.kind === 'rating' ? '评分' : entry.kind === 'header' ? '职级与生命' : '羁绊数字'}]\n${entry.lines.map((line) => line.text).join('\n')}`)
  return { text: [rawText, ...extraText].join('\n'), pageKind, fields, warnings, vision: visionRegions(document, lines) }
}
