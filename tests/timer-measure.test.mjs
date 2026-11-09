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

  // 窗口宽度会在 48/136 之间切换；扩窗有上限，避免结束记录时的滞后测量把窗口又撑大
  const MAX_W = 136, MAX_H = 48
  const wantWidth = Math.min(MAX_W, Math.max(48, Math.ceil(rect.x + rect.width) + 4))
  const wantHeight = Math.min(MAX_H, Math.max(48, Math.ceil(rect.y + rect.height) + 4))

  const grownTo = wantWidth > bounds.width || wantHeight > bounds.height
    ? { width: Math.max(bounds.width, wantWidth), height: Math.max(bounds.height, wantHeight) }
    : null
  const room = grownTo ?? bounds

  const x = Math.max(0, Math.floor(rect.x) - 4)
  const y = Math.max(0, Math.floor(rect.y) - 4)
  const right = Math.min(room.width, Math.ceil(rect.x + rect.width) + 4)
  const bottom = Math.min(room.height, Math.ceil(rect.y + rect.height) + 4)
  if (right <= x || bottom <= y) return null

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

test('内容超出窗口时扩窗到刚好容纳（受 136 上限约束）', () => {
  // 100 宽内容装不进 48 宽窗口 → 应扩窗
  const result = computeShape({ x: 0, y: 6, width: 100, height: 36 }, { width: 48, height: 48 })
  assert.ok(result, '超出宽度也不该丢弃')
  assert.ok(result.grownTo, '应扩窗')
  assert.equal(result.grownTo.width, 104, '刚好容纳 100px 内容（+4 边距）')
})

test('非法尺寸仍然丢弃', () => {
  assert.equal(computeShape({ x: 0, y: 0, width: 0, height: 0 }, { width: 137, height: 49 }), null)
  assert.equal(computeShape(null, { width: 137, height: 49 }), null)
  assert.equal(computeShape({ x: NaN, y: 0, width: 100, height: 36 }, { width: 137, height: 49 }), null)
})

test('扩窗有上限：不会超过计时态需要的 136x48', () => {
  // 极端越界内容也不能把窗口撑到离谱尺寸
  const result = computeShape({ x: -200, y: 0, width: 400, height: 36 }, { width: 48, height: 48 })
  assert.ok(result)
  assert.ok(result.grownTo, '应扩窗')
  assert.equal(result.grownTo.width, 136, '宽度上限 136')
  assert.equal(result.grownTo.height, 48, '高度上限 48')
})

test('回归：结束记录(136→48)时滞后测量不会把窗口又撑回 136', () => {
  // 窗口已缩回 48，但渲染端还按 136 宽的旧视口测量 → 内容看似"超出"
  const result = computeShape({ x: 0, y: 6, width: 124, height: 36 }, { width: 48, height: 48 })
  assert.ok(result, '仍要接受这次测量让 ready 恢复')
  // 关键：这次扩窗最多到内容所需宽度，不会无限撑大
  assert.ok(result.grownTo.width <= 136, `扩窗上限 136，实际 ${result.grownTo?.width}`)
})
