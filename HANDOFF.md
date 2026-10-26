# 交接文档 — 货币战争桌宠助手（Currency War Pet）

> 写给接手的 AI/工程师。生成于 2026-10-26，基于 master @ `c6f1cb1`（工作区干净）。
> 用户诉求：前任（本 AI）对 3D 模型的运用能力有限，交接后请优先按 §7 的已知局限继续。
> 阅读顺序建议：§1 定位 → §2 红线 → §3 跑起来 → §6 当前状态 → §7 3D 专题 → §9 下一步。

---

## 1. 项目是什么

《崩坏：星穹铁道》常驻玩法"货币战争"的 Windows 桌面助手：一只**话痨阴阳怪气的桌宠**（形象 = 官方随宠"说怪话"，通过本机解包提取渲染）+ **战绩统计面板**。核心价值对准官方短板：官方只留 10 条对战记录、可收藏 20 条、无总时长统计；本工具无限记录 + 自动时长 + 复盘统计。

- 设计文档（已与用户逐节确认）：[docs/superpowers/specs/2026-10-21-currency-war-pet-design.md](docs/superpowers/specs/2026-10-21-currency-war-pet-design.md)
- 用户语言：中文。回复、commit message 都用中文。
- 用户风格：要效率、要直话、讨厌过度迭代（形象问题已说"到此为止"）；验收方式是**他本人实机操作**，所以每轮改动要给出"他怎么测"的指引。

## 2. 合规红线（硬约束，违反 = 项目死）

1. **禁止**：内存读写、DLL 注入、协议抓包、鼠标模拟/自动点击、连续监屏状态机。设计文档 §2 的"②档"（玩家点击按钮时截一帧结算画面做 OCR）是允许上限，③档永远不做。
2. **仓库零模型字节**：官方模型/贴图**绝不入 git、绝不上传**。发布物只含 `extractor/` 脚本，用户在自己有游戏的机器上跑 `python extractor/extract_pet.py --game "D:/Star Rail"` 自产素材（AssetStudio 模式：工具存活，打包素材会被 DMCA）。
3. 提交前泄露自查：`git ls-files | Select-String 'assets/|\.obj$|\.png$'` 应只有 `assets/pet/.gitkeep`。`.gitignore` 已排 `assets/official_pet/`、`assets/pet/*.png`、`assets/_extract/`。
4. **已知灰色地带（需接手者知悉，勿扩大）**：[extractor/mr0k_keys.py](extractor/mr0k_keys.py) 含社区公开的解密表（源自 Escartem/HoyoCooker 等开源项目），`extractor/ooz.dll` 是开源 powzix/ooz。目前按"社区公开信息"处理并随仓库分发；若项目公开化，这两处是首先该过法务/重新审视的点。
5. App 内固定显示"© 米哈游版权所有，非官方同人作品"；不做"防封"宣传；非商业。

## 3. 怎么跑（环境陷阱必读）

```powershell
# ⚠️ 关键陷阱：DSH/部分终端环境会设 ELECTRON_RUN_AS_NODE=1，
# 不清掉的话 Electron 以纯 Node 跑，electron.app undefined 直接崩。
$env:ELECTRON_RUN_AS_NODE = $null
npm install        # 如未装
npm run dev        # electron-vite，renderer 在 http://localhost:5173
```

- 技术栈：Electron 44 + electron-vite 6 + Vite 8 + React 19 + TS，DB 用 **sql.js**（SQLite wasm，主进程内存库 + 写盘）。
- **electron-vite 的 watcher 会漏 main/preload 改动**（实测多次）：改了 `src/main/**` 或 `src/preload/**` 必须**杀掉 dev 进程重启**，renderer 改动 HMR 正常。重启前查空闲内存（§5 机器教训）：`Get-CimInstance Win32_OperatingSystem` 的 FreePhysicalMemory ≥ 1.5GB。
- 验证"改动真的进了产物"：grep `out/main/index.js`（编译产物），别信 watcher 日志。
- 用户显示器 **125% 缩放（DPI=120）**：窗口逻辑 176×212 DIP，物理像素 220×265。任何截屏取证必须按物理尺寸截，否则会把"自己截少了"误判成"被裁了"（本项目栽过一次，§8.3）。

## 4. 文件地图

```
src/main/index.ts        主进程：两个窗口 + 全部 IPC + 桌宠窗口治理(尺寸自愈/topmost巡检/拖动/夹紧)
src/main/repository.ts   sql.js 封装：matches 表读写、统计聚合（UI 唯一数据口）
src/main/config.ts       %APPDATA%\currency-war-pet\config.json 读写
src/shared/types.ts      IPC 契约（PetApi / Match / PetRect 等）
src/shared/dialogue.ts   台词引擎：事件→阴阳怪气模板（line('click'|'idle'|'start'|'end'|'win'|'loss'|'launch')）
src/preload/index.ts     contextBridge
src/renderer/src/pet/App.tsx            桌宠渲染层：状态机/拖动/气泡/菜单/shape 上报
src/renderer/src/pet/PetOfficial.tsx    ★ Three.js 官方模型渲染 + 全部动效循环（§7 核心）
src/renderer/src/pet/toonMaterial.ts    ★ HSR 风 toon ShaderMaterial（ramp 采样）
src/renderer/src/pet/PetSprite.tsx      备用形象档（截图素材 sprite.png，可选）
src/renderer/src/pet/styles.css         含 .ctx-menu/.bubble 等（行高/尺寸有讲究，见 §8.2）
src/renderer/src/panel/App.tsx          战绩面板（6 模块：概览/列表/阵容/段位/时长/时段）
extractor/               独立 Python 提取器（§7.1 链路），README 有免责声明
assets/official_pet/     ★ 本地产物（不入 git）：pet03.obj + color/cool/warm.png
scripts/shot.cjs         Electron 截图自查管线（预览页渲染→PNG）
scripts/videoframes.cjs  B站参考视频抓帧工具（单段连拍 + "start-end-step" 时间轴模式）
docs/superpowers/specs/  设计文档（阶段划分/合规边界/数据模型都在）
```

运行时数据（都在 `%APPDATA%\currency-war-pet\`）：
- `config.json`：`{gamePath, petX, petY, petStyle}`。当前 `gamePath` 为空（用户还没在设置里填游戏路径）。
- `matches.db`：**52 条演示数据**（阶段1占位，source='demo'，note='手动记录（演示）'）。阶段2接真实 OCR 后这些要不要清、怎么清，届时问用户。

## 5. 机器/环境教训（防重蹈）

- 开发机 15.2GB 内存。曾有一次 teammate 并行跑全量解包扫描（单进程吃到 10.21GB）把宿主 OOM 打崩、会话反复重启。**规则：任何解包/全盘扫描前先查 FreePhysicalMemory ≥1.5~3GB，绝不与渲染/其他重活并行，分批 ≤2GB。**
- PowerShell `Add-Type` 里写 C#：不支持 `$"..."` 字符串插值（用 `string.Format`）；`RGNDATAHEADER` 是 **32 字节头**，矩形数据从偏移 **32** 开始（曾按 20 解析得出错误结论）。
- GDI `CopyFromScreen` **截不到** Electron 透明窗口（`WS_EX_NOREDIRECTIONBITMAP`），会截成透明/背景；抓桌宠真实画面必须用 `PrintWindow(hwnd, hdc, PW_RENDERFULLCONTENT=2)` 且按物理像素尺寸建位图。
- 模拟点击/右键用 `SetCursorPos + mouse_event` 可稳定驱动桌宠做行为级验证；`WindowFromPoint` 可验证点击穿透路由（不依赖鼠标事件）。

## 6. 当前状态：已完成什么

### 阶段1（完整验收过）
桌宠可拖、可点（说话）、右键菜单（开始/结束记录、面板、启动游戏、设置、切形象、退出）、气泡台词、待机随机动作；面板 6 模块有演示数据；记录开关走真实写入路径。

### 桌宠窗口治理（本轮修了 6 个 bug，全部有回归验证，别回退）
按提交时间顺序，每个都对应一类"消失/点不了/裁切"：

| 提交 | 修了什么 | 关键机制 |
|---|---|---|
| `c3caa0d` | 拖几下消失（幽灵拖动） | pointerup 丢失 → 拖动循环加**心跳超时 1.2s** 自停；`buttons===0` 补救；保存位置前 `isOnScreen` 校验；`clampToScreens` 每帧夹紧 |
| `90477b8` | 移动后消失一部分 | 窗口曾被外部改成 383×408（**第一因未确证**）→ 四重自愈：创建参数 min/max 锁 + `resize` 监听 + 拖动/保存路径校验 + 1px DPI 容差；topmost 掉 Z 序 → `setAlwaysOnTop(true,'screen-saver') + moveTop()` 5s 巡检（`setAlwaysOnTop(true)` 在状态已 true 时是**空操作**，必须带层级） |
| `49dc6e7` | 一些地方点不了 + 菜单显示不全 | 气泡/计时期间不再切 full（气泡 `pointer-events:none` 根本不需要鼠标，旧逻辑每次弹泡整窗吃点击 4s）；菜单紧凑化 + 实测 bbox 视口夹紧 + 250ms 二次复测；self-heal 节流 500ms；菜单开着点本体可关 |
| `44aa18a` | 蹦跳/气泡时模型头顶被裁 | **`setShape` 在 Windows 走 SetWindowRgn 语义：区域连绘制一起裁，不只是鼠标**。区域动态化：渲染层按可见内容实测 bbox 上报 `PetRect[]`（动效时顶边抬 0、气泡时追加气泡矩形、菜单时整窗），主进程统一夹进 176×212 后应用 |

### 动效（§7.3 详述，用户尚未最终验收）
`c1bd97b`→`ecd32f5`→`c6f1cb1`：对照用户给的 B站参考视频（BV15exUzyE5n）逐帧改写。点击反应 = 兴奋两跳连跳串；待机 = 站定微呼吸 + 每 ~7s 缓慢侧倾。

### 提取器（`98792a8`+`71aac9b`，端到端跑通过）
`extract_pet.py` 一条命令从本机游戏出 4 个素材文件。关键坑已修：贴图数据在 `.resS` 流里，必须给所有文件（含 `.resS`）设 `BytesIO.name` 后 `UnityPy.load(*streams)` **合并加载**，否则 `Texture2D.image` 报 "Resource file CAB-xxx.resS not found"。

## 7. 3D 模型专题（用户点名的短板区，重点读）

### 7.1 资产链路（要改形象/补素材时重跑）

```
游戏 block 文件(ENCR 加密) → mr0k_crypto 解密 → 拼接 UnityFS 块 →
blocksInfo=LZ4HC, type6/7 data=Oodle(ooz.dll) → UnityPy 读 Mesh/Texture2D →
obj_writer 烘焙 GameObject localToWorld 进顶点(OBJ 无层级) → pet03.obj
```

- 说怪话 = `PlayerBall_Pet_03` = `NPC_Special_Complainer_00`，prefab 在 block `072465116d0a75341688ef20b3317abe.block` 偏移 964672。
- 重跑提取：`python extractor/extract_pet.py --game "D:/Star Rail"`（注意游戏真实布局是 `<root>\Game\StarRail_Data\...`，locate.py 已兼容）。
- 素材加载链：主进程 IPC `pet:officialModel` 读 `assets/official_pet/` 返回 base64；**`officialCache` 进程内缓存一次**——换素材文件后必须重启 dev 才生效（踩过：以为没生效，其实是缓存）。

### 7.2 渲染（PetOfficial.tsx + toonMaterial.ts）

- Three.js WebGLRenderer `alpha:true`，176×212 画布，透明背景。
- 材质 = 自定义 ShaderMaterial 复刻 HSR toon：base color × Cool/Warm_Ramp（官方 256×16 色带，连续采样 `t=clamp(nl*0.62+0.45,...)`，软明暗界线 `smoothstep`）+ rim light。**用户已认可上色效果，别乱回退到 Lambert/Standard。**
- 两个已知补丁别删：OBJ 法线可能朝内 → 片元里 `if(dot(n,v)<0.0) n=-n` + `side: DoubleSide`（否则脸全黑）。
- 模型自动定标：`s=1.55/size.y`，相机距离 `max(h,0.5)*2.7`。

### 7.3 动效系统现状与**硬局限**（前任承认的能力边界）

现状（PetOfficial.tsx 的 rAF 循环，纯代码曲线，无骨骼）：
- 待机：呼吸 ±0.8% 缩放 + 0.45Hz 侧倾 0.035rad，**贴地**；
- bounce（点击/随机）：0.75s 周期 ×2 跳连跳串 = 蓄力下蹲→蹬地拉伸→抛物线(顶点0.18)→落地压扁→停顿，空中微后仰近似"上举发力"；
- cheer/howl：小弹跳/歪头；
- 影子钉地（反向抵消 wrap.position.y），腾空缩小。

**硬局限（改 3D 前必须知道）**：
1. OBJ 解出来只有 **3 个刚体组：`g Blush` / `g Body` / `g Face`**（腮红/身体/脸）。耳朵、四肢、铃铛全焊死在 Body 里。
2. **没有骨骼**：Mesh 无 skinning 数据可用（提取时 SkinnedMeshRenderer 无 type tree 读不了）。→ 耳朵扇动、收腿、摆尾这类**部件级动作做不了**，只能整体位移/缩放/旋转近似。
3. **OBJ 格式不支持 blendshapes** → 眨眼、张嘴（原版说话靠这个）做不了。
4. 原版完整动画在 **ACL 压缩动画**（`.anim`/ACL bundle）里，社区无成熟 Python 解码先例——这是解锁以上全部的唯一正路，工作量大、风险高，用户此前明确"远期再说"。
5. 参考视频（BV15exUzyE5n）实测结论：原版待机 = 站定为主 + 兴奋时 2~3 次小连跳（t4.8–7.1，0.1s 细扫确认），**跳是真实存在的**（前任曾误判"从不离地"，被用户纠正——做动效判断务必用 0.1~0.25s 步进细扫，2s 粗采样会漏）。

→ **接手者如果 3D 更强，优先方向**：a) 解 ACL 拿到骨骼/表情曲线，把 ear/eye/mouth 动作做真；b) 或从 prefab 反推骨骼层级重导带 skinning 的模型（glTF 比 OBJ 合适，可换 obj_writer 输出）。c) 动效参数手感（跳高/节奏）都是显式常量，用户一句话就能调。

## 8. 未结问题清单

### 8.1 动效未获用户最终验收
`c6f1cb1`（点击=两跳连跳串）做完后用户没有再反馈"像不像"，转而要了这份交接文档。**接手后第一个问题就问用户：点击连跳和待机姿态，现在对味了吗？** 参数都在 PetOfficial.tsx 的 loop 里，是明码常量。

### 8.2 右键菜单"退出"项的存疑
`49dc6e7` 时用户报"经常显示不完全"，修了紧凑化+夹紧；但**从未在真实 125% DPI 下让用户确认"退出"项可见**（前任的像素分析先误报后被自己推翻，最终结论"完整可见"依赖 PrintWindow 单帧）。若用户再报菜单问题，先让他右键时截给你看，别信远程像素推断。

### 8.3 窗口尺寸自愈的触发源未查明
`[pet] size self-heal` 日志显示外部确实会改窗口尺寸（383×408 出现过、拖动中 178~184 抖动常见）。自愈已兜住，但**谁在改**（键盘 Win+方向键吸附？某窗口工具？）未确证。若自愈日志频繁刷屏或桌宠位置被"抢"，从这条线查。

### 8.4 gamePath 未配置
config 里 `gamePath=""` → 右键"货币战争启动!"会提示需要设置。用户还没填过，设置窗口（settings.html）功能没被真实用过，可能藏着没验过的坑。

### 8.5 sprite 备用形象档
`assets/pet/sprite.png` 不存在时"截图素材"档自动跳过。非必需，用户没提过要。

### 8.6 演示数据 52 条
阶段2 上线真实记录前需要和用户确认清库策略（面板/统计会被假数据污染）。

## 9. 下一步主线：阶段2 OCR（设计文档 §3 验收标准）

**这是用户等的正事，动效只是插曲。** 需求原文：按下"开始记录"→ 打完点"结束记录"→ **结束时自动截取结算画面一帧** → OCR 填 胜负/阵容/段位变化 → 用户确认后入库（source='ocr'，截图永久留档 `screenshot_path`，低置信度 → result='suspected'，识别错可看原图修正）。

实施要点：
1. **只换写入方**：UI 只认 Repository，`record:end` 从演示随机改为 OCR 管道，面板/桌宠零改动。数据模型字段（`confidence`、`screenshot_path`、`source`）已建好。
2. **红线**：只在用户点击那一刻截一帧（`desktopCapturer` 或主进程截图），**不做**连续监屏找结算页；OCR 本地跑（推荐 windows 内置 OCR `Windows.Media.Ocr` via node-icu/ffi 太重，务实选项：tesseract.js 中文包，或 PaddleOCR——先和用户确认接受 Python 依赖与否）。
3. 结算页布局参考：对局胜利/失败大字 + SS 评级 + 阵容头像行。标定素材已转存本机 `docs/refs/settlement-sample.png`（真实结算页截图，**含游戏版权画面，已 gitignore，勿入库勿外发**）。
4. 定点截图策略：结束记录时全屏截图 → 用户预览确认/框选修正 → OCR 区域裁剪。识别结果先给用户过目再入库（设计文档硬要求）。

## 10. 工程习惯（用户已认可的流程，延续）

- 每个 bug：先**取证**（截图/日志/Win32 实测），再修，修完**行为级验证**（模拟点击 + PrintWindow 抓帧 + region 转储），最后中文 commit。commit 格式参考 `git log`：`fix:/feat:/perf:` + 中文破折号列点。
- 验证动效误触热区会写演示记录，记得用一次性脚本清掉并**重启 dev**（内存库不回读磁盘）。
- `.superpowers/` 全目录不入 git（预览图/临时脚本）。
- 不要并行跑重活；Electron 启动前查内存。
- 用户报"没变化"时，先确认他触发的路径是不是你改的那条（本会话真事：改了 bounce 他点的是 cheer，白解释一轮）。

## 11. 快速自检命令（接手 5 分钟上手）

```powershell
Set-Location "D:\Star Rail Currency War Tool"
git log --oneline -8                      # 应见 c6f1cb1 顶格
$env:ELECTRON_RUN_AS_NODE = $null; npm run dev   # 后台跑，日志应出现 [official] ready
# 验证素材在位（本地文件，不入 git）：
Get-ChildItem assets\official_pet          # pet03.obj(~684KB)+color/cool/warm.png
# 泄露自查（每次提交前）：
git ls-files | Select-String 'official_pet|\.obj$|assets/pet/.*png'
```

—— 前任 AI，2026-10-26。祝接手顺利，3D 那块拜托了。
