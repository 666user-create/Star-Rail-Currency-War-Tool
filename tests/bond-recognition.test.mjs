import test from 'node:test'
import assert from 'node:assert/strict'
import { createBondTemplate, matchBondIcons, bondCountFromWords, extractBondCountGlyph } from '../src/main/bondImageMatcher.ts'

// 自行生成的简单几何形状，仅测试识别与弃权行为，不含游戏图标或截图字节。
function icon(shape) {
  const width = 64, height = 64, data = new Uint8Array(width * height * 4)
  for (let y = 8; y < 56; y++) for (let x = 8; x < 56; x++) {
    const dx = x - 31.5, dy = y - 31.5
    const on = shape === 'cross' ? Math.abs(dx) < 7 || Math.abs(dy) < 7 : shape === 'ring' ? dx * dx + dy * dy < 23 ** 2 && dx * dx + dy * dy > 13 ** 2 : Math.abs(dx) + Math.abs(dy) < 24
    if (on) data.set([255, 255, 255, 255], (y * width + x) * 4)
  }
  return { width, height, data }
}
const icons = ['cross', 'ring', 'diamond'].map(icon)
const templates = icons.map((image, index) => createBondTemplate(`shape-${index}`, `形状${index}`, image))

function scene(positions, width = 640, height = 360) {
  const data = new Uint8Array(width * height * 4)
  for (let i = 0; i < width * height; i++) data.set([25, 28, 32, 255], i * 4)
  for (const { index, x, y, size = 42 } of positions) {
    const source = icons[index]
    for (let py = 0; py < size; py++) for (let px = 0; px < size; px++) {
      const si = (Math.floor(py / size * 64) * 64 + Math.floor(px / size * 64)) * 4
      if (source.data[si + 3] && x + px < width && y + py < height) data.set([248, 247, 245, 255], ((y + py) * width + x + px) * 4)
    }
  }
  return { width, height, data }
}

test('独立模板仅从透明轮廓生成，空图与无效像素拒绝匹配', () => {
  assert.equal(templates.length, 3)
  assert(templates.every(Boolean))
  assert.equal(createBondTemplate('empty', '空', { width: 1, height: 1, data: new Uint8Array(4) }), null)
  assert.deepEqual(matchBondIcons({ width: 640, height: 360, data: new Uint8Array(8) }, templates), [])
})

test('截图位置与缩放变化后仍按图案识别同一行，不依赖文件名', () => {
  for (const offset of [0, 17]) {
    const image = scene([0, 1, 2].map(index => ({ index, x: 250 + offset + index * 85, y: 91 + offset, size: 42 })))
    const matches = matchBondIcons(image, templates)
    assert.deepEqual(matches.map(match => match.id), ['shape-0', 'shape-1', 'shape-2'])
    assert(matches.every(match => match.score > 0.8 && match.count === null))
  }
})

test('没有已知羁绊行时不会把孤立图案或竖版总览当作完整羁绊', () => {
  assert.deepEqual(matchBondIcons(scene([{ index: 0, x: 280, y: 100 }]), templates), [])
  const vertical = scene([{ index: 0, x: 280, y: 100 }], 640, 1000)
  assert.deepEqual(matchBondIcons(vertical, templates), [])
})

test('可信的归一化区域可在裁图中识别单个图案，并限制区域外干扰', () => {
  const image = scene([{ index: 0, x: 260, y: 96 }, { index: 1, x: 430, y: 120 }])
  const matches = matchBondIcons(image, templates, { bonds: { x: 0.39, y: 0.24, width: 0.12, height: 0.19 } })
  assert.deepEqual(matches.map(match => match.id), ['shape-0'])
})

test('数量只取图案右下角独立数字词，空缺和远处数字均不猜测', () => {
  const rect = { x: 0.4, y: 0.25, width: 0.05, height: 0.1 }
  const number = { x: 0.447, y: 0.353, width: 0.012, height: 0.03, text: '10' }
  assert.equal(bondCountFromWords(rect, [number]), 10)
  assert.equal(bondCountFromWords(rect, [{ ...number, text: '1 0' }]), 10)
  assert.equal(bondCountFromWords(rect, [{ ...number, x: 0.8 }]), null)
  assert.equal(bondCountFromWords(rect, [{ ...number, text: 'O' }]), null)
  assert.equal(bondCountFromWords(rect, [{ ...number, text: '0' }]), null)
  assert.equal(bondCountFromWords(rect, []), null)
})

test('相近位置数量词互相矛盾时弃权，不按扫描顺序选值', () => {
  const rect = { x: 0.4, y: 0.25, width: 0.05, height: 0.1 }
  const number = { x: 0.447, y: 0.353, width: 0.012, height: 0.03 }
  assert.equal(bondCountFromWords(rect, [{ ...number, text: '2' }, { ...number, text: '3' }]), null)
})

test('右下数字裁剪不会从空白、实心块或微小噪声生成数量候选', () => {
  const rect = { x: 0.4, y: 0.25, width: 0.05, height: 0.1 }
  const blank = scene([])
  assert.equal(extractBondCountGlyph(blank, rect), null)
  const block = scene([])
  for (let y = 126; y < 143; y++) for (let x = 279; x < 289; x++) block.data.set([255, 255, 255, 255], (y * block.width + x) * 4)
  assert.equal(extractBondCountGlyph(block, rect), null)
  const noise = scene([])
  for (let y = 132; y < 135; y++) for (let x = 282; x < 284; x++) noise.data.set([255, 255, 255, 255], (y * noise.width + x) * 4)
  assert.equal(extractBondCountGlyph(noise, rect), null)
})
