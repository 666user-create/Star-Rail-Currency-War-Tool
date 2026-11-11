// 职级归一化测试：历史数据是自由文本，必须能正确归类且不丢信息
import test from 'node:test'
import assert from 'node:assert/strict'

const RANKS = [
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

function rankByCode(code) {
  const t = (code ?? '').trim().toUpperCase()
  return RANKS.find((r) => r.code === t) ?? null
}

function matchRank(value) {
  const text = (value ?? '').trim()
  if (!text) return null
  const byCode = rankByCode(text)
  if (byCode) return byCode
  const m = /^([Aa][0-8])\b/.exec(text)
  if (m) {
    const hit = rankByCode(m[1])
    if (hit) return hit
  }
  for (let i = RANKS.length - 1; i >= 0; i--) {
    if (text.includes(RANKS[i].label)) return RANKS[i]
  }
  return null
}

test('职级共 9 档 A0–A8', () => {
  assert.equal(RANKS.length, 9)
  assert.equal(RANKS[0].code, 'A0')
  assert.equal(RANKS[8].code, 'A8')
})

test('按 code 精确匹配', () => {
  assert.equal(rankByCode('A5').label, '紫金')
  assert.equal(rankByCode('a5').label, '紫金', '大小写不敏感')
  assert.equal(rankByCode(' A5 ').label, '紫金', '忽略空格')
  assert.equal(rankByCode('A9'), null)
})

test('标准完整名匹配', () => {
  assert.equal(matchRank('A5 紫金').code, 'A5')
  assert.equal(matchRank('A0 黑铁').code, 'A0')
  assert.equal(matchRank('A8 财富造物主').code, 'A8')
})

test('只有名称也能匹配', () => {
  assert.equal(matchRank('紫金').code, 'A5')
  assert.equal(matchRank('投资大师').code, 'A6')
  assert.equal(matchRank('财富造物主').code, 'A8')
})

test('回归：真实历史数据「财富造物主50」应归到 A8', () => {
  // 数据库里实际存在的值，带等级数字后缀
  assert.equal(matchRank('财富造物主50').code, 'A8')
  assert.equal(matchRank('投资大师12').code, 'A6')
  assert.equal(matchRank('黑铁3').code, 'A0')
})

test('回归：不能把「投资大师」误判成更短的名称', () => {
  // 「大师」不是职级名，但如果有类似短名，从高档往低找能避免误配
  assert.equal(matchRank('A6 投资大师').code, 'A6')
})

test('空值返回 null', () => {
  assert.equal(matchRank(''), null)
  assert.equal(matchRank('   '), null)
  assert.equal(matchRank(null), null)
})

test('无法识别的文本返回 null（调用方保留原值，不丢数据）', () => {
  assert.equal(matchRank('某个未知职级'), null)
  assert.equal(matchRank('12345'), null)
})

test('code 与名称混写', () => {
  assert.equal(matchRank('a3钴银').code, 'A3')
  assert.equal(matchRank('B5 紫金').code, 'A5', 'code 无效时回落到名称匹配')
})
