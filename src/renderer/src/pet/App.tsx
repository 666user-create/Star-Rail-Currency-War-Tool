import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import PetSprite from './PetSprite'
import PetOfficial from './PetOfficial'
import { line } from '@shared/dialogue'
import type { PetRect } from '@shared/types'
import './sprite.css'

// 形象仅两档：官方模型（extractor 本机生成）与截图素材；未就绪显示占位
type PetStyle = 'official' | 'sprite' | 'none'
const STYLE_LABEL: Record<PetStyle, string> = {
  official: '官方模型',
  sprite: '截图素材',
  none: '未提取'
}

type Anim = '' | 'bounce' | 'howl' | 'cheer'

export default function App() {
  const [anim, setAnim] = useState<Anim>('')
  const [bubble, setBubble] = useState('')
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 })
  // 菜单渲染后夹进视口：右键点靠近右边/底边时向左上收，保证整块可见（layout 版避免首帧闪位）
  useLayoutEffect(() => {
    if (!menu) return
    const el = menuRef.current
    if (!el) return
    const clamp = (): void => {
      const vw = window.innerWidth
      const vh = window.innerHeight
      setMenuPos({
        x: Math.max(0, Math.min(menu.x, vw - el.offsetWidth - 2)),
        y: Math.max(0, Math.min(menu.y, vh - el.offsetHeight - 2))
      })
    }
    clamp()
    // 二次复测：首帧测量可能早于 pop 动画/字体度量落定（实测曾 161px vs 实际 ~212px，
    // 偏差 51px → 底部"退出"项被裁出视口），动画后再测一次重夹
    const t = setTimeout(clamp, 250)
    return () => clearTimeout(t)
  }, [menu])
  const [recording, setRecording] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [style, setStyle] = useState<PetStyle>('none')
  const [spriteUrl, setSpriteUrl] = useState<string | null>(null)
  const [hasOfficial, setHasOfficial] = useState(false)

  useEffect(() => {
    void Promise.all([
      window.api.getSettings(),
      window.api.sprite(),
      window.api.officialModel()
    ]).then(([s, url, off]) => {
      setSpriteUrl(url)
      const hasOff = !!off
      setHasOfficial(hasOff)
      let eff: PetStyle = s.petStyle === 'official' || s.petStyle === 'sprite' ? s.petStyle : 'none'
      if (eff === 'none') eff = hasOff ? 'official' : url ? 'sprite' : 'none'
      if (eff === 'official' && !hasOff) eff = url ? 'sprite' : 'none'
      if (eff === 'sprite' && !url) eff = hasOff ? 'official' : 'none'
      setStyle(eff)
    })
  }, [])

  const bubbleTimer = useRef<ReturnType<typeof setTimeout>>()
  const animTimer = useRef<ReturnType<typeof setTimeout>>()
  const pointer = useRef({ down: false, moved: false, x: 0, y: 0 })
  const bubbleRef = useRef<HTMLDivElement>(null)

  const MENU_ITEMS = [
    { key: 'record', label: () => (recording ? '结束记录' : '开始记录') },
    { key: 'panel', label: () => '打开战绩面板' },
    { key: 'launch', label: () => '货币战争启动!' },
    { key: 'settings', label: () => '设置' },
    { key: 'style', label: () => `形象·${STYLE_LABEL[style]}` },
    { key: 'sep', label: () => '' },
    { key: 'quit', label: () => '退出' }
  ] as const

  // —— 台词气泡 ——
  const say = useCallback((text: string, hold = 4000) => {
    setBubble(text)
    clearTimeout(bubbleTimer.current)
    bubbleTimer.current = setTimeout(() => setBubble(''), hold)
  }, [])

  const playAnim = useCallback((a: Anim, ms = 1200) => {
    setAnim(a)
    clearTimeout(animTimer.current)
    animTimer.current = setTimeout(() => setAnim(''), ms)
  }, [])

  // —— 待机：20~60 秒随机动作 + 偶尔吐槽 ——
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>
    const schedule = () => {
      t = setTimeout(() => {
        const a: Anim[] = ['bounce', 'howl', 'cheer']
        const pick = a[Math.floor(Math.random() * a.length)]
        playAnim(pick, pick === 'bounce' ? 1600 : 1200) // 连跳串 2 跳×0.75s+收尾，完整落地结束
        if (Math.random() < 0.4) say(line('idle'))
        schedule()
      }, 20000 + Math.random() * 40000)
    }
    schedule()
    return () => clearTimeout(t)
  }, [playAnim, say])

  // —— 记录中计时 ——
  useEffect(() => {
    if (!recording) return
    const id = setInterval(() => setElapsed((e) => e + 1), 1000)
    return () => clearInterval(id)
  }, [recording])

  // —— 点击（区分拖动） ——
  const onPetPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    // 菜单开着时：本体点击先关菜单（否则 full 区吃掉点击、菜单粘住只能靠点窗外关）
    if (menu) {
      setMenu(null)
      return
    }
    pointer.current = { down: true, moved: false, x: e.screenX, y: e.screenY }
    window.api.petDrag('start')
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const p = pointer.current
    if (!p.down) return
    if (e.buttons === 0) {
      // 按键已在窗口外释放、pointerup 丢失 → 补发结束，防止 p.down 卡死复活幽灵拖动
      p.down = false
      window.api.petDrag('end')
      return
    }
    if (Math.abs(e.screenX - p.x) > 6 || Math.abs(e.screenY - p.y) > 6) p.moved = true
    // 心跳：主进程据此判定拖动是否还活着（pointerup 丢失时超时自停）
    window.api.petDrag('move')
  }
  const onPetPointerUp = () => {
    const wasClick = pointer.current.down && !pointer.current.moved
    pointer.current.down = false
    window.api.petDrag('end')
    if (wasClick) {
      playAnim('bounce', 1600) // 点击=兴奋两跳连跳串（对齐原版被戳时的反应；cheer 保留给记录/启动）
      say(line('click'))
    }
  }

  // —— 秒表道具：开始/结束记录 ——
  const toggleRecord = async () => {
    if (!recording) {
      await window.api.recordStart()
      setElapsed(0)
      setRecording(true)
      playAnim('cheer', 900)
      say(line('start'))
    } else {
      const match = await window.api.recordEnd()
      setRecording(false)
      playAnim('bounce', 1600) // 两跳连跳串完整播完
      say(line('end'))
      if (match && match.result === 'win') setTimeout(() => say(line('win')), 2200)
      if (match && match.result === 'loss') setTimeout(() => say(line('loss')), 2200)
    }
  }
  const onPropClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    void toggleRecord()
  }

  // —— 右键菜单 ——
  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    setMenu({ x: e.clientX, y: e.clientY })
  }
  // 区域 = 全部可见内容的并集（Windows setShape 连绘制一起裁，实测气泡上半截/蹦跳耳朵
  // 曾被区域顶边 y=34 平口切掉）：
  //  - 基础：本体+热区，透明角落保持点穿（不复现"点不了"）
  //  - 待机动效时头顶抬升 → 顶边抬到 0
  //  - 气泡/计时徽章：按实测 bbox 追加（从 y=2 起，远高于原区域顶边）
  //  - 菜单：整窗放开（条目可点）
  useLayoutEffect(() => {
    if (menu) {
      window.api.petShape([{ x: 0, y: 0, width: 176, height: 212 }])
      return
    }
    const rects: PetRect[] = [
      anim ? { x: 24, y: 0, width: 128, height: 182 } : { x: 24, y: 34, width: 128, height: 148 },
      { x: 116, y: 146, width: 46, height: 46 }
    ]
    const bw = bubbleRef.current
    if (bw) {
      const r = bw.getBoundingClientRect()
      if (r.width > 0 && r.height > 0) {
        const x = Math.max(0, Math.floor(r.left))
        const y = Math.max(0, Math.floor(r.top))
        rects.push({
          x,
          y,
          width: Math.min(176, Math.ceil(r.right)) - x,
          height: Math.min(212, Math.ceil(r.bottom)) - y
        })
      }
    }
    window.api.petShape(rects)
  }, [menu, bubble, recording, anim])
  useEffect(() => {
    if (!menu) return
    const close = () => setMenu(null)
    window.addEventListener('blur', close)
    return () => window.removeEventListener('blur', close)
  }, [menu])

  const onMenuClick = async (key: string) => {
    setMenu(null)
    if (key === 'record') void toggleRecord()
    if (key === 'panel') window.api.panelToggle()
    if (key === 'launch') {
      const ok = await window.api.launchGame()
      if (ok) { playAnim('cheer', 900); say(line('launch')) }
      else say(line('needGamePath'), 5000)
    }
    if (key === 'settings') window.api.settingsOpen()
    if (key === 'style') {
      const order: PetStyle[] = [
        ...(hasOfficial ? (['official'] as PetStyle[]) : []),
        ...(spriteUrl ? (['sprite'] as PetStyle[]) : [])
      ]
      if (order.length === 0) order.push('none')
      const ns = order[(order.indexOf(style) + 1) % order.length]
      if (ns !== style) {
        setStyle(ns)
        await window.api.setSettings({ petStyle: ns })
        say(`换装完毕~现在是「${STYLE_LABEL[ns]}」，老板觉得如何？`)
      }
    }
    if (key === 'quit') window.api.quit()
  }

  const mmss = `${String(Math.floor(elapsed / 60)).padStart(2, '0')}:${String(elapsed % 60).padStart(2, '0')}`

  return (
    <div
      className="pet-root"
      onContextMenu={onContextMenu}
      onPointerMove={onPointerMove}
      onPointerUp={onPetPointerUp}
    >
      {/* 气泡 */}
      {(bubble || recording) && (
        <div className="bubble-wrap" ref={bubbleRef}>
          {recording && <div className="rec-badge">● 记录中 {mmss}</div>}
          {bubble && <div className="bubble">{bubble}</div>}
        </div>
      )}

      {/* 桌宠本体（可拖动 + 点击） */}
      <div
        className="pet-hitbox"
        onPointerDown={onPetPointerDown}
        onClick={() => { /* 点击由 pointerup 统一处理，避免拖动误触发点击 */ }}
      >
        {style === 'official' ? (
          <PetOfficial anim={anim} />
        ) : style === 'sprite' && spriteUrl ? (
          <PetSprite src={spriteUrl} anim={anim} />
        ) : (
          <div className="pet-placeholder">
            <div className="ph-egg" />
            <div className="ph-text">
              随宠模型未提取
              <br />
              <code>python extractor/extract_pet.py</code>
            </div>
          </div>
        )}
        {/* 秒表道具：单独热区，点击切换记录 */}
        <div
          className={`prop-hotzone ${recording ? 'recording' : ''}`}
          onClick={onPropClick}
          title={recording ? '结束记录' : '开始记录'}
        />
      </div>

      {/* 右键菜单：打开后按实测尺寸夹进 176×212 视口（否则超出窗口底/右边被裁） */}
      {menu && (
        <div className="ctx-menu" ref={menuRef} style={{ left: menuPos.x, top: menuPos.y }}>
          {MENU_ITEMS.map((item) =>
            item.key === 'sep' ? (
              <div key="sep" className="ctx-sep" />
            ) : (
              <div key={item.key} className="ctx-item" onClick={() => onMenuClick(item.key)}>
                {item.label()}
              </div>
            )
          )}
        </div>
      )}
    </div>
  )
}
