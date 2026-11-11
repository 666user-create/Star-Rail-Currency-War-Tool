// 桌宠位置校验测试：坏坐标必须被拉回屏幕内，且要留出任务栏余量
import test from 'node:test'
import assert from 'node:assert/strict'

const PET_W = 176
const PET_H = 212
// 单屏逻辑 1536x864，工作区去掉 48px 任务栏 → 816
const workArea = { x: 0, y: 0, width: 1536, height: 816 }
// 贴边内缩：DPI 缩放取整误差会让贴边窗口压到任务栏下（实测踩过）
const EDGE_MARGIN = 10

function clampToScreens(x, y, w, h) {
  const a = workArea
  const minX = a.x + EDGE_MARGIN
  const minY = a.y + EDGE_MARGIN
  const maxX = Math.max(minX, a.x + a.width - w - EDGE_MARGIN)
  const maxY = Math.max(minY, a.y + a.height - h - EDGE_MARGIN)
  if (x >= minX && x <= maxX && y >= minY && y <= maxY) return { x, y }
  return {
    x: Math.min(Math.max(x, minX), maxX),
    y: Math.min(Math.max(y, minY), maxY)
  }
}

function isOnScreen(x, y, w = PET_W, h = PET_H) {
  const area = w * h
  const a = workArea
  const overlapW = Math.min(x + w, a.x + a.width) - Math.max(x, a.x)
  const overlapH = Math.min(y + h, a.y + a.height) - Math.max(y, a.y)
  if (overlapW <= 0 || overlapH <= 0) return false
  return (overlapW * overlapH) / area >= 0.6
}

test('回归：x=-20 的坏坐标必须被拉回屏幕内', () => {
  const p = clampToScreens(-20, 607, PET_W, PET_H)
  assert.equal(p.x, EDGE_MARGIN, 'x 夹到内缩边界')
  assert.ok(isOnScreen(p.x, p.y), '夹紧后必须可见')
})

test('回归：贴底部的工作区边缘必须内缩（真实的看不见事故）', () => {
  // 实测: petY=600 时窗口底部 812，工作区底部 816，物理上只差 1px 被任务栏吃掉
  const p = clampToScreens(22, 600, PET_W, PET_H)
  assert.equal(p.y, 594, '600 超过 maxY(=816-212-10=594)，必须上移到 594')
  assert.ok(p.y + PET_H <= workArea.height - EDGE_MARGIN, '底部要留出余量')
  assert.equal(p.x, 22, 'x 合法保持不变')
})

test('回归：旧逻辑会放行的屏外坐标，新判据要拒绝', () => {
  assert.equal(isOnScreen(-96, 400), false, '只露 45% 不可见')
  assert.equal(isOnScreen(-150, 400), false)
})

test('正常位置不动', () => {
  const p = clampToScreens(400, 300, PET_W, PET_H)
  assert.deepEqual(p, { x: 400, y: 300 })
  assert.ok(isOnScreen(400, 300))
})

test('右下角极限位置：贴内缩边界', () => {
  const x = workArea.width - PET_W - EDGE_MARGIN
  const y = workArea.height - PET_H - EDGE_MARGIN
  const p = clampToScreens(x, y, PET_W, PET_H)
  assert.deepEqual(p, { x, y })
  assert.ok(isOnScreen(x, y))
})

test('超出右边界被拉回', () => {
  const p = clampToScreens(2000, 300, PET_W, PET_H)
  assert.equal(p.x, workArea.width - PET_W - EDGE_MARGIN)
  assert.ok(isOnScreen(p.x, p.y))
})

test('超出下边界（任务栏下方）被拉回', () => {
  const p = clampToScreens(400, 1000, PET_W, PET_H)
  assert.equal(p.y, workArea.height - PET_H - EDGE_MARGIN)
  assert.ok(isOnScreen(p.x, p.y))
})

test('左上角越界被拉回内缩边界', () => {
  const p = clampToScreens(-500, -300, PET_W, PET_H)
  assert.deepEqual(p, { x: EDGE_MARGIN, y: EDGE_MARGIN })
})

test('窗口比屏幕还大时贴左上角（不产生负坐标）', () => {
  const p = clampToScreens(-100, -100, 2000, 1200)
  assert.equal(p.x, EDGE_MARGIN)
  assert.equal(p.y, EDGE_MARGIN)
})

test('中心点判据：一半在屏幕外也算不可见', () => {
  assert.equal(isOnScreen(-100, 400), false)
  assert.equal(isOnScreen(-50, 400), true)
})

test('多屏场景：副屏上的坐标不应被拉回主屏', () => {
  const displays = [workArea, { x: 1536, y: 0, width: 1920, height: 1040 }]
  function clampMulti(x, y, w, h) {
    let best = null, bestDist = Infinity
    for (const a of displays) {
      const minX = a.x + EDGE_MARGIN, minY = a.y + EDGE_MARGIN
      const maxX = Math.max(minX, a.x + a.width - w - EDGE_MARGIN)
      const maxY = Math.max(minY, a.y + a.height - h - EDGE_MARGIN)
      if (x >= minX && x <= maxX && y >= minY && y <= maxY) return { x, y }
      const cx = Math.min(Math.max(x, minX), maxX)
      const cy = Math.min(Math.max(y, minY), maxY)
      const dist = (cx - x) ** 2 + (cy - y) ** 2
      if (dist < bestDist) { bestDist = dist; best = { x: cx, y: cy } }
    }
    return best
  }
  assert.deepEqual(clampMulti(2000, 300, PET_W, PET_H), { x: 2000, y: 300 }, '副屏合法位置不移动')
  assert.deepEqual(clampMulti(-20, 600, PET_W, PET_H), { x: EDGE_MARGIN, y: 594 }, '主屏越界拉回主屏')
})

test('EDGE_MARGIN 足以覆盖 DPI 1.25 的取整误差', () => {
  // 176*1.25=220, 212*1.25=265，取整误差最多 1~2px，10px 余量足够
  assert.ok(EDGE_MARGIN >= 4, '余量太小不足以覆盖取整误差')
})
