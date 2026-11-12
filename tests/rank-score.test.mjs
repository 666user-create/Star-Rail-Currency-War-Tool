// 段位打分测试：把「A6 投资大师7」压成可排序数值
import test from 'node:test'
import assert from 'node:assert/strict'

const RANKS = [
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
const BASE = 1000
const MAX_SUB_A8 = 20

function rankByCode(code) {
  const t = (code ?? '').trim().toUpperCase()
  return RANKS.find((r) => r.code === t) ?? null
}

function maxSubLevel(code) {
  return (code ?? '').trim().toUpperCase() === 'A8' ? MAX_SUB_A8 : Number.POSITIVE_INFINITY
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
  const a = new RegExp(`${rank.label}\\s*(\\d+)`).exec(text)
  if (a) sub = Number(a[1])
  if (sub === 0) {
    const b = new RegExp(`${rank.code}\\s*(\\d+)`, 'i').exec(text)
    if (b) sub = Number(b[1])
  }
  return { code: rank.code, sub: Math.min(sub, maxSubLevel(rank.code)) }
}

function rankToScore(value) {
  const p = parseRank(value)
  if (!p) return null
  const i = RANKS.findIndex((r) => r.code === p.code)
  return i < 0 ? null : i * BASE + Math.max(0, p.sub)
}

test('基础打分', () => {
  assert.equal(rankToScore('A0 黑铁1'), 1)
  assert.equal(rankToScore('A5 紫金1'), 5001)
  assert.equal(rankToScore('A6 投资大师7'), 6007)
  assert.equal(rankToScore('A7 资本帝王7'), 7007)
  assert.equal(rankToScore('A8 财富造物主20'), 8020)
})

test('跨大段不会倒挂（任何大段的小段位都低于下一大段的第 1 档）', () => {
  const a5max = rankToScore('A5 紫金99')
  const a6first = rankToScore('A6 投资大师1')
  assert.ok(a5max < a6first, `A5紫金99(${a5max}) 必须低于 A6投资大师1(${a6first})`)
})

test('真实数据能正确比较', () => {
  assert.ok(rankToScore('A6 投资大师9') > rankToScore('A6 投资大师7'))
  assert.ok(rankToScore('A6 投资大师9') > rankToScore('A6 投资大师4'))
  assert.ok(rankToScore('A7 资本帝王1') > rankToScore('A6 投资大师9'))
})

test('只有 A8 有上限 20，其他档不限制', () => {
  assert.equal(maxSubLevel('A8'), 20)
  assert.equal(maxSubLevel('A7'), Number.POSITIVE_INFINITY)
  assert.deepEqual(parseRank('A8 财富造物主21'), { code: 'A8', sub: 20 })
  assert.deepEqual(parseRank('A7 资本帝王21'), { code: 'A7', sub: 21 })
})

test('只填大段时小段位为 0', () => {
  assert.deepEqual(parseRank('A5'), { code: 'A5', sub: 0 })
  assert.equal(rankToScore('A5'), 5000)
})

test('无法解析返回 null', () => {
  assert.equal(rankToScore(''), null)
  assert.equal(rankToScore('未知'), null)
  assert.equal(rankToScore(null), null)
})

test('完整序列单调递增', () => {
  const seq = [
    'A0 黑铁1', 'A1 青铜1', 'A2 翠钢1', 'A3 钴银1', 'A4 冰钛1',
    'A5 紫金1', 'A6 投资大师1', 'A6 投资大师9',
    'A7 资本帝王1', 'A7 资本帝王7', 'A8 财富造物主1', 'A8 财富造物主20'
  ]
  const scores = seq.map(rankToScore)
  for (let i = 1; i < scores.length; i++) {
    assert.ok(scores[i] > scores[i - 1], `${seq[i]} 应大于 ${seq[i - 1]}`)
  }
})
