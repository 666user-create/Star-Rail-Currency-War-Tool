import test from 'node:test'
import assert from 'node:assert/strict'
import { placeBubble } from '../src/shared/bubblePlacement.ts'

const screen = { x: 0, y: 0, width: 1920, height: 1080 }
const size = { width: 224, height: 120 }

function assertFits(placement, pet, area, gap = 10) {
  assert(placement.width > 0 && placement.height > 0)
  for (const value of Object.values(placement).filter(v => typeof v === 'number')) assert(Number.isFinite(value))
  assert(placement.x >= area.x && placement.y >= area.y)
  assert(placement.x + placement.width <= area.x + area.width)
  assert(placement.y + placement.height <= area.y + area.height)
  assert(placement.x + placement.width + gap <= pet.x || placement.x >= pet.x + pet.width + gap ||
    placement.y + placement.height + gap <= pet.y || placement.y >= pet.y + pet.height + gap,
  '气泡与整只桌宠之间保留间距，不能只避开静止时的脸')
}

function assertAvoids(placement, obstacle, gap = 10) {
  assert(placement.x + placement.width + gap <= obstacle.x || placement.x >= obstacle.x + obstacle.width + gap ||
    placement.y + placement.height + gap <= obstacle.y || placement.y >= obstacle.y + obstacle.height + gap,
  '气泡不能遮挡计时表，并在两者之间保留间距')
}

test('空间充足时放右侧，右侧不足则换到左侧', () => {
  for (const [x, side] of [[600, 'right'], [1740, 'left']]) {
    const pet = { x, y: 400, width: 176, height: 212 }
    const placed = placeBubble(pet, size, screen)
    assert.equal(placed.side, side)
    assert.deepEqual({ width: placed.width, height: placed.height }, size)
    assertFits(placed, pet, screen)
  }
})

test('桌宠贴近四角时，气泡完整留在屏幕内且不压住桌宠', () => {
  for (const x of [0, screen.width - 176]) {
    for (const y of [0, screen.height - 212]) {
      const pet = { x, y, width: 176, height: 212 }
      assertFits(placeBubble(pet, size, screen), pet, screen)
    }
  }
})

test('副屏负坐标与部分屏外的桌宠均按对应工作区布局', () => {
  const area = { x: -1920, y: -200, width: 1920, height: 1080 }
  for (const pet of [
    { x: -1870, y: 650, width: 176, height: 212 },
    { x: -1990, y: -240, width: 176, height: 212 },
    { x: -120, y: 500, width: 176, height: 212 }
  ]) assertFits(placeBubble(pet, size, area), pet, area)
})

test('窄屏左右放不下时先放上方；贴顶时改放下方', () => {
  const area = { x: 0, y: 0, width: 360, height: 800 }
  for (const [y, side] of [[300, 'above'], [0, 'below']]) {
    const pet = { x: 90, y, width: 176, height: 212 }
    const placed = placeBubble(pet, size, area)
    assert.equal(placed.side, side)
    assert.equal(placed.width, size.width)
    assertFits(placed, pet, area)
  }
})

test('没有方向能容纳完整气泡时缩小到最大可用区域，仍不覆盖桌宠', () => {
  const area = { x: 0, y: 0, width: 300, height: 300 }
  const pet = { x: 90, y: 100, width: 176, height: 100 }
  const placed = placeBubble(pet, { width: 224, height: 170 }, area)
  assert.equal(placed.side, 'above')
  assert.equal(placed.width, 224)
  assert.equal(placed.height, 90)
  assertFits(placed, pet, area)
})

test('小数坐标向安全方向取整，气泡与桌宠之间仍有完整间距', () => {
  const area = { x: -400.5, y: -100.2, width: 1000.8, height: 700.6 }
  const pet = { x: -100.4, y: 400.3, width: 176.4, height: 120.2 }
  const placed = placeBubble(pet, { width: 224.4, height: 100.1 }, area, 10.2)
  assert(Object.values(placed).filter(v => typeof v === 'number').every(Number.isInteger))
  assertFits(placed, pet, area, 10.2)
})

test('屏幕没有空闲区域时返回零尺寸供调用方隐藏，不强行盖在模型上', () => {
  const area = { x: 0, y: 0, width: 100, height: 100 }
  const placed = placeBubble(area, size, area)
  assert.equal(placed.width, 0)
  assert.equal(placed.height, 0)
})

test('无效尺寸和非有限输入不会传出 NaN/Infinity', () => {
  const pet = { x: 600, y: 400, width: 176, height: 212 }
  for (const [p, s, area] of [
    [{ ...pet, x: NaN }, size, screen],
    [pet, { width: Infinity, height: 120 }, screen],
    [pet, { width: 0, height: 120 }, screen],
    [pet, size, { ...screen, width: -1 }],
    [pet, size, { ...screen, x: Infinity }]
  ]) {
    const placed = placeBubble(p, s, area)
    assert.equal(placed.width, 0)
    assert.equal(placed.height, 0)
    assert(Object.values(placed).filter(v => typeof v === 'number').every(Number.isFinite))
  }
  assertFits(placeBubble(pet, size, screen, NaN), pet, screen)
})

test('正上方计时表不影响原来的右侧气泡位置', () => {
  const pet = { x: 600, y: 400, width: 176, height: 212 }
  const original = placeBubble(pet, size, screen)
  for (const width of [120, 136]) {
    const timer = { x: pet.x + (pet.width - width) / 2, y: 344, width, height: 48 }
    const placed = placeBubble(pet, size, screen, 10, [timer])
    assert.deepEqual(placed, original)
    assertFits(placed, pet, screen)
    assertAvoids(placed, timer)
  }
})

test('贴顶时气泡在侧方计时表下方就近避让，展开计时后仍留有间距', () => {
  const pet = { x: 600, y: 0, width: 176, height: 212 }
  for (const width of [120, 136]) {
    const timer = { x: 784, y: 0, width, height: 48 }
    const placed = placeBubble(pet, size, screen, 10, [timer])
    assert.equal(placed.side, 'right')
    assert.equal(placed.x, 786, '优先稍微下移，不无故远离桌宠')
    assert.equal(placed.y, 58)
    assertFits(placed, pet, screen)
    assertAvoids(placed, timer)
  }
})

test('右上角的左侧计时表与气泡一起保持在屏内且不重叠', () => {
  const pet = { x: 1744, y: 0, width: 176, height: 212 }
  const timer = { x: 1600, y: 0, width: 136, height: 48 }
  const placed = placeBubble(pet, size, screen, 10, [timer])
  assert.equal(placed.side, 'left')
  assert.equal(placed.y, 58)
  assertFits(placed, pet, screen)
  assertAvoids(placed, timer)
})

test('窄屏两侧不足时，气泡可放到头顶计时表更上方', () => {
  const area = { x: 0, y: 0, width: 360, height: 800 }
  const pet = { x: 90, y: 300, width: 176, height: 212 }
  const timer = { x: 118, y: 244, width: 120, height: 48 }
  const placed = placeBubble(pet, size, area, 10, [timer])
  assert.equal(placed.side, 'above')
  assert.equal(placed.width, size.width)
  assert.equal(placed.height, size.height)
  assertFits(placed, pet, area)
  assertAvoids(placed, timer)
})

test('右侧只剩窄缝时，优先去可完整显示的左侧', () => {
  const pet = { x: 600, y: 400, width: 176, height: 212 }
  const obstacle = { x: 850, y: 0, width: 1070, height: 1080 }
  const placed = placeBubble(pet, size, screen, 10, [obstacle])
  assert.equal(placed.side, 'left')
  assert.equal(placed.width, size.width)
  assert.equal(placed.height, size.height)
  assertFits(placed, pet, screen)
  assertAvoids(placed, obstacle)
})

test('多个障碍共同避让，不把完整空区切碎成过窄的格子', () => {
  const area = { x: 0, y: 0, width: 600, height: 600 }
  const pet = { x: 0, y: 200, width: 176, height: 212 }
  const obstacles = [
    { x: 186, y: 210, width: 224, height: 80 },
    { x: 340, y: 80, width: 160, height: 170 }
  ]
  const placed = placeBubble(pet, size, area, 10, obstacles)
  assert.equal(placed.side, 'right')
  assert.equal(placed.width, size.width)
  assert.equal(placed.height, size.height)
  assertFits(placed, pet, area)
  for (const obstacle of obstacles) assertAvoids(placed, obstacle)
})

test('障碍后的缩小布局按最大可见面积选区，不坚持已被占用的上方', () => {
  const area = { x: 0, y: 0, width: 300, height: 300 }
  const pet = { x: 90, y: 100, width: 176, height: 100 }
  const obstacle = { x: 0, y: 0, width: 140, height: 90 }
  const placed = placeBubble(pet, { width: 224, height: 170 }, area, 10, [obstacle])
  assert.equal(placed.side, 'below')
  assert.equal(placed.width, 224)
  assert.equal(placed.height, 90)
  assertFits(placed, pet, area)
  assertAvoids(placed, obstacle)
})

test('副屏负坐标与小数计时表边界都保守避让', () => {
  const area = { x: -1920.5, y: -200.2, width: 1920.3, height: 1080.6 }
  const pet = { x: -1400.3, y: -199.7, width: 176.2, height: 212.1 }
  const timer = { x: -1215.2, y: -199.7, width: 136.4, height: 48.2 }
  const placed = placeBubble(pet, size, area, 10.2, [timer])
  assertFits(placed, pet, area, 10.2)
  assertAvoids(placed, timer, 10.2)
  assert(Object.values(placed).filter(value => typeof value === 'number').every(Number.isInteger))
})

test('障碍堵住全部空区时隐藏，不强行压住计时表', () => {
  const area = { x: 0, y: 0, width: 360, height: 360 }
  const pet = { x: 92, y: 100, width: 176, height: 160 }
  const placed = placeBubble(pet, size, area, 10, [area])
  assert.equal(placed.width, 0)
  assert.equal(placed.height, 0)
})

test('非法或远离工作区的障碍不改变原布局', () => {
  const pet = { x: 600, y: 400, width: 176, height: 212 }
  const placed = placeBubble(pet, size, screen, 10, [
    null,
    { x: NaN, y: 0, width: 100, height: 100 },
    { x: 0, y: 0, width: 0, height: 100 },
    { x: 1e308, y: 0, width: 1e308, height: 100 },
    { x: -1000, y: -1000, width: 100, height: 100 }
  ])
  assert.deepEqual(placed, placeBubble(pet, size, screen))
})
