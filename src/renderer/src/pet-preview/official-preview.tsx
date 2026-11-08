import React from 'react'
import { createRoot } from 'react-dom/client'
import Preview from './Preview'

const root = createRoot(document.getElementById('root')!)
root.render(<Preview />)

// 入口自身被修改时释放旧 React 树；组件更新由独立的 Fast Refresh 边界处理。
if (import.meta.hot) {
  import.meta.hot.dispose(() => root.unmount())
}
