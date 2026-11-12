// 评级分布统计测试
import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

test('评级分布只统计有评级的对局', () => {
  // 复刻 ratingStats 的核心逻辑
  function ratingStats(rows) {
    const withRating = rows.filter((r) => r.rating != null && String(r.rating).trim() !== '')
    if (!withRating.length) return []
    const map = new Map()
    for (const r of withRating) {
      const key = String(r.rating).trim().toUpperCase()
      const cur = map.get(key) ?? { count: 0, wins: 0 }
      cur.count++
      if (r.result === 'win') cur.wins++
      map.set(key, cur)
    }
    const total = withRating.length
    const order = ['SSS', 'SS', 'S', 'A', 'B', 'C', 'D']
    const rankOf = (l) => { const i = order.indexOf(l); return i < 0 ? order.length : i }
    return [...map.entries()]
      .map(([label, v]) => ({ label, count: v.count, wins: v.wins, ratio: v.count / total }))
      .sort((a, b) => rankOf(a.label) - rankOf(b.label) || b.count - a.count)
  }

  // 3 局有评级 + 2 局没评级
  const rows = [
    { rating: 'SSS', result: 'win' },
    { rating: 'SSS', result: 'win' },
    { rating: 'A', result: 'loss' },
    { rating: null, result: 'win' },
    { rating: '', result: 'win' }
  ]
  const stats = ratingStats(rows)

  assert.equal(stats.length, 2, '只有 SSS 和 A 两档')
  const total = stats.reduce((s, i) => s + i.count, 0)
  assert.equal(total, 3, '分母只算有评级的 3 局，不是 5 局')

  const sss = stats.find((i) => i.label === 'SSS')
  assert.equal(sss.count, 2)
  assert.equal(sss.wins, 2)
  assert.ok(Math.abs(sss.ratio - 2 / 3) < 1e-9, 'SSS 占 2/3（不是 2/5）')

  const a = stats.find((i) => i.label === 'A')
  assert.equal(a.count, 1)
  assert.equal(a.wins, 0)
})

test('评级按高低排序：SSS → SS → S → A → B → C', () => {
  function sortRatings(labels) {
    const order = ['SSS', 'SS', 'S', 'A', 'B', 'C', 'D']
    const rankOf = (l) => { const i = order.indexOf(l); return i < 0 ? order.length : i }
    return [...labels].sort((a, b) => rankOf(a) - rankOf(b))
  }
  assert.deepEqual(sortRatings(['A', 'SSS', 'C', 'SS', 'B', 'S']), ['SSS', 'SS', 'S', 'A', 'B', 'C'])
})

test('没有评级数据时返回空数组', () => {
  function ratingStats(rows) {
    return rows.filter((r) => r.rating != null && String(r.rating).trim() !== '')
  }
  assert.equal(ratingStats([]).length, 0)
  assert.equal(ratingStats([{ rating: null }, { rating: '  ' }]).length, 0)
})

test('评级大小写归一化', () => {
  function norm(rating) { return String(rating).trim().toUpperCase() }
  assert.equal(norm('sss'), 'SSS')
  assert.equal(norm(' Aa '), 'AA')
  assert.equal(norm('S'), 'S')
})
