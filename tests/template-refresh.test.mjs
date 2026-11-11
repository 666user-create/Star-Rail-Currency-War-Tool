// TTL 刷新策略测试：新赛季要能自动补新角色，但刷新失败绝不能破坏旧缓存
import test from 'node:test'
import assert from 'node:assert/strict'

const DAY_MS = 24 * 60 * 60 * 1000
const MANIFEST_TTL_MS = 7 * DAY_MS
const BOND_CACHE_TTL_MS = 7 * DAY_MS

/**
 * 复刻 portraitRecognition.resolveManifest 的决策逻辑（去掉 IO）。
 * 返回 'use-cache' | 'refresh' | 'create'
 */
function decideManifestAction({ hasCache, ageMs }) {
  if (!hasCache) return 'create'
  if (ageMs > MANIFEST_TTL_MS) return 'refresh'
  return 'use-cache'
}

/**
 * 复刻「刷新后是否接受新结果」的判断。
 * 新清单不足旧缓存一半 → 视为异常，回退旧缓存。
 */
function shouldAcceptRefresh({ cachedCount, freshCount }) {
  if (cachedCount === 0) return true
  return freshCount >= cachedCount * 0.5
}

test('全新安装：没有缓存就去创建', () => {
  assert.equal(decideManifestAction({ hasCache: false, ageMs: 0 }), 'create')
})

test('缓存新鲜（1 天）：直接用，不联网', () => {
  assert.equal(decideManifestAction({ hasCache: true, ageMs: 1 * DAY_MS }), 'use-cache')
})

test('缓存即将过期（6 天）：仍然直接用', () => {
  assert.equal(decideManifestAction({ hasCache: true, ageMs: 6 * DAY_MS }), 'use-cache')
})

test('缓存过期（8 天）：触发刷新', () => {
  assert.equal(decideManifestAction({ hasCache: true, ageMs: 8 * DAY_MS }), 'refresh')
})

test('缓存极旧（30 天）：触发刷新', () => {
  assert.equal(decideManifestAction({ hasCache: true, ageMs: 30 * DAY_MS }), 'refresh')
})

test('角色库 TTL 与羁绊 TTL 一致（7 天）', () => {
  assert.equal(MANIFEST_TTL_MS, BOND_CACHE_TTL_MS)
})

test('刷新结果正常（比旧的多）：接受新清单', () => {
  assert.equal(shouldAcceptRefresh({ cachedCount: 104, freshCount: 120 }), true, '新赛季加了角色')
})

test('刷新结果与旧的持平：接受', () => {
  assert.equal(shouldAcceptRefresh({ cachedCount: 104, freshCount: 104 }), true)
})

test('刷新结果略少（官方下架个别角色）：仍接受', () => {
  assert.equal(shouldAcceptRefresh({ cachedCount: 104, freshCount: 60 }), true, '60 >= 104*0.5')
})

test('回归：刷新结果异常少时回退旧缓存（不让识别退化）', () => {
  // 官方接口抖动返回残缺数据，若直接采用会让用户从「认 104 个」退化到「认 10 个」
  assert.equal(shouldAcceptRefresh({ cachedCount: 104, freshCount: 10 }), false)
  assert.equal(shouldAcceptRefresh({ cachedCount: 104, freshCount: 50 }), false, '50 < 52 也应拒绝')
})

test('回归：首次创建时没有旧缓存，任何数量都接受', () => {
  assert.equal(shouldAcceptRefresh({ cachedCount: 0, freshCount: 20 }), true)
})

test('边界：刚好一半时接受（>=）', () => {
  assert.equal(shouldAcceptRefresh({ cachedCount: 104, freshCount: 52 }), true)
})

/**
 * 4.7 赛季轮换实测发现的两个真实陷阱：
 * 1. 官方把角色 ID 从 4 位改成 6 位（1508 → 150302），同一角色会出现在新旧两个名单里
 * 2. 赛季更替会下架一批角色/羁绊（4.7 下架 29 个角色、22 个羁绊）
 * 所以刷新时既要按名字去重，又要保留旧清单里新清单没有的条目。
 */

/** 复刻合并逻辑：新名单 + 旧名单里新名单没有的条目 */
function mergeKeepHistory(fresh, cached) {
  const names = new Set(fresh.map((x) => x.name))
  const ids = new Set(fresh.map((x) => x.id))
  const merged = [...fresh]
  let kept = 0
  for (const old of cached) {
    if (names.has(old.name) || ids.has(old.id)) continue
    merged.push(old)
    names.add(old.name)
    ids.add(old.id)
    kept++
  }
  return { merged, kept }
}

test('4.7 真实场景：ID 变长但同名角色不会重复计入', () => {
  const fresh = [{ id: '150302', name: '真珠' }, { id: '150102', name: '火花' }]
  const cached = [{ id: '1503', name: '真珠' }, { id: '1501', name: '火花' }]
  const { merged, kept } = mergeKeepHistory(fresh, cached)
  assert.equal(merged.length, 2, '同名角色只保留新 ID 那份')
  assert.equal(kept, 0, '不该把同名的旧 ID 当历史角色保留')
})

test('回归：赛季下架的角色必须保留（否则旧截图认不出）', () => {
  // 4.7 实测：远坂凛/Saber/Archer 等联动角色从接口消失
  const fresh = [{ id: '150302', name: '真珠' }, { id: '900502', name: '星神★阿哈' }]
  const cached = [
    { id: '1503', name: '真珠' },
    { id: '1508', name: '远坂凛' },
    { id: '1014', name: 'Saber' }
  ]
  const { merged, kept } = mergeKeepHistory(fresh, cached)
  assert.equal(kept, 2, '远坂凛、Saber 应被保留')
  assert.equal(merged.length, 4)
  assert.ok(merged.some((x) => x.name === '远坂凛'))
  assert.ok(merged.some((x) => x.name === 'Saber'))
})

test('回归：新角色正常加入，历史角色不影响总数', () => {
  const fresh = [{ id: '900502', name: '星神★阿哈' }, { id: '900602', name: '帕姆王' }]
  const cached = [{ id: '1508', name: '远坂凛' }]
  const { merged } = mergeKeepHistory(fresh, cached)
  assert.equal(merged.length, 3)
  assert.ok(merged.some((x) => x.name === '星神★阿哈'))
  assert.ok(merged.some((x) => x.name === '帕姆王'))
})

test('空旧清单时只保留新名单', () => {
  const fresh = [{ id: '1', name: 'A' }]
  const { merged, kept } = mergeKeepHistory(fresh, [])
  assert.equal(merged.length, 1)
  assert.equal(kept, 0)
})
