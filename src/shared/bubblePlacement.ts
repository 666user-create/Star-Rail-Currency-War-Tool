export interface BubbleRect {
  x: number
  y: number
  width: number
  height: number
}

export type BubbleSide = 'left' | 'right' | 'above' | 'below'

export interface BubblePlacement extends BubbleRect {
  side: BubbleSide
}

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value))

interface FreeRegion extends BubbleRect {
  side: BubbleSide
}

function subtractObstacle(region: FreeRegion, obstacle: BubbleRect): FreeRegion[] {
  const left = Math.max(region.x, obstacle.x), top = Math.max(region.y, obstacle.y)
  const right = Math.min(region.x + region.width, obstacle.x + obstacle.width)
  const bottom = Math.min(region.y + region.height, obstacle.y + obstacle.height)
  if (left >= right || top >= bottom) return [region]

  // 四块候选允许在角落重叠：任一完整空矩形都能保留在其中一块，
  // 避免仅按不重叠网格切割后，误以为原本放得下的气泡没有空间。
  const pieces: FreeRegion[] = []
  if (top > region.y) pieces.push({ ...region, height: top - region.y })
  if (bottom < region.y + region.height) pieces.push({ ...region, y: bottom, height: region.y + region.height - bottom })
  if (left > region.x) pieces.push({ ...region, width: left - region.x })
  if (right < region.x + region.width) pieces.push({ ...region, x: right, width: region.x + region.width - right })
  return pieces
}

function removeContainedRegions(regions: FreeRegion[]): FreeRegion[] {
  return regions.filter((region, i) => !regions.some((other, j) => j !== i &&
    other.x <= region.x && other.y <= region.y &&
    other.x + other.width >= region.x + region.width && other.y + other.height >= region.y + region.height &&
    (j < i || other.x !== region.x || other.y !== region.y || other.width !== region.width || other.height !== region.height)))
}

/**
 * 为独立气泡窗口选择桌宠外侧的空闲区域，全部使用屏幕 DIP 坐标。
 * 可传入计时表等障碍，气泡与障碍也保留 gap。
 * 尺寸实在放不下时缩到空闲区域；无空闲区域或输入无效时返回零尺寸，调用方应隐藏窗口。
 */
export function placeBubble(
  pet: BubbleRect,
  size: Pick<BubbleRect, 'width' | 'height'>,
  workArea: BubbleRect,
  gap = 10,
  obstacles: BubbleRect[] = []
): BubblePlacement {
  const empty: BubblePlacement = {
    x: Number.isFinite(workArea.x) ? Math.ceil(workArea.x) : 0,
    y: Number.isFinite(workArea.y) ? Math.ceil(workArea.y) : 0,
    width: 0,
    height: 0,
    side: 'right'
  }
  if (![pet.x, pet.y, pet.width, pet.height, size.width, size.height,
    workArea.x, workArea.y, workArea.width, workArea.height,
    pet.x + pet.width, pet.y + pet.height,
    workArea.x + workArea.width, workArea.y + workArea.height].every(Number.isFinite) ||
      pet.width < 0 || pet.height < 0 || size.width <= 0 || size.height <= 0 ||
      workArea.width <= 0 || workArea.height <= 0) return empty

  // 向内取整工作区，向外取整桌宠，避免小数坐标在原生窗口取整后挤进模型边界。
  const left = Math.ceil(workArea.x), top = Math.ceil(workArea.y)
  const right = Math.floor(workArea.x + workArea.width), bottom = Math.floor(workArea.y + workArea.height)
  const petLeft = Math.floor(pet.x), petTop = Math.floor(pet.y)
  const petRight = Math.ceil(pet.x + pet.width), petBottom = Math.ceil(pet.y + pet.height)
  const distance = Number.isFinite(gap) ? Math.ceil(Math.max(0, gap)) : 10
  const desiredWidth = Math.ceil(size.width), desiredHeight = Math.ceil(size.height)
  if (right <= left || bottom <= top) return empty

  const rightStart = clamp(petRight + distance, left, right)
  const leftEnd = clamp(petLeft - distance, left, right)
  const aboveEnd = clamp(petTop - distance, top, bottom)
  const belowStart = clamp(petBottom + distance, top, bottom)
  const bands: FreeRegion[] = [
    { side: 'right', x: rightStart, y: top, width: right - rightStart, height: bottom - top },
    { side: 'left', x: left, y: top, width: leftEnd - left, height: bottom - top },
    { side: 'above', x: left, y: top, width: right - left, height: aboveEnd - top },
    { side: 'below', x: left, y: belowStart, width: right - left, height: bottom - belowStart }
  ]

  const exclusions: BubbleRect[] = []
  for (const obstacle of Array.isArray(obstacles) ? obstacles : []) {
    if (!obstacle || ![obstacle.x, obstacle.y, obstacle.width, obstacle.height,
      obstacle.x + obstacle.width, obstacle.y + obstacle.height].every(Number.isFinite) ||
        obstacle.width <= 0 || obstacle.height <= 0) continue
    const x = Math.max(left, Math.floor(obstacle.x) - distance)
    const y = Math.max(top, Math.floor(obstacle.y) - distance)
    const edgeX = Math.min(right, Math.ceil(obstacle.x + obstacle.width) + distance)
    const edgeY = Math.min(bottom, Math.ceil(obstacle.y + obstacle.height) + distance)
    if (edgeX > x && edgeY > y) exclusions.push({ x, y, width: edgeX - x, height: edgeY - y })
  }

  const positionIn = (region: FreeRegion, width: number, height: number): BubblePlacement => ({
    x: region.side === 'right' ? region.x : region.side === 'left' ? region.x + region.width - width :
      clamp(Math.round(pet.x + (pet.width - width) / 2), region.x, region.x + region.width - width),
    y: region.side === 'above' ? region.y + region.height - height : region.side === 'below' ? region.y :
      clamp(Math.round(pet.y + pet.height * 0.15), region.y, region.y + region.height - height),
    width, height, side: region.side
  })
  const candidates = bands.flatMap((band, priority) => {
    let regions = band.width > 0 && band.height > 0 ? [band] : []
    for (const obstacle of exclusions) regions = removeContainedRegions(regions.flatMap(region => subtractObstacle(region, obstacle)))
    return regions.map(region => {
      const width = Math.min(desiredWidth, region.width), height = Math.min(desiredHeight, region.height)
      const placement = positionIn(region, width, height)
      const natural = positionIn(band, width, height)
      return { placement, priority, full: width === desiredWidth && height === desiredHeight,
        area: width * height, distance: Math.hypot(placement.x - natural.x, placement.y - natural.y) }
    })
  })
  // 完整气泡优先；完整放不下时保留最多内容面积。方向同级时选择离原自然位置最近的空区。
  candidates.sort((a, b) => Number(b.full) - Number(a.full) ||
    (a.full ? 0 : b.area - a.area) || a.priority - b.priority || a.distance - b.distance)
  return candidates[0]?.placement ?? empty
}
