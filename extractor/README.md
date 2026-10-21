# extractor —— 随宠「说怪话」官方资产提取器

从**你本机已安装的**《崩坏：星穹铁道》里，把随宠「说怪话」（内部代号
`PlayerBall_Pet_03` / `NPC_Special_Complainer_00`）的官方模型与贴图提取出来，
供本仓库的桌宠主程序渲染。

- **只读**：只打开游戏目录下的 `.block` 文件做解密与解压，**绝不写入 / 移动 / 修改游戏目录的任何文件**。
- **不打包分发任何模型字节**：仓库里只有提取脚本；模型与贴图由你在本机运行脚本自行生成。

## 产物（文件名固定，主程序按此名加载）

| 文件 | 内容 |
| --- | --- |
| `assets/official_pet/pet03.obj` | Body + Face + Blush 合并模型。已把每个部件的 GameObject 变换烘进顶点（不再散架）、含 UV（`vt`）、已剔除泳圈配件 |
| `assets/official_pet/pet03_color.png` | `NPC_Special_Complainer_00_00_Body_Color`（黑帽 / 奶油身 / 红眼） |
| `assets/official_pet/pet03_cool.png` | `NPC_Special_Complainer_00_00_Body_Cool_Ramp`（toon 冷色分层 ramp） |
| `assets/official_pet/pet03_warm.png` | `NPC_Special_Complainer_00_00_Body_Warm_Ramp`（toon 暖色分层 ramp） |

> 这四个文件被 `.gitignore` 排除，**不会进仓库**。请勿把它们传播出去。

## 依赖

只需要 Python 3.9+ 与两个 pip 包；解压用的 `ooz.dll`（开源 powzix/ooz）随仓库自带，无需安装。

```bash
pip install UnityPy lz4
```

## 用法

```bash
# 自动探测游戏安装路径
python extractor/extract_pet.py

# 手动指定游戏根目录（该目录下应有 Game\StarRail.exe）
python extractor/extract_pet.py --game "D:/Star Rail"

# 其它可选参数
python extractor/extract_pet.py --out "自定义输出目录" --processes 6 --quiet
```

自动探测顺序：`--game` → 环境变量 `STAR_RAIL_PATH` / `HSR_PATH` → Windows 卸载登记项 →
miHoYo / HoYoPlay 注册表 → 常见盘符的**深度受限**目录扫描（找含 `Game\StarRail.exe` 的目录）。
都失败时会打印已尝试的来源，并提示用 `--game` 手动指定。

## 工作原理（简述）

1. 游戏的 `.block` 资产包是米哈游自定义封装：一个 `.block` 内有多个 UnityFS bundle 首尾相接，
   签名被换成 `ENCR`，头部为大端序。逆向依据是社区项目
   [Escartem/AnimeStudio](https://github.com/Escartem/AnimeStudio) 的 `AnimeStudio/BundleFile.cs`
   中 `case "ENCR"` 分支。
2. 数据块用 Oodle 压缩（部分带 mr0k 前置加密）。本工具用 `ooz.dll` 解 Oodle，
   mr0k 算法与常量来自开源项目 [Escartem/HoyoCooker](https://git.escartem.moe/Escartem/HoyoCooker)
   的 `crypto.py` / `keys.py`。
3. 定位某个 CAB 在哪个 `.block` 里时，只解每个 bundle 的 `blocksInfo`（LZ4HC，约 300 字节），
   **不解数据块**，所以很快也很省内存。
4. HSR 的 prefab 里 `SkinnedMeshRenderer` 因缺 type tree 无法被 UnityPy 直接读取，
   因此改用「部件名匹配」：遍历 `Transform` 层级算出每个 `GameObject` 的 localToWorld，
   再把同名 Mesh 的顶点用该矩阵烘进去。

## 内存与耗时

- 单进程一次只持有一个 `.block`（约 6 MB），处理完立即释放；峰值内存远低于 1 GB。
- 定位 CAB 用多进程（默认 `min(6, 核数-1)`），只是 I/O 并行，每个子进程同样只持 6 MB。
- 全流程通常 1–3 分钟，取决于磁盘与 CPU。

## 排错

| 现象 | 处理 |
| --- | --- |
| `找不到《崩坏：星穹铁道》安装目录` | 用 `--game "路径"` 指定，或设环境变量 `STAR_RAIL_PATH` |
| `缺少依赖：No module named 'UnityPy'` | `pip install UnityPy lz4` |
| `随宠资产 block 不存在` | 游戏更新后 block 文件名会变（文件名是内容 md5）。需要重新确认随宠所在 block 名 |
| 贴图只导出一部分 | 试着加 `--processes`；或检查游戏是否完整安装 |

## 免责声明

- 本工具**不是**米哈游（miHoYo / HoYoVerse）官方工具，与米哈游无任何关联，未获其认可或授权。
- 本工具**仅读取你自己电脑上已安装的游戏客户端数据**，不联网、不上传、不修改任何游戏文件。
- 由此提取出的模型、贴图等素材的版权归 miHoYo / HoYoVerse 所有。
  **请勿传播、售卖或用于任何商业用途**；仅限个人本地学习与研究。
- 本工具按「原样」提供，不提供任何明示或暗示的担保。使用本工具产生的一切后果由使用者自行承担。
