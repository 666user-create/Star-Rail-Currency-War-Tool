import fs from 'node:fs'
import path from 'node:path'

export interface ResolvedLaunch {
  exe: string
  /** true 表示用的是官方启动器（HYP.exe / launcher.exe） */
  viaLauncher: boolean
}

/**
 * 把用户选的路径解析成用于「启动游戏」的可执行文件。
 *
 * 统一走官方启动器（不做选择）。实测（2026-11-14）：
 * - 米哈游官方已封死直接启动游戏 exe，Game\StarRail.exe 会弹「现在已经不支持」。
 * - 用户机器上真正的官方启动器是 **米哈游启动器 HYP.exe**，位于
 *   <盘>:\miHoYo Launcher\<版本>\HYP.exe（和游戏分目录，不在游戏根下）。
 *   之前误以为游戏根下的 launcher.exe 是官方启动器，实际不是用户在用的那一个。
 * - HYP.exe 打开启动器界面，还需要再手动点一次「开始游戏」。
 *
 * 因此解析顺序（统一走官方启动器）：
 * 1. 在用户填的路径及其上级里找 HYP.exe
 * 2. 在游戏所在盘（及 C 盘）的 miHoYo Launcher 目录里找 HYP.exe
 * 3. 退回游戏根下的 launcher.exe（部分安装可能还有）
 * 4. 最后兜底游戏 exe
 *
 * 两个 exe 的 manifest 都声明 requireAdministrator，都会走 ShellExecute
 * 弹 UAC，这一步无法绕过。
 *
 * 支持用户填：游戏根目录 / Game 目录 / 任意一个 exe 的完整路径。
 */
export function resolveGameLauncher(input: string): ResolvedLaunch | null {
  const raw = (input ?? '').trim().replace(/^"|"$/g, '')
  if (!raw) return null

  // 候选根目录：
  // - 填的是 exe → 其所在目录、以及该目录的上级（游戏根）都算候选
  // - 填的是目录 → 该目录本身 + 上级都算候选（用户填 Game 目录时也能找到上级的启动器）
  const roots: string[] = []
  try {
    if (fs.statSync(raw).isFile()) {
      roots.push(path.dirname(raw), path.dirname(path.dirname(raw)))
    } else {
      roots.push(raw, path.dirname(raw))
    }
  } catch {
    roots.push(raw)
  }

  const exists = (p: string): boolean => {
    try { return fs.statSync(p).isFile() } catch { return false }
  }

  // 1) 用户填的路径里找 HYP.exe（米哈游启动器）
  const hypInPath = roots.map((root) => path.join(root, 'HYP.exe')).find((p) => exists(p))
  if (hypInPath) return { exe: hypInPath, viaLauncher: true }

  // 2) 在游戏所在盘（及 C 盘）的 miHoYo Launcher 目录里找 HYP.exe
  //    仅当用户填的路径真实存在时才扫盘：路径无效时不去别的盘瞎猜启动器。
  if (fs.existsSync(raw)) {
    const hypScanned = findMihoYoLauncher(raw)
    if (hypScanned) return { exe: hypScanned, viaLauncher: true }
  }

  // 3) 退回游戏根下的 launcher.exe
  const launcher = roots.map((root) => path.join(root, 'launcher.exe')).find((p) => exists(p))
  if (launcher) return { exe: launcher, viaLauncher: true }

  // 4) 兜底：游戏 exe
  const gameExePaths = roots.flatMap((root) => [
    path.join(root, 'Game', 'StarRail.exe'),
    path.join(root, 'StarRail.exe')
  ])
  const game = gameExePaths.find((p) => exists(p))
  if (game) return { exe: game, viaLauncher: false }

  return null
}

/**
 * 在各盘的 miHoYo Launcher 目录里找 HYP.exe。
 *
 * 启动器和游戏常分目录（如游戏在 D:\Star Rail，启动器在 D:\miHoYo Launcher），
 * 所以不能只在游戏路径里找。这里扫游戏所在盘 + C 盘的 miHoYo Launcher。
 */
function findMihoYoLauncher(gamePath: string): string | null {
  const drives = new Set<string>()
  try {
    drives.add(path.parse(gamePath).root) // 如 D:\
  } catch { /* 路径异常时忽略 */ }
  drives.add('C:\\') // 系统盘兜底

  for (const drive of drives) {
    const base = path.join(drive, 'miHoYo Launcher')
    if (!fs.existsSync(base)) continue
    // 版本目录（如 1.19.0.382）下找 HYP.exe，最多向下两层
    const found = searchFile(base, 'HYP.exe', 2)
    if (found) return found
  }
  return null
}

/** 在目录里递归找指定文件名（限制深度，避免扫太深） */
function searchFile(dir: string, name: string, maxDepth: number): string | null {
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isFile() && entry.name.toLowerCase() === name.toLowerCase()) return full
      if (entry.isDirectory() && maxDepth > 0) {
        const found = searchFile(full, name, maxDepth - 1)
        if (found) return found
      }
    }
  } catch { /* 目录不可读就跳过 */ }
  return null
}
