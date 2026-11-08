/** 羁绊白色图案的离线轮廓比对。输入仅为单张已选截图与本地公开图标缓存。 */
export interface BondBitmap { width: number; height: number; data: Uint8Array }
export interface BondRect { x: number; y: number; width: number; height: number }
export interface BondRegions {
  bonds?: BondRect
  lineup?: BondRect
  counts?: Array<BondRect & { text: string }>
}
export interface BondTemplate {
  id: string
  name: string
  mask: Float32Array
}
export interface BondIconMatch { id: string; name: string; count: number | null; score: number; rect: BondRect }
export interface BondCountGlyph { width: number; height: number; pixels: string; rect: BondRect }

interface Component extends BondRect { area: number }
const SIZE = 32
const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value))

function trim(mask: Uint8Array | Float32Array, width: number, height: number, box: BondRect): BondRect | null {
  let x0 = width, y0 = height, x1 = -1, y1 = -1
  for (let y = Math.max(0, box.y); y < Math.min(height, box.y + box.height); y++) {
    for (let x = Math.max(0, box.x); x < Math.min(width, box.x + box.width); x++) {
      if (mask[y * width + x] <= 0.25) continue
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y)
    }
  }
  return x1 >= x0 ? { x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 } : null
}

function descriptor(mask: Uint8Array | Float32Array, width: number, height: number, box: BondRect): Float32Array {
  const output = new Float32Array(SIZE * SIZE)
  const scale = (SIZE - 4) / Math.max(box.width, box.height)
  const drawW = box.width * scale, drawH = box.height * scale
  const left = (SIZE - drawW) / 2, top = (SIZE - drawH) / 2
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    const sx = box.x + (x + 0.5 - left) / scale - 0.5
    const sy = box.y + (y + 0.5 - top) / scale - 0.5
    if (sx < box.x - 0.5 || sy < box.y - 0.5 || sx >= box.x + box.width - 0.5 || sy >= box.y + box.height - 0.5) continue
    const x0 = Math.floor(sx), y0 = Math.floor(sy), fx = sx - x0, fy = sy - y0
    const at = (xx: number, yy: number) => xx >= box.x && yy >= box.y && xx < box.x + box.width && yy < box.y + box.height && xx < width && yy < height ? mask[yy * width + xx] : 0
    output[y * SIZE + x] = at(x0, y0) * (1 - fx) * (1 - fy) + at(x0 + 1, y0) * fx * (1 - fy) + at(x0, y0 + 1) * (1 - fx) * fy + at(x0 + 1, y0 + 1) * fx * fy
  }
  return output
}

/** 只使用透明度，因此 Windows BGRA 与其他平台 RGBA 均可输入。 */
export function createBondTemplate(id: string, name: string, image: BondBitmap): BondTemplate | null {
  if (image.width <= 0 || image.height <= 0 || image.data.length !== image.width * image.height * 4) return null
  const alpha = new Float32Array(image.width * image.height)
  for (let i = 0; i < alpha.length; i++) alpha[i] = image.data[i * 4 + 3] / 255
  const box = trim(alpha, image.width, image.height, { x: 0, y: 0, width: image.width, height: image.height })
  return box ? { id, name, mask: descriptor(alpha, image.width, image.height, box) } : null
}

function similarity(a: Float32Array, b: Float32Array): number {
  let best = 0
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    let overlap = 0, sum = 0
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
      const av = a[y * SIZE + x]
      const bx = x + dx, by = y + dy
      const bv = bx >= 0 && by >= 0 && bx < SIZE && by < SIZE ? b[by * SIZE + bx] : 0
      overlap += Math.min(av, bv); sum += av + bv
    }
    best = Math.max(best, sum ? 2 * overlap / sum : 0)
  }
  return best
}

function components(mask: Uint8Array, width: number, height: number, box: BondRect): Component[] {
  const seen = new Uint8Array(mask.length), output: Component[] = []
  const queue = new Int32Array(mask.length)
  for (let y = box.y; y < box.y + box.height; y++) for (let x = box.x; x < box.x + box.width; x++) {
    const index = y * width + x
    if (!mask[index] || seen[index]) continue
    let head = 0, tail = 1, x0 = x, x1 = x, y0 = y, y1 = y
    queue[0] = index; seen[index] = 1
    while (head < tail) {
      const p = queue[head++], px = p % width, py = Math.floor(p / width)
      x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py)
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
        const nx = px + ox, ny = py + oy, ni = ny * width + nx
        if (nx < box.x || ny < box.y || nx >= box.x + box.width || ny >= box.y + box.height || seen[ni] || !mask[ni]) continue
        seen[ni] = 1; queue[tail++] = ni
      }
    }
    output.push({ x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1, area: tail })
  }
  return output
}

function normalizedRegion(region: BondRect | undefined, width: number, height: number): BondRect | null {
  if (!region || ![region.x, region.y, region.width, region.height].every(Number.isFinite) || region.width <= 0 || region.height <= 0) return null
  const x = Math.floor(clamp(region.x, 0, 1) * width), y = Math.floor(clamp(region.y, 0, 1) * height)
  const right = Math.ceil(clamp(region.x + region.width, 0, 1) * width), bottom = Math.ceil(clamp(region.y + region.height, 0, 1) * height)
  return right > x && bottom > y ? { x, y, width: right - x, height: bottom - y } : null
}

/** 数量仅接纳图标右下独立数字词；不以角色数量、羁绊层数或文件名推测。 */
export function bondCountFromWords(rect: BondRect, words: BondRegions['counts']): number | null {
  if (![rect.x, rect.y, rect.width, rect.height].every(Number.isFinite) || rect.width <= 0 || rect.height <= 0) return null
  const candidates = (words ?? []).flatMap((word) => {
    const text = word.text.replace(/\s/g, '')
    if (!/^\d{1,2}$/.test(text) || ![word.x, word.y, word.width, word.height].every(Number.isFinite) || word.width <= 0 || word.height <= 0) return []
    const x = word.x + word.width / 2, y = word.y + word.height / 2
    const dx = (x - rect.x) / rect.width, dy = (y - rect.y) / rect.height
    if (dx < 0.65 || dx > 1.65 || dy < 0.8 || dy > 1.7 || word.height > rect.height * 0.9) return []
    const count = Number(text)
    if (count <= 0 || count > 99) return []
    return [{ count, distance: (dx - 1.05) ** 2 + (dy - 1.18) ** 2 }]
  }).sort((a, b) => a.distance - b.distance)
  if (!candidates.length || (candidates.length > 1 && Math.abs(candidates[1].distance - candidates[0].distance) < 0.03 && candidates[1].count !== candidates[0].count)) return null
  return candidates[0].count
}

/** 提取真实图案右下圆圈内的白色数字笔画，不绘制或推测数字。 */
export function extractBondCountGlyph(image: BondBitmap, rect: BondRect): BondCountGlyph | null {
  const { width, height, data } = image
  if (width <= 0 || height <= 0 || data.length !== width * height * 4 || ![rect.x, rect.y, rect.width, rect.height].every(Number.isFinite) || rect.width <= 0 || rect.height <= 0) return null
  const x = rect.x * width, y = rect.y * height, w = rect.width * width, h = rect.height * height
  const left = Math.max(0, Math.round(x + w * 0.6)), top = Math.max(0, Math.round(y + h * 0.7))
  const right = Math.min(width, Math.round(x + w * 1.7)), bottom = Math.min(height, Math.round(y + h * 1.75))
  const cw = right - left, ch = bottom - top
  if (cw < 5 || ch < 8 || cw > 180 || ch > 180) return null
  const mask = new Uint8Array(cw * ch)
  for (let py = 0; py < ch; py++) for (let px = 0; px < cw; px++) {
    const i = ((top + py) * width + left + px) * 4
    if (Math.min(data[i], data[i + 1], data[i + 2]) > 185 && data[i + 3] > 128) mask[py * cw + px] = 1
  }
  const parts = components(mask, cw, ch, { x: 0, y: 0, width: cw, height: ch }).filter((part) => {
    const centerY = top + part.y + part.height / 2
    return part.height >= Math.max(8, h * 0.23) && part.height <= h * 0.8 && part.width <= h * 0.9 && centerY > y + h * 0.87 && centerY < y + h * 1.65
  }).map((part) => ({ ...part, distance: ((left + part.x + part.width / 2 - x - w * 1.05) / h) ** 2 + ((top + part.y + part.height / 2 - y - h * 1.18) / h) ** 2 })).sort((a, b) => a.distance - b.distance)
  const seed = parts[0]
  if (!seed || seed.distance > 0.25) return null
  const picked = parts.filter((part) => Math.abs(part.y + part.height - seed.y - seed.height) < h * 0.16 && part.height > seed.height * 0.65 && part.height < seed.height * 1.4 && Math.abs(part.x + part.width / 2 - seed.x - seed.width / 2) < h * 0.7)
  if (!picked.length || picked.length > 2) return null
  const bx = Math.min(...picked.map((part) => part.x)), by = Math.min(...picked.map((part) => part.y))
  const br = Math.max(...picked.map((part) => part.x + part.width)), bb = Math.max(...picked.map((part) => part.y + part.height))
  const glyphWidth = br - bx, glyphHeight = bb - by
  if (glyphHeight < 8 || glyphWidth / glyphHeight < 0.1 || glyphWidth / glyphHeight > 1.7) return null
  let pixels = '', ink = 0
  for (let py = by; py < bb; py++) for (let px = bx; px < br; px++) {
    const on = mask[py * cw + px] && picked.some((part) => px >= part.x && py >= part.y && px < part.x + part.width && py < part.y + part.height)
    pixels += on ? '1' : '0'; if (on) ink++
  }
  if (ink < 12 || ink / pixels.length < 0.12 || ink / pixels.length > 0.85) return null
  return { width: glyphWidth, height: glyphHeight, pixels, rect: { x: (left + bx) / width, y: (top + by) / height, width: glyphWidth / width, height: glyphHeight / height } }
}

export function matchBondIcons(image: BondBitmap, templates: BondTemplate[], regions: BondRegions = {}): BondIconMatch[] {
  const { width, height, data } = image
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0 || width * height > 40_000_000 || data.length !== width * height * 4 || !templates.length) return []
  const explicit = normalizedRegion(regions.bonds, width, height)
  // 总览/手机战绩卡没有该羁绊横栏；无有效锚点时不扫描整张长图。
  if (!explicit && width / height < 1.15) return []
  const box = explicit ?? { x: Math.floor(width * 0.35), y: Math.floor(height * 0.12), width: Math.floor(width * 0.61), height: Math.floor(height * 0.4) }
  const white = new Uint8Array(width * height), expanded = new Uint8Array(width * height)
  for (let y = box.y; y < Math.min(height, box.y + box.height); y++) for (let x = box.x; x < Math.min(width, box.x + box.width); x++) {
    const i = (y * width + x) * 4
    const low = Math.min(data[i], data[i + 1], data[i + 2]), high = Math.max(data[i], data[i + 1], data[i + 2])
    if (low > 186 && high - low < 62 && data[i + 3] > 128) white[y * width + x] = 1
  }
  // 小幅膨胀仅用于把同一个图案的分离笔画连起来；比对仍使用原始白色像素。
  const radius = 1
  for (let y = box.y; y < box.y + box.height; y++) for (let x = box.x; x < box.x + box.width; x++) {
    if (!white[y * width + x]) continue
    for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
      const nx = x + dx, ny = y + dy
      if (nx >= box.x && ny >= box.y && nx < box.x + box.width && ny < box.y + box.height) expanded[ny * width + nx] = 1
    }
  }
  const possible: BondIconMatch[] = []
  for (const component of components(expanded, width, height, box)) {
    if (component.width < 8 || component.height < 9 || component.width > width * 0.1 || component.height > width * 0.1 || component.width / component.height < 0.4 || component.width / component.height > 1.85) continue
    const crop = trim(white, width, height, component)
    if (!crop || crop.width < 6 || crop.height < 7) continue
    const mask = descriptor(white, width, height, crop)
    const scores = templates.map((template) => ({ template, score: similarity(mask, template.mask) })).sort((a, b) => b.score - a.score)
    const best = scores[0], runner = scores[1]?.score ?? 0
    if (best.score < 0.76 || best.score - runner < 0.045) continue
    const rect = { x: crop.x / width, y: crop.y / height, width: crop.width / width, height: crop.height / height }
    possible.push({ id: best.template.id, name: best.template.name, score: Number(best.score.toFixed(4)), rect, count: null })
  }
  // 同行的多个菱形徽章才构成羁绊栏，避免把装备、正文字符或策略图标当成羁绊。
  const groups = possible.map((anchor) => possible.filter((candidate) => Math.abs((candidate.rect.y + candidate.rect.height / 2) - (anchor.rect.y + anchor.rect.height / 2)) < Math.max(anchor.rect.height, candidate.rect.height) * 0.42))
  groups.sort((a, b) => new Set(b.map((value) => value.id)).size - new Set(a.map((value) => value.id)).size || b.reduce((sum, value) => sum + value.score, 0) - a.reduce((sum, value) => sum + value.score, 0))
  const group = groups[0] ?? []
  // 已确认同行图案后，以重复间距补看连着数量、发光边框的格子；仍须通过轮廓与次优差距校验。
  const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]
  if (group.length >= 3) {
    const ordered = [...group].sort((a, b) => a.rect.x - b.rect.x)
    const glyph = median(ordered.map((value) => Math.max(value.rect.width * width, value.rect.height * height)))
    const centers = ordered.map((value) => (value.rect.x + value.rect.width / 2) * width)
    const differences = centers.slice(1).map((value, index) => value - centers[index]).filter((value) => value > glyph * 0.8)
    const pitches = differences.flatMap((difference) => [1, 2, 3, 4, 5].map((divisor) => difference / divisor)).filter((value) => value > glyph * 1.7 && value < glyph * 3.3)
    pitches.sort((a, b) => {
      const cost = (pitch: number) => differences.reduce((sum, difference) => sum + Math.abs(difference / pitch - Math.round(difference / pitch)), 0) + Math.abs(pitch / glyph - 2.4) * 0.025
      return cost(a) - cost(b)
    })
    const pitch = pitches[0]
    const centerY = median(ordered.map((value) => (value.rect.y + value.rect.height / 2) * height))
    if (pitch) for (let n = Math.floor((box.x - centers[0]) / pitch); n <= Math.ceil((box.x + box.width - centers[0]) / pitch); n++) {
      const centerX = centers[0] + n * pitch
      if (centerX < box.x || centerX >= box.x + box.width || ordered.some((value) => Math.abs((value.rect.x + value.rect.width / 2) * width - centerX) < glyph * 0.55)) continue
      let found: BondIconMatch | undefined
      for (const scale of [0.9, 1, 1.12]) for (const offsetY of [-0.08, 0, 0.08]) {
        const side = Math.max(8, Math.round(glyph * scale)), patch = new Uint8Array(side * side)
        const left = Math.round(centerX - side / 2), top = Math.round(centerY + glyph * offsetY - side / 2)
        for (let py = 0; py < side; py++) for (let px = 0; px < side; px++) {
          const sx = left + px, sy = top + py
          if (sx >= 0 && sy >= 0 && sx < width && sy < height && !(px > side * 0.78 && py > side * 0.78)) patch[py * side + px] = white[sy * width + sx]
        }
        const crop = trim(patch, side, side, { x: 0, y: 0, width: side, height: side })
        if (!crop || crop.width < side * 0.5 || crop.height < side * 0.5) continue
        const mask = descriptor(patch, side, side, crop)
        const scores = templates.map((template) => ({ template, score: similarity(mask, template.mask) })).sort((a, b) => b.score - a.score)
        const best = scores[0]
        if (best.score < 0.79 || best.score - (scores[1]?.score ?? 0) < 0.06 || (found && found.score >= best.score)) continue
        const rect = { x: (left + crop.x) / width, y: (top + crop.y) / height, width: crop.width / width, height: crop.height / height }
        found = { id: best.template.id, name: best.template.name, score: Number(best.score.toFixed(4)), rect, count: null }
      }
      if (found) group.push(found)
    }
  }
  const unique = [...new Map(group.sort((a, b) => a.score - b.score).map((match) => [match.id, match])).values()]
  if (unique.length < (explicit ? 1 : 3)) return []
  return unique.sort((a, b) => a.rect.x - b.rect.x)
}
