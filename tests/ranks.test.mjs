// 职级测试：大段位 A0–A8 + 小段位手填（各档上限不同，不设固定枚举）
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

function rankByCode(code) {
  const t = (code ?? '').trim().toUpperCase()
  return RANKS.find((r) => r.code === t) ?? null
}

function formatRank(value) {
  if (!value) return ''
  const rank = rankByCode(value.code)
  if (!rank) return ''
  return rank.hasSubLevel && value.sub > 0 ? `${rank.code} ${rank.label}${value.sub}` : `${rank.code} ${rank.label}`
}

function parseRank(value) {
  const text = (value ?? '').trim()
  if (!text) return null
  let rank = null
  const codeMatch = /([Aa][0-8])\b/.exec(text)
  if (codeMatch) rank = rankByCode(codeMatch[1])
  if (!rank) {
    for (let i = RANKS.length - 1; i >= 0; i--) {
      if (text.includes(RANKS[i].label)) { rank = RANKS[i]; break }
    }
  }
  if (!rank) return null
  let sub = 0
  if (rank.hasSubLevel) {
    const afterName = new RegExp(`${rank.label}\\s*(\\d{1,2})`).exec(text)
    if (afterName) sub = Number(afterName[1])
    if (sub === 0) {
      const afterCode = new RegExp(`${rank.code}\\s*(\\d{1,2})`, 'i').exec(text)
      if (afterCode) sub = Number(afterCode[1])
    }
  }
  return { code: rank.code, sub }
}

test('共 9 个大段位，A0–A8', () => {
  assert.equal(RANKS.length, 9)
  assert.equal(RANKS[0].code, 'A0')
  assert.equal(RANKS[8].code, 'A8')
})

test('A8 财富造物主没有小段位', () => {
  assert.equal(rankByCode('A8').hasSubLevel, false)
  assert.equal(rankByCode('A7').hasSubLevel, true)
})

test('格式化：带小段位', () => {
  assert.equal(formatRank({ code: 'A5', sub: 1 }), 'A5 紫金1')
  assert.equal(formatRank({ code: 'A7', sub: 7 }), 'A7 资本帝王7')
})

test('格式化：A8 不带编号', () => {
  assert.equal(formatRank({ code: 'A8', sub: 0 }), 'A8 财富造物主')
})

test('解析：官方结算界面的格式', () => {
  assert.deepEqual(parseRank('A5 紫金1'), { code: 'A5', sub: 1 })
  assert.deepEqual(parseRank('A7 资本帝王7'), { code: 'A7', sub: 7 })
})

test('回归：小段位不限于 1-3（实测资本帝王能到 7）', () => {
  // 之前限制了 1-3，导致「资本帝王6」「资本帝王7」解析错误
  assert.deepEqual(parseRank('资本帝王6'), { code: 'A7', sub: 6 })
  assert.deepEqual(parseRank('资本帝王7'), { code: 'A7', sub: 7 })
  assert.deepEqual(parseRank('A7 资本帝王6'), { code: 'A7', sub: 6 })
})

test('回归：两位小段位也能解析', () => {
  assert.deepEqual(parseRank('投资大师12'), { code: 'A6', sub: 12 })
})

test('解析：只有大段位时小段位为 0', () => {
  assert.deepEqual(parseRank('A5'), { code: 'A5', sub: 0 })
  assert.deepEqual(parseRank('紫金'), { code: 'A5', sub: 0 })
})

test('回归：真实历史数据「财富造物主50」→ A8', () => {
  assert.deepEqual(parseRank('财富造物主50'), { code: 'A8', sub: 0 }, 'A8 没有小段位，50 被忽略')
})

test('小段位手填的合法范围：1-99', () => {
  // 界面是输入框，限制 2 位数字（最大 99），足够覆盖所有已知档位
  assert.deepEqual(parseRank('紫金1'), { code: 'A5', sub: 1 })
  assert.deepEqual(parseRank('紫金3'), { code: 'A5', sub: 3 })
  assert.deepEqual(parseRank('资本帝王7'), { code: 'A7', sub: 7 })
})

test('空值与无法识别', () => {
  assert.equal(parseRank(''), null)
  assert.equal(parseRank('   '), null)
  assert.equal(parseRank(null), null)
  assert.equal(parseRank('未知职级'), null)
})

test('往返一致', () => {
  for (const [code, subs] of [['A0', [1, 2, 3]], ['A5', [1, 2, 3]], ['A7', [1, 5, 7]]]) {
    for (const sub of subs) {
      const text = formatRank({ code, sub })
      assert.deepEqual(parseRank(text), { code, sub }, `${text} 应能往返`)
    }
  }
})

test('职级名称完整（对应官方截图 A0黑铁 ~ A8财富造物主）', () => {
  const expected = ['黑铁', '青铜', '翠钢', '钴银', '冰钛', '紫金', '投资大师', '资本帝王', '财富造物主']
  assert.deepEqual(RANKS.map((r) => r.label), expected)
})
