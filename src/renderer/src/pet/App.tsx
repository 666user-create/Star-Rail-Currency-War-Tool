import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import PetSprite from './PetSprite'
import PetOfficial from './PetOfficial'
import { PET_ANIMATION_MS, type PetAnimation } from './petMotion'
import { line } from '@shared/dialogue'
import type { AppSettings, PetRect } from '@shared/types'
import { idleDelayMs, normalizeSettings } from '@shared/petPreferences'
import './sprite.css'

// 形象仅两档：官方模型（extractor 本机生成）与截图素材；未就绪显示占位
type PetStyle = 'official' | 'sprite' | 'none'
const STYLE_LABEL: Record<PetStyle, string> = {
  official: '官方模型',
  sprite: '截图素材',
  none: '未提取'
}

type Anim = PetAnimation
type InteractionOrigin = 'manual' | 'idle'
const PET_ACTIONS = [
  { key: 'bounce', label: '高兴跳', text: '高兴跳~' },
  { key: 'howl', label: '嗷呜吼叫', text: '嗷呜——老板听见没~' },
  { key: 'cheer', label: '拜年', text: '恭喜发财，老板~' }
] as const

const randomAction = () => PET_ACTIONS[Math.floor(Math.random() * PET_ACTIONS.length)]

export default function App() {
  const [anim, setAnim] = useState<Anim>('')
  const [animationId, setAnimationId] = useState(0)
  const [bubble, setBubble] = useState('')
  const [menu, setMenu] = useState<{ x: number; y: number; page: 'main' | 'actions' | 'companion' } | null>(null)
  const menuOpen = menu !== null
  const menuRef = useRef<HTMLDivElement>(null)
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 })
  // 菜单渲染后夹进视口：右键点靠近右边/底边时向左上收，保证整块可见（layout 版避免首帧闪位）
  useLayoutEffect(() => {
    if (!menu) return
    const el = menuRef.current
    if (!el) return
    el.scrollTop = 0
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
  const [recordStartedAt, setRecordStartedAt] = useState<number | null>(null)
  const recording = recordStartedAt !== null
  const [style, setStyle] = useState<PetStyle>('none')
  const [spriteUrl, setSpriteUrl] = useState<string | null>(null)
  const [hasOfficial, setHasOfficial] = useState(false)
  const [preferences, setPreferences] = useState<AppSettings>(() => normalizeSettings(null))
  const [visible, setVisible] = useState(true)
  const visibleRef = useRef(true)

  useEffect(() => {
    let disposed = false
    let receivedChange = false
    const unsubscribe = window.api.onSettingsChanged((settings) => {
      receivedChange = true
      setPreferences(normalizeSettings(settings))
    })
    void window.api.getSettings().then((settings) => {
      if (!disposed && !receivedChange) setPreferences(normalizeSettings(settings))
    }).catch((error: unknown) => console.error('[pet-preferences]', error))
    return () => { disposed = true; unsubscribe() }
  }, [])

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

  const bubbleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const animTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const demoTimers = useRef<Array<ReturnType<typeof setTimeout>>>([])
  const recordFeedbackTimers = useRef<Array<ReturnType<typeof setTimeout>>>([])
  const recordBusy = useRef(false)
  const busyUntil = useRef(0)
  const motionOrigin = useRef<InteractionOrigin>('manual')
  const bubbleOrigin = useRef<InteractionOrigin>('manual')
  const pointer = useRef({ down: false, moved: false, x: 0, y: 0 })

  // 气泡独立显示在桌宠外侧，菜单打开时暂时收起。
  useEffect(() => {
    window.api.petBubble(visible && !menu && bubble ? { text: bubble } : null)
  }, [bubble, menu, visible])
  useEffect(() => () => window.api.petBubble(null), [])
  useEffect(() => {
    window.api.petMenu(menuOpen)
    return () => window.api.petMenu(false)
  }, [menuOpen])

  const MENU_ITEMS = [
    { key: 'record', label: () => (recording ? '结束记录' : '开始记录') },
    { key: 'panel', label: () => '打开战绩面板' },
    { key: 'launch', label: () => '货币战争启动!' },
    { key: 'settings', label: () => '设置' },
    { key: 'companion', label: () => '陪伴设置 ›' },
    { key: 'actions', label: () => '选择动作 ›' },
    { key: 'sep', label: () => '' },
    { key: 'quit', label: () => '退出' }
  ] as const
  const ACTION_ITEMS = [
    { key: 'back', label: () => '‹ 返回' },
    ...PET_ACTIONS.map((action) => ({ key: action.key, label: () => action.label })),
    { key: 'sep', label: () => '' },
    { key: 'demo', label: () => '演示三个动作' }
  ]
  const COMPANION_ITEMS = [
    { key: 'back', label: () => '‹ 返回' },
    { key: 'quiet', label: () => `安静模式：${preferences.quietMode ? '开' : '关'}` },
    { key: 'hide', label: () => '暂时收起桌宠' },
    { key: 'style', label: () => `形象·${STYLE_LABEL[style]}` }
  ]

  // —— 台词气泡 ——
  const say = useCallback((text: string, hold = 4000, origin: InteractionOrigin = 'manual') => {
    bubbleOrigin.current = origin
    setBubble(text)
    clearTimeout(bubbleTimer.current)
    bubbleTimer.current = setTimeout(() => setBubble(''), hold)
  }, [])

  const stopDemo = useCallback(() => {
    demoTimers.current.forEach(clearTimeout)
    demoTimers.current = []
  }, [])

  const playAnim = useCallback((a: Anim, inDemo = false, origin: InteractionOrigin = 'manual') => {
    if (!inDemo) stopDemo()
    motionOrigin.current = origin
    setAnim(a)
    setAnimationId((id) => id + 1)
    clearTimeout(animTimer.current)
    const ms = a ? PET_ANIMATION_MS[a] : 0
    busyUntil.current = Date.now() + ms
    animTimer.current = setTimeout(() => setAnim(''), ms)
  }, [stopDemo])

  useEffect(() => {
    let disposed = false
    let receivedChange = false
    const accept = (isVisible: boolean): void => {
      visibleRef.current = isVisible
      setVisible(isVisible)
      if (isVisible) return
      setMenu(null)
      stopDemo()
      clearTimeout(animTimer.current)
      clearTimeout(bubbleTimer.current)
      recordFeedbackTimers.current.forEach(clearTimeout)
      recordFeedbackTimers.current = []
      setAnim('')
      setBubble('')
      busyUntil.current = 0
      pointer.current.down = false
      window.api.petDrag('end')
    }
    const unsubscribe = window.api.onPetVisibility((isVisible) => { receivedChange = true; accept(isVisible) })
    void window.api.petVisibility().then((isVisible) => {
      if (!disposed && !receivedChange) accept(isVisible)
    }).catch((error: unknown) => console.error('[pet-visibility]', error))
    return () => { disposed = true; unsubscribe() }
  }, [stopDemo])

  useEffect(() => {
    if ((preferences.quietMode || !preferences.idleAnimations) && motionOrigin.current === 'idle') {
      clearTimeout(animTimer.current)
      setAnim('')
      busyUntil.current = 0
    }
    if ((preferences.quietMode || !preferences.idleTalk) && bubbleOrigin.current === 'idle') {
      clearTimeout(bubbleTimer.current)
      setBubble('')
    }
  }, [preferences.quietMode, preferences.idleAnimations, preferences.idleTalk])

  // 三个动作都可直接验收，不必反复开关记录或等待随机待机动作。
  const demonstrate = () => {
    stopDemo()
    let delay = 0
    for (const { key, text } of PET_ACTIONS) {
      demoTimers.current.push(setTimeout(() => { playAnim(key, true); say(text, PET_ANIMATION_MS[key]) }, delay))
      delay += PET_ANIMATION_MS[key] + 450
    }
    demoTimers.current.push(setTimeout(() => { demoTimers.current = [] }, delay))
  }

  useEffect(() => () => {
    clearTimeout(bubbleTimer.current)
    clearTimeout(animTimer.current)
    stopDemo()
  }, [stopDemo])

  // 自动陪伴可分别开关；收起、安静或正在操作菜单时不调度，也不在恢复时补播。
  useEffect(() => {
    if (!visible || menuOpen || preferences.quietMode || (!preferences.idleAnimations && !preferences.idleTalk)) return
    let t: ReturnType<typeof setTimeout>
    const schedule = () => {
      t = setTimeout(() => {
        if (Date.now() < busyUntil.current || demoTimers.current.length > 0 || pointer.current.down) { schedule(); return }
        if (preferences.idleAnimations) playAnim(randomAction().key, false, 'idle')
        if (preferences.idleTalk && (!preferences.idleAnimations || Math.random() < 0.4)) say(line('idle'), 4000, 'idle')
        schedule()
      }, idleDelayMs(preferences.activity))
    }
    schedule()
    return () => clearTimeout(t)
  }, [playAnim, say, visible, menuOpen, preferences.quietMode, preferences.idleAnimations, preferences.idleTalk, preferences.activity])

  // 表盘与右键菜单共用主进程记录状态；恢复渲染后也不会把活动记录错当成未开始。
  useEffect(() => {
    let receivedChange = false
    let disposed = false
    const unsubscribe = window.api.onRecordingChange(({ startedAt, match }) => {
      receivedChange = true
      setRecordStartedAt(startedAt)
      recordFeedbackTimers.current.forEach(clearTimeout)
      recordFeedbackTimers.current = []
      if (!visibleRef.current) return
      if (match) {
        playAnim(match.result === 'loss' ? 'howl' : 'bounce')
        say(match.result === 'win' || match.result === 'loss' ? line(match.result) : line('end'))
      } else if (startedAt !== null) {
        playAnim('cheer')
        say(line('start'))
      } else {
        playAnim('bounce')
        say('计时停了~截图后在面板 Ctrl+V 粘贴，老板~')
      }
    })
    void window.api.isRecording().then((startedAt) => {
      if (!disposed && !receivedChange) setRecordStartedAt(startedAt)
    }).catch((error: unknown) => console.error('[record-state]', error))
    return () => {
      disposed = true
      unsubscribe()
      recordFeedbackTimers.current.forEach(clearTimeout)
      recordFeedbackTimers.current = []
    }
  }, [playAnim, say])

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
      playAnim(randomAction().key)
      say(line('click'))
    }
  }

  // —— 秒表道具：开始/结束记录 ——
  const toggleRecord = async () => {
    if (recordBusy.current) return
    recordBusy.current = true
    try {
      if (recording) await window.api.recordEnd()
      else await window.api.recordStart()
    } catch (error) {
      console.error('[record-toggle]', error)
      say('记录没成功，老板再试一下~')
    } finally {
      recordBusy.current = false
    }
  }

  // —— 右键菜单 ——
  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    setMenu({ x: e.clientX, y: e.clientY, page: 'main' })
  }
  // Windows setShape 同时裁剪绘制：动作时放开头顶，菜单时放开整窗。
  // 气泡和可见计时表使用独立窗口，不占用本体的绘制与点击区域。
  useLayoutEffect(() => {
    if (menu) {
      window.api.petShape([{ x: 0, y: 0, width: 176, height: 212 }])
      return
    }
    const rects: PetRect[] = [
      anim ? { x: 24, y: 0, width: 128, height: 182 } : { x: 24, y: 34, width: 128, height: 148 }
    ]
    window.api.petShape(rects)
  }, [menu, anim])
  useEffect(() => {
    if (!menu) return
    const close = () => setMenu(null)
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }
    window.addEventListener('blur', close)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('blur', close)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [menu])

  const onMenuClick = async (key: string) => {
    if (key === 'actions' || key === 'companion' || key === 'back') {
      setMenu((current) => current && { ...current, page: key === 'back' ? 'main' : key })
      return
    }
    setMenu(null)
    if (key === 'hide') { window.api.petHide(); return }
    if (key === 'quiet') {
      try { await window.api.setSettings({ quietMode: !preferences.quietMode }) }
      catch { say('设置没保存成功，老板再试一下~') }
      return
    }
    const action = PET_ACTIONS.find((candidate) => candidate.key === key)
    if (action) {
      playAnim(action.key)
      say(action.text, PET_ANIMATION_MS[action.key])
      return
    }
    if (key === 'record') void toggleRecord()
    if (key === 'panel') window.api.panelToggle()
    if (key === 'demo') demonstrate()
    if (key === 'launch') {
      const ok = await window.api.launchGame()
      if (ok) { playAnim('cheer'); say(line('launch')) }
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
      if (ns !== style && ns !== 'none') {
        setStyle(ns)
        await window.api.setSettings({ petStyle: ns })
        say(`换装完毕~现在是「${STYLE_LABEL[ns]}」，老板觉得如何？`)
      }
    }
    if (key === 'quit') window.api.quit()
  }

  return (
    <div
      className="pet-root"
      data-pet-visible={visible}
      data-quiet-mode={preferences.quietMode}
      data-animation={anim}
      onContextMenu={onContextMenu}
      onPointerMove={onPointerMove}
      onPointerUp={onPetPointerUp}
    >
      {/* 桌宠本体（可拖动 + 点击） */}
      <div
        className="pet-hitbox"
        onPointerDown={onPetPointerDown}
        onClick={() => { /* 点击由 pointerup 统一处理，避免拖动误触发点击 */ }}
      >
        {style === 'official' ? (
          <PetOfficial anim={anim} animationId={animationId} paused={!visible} />
        ) : style === 'sprite' && spriteUrl ? (
          <PetSprite key={animationId} src={spriteUrl} anim={anim} />
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
      </div>

      {/* 右键菜单：打开后按实测尺寸夹进 176×212 视口（否则超出窗口底/右边被裁） */}
      {menu && (
        <div className="ctx-menu" ref={menuRef} role="menu" aria-label={menu.page === 'actions' ? '选择动作' : menu.page === 'companion' ? '陪伴设置' : '桌宠菜单'} style={{ left: menuPos.x, top: menuPos.y }}>
          {(menu.page === 'actions' ? ACTION_ITEMS : menu.page === 'companion' ? COMPANION_ITEMS : MENU_ITEMS).map((item) =>
            item.key === 'sep' ? (
              <div key="sep" className="ctx-sep" />
            ) : (
              <button key={item.key} type="button" role="menuitem" className="ctx-item" onClick={() => onMenuClick(item.key)}>
                {item.label()}
              </button>
            )
          )}
        </div>
      )}
    </div>
  )
}
