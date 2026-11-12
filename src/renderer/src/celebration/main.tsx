import React from 'react'
import { createRoot } from 'react-dom/client'
import type { CelebrationData } from '@shared/types'
import { CelebrationCard } from '../panel/CelebrationCard'
import '../panel/styles.css'

/**
 * 离屏渲染页：主进程开一个隐藏窗口加载本页，把贺图数据通过 ?data= 传进来，
 * 渲染完成后由主进程 CDP 截图导出 PNG。
 *
 * 为什么要单独开窗口：面板窗口高度受屏幕限制（~816px），而贺图完整高度约 1144px，
 * 直接截会丢掉下半部分。隐藏窗口用 enableLargerThanScreen 可以远超屏幕尺寸。
 */
function readData(): CelebrationData | null {
  try {
    const raw = new URLSearchParams(window.location.search).get('data')
    if (!raw) return null
    // 主进程用 encodeURIComponent 传的 JSON 原文；URLSearchParams 已自动解码一次
    return JSON.parse(raw) as CelebrationData
  } catch {
    return null
  }
}

function App(): React.JSX.Element {
  const data = readData()
  if (!data) return <div>缺少贺图数据</div>

  return (
    <div className="celebration-standalone">
      <CelebrationCard
        data={data}
        onClose={() => undefined}
        standalone
      />
    </div>
  )
}

const container = document.getElementById('root')
if (container) {
  createRoot(container).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  )
}
