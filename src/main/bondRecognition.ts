/// <reference types="electron-vite/node" />
import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import bondCountsAsset from '../../scripts/bond-counts.ps1?asset'
import { createBondTemplate, extractBondCountGlyph, matchBondIcons, type BondBitmap, type BondRegions, type BondTemplate, type BondIconMatch } from './bondImageMatcher'

const CONFIG_URL = 'https://sg-act-public-api.hoyolab.com/event/rpgcurrencywar/game/config?game=hkrpg'
const MAX_ICON_BYTES = 512 * 1024
interface CachedBond { id: string; name: string; file: string; url: string }
interface PreparedBonds { templates: CachedBond[]; warnings: string[] }
export interface BondRecognitionResult {
  bonds: Array<{ id: string; name: string; count: number | null; score: number }>
  warnings: string[]
  complete: boolean
}
const preparing = new Map<string, Promise<PreparedBonds>>()
const countHelpers = new Map<string, Promise<string>>()

function countHelper(directory: string): Promise<string> {
  const previous = countHelpers.get(directory)
  if (previous) return previous
  const pending = (async () => {
    await fs.mkdir(directory, { recursive: true })
    const helper = path.join(directory, 'bond-counts.ps1')
    const source = await fs.readFile(bondCountsAsset, 'utf8')
    await atomicFile(helper, '\uFEFF' + source.replace(/^\uFEFF/, ''))
    return helper
  })().catch((error) => { countHelpers.delete(directory); throw error })
  countHelpers.set(directory, pending)
  return pending
}

async function readCountGlyphs(bitmap: BondBitmap, matches: BondIconMatch[], cacheDir: string): Promise<Map<string, number>> {
  if (process.platform !== 'win32') return new Map()
  const glyphs = matches.slice(0, 24).flatMap((match) => {
    const glyph = extractBondCountGlyph(bitmap, match.rect)
    return glyph ? [{ id: match.id, width: glyph.width, height: glyph.height, pixels: glyph.pixels }] : []
  })
  if (!glyphs.length) return new Map()
  const directory = path.join(path.resolve(cacheDir), 'count-helper')
  const helper = await countHelper(directory)
  const input = path.join(directory, `${randomUUID()}.json`)
  try {
    await fs.writeFile(input, JSON.stringify(glyphs), { flag: 'wx' })
    const executable = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
    const stdout = await new Promise<string>((resolve, reject) => {
      execFile(executable, ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', helper, '-InputPath', input],
        { windowsHide: true, timeout: 12_000, encoding: 'utf8', maxBuffer: 128 * 1024 }, (error, output) => error ? reject(error) : resolve(output))
    })
    const result: unknown = JSON.parse(stdout.replace(/^\uFEFF/, '').trim())
    if (!result || typeof result !== 'object' || !('ok' in result) || result.ok !== true || !('counts' in result) || !Array.isArray(result.counts)) throw new Error('本地羁绊数字增强未完成')
    const allowed = new Set(glyphs.map((glyph) => glyph.id)), counts = new Map<string, number>()
    for (const item of result.counts) {
      if (item && typeof item.id === 'string' && allowed.has(item.id) && Number.isInteger(item.count) && item.count > 0 && item.count <= 99) counts.set(item.id, item.count)
    }
    return counts
  } finally { await fs.unlink(input).catch(() => {}) }
}

function safeIconUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && url.hostname === 'act-webstatic.hoyoverse.com' && !url.username && !url.password && url.pathname.startsWith('/darkmatter/hkrpg/') && /\/[a-f\d]{32}\.png$/i.test(url.pathname) && !url.search && !url.hash
  } catch { return false }
}

function validEntry(value: unknown): value is CachedBond {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<CachedBond>
  return typeof item.id === 'string' && /^\d{1,8}$/.test(item.id) && typeof item.name === 'string' && item.name.length > 0 && item.name.length <= 50 && item.file === `${item.id}.png` && safeIconUrl(item.url)
}

async function publicBytes(url: string, maximum: number, signal: AbortSignal): Promise<Buffer> {
  const { net } = await import('electron')
  const response = await net.fetch(url, {
    signal, redirect: 'error', credentials: 'omit',
    headers: { 'x-rpc-lang': 'zh-cn', 'x-rpc-currencywar-tourn': 'tourn' }
  })
  if (!response.ok || Number(response.headers.get('content-length')) > maximum || !response.body) throw new Error('公开图标资源不可用')
  const reader = response.body.getReader(), chunks: Uint8Array[] = []
  let length = 0
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      length += value.byteLength
      if (length > maximum) { await reader.cancel(); throw new Error('公开图标资源超过大小限制') }
      chunks.push(value)
    }
  } finally { reader.releaseLock() }
  return Buffer.concat(chunks)
}

async function atomicFile(file: string, bytes: Buffer | string): Promise<void> {
  const temporary = `${file}.${randomUUID()}.tmp`
  try { await fs.writeFile(temporary, bytes, { flag: 'wx' }); await fs.rename(temporary, file) }
  finally { await fs.unlink(temporary).catch(() => {}) }
}

async function readCache(directory: string): Promise<PreparedBonds> {
  const empty: PreparedBonds = { templates: [], warnings: [] }
  try {
    const file = path.join(directory, 'manifest.json')
    if ((await fs.stat(file)).size > 128 * 1024) return empty
    const saved: unknown = JSON.parse(await fs.readFile(file, 'utf8'))
    const candidates = Array.isArray(saved) ? saved : saved && typeof saved === 'object' && 'templates' in saved ? (saved as { templates: unknown }).templates : []
    if (!Array.isArray(candidates) || candidates.length > 100) return empty
    const expectedCount = saved && typeof saved === 'object' && 'expectedCount' in saved && Number.isInteger(saved.expectedCount) && Number(saved.expectedCount) <= 100 ? Number(saved.expectedCount) : candidates.length
    const valid: CachedBond[] = []
    for (const item of candidates) {
      if (!validEntry(item)) continue
      const info = await fs.stat(path.join(directory, item.file)).catch(() => null)
      if (info?.isFile() && info.size > 16 && info.size <= MAX_ICON_BYTES) valid.push(item)
    }
    const templates = [...new Map(valid.map((item) => [item.id, item])).values()]
    return { templates, warnings: templates.length < expectedCount ? ['部分羁绊图标缓存缺失，识别可能有遗漏，可按原图补充。'] : [] }
  } catch { return empty }
}

/** 首次仅下载官方攻略页公开的羁绊小图标；后续有缓存即完全离线，不发送截图或账号信息。 */
export function prepareBondTemplates(cacheDir: string): Promise<PreparedBonds> {
  const directory = path.resolve(cacheDir)
  const previous = preparing.get(directory)
  if (previous) return previous
  const pending = (async (): Promise<PreparedBonds> => {
    const cached = await readCache(directory)
    if (cached.templates.length) return cached
    const warnings: string[] = []
    try {
      await fs.mkdir(directory, { recursive: true })
      const overall = AbortSignal.timeout(20_000)
      const raw = await publicBytes(CONFIG_URL, 4 * 1024 * 1024, AbortSignal.any([overall, AbortSignal.timeout(8_000)]))
      const config = JSON.parse(raw.toString('utf8')) as { retcode?: number; data?: { trait_info_list?: unknown[] } }
      if (config.retcode !== 0 || !Array.isArray(config.data?.trait_info_list) || config.data.trait_info_list.length > 100) throw new Error('官方羁绊配置格式不可用')
      const entries: CachedBond[] = config.data.trait_info_list.flatMap((value) => {
        if (!value || typeof value !== 'object') return []
        const item = value as { trait_id?: unknown; trait_name?: unknown; trait_icon?: unknown }
        const id = String(item.trait_id ?? '')
        const entry = { id, name: item.trait_name, file: `${id}.png`, url: item.trait_icon }
        return validEntry(entry) ? [entry] : []
      })
      let next = 0
      const available: CachedBond[] = []
      const worker = async (): Promise<void> => {
        while (next < entries.length && !overall.aborted) {
          const entry = entries[next++]
          try {
            const bytes = await publicBytes(entry.url, MAX_ICON_BYTES, AbortSignal.any([overall, AbortSignal.timeout(6_000)]))
            if (bytes.length < 24 || bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') continue
            await atomicFile(path.join(directory, entry.file), bytes)
            available.push(entry)
          } catch { /* 单个图标失败时继续使用其余可用模板，不阻断手工复核。 */ }
        }
      }
      await Promise.all(Array.from({ length: Math.min(4, entries.length) }, worker))
      if (!available.length) throw new Error('羁绊小图标未缓存成功')
      await atomicFile(path.join(directory, 'manifest.json'), JSON.stringify({ source: CONFIG_URL, downloadedAt: Date.now(), expectedCount: entries.length, templates: available }))
      if (available.length < entries.length) warnings.push('部分羁绊图标未缓存成功，识别可能有遗漏，可按原图补充。')
      return { templates: available, warnings }
    } catch {
      warnings.push('羁绊图标库暂不可用；首次使用需下载官方公开小图标，截图不会上传，可先手动填写。')
      return { templates: [], warnings }
    }
  })()
  preparing.set(directory, pending)
  void pending.then((result) => { if (!result.templates.length) preparing.delete(directory) }, () => preparing.delete(directory))
  return pending
}

/** 只解码指定单张截图；图案匹配和数量词定位均在本机进行。 */
export async function recognizeBonds(imagePath: string, cacheDir: string, regions: BondRegions = {}): Promise<BondRecognitionResult> {
  const empty = (warnings: string[]): BondRecognitionResult => ({ bonds: [], warnings, complete: false })
  const { nativeImage } = await import('electron')
  let screenshot = nativeImage.createFromPath(imagePath)
  if (screenshot.isEmpty()) return empty(['这张图片无法进行羁绊图标比对，请按原图手动补充。'])
  const original = screenshot.getSize()
  if (!regions.bonds && original.width / original.height < 1.15) return empty([])
  if (original.width > 2560) screenshot = screenshot.resize({ width: 2560, quality: 'best' })
  const size = screenshot.getSize()
  if (size.width * size.height > 40_000_000) return empty(['截图尺寸过大，已跳过羁绊比对，请裁出结算区域后重试。'])
  const prepared = await prepareBondTemplates(cacheDir)
  if (!prepared.templates.length) return empty(prepared.warnings)
  const templates: BondTemplate[] = []
  for (const item of prepared.templates) {
    const icon = nativeImage.createFromPath(path.join(path.resolve(cacheDir), item.file))
    if (icon.isEmpty()) continue
    const iconSize = icon.getSize()
    if (iconSize.width <= 0 || iconSize.height <= 0 || iconSize.width > 512 || iconSize.height > 512) continue
    const template = createBondTemplate(item.id, item.name, { ...iconSize, data: icon.toBitmap() })
    if (template) templates.push(template)
  }
  const bitmap: BondBitmap = { ...size, data: screenshot.toBitmap() }
  const matches = matchBondIcons(bitmap, templates, regions)
  const warnings = [...prepared.warnings]
  if (matches.length) {
    try {
      const counts = await readCountGlyphs(bitmap, matches, cacheDir)
      for (const match of matches) {
        const enhanced = counts.get(match.id)
        if (enhanced == null) continue
        if (match.count != null && match.count !== enhanced) { match.count = null; warnings.push('部分羁绊数量的识别结果不一致，已留空，请对照原图核对。') }
        else match.count = enhanced
      }
    } catch { warnings.push('羁绊数字增强未完成，图标名称已保留，可手动补充数量。') }
  }
  return { bonds: matches.map(({ id, name, count, score }) => ({ id, name, count, score })), warnings, complete: false }
}
