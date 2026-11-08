export interface TimerRect {
  x: number
  y: number
  width: number
  height: number
}

export type TimerSide = 'above' | 'below' | 'left' | 'right'

export interface TimerPlacement extends TimerRect {
  side: TimerSide
}

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value))

/**
 * 独立计时表优先居中放在桌宠上方，贴顶时依次尝试右、左、下方。
 * 使用屏幕 DIP 坐标，向内取整工作区、向外取整桌宠边界。
 * 计时表含可点击按钮，不压缩尺寸；完整放不下时返回零尺寸供调用方隐藏。
 */
export function placeTimer(
  pet: TimerRect,
  size: Pick<TimerRect, 'width' | 'height'>,
  workArea: TimerRect,
  gap = 8
): TimerPlacement {
  const empty: TimerPlacement = {
    x: Number.isFinite(workArea.x) ? Math.ceil(workArea.x) : 0,
    y: Number.isFinite(workArea.y) ? Math.ceil(workArea.y) : 0,
    width: 0,
    height: 0,
    side: 'above'
  }
  if (![pet.x, pet.y, pet.width, pet.height, size.width, size.height,
    workArea.x, workArea.y, workArea.width, workArea.height,
    pet.x + pet.width, pet.y + pet.height,
    workArea.x + workArea.width, workArea.y + workArea.height].every(Number.isFinite) ||
      pet.width <= 0 || pet.height <= 0 || size.width <= 0 || size.height <= 0 ||
      workArea.width <= 0 || workArea.height <= 0) return empty

  const left = Math.ceil(workArea.x), top = Math.ceil(workArea.y)
  const right = Math.floor(workArea.x + workArea.width), bottom = Math.floor(workArea.y + workArea.height)
  const petLeft = Math.floor(pet.x), petTop = Math.floor(pet.y)
  const petRight = Math.ceil(pet.x + pet.width), petBottom = Math.ceil(pet.y + pet.height)
  const distance = Number.isFinite(gap) ? Math.ceil(Math.max(0, gap)) : 8
  const width = Math.ceil(size.width), height = Math.ceil(size.height)
  if (right - left < width || bottom - top < height) return empty

  const centeredX = clamp(Math.round(pet.x + (pet.width - width) / 2), left, right - width)
  const sideY = clamp(Math.round(pet.y), top, bottom - height)
  const candidates: Array<Pick<TimerPlacement, 'x' | 'y' | 'side'>> = [
    { side: 'above', x: centeredX, y: Math.min(petTop - distance - height, bottom - height) },
    { side: 'right', x: Math.max(petRight + distance, left), y: sideY },
    { side: 'left', x: Math.min(petLeft - distance - width, right - width), y: sideY },
    { side: 'below', x: centeredX, y: Math.max(petBottom + distance, top) }
  ]
  const chosen = candidates.find(({ x, y }) => x >= left && y >= top && x + width <= right && y + height <= bottom)
  return chosen ? { ...chosen, width, height } : empty
}
