import { nativeImage, type NativeImage } from 'electron'

/** 程序自带的简化小脸，不使用解包模型或贴图，素材未就绪也能从托盘恢复。 */
export function createTrayIcon(): NativeImage {
  const size = 20
  const bitmap = Buffer.alloc(size * size * 4)
  const ink = [59, 47, 66], paper = [255, 248, 234], gold = [232, 196, 118]
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - 9.5, dy = y - 10.5
      const ear = y >= 2 && y <= 7 && (x >= 2 && x <= 6 || x >= 13 && x <= 17)
      if (dx * dx + dy * dy > 77 && !ear) continue
      let color = ink
      if (dx * dx / 50 + (y - 13) ** 2 / 24 < 1) color = paper
      if (y >= 8 && y <= 11 && (x >= 5 && x <= 7 || x >= 12 && x <= 14)) color = gold
      if (y === 15 && x >= 9 && x <= 10) color = ink
      const offset = (y * size + x) * 4
      bitmap[offset] = color[2]; bitmap[offset + 1] = color[1]; bitmap[offset + 2] = color[0]; bitmap[offset + 3] = 255
    }
  }
  return nativeImage.createFromBitmap(bitmap, { width: size, height: size })
}
