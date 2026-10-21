#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""extract_pet.py —— 从本机已安装的《崩坏：星穹铁道》里提取随宠「说怪话」的官方模型与贴图。

这是**只读**工具：只打开游戏目录下的 .block 文件做解密/解压，绝不写入、移动或修改游戏目录。
产物写到仓库内的 assets/official_pet/（默认文件名固定，供主程序直接加载）。

输出（固定命名）：
    assets/official_pet/pet03.obj      说怪话 Body+Face+Blush 合并模型（已烘部件变换、含 UV、已剔泳圈）
    assets/official_pet/pet03_color.png   Body_Color 贴图
    assets/official_pet/pet03_cool.png    Body_Cool_Ramp 贴图
    assets/official_pet/pet03_warm.png    Body_Warm_Ramp 贴图

用法：
    python extractor/extract_pet.py                     # 自动探测游戏路径
    python extractor/extract_pet.py --game "D:/Star Rail"
    python extractor/extract_pet.py --out "某目录" --processes 6 --verbose

依赖：pip install UnityPy lz4   （ooz.dll 随仓库自带，无需安装）

免责声明见 extractor/README.md。
"""
import argparse
import gc
import io
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

from hsr_block import (iter_bundles, extract_bundle, iter_bundle_cabs,  # noqa: E402
                       HsrBlockError)
from obj_writer import (IDENT, trs_mat, mat_mul, apply_mat, is_identity,  # noqa: E402
                        parse_obj, write_obj, count_lines, bbox, fmt_bbox)
from locate import find_game_root, asb_windows_dir, is_game_root  # noqa: E402
from find_cabs import find_cabs  # noqa: E402

import UnityPy  # noqa: E402

# ---------------------------------------------------------------- 常量
REPO_ROOT = os.path.dirname(HERE)
DEFAULT_OUT = os.path.join(REPO_ROOT, "assets", "official_pet")

# 随宠「说怪话」= PlayerBall_Pet_03 = 内部模型代号 NPC_Special_Complainer_00
PET_MARKER = b"PlayerBall_Pet_03"
PET_MODEL_PREFIX = "NPC_Special_Complainer"

# 已知的 prefab bundle 在该 block 内的偏移（版本相关，仅作加速提示；
# 找不到时会退化为在该 block 内按 PET_MARKER 搜索，所以换版本也能跑）
KNOWN_PREFAB_OFFSET = 964672

# 输出贴图名 → 输出文件名
TEXTURE_EXPORTS = [
    ("Body_Color", "pet03_color.png"),
    ("Body_Cool_Ramp", "pet03_cool.png"),
    ("Body_Warm_Ramp", "pet03_warm.png"),
]

# 不进 combined 的部件（占位几何体 + 官方立绘里没有的泳圈配件）
EXCLUDE_PARTS = {"swimring", "sphere", "cube", "quad", "capsule"}


def log(v, msg):
    if v:
        print(msg, flush=True)


# ---------------------------------------------------------------- step 1: 打开 prefab
def open_bundle_from_block(block_path, bundle_offset=None, marker=None, v=False):
    """返回 (data, hdr, env, cab_paths)。优先用 bundle_offset，否则按 marker 搜索。"""
    data = open(block_path, "rb").read()
    hdrs = list(iter_bundles(data))
    log(v, f"[prefab] {os.path.basename(block_path)} 内含 {len(hdrs)} 个 bundle，"
           f"文件 {len(data)/1024/1024:.1f} MB")

    # 1) 命中提示偏移就先试它
    if bundle_offset is not None:
        for hdr in hdrs:
            if hdr["offset"] == bundle_offset:
                try:
                    env, cabs = _env_of(data, hdr)
                except Exception as e:
                    log(v, f"[prefab] 偏移 {bundle_offset} 打开失败: {e}")
                    env, cabs = None, []
                if env is not None and (marker is None or _cab_has(env, marker)):
                    log(v, f"[prefab] 用提示偏移命中 bundle@{hdr['offset']}")
                    return data, hdr, env, cabs
                if env is not None:
                    del env
                    gc.collect()

    # 2) 退化：逐个 bundle 找 marker
    if marker is not None:
        log(v, "[prefab] 提示偏移未命中，改为在该 block 内按标记搜索…")
        for hdr in hdrs:
            try:
                env, cabs = _env_of(data, hdr)
            except Exception:
                continue
            if env is not None and _cab_has(env, marker):
                log(v, f"[prefab] 标记命中 bundle@{hdr['offset']}")
                return data, hdr, env, cabs
            if env is not None:
                del env
                gc.collect()
    raise RuntimeError(f"在 {os.path.basename(block_path)} 里找不到随宠 prefab bundle")


def _env_of(data, hdr):
    ex = extract_bundle(data, hdr)
    streams, ress = [], []
    for p, b in ex["files"].items():
        if p.endswith(".resS"):
            continue
        s = io.BytesIO(b)
        s.name = p
        streams.append(s)
    if not streams:
        return None, []
    env = UnityPy.load(*streams)
    return env, [p for p in ex["files"] if not p.endswith(".resS")]


def _cab_has(env, marker):
    """便宜的探针：只看非资源对象的原始字节里有没有 marker（避免 read() 抛错）"""
    for obj in env.objects:
        try:
            raw = obj.get_raw_data()
        except Exception:
            continue
        if marker in raw:
            return True
    return False


# ---------------------------------------------------------------- step 2: 部件世界矩阵
def build_go_world(env, v=False):
    """遍历 Transform 层级，算出每个 GameObject 名字 → localToWorld。"""
    go_name, tr_info, go_of_tr = {}, {}, {}
    for o in env.objects:
        t = o.type.name
        if t == "GameObject":
            try:
                go_name[o.path_id] = o.read().m_Name
            except Exception:
                pass
        elif t == "Transform":
            try:
                d = o.read()
            except Exception:
                continue
            go = getattr(d, "m_GameObject", None)
            fa = getattr(d, "m_Father", None)
            p, r, s = d.m_LocalPosition, d.m_LocalRotation, d.m_LocalScale
            tr_info[o.path_id] = (go.path_id if go else 0,
                                  fa.path_id if fa else 0,
                                  trs_mat((p.x, p.y, p.z),
                                          (r.x, r.y, r.z, r.w),
                                          (s.x, s.y, s.z)))
            if go:
                go_of_tr[go.path_id] = o.path_id
    log(v, f"[prefab] GameObject={len(go_name)} Transform={len(tr_info)}")

    memo = {}

    def world(tr_pid, depth=0):
        if tr_pid in memo:
            return memo[tr_pid]
        if tr_pid not in tr_info or depth > 64:
            memo[tr_pid] = IDENT
            return IDENT
        _, fa, local = tr_info[tr_pid]
        w = mat_mul(world(fa, depth + 1), local) if fa else local
        memo[tr_pid] = w
        return w

    go_world = {}
    for gopid, trpid in go_of_tr.items():
        nm = go_name.get(gopid, "")
        if nm and nm not in go_world:
            go_world[nm] = world(trpid)
    return go_world


def externals_of(env):
    out = []
    for f in env.files.values():
        try:
            for e in f.externals:
                m = re.search(r"(CAB-[0-9a-f]{32})", str(e))
                if m:
                    out.append(m.group(1))
        except Exception:
            pass
    return list(dict.fromkeys(out))


# ---------------------------------------------------------------- step 3: 取 mesh
def collect_mesh_parts(go_world, cabs, asb_dir, procs, v=False, max_depth=3):
    """沿 externals 广搜，返回 [(name, verts, uvs, faces), ...]（顶点已烘世界矩阵）。"""
    parts = []
    seen_names = set()
    seen_blocks = set()
    frontier = list(cabs)
    visited_cabs = set()

    for depth in range(max_depth):
        if not frontier:
            break
        frontier = [c for c in frontier if c not in visited_cabs]
        if not frontier:
            break
        log(v, f"[mesh] 第 {depth+1} 层：定位 {len(frontier)} 个 CAB")
        locs = find_cabs(asb_dir, frontier, processes=procs, verbose=v)
        visited_cabs.update(frontier)
        next_frontier = []
        new_blocks = []
        for cab in frontier:
            if cab not in locs:
                continue
            bn, bo = locs[cab]
            key = (bn, bo)
            if key in seen_blocks:
                continue
            seen_blocks.add(key)
            new_blocks.append(key)

        for bn, bo in new_blocks:
            block_path = os.path.join(asb_dir, bn)
            try:
                data = open(block_path, "rb").read()
            except OSError:
                continue
            for hdr in iter_bundles(data):
                if hdr["offset"] != bo:
                    continue
                try:
                    env, _ = _env_of(data, hdr)
                except Exception as e:
                    log(v, f"    {bn}@{bo} 打开失败: {e}")
                    env = None
                if env is None:
                    break
                for o in env.objects:
                    if o.type.name != "Mesh":
                        continue
                    try:
                        md = o.read()
                    except Exception as e:
                        log(v, f"    mesh read 失败: {e}")
                        continue
                    nm = getattr(md, "m_Name", "") or str(o.path_id)
                    if nm in seen_names or nm.lower() in EXCLUDE_PARTS:
                        continue
                    raw = md.export()
                    txt = raw if isinstance(raw, str) else raw.decode("utf-8", "replace")
                    verts, uvs, faces = parse_obj(txt)
                    if not verts:
                        continue
                    M = go_world.get(nm, IDENT)
                    baked = [apply_mat(M, v_) for v_ in verts]
                    parts.append((nm, baked, uvs, faces))
                    seen_names.add(nm)
                    log(v, f"    [{nm}] v={len(baked)} vt={len(uvs)} faces={len(faces)} "
                           f"mat={'IDENTITY' if is_identity(M) else 'BAKED'}")
                    log(v, f"        {fmt_bbox(bbox(baked))}")
                next_frontier.extend(externals_of(env))
                del env
                gc.collect()
                break
            del data
            gc.collect()

        frontier = next_frontier
        if seen_names:
            # 已经拿到 mesh 就够用，不再往下深挖（省时间省内存）
            break

    return parts


# ---------------------------------------------------------------- step 4: 取贴图
def collect_textures(go_world, cabs, asb_dir, procs, v=False):
    """在含 mesh 的那些 .block 里全量解包，捞三条 Complainer 贴图。
    贴图通常和 mesh 同 block，所以只扫这几个 block 很快。"""
    wanted = {k: None for k, _ in TEXTURE_EXPORTS}
    # 先定位 mesh 所在的 block（复用一次 find_cabs）
    locs = find_cabs(asb_dir, cabs, processes=procs, verbose=False)
    blocks = sorted({bn for bn, _ in locs.values()})
    log(v, f"[tex] 在 {len(blocks)} 个 block 里搜贴图: {blocks}")
    for bn in blocks:
        path = os.path.join(asb_dir, bn)
        try:
            data = open(path, "rb").read()
        except OSError:
            continue
        for hdr in iter_bundles(data):
            if not any(n is None for n in wanted.values()):
                break
            # 打开整包（含 .resS 流文件）
            try:
                ex = extract_bundle(data, hdr)
            except Exception:
                continue
            files = {p: b for p, b in ex["files"].items() if b}
            # 先探：非流文件里是否含 Complainer 字样（不含则跳过，省内存）
            if not any(PET_MODEL_PREFIX.encode() in b
                       for p, b in files.items() if not p.endswith(".resS")):
                del files
                continue
            # 关键：.resS 也要设 name 并一起 load，否则 Texture2D.image 报
            # "Resource file CAB-xxx.resS not found"
            streams = []
            for p, b in files.items():
                s = io.BytesIO(b)
                s.name = p
                streams.append(s)
            del files
            if not streams:
                continue
            try:
                env = UnityPy.load(*streams)
            except Exception:
                del streams
                continue
            for o in env.objects:
                if o.type.name != "Texture2D":
                    continue
                try:
                    d = o.read()
                except Exception:
                    continue
                nm = getattr(d, "m_Name", "") or ""
                for key, _out in TEXTURE_EXPORTS:
                    if wanted.get(key) is None and nm.endswith(key):
                        try:
                            wanted[key] = d.image
                        except Exception as e:
                            log(v, f"    贴图 {nm} 解码失败: {e}")
                        log(v, f"    [tex] {nm}")
            del env, streams
            gc.collect()
        del data
        gc.collect()
    return wanted


# ---------------------------------------------------------------- main
def main(argv=None):
    ap = argparse.ArgumentParser(
        description="从本机《崩坏：星穹铁道》提取随宠「说怪话」官方模型与贴图（只读）")
    ap.add_argument("--game", default=None,
                    help="游戏根目录（含 Game\\StarRail.exe）；不给则自动探测")
    ap.add_argument("--out", default=DEFAULT_OUT,
                    help=f"输出目录（默认 {DEFAULT_OUT}）")
    ap.add_argument("--processes", type=int, default=max(1, min(6, (os.cpu_count() or 2) - 1)),
                    help="定位 CAB 用的进程数（默认 min(6, 核数-1)）")
    ap.add_argument("--prefab-offset", type=int, default=KNOWN_PREFAB_OFFSET,
                    help="随宠 prefab bundle 在 block 内的偏移提示（版本相关，找不到会自动搜索）")
    ap.add_argument("--verbose", action="store_true", default=True)
    ap.add_argument("--quiet", dest="verbose", action="store_false")
    args = ap.parse_args(argv)
    v = args.verbose

    # ---- 依赖检查 ----
    try:
        import UnityPy  # noqa: F401
        import lz4.block  # noqa: F401
    except ImportError as e:
        print(f"缺少依赖：{e}\n请先执行：pip install UnityPy lz4", file=sys.stderr)
        return 2
    dll = os.path.join(HERE, "ooz.dll")
    if not os.path.exists(dll):
        print(f"缺少 {dll}（开源 powzix/ooz 解压库，应与脚本同目录）", file=sys.stderr)
        return 2

    # ---- 定位游戏 ----
    root = find_game_root(args.game, verbose=v)
    if not root:
        print("\n找不到《崩坏：星穹铁道》安装目录。请手动指定：", file=sys.stderr)
        print('    python extractor/extract_pet.py --game "D:/Star Rail"', file=sys.stderr)
        return 1
    asb = asb_windows_dir(root)
    if not os.path.isdir(asb):
        print(f"目录不存在：{asb}", file=sys.stderr)
        return 1
    log(v, f"[game] {root}")
    log(v, f"[asb ] {asb}")

    pet_block = os.path.join(asb, "072465116d0a75341688ef20b3317abe.block")
    if not os.path.isfile(pet_block):
        print(f"随宠资产 block 不存在：{pet_block}\n"
              "（该文件名随游戏版本变化；如果你刚更新过游戏，需要重新确认 block 名）",
              file=sys.stderr)
        return 1
    log(v, f"[block] {os.path.basename(pet_block)}")

    os.makedirs(args.out, exist_ok=True)

    # ---- 1. prefab ----
    data, hdr, env, cabs = open_bundle_from_block(
        pet_block, bundle_offset=args.prefab_offset, marker=PET_MARKER, v=v)
    log(v, f"[prefab] bundle@{hdr['offset']}  CAB={cabs[:1]}…")

    # ---- 2. 部件世界矩阵 ----
    go_world = build_go_world(env, v=v)
    ext = externals_of(env)
    del env
    gc.collect()
    log(v, f"[prefab] externals={len(ext)}")

    # ---- 3. mesh（含 UV + 变换烘焙，剔泳圈）----
    parts = collect_mesh_parts(go_world, ext, asb, args.processes, v=v)
    if not parts:
        print("没找到随宠 mesh", file=sys.stderr)
        del data
        return 1

    main_parts = [p for p in parts if p[0].lower() not in EXCLUDE_PARTS] or parts
    log(v, "\n[mesh] combined 部件: " + ", ".join(p[0] for p in main_parts))

    obj_path = os.path.join(args.out, "pet03.obj")
    write_obj(obj_path, main_parts)
    del data
    gc.collect()

    # ---- 4. 贴图 ----
    wanted = collect_textures(go_world, ext, asb, args.processes, v=v)
    saved = []
    for key, fname in TEXTURE_EXPORTS:
        img = wanted.get(key)
        fp = os.path.join(args.out, fname)
        if img is None:
            log(v, f"[tex] 未找到 {key}")
            continue
        img.save(fp)
        saved.append((fname, os.path.getsize(fp)))
        log(v, f"[tex] 写出 {fname}  {img.width}x{img.height}  {os.path.getsize(fp)} B")

    # ---- 自检 ----
    print("\n========== 完成 ==========")
    nv = count_lines(obj_path, "v ")
    nt = count_lines(obj_path, "vt ")
    print(f"  {obj_path}")
    print(f"      v={nv}  vt={nt}  （vt 应≈v，说明 UV 已写入）")
    if nv == 0 or nt == 0:
        print("      !! UV 或顶点缺失", file=sys.stderr)
    for fname, size in saved:
        print(f"  {os.path.join(args.out, fname)}  {size} B")
    if len(saved) < len(TEXTURE_EXPORTS):
        print(f"  !! 只导出了 {len(saved)}/{len(TEXTURE_EXPORTS)} 张贴图", file=sys.stderr)
    print(f"  输出目录: {args.out}")
    return 0 if (nv > 0 and nt > 0 and len(saved) == len(TEXTURE_EXPORTS)) else 1


if __name__ == "__main__":
    sys.exit(main())
