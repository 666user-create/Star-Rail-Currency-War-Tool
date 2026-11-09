import { app, shell } from 'electron'
import https from 'node:https'
import fs from 'node:fs'
import path from 'node:path'

/**
 * 版本检查：比对远程 Release 的最新版本，有新版本就提示用户去下载。
 *
 * 为什么不做自动安装：本项目以「绿色包」（解压即用）发布，没有安装路径注册，
 * electron-updater 无法替换正在运行的文件。所以这里只做「发现 + 提示」。
 *
 * 请求策略：
 * - 只查 Gitee（国内可直连，GitHub API 常被墙）
 * - 无论成功失败都不影响主功能：任何异常都被吞掉，绝不阻塞启动
 * - 每 24 小时最多查一次（记录在 userData/update-check.json）
 */

const OWNER = 'qq2746993199qq'
const REPO = 'star-rail-currency-war-tool'
/** 下载页（提示里给用户看的） */
const DOWNLOAD_PAGE = `https://gitee.com/${OWNER}/${REPO}/releases`
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000
const TIMEOUT_MS = 8000

interface UpdateState {
  /** 上次检查时间（毫秒） */
  lastCheckAt: number
  /** 上次看到的最新版本号，用于避免同一版本反复提示 */
  lastNotifiedVersion?: string
}

export interface UpdateCheckResult {
  /** 是否有新版本 */
  hasUpdate: boolean
  /** 远程最新版本号（去掉前缀 v），获取失败时为 null */
  latest: string | null
  /** 当前版本 */
  current: string
  /** 下载页地址 */
  downloadPage: string
}

/** 把 1.2.3 / v1.2.3 归一化为 [1,2,3]；无法解析返回 null */
export function parseVersion(input: string): number[] | null {
  const match = /^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?/.exec((input ?? '').trim())
  if (!match) return null
  return [Number(match[1]), Number(match[2] ?? 0), Number(match[3] ?? 0)]
}

/** a > b 返回 1，相等 0，小于 -1。无法解析时视为相等 */
export function compareVersion(a: string, b: string): number {
  const left = parseVersion(a)
  const right = parseVersion(b)
  if (!left || !right) return 0
  for (let i = 0; i < 3; i++) {
    if (left[i] > right[i]) return 1
    if (left[i] < right[i]) return -1
  }
  return 0
}

function statePath(): string {
  return path.join(app.getPath('userData'), 'update-check.json')
}

function readState(): UpdateState {
  try {
    const raw = JSON.parse(fs.readFileSync(statePath(), 'utf8')) as UpdateState
    if (typeof raw?.lastCheckAt === 'number' && Number.isFinite(raw.lastCheckAt)) return raw
  } catch { /* 首次运行或文件损坏都当作没有记录 */ }
  return { lastCheckAt: 0 }
}

function writeState(state: UpdateState): void {
  try {
    fs.mkdirSync(path.dirname(statePath()), { recursive: true })
    fs.writeFileSync(statePath(), JSON.stringify(state, null, 2), 'utf8')
  } catch { /* 状态写入失败不影响检查 */ }
}

/** 请求 Gitee releases/latest，返回 tag_name；失败返回 null。 */
function fetchLatestTag(): Promise<string | null> {
  return new Promise((resolve) => {
    const url = `https://gitee.com/api/v5/repos/${OWNER}/${REPO}/releases/latest`
    let settled = false
    const done = (value: string | null): void => {
      if (settled) return
      settled = true
      resolve(value)
    }
    const request = https.get(url, {
      headers: { 'User-Agent': `currency-war-pet/${app.getVersion()}`, Accept: 'application/json' },
      timeout: TIMEOUT_MS
    }, (response) => {
      if (response.statusCode !== 200) { response.resume(); done(null); return }
      let body = ''
      response.setEncoding('utf8')
      response.on('data', (chunk: string) => {
        body += chunk
        // 防御：异常巨大的响应直接放弃
        if (body.length > 512 * 1024) { request.destroy(); done(null) }
      })
      response.on('end', () => {
        try {
          const parsed = JSON.parse(body) as { tag_name?: unknown }
          done(typeof parsed.tag_name === 'string' ? parsed.tag_name : null)
        } catch { done(null) }
      })
    })
    request.on('timeout', () => { request.destroy(); done(null) })
    request.on('error', () => done(null))
  })
}

/**
 * 检查更新。
 * @param force 为 true 时忽略 24 小时节流（「手动检查」入口用）
 */
export async function checkForUpdate(force = false): Promise<UpdateCheckResult> {
  const current = app.getVersion()
  const state = readState()
  const result = (hasUpdate: boolean, latest: string | null): UpdateCheckResult => ({
    hasUpdate, latest, current, downloadPage: DOWNLOAD_PAGE
  })

  if (!force && Date.now() - state.lastCheckAt < CHECK_INTERVAL_MS) {
    // 节流期内直接返回「无更新」，不打扰用户
    return result(false, null)
  }

  const tag = await fetchLatestTag()
  if (!tag) {
    writeState({ ...state, lastCheckAt: Date.now() })
    return result(false, null)
  }

  const latest = tag.replace(/^v/i, '')
  const hasUpdate = compareVersion(latest, current) > 0
  // 记住已经提示过的版本，避免同一版本每次启动都提示
  writeState({
    lastCheckAt: Date.now(),
    lastNotifiedVersion: hasUpdate ? (state.lastNotifiedVersion === latest ? latest : undefined) : undefined
  })
  return result(hasUpdate, latest)
}

/** 该版本是否已经提示过（用于避免重复气泡）。 */
export function wasNotified(version: string): boolean {
  return readState().lastNotifiedVersion === version
}

/** 记录「已提示过这个版本」。 */
export function markNotified(version: string): void {
  const state = readState()
  writeState({ ...state, lastNotifiedVersion: version })
}

/** 打开下载页，让用户自己去下载新版本。 */
export async function openDownloadPage(): Promise<void> {
  try { await shell.openExternal(DOWNLOAD_PAGE) } catch { /* 打开失败时只能靠用户手动访问 */ }
}

export { DOWNLOAD_PAGE }
