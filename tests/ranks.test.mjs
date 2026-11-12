// 职级测试：A0–A8 + 小段位（A8 最多 20，其他不设上限）
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

const MAX_SUB_A8 = 20

function rankByCode(code) {
  const t = (code ?? '').trim().toUpperCase()
  return RANKS.find((r) => r.code === t) ?? null
}

function maxSubLevel(code) {
  const key = (code ?? '').trim().toUpperCase()
  return key === 'A8' ? MAX_SUB_A8 : Number.POSITIVE_INFINITY
}

function formatRank(value) {
  if (!value) return ''
  const rank = rankByCode(value.code)
  if (!rank) return ''
  return value.sub > 0 ? `${rank.code} ${rank.label}${value.sub}` : `${rank.code} ${rank.label}`
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
  const afterName = new RegExp(`${rank.label}\\s*(\\d{1,2})`).exec(text)
  if (afterName) sub = Number(afterName[1])
  if (sub === 0) {
    const afterCode = new RegExp(`${rank.code}\\s*(\\d{1,2})`, 'i').exec(text)
    if (afterCode) sub = Number(afterCode[1])
  }
  return { code: rank.code, sub: Math.min(sub, maxSubLevel(rank.code)) }
}

function isMaxRank(value) {
  if (!value) return false
  return value.code === 'A8' && value.sub >= MAX_SUB_A8
}

test('共 9 个大段位 A0–A8', () => {
  assert.equal(RANKS.length, 9)
  assert.equal(RANKS[0].code, 'A0')
  assert.equal(RANKS[8].code, 'A8')
})

test('回归：A8 也能填小段位（之前错误地禁用了输入框）', () => {
  // 这是用户实际反馈的 bug：选到 A8 后小段位输入框被 disabled
  const a8WithSub = parseRank('A8 财富造物主5')
  assert.deepEqual(a8WithSub, { code: 'A8', sub: 5 })
  assert.equal(formatRank(a8WithSub), 'A8 财富造物主5', 'A8 的小段位要能显示出来')
})

test('A8 小段位上限是 20', () => {
  assert.equal(maxSubLevel('A8'), 20)
  assert.equal(maxSubLevel('A7'), Number.POSITIVE_INFINITY, '其他档不限制')
})

test('A8 超过 20 被夹到 20', () => {
  assert.deepEqual(parseRank('A8 财富造物主99'), { code: 'A8', sub: 20 })
  assert.deepEqual(parseRank('A8 财富造物主21'), { code: 'A8', sub: 20 })
  assert.deepEqual(parseRank('A8 财富造物主20'), { code: 'A8', sub: 20 })
})

test('其他大段不设上限（乐观设计）', () => {
  assert.deepEqual(parseRank('A6 投资大师15'), { code: 'A6', sub: 15 })
  assert.deepEqual(parseRank('A7 资本帝王12'), { code: 'A7', sub: 12 })
  assert.deepEqual(parseRank('A5 紫金9'), { code: 'A5', sub: 9 })
})

test('isMaxRank 只在 A8 且到 20 时为真', () => {
  assert.equal(isMaxRank({ code: 'A8', sub: 20 }), true)
  assert.equal(isMaxRank({ code: 'A8', sub: 19 }), false)
  assert.equal(isMaxRank({ code: 'A7', sub: 50 }), false, 'A7 再高也不是满级')
  assert.equal(isMaxRank(null), false)
})

test('格式化：带/不带小段位', () => {
  assert.equal(formatRank({ code: 'A5', sub: 1 }), 'A5 紫金1')
  assert.equal(formatRank({ code: 'A8', sub: 20 }), 'A8 财富造物主20')
  assert.equal(formatRank({ code: 'A5', sub: 0 }), 'A5 紫金')
})

test('解析各种格式', () => {
  assert.deepEqual(parseRank('A5 紫金1'), { code: 'A5', sub: 1 })
  assert.deepEqual(parseRank('紫金2'), { code: 'A5', sub: 2 })
  assert.deepEqual(parseRank('A5'), { code: 'A5', sub: 0 })
  assert.deepEqual(parseRank('财富造物主'), { code: 'A8', sub: 0 })
})

test('无法识别返回 null', () => {
  assert.equal(parseRank(''), null)
  assert.equal(parseRank('   '), null)
  assert.equal(parseRank('未知职级'), null)
  assert.equal(parseRank(null), null)
})

test('职级名称完整（对应官方截图）', () => {
  const expected = ['黑铁', '青铜', '翠钢', '钴银', '冰钛', '紫金', '投资大师', '资本帝王', '财富造物主']
  assert.deepEqual(RANKS.map((r) => r.label), expected)
})
