# -*- coding: utf-8 -*-
"""Oodle(Kraken/Mermaid 等) 解压封装。
底层是开源的 powzix/ooz（Windows DLL `ooz.dll`，与本文件同目录，随仓库分发）。
仅依赖 pip 包 lz4 / UnityPy 之外的零第三方库（ctypes 是标准库）。
"""
import ctypes
import os

_DLL_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "ooz.dll")

_ooz = None


def _load():
    global _ooz
    if _ooz is None:
        if not os.path.exists(_DLL_PATH):
            raise FileNotFoundError(
                f"ooz.dll 不存在: {_DLL_PATH}\n"
                "它是开源的 powzix/ooz 解压库，应与本脚本同目录。")
        d = ctypes.WinDLL(_DLL_PATH)
        fn = d.Ooz_Decompress
        fn.argtypes = [
            ctypes.POINTER(ctypes.c_uint8), ctypes.c_int,
            ctypes.POINTER(ctypes.c_uint8), ctypes.c_int,
            ctypes.c_int, ctypes.c_int, ctypes.c_int,
            ctypes.c_void_p, ctypes.c_int,
            ctypes.c_void_p, ctypes.c_void_p,
            ctypes.c_void_p, ctypes.c_int,
        ]
        fn.restype = ctypes.c_int
        _ooz = d
    return _ooz


def decompress(compressed: bytes, decompressed_size: int) -> bytes:
    """解压一段 Oodle 数据，返回恰好 decompressed_size 字节。"""
    d = _load()
    pad = 256  # ooz 偶尔会写出超出请求长度的字节，留余量
    cbuf = (ctypes.c_ubyte * len(compressed)).from_buffer_copy(compressed)
    obuf = (ctypes.c_ubyte * (decompressed_size + pad))()
    n = d.Ooz_Decompress(
        ctypes.cast(cbuf, ctypes.POINTER(ctypes.c_uint8)), len(compressed),
        ctypes.cast(obuf, ctypes.POINTER(ctypes.c_uint8)), decompressed_size,
        1, 0, 0,
        None, 0,
        None, None,
        None, 3,
    )
    if n != decompressed_size or n <= 0:
        raise IOError(f"Oodle 解压失败: 写出 {n} 字节，期望 {decompressed_size}")
    return bytes(bytearray(obuf)[:n])
