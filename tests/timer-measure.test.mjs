// 回归测试：窗口宽度切换时，渲染端的暂态测量不能被丢弃
// 背景：计时表窗口在 48(空闲)→136(计时中) 之间切换宽度。切换瞬间渲染端可能
// 仍按旧视口测量（胶囊居中溢出 → rect.x 为负）。旧实现会直接 return，导致
// ready 永远为 false、计时表一直隐藏 —— 表现为「中途退出再进来，闹钟丢失」。
import test from 'node:test'
import assert from 'node:assert/strict'

/**
 * 复刻 petTimer.measure() 的几何计算（抽成纯函数以便测试）。
 * 返回 null 表示应当丢弃这次测量；否则返回 { shape, grownTo }。
 */
function computeShape(rect, bounds) {
  if (!rect || ![rect.x, rect.y, rect.width, rect.height, rect.x + rect.width, rect.y + rect.height].every(Number.isFinite) ||
      rect.width <= 0 || rect.height <= 0) return null

  // 窗口容纳不下内容时先扩窗，而不是丢弃测量
  const needWidth = Math.max(bounds.width, Math.ceil(rect.x + rect.width) + 4)
  const needHeight = Math.max(bounds.height, Math.ceil(rect.y + rect.height) + 4)

  const x = Math.max(0, Math.floor(rect.x) - 4)
  const y = Math.max(0, Math.floor(rect.y) - 4)
  const right = Math.min(needWidth, Math.ceil(rect.x + rect.width) + 4)
  const bottom = Math.min(needHeight, Math.ceil(rect.y + rect.height) + 4)
  if (right <= x || bottom <= y) return null

  const grownTo = needWidth > bounds.width || needHeight > bounds.height
    ? { width: needWidth, height: needHeight }
    : null
  return { shape: { x, y, width: right - x, height: bottom - y }, grownTo }
}

test('正常测量：胶囊在视口内，返回贴合的 shape', () => {
  const result = computeShape({ x: 0, y: 6, width: 124, height: 36 }, { width: 137, height: 49 })
  assert.ok(result, '合法测量不该被丢弃')
  assert.equal(result.shape.x, 0)
  assert.equal(result.shape.y, 2)
  assert.equal(result.grownTo, null, '内容装得下时不该扩窗')
})

test('回归：负 x（旧视口暂态）不再被丢弃，而是扩窗', () => {
  // 精确复刻线上抓到的日志：rect=[-38,6,124,36] bounds=[137x49]
  const result = computeShape({ x: -38, y: 6, width: 124, height: 36 }, { width: 137, height: 49 })
  assert.ok(result, '负 x 的暂态测量必须被接受（这正是闹钟丢失的根因）')
  assert.equal(result.shape.x, 0, '形状要夹回视口')
  assert.ok(result.shape.width > 0)
})

test('内容超出窗口宽度时扩窗而不是丢弃', () => {
  const result = computeShape({ x: 0, y: 6, width: 200, height: 36 }, { width: 100, height: 49 })
  assert.ok(result, '超出宽度也不该丢弃')
  assert.ok(result.grownTo, '应扩窗')
  assert.ok(result.grownTo.width >= 204, `扩到能容纳 200px 内容，实际 ${result.grownTo?.width}`)
})

test('非法尺寸仍然丢弃', () => {
  assert.equal(computeShape({ x: 0, y: 0, width: 0, height: 0 }, { width: 137, height: 49 }), null)
  assert.equal(computeShape(null, { width: 137, height: 49 }), null)
  assert.equal(computeShape({ x: NaN, y: 0, width: 100, height: 36 }, { width: 137, height: 49 }), null)
})
