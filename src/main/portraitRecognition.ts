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
    return data.version === 2 && Array.isArray(data.roles) && data.roles.length <= 400 && data.roles.length > 0 && data.roles.every(validRole) ? data : null
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EACCES' || (error as NodeJS.ErrnoException).code === 'EPERM') throw error
    return null
  }
}

/**
 * 角色库多久刷新一次。
 * 新赛季会出新角色，旧逻辑「有缓存就永不刷新」会导致新角色永远认不出。
 * 设 7 天：既能让新赛季角色在开服后一周内自动补上，又不会频繁打扰官方接口。
 */
const MANIFEST_TTL_MS = 7 * 24 * 60 * 60 * 1000

/** manifest.json 的修改时间，用作「上次刷新」时间。 */
async function manifestAge(directory: string): Promise<number> {
  try {
    const stat = await fs.stat(path.join(directory, 'manifest.json'))
    return Date.now() - stat.mtimeMs
  } catch { return Number.POSITIVE_INFINITY }
}

/**
 * 取角色清单：过期或不存在就去拉最新版。
 * 关键安全策略：**刷新失败绝不覆盖旧缓存**，否则官方接口抖动会让用户从
 * 「能识别 104 个角色」退化到「一个都认不出」。所以先建新的，成功了才落盘。
 */
async function resolveManifest(directory: string, warnings: string[], budget: AbortSignal): Promise<Manifest | null> {
  const cached = await readManifest(directory)
  const stale = (await manifestAge(directory)) > MANIFEST_TTL_MS
  if (cached && !stale) return cached

  // 需要刷新（或没有缓存）
  if (!cached) {
    // 全新安装：只能新建，失败就没有可用的
    return createManifest(directory, warnings, budget)
  }

  // 有旧缓存但过期：尝试刷新；传入旧清单以便保留本赛季下架的历史角色
  try {
    const fresh = await createManifest(directory, [], budget, cached)
    // createManifest 内部已落盘；这里只做「新清单是否比旧的更差」的兜底判断
    if (fresh.roles.length < cached.roles.length * 0.5) {
      warnings.push('新角色库异常偏少，已回退到上一次的缓存。')
      await writeCache(path.join(directory, 'manifest.json'), Buffer.from(JSON.stringify(cached), 'utf8'))
      return cached
    }
    return fresh
  } catch {
    warnings.push('角色库刷新失败，继续使用本机缓存（不影响已有角色识别）。')
    return cached
  }
}

async function writeCache(file: string, contents: Uint8Array): Promise<void> {
  const temporary = `${file}.${randomUUID()}.tmp`
  try { await fs.writeFile(temporary, contents, { flag: 'wx' }); await fs.rename(temporary, file) }
  finally { await fs.unlink(temporary).catch(() => {}) }
}

/**
 * 从官方配置构建角色清单。
 * @param previous 旧清单；提供时会保留「新的官方清单里没有、但旧清单有」的角色，
 *   避免赛季更替后旧赛季角色从库里消失（4.7 把 ID 从 1508 改成 150302，且下架了一批角色）。
 */
async function createManifest(directory: string, warnings: string[], budget: AbortSignal, previous?: Manifest | null): Promise<Manifest> {
  const config = JSON.parse((await download(CONFIG_URL, MAX_METADATA, { 'x-rpc-lang': 'zh-cn', 'x-rpc-currencywar-tourn': 'tourn' }, budget)).toString('utf8'))
  if (config.retcode !== 0 || !Array.isArray(config.data?.role_list)) throw new Error('公开角色配置无法读取')
  const roles: RoleTemplate[] = config.data.role_list.map((role: RoleTemplate) => ({ id: String(role.id), name: role.name, icon: role.icon })).filter(validRole)
  if (roles.length < 20) throw new Error('公开角色配置不完整')

  // 4.7 起官方 ID 改成「角色id+赛季号」(1508→150302)，同一个角色可能同时出现在两个名单里，
  // 所以补充角色时按「名字」去重，不能按 id。
  const names = new Set(roles.map((role) => role.name))
  const ids = new Set(roles.map((role) => role.id))

  try {
    const legacy = JSON.parse((await download(LEGACY_URL, MAX_METADATA, undefined, budget)).toString('utf8')) as Record<string, { id: string; name: string; icon: string }>
    for (const role of Object.values(legacy)) {
      if (!role || !role.name || !/^icon\/character\/\d+\.png$/.test(role.icon)) continue
      const name = role.name === '{NICKNAME}' ? '开拓者' : role.name
      if (ids.has(String(role.id)) || names.has(name)) continue
      const template: RoleTemplate = { id: String(role.id), name,
        icon: 'https://raw.githubusercontent.com/Mar-7th/StarRailRes/master/' + role.icon, kind: 'character', file: `legacy-${role.id}.png` }
      if (validRole(template)) { roles.push(template); names.add(name); ids.add(String(role.id)) }
    }
  } catch { warnings.push('旧赛季补充头像暂不可用，缺少的角色仍可手填。') }

  // 关键：保留旧清单里的角色，避免赛季更替后识别退化。
  // 分两种情况：
  //   a) 新清单完全没有这个角色（下架的联动角色如远坂凛/Saber）→ 必须保留
  //   b) 新清单有同名角色，但官方换了图标（4.7 实测「真珠」立绘变了）→ 旧模板也保留，
  //      这样旧截图匹配旧模板、新截图匹配新模板，两边都能认出来。
  if (previous) {
    let keptGone = 0
    let keptAlt = 0
    for (const old of previous.roles) {
      const sameName = names.has(old.name)
      const sameId = ids.has(old.id)
      if (sameId) continue // 完全同一条，新清单已覆盖
      if (sameName) {
        // 同名但 ID 不同：视为官方换了图标/重构了条目，保留旧模板做兼容
        const oldFile = path.join(directory, (old.file ?? `${old.id}.png`))
        try {
          const info = await fs.stat(oldFile)
          if (info.isFile() && info.size > 0) { roles.push(old); keptAlt++ }
        } catch { /* 旧头像文件不在就不保留 */ }
        continue
      }
      // 新清单没有这个角色：保留（头像文件还在才有意义）
      const oldFile = path.join(directory, (old.file ?? `${old.id}.png`))
      try {
        const info = await fs.stat(oldFile)
        if (info.isFile() && info.size > 0) { roles.push(old); names.add(old.name); ids.add(old.id); keptGone++ }
      } catch { /* 文件不在就跳过 */ }
    }
    if (keptGone > 0) warnings.push(`已保留 ${keptGone} 个本赛季下架的历史角色，仍可正常识别。`)
    if (keptAlt > 0) warnings.push(`已保留 ${keptAlt} 个旧版头像作为兼容模板，旧截图仍能识别。`)
  }

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
      const manifest = await resolveManifest(directory, warnings, budget)
      if (!manifest) { warnings.push('角色库不可用，请手动填写角色名。'); return { count: 0, warnings } }
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
