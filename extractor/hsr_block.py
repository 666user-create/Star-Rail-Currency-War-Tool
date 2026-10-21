# -*- coding: utf-8 -*-
"""HSR（崩坏：星穹铁道）.block 资产包解析（只读）。

格式依据社区逆向（Escartem/AnimeStudio 的 AnimeStudio/BundleFile.cs 中 `case "ENCR"` 分支）：
  一个 .block = 多个 UnityFS bundle 首尾相接；每个 bundle 把签名 "UnityFS\\0" 换成 "ENCR\\0"，
  头部为**大端序**、固定 25 字节：
      "ENCR\\0"                     5 字节
      int64  size                   该 bundle 总字节长（含签名），用于切分串联的多个 bundle
      uint32 compressedBlocksInfoSize
      uint32 uncompressedBlocksInfoSize
      uint32 flags                  低 6 位=压缩类型(3=LZ4HC)；0x40=blocksInfo 紧随头部；
                                    0x80=blocksInfo 在尾部；0x200=头部后对齐 16
      [blocksInfo: compressedBlocksInfoSize 字节]  按 flags 低 6 位解压
      [数据 blocks ...]
  blocksInfo 解压后（ENCR 特有：**没有** 16 字节 uncompressedDataHash）：
      int32  blocksCount
      { uint32 uncompressedSize; uint32 compressedSize; uint16 flags } * blocksCount
      int32  nodesCount
      { int64 offset; int64 size; uint32 flags; cstr path } * nodesCount
  数据块按各自 flags 低 6 位解压（0=None 1=LZMA 2=LZ4 3=LZ4HC 5=Zstd/Lz4Mr0k 6=OodleHSR 7=OodleMr0k 9=Oodle），
  拼接后按 node 的 offset/size 切出各个 CAB（内部即 Unity SerializedFile）。
"""
import contextlib
import io
import os
import struct
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from lz4.block import decompress as _lz4_decompress  # noqa: E402

# 压缩类型常量（与 AnimeStudio CompressionType 对齐）
CT_NONE, CT_LZMA, CT_LZ4, CT_LZ4HC = 0, 1, 2, 3
CT_ZSTD_OR_MR0K, CT_OODLE_HSR, CT_OODLE_MR0K, CT_OODLE = 5, 6, 7, 9


class HsrBlockError(Exception):
    pass


def _lz4(data: bytes, usize: int) -> bytes:
    # UnityFS 数据块是 raw LZ4 block（无 frame 头）
    return _lz4_decompress(data, uncompressed_size=usize)


def _zstd(data: bytes, usize: int) -> bytes:
    try:
        import zstandard  # type: ignore
    except ImportError as e:
        raise HsrBlockError("需要 zstandard 包: pip install zstandard") from e
    return zstandard.ZstdDecompressor().decompress(data, max_output_size=usize)


def _lzma(data: bytes, usize: int) -> bytes:
    import lzma
    try:
        return lzma.decompress(data, format=lzma.FORMAT_ALONE)
    except Exception:
        return lzma.decompress(data)


_MR0K = None


def _mr0k_decrypt(buf: bytes) -> bytes:
    """mr0k 前置解密（算法与常量来自开源项目 Escartem/HoyoCooker 的 crypto.py/keys.py）"""
    global _MR0K
    if _MR0K is None:
        import mr0k_crypto
        _MR0K = mr0k_crypto
    with open(os.devnull, "w") as _dn, contextlib.redirect_stdout(_dn):
        return bytes(_MR0K.decryptMr0k(bytearray(buf)))


def decompress_by_type(ct: int, data: bytes, usize: int, what: str = "") -> bytes:
    if ct == CT_NONE:
        return data[:usize]
    if ct in (CT_LZ4, CT_LZ4HC):
        return _lz4(data, usize)
    if ct == CT_LZMA:
        return _lzma(data, usize)
    if ct == CT_ZSTD_OR_MR0K:
        return _zstd(data, usize)
    if ct in (CT_OODLE_HSR, CT_OODLE_MR0K, CT_OODLE):
        import oodle
        if ct == CT_OODLE_MR0K and data[:4] == b"mr0k":
            data = _mr0k_decrypt(data)
        return oodle.decompress(data, usize)
    raise HsrBlockError(f"{what}: 未知压缩类型 {ct}")


def parse_encr_header(data: bytes, pos: int = 0) -> dict:
    if data[pos:pos + 5] != b"ENCR\x00":
        raise HsrBlockError(f"offset {pos} 处不是 ENCR 签名: {data[pos:pos + 8]!r}")
    p = pos + 5
    size, comp_bi, uncomp_bi, flags = struct.unpack(">qIII", data[p:p + 20])
    return {
        "offset": pos,
        "size": size,
        "comp_bi": comp_bi,
        "uncomp_bi": uncomp_bi,
        "flags": flags,
        "ct": flags & 0x3F,
        "header_end": pos + 25,
    }


def read_blocks_info(data: bytes, hdr: dict) -> tuple:
    """返回 (blocks, nodes, data_start)"""
    flags = hdr["flags"]
    if flags & 0x80:  # BlocksInfoAtTheEnd
        start = hdr["offset"] + hdr["size"] - hdr["comp_bi"]
    else:
        start = hdr["header_end"]
    raw = data[start:start + hdr["comp_bi"]]
    if len(raw) != hdr["comp_bi"]:
        raise HsrBlockError("blocksInfo 读取越界")
    bi = decompress_by_type(hdr["ct"], raw, hdr["uncomp_bi"], "blocksInfo")

    r = io.BytesIO(bi)

    def rd(n):
        b = r.read(n)
        if len(b) != n:
            raise HsrBlockError("blocksInfo 解析越界")
        return b

    blocks_count = struct.unpack(">i", rd(4))[0]
    if not (0 < blocks_count < 1_000_000):
        raise HsrBlockError(f"blocksCount 异常: {blocks_count}")
    blocks = []
    for _ in range(blocks_count):
        usize, csize = struct.unpack(">II", rd(8))
        bflags = struct.unpack(">H", rd(2))[0]
        blocks.append((usize, csize, bflags))

    nodes_count = struct.unpack(">i", rd(4))[0]
    if not (0 <= nodes_count < 1_000_000):
        raise HsrBlockError(f"nodesCount 异常: {nodes_count}")
    nodes = []
    for _ in range(nodes_count):
        off, size = struct.unpack(">qq", rd(16))
        nflags = struct.unpack(">I", rd(4))[0]
        path = bytearray()
        while True:
            c = rd(1)
            if c == b"\x00":
                break
            path += c
        nodes.append({"offset": off, "size": size, "flags": nflags,
                      "path": path.decode("utf-8", "replace")})

    if flags & 0x80:
        data_start = hdr["header_end"]
    else:
        data_start = start + hdr["comp_bi"]
    if flags & 0x200:  # BlockInfoNeedPaddingAtStart
        data_start = (data_start + 15) & ~15
    return blocks, nodes, data_start


def iter_bundles(data: bytes):
    """按 header.size 依次产出该 .block 内每个 bundle 的头部解析结果"""
    pos = 0
    n = len(data)
    while pos + 25 <= n:
        if data[pos:pos + 5] != b"ENCR\x00":
            break
        hdr = parse_encr_header(data, pos)
        yield hdr
        if hdr["size"] <= 0:
            break
        pos += hdr["size"]


def iter_bundle_cabs(data: bytes, hdr: dict):
    """解出一个 bundle 的全部 node 字节，产出 (path, bytes)；只解到覆盖 node 所需即止。"""
    blocks, nodes, data_start = read_blocks_info(data, hdr)
    need = max((nd["offset"] + nd["size"] for nd in nodes), default=0)
    out = bytearray()
    p = data_start
    for i, (usize, csize, bflags) in enumerate(blocks):
        chunk = data[p:p + csize]
        if len(chunk) != csize:
            raise HsrBlockError(f"block {i} 数据越界")
        out += decompress_by_type(bflags & 0x3F, chunk, usize, f"block{i}")
        p += csize
        if len(out) >= need:
            break
    blob = bytes(out)
    for nd in nodes:
        yield nd["path"], blob[nd["offset"]:nd["offset"] + nd["size"]]


def extract_bundle(data: bytes, hdr: dict) -> dict:
    """解出一个 bundle，返回 {'nodes': [...], 'files': {path: bytes}}"""
    blocks, nodes, data_start = read_blocks_info(data, hdr)
    out = io.BytesIO()
    p = data_start
    for i, (usize, csize, bflags) in enumerate(blocks):
        chunk = data[p:p + csize]
        if len(chunk) != csize:
            raise HsrBlockError(f"block {i} 数据越界")
        try:
            out.write(decompress_by_type(bflags & 0x3F, chunk, usize, f"block{i}"))
        except HsrBlockError:
            raise
        except Exception as e:
            raise HsrBlockError(f"block{i} 解压失败(ct={bflags & 0x3F}): {e}") from e
        p += csize
    blob = out.getvalue()
    files = {nd["path"]: blob[nd["offset"]:nd["offset"] + nd["size"]] for nd in nodes}
    return {"hdr": hdr, "nodes": nodes, "files": files, "blob": blob}
