import React from 'react'

type Anim = '' | 'bounce' | 'howl' | 'cheer'

/**
 * 官方素材形象：静态图 + 代码动效（呼吸/蹦跳/歪头/欢呼由 CSS 驱动）。
 * 素材来自本地 assets/pet/sprite.png（非商业同人使用，附版权于面板页脚），不入 git。
 */
export default function PetSprite({ src, anim }: { src: string; anim: Anim }) {
  return (
    <div className="sprite-wrap">
      <img
        className={`sprite-pet sprite-${anim || 'idle'}`}
        src={src}
        alt="说怪话"
        draggable={false}
      />
    </div>
  )
}
