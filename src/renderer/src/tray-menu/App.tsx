import React, { useEffect, useState } from 'react'
import type { TrayMenuState, TrayMenuAction } from '@shared/types'

/** 自定义托盘菜单：与主界面统一深蓝金风格，替代 Windows 原生白底菜单。 */
export default function App() {
  // 浏览器直接打开预览页时没有 preload，用演示状态渲染，便于视觉自查
  const hasApi = typeof window !== 'undefined' && !!window.api
  const [state, setState] = useState<TrayMenuState | null>(
    hasApi ? null : { petHidden: false, quietMode: true, recording: false }
  )

  useEffect(() => {
    if (!hasApi) return
    void window.api.trayMenuState().then(setState).catch(() => {})
    const off = window.api.onTrayMenuState((next) => setState(next))
    // 失焦即关闭（与原生菜单行为一致）
    const blur = () => window.api.trayMenuClose()
    window.addEventListener('blur', blur)
    return () => { off(); window.removeEventListener('blur', blur) }
  }, [hasApi])

  const act = (action: TrayMenuAction) => { if (hasApi) window.api.trayMenuAction(action) }
  const close = () => { if (hasApi) window.api.trayMenuClose() }

  // 首帧未拿到状态时不渲染，避免闪烁
  if (!state) return <div className="tray-root" />

  return (
    <div className="tray-root">
      <div className="tray-card">
        {state.recording && <div className="tray-badge">● 记录中</div>}
        <button className="tray-item" onClick={() => act('toggle-pet')}>
          {state.petHidden ? '显示桌宠' : '暂时收起桌宠'}
        </button>
        <button className={`tray-item ${state.quietMode ? 'on' : ''}`} onClick={() => act('toggle-quiet')}>
          <span>安静模式</span>
          <span className="tray-switch" data-on={state.quietMode ? '1' : '0'} aria-hidden="true"><i /></span>
        </button>
        <button className="tray-item" onClick={() => act('open-panel')}>战绩与待确认记录</button>
        <button className="tray-item" onClick={() => act('open-settings')}>设置</button>
        <div className="tray-sep" />
        <button className="tray-item danger" onClick={() => act('quit')}>退出</button>
      </div>
      <button className="tray-scrim" aria-label="关闭菜单" onClick={close} tabIndex={-1} />
    </div>
  )
}
