import test from 'node:test'
import assert from 'node:assert/strict'
import { placeTimer } from '../src/shared/timerPlacement.ts'

const screen = { x: 0, y: 0, width: 1920, height: 1080 }
const size = { width: 120, height: 48 }

function assertFits(placement, pet, area, gap = 8) {
  assert.equal(placement.width, Math.ceil(size.width), '按钮保留完整宽度')
  assert.equal(placement.height, Math.ceil(size.height), '按钮保留完整高度')
  assert(Object.values(placement).filter(value => typeof value === 'number').every(Number.isInteger))
  assert(placement.x >= area.x && placement.y >= area.y)
  assert(placement.x + placement.width <= area.x + area.width)
  assert(placement.y + placement.height <= area.y + area.height)
  assert(placement.x + placement.width + gap <= pet.x || placement.x >= pet.x + pet.width + gap ||
    placement.y + placement.height + gap <= pet.y || placement.y >= pet.y + pet.height + gap,
  '整个计时表与桌宠保留间距，跳起时也不共用区域')
}

test('正常居中悬在桌宠正上方，窗口底边与桌宠顶边相隔8DIP', () => {
  const pet = { x: 500, y: 400, width: 176, height: 212 }
  const placed = placeTimer(pet, size, screen)
  assert.deepEqual(placed, { side: 'above', x: 528, y: 344, width: 120, height: 48 })
  assertFits(placed, pet, screen)
})

test('贴顶时优先侧方，靠右角则自动改放左侧', () => {
  for (const [x, side] of [[600, 'right'], [1744, 'left']]) {
    const pet = { x, y: 0, width: 176, height: 212 }
    const placed = placeTimer(pet, size, screen)
    assert.equal(placed.side, side)
    assertFits(placed, pet, screen)
  }
})

test('窄屏贴顶且两侧放不下时，改放下方完整显示', () => {
  const area = { x: 0, y: 0, width: 200, height: 800 }
  const pet = { x: 12, y: 0, width: 176, height: 212 }
  const placed = placeTimer(pet, size, area)
  assert.equal(placed.side, 'below')
  assert.equal(placed.x, 40)
  assert.equal(placed.y, 220)
  assertFits(placed, pet, area)
})

test('四角与边缘夹紧不挤进桌宠，不把停止按钮推到屏外', () => {
  for (const x of [0, 20, screen.width - 196, screen.width - 176]) {
    for (const y of [0, 20, screen.height - 212]) {
      const pet = { x, y, width: 176, height: 212 }
      assertFits(placeTimer(pet, size, screen), pet, screen)
    }
  }
})

test('负坐标副屏及部分屏外桌宠仍按传入工作区布局', () => {
  const area = { x: -1920, y: -200, width: 1920, height: 1080 }
  for (const pet of [
    { x: -1870, y: 650, width: 176, height: 212 },
    { x: -1990, y: -240, width: 176, height: 212 },
    { x: -120, y: 500, width: 176, height: 212 }
  ]) assertFits(placeTimer(pet, size, area), pet, area)
})

test('小数DPI坐标保守取整，完整保留请求间距', () => {
  const area = { x: -400.5, y: -100.2, width: 1000.8, height: 700.6 }
  const pet = { x: -100.4, y: 400.3, width: 176.4, height: 120.2 }
  const placed = placeTimer(pet, size, area, 8.2)
  assert.equal(placed.side, 'above')
  assertFits(placed, pet, area, 8.2)
})

test('请求宽度变化仍以上方桌宠中心为锚点，屏边才夹紧', () => {
  const pet = { x: 500, y: 400, width: 176, height: 212 }
  const compact = placeTimer(pet, { width: 40, height: 48 }, screen)
  const expanded = placeTimer(pet, size, screen)
  assert.equal(compact.x + compact.width / 2, pet.x + pet.width / 2)
  assert.equal(expanded.x + expanded.width / 2, pet.x + pet.width / 2)
  assert.equal(compact.y, expanded.y)
})

test('四向均无完整空间时返回零尺寸，不压缩或覆盖按钮', () => {
  const area = { x: 0, y: 0, width: 300, height: 300 }
  const pet = { x: 62, y: 36, width: 176, height: 228 }
  for (const p of [pet, area]) {
    const placed = placeTimer(p, size, area)
    assert.equal(placed.width, 0)
    assert.equal(placed.height, 0)
  }
})

test('无效尺寸、非有限和溢出输入均返回有限的零尺寸', () => {
  const pet = { x: 500, y: 400, width: 176, height: 212 }
  for (const [p, s, area] of [
    [{ ...pet, x: NaN }, size, screen],
    [{ ...pet, width: 0 }, size, screen],
    [{ ...pet, height: -1 }, size, screen],
    [{ ...pet, x: 1e308, width: 1e308 }, size, screen],
    [pet, { width: Infinity, height: 48 }, screen],
    [pet, { width: 0, height: 48 }, screen],
    [pet, size, { ...screen, width: -1 }],
    [pet, size, { ...screen, x: Infinity }],
    [pet, size, { ...screen, x: 1e308, width: 1e308 }]
  ]) {
    const placed = placeTimer(p, s, area)
    assert.equal(placed.width, 0)
    assert.equal(placed.height, 0)
    assert(Object.values(placed).filter(value => typeof value === 'number').every(Number.isFinite))
  }
  assertFits(placeTimer(pet, size, screen, NaN), pet, screen)
  assertFits(placeTimer(pet, size, screen, Infinity), pet, screen)
})
