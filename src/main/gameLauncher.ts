import fs from 'node:fs'
import path from 'node:path'

export interface ResolvedLaunch {
  exe: string
  /** true 表示用的是官方启动器 launcher.exe */
  viaLauncher: boolean
}

/**
 * 把用户选的路径解析成用于「启动游戏」的可执行文件。
 *
 * 统一走官方启动器（不做选择）：
 * 结论（实测 2026-11-14）：米哈游官方已封死直接启动游戏 exe ——
 * 启动 Game\StarRail.exe 会弹「现在已经不支持」；官方开始菜单的快捷方式
 * 也只指向 launcher.exe 且不带任何参数。launcher.exe 是**图形启动器**，
 * 启动它只会打开官方启动器界面，还需要再手动点一次「开始游戏」。
 * launcher.exe 的二进制里也不存在能直接进游戏的隐藏命令行参数（已扫描）。
 *
 * 因此唯一受支持的入口就是官方 launcher.exe，这里**固定优先它**；
 * 只有当用户机器上确实没有 launcher.exe 时，才退回游戏 exe 作兜底。
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
  // - 填的是目录 → 该目录本身 + 上级都算候选（用户填 Game 目录时也能找到上级的 launcher.exe）
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

  /** 某根目录下的 launcher.exe 路径 */
  const launcherPaths = roots.map((root) => path.join(root, 'launcher.exe'))
  /** 某根目录下的游戏 exe 候选（Game\StarRail.exe 或直接在目录下） */
  const gameExePaths = roots.flatMap((root) => [
    path.join(root, 'Game', 'StarRail.exe'),
    path.join(root, 'StarRail.exe')
  ])

  const exists = (p: string): boolean => {
    try { return fs.statSync(p).isFile() } catch { return false }
  }

  // 统一：官方启动器是唯一受支持入口，优先找它（全局所有候选根目录）
  const launcher = launcherPaths.find((p) => exists(p))
  if (launcher) return { exe: launcher, viaLauncher: true }

  // 兜底：极少数没装 launcher.exe 的环境，退回游戏 exe
  const game = gameExePaths.find((p) => exists(p))
  if (game) return { exe: game, viaLauncher: false }

  return null
}
