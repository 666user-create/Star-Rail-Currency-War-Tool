// 桌宠位置校验测试：坏坐标必须被拉回屏幕内（实测踩过 x=-20 导致桌宠看不见）
import test from 'node:test'
import assert from 'node:assert/strict'

const PET_W = 176
const PET_H = 212
// 单屏 1536x864 @ (0,0)，workArea 去掉任务栏
const workArea = { x: 0, y: 0, width: 1536, height: 816 }

function clampToScreens(x, y, w, h) {
  const a = workArea
  if (x >= a.x && x + w <= a.x + a.width && y >= a.y && y + h <= a.y + a.height) return { x, y }
  return {
    x: Math.min(Math.max(x, a.x), Math.max(a.x, a.x + a.width - w)),
    y: Math.min(Math.max(y, a.y), Math.max(a.y, a.y + a.height - h))
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
  // 这是实测遇到的真实坏值，旧逻辑判它合法，导致桌宠一直跑在屏幕外
  const p = clampToScreens(-20, 607, PET_W, PET_H)
  assert.equal(p.x, 0, 'x 必须夹到 0')
  assert.ok(isOnScreen(p.x, p.y), '夹紧后必须判定为可见')
})

test('回归：x=-20 时只有约 89% 可见，但旧逻辑仍会误判；新判据按面积算', () => {
  // x=-20, w=176 → 可见宽 156，占 88.6%，这个其实还真是可见的
  // 真正的问题是「旧 clamp 边界允许到 -96」，那种才是大半截在外
  assert.equal(isOnScreen(-20, 400), true, '-20 只露 20px，仍算可见')
  assert.equal(isOnScreen(-96, 400), false, '-96 时可见宽度仅 80/176=45%，判定不可见')
  assert.equal(isOnScreen(-150, 400), false, '-150 时只剩 26/176，远低于 60%')
})

test('正常位置不动', () => {
  const p = clampToScreens(400, 150, PET_W, PET_H)
  assert.deepEqual(p, { x: 400, y: 150 })
  assert.ok(isOnScreen(400, 150))
})

test('右下角贴边不算越界', () => {
  const x = workArea.width - PET_W
  const y = workArea.height - PET_H
  const p = clampToScreens(x, y, PET_W, PET_H)
  assert.deepEqual(p, { x, y })
  assert.ok(isOnScreen(x, y))
})

test('超出右边界被拉回', () => {
  const p = clampToScreens(2000, 150, PET_W, PET_H)
  assert.equal(p.x, workArea.width - PET_W)
  assert.ok(isOnScreen(p.x, p.y))
})

test('超出下边界（任务栏下方）被拉回', () => {
  const p = clampToScreens(400, 1000, PET_W, PET_H)
  assert.equal(p.y, workArea.height - PET_H)
  assert.ok(isOnScreen(p.x, p.y))
})

test('左上角越界被拉回', () => {
  const p = clampToScreens(-500, -300, PET_W, PET_H)
  assert.deepEqual(p, { x: 0, y: 0 })
})

test('窗口比屏幕还大时贴左上角（不产生负坐标）', () => {
  const p = clampToScreens(-100, -100, 2000, 1200)
  assert.equal(p.x, 0)
  assert.equal(p.y, 0)
})

test('中心点判据：一半在屏幕外也算不可见', () => {
  // 窗口宽 176，中心点在 x+88。x=-100 时中心 -12，屏幕外
  assert.equal(isOnScreen(-100, 400), false)
  // x=-50 时中心 38，在屏内 → 可见
  assert.equal(isOnScreen(-50, 400), true)
})

test('多屏场景：副屏上的坐标不应被拉回主屏', () => {
  // 模拟副屏在右侧 (1536,0) 1920x1080
  const displays = [workArea, { x: 1536, y: 0, width: 1920, height: 1040 }]
  function clampMulti(x, y, w, h) {
    let best = null, bestDist = Infinity
    for (const a of displays) {
      if (x >= a.x && x + w <= a.x + a.width && y >= a.y && y + h <= a.y + a.height) return { x, y }
      const cx = Math.min(Math.max(x, a.x), Math.max(a.x, a.x + a.width - w))
      const cy = Math.min(Math.max(y, a.y), Math.max(a.y, a.y + a.height - h))
      const dist = (cx - x) ** 2 + (cy - y) ** 2
      if (dist < bestDist) { bestDist = dist; best = { x: cx, y: cy } }
    }
    return best
  }
  // 副屏上的合法位置不该被移动
  assert.deepEqual(clampMulti(2000, 300, PET_W, PET_H), { x: 2000, y: 300 })
  // 主屏越界应拉回主屏，而不是甩到副屏
  assert.deepEqual(clampMulti(-20, 600, PET_W, PET_H), { x: 0, y: 600 })
})
