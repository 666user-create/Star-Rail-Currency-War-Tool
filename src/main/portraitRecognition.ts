import { nativeImage, net } from 'electron'
import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { matchPortraitPixels, type PortraitPixels, type PortraitReference, type PortraitRegion } from './portraitMatcher'

interface RoleTemplate { id: string; name: string; icon: string; kind?: 'character'; file?: string }
interface Manifest { version: 2; roles: RoleTemplate[] }
interface Preparation { count: number; warnings: string[] }
const CONFIG_URL = 'https://sg-act-public-api.hoyolab.com/event/rpgcurrencywar/game/config?game=hkrpg'
const LEGACY_URL = 'https://raw.githubusercontent.com/Mar-7th/StarRailRes/master/index_min/cn/characters.json'
const MAX_METADATA = 4 * 1024 * 1024, MAX_TEMPLATE = 1024 * 1024
const preparing = new Map<string, Promise<Preparation>>()
const recentlyPrepared = new Map<string, { at: number; value: Preparation }>()
const loaded = new Map<string, { count: number; references: PortraitReference[] }>()

function allowedUrl(value: string): boolean {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return false
    return (url.hostname === 'act-webstatic.hoyoverse.com' && url.pathname.startsWith('/darkmatter/hkrpg/')) ||
      (url.hostname === 'raw.githubusercontent.com' && /^\/Mar-7th\/StarRailRes\/master\/(?:index_min\/cn\/characters\.json|icon\/character\/\d+\.png)$/.test(url.pathname)) ||
      (url.hostname === 'sg-act-public-api.hoyolab.com' && url.pathname === '/event/rpgcurrencywar/game/config')
  } catch { return false }
}

async function download(url: string, maximum: number, headers?: Record<string, string>, budget?: AbortSignal): Promise<Buffer> {
  if (!allowedUrl(url)) throw new Error('头像资源地址不在允许的公开来源中')
  // 只下载公开配置/模板，遵循系统代理；不附带账号cookie或本地截图内容。
  const timeout = AbortSignal.timeout(12_000)
  const response = await net.fetch(url, { headers, credentials: 'omit', redirect: 'error', signal: budget ? AbortSignal.any([budget, timeout]) : timeout })
  if (!response.ok || Number(response.headers.get('content-length')) > maximum) throw new Error('头像资源暂时无法下载')
  if (!response.body) throw new Error('头像资源为空')
  const reader = response.body.getReader(), chunks: Uint8Array[] = []
  let length = 0
  try {
    while (true) {
      const item = await reader.read()
      if (item.done) break
      length += item.value.length
      if (length > maximum) throw new Error('头像资源超过大小限制')
      chunks.push(item.value)
    }
  } finally { await reader.cancel().catch(() => {}) }
  return Buffer.concat(chunks)
}

function validRole(value: unknown): value is RoleTemplate {
  if (!value || typeof value !== 'object') return false
  const role = value as RoleTemplate
  return /^\d{3,8}$/.test(role.id) && typeof role.name === 'string' && role.name.length > 0 && role.name.length < 100 &&
    typeof role.icon === 'string' && allowedUrl(role.icon) && (role.kind === undefined || role.kind === 'character') &&
    (role.file === undefined || /^(?:legacy-)?\d{3,8}\.png$/.test(role.file))
}

async function readManifest(directory: string): Promise<Manifest | null> {
  try {
    const data = JSON.parse(await fs.readFile(path.join(directory, 'manifest.json'), 'utf8')) as Manifest
    return data.version === 2 && Array.isArray(data.roles) && data.roles.length <= 220 && data.roles.length > 0 && data.roles.every(validRole) ? data : null
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EACCES' || (error as NodeJS.ErrnoException).code === 'EPERM') throw error
    return null
  }
}

async function writeCache(file: string, contents: Uint8Array): Promise<void> {
  const temporary = `${file}.${randomUUID()}.tmp`
  try { await fs.writeFile(temporary, contents, { flag: 'wx' }); await fs.rename(temporary, file) }
  finally { await fs.unlink(temporary).catch(() => {}) }
}

async function createManifest(directory: string, warnings: string[], budget: AbortSignal): Promise<Manifest> {
  const config = JSON.parse((await download(CONFIG_URL, MAX_METADATA, { 'x-rpc-lang': 'zh-cn', 'x-rpc-currencywar-tourn': 'tourn' }, budget)).toString('utf8'))
  if (config.retcode !== 0 || !Array.isArray(config.data?.role_list)) throw new Error('公开角色配置无法读取')
  const roles: RoleTemplate[] = config.data.role_list.map((role: RoleTemplate) => ({ id: String(role.id), name: role.name, icon: role.icon })).filter(validRole)
  if (roles.length < 20) throw new Error('公开角色配置不完整')
  try {
    const legacy = JSON.parse((await download(LEGACY_URL, MAX_METADATA, undefined, budget)).toString('utf8')) as Record<string, { id: string; name: string; icon: string }>
    const current = new Set(roles.map(role => role.id))
    for (const role of Object.values(legacy)) {
      if (!role || current.has(String(role.id)) || !/^icon\/character\/\d+\.png$/.test(role.icon)) continue
      const template: RoleTemplate = { id: String(role.id), name: role.name === '{NICKNAME}' ? '开拓者' : role.name,
        icon: 'https://raw.githubusercontent.com/Mar-7th/StarRailRes/master/' + role.icon, kind: 'character', file: `legacy-${role.id}.png` }
      if (validRole(template)) roles.push(template)
    }
  } catch { warnings.push('旧赛季补充头像暂不可用，缺少的角色仍可手填。') }
  const manifest: Manifest = { version: 2, roles }
  await writeCache(path.join(directory, 'manifest.json'), Buffer.from(JSON.stringify(manifest), 'utf8'))
  return manifest
}

/** cacheDir为userData/image-templates/portraits叶目录；只缓存小头像，不读取游戏文件。 */
export function preparePortraitTemplates(cacheDir: string): Promise<Preparation> {
  const directory = path.resolve(cacheDir)
  const recent = recentlyPrepared.get(directory)
  if (recent && Date.now() - recent.at < 60_000) return Promise.resolve(recent.value)
  const existing = preparing.get(directory)
  if (existing) return existing
  const pending = (async (): Promise<Preparation> => {
    const warnings: string[] = []
    try {
      await fs.mkdir(directory, { recursive: true })
      const budget = AbortSignal.timeout(25_000)
      const manifest = await readManifest(directory) ?? await createManifest(directory, warnings, budget)
      let index = 0, count = 0, failures = 0
      await Promise.all(Array.from({ length: 4 }, async () => {
        while (index < manifest.roles.length && !budget.aborted) {
          const role = manifest.roles[index++], file = path.join(directory, role.file ?? `${role.id}.png`)
          try {
            const stat = await fs.stat(file).catch(() => null)
            if (stat?.isFile() && stat.size > 0 && stat.size <= MAX_TEMPLATE) { count++; continue }
            const bytes = await download(role.icon, MAX_TEMPLATE, undefined, budget)
            if (nativeImage.createFromBuffer(bytes).isEmpty()) throw new Error('头像图片无效')
            await writeCache(file, bytes)
            count++
          } catch { failures++ }
        }
      }))
      if (failures || count < manifest.roles.length) warnings.push(`${manifest.roles.length - count}张头像模板暂未准备好，对应角色可手动补充，稍后可重新识别。`)
      return { count, warnings }
    } catch { return { count: 0, warnings: ['本地头像模板暂不可用，文字识别与手动填写仍可使用。'] } }
  })().then(value => {
    if (value.count > 0) recentlyPrepared.set(directory, { at: Date.now(), value })
    return value
  }).finally(() => preparing.delete(directory))
  preparing.set(directory, pending)
  return pending
}

function imagePixels(image: Electron.NativeImage): PortraitPixels {
  const { width, height } = image.getSize(), source = image.toBitmap(), data = new Uint8Array(source.length)
  for (let i = 0; i < source.length; i += 4) { data[i] = source[i + 2]; data[i + 1] = source[i + 1]; data[i + 2] = source[i]; data[i + 3] = source[i + 3] }
  return { width, height, data }
}

async function references(cacheDir: string, count: number): Promise<PortraitReference[]> {
  const previous = loaded.get(cacheDir)
  if (previous?.count === count) return previous.references
  const manifest = await readManifest(cacheDir)
  if (!manifest) return []
  const templates: PortraitReference[] = []
  for (const role of manifest.roles) {
    try {
      const image = nativeImage.createFromBuffer(await fs.readFile(path.join(cacheDir, role.file ?? `${role.id}.png`)))
      if (!image.isEmpty()) templates.push({ id: role.id, name: role.name, kind: role.kind, image: imagePixels(image) })
    } catch { /* 单张模板损坏不阻塞其他角色。 */ }
  }
  loaded.set(cacheDir, { count, references: templates })
  return templates
}

export async function recognizePortraits(imagePath: string, cacheDir: string, regions?: { lineup?: PortraitRegion; bonds?: PortraitRegion }): Promise<{
  characters: Array<{ id: string; name: string; score: number; rect?: PortraitRegion }>; warnings: string[]; complete?: boolean
}> {
  const preparation = await preparePortraitTemplates(cacheDir)
  if (!preparation.count) return { characters: [], warnings: preparation.warnings, complete: false }
  try {
    let image = nativeImage.createFromBuffer(await fs.readFile(imagePath))
    if (image.isEmpty()) throw new Error('截图无法读取')
    const size = image.getSize()
    if (size.width * size.height > 24_000_000) throw new Error('截图尺寸过大')
    const scale = Math.min(1, 1800 / size.width, 2800 / size.height)
    if (scale < 1) image = image.resize({ width: Math.round(size.width * scale), height: Math.round(size.height * scale), quality: 'good' })
    const result = matchPortraitPixels(imagePixels(image), await references(path.resolve(cacheDir), preparation.count), regions?.lineup)
    return { characters: result.characters, warnings: [...preparation.warnings, ...result.warnings], complete: result.complete }
  } catch { return { characters: [], warnings: [...preparation.warnings, '头像未能可靠识别，请对照原图填写阵容。'], complete: false } }
}
