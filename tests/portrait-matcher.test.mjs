import test from 'node:test'
import assert from 'node:assert/strict'
import { matchPortraitPixels } from '../src/main/portraitMatcher.ts'

function pixels(width, height, color = [18, 22, 30, 255]) {
  const data = new Uint8Array(width * height * 4)
  for (let i = 0; i < data.length; i += 4) data.set(color, i)
  return { width, height, data }
}

function portrait(id, seed) {
  const image = pixels(64, 76)
  for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) {
    const index = (y * image.width + x) * 4
    image.data[index] = 120 + 100 * Math.sin(x / (8 + seed) + seed * 2)
    image.data[index + 1] = 120 + 100 * Math.sin(y / (8 + seed) + seed * 3)
    image.data[index + 2] = 120 + 100 * Math.sin((x + y) / 13 + seed * 4)
  }
  return { id, name: `角色${id}`, image }
}

function paste(image, reference, left, top, scale = 1) {
  const width = 64 * scale, height = 76 * scale
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const source = (Math.floor(y / scale) * 64 + Math.floor(x / scale)) * 4
    image.data.set(reference.image.data.subarray(source, source + 4), ((top + y) * image.width + left + x) * 4)
  }
  for (let y = top + height - 3 * scale; y < top + height; y++) for (let x = left; x < left + width; x++) image.data.set([148, 91, 219, 255], (y * image.width + x) * 4)
}

test('真正比较多色头像模板，识别一排顺序并拒绝把背景当角色', () => {
  const references = [portrait('1', 1), portrait('2', 2), portrait('3', 3)]
  const image = pixels(440, 220)
  references.forEach((reference, index) => paste(image, reference, 40 + index * 78, 35))
  const result = matchPortraitPixels(image, references)
  assert.deepEqual(result.characters.map(item => item.id), ['1', '2', '3'])
  assert(result.characters.every(item => item.score > 0.6))
  assert.equal(result.complete, true)
})

test('第二排仅一张头像仍通过主排网格定位，支持两排和缩放', () => {
  const references = [portrait('1', 1), portrait('2', 2), portrait('3', 3), portrait('4', 4)]
  for (const scale of [1, 2]) {
    const image = pixels(440 * scale, 330 * scale)
    references.slice(0, 3).forEach((reference, index) => paste(image, reference, (40 + index * 78) * scale, 35 * scale, scale))
    paste(image, references[3], 40 * scale, 140 * scale, scale)
    const result = matchPortraitPixels(image, references)
    assert.deepEqual(result.characters.map(item => item.id), ['1', '2', '3', '4'])
  }
})

test('最长后台排位于下方时，仍向上找齐前台，不能只识别后台就宣称完整', () => {
  const references = [portrait('1', 1), portrait('2', 2), portrait('3', 3), portrait('4', 4)]
  const image = pixels(440, 330)
  paste(image, references[0], 40, 35)
  references.slice(1).forEach((reference, index) => paste(image, reference, 40 + index * 78, 140))
  const result = matchPortraitPixels(image, references)
  assert.deepEqual(result.characters.map(item => item.id), ['1', '2', '3', '4'])
  assert.equal(result.complete, true)
})

test('没有模板的卡片只提示补充，不填最相似的人名', () => {
  const references = [portrait('1', 1), portrait('2', 2), portrait('3', 3)]
  const image = pixels(440, 220)
  references.forEach((reference, index) => paste(image, reference, 40 + index * 78, 35))
  paste(image, portrait('unknown', 99), 274, 35)
  const result = matchPortraitPixels(image, references)
  assert.deepEqual(result.characters.map(item => item.id), ['1', '2', '3'])
  assert.equal(result.complete, false)
  assert(result.warnings.some(message => /漏项|特殊单位|未可靠匹配/.test(message)))
})

test('两个不同名字的模板完全相同必须拒识，不能把第一项当确定结果', () => {
  const reference = portrait('1', 1)
  const identical = { ...reference, id: '2', name: '另一个角色' }
  const image = pixels(440, 220)
  for (let i = 0; i < 3; i++) paste(image, reference, 40 + i * 78, 35)
  const result = matchPortraitPixels(image, [reference, identical])
  assert.deepEqual(result.characters, [])
  assert.equal(result.complete, false)
})

test('使用归一化阵容区域时不读取其他排的角色，纯色画面不生成名单', () => {
  const references = [portrait('1', 1), portrait('2', 2), portrait('3', 3), portrait('4', 4), portrait('5', 5), portrait('6', 6)]
  const image = pixels(440, 400)
  references.slice(0, 3).forEach((reference, index) => paste(image, reference, 40 + index * 78, 35))
  references.slice(3).forEach((reference, index) => paste(image, reference, 40 + index * 78, 260))
  const result = matchPortraitPixels(image, references, { x: 0, y: 0, width: 1, height: 0.5 })
  assert.deepEqual(result.characters.map(item => item.id), ['1', '2', '3'])
  assert.deepEqual(matchPortraitPixels(pixels(440, 220), references).characters, [])
})
