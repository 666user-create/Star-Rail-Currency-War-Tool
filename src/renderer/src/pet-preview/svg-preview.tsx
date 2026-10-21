import React from 'react'
import { createRoot } from 'react-dom/client'
import PetArt from '../pet/PetArt'
import '../pet/styles.css'

/** 2D 量尺版桌宠开发预览 */
const anim = (new URLSearchParams(location.search).get('anim') ?? '') as '' | 'bounce' | 'howl' | 'cheer'

createRoot(document.getElementById('root')!).render(
  <div style={{ position: 'relative', width: 300, height: 340 }}>
    <div style={{ position: 'absolute', left: 40, top: 40 }}>
      <PetArt anim={anim} />
    </div>
  </div>
)
