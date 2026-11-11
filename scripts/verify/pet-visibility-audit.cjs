// 桌宠可见性穷举验证 —— 用 node 直接写 C# 源码文件，避免 PowerShell here-string 的模板展开问题
const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const PET_W = 176
const PET_H = 212

// C# 探针源码（纯 ASCII，无模板字符串）
const CS = [
  'using System;',
  'using System.Text;',
  'using System.Runtime.InteropServices;',
  'using System.Collections.Generic;',
  'public class PetProbe {',
  '  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();',
  '  [DllImport("user32.dll")] static extern bool EnumWindows(EnumWindowsProc cb, IntPtr l);',
  '  [DllImport("user32.dll")] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);',
  '  [DllImport("user32.dll")] static extern int GetWindowTextLength(IntPtr h);',
  '  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);',
  '  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);',
  '  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);',
  '  [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr h, int i);',
  '  [DllImport("user32.dll")] public static extern int GetWindowRgn(IntPtr h, IntPtr hRgn);',
  '  [DllImport("gdi32.dll")] public static extern IntPtr CreateRectRgn(int a, int b, int c, int d);',
  '  [DllImport("gdi32.dll")] public static extern int GetRgnBox(IntPtr h, out RECT r);',
  '  [DllImport("gdi32.dll")] public static extern bool DeleteObject(IntPtr o);',
  '  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L,T,R,B; }',
  '  delegate bool EnumWindowsProc(IntPtr h, IntPtr l);',
  '  static IntPtr found = IntPtr.Zero;',
  '  static bool Check(IntPtr h, IntPtr l) {',
  '    var len = GetWindowTextLength(h);',
  '    if (len == 0) return true;',
  '    var sb = new StringBuilder(len + 2);',
  '    GetWindowText(h, sb, sb.Capacity);',
  '    if (sb.ToString() == "\\u8D27\\u5E01\\u6218\\u4E89\\u684C\\u5BA0") { found = h; return false; }',
  '    return true;',
  '  }',
  '  public static string Probe() {',
  '    found = IntPtr.Zero;',
  '    EnumWindowsProc cb = new EnumWindowsProc(Check);',
  '    EnumWindows(cb, IntPtr.Zero);',
  '    if (found == IntPtr.Zero) return "NONE";',
  '    RECT r; GetWindowRect(found, out r);',
  '    int style = GetWindowLong(found, -16);',
  '    int ex = GetWindowLong(found, -20);',
  '    IntPtr rgn = CreateRectRgn(0,0,0,0);',
  '    int rgnType = GetWindowRgn(found, rgn);',
  '    RECT rb; GetRgnBox(rgn, out rb);',
  '    DeleteObject(rgn);',
  '    return "hwnd=" + found',
  '      + "|x=" + r.L + "|y=" + r.T + "|w=" + (r.R-r.L) + "|h=" + (r.B-r.T)',
  '      + "|visible=" + IsWindowVisible(found)',
  '      + "|minimized=" + IsIconic(found)',
  '      + "|wsVisible=" + ((style & 0x10000000) != 0)',
  '      + "|layered=" + ((ex & 0x80000) != 0)',
  '      + "|rgnType=" + rgnType',
  '      + "|rgnW=" + (rb.R-rb.L) + "|rgnH=" + (rb.B-rb.L);',
  '  }',
  '}'
].join('\r\n')

const PS = [
  '$ErrorActionPreference = "Stop"',
  'Add-Type -AssemblyName System.Windows.Forms',
  '$cs = Get-Content -Raw -Path "' + path.join(process.env.TEMP, 'petprobe.cs').replace(/\\/g, '\\\\') + '"',
  'Add-Type -TypeDefinition $cs',
  '[PetProbe]::SetProcessDPIAware() | Out-Null',
  '$s = [System.Windows.Forms.Screen]::PrimaryScreen',
  'Write-Output ("SCREEN=" + $s.Bounds.Width + "x" + $s.Bounds.Height)',
  'Write-Output ("WORK=" + $s.WorkingArea.Width + "x" + $s.WorkingArea.Height + "|wx=" + $s.WorkingArea.X + "|wy=" + $s.WorkingArea.Y)',
  'Write-Output ("PET=" + [PetProbe]::Probe())'
].join('\r\n')

const csPath = path.join(process.env.TEMP, 'petprobe.cs')
const psPath = path.join(process.env.TEMP, 'petprobe.ps1')
fs.writeFileSync(csPath, CS, 'ascii')
fs.writeFileSync(psPath, PS, 'ascii')

console.log('╔══════════════════════════════════════════════════════════════╗')
console.log('║  桌宠可见性穷举验证                                          ║')
console.log('╚══════════════════════════════════════════════════════════════╝\n')

let raw
try {
  raw = execSync(`powershell -NoProfile -ExecutionPolicy Bypass -File "${psPath}"`, { encoding: 'utf8', timeout: 60000 })
} catch (e) {
  raw = (e.stdout || '') + '\n' + (e.stderr || '')
  console.error('执行失败:\n' + raw.slice(0, 800))
  process.exit(1)
}

const screenM = /SCREEN=(\d+)x(\d+)/.exec(raw)
const workM = /WORK=(\d+)x(\d+)\|wx=(-?\d+)\|wy=(-?\d+)/.exec(raw)
const petM = /PET=(.+)/.exec(raw)

if (!screenM || !workM) { console.error('无法解析屏幕信息:\n' + raw); process.exit(1) }
const screen = { w: +screenM[1], h: +screenM[2] }
const work = { w: +workM[1], h: +workM[2], x: +workM[3], y: +workM[4] }

console.log(`屏幕: ${screen.w}x${screen.h}`)
console.log(`工作区: ${work.w}x${work.h} @ (${work.x},${work.y})，任务栏 ${screen.h - work.h}px\n`)

if (!petM || petM[1] === 'NONE') {
  console.log('❌ 桌宠窗口不存在')
  process.exit(1)
}

const kv = {}
for (const part of petM[1].split('|')) {
  const i = part.indexOf('=')
  if (i > 0) kv[part.slice(0, i)] = part.slice(i + 1)
}

const x = +kv.x, y = +kv.y, w = +kv.w, h = +kv.h
console.log('桌宠窗口实测:')
console.log(`  位置: (${x}, ${y})   尺寸: ${w}x${h}`)
console.log(`  visible=${kv.visible}  minimized=${kv.minimized}  wsVisible=${kv.wsVisible}`)
console.log(`  layered=${kv.layered}  rgnType=${kv.rgnType}  region=${kv.rgnW}x${kv.rgnH}\n`)

const checks = []
const add = (id, name, pass, evidence) => checks.push({ id, name, pass, evidence })

add('1', '窗口存在', true, `hwnd=${kv.hwnd}`)
add('2', '窗口未被隐藏', kv.visible === 'True' && kv.wsVisible === 'True',
  `IsWindowVisible=${kv.visible}, WS_VISIBLE=${kv.wsVisible}`)
add('3', '窗口未最小化', kv.minimized === 'False', `IsIconic=${kv.minimized}`)

const sizeOk = (Math.abs(w - PET_W) <= 2 && Math.abs(h - PET_H) <= 2) ||
               (Math.abs(w - Math.round(PET_W * 1.25)) <= 3 && Math.abs(h - Math.round(PET_H * 1.25)) <= 3)
add('4', '窗口尺寸正确', sizeOk,
  `实际 ${w}x${h}，期望 ${PET_W}x${PET_H}(逻辑) 或 ${Math.round(PET_W*1.25)}x${Math.round(PET_H*1.25)}(物理)`)

const marginRight = (work.x + work.w) - (x + w)
const marginBottom = (work.y + work.h) - (y + h)
add('5', '完整落在工作区内',
  x >= work.x && y >= work.y && marginRight >= 0 && marginBottom >= 0,
  `左余=${x - work.x}px 上余=${y - work.y}px 右余=${marginRight}px 底余=${marginBottom}px`)

add('6', '底部留有余量(≥8px)', marginBottom >= 8,
  `底余=${marginBottom}px（DPI 取整误差 1~2px，8px 以上安全）`)

const rgnOk = kv.rgnType !== '0' && kv.rgnType !== '1' && (+kv.rgnW > 0) && (+kv.rgnH > 0)
add('7', 'SetShape 区域非空', rgnOk,
  `rgnType=${kv.rgnType}(0=ERR 1=NULL空 2=简单 3=复杂), region=${kv.rgnW}x${kv.rgnH}`)

const visW = Math.max(0, Math.min(x + w, work.x + work.w) - Math.max(x, work.x))
const visH = Math.max(0, Math.min(y + h, work.y + work.h) - Math.max(y, work.y))
const ratio = (visW * visH) / (w * h)
add('8', '可见面积 ≥60%', ratio >= 0.6, `${(ratio * 100).toFixed(1)}%`)

console.log('┌──── 逐项判定 ────────────────────────────────────────────────')
let fails = 0
for (const c of checks) {
  if (!c.pass) fails++
  console.log(`${c.pass ? '✅' : '❌'} [${c.id}] ${c.name}`)
  console.log(`       ${c.evidence}`)
}
console.log('└──────────────────────────────────────────────────────────────')

console.log(`\n═══ ${checks.length - fails}/${checks.length} 通过 ═══`)
process.exit(fails > 0 ? 1 : 0)
