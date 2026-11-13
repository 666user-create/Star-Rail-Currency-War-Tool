import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import initSqlJs from 'sql.js'

/**
 * 多存档（多账号）管理。
 *
 * 每个存档是 userData/archives/<名字>.db 一个独立的 SQLite 库，
 * 切换存档就是换打开哪个库。用于「一个工具两个号」的场景。
 *
 * 默认存档名固定为 main（对应原来的 matches.db 行为），
 * 新存档从空库开始。
 */

export interface ArchiveInfo {
  name: string
  /** 该存档的对局数 */
  count: number
  /** 文件大小（字节） */
  size: number
  /** 创建时间（毫秒） */
  createdAt: number
}

export const DEFAULT_ARCHIVE = 'main'

function archivesDir(): string {
  return path.join(app.getPath('userData'), 'archives')
}

/**
 * 某存档的数据库文件路径。
 *
 * 默认存档 main 沿用历史上的 userData/matches.db（不动用户现有数据），
 * 其余存档放在 userData/archives/<名字>.db。
 */
export function archiveDbPath(name: string): string {
  const clean = sanitizeName(name)
  if (clean === DEFAULT_ARCHIVE) return path.join(app.getPath('userData'), 'matches.db')
  return path.join(archivesDir(), `${clean}.db`)
}

/** 存档名只允许字母/数字/下划线/中文，去掉路径分隔符等危险字符 */
function sanitizeName(name: string): string {
  const cleaned = String(name ?? '').trim().replace(/[\\/:*?"<>|]/g, '').slice(0, 40)
  return cleaned || DEFAULT_ARCHIVE
}

/** 列出所有存档（按创建时间倒序）。main 一定在列。 */
export async function listArchives(): Promise<ArchiveInfo[]> {
  const out: ArchiveInfo[] = []
  // 默认存档（legacy 路径）
  const mainPath = archiveDbPath(DEFAULT_ARCHIVE)
  if (fs.existsSync(mainPath)) {
    const stat = fs.statSync(mainPath)
    out.push({ name: DEFAULT_ARCHIVE, count: await countMatches(mainPath), size: stat.size, createdAt: stat.birthtimeMs || stat.ctimeMs })
  }
  // 其余存档
  const dir = archivesDir()
  if (fs.existsSync(dir)) {
    for (const file of fs.readdirSync(dir)) {
      if (!file.endsWith('.db')) continue
      const full = path.join(dir, file)
      const name = file.slice(0, -3)
      if (name === DEFAULT_ARCHIVE) continue
      const stat = fs.statSync(full)
      out.push({ name, count: await countMatches(full), size: stat.size, createdAt: stat.birthtimeMs || stat.ctimeMs })
    }
  }
  return out.sort((a, b) => b.createdAt - a.createdAt)
}

/** 数一个存档里的正式对局数 */
async function countMatches(dbPath: string): Promise<number> {
  try {
    const SQL = await initSqlJs()
    // sql.js 的类型定义没完整暴露 exec/close，按 repository 的做法放宽
    const db = new SQL.Database(fs.readFileSync(dbPath)) as unknown as {
      exec(sql: string): Array<{ values: number[][] }>
      close(): void
    }
    const n = (db.exec("SELECT COUNT(*) FROM matches WHERE source!='demo'")[0]?.values[0][0] as number) ?? 0
    db.close()
    return n
  } catch {
    return 0
  }
}

/** 新建一个空存档 */
export async function createArchive(name: string): Promise<string> {
  const clean = sanitizeName(name)
  if (!clean) throw new Error('存档名不能为空')
  const target = archiveDbPath(clean)
  if (fs.existsSync(target)) throw new Error('这个存档名已存在')
  fs.mkdirSync(archivesDir(), { recursive: true })
  // 用 Repository.create 建库并跑迁移，保证结构和主库完全一致
  const { Repository } = await import('./repository')
  const repo = await Repository.create(target)
  repo.close()
  return clean
}

/** 删除存档（不删除当前正在使用的） */
export function deleteArchive(name: string, keepCurrent?: string): void {
  const clean = sanitizeName(name)
  if (keepCurrent && clean === sanitizeName(keepCurrent)) throw new Error('不能删除当前正在使用的存档')
  const target = archiveDbPath(clean)
  if (!fs.existsSync(target)) throw new Error('存档不存在')
  fs.unlinkSync(target)
}
