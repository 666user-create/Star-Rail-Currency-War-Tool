import React from 'react'
import { createRoot } from 'react-dom/client'
import Pet3D from '../pet/Pet3D'

/** 3D 桌宠开发预览页：?anim=bounce|howl|cheer 可指定动作，供 Electron 截图自查 */
const anim = (new URLSearchParams(location.search).get('anim') ?? '') as '' | 'bounce' | 'howl' | 'cheer'

createRoot(document.getElementById('root')!).render(
  <div style={{ position: 'relative', width: 300, height: 340 }}>
    <div style={{ position: 'absolute', left: 20, top: 20 }}>
      <Pet3D anim={anim} />
    </div>
  </div>
)
