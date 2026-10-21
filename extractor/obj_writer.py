# -*- coding: utf-8 -*-
"""Unity mesh → 带 UV 与「部件变换烘焙」的 OBJ 导出工具。

要点：
  * HSR 的 prefab 里 SkinnedMeshRenderer/MeshRenderer 因缺 type tree 无法被 UnityPy
    直接 read()，所以改用「部件名匹配」：遍历 Transform 算出每个 GameObject 的
    localToWorld，再把**同名** Mesh 的顶点用该矩阵烘进去。
  * UV 从 UnityPy `Mesh.export()` 产出的 OBJ 里解析（export() 一直带有 vt 行），
    `f ` 行用 `v/vt` 双索引；多部件拼接时 voff 与 toff **分别独立平移**。
  * Unity 与 OBJ 的 UV 原点都在左下，无需翻转。
"""
import math

IDENT = [[1.0, 0, 0, 0], [0, 1.0, 0, 0], [0, 0, 1.0, 0], [0, 0, 0, 1.0]]


# ---------------- 3D 数学 ----------------
def quat_to_mat(q):
    x, y, z, w = q
    return [[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
            [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
            [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]]


def mat_mul(a, b):
    return [[sum(a[i][k] * b[k][j] for k in range(4)) for j in range(4)] for i in range(4)]


def trs_mat(pos, quat, scale):
    r = quat_to_mat(quat)
    return [[r[0][0] * scale[0], r[0][1] * scale[1], r[0][2] * scale[2], pos[0]],
            [r[1][0] * scale[0], r[1][1] * scale[1], r[1][2] * scale[2], pos[1]],
            [r[2][0] * scale[0], r[2][1] * scale[1], r[2][2] * scale[2], pos[2]],
            [0, 0, 0, 1]]


def apply_mat(m, v):
    x, y, z = v
    return (m[0][0] * x + m[0][1] * y + m[0][2] * z + m[0][3],
            m[1][0] * x + m[1][1] * y + m[1][2] * z + m[1][3],
            m[2][0] * x + m[2][1] * y + m[2][2] * z + m[2][3])


def is_identity(m, eps=1e-6):
    return all(abs(m[i][j] - IDENT[i][j]) <= eps for i in range(4) for j in range(4))


def bbox(verts):
    if not verts:
        return None
    xs = [v[0] for v in verts]
    ys = [v[1] for v in verts]
    zs = [v[2] for v in verts]
    return (min(xs), max(xs), min(ys), max(ys), min(zs), max(zs))


def fmt_bbox(b):
    if not b:
        return "-"
    return ("x[%7.3f,%7.3f] y[%7.3f,%7.3f] z[%7.3f,%7.3f] "
            "size(%6.3f,%6.3f,%6.3f)"
            % (b[0], b[1], b[2], b[3], b[4], b[5],
               b[1] - b[0], b[3] - b[2], b[5] - b[4]))


# ---------------- OBJ 解析 / 写出 ----------------
def parse_obj(text):
    """解析 UnityPy `Mesh.export()` 的 OBJ 文本。
    返回 (verts, uvs, faces)；faces 元素是 [(vi, ti), ...]（1-based，ti=0 表示无 UV）。"""
    verts, uvs, faces = [], [], []
    for line in text.splitlines():
        if line.startswith("v "):
            p = line.split()
            verts.append((float(p[1]), float(p[2]), float(p[3])))
        elif line.startswith("vt "):
            p = line.split()
            uvs.append((float(p[1]), float(p[2])))
        elif line.startswith("f "):
            tri = []
            for tok in line.split()[1:]:
                parts = tok.split("/")
                vi = int(parts[0]) if parts[0] else 0
                ti = int(parts[1]) if len(parts) > 1 and parts[1] else 0
                tri.append((vi, ti))
            faces.append(tri)
    return verts, uvs, faces


def write_obj(path, parts):
    """parts: [(name, verts, uvs, faces)]；v 索引与 vt 索引各自独立累加偏移。"""
    voff = 0
    toff = 0
    with open(path, "w", encoding="utf-8") as g:
        for name, verts, uvs, faces in parts:
            g.write("g %s\n" % name)
            for v in verts:
                g.write("v %.6f %.6f %.6f\n" % v)
            for t in uvs:
                g.write("vt %.6f %.6f\n" % t)
            for f in faces:
                toks = []
                for vi, ti in f:
                    a = str(vi + voff) if vi else "0"
                    b = str(ti + toff) if ti else "0"
                    toks.append("%s/%s" % (a, b) if ti else a)
                # 翻转绕序：烘焙含负缩放/换手性时保持法线朝外
                g.write("f " + " ".join(reversed(toks)) + "\n")
            voff += len(verts)
            toff += len(uvs)
    return path


def count_lines(path, prefix):
    n = 0
    with open(path, "r", encoding="utf-8") as g:
        for line in g:
            if line.startswith(prefix):
                n += 1
    return n


def math_unused_guard():
    # 保留 math 导入以备用（当前未直接使用），避免 linter 误报
    return math.pi
