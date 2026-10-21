import React from 'react'

/**
 * 原创小奇美拉桌宠（风格神似官方随宠"说怪话"，非复刻素材）。
 * 动画通过 CSS 类驱动：breathe（默认呼吸）/ bounce / howl / cheer。
 */
export default function PetArt({ anim }: { anim: string }) {
  return (
    <svg
      className={`pet-svg ${anim ? `anim-${anim}` : 'pet-breathe'}`}
      viewBox="0 0 200 230"
      width="220"
      height="253"
    >
      {/* 影子 */}
      <ellipse cx="100" cy="216" rx="52" ry="9" fill="rgba(0,0,0,0.35)" />

      <g className="pet-body">
        {/* 尾巴 */}
        <path
          d="M148 158 Q176 150 172 130 Q186 148 160 166 Z"
          fill="#f6ecd9" stroke="#3b2f42" strokeWidth="3" strokeLinejoin="round"
        />

        {/* 身体 */}
        <ellipse cx="100" cy="152" rx="50" ry="46" fill="#f6ecd9" stroke="#3b2f42" strokeWidth="3" />

        {/* 小脚 */}
        <ellipse cx="82" cy="194" rx="13" ry="8" fill="#f6ecd9" stroke="#3b2f42" strokeWidth="3" />
        <ellipse cx="118" cy="194" rx="13" ry="8" fill="#f6ecd9" stroke="#3b2f42" strokeWidth="3" />

        {/* 左臂 */}
        <ellipse className="arm-left" cx="52" cy="150" rx="13" ry="9"
          fill="#f6ecd9" stroke="#3b2f42" strokeWidth="3"
          style={{ transformOrigin: '64px 150px' }} />

        {/* 右臂 + 秒表道具 */}
        <ellipse className="arm-right" cx="148" cy="150" rx="13" ry="9"
          fill="#f6ecd9" stroke="#3b2f42" strokeWidth="3"
          style={{ transformOrigin: '136px 150px' }} />

        <g className="stopwatch-prop" style={{ transformOrigin: '158px 156px' }}>
          <line x1="158" y1="156" x2="168" y2="178" stroke="#3b2f42" strokeWidth="3" />
          <rect x="163" y="176" width="10" height="6" rx="2" fill="#d94f4f" stroke="#3b2f42" strokeWidth="2" />
          <circle cx="168" cy="192" r="14" fill="#fff6e3" stroke="#3b2f42" strokeWidth="3" />
          <circle cx="168" cy="192" r="9" fill="none" stroke="#e8b64c" strokeWidth="1.5" />
          <line x1="168" y1="192" x2="168" y2="186" stroke="#3b2f42" strokeWidth="2" strokeLinecap="round" />
          <line x1="168" y1="192" x2="173" y2="194" stroke="#d94f4f" strokeWidth="2" strokeLinecap="round" />
        </g>

        {/* 项圈 + 铃铛 */}
        <rect x="68" y="122" width="64" height="12" rx="6" fill="#211b28" stroke="#3b2f42" strokeWidth="2" />
        <circle cx="100" cy="140" r="11" fill="#e8b64c" stroke="#3b2f42" strokeWidth="3" />
        <line x1="93" y1="140" x2="107" y2="140" stroke="#3b2f42" strokeWidth="2" />
        <circle cx="100" cy="144" r="2.4" fill="#3b2f42" />

        {/* 头部兜帽（黑毛） */}
        <g className="head">
          <ellipse cx="100" cy="80" rx="62" ry="52" fill="#211b28" stroke="#3b2f42" strokeWidth="3" />
          {/* 耳朵 */}
          <path d="M58 44 L42 6 L84 30 Z" fill="#211b28" stroke="#3b2f42" strokeWidth="3" strokeLinejoin="round" />
          <path d="M142 44 L158 6 L116 30 Z" fill="#211b28" stroke="#3b2f42" strokeWidth="3" strokeLinejoin="round" />
          <path d="M60 38 L50 16 L74 30 Z" fill="#f6ecd9" />
          <path d="M140 38 L150 16 L126 30 Z" fill="#f6ecd9" />
          {/* 帽上白点 */}
          <ellipse cx="72" cy="40" rx="7" ry="5" fill="#f6ecd9" transform="rotate(-15 72 40)" />
          <ellipse cx="126" cy="36" rx="5" ry="4" fill="#f6ecd9" transform="rotate(12 126 36)" />

          {/* 脸 */}
          <ellipse cx="100" cy="94" rx="45" ry="36" fill="#f6ecd9" />

          {/* 眼睛 */}
          <g className="eyes">
            <circle cx="81" cy="90" r="12.5" fill="#d93a3a" stroke="#3b2f42" strokeWidth="3" />
            <circle cx="119" cy="90" r="12.5" fill="#d93a3a" stroke="#3b2f42" strokeWidth="3" />
            <circle cx="84" cy="86" r="4" fill="#ffffff" />
            <circle cx="122" cy="86" r="4" fill="#ffffff" />
            <circle cx="78" cy="95" r="2" fill="#ffd9d9" />
            <circle cx="116" cy="95" r="2" fill="#ffd9d9" />
          </g>

          {/* 腮红 */}
          <ellipse cx="64" cy="106" rx="8" ry="5" fill="rgba(242,120,136,0.55)" />
          <ellipse cx="136" cy="106" rx="8" ry="5" fill="rgba(242,120,136,0.55)" />

          {/* 嘴：默认猫嘴 / 嗷呜张嘴 */}
          <path className="mouth-smile" d="M92 110 q8 8 16 0" fill="none" stroke="#3b2f42" strokeWidth="3" strokeLinecap="round" />
          <ellipse className="mouth-howl" cx="100" cy="113" rx="8" ry="10" fill="#7a3b46" stroke="#3b2f42" strokeWidth="2.5" />
        </g>
      </g>
    </svg>
  )
}
