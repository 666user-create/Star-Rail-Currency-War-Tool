/// <reference types="electron-vite/node" />
import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { createBondTemplate, matchBondIcons, type BondBitmap, type BondRegions, type BondTemplate } from './bondImageMatcher'

const CONFIG_URL = 'https://sg-act-public-api.hoyolab.com/event/rpgcurrencywar/game/config?game=hkrpg'
const MAX_ICON_BYTES = 512 * 1024
interface CachedBond { id: string; name: string; file: string; url: string }
interface PreparedBonds { templates: CachedBond[]; warnings: string[] }
export interface BondRecognitionResult {
  bonds: Array<{ id: string; name: string; score: number }>
  warnings: string[]
  complete: boolean
}
const preparing = new Map<string, Promise<PreparedBonds>>()

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
    if (!Array.isArray(candidates) || candidates.length > 200) return empty
    const expectedCount = saved && typeof saved === 'object' && 'expectedCount' in saved && Number.isInteger(saved.expectedCount) && Number(saved.expectedCount) <= 200 ? Number(saved.expectedCount) : candidates.length
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

/**
 * 羁绊图标库多久刷新一次。新赛季会出新羁绊，旧逻辑「有缓存就永不刷新」认不出新羁绊。
 * 与角色库同一节奏（7 天）。
 */
const BOND_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000

/** 读缓存里的下载时间；读不到返回 0（视为很旧，需要刷新）。 */
async function bondCacheAge(directory: string): Promise<number> {
  try {
    const raw = JSON.parse(await fs.readFile(path.join(directory, 'manifest.json'), 'utf8')) as { downloadedAt?: unknown }
    return typeof raw?.downloadedAt === 'number' && Number.isFinite(raw.downloadedAt)
      ? Date.now() - raw.downloadedAt
      : Number.POSITIVE_INFINITY
  } catch { return Number.POSITIVE_INFINITY }
}

/** 首次仅下载官方攻略页公开的羁绊小图标；后续有缓存即完全离线，不发送截图或账号信息。 */
export function prepareBondTemplates(cacheDir: string): Promise<PreparedBonds> {
  const directory = path.resolve(cacheDir)
  const previous = preparing.get(directory)
  if (previous) return previous
  const pending = (async (): Promise<PreparedBonds> => {
    const cached = await readCache(directory)
    const stale = (await bondCacheAge(directory)) > BOND_CACHE_TTL_MS
    // 有缓存且未过期：直接用（离线，不联网）
    if (cached.templates.length && !stale) return cached
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
      // 安全兜底：新图标库比旧缓存少一半以上，视为官方接口异常，保留旧缓存
      if (cached.templates.length && available.length < cached.templates.length * 0.5) {
        warnings.push('新羁绊图标库异常偏少，已回退到上一次的缓存。')
        return { templates: cached.templates, warnings }
      }
      await atomicFile(path.join(directory, 'manifest.json'), JSON.stringify({ source: CONFIG_URL, downloadedAt: Date.now(), expectedCount: entries.length, templates: available }))
      if (available.length < entries.length) warnings.push('部分羁绊图标未缓存成功，识别可能有遗漏，可按原图补充。')
      return { templates: available, warnings }
    } catch {
      // 刷新失败时若已有旧缓存，继续用旧的（避免从「能识别」退化到「一个都不认」）
      if (cached.templates.length) {
        warnings.push('羁绊图标库刷新失败，继续使用本机缓存（不影响已有羁绊识别）。')
        return { templates: cached.templates, warnings }
      }
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
  // 只输出羁绊名称：数量识别（图标角落小数字）成功率低且需额外 PowerShell 链路，
  // 已移除，改由用户按原图在核对页手填，避免"有的带×有的不带"的困惑。
  const warnings = [...prepared.warnings]
  if (!matches.length) warnings.push('未能可靠识别羁绊图标，请按原图补充羁绊名称。')
  return { bonds: matches.map(({ id, name, score }) => ({ id, name, score })), warnings, complete: false }
}
