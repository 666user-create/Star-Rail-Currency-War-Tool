/// <reference types="electron-vite/node" />
import { app } from 'electron'
import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import windowsOcrAsset from '../../scripts/windows-ocr.ps1?asset'
import { parseOcrResult, type OcrDocument, type OcrLine } from '../shared/ocrParser'
import type { OcrAnalysis } from '../shared/types'

interface OcrResponse extends OcrDocument {
  ok: boolean
  stage?: string
  error?: string
}

let scriptPathPromise: Promise<string> | null = null

function helperScript(): Promise<string> {
  if (!scriptPathPromise) {
    scriptPathPromise = (async () => {
      // ?asset 随构建复制；由 Electron 读取后落到用户目录，PowerShell 不必访问 asar 内文件。
      const source = await fs.readFile(windowsOcrAsset, 'utf8')
      const directory = path.join(app.getPath('userData'), 'ocr-helper')
      await fs.mkdir(directory, { recursive: true })
      const target = path.join(directory, 'windows-ocr.ps1')
      // Windows PowerShell 5.1 通过 BOM 正确读取脚本中的中文提示。
      await fs.writeFile(target, '\uFEFF' + source.replace(/^\uFEFF/, ''), 'utf8')
      return target
    })().catch((error) => { scriptPathPromise = null; throw error })
  }
  return scriptPathPromise
}

function decodeResponse(stdout: string): OcrResponse {
  let response: unknown
  try { response = JSON.parse(stdout.replace(/^\uFEFF/, '').trim()) }
  catch { throw new Error('系统 OCR 没有返回可读取的结果，原图已保留，请手动填写或重试。') }
  if (!response || typeof response !== 'object' || !('ok' in response)) {
    throw new Error('系统 OCR 返回格式异常，原图已保留，请手动填写。')
  }
  return response as OcrResponse
}

function readableFailure(response: OcrResponse): Error {
  if (response.stage === 'engine') return new Error('系统 OCR 不可用。请检查 Windows OCR 语言支持，或直接按原图手动填写。')
  if (response.stage === 'image') return new Error('系统 OCR 无法读取这张截图，请重新选择有效图片；现有草稿仍可手动填写。')
  return new Error('系统 OCR 识别失败，原图已保留，可以重试或手动填写。')
}

/** 只读取调用者明确传入的单张本地截图，不枚举窗口、不截屏、不联网。 */
export async function recognizeScreenshot(imagePath: string): Promise<OcrAnalysis> {
  if (process.platform !== 'win32') throw new Error('当前本地 OCR 仅支持 Windows，仍可按原图手动填写记录。')
  if (!path.isAbsolute(imagePath)) throw new Error('截图路径无效，请重新选择截图。')
  const stat = await fs.stat(imagePath).catch(() => null)
  if (!stat?.isFile()) throw new Error('截图文件已不存在，请重新选择截图或手动填写。')
  const script = await helperScript().catch(() => {
    throw new Error('无法准备本地 OCR 组件，原图已保留，可以手动填写记录。')
  })
  const powershell = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
  const stdout = await new Promise<string>((resolve, reject) => {
    execFile(powershell, [
      '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
      '-File', script, '-ImagePath', imagePath, '-LanguageTag', 'zh-Hans-CN'
    ], { windowsHide: true, encoding: 'utf8', timeout: 30_000, maxBuffer: 4 * 1024 * 1024 }, (error, output) => {
      if (!error) { resolve(output); return }
      if (error.killed || (error as NodeJS.ErrnoException).code === 'ETIMEDOUT') {
        reject(new Error('系统 OCR 超时，原图已保留，请重试或手动填写。'))
        return
      }
      if (output.trim()) {
        try { reject(readableFailure(decodeResponse(output))); return }
        catch { /* 没有结构化诊断时使用统一提示。 */ }
      }
      reject(new Error('无法启动系统 OCR，原图已保留，可以手动填写记录。'))
    })
  })
  const result = decodeResponse(stdout)
  if (result.ok !== true) throw readableFailure(result)
  if (typeof result.text !== 'string' || !Number.isFinite(result.width) || result.width <= 0
    || !Number.isFinite(result.height) || result.height <= 0 || !Array.isArray(result.lines)) {
    throw new Error('系统 OCR 返回的图片信息不完整，请手动填写或重试。')
  }
  const lines: OcrLine[] = result.lines.filter((line) => line && typeof line.text === 'string')
    .map((line) => ({ text: line.text, words: Array.isArray(line.words) ? line.words : [] }))
  const regions = Array.isArray(result.regions) ? result.regions.filter((region) => region
    && ['header', 'rating', 'bonds'].includes(region.kind) && Array.isArray(region.lines)).map((region) => ({
      ...region, lines: region.lines.filter((line) => line && typeof line.text === 'string')
        .map((line) => ({ text: line.text, words: Array.isArray(line.words) ? line.words : [] }))
    })) : []
  return parseOcrResult({ ...result, lines, regions,
    warnings: Array.isArray(result.warnings) ? result.warnings.filter((warning) => typeof warning === 'string') : [] })
}
