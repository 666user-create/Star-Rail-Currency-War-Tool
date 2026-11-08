/** 纯像素匹配：不访问文件、网络或屏幕，便于离线验证与复用。 */
export interface PortraitPixels { width: number; height: number; data: Uint8Array }
export interface PortraitRegion { x: number; y: number; width: number; height: number }
export interface PortraitReference { id: string; name: string; image: PortraitPixels; kind?: 'character' }
export interface PortraitMatch { id: string; name: string; score: number; rect: PortraitRegion }
interface Ribbon { x: number; y: number; width: number }
interface PreparedReference {
  id: string; name: string; positions: number[]; values: number[]; luminance: number[]
  sum: number; variance: number
}
interface Candidate { id: string; name: string; loss: number; correlation: number; margin: number }

const WIDTH = 32, HEIGHT = 38
const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0
}
const clamp = (value: number, minimum: number, maximum: number): number => Math.max(minimum, Math.min(maximum, value))

function pixel(image: PortraitPixels, x: number, y: number, channel: number): number {
  if (x < 0 || y < 0 || x >= image.width || y >= image.height) return 0
  return image.data[(y * image.width + x) * 4 + channel]
}

function sample(image: PortraitPixels, x: number, y: number, channel: number): number {
  const left = Math.floor(x), top = Math.floor(y), dx = x - left, dy = y - top
  return pixel(image, left, top, channel) * (1 - dx) * (1 - dy) +
    pixel(image, left + 1, top, channel) * dx * (1 - dy) +
    pixel(image, left, top + 1, channel) * (1 - dx) * dy + pixel(image, left + 1, top + 1, channel) * dx * dy
}

/** 面积采样避免160px原图与40px压缩截图的单点混叠导致同一张脸产生大误差。 */
function sampleArea(image: PortraitPixels, x: number, y: number, width: number, height: number, channel: number): number {
  let value = 0
  for (let row = 0; row < 3; row++) for (let column = 0; column < 3; column++) {
    value += sample(image, x + ((column + 0.5) / 3 - 0.5) * width, y + ((row + 0.5) / 3 - 0.5) * height, channel)
  }
  return value / 9
}

function prepare(reference: PortraitReference): PreparedReference | null {
  const positions: number[] = [], values: number[] = [], luminance: number[] = []
  let sum = 0, sumSquares = 0
  for (let y = 5; y < 29; y++) for (let x = 4; x < 27; x++) {
    if (x >= 21 && y < 19) continue // “试用”红标与前后台标记覆盖角落，不属于角色画稿。
    // 旧公开256×256角色小图与官方160×188结算卡使用同一画稿，按固定画稿坐标对齐。
    const sx = reference.kind === 'character' ? (((x + 0.5) * 160 / WIDTH + 20) / 0.725) : (x + 0.5) * reference.image.width / WIDTH - 0.5
    const sy = reference.kind === 'character' ? (((y + 0.5) * 188 / HEIGHT + 4) / 0.725) : (y + 0.5) * reference.image.height / HEIGHT - 0.5
    const spanX = reference.kind === 'character' ? 160 / WIDTH / 0.725 : reference.image.width / WIDTH
    const spanY = reference.kind === 'character' ? 188 / HEIGHT / 0.725 : reference.image.height / HEIGHT
    if (sampleArea(reference.image, sx, sy, spanX, spanY, 3) < 220) continue
    const r = sampleArea(reference.image, sx, sy, spanX, spanY, 0), g = sampleArea(reference.image, sx, sy, spanX, spanY, 1), b = sampleArea(reference.image, sx, sy, spanX, spanY, 2)
    const light = r * 0.299 + g * 0.587 + b * 0.114
    positions.push((y * WIDTH + x) * 3)
    values.push(r, g, b)
    luminance.push(light)
    sum += light; sumSquares += light * light
  }
  if (positions.length < 250) return null
  return { id: reference.id, name: reference.name, positions, values, luminance, sum, variance: sumSquares - sum * sum / positions.length }
}

function feature(image: PortraitPixels, rect: PortraitRegion): Float32Array {
  const data = new Float32Array(WIDTH * HEIGHT * 3)
  for (let y = 0; y < HEIGHT; y++) for (let x = 0; x < WIDTH; x++) {
    const sx = rect.x + (x + 0.5) * rect.width / WIDTH - 0.5
    const sy = rect.y + (y + 0.5) * rect.height / HEIGHT - 0.5
    const position = (y * WIDTH + x) * 3
    for (let c = 0; c < 3; c++) data[position + c] = sampleArea(image, sx, sy, rect.width / WIDTH, rect.height / HEIGHT, c)
  }
  return data
}

function compare(observed: Float32Array, reference: PreparedReference): { loss: number; correlation: number } {
  let squares = 0, sum = 0, sumSquares = 0, product = 0
  for (let i = 0; i < reference.positions.length; i++) {
    const position = reference.positions[i], value = i * 3
    const r = observed[position], g = observed[position + 1], b = observed[position + 2]
    const light = r * 0.299 + g * 0.587 + b * 0.114
    squares += (r - reference.values[value]) ** 2 + (g - reference.values[value + 1]) ** 2 + (b - reference.values[value + 2]) ** 2
    sum += light; sumSquares += light * light; product += light * reference.luminance[i]
  }
  const n = reference.positions.length, variance = sumSquares - sum * sum / n
  const correlation = variance > n && reference.variance > n
    ? clamp((product - sum * reference.sum / n) / Math.sqrt(variance * reference.variance), -1, 1) : 0
  return { loss: squares / (n * 3 * 255 * 255) + 0.025 * (1 - correlation), correlation }
}

function findCandidate(image: PortraitPixels, slot: Ribbon, references: PreparedReference[]): Candidate | null {
  const byName = new Map<string, { id: string; name: string; loss: number; correlation: number }>()
  for (const dy of [-0.08, 0, 0.08]) for (const ratio of [1.05, 1.15, 1.25]) {
    const height = slot.width * ratio
    const observed = feature(image, { x: slot.x, y: slot.y - height + slot.width * dy, width: slot.width, height })
    for (const reference of references) {
      const score = compare(observed, reference)
      if (score.loss < (byName.get(reference.name)?.loss ?? Infinity)) byName.set(reference.name, { id: reference.id, name: reference.name, ...score })
    }
  }
  // 细化最接近的若干真实模板，修正色条边缘被JPEG压缩吃掉1～3px的水平偏移。
  // 不降低阈值，也不把没有证据的“第一名”直接当答案。
  const names = new Set([...byName.values()].sort((a, b) => a.loss - b.loss).slice(0, 6).map(item => item.name))
  const shortlist = references.filter(reference => names.has(reference.name))
  for (const dx of [-0.03, 0.03]) for (const dy of [-0.08, 0, 0.08]) for (const ratio of [1.05, 1.15, 1.25]) {
    const height = slot.width * ratio
    const observed = feature(image, { x: slot.x + slot.width * dx, y: slot.y - height + slot.width * dy, width: slot.width, height })
    for (const reference of shortlist) {
      const score = compare(observed, reference)
      if (score.loss < (byName.get(reference.name)?.loss ?? Infinity)) byName.set(reference.name, { id: reference.id, name: reference.name, ...score })
    }
  }
  const ranked = [...byName.values()].sort((a, b) => a.loss - b.loss)
  if (!ranked.length) return null
  return { ...ranked[0], margin: (ranked[1]?.loss ?? 1) - ranked[0].loss }
}

function reliable(candidate: Candidate | null): candidate is Candidate {
  return candidate !== null && candidate.loss <= 0.045 && candidate.correlation >= 0.5 && candidate.margin >= 0.007
}

/** 色条允许任意稀有度颜色；文字、星级和装备会遮挡部分色条，因此后面补齐整排网格。 */
function ribbons(image: PortraitPixels, region: PortraitRegion): Ribbon[] {
  const out: Ribbon[] = [], step = Math.max(1, Math.floor(image.height / 1100))
  const left = Math.max(0, Math.floor(region.x)), right = Math.min(image.width, Math.ceil(region.x + region.width))
  const top = Math.max(0, Math.floor(region.y)), bottom = Math.min(image.height, Math.ceil(region.y + region.height))
  const minimum = Math.max(22, image.width * 0.022), maximum = Math.min(260, image.width * 0.22)
  for (let y = top; y < bottom; y += step) {
    let start = left
    const add = (end: number): void => {
      const width = end - start
      if (width <= minimum || width >= maximum || y < width * 0.8) return
      const sums = [0, 0, 0], squares = [0, 0, 0]
      for (let x = start; x < end; x++) for (let c = 0; c < 3; c++) {
        const value = pixel(image, x, y, c); sums[c] += value; squares[c] += value * value
      }
      const means = sums.map(sum => sum / width)
      if (Math.max(...means) < 65 || Math.min(...means) > 220 || sums.some((sum, c) => Math.sqrt(Math.max(0, squares[c] / width - (sum / width) ** 2)) > 12)) return
      if (out.some(item => Math.abs(item.x - start) < 4 && Math.abs(item.y - y) < Math.max(6, width * 0.1) && Math.abs(item.width - width) < 6)) return
      out.push({ x: start, y, width })
    }
    for (let x = left + 1; x <= right; x++) {
      if (x === right || [0, 1, 2].some(c => Math.abs(pixel(image, x, y, c) - pixel(image, x - 1, y, c)) > 18)) {
        add(x); start = x
      }
    }
    if (out.length >= 4000) break
  }
  return out
}

function normalizedRegion(image: PortraitPixels, region?: PortraitRegion): PortraitRegion {
  if (!region || ![region.x, region.y, region.width, region.height].every(Number.isFinite) || region.width <= 0 || region.height <= 0) {
    return { x: 0, y: 0, width: image.width, height: image.height }
  }
  const left = clamp(region.x, 0, 1), top = clamp(region.y, 0, 1)
  return { x: left * image.width, y: top * image.height, width: Math.max(0, Math.min(1, region.x + region.width) - left) * image.width, height: Math.max(0, Math.min(1, region.y + region.height) - top) * image.height }
}

function hasPortraitTexture(image: PortraitPixels, slot: Ribbon): boolean {
  const observed = feature(image, { x: slot.x, y: slot.y - slot.width * 1.15, width: slot.width, height: slot.width * 1.15 })
  let sum = 0, squares = 0, n = 0
  for (let y = 5; y < 29; y++) for (let x = 4; x < 27; x++) {
    const index = (y * WIDTH + x) * 3
    const light = observed[index] * 0.299 + observed[index + 1] * 0.587 + observed[index + 2] * 0.114
    sum += light; squares += light * light; n++
  }
  return Math.sqrt(Math.max(0, squares / n - (sum / n) ** 2)) > 16
}

export function matchPortraitPixels(image: PortraitPixels, references: PortraitReference[], region?: PortraitRegion): {
  characters: PortraitMatch[]; warnings: string[]; complete: boolean; detectedSlots: number
} {
  if (!image.width || !image.height || image.data.length !== image.width * image.height * 4) throw new Error('头像图像像素格式无效')
  const prepared = references.map(prepare).filter((item): item is PreparedReference => item !== null)
  if (prepared.length < 2) return { characters: [], warnings: ['角色头像模板尚未准备好，阵容可手动填写。'], complete: false, detectedSlots: 0 }
  const area = normalizedRegion(image, region), candidates = ribbons(image, area), groups: Ribbon[][] = []
  for (const slot of candidates) {
    const group = groups.find(items => Math.abs(items[0].y - slot.y) < slot.width * 0.1 && Math.abs(items[0].width - slot.width) < slot.width * 0.15)
    if (!group) groups.push([slot])
    else if (!group.some(item => Math.abs(item.x - slot.x) < slot.width * 0.7)) group.push(slot)
  }
  const cache = new Map<string, Candidate | null>()
  const match = (slot: Ribbon): Candidate | null => {
    const key = `${Math.round(slot.x)},${Math.round(slot.y)},${Math.round(slot.width)}`
    if (!cache.has(key)) cache.set(key, findCandidate(image, slot, prepared))
    return cache.get(key) ?? null
  }
  const rows: Array<{ width: number; y: number; anchor: number; pitch: number }> = []
  for (const group of groups.filter(items => items.length >= 3).sort((a, b) => b.length - a.length).slice(0, 20)) {
    const accepted = group.filter(slot => reliable(match(slot)))
    if (accepted.length < 3) continue
    const width = median(group.map(slot => slot.width)), y = median(group.map(slot => slot.y))
    if (rows.some(row => Math.abs(row.y - y) < width * 0.3)) continue
    const xs = group.map(slot => slot.x).sort((a, b) => a - b)
    const differences = xs.slice(1).map((x, index) => x - xs[index]).filter(d => d > width * 0.95 && d < width * 1.6)
    const pitch = median(differences)
    if (pitch > 0) rows.push({ width, y, anchor: xs[0], pitch })
    if (rows.length >= 4) break
  }
  if (!rows.length) return { characters: [], warnings: ['未可靠定位阵容头像排，角色请对照原图补充。'], complete: false, detectedSlots: 0 }

  // 单独一张卡的另一排没有足够色条组；最长排也可能是后台，所以向上下都查找。
  const primary = rows[0]
  for (const seed of candidates) {
    const separation = Math.abs(seed.y - primary.y)
    if (separation < primary.width * 1.25 || separation > primary.width * 3 ||
      seed.width < primary.width * 0.45 || seed.width > primary.width * 1.15 || rows.some(row => Math.abs(row.y - seed.y) < primary.width * 0.3)) continue
    const x = primary.anchor + Math.round((seed.x - primary.anchor) / primary.pitch) * primary.pitch
    if (Math.abs(x - seed.x) > primary.width * 0.45) continue
    const slot = { x, y: seed.y, width: primary.width }
    if (reliable(match(slot))) rows.push({ ...primary, y: seed.y })
    if (rows.length >= 4) break
  }

  const characters: PortraitMatch[] = [], occupied: PortraitRegion[] = []
  for (const row of rows) {
    for (let step = -15; step <= 15; step++) {
      const slot = { x: Math.round(row.anchor + row.pitch * step), y: row.y, width: row.width }
      if (slot.x < area.x || slot.x + slot.width > area.x + area.width || slot.y > area.y + area.height) continue
      const candidate = match(slot)
      const hasRibbon = candidates.some(item => Math.abs(item.y - slot.y) < slot.width * 0.12 && Math.abs(item.x - slot.x) < slot.width * 0.12 && Math.abs(item.width - slot.width) < slot.width * 0.18)
      if (!reliable(candidate) && !hasRibbon && !hasPortraitTexture(image, slot)) continue
      const rect = { x: slot.x / image.width, y: (slot.y - slot.width * 1.175) / image.height, width: slot.width / image.width, height: slot.width * 1.175 / image.height }
      if (occupied.some(item => Math.abs(item.x - rect.x) < rect.width * 0.6 && Math.abs(item.y - rect.y) < rect.height * 0.6)) continue
      occupied.push(rect)
      if (!reliable(candidate)) continue
      characters.push({ id: candidate.id, name: candidate.name, score: clamp(1 - candidate.loss * 12, 0, 1), rect })
    }
  }
  characters.sort((a, b) => Math.abs(a.rect.y - b.rect.y) < Math.min(a.rect.height, b.rect.height) * 0.3 ? a.rect.x - b.rect.x : a.rect.y - b.rect.y)
  const unique = characters.filter((item, index) => characters.findIndex(other => other.name === item.name) === index)
  const complete = unique.length > 0 && occupied.length === characters.length
  const warnings = complete ? ['头像按本地模板识别，请对照原图核对角色及形态。'] : [`已匹配${unique.length}个角色头像，请核对是否还有漏项或特殊单位。`]
  return { characters: unique, warnings, complete, detectedSlots: occupied.length }
}
