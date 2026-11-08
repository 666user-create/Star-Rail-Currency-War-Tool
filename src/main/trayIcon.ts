import { app, nativeImage, type NativeImage } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

/**
 * 托盘图标：与界面 .logo 统一风格（金色圆角方框 + 中心菱形），透明底。
 * 素材由 build 阶段生成到 assets/tray/icon.png；找不到时退回代码绘制，保证托盘始终可用。
 */
export function createTrayIcon(): NativeImage {
  const candidates = app.getAppPath().includes('.asar')
    ? [path.join(process.resourcesPath, 'tray', 'icon.png')]
    : [path.join(app.getAppPath(), 'assets', 'tray', 'icon.png')]
  for (const file of candidates) {
    try {
      if (!fs.existsSync(file)) continue
      const image = nativeImage.createFromPath(file)
      if (!image.isEmpty()) return image.resize({ width: 20, height: 20 })
    } catch { /* 尝试下一个候选 */ }
  }
  return fallbackIcon()
}

/** 兜底：用几何绘制同款“圆角方框 + 菱形”，不依赖任何外部文件。 */
function fallbackIcon(): NativeImage {
  const size = 20
  const bitmap = Buffer.alloc(size * size * 4)
  const gold = [232, 196, 118]
  const inRound = (px: number, py: number, l: number, t: number, r: number, b: number, rad: number): boolean => {
    if (px < l || px > r || py < t || py > b) return false
    const cx = Math.min(Math.max(px, l + rad), r - rad)
    const cy = Math.min(Math.max(py, t + rad), b - rad)
    const dx = px - cx, dy = py - cy
    return dx * dx + dy * dy <= rad * rad
  }
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const px = x + 0.5, py = y + 0.5
      // 外框 2..18，内框 4.5..15.5
      const frame = inRound(px, py, 2, 2, 18, 18, 5) && !inRound(px, py, 4.6, 4.6, 15.4, 15.4, 3.4)
      const diamond = Math.abs(px - 10) / 3.4 + Math.abs(py - 10) / 4.3 <= 1
      const on = frame || diamond
      const offset = (y * size + x) * 4
      // BGRA
      bitmap[offset] = on ? gold[2] : 0
      bitmap[offset + 1] = on ? gold[1] : 0
      bitmap[offset + 2] = on ? gold[0] : 0
      bitmap[offset + 3] = on ? 255 : 0
    }
  }
  return nativeImage.createFromBitmap(bitmap, { width: size, height: size })
}
