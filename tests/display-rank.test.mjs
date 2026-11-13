// displayRank：界面展示去掉 A 前缀
import test from 'node:test'
import assert from 'node:assert/strict'

const RANKS = [
  { code: 'A0', label: '黑铁' }, { code: 'A1', label: '青铜' }, { code: 'A2', label: '翠钢' },
  { code: 'A3', label: '钴银' }, { code: 'A4', label: '冰钛' }, { code: 'A5', label: '紫金' },
  { code: 'A6', label: '投资大师' }, { code: 'A7', label: '资本帝王' }, { code: 'A8', label: '财富造物主' }
]

function rankByCode(c) {
  return RANKS.find((r) => r.code === (c || '').trim().toUpperCase()) ?? null
}

function parseRank(value) {
  const text = (value || '').trim()
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
  return { code: rank.code, sub }
}

function displayRank(value) {
  const raw = String(value ?? '').trim()
  if (!raw) return ''
  const parsed = parseRank(raw)
  if (!parsed) return raw
  const rank = rankByCode(parsed.code)
  if (!rank) return raw
  return parsed.sub > 0 ? `${rank.label}${parsed.sub}` : rank.label
}

test('去掉 A 前缀', () => {
  assert.equal(displayRank('A7 资本帝王2'), '资本帝王2')
  assert.equal(displayRank('A6 投资大师9'), '投资大师9')
  assert.equal(displayRank('A8 财富造物主20'), '财富造物主20')
})

test('回归：历史数据两种写法现在显示一致', () => {
  // 数据库里同时存在这两种，之前一个带 A 一个不带，看着像数据错了
  assert.equal(displayRank('A7 资本帝王2'), displayRank('资本帝王2'))
  assert.equal(displayRank('A6 投资大师4'), displayRank('投资大师4'))
})

test('没有小段位时只显示段位名', () => {
  assert.equal(displayRank('A8 财富造物主'), '财富造物主')
  assert.equal(displayRank('A5 紫金'), '紫金')
})

test('空值返回空串', () => {
  assert.equal(displayRank(null), '')
  assert.equal(displayRank(undefined), '')
  assert.equal(displayRank(''), '')
  assert.equal(displayRank('  '), '')
})

test('无法解析的原样返回（不丢数据）', () => {
  assert.equal(displayRank('未知段位'), '未知段位')
})

test('只填大段也能显示', () => {
  assert.equal(displayRank('A5'), '紫金')
  assert.equal(displayRank('A8'), '财富造物主')
})
