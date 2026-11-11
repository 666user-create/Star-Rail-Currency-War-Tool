// 段位打分测试：把「A6 投资大师7」这类文本压成可排序数值
import test from 'node:test'
import assert from 'node:assert/strict'

const RANKS = [
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
const SUB_LEVEL_BASE = 10

function rankByCode(code) {
  const t = (code ?? '').trim().toUpperCase()
  return RANKS.find((r) => r.code === t) ?? null
}

function parseRank(value) {
  const text = (value ?? '').trim()
  if (!text) return null
  let rank = null
  const m = /([Aa][0-8])\b/.exec(text)
  if (m) rank = rankByCode(m[1])
  if (!rank) {
    for (let i = RANKS.length - 1; i >= 0; i--) {
      if (text.includes(RANKS[i].label)) { rank = RANKS[i]; break }
    }
  }
  if (!rank) return null
  let sub = 0
  if (rank.hasSubLevel) {
    const a = new RegExp(`${rank.label}\\s*(\\d{1,2})`).exec(text)
    if (a) sub = Number(a[1])
    if (sub === 0) {
      const b = new RegExp(`${rank.code}\\s*(\\d{1,2})`, 'i').exec(text)
      if (b) sub = Number(b[1])
    }
  }
  return { code: rank.code, sub }
}

function rankToScore(value) {
  const parsed = parseRank(value)
  if (!parsed) return null
  const index = RANKS.findIndex((r) => r.code === parsed.code)
  if (index < 0) return null
  return index * SUB_LEVEL_BASE + Math.max(0, parsed.sub)
}

test('基础打分：大段序号×10 + 小段位', () => {
  assert.equal(rankToScore('A0 黑铁1'), 1)
  assert.equal(rankToScore('A5 紫金3'), 53)
  assert.equal(rankToScore('A6 投资大师7'), 67)
  assert.equal(rankToScore('A8 财富造物主'), 80)
})

test('回归：真实数据「投资大师7」和「A6 投资大师4」能正确比较', () => {
  const v1 = rankToScore('A6 投资大师4')
  const v2 = rankToScore('投资大师7')
  assert.equal(v1, 64)
  assert.equal(v2, 67)
  assert.ok(v2 > v1, '投资大师7 必须高于 投资大师4')
})

test('关键：任意大段永远压过上一大段的所有小段', () => {
  // 这是 SUB_LEVEL_BASE=10 的意义：紫金无论多少小段，都不能超过投资大师1
  for (const sub of [1, 3, 7, 9]) {
    const a5 = rankToScore(`A5 紫金${sub}`)
    const a6 = rankToScore('A6 投资大师1')
    assert.ok(a5 < a6, `A5紫金${sub}(${a5}) 必须 < A6投资大师1(${a6})`)
  }
})

test('A8 财富造物主是最高的（无小段位）', () => {
  const a8 = rankToScore('A8 财富造物主')
  assert.equal(a8, 80)
  for (const sub of [1, 5, 7, 9]) {
    assert.ok(rankToScore(`A7 资本帝王${sub}`) < a8, '资本帝王任何档都低于财富造物主')
  }
})

test('只填大段不填小段也能排序', () => {
  assert.equal(rankToScore('A5'), 50)
  assert.equal(rankToScore('紫金'), 50)
  assert.ok(rankToScore('A5') < rankToScore('A5 紫金1'))
  assert.ok(rankToScore('A5') < rankToScore('A6'))
})

test('无法解析返回 null（跳过该点，不瞎画）', () => {
  assert.equal(rankToScore(''), null)
  assert.equal(rankToScore('未知'), null)
  assert.equal(rankToScore(null), null)
  assert.equal(rankToScore('A9 不存在'), null)
})

test('完整序列单调递增', () => {
  const sequence = [
    'A0 黑铁1', 'A0 黑铁2', 'A0 黑铁3',
    'A1 青铜1', 'A2 翠钢1', 'A3 钴银1',
    'A4 冰钛1', 'A5 紫金1', 'A5 紫金2', 'A5 紫金3',
    'A6 投资大师1', 'A6 投资大师4', 'A6 投资大师7',
    'A7 资本帝王1', 'A7 资本帝王7',
    'A8 财富造物主'
  ]
  const scores = sequence.map(rankToScore)
  for (let i = 0; i < scores.length; i++) {
    assert.notEqual(scores[i], null, `${sequence[i]} 应能解析`)
    if (i > 0) assert.ok(scores[i] > scores[i - 1], `${sequence[i]}(${scores[i]}) 应大于 ${sequence[i-1]}(${scores[i-1]})`)
  }
})

test('真实历史数据能解析', () => {
  // 数据库里实际存在的值
  assert.notEqual(rankToScore('A6 投资大师1'), null)
  assert.notEqual(rankToScore('A6 投资大师4'), null)
  assert.notEqual(rankToScore('投资大师7'), null)
  assert.equal(rankToScore('财富造物主50'), 80, 'A8 无小段位，50 被忽略')
})
