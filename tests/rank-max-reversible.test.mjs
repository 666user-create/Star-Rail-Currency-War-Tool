// 满级状态可逆性测试
import test from 'node:test'
import assert from 'node:assert/strict'

// 复刻 ranks.ts 的判定
const MAX_SUB_A8 = 20
function isMaxRank(value) {
  if (!value) return false
  return value.code === 'A8' && value.sub >= MAX_SUB_A8
}

// 复刻 rankCurve 的截断逻辑
function buildCurve(rows) {
  const points = []
  for (const row of rows) {
    if (!row.rank) continue
    points.push({ label: row.rank })
    if (row.rank === 'A8 财富造物主20') break
  }
  return points
}

test('满级判定：A8 小段位 >= 20', () => {
  assert.equal(isMaxRank({ code: 'A8', sub: 20 }), true)
  assert.equal(isMaxRank({ code: 'A8', sub: 21 }), true)
  assert.equal(isMaxRank({ code: 'A8', sub: 19 }), false)
  assert.equal(isMaxRank({ code: 'A7', sub: 99 }), false)
})

test('可逆：达到 20 后改回 19，不再算满级', () => {
  // 玩家达 A8-20 → 满级
  assert.equal(isMaxRank({ code: 'A8', sub: 20 }), true)
  // 编辑改回 19 → 立刻不再是满级，走势图恢复记录
  assert.equal(isMaxRank({ code: 'A8', sub: 19 }), false)
})

test('可逆：误设成 20 再改回，曲线能恢复', () => {
  const rowsBefore = [
    { rank: 'A7 资本帝王8' },
    { rank: 'A8 财富造物主15' }
  ]
  // 误设成 A8-20 → 曲线截断到满级那局
  const rowsMis = [...rowsBefore, { rank: 'A8 财富造物主20' }, { rank: 'A8 财富造物主20' }]
  assert.equal(buildCurve(rowsMis).length, 3, '截断在第一次满级处')

  // 改回 15 → 曲线恢复完整
  const rowsFixed = [
    { rank: 'A7 资本帝王8' },
    { rank: 'A8 财富造物主15' },
    { rank: 'A8 财富造物主18' }
  ]
  assert.equal(buildCurve(rowsFixed).length, 3, '改回后不再截断')
})

test('未满级时曲线包含全部对局', () => {
  const rows = [
    { rank: 'A6 投资大师1' },
    { rank: 'A7 资本帝王5' },
    { rank: 'A8 财富造物主9' },
    { rank: 'A8 财富造物主12' }
  ]
  assert.equal(buildCurve(rows).length, 4)
})
