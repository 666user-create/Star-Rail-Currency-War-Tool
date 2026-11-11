// 赛季隔离测试：切换赛季后列表和统计必须只看该赛季
import test from 'node:test'
import assert from 'node:assert/strict'

/**
 * 复刻 repository.where() 的构造逻辑（纯字符串，不碰数据库）。
 */
function buildWhere(season, extra) {
  const parts = ["source!='demo'"]
  const params = []
  if (season != null && String(season).trim() !== '') {
    parts.push('season=?')
    params.push(String(season).trim())
  }
  if (extra) { parts.push(extra.clause); params.push(...extra.params) }
  return { sql: ` WHERE ${parts.join(' AND ')}`, params }
}

test('不传赛季：只排除演示数据', () => {
  assert.deepEqual(buildWhere(undefined), { sql: " WHERE source!='demo'", params: [] })
  assert.deepEqual(buildWhere(null), { sql: " WHERE source!='demo'", params: [] })
  assert.deepEqual(buildWhere(''), { sql: " WHERE source!='demo'", params: [] })
  assert.deepEqual(buildWhere('   '), { sql: " WHERE source!='demo'", params: [] })
})

test('传赛季：加上 season=? 条件', () => {
  assert.deepEqual(buildWhere('入画奇航'), { sql: " WHERE source!='demo' AND season=?", params: ['入画奇航'] })
  assert.deepEqual(buildWhere('零和博弈'), { sql: " WHERE source!='demo' AND season=?", params: ['零和博弈'] })
})

test('赛季名首尾空格被裁剪', () => {
  assert.deepEqual(buildWhere('  入画奇航  ').params, ['入画奇航'])
})

test('附加条件与赛季条件正确合并', () => {
  const w = buildWhere('入画奇航', { clause: "result IN ('win','loss')", params: [] })
  assert.equal(w.sql, " WHERE source!='demo' AND season=? AND result IN ('win','loss')")
  assert.deepEqual(w.params, ['入画奇航'])
})

test('参数顺序：赛季参数在前，附加参数在后', () => {
  const w = buildWhere('入画奇航', { clause: 'duration_sec>?', params: [60] })
  assert.deepEqual(w.params, ['入画奇航', 60], 'SQL 里 ? 的顺序必须与 params 一致')
})

/**
 * 模拟数据隔离：不同赛季的数据不应互相污染。
 */
const ALL = [
  { season: '零和博弈', result: 'win', duration: 600 },
  { season: '零和博弈', result: 'loss', duration: 900 },
  { season: '零和博弈', result: 'win', duration: 1200 },
  { season: '入画奇航', result: 'win', duration: 300 },
  { season: '入画奇航', result: 'win', duration: 500 }
]

function filterSeason(rows, season) {
  if (season == null || String(season).trim() === '') return rows
  const target = String(season).trim()
  return rows.filter((r) => r.season === target)
}

test('切换赛季后统计只算该赛季', () => {
  const old = filterSeason(ALL, '零和博弈')
  const now = filterSeason(ALL, '入画奇航')
  assert.equal(old.length, 3)
  assert.equal(now.length, 2)
  assert.equal(old.filter((r) => r.result === 'win').length, 2, '上赛季 2 胜')
  assert.equal(now.filter((r) => r.result === 'win').length, 2, '本赛季 2 胜')
  // 若混在一起会得到 5 局 4 胜，明显是错的
  assert.notEqual(filterSeason(ALL, undefined).length, now.length)
})

test('总时长不跨赛季累加', () => {
  const oldTotal = filterSeason(ALL, '零和博弈').reduce((s, r) => s + r.duration, 0)
  const nowTotal = filterSeason(ALL, '入画奇航').reduce((s, r) => s + r.duration, 0)
  assert.equal(oldTotal, 2700)
  assert.equal(nowTotal, 800)
  assert.notEqual(oldTotal + nowTotal, nowTotal)
})

test('未知赛季返回空集，不返回全部', () => {
  assert.equal(filterSeason(ALL, '不存在的赛季').length, 0)
})

test('回归：不传赛季时保持原行为（全部）', () => {
  assert.equal(filterSeason(ALL, undefined).length, 5)
})
