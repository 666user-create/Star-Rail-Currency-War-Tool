// 职级测试：大段位 A0–A8 + 小段位 1/2/3，且要兼容历史自由文本
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
const SUB_LEVELS = [1, 2, 3]

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
    const afterName = new RegExp(`${rank.label}\\s*([1-9])`).exec(text)
    if (afterName) { const n = Number(afterName[1]); if (n >= 1 && n <= 3) sub = n }
    if (sub === 0) {
      const afterCode = new RegExp(`${rank.code}\\s*([1-9])`, 'i').exec(text)
      if (afterCode) { const n = Number(afterCode[1]); if (n >= 1 && n <= 3) sub = n }
    }
  }
  return { code: rank.code, sub }
}

test('共 9 个大段位，A0–A8', () => {
  assert.equal(RANKS.length, 9)
  assert.equal(RANKS[0].code, 'A0')
  assert.equal(RANKS[8].code, 'A8')
})

test('小段位固定 1/2/3', () => {
  assert.deepEqual(SUB_LEVELS, [1, 2, 3])
})

test('A8 财富造物主按官方没有小段位', () => {
  assert.equal(rankByCode('A8').hasSubLevel, false)
  assert.equal(rankByCode('A7').hasSubLevel, true)
})

test('格式化：带小段位显示数字', () => {
  assert.equal(formatRank({ code: 'A5', sub: 1 }), 'A5 紫金1')
  assert.equal(formatRank({ code: 'A5', sub: 2 }), 'A5 紫金2')
  assert.equal(formatRank({ code: 'A6', sub: 3 }), 'A6 投资大师3')
})

test('格式化：A8 不带小段位编号', () => {
  assert.equal(formatRank({ code: 'A8', sub: 0 }), 'A8 财富造物主')
  assert.equal(formatRank({ code: 'A8', sub: 2 }), 'A8 财富造物主', 'A8 即使传了 sub 也不显示')
})

test('格式化：sub 为 0 时只显示大段位', () => {
  assert.equal(formatRank({ code: 'A5', sub: 0 }), 'A5 紫金')
})

test('解析：官方结算界面的完整格式', () => {
  // 截图里实际显示的「A5 紫金1」
  assert.deepEqual(parseRank('A5 紫金1'), { code: 'A5', sub: 1 })
  assert.deepEqual(parseRank('A7 资本帝王2'), { code: 'A7', sub: 2 })
  assert.deepEqual(parseRank('A0 黑铁3'), { code: 'A0', sub: 3 })
})

test('解析：无空格、只有名称+数字', () => {
  assert.deepEqual(parseRank('A5紫金1'), { code: 'A5', sub: 1 })
  assert.deepEqual(parseRank('紫金2'), { code: 'A5', sub: 2 })
})

test('解析：只有大段位，小段位为 0', () => {
  assert.deepEqual(parseRank('A5'), { code: 'A5', sub: 0 })
  assert.deepEqual(parseRank('紫金'), { code: 'A5', sub: 0 })
})

test('回归：真实历史数据「财富造物主50」→ A8 无小段位', () => {
  // 数据库里的旧值，带等级数字 50
  assert.deepEqual(parseRank('财富造物主50'), { code: 'A8', sub: 0 })
})

test('回归：小段位超范围（如 紫金9）不当作小段位', () => {
  assert.deepEqual(parseRank('A5 紫金9'), { code: 'A5', sub: 0 }, '9 超出 1-3 不算小段位')
})

test('空值与无法识别', () => {
  assert.equal(parseRank(''), null)
  assert.equal(parseRank('   '), null)
  assert.equal(parseRank(null), null)
  assert.equal(parseRank('某个未知职级'), null)
})

test('往返一致：格式化后再解析回来', () => {
  for (const code of ['A0', 'A3', 'A5', 'A7']) {
    for (const sub of SUB_LEVELS) {
      const text = formatRank({ code, sub })
      assert.deepEqual(parseRank(text), { code, sub }, `${text} 应能解析回原值`)
    }
  }
  const a8 = formatRank({ code: 'A8', sub: 0 })
  assert.deepEqual(parseRank(a8), { code: 'A8', sub: 0 })
})
