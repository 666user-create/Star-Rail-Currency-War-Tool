# -*- coding: utf-8 -*-
"""在 Asb\\Windows 下按 CAB 名定位它在哪个 .block / bundle 里。

只解每个 bundle 的 blocksInfo（LZ4HC，约 300 字节），**不解数据块**，所以很快也很省内存。
用于替代被 gitignore 的 cab_index.json。

用法:
    python extractor/find_cabs.py <Asb\\Windows目录> <CAB名1> [CAB名2 ...]
内存纪律：单进程一次只持有一个 .block（约 6MB），处理完立即释放；
          多进程只是 I/O 并行，每个子进程同样只持 6MB。
"""
import multiprocessing as mp
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from hsr_block import iter_bundles, read_blocks_info, HsrBlockError  # noqa: E402


def _scan_one(args):
    """worker：扫一个 .block，返回 {cab: (block名, bundle偏移)}"""
    block_name, path, wanted = args
    found = {}
    try:
        with open(path, "rb") as f:
            data = f.read()
    except OSError:
        return found
    for hdr in iter_bundles(data):
        try:
            _, nodes, _ = read_blocks_info(data, hdr)
        except HsrBlockError:
            continue
        except Exception:
            continue
        for nd in nodes:
            p = nd["path"]
            if p in wanted and p not in found:
                found[p] = (block_name, hdr["offset"])
        if len(found) == len(wanted):
            break
    del data
    return found


def find_cabs(asb_dir, wanted, processes=4, verbose=True):
    """返回 {cab名: (block文件名, bundle偏移)}。找到全部 wanted 就提前结束。"""
    wanted = set(wanted)
    files = sorted(f for f in os.listdir(asb_dir) if f.endswith(".block"))
    if verbose:
        print(f"[find_cabs] 扫描 {len(files)} 个 .block，用 {processes} 进程，"
              f"目标 CAB {len(wanted)} 个", flush=True)
    results = {}
    tasks = ((f, os.path.join(asb_dir, f), tuple(wanted)) for f in files)
    ctx = mp.get_context("spawn")
    with ctx.Pool(processes) as pool:
        for i, res in enumerate(pool.imap_unordered(_scan_one, tasks, chunksize=8), 1):
            for cab, loc in res.items():
                results.setdefault(cab, loc)
            if verbose and i % 500 == 0:
                print(f"[find_cabs]  已扫 {i}/{len(files)}，命中 {len(results)}/{len(wanted)}",
                      flush=True)
            if len(results) >= len(wanted):
                if verbose:
                    print(f"[find_cabs]  已全部命中（第 {i} 个文件处提前结束）", flush=True)
                pool.terminate()
                break
    if verbose:
        missing = wanted - set(results)
        if missing:
            print(f"[find_cabs]  未找到 {len(missing)} 个: {sorted(missing)[:5]}…", flush=True)
    return results


if __name__ == "__main__":
    d = sys.argv[1]
    print(find_cabs(d, sys.argv[2:]))
