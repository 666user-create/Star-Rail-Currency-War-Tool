/// <reference types="electron-vite/node" />
import { app, desktopCapturer, nativeImage, type Display } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import decoderAsset from '../../scripts/decode-image.ps1?asset'

const MAX_IMAGE_BYTES = 25 * 1024 * 1024

function storeImage(bytes: Buffer, extension: string, directory: string): string {
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) throw new Error('请选择25MB以内的截图')
  const image = nativeImage.createFromBuffer(bytes)
  const size = image.getSize()
  if (image.isEmpty() || !size.width || !size.height || size.width * size.height > 60_000_000) throw new Error('图片无法读取或尺寸过大，请换一张截图')
  fs.mkdirSync(directory, { recursive: true })
  const destination = path.join(directory, createHash('sha256').update(bytes).digest('hex') + extension)
  if (fs.existsSync(destination)) return destination
  const temporary = destination + '.' + randomUUID() + '.tmp'
  try {
    fs.writeFileSync(temporary, bytes, { flag: 'wx' })
    fs.renameSync(temporary, destination)
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary)
  }
  return destination
}

/** 从字节导入截图（剪贴板等来源）；返回入库路径。 */
export function importScreenshotBytes(bytes: Buffer, extension: string, directory: string): string {
  return storeImage(bytes, extension, directory)
}

export async function importScreenshotFile(sourcePath: string, directory: string): Promise<string> {
  const extension = path.extname(sourcePath).toLowerCase()
  if (!['.png', '.jpg', '.jpeg', '.webp'].includes(extension)) throw new Error('请选择PNG、JPG或WebP截图')
  if (fs.statSync(sourcePath).size > MAX_IMAGE_BYTES) throw new Error('请选择25MB以内的截图')
  const original = fs.readFileSync(sourcePath)
  if (extension !== '.webp' || !nativeImage.createFromBuffer(original).isEmpty()) return storeImage(original, extension === '.jpeg' ? '.jpg' : extension, directory)
  if (original.subarray(0, 4).toString('ascii') !== 'RIFF' || original.subarray(8, 12).toString('ascii') !== 'WEBP') throw new Error('WebP截图格式不正确，请重新选择图片')
  const helperDirectory = path.join(app.getPath('userData'), 'ocr-helper')
  fs.mkdirSync(helperDirectory, { recursive: true })
  const helper = path.join(helperDirectory, 'decode-image.ps1')
  fs.writeFileSync(helper, '\uFEFF' + fs.readFileSync(decoderAsset, 'utf8').replace(/^\uFEFF/, ''), 'utf8')
  const decoded = await new Promise<Buffer>((resolve, reject) => {
    execFile(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe'),
      ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', helper, '-ImagePath', sourcePath],
      { windowsHide: true, encoding: 'utf8', timeout: 15_000, maxBuffer: 36 * 1024 * 1024 }, (error, stdout) => {
        if (error) reject(new Error('这张WebP截图暂时无法转换，请另存为PNG或JPG后导入'))
        else resolve(Buffer.from(stdout.trim(), 'base64'))
      })
  })
  const normalized = storeImage(decoded, '.png', directory)
  // 保留原始字节，规范化PNG只用于兼容系统图像读取和本地匹配。
  const originalPath = path.join(directory, createHash('sha256').update(original).digest('hex') + '.webp')
  if (!fs.existsSync(originalPath)) fs.writeFileSync(originalPath, original, { flag: 'wx' })
  return normalized
}

/** 仅由用户本次结束/重截触发，截取点击所在显示器一帧。 */
export async function captureDisplay(display: Display, directory: string): Promise<string> {
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: Math.round(display.size.width * display.scaleFactor), height: Math.round(display.size.height * display.scaleFactor) },
    fetchWindowIcons: false
  })
  const source = sources.find(item => item.display_id === String(display.id)) ?? (sources.length === 1 ? sources[0] : null)
  if (!source || source.thumbnail.isEmpty()) throw new Error('没有截到当前屏幕，请停留在结算界面后重新截图，或导入已有图片')
  return storeImage(source.thumbnail.toPNG(), '.png', directory)
}

/** renderer 只能请求已有草稿/战绩关联的本地图片。 */
export function screenshotDataUrl(filePath: string | null, directory: string): string | null {
  if (!filePath) return null
  try {
    const actual = fs.realpathSync(filePath)
    const root = fs.realpathSync(directory)
    if (path.dirname(actual).toLowerCase() !== root.toLowerCase() || fs.statSync(actual).size > MAX_IMAGE_BYTES) return null
    const extension = path.extname(actual).toLowerCase()
    const type = extension === '.png' ? 'image/png' : extension === '.webp' ? 'image/webp' : extension === '.jpg' ? 'image/jpeg' : null
    return type ? `data:${type};base64,${fs.readFileSync(actual).toString('base64')}` : null
  } catch { return null }
}
