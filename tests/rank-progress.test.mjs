// 段位提升推导测试：官方规则由小队生命值决定提升级数
import test from 'node:test'
import assert from 'node:assert/strict'

function rankGainFromHp({ result, squadHp }) {
  if (result !== 'win') return result === 'loss' ? 0 : null
  if (squadHp == null || !Number.isFinite(squadHp)) return null
  const hp = Math.max(0, squadHp)
  if (hp >= 70) return 3
  if (hp >= 40) return 2
  return 1
}

test('官方规则：生命 ≥70 升 3 级', () => {
  assert.equal(rankGainFromHp({ result: 'win', squadHp: 70 }), 3, '70 是边界，含等号')
  assert.equal(rankGainFromHp({ result: 'win', squadHp: 100 }), 3)
  assert.equal(rankGainFromHp({ result: 'win', squadHp: 85 }), 3)
})

test('官方规则：生命 40-69 升 2 级', () => {
  assert.equal(rankGainFromHp({ result: 'win', squadHp: 40 }), 2, '40 是边界，含等号')
  assert.equal(rankGainFromHp({ result: 'win', squadHp: 69 }), 2)
  assert.equal(rankGainFromHp({ result: 'win', squadHp: 55 }), 2)
})

test('官方规则：生命 <40 升 1 级', () => {
  assert.equal(rankGainFromHp({ result: 'win', squadHp: 39 }), 1)
  assert.equal(rankGainFromHp({ result: 'win', squadHp: 20 }), 1)
  assert.equal(rankGainFromHp({ result: 'win', squadHp: 0 }), 1, '0 血也算通关，升 1 级')
})

test('官方规则：失败不掉段', () => {
  assert.equal(rankGainFromHp({ result: 'loss', squadHp: 100 }), 0)
  assert.equal(rankGainFromHp({ result: 'loss', squadHp: null }), 0)
})

test('中断/待核实：无法推导', () => {
  assert.equal(rankGainFromHp({ result: 'interrupted', squadHp: 100 }), null)
  assert.equal(rankGainFromHp({ result: 'suspected', squadHp: 100 }), null)
})

test('生命未知：无法推导（不能瞎猜）', () => {
  assert.equal(rankGainFromHp({ result: 'win', squadHp: null }), null)
  assert.equal(rankGainFromHp({ result: 'win', squadHp: undefined }), null)
  assert.equal(rankGainFromHp({ result: 'win', squadHp: NaN }), null)
})

test('负血量被夹到 0（数据异常也不崩）', () => {
  assert.equal(rankGainFromHp({ result: 'win', squadHp: -10 }), 1)
})

/** 复刻曲线累加 */
function buildCurve(matches) {
  let total = 0
  const points = []
  for (const m of matches) {
    const gain = rankGainFromHp({ result: m.result, squadHp: m.squadHp })
    if (gain === null) continue
    total += gain
    points.push({ time: m.endedAt, cumulative: total })
  }
  return points
}

test('曲线：按血量累加出正确走势', () => {
  // 对应真实数据：58 局血量100(+3) → 59 局血量100(+3)
  const matches = [
    { endedAt: 1000, result: 'win', squadHp: 100 },
    { endedAt: 2000, result: 'win', squadHp: 100 }
  ]
  const curve = buildCurve(matches)
  assert.deepEqual(curve, [
    { time: 1000, cumulative: 3 },
    { time: 2000, cumulative: 6 }
  ])
})

test('曲线：不同血量混算', () => {
  const matches = [
    { endedAt: 1000, result: 'win', squadHp: 100 }, // +3
    { endedAt: 2000, result: 'win', squadHp: 50 },  // +2
    { endedAt: 3000, result: 'win', squadHp: 20 },  // +1
    { endedAt: 4000, result: 'loss', squadHp: 0 }   // +0（水平线）
  ]
  const curve = buildCurve(matches)
  assert.deepEqual(curve.map((p) => p.cumulative), [3, 5, 6, 6])
})

test('曲线：血量未知的局被跳过，不产生错误点', () => {
  const matches = [
    { endedAt: 1000, result: 'win', squadHp: 100 }, // +3
    { endedAt: 2000, result: 'win', squadHp: null }, // 跳过
    { endedAt: 3000, result: 'win', squadHp: 50 }   // +2
  ]
  const curve = buildCurve(matches)
  assert.equal(curve.length, 2, '未知血量的点不画')
  assert.deepEqual(curve.map((p) => p.cumulative), [3, 5])
})

test('曲线：全失败时是一条水平线', () => {
  const matches = [
    { endedAt: 1000, result: 'loss', squadHp: 50 },
    { endedAt: 2000, result: 'loss', squadHp: 30 }
  ]
  const curve = buildCurve(matches)
  assert.deepEqual(curve.map((p) => p.cumulative), [0, 0])
})

test('回归：手填的 rankChange 不再影响曲线', () => {
  // 之前实测有记录手填了 +3 但实际只是 +2，照手填画会错
  // 现在只认血量：血量 100 → 恒为 +3，血量 50 → 恒为 +2
  const byHpOnly = buildCurve([{ endedAt: 1000, result: 'win', squadHp: 50 }])
  assert.equal(byHpOnly[0].cumulative, 2, '血量 50 必须是 +2，不受手填值影响')
})
