import test from 'node:test'
import assert from 'node:assert/strict'
import { parseOcrResult } from '../src/shared/ocrParser.ts'

function line(text, x, y, width = 200, height = 24) {
  return { text, words: [{ text, x, y, width, height }] }
}

function settlement(extra = [], overrides = {}) {
  const lines = [
    line('对 局 胜 利', 260, 160),
    line('我的阵容', 760, 380),
    line('投资环境', 760, 750),
    line('标准博弈', 220, 550),
    line('A8 财 富 造 物 主 19', 450, 552),
    line('下一页', 800, 900),
    ...extra
  ]
  return { width: 1920, height: 1080, text: lines.map((entry) => entry.text).join('\n'), lines, ...overrides }
}

test('明确结算页识别简繁空格文字，A8和头像数字不混入职级', () => {
  const input = settlement([line('小 隊 生 命 值 等 １００', 1450, 110), line('10 5 2 2 1', 800, 240)])
  input.lines[0].text = '對 局 勝 利'
  input.lines[3].text = '@ 標 準 博 弈'
  const result = parseOcrResult(input)
  assert.equal(result.pageKind, 'settlement')
  assert.equal(result.fields.result, 'win')
  assert.equal(result.fields.mode, 'standard')
  assert.equal(result.fields.rankBefore, '财富造物主19')
  assert.equal(result.fields.squadHp, 100)
  assert.equal(result.fields.rankAfter, undefined)
  assert.equal(result.fields.rankChange, undefined)
  assert.equal(result.fields.lineup, undefined)
})

test('只有明确同阶职级变化才计算增量，晋升等级不是段位', () => {
  const result = parseOcrResult(settlement([
    line('職級晉升', 760, 110), line('造物主 20', 1040, 110),
    line('小队生命值 21', 1450, 110), line('晋升等级80', 220, 780)
  ]))
  assert.equal(result.fields.rankAfter, '财富造物主20')
  assert.equal(result.fields.rankChange, 1)
})

test('漏掉职级晋升标签时保留空值，不根据右上数字猜升段', () => {
  const result = parseOcrResult(settlement([line('造 物 主 20', 1040, 110), line('晋升等级80', 220, 780)]))
  assert.equal(result.fields.rankBefore, '财富造物主19')
  assert.equal(result.fields.rankAfter, undefined)
  assert.equal(result.fields.rankChange, undefined)
})

test('跨阶有前后候选也不把等级差当作段位变化', () => {
  const input = settlement([line('职级晋升 财富造物主1', 760, 110)])
  input.lines[4].text = 'A8 紫金 7'
  const result = parseOcrResult(input)
  assert.equal(result.fields.rankBefore, '紫金7')
  assert.equal(result.fields.rankAfter, '财富造物主1')
  assert.equal(result.fields.rankChange, undefined)
  assert(result.warnings.some((warning) => warning.includes('跨越不同阶位')))
})

test('晋升标签与数字方向矛盾时不自动计算变化', () => {
  const result = parseOcrResult(settlement([line('职级晋升 财富造物主18', 760, 110)]))
  assert.equal(result.fields.rankAfter, '财富造物主18')
  assert.equal(result.fields.rankChange, undefined)
  assert(result.warnings.some((warning) => warning.includes('不一致')))
})

test('SSS、满血和触发晋升赛都不等于胜利', () => {
  const input = settlement([line('SSS', 280, 300), line('Squad HP 100', 1450, 110)])
  input.lines[0].text = 'Trigger Ascension Match'
  const result = parseOcrResult(input)
  assert.equal(result.pageKind, 'settlement')
  assert.equal(result.fields.result, undefined)
  assert.equal(result.fields.squadHp, 100)
})

test('B评级仍能明确胜利；零生命也不自动推断失败', () => {
  const winning = parseOcrResult(settlement([line('B', 280, 300, 140, 100)]))
  assert.equal(winning.fields.result, 'win')
  assert.equal(winning.fields.rating, 'B')
  const uncertain = settlement([line('小队生命值 0', 1450, 110), line('B', 280, 300)])
  uncertain.lines[0].text = '对 局'
  assert.equal(parseOcrResult(uncertain).fields.result, undefined)
})

test('有明确失败文字才提供失败候选，互相冲突时留空', () => {
  const input = settlement()
  input.lines[0].text = '对局失败'
  assert.equal(parseOcrResult(input).fields.result, 'loss')
  input.lines.push(line('对局胜利', 260, 210))
  assert.equal(parseOcrResult(input).fields.result, undefined)
})

test('历史详情里的胜利和晋升文字不代表当前场次', () => {
  const input = settlement([line('2026 · 5 · 9', 30, 30), line('收藏', 1650, 800), line('职级晋升 财富造物主20', 760, 110)])
  input.lines = input.lines.filter((entry) => entry.text !== '下一页')
  const result = parseOcrResult(input)
  assert.equal(result.pageKind, 'history')
  assert.equal(result.fields.mode, 'standard')
  assert.equal(result.fields.result, undefined)
  assert.equal(result.fields.rankChange, undefined)
})

test('历史总览不是刚结束的一局，即使有胜利或返回按钮也不采信', () => {
  const result = parseOcrResult(settlement([line('最新通关战绩', 600, 200)]))
  assert.equal(result.pageKind, 'history')
  assert.equal(result.fields.result, undefined)
})

test('未知页面、聊天中的胜利字样不生成任何结果字段', () => {
  for (const text of ['对局胜利 标准博弈 财富造物主30', 'SSS', '备战阶段 小队生命值100 对局胜利']) {
    const result = parseOcrResult({ text, width: 1920, height: 1080, lines: [line(text, 100, 100)] })
    assert.equal(result.pageKind, 'unknown')
    assert.deepEqual(result.fields, {})
  }
})

test('识别英文结算布局，但不根据评级补出遗漏的胜负', () => {
  const lines = [line('Victory', 260, 160), line('My Lineup', 760, 380), line('Investment Strategy', 760, 750),
    line('Standard Gambit', 220, 550), line('A5 Amethyst Gold 7', 450, 552), line('Return to Currency Wars', 800, 900)]
  const result = parseOcrResult({ width: 1920, height: 1080, text: lines.map((entry) => entry.text).join('\n'), lines })
  assert.equal(result.pageKind, 'settlement')
  assert.equal(result.fields.result, 'win')
  assert.equal(result.fields.rankBefore, '紫金7')
})

test('英文I/l漏读仍可识别页面，模式缺失不靠相邻职级硬补', () => {
  const lines = [line('@Trigger Ascension Match', 260, 160), line('My Lineup', 760, 380),
    line('lnvestment Strateg y', 760, 750), line('Bond lnformation', 760, 240),
    line('Return tO Currency Wars', 800, 900), line('Squad HP 100', 1450, 110)]
  const result = parseOcrResult({ width: 1920, height: 1080, text: lines.map((entry) => entry.text).join('\n'), lines })
  assert.equal(result.pageKind, 'settlement')
  assert.equal(result.fields.result, undefined)
  assert.equal(result.fields.mode, undefined)
  assert.equal(result.fields.squadHp, 100)
})

test('部分区域文字漏读时，阵容、模式、明确胜负与下一页仍能确认结算布局', () => {
  const input = settlement().lines.filter((entry) => entry.text !== '投资环境')
  const result = parseOcrResult({ width: 1920, height: 1080, text: input.map((entry) => entry.text).join('\n'), lines: input })
  assert.equal(result.pageKind, 'settlement')
  assert.equal(result.fields.result, 'win')
})

test('结算页面右侧或页脚的胜利文字不覆盖真正的晋升赛状态', () => {
  const input = settlement([line('对局胜利', 1500, 200), line('对局胜利', 260, 1000)])
  input.lines[0].text = '触发晋升赛'
  const result = parseOcrResult(input)
  assert.equal(result.pageKind, 'settlement')
  assert.equal(result.fields.result, undefined)
})

test('空识别结果保留可读提示，不能产生胜率或阵容数据', () => {
  const result = parseOcrResult({ text: '', width: 1280, height: 720, lines: [] })
  assert.equal(result.pageKind, 'unknown')
  assert.deepEqual(result.fields, {})
  assert(result.warnings.length > 0)
})

test('区域二次识别补全明确晋升、生命和艺术评级，不改变胜负来源', () => {
  const input = settlement()
  input.regions = [
    { kind: 'header', variant: 'upscaled', lines: [line('目 晉 升 0 財 富 造 物 主 20', 760, 110), line('小 隊 生 命 值 21', 1450, 110)] },
    { kind: 'header', variant: 'binary', lines: [line('晉 升 - 財 富 造 物 主 20', 760, 110), line('小 隊 生 命 值 21', 1450, 110)] },
    { kind: 'rating', variant: 'single-glyph', lines: [line('B', 320, 300, 80, 100)] }
  ]
  const result = parseOcrResult(input)
  assert.equal(result.fields.result, 'win')
  assert.equal(result.fields.rankAfter, '财富造物主20')
  assert.equal(result.fields.rankChange, 1)
  assert.equal(result.fields.squadHp, 21)
  assert.equal(result.fields.rating, 'B')
})

test('字形的8、美元符号、排版上下文和近似文本不能补成评级', () => {
  for (const text of ['8', 'Grade', 'GradeB', 'S$', '$SS', '8 Grade', 'B8', '']) {
    const input = settlement()
    input.regions = [{ kind: 'rating', lines: [line(text, 320, 300, 80, 100)] }]
    assert.equal(parseOcrResult(input).fields.rating, undefined, text)
  }
})

test('评分大小写可规范，评级冲突时拒绝选择看起来更高的分数', () => {
  const input = settlement()
  input.regions = [{ kind: 'rating', lines: [line('sss', 320, 300, 240, 100)] }]
  assert.equal(parseOcrResult(input).fields.rating, 'SSS')
  input.regions.push({ kind: 'rating', lines: [line('ss', 320, 300, 180, 100)] })
  const result = parseOcrResult(input)
  assert.equal(result.fields.rating, undefined)
  assert(result.warnings.some((warning) => warning.includes('评分的多次识别结果不一致')))
})

test('生命值和职级的局部识别互相冲突时留空', () => {
  const input = settlement()
  input.regions = [
    { kind: 'header', lines: [line('晋升 财富造物主20', 760, 110), line('小队生命值21', 1450, 110)] },
    { kind: 'header', lines: [line('晋升 财富造物主21', 760, 110), line('小队生命值71', 1450, 110)] }
  ]
  const result = parseOcrResult(input)
  assert.equal(result.fields.rankAfter, undefined)
  assert.equal(result.fields.rankChange, undefined)
  assert.equal(result.fields.squadHp, undefined)
})

test('局部晋升等级与其他数字不能充当职级变更', () => {
  const input = settlement()
  input.regions = [{ kind: 'header', lines: [line('晋升等级80 财富造物主20', 760, 110)] }]
  const result = parseOcrResult(input)
  assert.equal(result.fields.rankAfter, undefined)
  assert.equal(result.fields.rankChange, undefined)
})

test('区域增强不能把历史或未知页面升级为当前结算胜利', () => {
  const regions = [{ kind: 'header', lines: [line('职级晋升 财富造物主20 对局胜利', 760, 110)] },
    { kind: 'rating', lines: [line('SSS', 320, 300, 240, 100)] }]
  const history = settlement([line('最新通关战绩', 760, 70)])
  history.regions = regions
  const historyResult = parseOcrResult(history)
  assert.equal(historyResult.fields.result, undefined)
  assert.equal(historyResult.fields.rankChange, undefined)
  const unknown = { text: '备战阶段', width: 1920, height: 1080, lines: [line('备战阶段', 200, 300)], regions }
  const result = parseOcrResult(unknown)
  assert.equal(result.pageKind, 'unknown')
  assert.deepEqual(result.fields, {})
})

test('真实资本帝王阶位可以同阶计算，不接受无证据通用段位', () => {
  const input = settlement([line('职级晋升 资本帝王8', 760, 110)])
  input.lines[4].text = 'A7 資 本 帝 王 7'
  const result = parseOcrResult(input)
  assert.equal(result.fields.rankBefore, '资本帝王7')
  assert.equal(result.fields.rankAfter, '资本帝王8')
  assert.equal(result.fields.rankChange, 1)
  input.lines[4].text = '铂金7'
  assert.equal(parseOcrResult(input).fields.rankBefore, undefined)
})

test('有锚点才提供归一化视觉区域，数字只是带位置证据', () => {
  const input = settlement([line('羁绊信息', 760, 230), line('10', 820, 300, 20, 20)])
  const result = parseOcrResult(input)
  assert(result.vision.lineup && result.vision.bonds)
  for (const region of [result.vision.lineup, result.vision.bonds]) {
    assert(region.x >= 0 && region.y >= 0 && region.width > 0 && region.height > 0)
    assert(region.x + region.width <= 1 && region.y + region.height <= 1)
  }
  // 羁绊数量识别已移除，不再收集数字词区域
  assert.equal(result.vision.counts, undefined)
  assert.equal(result.fields.lineup, undefined)
  const withoutBottom = { ...input, lines: input.lines.filter((entry) => entry.text !== '投资环境') }
  assert.equal(parseOcrResult(withoutBottom).vision.lineup, undefined)
})

test('只采用图中完整赛季标题，不按日期或当前版本补赛季', () => {
  const overview = settlement([line('最新通关战绩', 760, 100), line('零 和 博 弈', 760, 70)])
  assert.equal(parseOcrResult(overview).fields.season, '零和博弈')
  assert.equal(parseOcrResult(settlement([line('2026年10月28日', 30, 30)])).fields.season, undefined)
  assert.equal(parseOcrResult(settlement([line('零 和 博', 760, 70)])).fields.season, undefined)
})

function footerlessSettlement() {
  const input = settlement([line('小队生命值 21', 1450, 110)])
  input.lines = input.lines.filter((entry) => entry.text !== '下一页')
  input.text = input.lines.map((entry) => entry.text).join('\n')
  return input
}

test('页脚漏读但左右栏和生命字段空间一致时可确认结算布局', () => {
  const result = parseOcrResult(footerlessSettlement())
  assert.equal(result.pageKind, 'settlement')
  assert.equal(result.fields.result, 'win')
  assert.equal(result.fields.squadHp, 21)
})

test('严格空间布局内允许投资策略的已见单字漏读', () => {
  const input = footerlessSettlement()
  input.lines.find((entry) => entry.text === '投资环境').text = '投 負 策 略'
  assert.equal(parseOcrResult(input).pageKind, 'settlement')
})

test('没有页脚时，分散聊天文字或错位的标签不能拼成结算页', () => {
  const cases = [
    (input) => { input.lines.find((entry) => entry.text === '对 局 胜 利').words[0].y = 1000 },
    (input) => { input.lines.find((entry) => entry.text === '我的阵容').words[0].x = 100 },
    (input) => { input.lines.find((entry) => entry.text === '投资环境').words[0].x = 50 },
    (input) => { input.lines.find((entry) => entry.text === '小队生命值 21').words[0].y = 850 },
    (input) => { input.lines.find((entry) => entry.text === '小队生命值 21').text = '小队生命值' },
    (input) => { input.lines = input.lines.filter((entry) => entry.text !== '投资环境') },
    (input) => { input.lines.forEach((entry) => { entry.words = [] }) }
  ]
  for (const [index, mutate] of cases.entries()) {
    const input = footerlessSettlement()
    mutate(input)
    const result = parseOcrResult(input)
    assert.equal(result.pageKind, 'unknown', `case ${index}`)
    assert.equal(result.fields.result, undefined)
  }
})

test('明确历史日期与收藏优先，不能被完整结算布局或下一页覆盖', () => {
  for (const input of [settlement(), footerlessSettlement()]) {
    input.lines.push(line('2026 · 5 · 9', 30, 30), line('收藏', 1600, 800))
    const result = parseOcrResult(input)
    assert.equal(result.pageKind, 'history')
    assert.equal(result.fields.result, undefined)
    assert.equal(result.fields.rankChange, undefined)
  }
})

test('缩小后核心标题漏字且缺生命栏时仍为未知页面', () => {
  const input = footerlessSettlement()
  input.lines.find((entry) => entry.text === '对 局 胜 利').text = '对局利'
  input.lines.find((entry) => entry.text === '我的阵容').text = '我的0容'
  input.lines = input.lines.filter((entry) => entry.text !== '小队生命值 21')
  const result = parseOcrResult(input)
  assert.equal(result.pageKind, 'unknown')
  assert.deepEqual(result.fields, {})
})
