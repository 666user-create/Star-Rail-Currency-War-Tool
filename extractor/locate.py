# -*- coding: utf-8 -*-
"""自动探测《崩坏：星穹铁道》安装根目录（只读，不写任何东西）。

探测顺序：
  1. 命令行 --game 显式指定
  2. 环境变量 STAR_RAIL_PATH / HSR_PATH
  3. Windows 卸载登记项（DisplayName 含 Star Rail / 崩坏：星穹铁道）
  4. miHoYo / HoYoPlay 相关注册表里出现过的路径
  5. 常见默认盘符做**深度受限**的目录扫描（找含 Game\\StarRail.exe 的目录）

校验标准：根目录下存在
    Game\\StarRail.exe
  且 Game\\StarRail_Data\\StreamingAssets\\Asb\\Windows 目录
  （兼容少见布局：StarRail_Data 直接位于根目录）
"""
import os
import re
import sys

_GAME_EXE = os.path.join("Game", "StarRail.exe")
_ASB_WIN = os.path.join("StarRail_Data", "StreamingAssets", "Asb", "Windows")

_NAME_RE = re.compile(r"star\s*rail|starrail|崩坏[:：]?星穹铁道", re.I)
_PATH_HINT_RE = re.compile(r"StarRail\.exe|[/\\]Game[/\\]?$", re.I)

# 深度扫描时直接跳过的目录（体积巨大且不可能是游戏根）
_SKIP_DIRS = {
    "Windows", "WinSxS", "System32", "SysWOW64", "$Recycle.Bin",
    "Program Files", "Program Files (x86)", "ProgramData",
    "AppData", ".git", "node_modules", "dist", "out",
}


def is_game_root(path):
    """判断 path 是否为游戏根目录（Game\\StarRail.exe 且 StarRail_Data 在 Game\\ 下）"""
    if not path:
        return False
    root = os.path.abspath(path)
    if not os.path.isfile(os.path.join(root, _GAME_EXE)):
        return False
    # 实际布局：StarRail_Data 位于 Game\\ 之下；兼容直接放根目录的布局
    return (os.path.isdir(os.path.join(root, "Game", _ASB_WIN))
            or os.path.isdir(os.path.join(root, _ASB_WIN)))


def _reg_values(hive_path):
    """尽力枚举某注册表键树下的所有字符串值（读不到就静默跳过）"""
    try:
        import winreg
    except ImportError:
        return
    roots = {
        "HKLM": (winreg.HKEY_LOCAL_MACHINE, ""),
        "HKCU": (winreg.HKEY_CURRENT_USER, ""),
    }
    for short, (hive, _) in roots.items():
        base = hive_path.replace("HKLM", "HKLM", 1)
        sub = base.split("\\", 1)[1] if "\\" in base else ""
        try:
            key = winreg.OpenKey(hive, sub)
        except OSError:
            continue
        stack = [key]
        while stack:
            k = stack.pop()
            try:
                info = winreg.QueryInfoKey(k)
            except OSError:
                continue
            # 值
            for i in range(info[1]):
                try:
                    name, val, typ = winreg.EnumValue(k, i)
                except OSError:
                    break
                if typ == winreg.REG_SZ or typ == winreg.REG_EXPAND_SZ:
                    yield str(val)
            # 子键
            for i in range(info[0]):
                try:
                    child = winreg.OpenKey(k, winreg.EnumKey(k, i))
                except OSError:
                    break
                stack.append(child)
            try:
                k.Close()
            except Exception:
                pass


def _from_registry():
    hits = []
    # 1) 卸载登记项
    for base in (r"HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall",
                 r"HKLM\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall",
                 r"HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall"):
        for val in _reg_values(base) or ():
            if _NAME_RE.search(val) and os.path.isdir(val):
                hits.append(val)
    # 2) miHoYo / HoYoPlay 配置里出现的路径
    for base in (r"HKCU\Software\miHoYo", r"HKLM\Software\miHoYo",
                 r"HKCU\Software\HoYoPlay", r"HKLM\Software\HoYoPlay"):
        for val in _reg_values(base) or ():
            if _PATH_HINT_RE.search(val):
                # 可能直接指向 exe 或 Game 目录，向上找根
                p = val
                for _ in range(4):
                    p = os.path.dirname(p.rstrip("\\/"))
                    if is_game_root(p):
                        hits.append(p)
                        break
    # 去重保序
    out, seen = [], set()
    for h in hits:
        r = os.path.abspath(h)
        if r not in seen:
            seen.add(r)
            out.append(r)
    return out


def _scan_default_roots(max_depth=3, budget_per_root=20000):
    """在常见位置做**先浅后深**的扫描，找含 Game\\StarRail.exe 的目录。

    关键点：每个候选根各自有独立预算，且先检查根本身与它的直接子目录（最常见情况），
    避免大容量系统盘把全局预算耗光、导致其它盘根本没被扫到。
    """
    # 常见安装名（先精确试一遍，几乎零成本）
    common_names = ["Star Rail", "StarRail", "Honkai Star Rail",
                    os.path.join("Games", "Star Rail"),
                    os.path.join("Program Files", "Star Rail"),
                    os.path.join("Program Files (x86)", "Star Rail")]

    # 候选根：所有盘符 + 用户目录 + Program Files
    roots = []
    try:
        import string
        for letter in string.ascii_uppercase:
            drive = f"{letter}:\\"
            if os.path.isdir(drive):
                roots.append(drive)
    except Exception:
        pass
    for extra in (os.path.expanduser("~"),
                  os.environ.get("PROGRAMFILES", ""),
                  os.environ.get("PROGRAMFILES(X86)", "")):
        if extra and os.path.isdir(extra):
            roots.append(extra)

    for start in roots:
        # 0) 根本身
        if is_game_root(start):
            return [start]
        # 1) 常见目录名（直接拼路径，不遍历）
        for nm in common_names:
            cand = os.path.join(start, nm)
            if is_game_root(cand):
                return [cand]
        # 2) 直接子目录（浅层优先）
        try:
            with os.scandir(start) as it:
                for e in it:
                    if e.is_dir(follow_symlinks=False) and is_game_root(e.path):
                        return [e.path]
        except (PermissionError, OSError, FileNotFoundError):
            pass
        # 3) 深度扫描（独立预算）
        visited = 0
        stack = [(start, 1)]
        while stack:
            d, depth = stack.pop()
            visited += 1
            if visited > budget_per_root:
                break
            if depth > max_depth:
                continue
            try:
                with os.scandir(d) as it:
                    for e in it:
                        if not e.is_dir(follow_symlinks=False):
                            continue
                        nm = e.name
                        if nm.startswith((".", "$")) or nm in _SKIP_DIRS:
                            continue
                        if is_game_root(e.path):
                            return [e.path]
                        stack.append((e.path, depth + 1))
            except (PermissionError, OSError, FileNotFoundError):
                continue
    return []


def find_game_root(explicit=None, verbose=True):
    """返回游戏根目录绝对路径；找不到返回 None。"""
    tried = []

    if explicit:
        tried.append(("命令行 --game", explicit))
        if is_game_root(explicit):
            if verbose:
                print(f"[locate] 使用 --game 指定: {os.path.abspath(explicit)}")
            return os.path.abspath(explicit)
        if verbose:
            print(f"[locate] --game 指定的路径无效（缺少 Game\\StarRail.exe 或 Asb\\Windows）: {explicit}")

    for var in ("STAR_RAIL_PATH", "HSR_PATH"):
        v = os.environ.get(var)
        if v:
            tried.append((f"环境变量 {var}", v))
            if is_game_root(v):
                if verbose:
                    print(f"[locate] 来自环境变量 {var}: {os.path.abspath(v)}")
                return os.path.abspath(v)

    if verbose:
        print("[locate] 查注册表…")
    for hit in _from_registry():
        if is_game_root(hit):
            if verbose:
                print(f"[locate] 来自注册表: {hit}")
            return os.path.abspath(hit)

    if verbose:
        print("[locate] 注册表无结果，做深度受限的磁盘扫描…")
    for hit in _scan_default_roots():
        if verbose:
            print(f"[locate] 扫描命中: {hit}")
        return os.path.abspath(hit)

    if verbose:
        print("[locate] 自动探测失败。已尝试：")
        for how, p in tried:
            print(f"    - {how}: {p}")
    return None


def asb_windows_dir(game_root):
    under_game = os.path.join(game_root, "Game", _ASB_WIN)
    if os.path.isdir(under_game):
        return under_game
    return os.path.join(game_root, _ASB_WIN)


if __name__ == "__main__":
    root = find_game_root(sys.argv[1] if len(sys.argv) > 1 else None)
    print("RESULT:", root)
