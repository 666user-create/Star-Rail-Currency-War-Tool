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
