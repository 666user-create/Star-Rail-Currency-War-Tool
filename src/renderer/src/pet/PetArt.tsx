import React from 'react'

/**
 * 原创小奇美拉桌宠 · 2.5D 毛绒渐变版
 * （风格神似官方随宠"说怪话"的 3D 渲染质感，非复刻素材）
 * 动画钩子与 styles.css 保持一致：pet-body / head / eyes / mouth-* / arm-* / stopwatch-prop
 */
export default function PetArt({ anim }: { anim: string }) {
  return (
    <svg
      className={`pet-svg ${anim ? `anim-${anim}` : 'pet-breathe'}`}
      viewBox="0 0 200 230"
      width="220"
      height="253"
    >
      <defs>
        {/* 毛发底色：暖白，右下沉暖影 */}
        <radialGradient id="fur" cx="38%" cy="28%" r="85%">
          <stop offset="0%" stopColor="#fffdf6" />
          <stop offset="55%" stopColor="#f5e9d2" />
          <stop offset="100%" stopColor="#dcc5a2" />
        </radialGradient>
        {/* 黑毛兜帽：顶部冷高光，底部深邃 */}
        <radialGradient id="hood" cx="34%" cy="18%" r="95%">
          <stop offset="0%" stopColor="#453e5e" />
          <stop offset="45%" stopColor="#282238" />
          <stop offset="100%" stopColor="#16121f" />
        </radialGradient>
        {/* 脸部：更透的奶白 */}
        <radialGradient id="face" cx="40%" cy="30%" r="80%">
          <stop offset="0%" stopColor="#fffaef" />
          <stop offset="70%" stopColor="#f7ecd8" />
          <stop offset="100%" stopColor="#e8d5b8" />
        </radialGradient>
        {/* 红宝石眼睛 */}
        <radialGradient id="iris" cx="35%" cy="28%" r="80%">
          <stop offset="0%" stopColor="#ff9d9d" />
          <stop offset="45%" stopColor="#e04747" />
          <stop offset="100%" stopColor="#6e1a2e" />
        </radialGradient>
        {/* 金属铃铛 */}
        <linearGradient id="bell" x1="0" y1="0" x2="0.3" y2="1">
          <stop offset="0%" stopColor="#ffeeb0" />
          <stop offset="45%" stopColor="#eab94f" />
          <stop offset="100%" stopColor="#a8772c" />
        </linearGradient>
        {/* 秒表金属 */}
        <linearGradient id="watchBody" x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0%" stopColor="#fbf3dd" />
          <stop offset="55%" stopColor="#e6d3ab" />
          <stop offset="100%" stopColor="#c2a877" />
        </linearGradient>
        <radialGradient id="blush" cx="50%" cy="50%" r="60%">
          <stop offset="0%" stopColor="#f2788a" stopOpacity="0.65" />
          <stop offset="100%" stopColor="#f2788a" stopOpacity="0" />
        </radialGradient>
        <filter id="soft" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="3" />
        </filter>
        <filter id="softer" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="6" />
        </filter>
        <clipPath id="bodyClip"><ellipse cx="100" cy="152" rx="50" ry="46" /></clipPath>
        <clipPath id="headClip"><ellipse cx="100" cy="82" rx="62" ry="52" /></clipPath>
      </defs>

      {/* 地面软影 */}
      <ellipse cx="100" cy="217" rx="54" ry="9" fill="#0a0714" opacity="0.45" filter="url(#soft)" />

      <g className="pet-body">
        {/* 尾巴（蓬松） */}
        <path
          d="M150 156 Q182 152 176 126 Q194 142 186 158 Q176 172 156 168 Z"
          fill="url(#fur)" stroke="#4a3f5c" strokeWidth="2.5" strokeLinejoin="round"
        />
        <path d="M170 138 Q180 144 178 154" stroke="#fffdf6" strokeWidth="3" fill="none" opacity="0.5" strokeLinecap="round" />

        {/* 身体 */}
        <ellipse cx="100" cy="152" rx="50" ry="46" fill="url(#fur)" />
        <g clipPath="url(#bodyClip)">
          {/* 腹部高光 */}
          <ellipse cx="82" cy="136" rx="30" ry="24" fill="#fffdf6" opacity="0.55" filter="url(#soft)" />
          {/* 底部暖影 */}
          <ellipse cx="100" cy="196" rx="52" ry="20" fill="#a8895f" opacity="0.5" filter="url(#softer)" />
        </g>
        <ellipse cx="100" cy="152" rx="50" ry="46" fill="none" stroke="#4a3f5c" strokeWidth="2.5" />

        {/* 小脚 */}
        <ellipse cx="82" cy="194" rx="13.5" ry="8.5" fill="url(#fur)" stroke="#4a3f5c" strokeWidth="2.5" />
        <ellipse cx="118" cy="194" rx="13.5" ry="8.5" fill="url(#fur)" stroke="#4a3f5c" strokeWidth="2.5" />
        <circle cx="78" cy="193" r="1.8" fill="#f2788a" opacity="0.7" />
        <circle cx="86" cy="193" r="1.8" fill="#f2788a" opacity="0.7" />
        <circle cx="114" cy="193" r="1.8" fill="#f2788a" opacity="0.7" />
        <circle cx="122" cy="193" r="1.8" fill="#f2788a" opacity="0.7" />

        {/* 左臂 */}
        <ellipse className="arm-left" cx="52" cy="150" rx="14" ry="9.5" fill="url(#fur)" stroke="#4a3f5c" strokeWidth="2.5"
          style={{ transformOrigin: '64px 150px' }} />
        {/* 右臂 */}
        <ellipse className="arm-right" cx="148" cy="150" rx="14" ry="9.5" fill="url(#fur)" stroke="#4a3f5c" strokeWidth="2.5"
          style={{ transformOrigin: '136px 150px' }} />

        {/* 秒表道具 */}
        <g className="stopwatch-prop" style={{ transformOrigin: '158px 156px' }}>
          <line x1="157" y1="155" x2="168" y2="177" stroke="#4a3f5c" strokeWidth="2.5" />
          <rect x="162.5" y="174.5" width="11" height="7" rx="2.5" fill="#d94f4f" stroke="#4a3f5c" strokeWidth="2" />
          <circle cx="168" cy="192" r="15" fill="url(#watchBody)" stroke="#4a3f5c" strokeWidth="2.5" />
          <circle cx="168" cy="192" r="10.5" fill="#fffaf0" stroke="#b8934e" strokeWidth="1.5" />
          <path d="M160 186 A10 10 0 0 1 168 182" stroke="#ffffff" strokeWidth="2.5" fill="none" opacity="0.9" strokeLinecap="round" />
          <line x1="168" y1="192" x2="168" y2="185.5" stroke="#4a3f5c" strokeWidth="2" strokeLinecap="round" />
          <line x1="168" y1="192" x2="173.5" y2="194.5" stroke="#d94f4f" strokeWidth="2" strokeLinecap="round" />
          <circle cx="168" cy="192" r="1.6" fill="#4a3f5c" />
        </g>

        {/* 项圈 + 铃铛 */}
        <path d="M66 124 Q100 136 134 124 L132 133 Q100 145 68 133 Z" fill="#241e30" stroke="#4a3f5c" strokeWidth="2" />
        <circle cx="100" cy="141" r="11.5" fill="url(#bell)" stroke="#7a5a20" strokeWidth="1.8" />
        <path d="M93.5 136 A9 9 0 0 1 101 133.5" stroke="#fff8dc" strokeWidth="2.5" fill="none" opacity="0.95" strokeLinecap="round" />
        <line x1="92.5" y1="141" x2="107.5" y2="141" stroke="#7a5a20" strokeWidth="1.8" />
        <circle cx="100" cy="145" r="2.4" fill="#7a5a20" />

        {/* —— 头部 —— */}
        <g className="head">
          {/* 耳朵（外） */}
          <path d="M58 46 L40 4 L86 30 Z" fill="url(#hood)" stroke="#4a3f5c" strokeWidth="2.5" strokeLinejoin="round" />
          <path d="M142 46 L160 4 L114 30 Z" fill="url(#hood)" stroke="#4a3f5c" strokeWidth="2.5" strokeLinejoin="round" />
          {/* 耳朵（内，绒粉） */}
          <path d="M60 40 L49 16 L76 30 Z" fill="#f3d9cf" />
          <path d="M140 40 L151 16 L124 30 Z" fill="#f3d9cf" />

          {/* 兜帽主体 */}
          <ellipse cx="100" cy="82" rx="62" ry="52" fill="url(#hood)" stroke="#4a3f5c" strokeWidth="2.5" />
          {/* 帽侧绒球（更圆润的脸颊轮廓） */}
          <circle cx="48" cy="98" r="22" fill="url(#hood)" stroke="#4a3f5c" strokeWidth="2" />
          <circle cx="152" cy="98" r="22" fill="url(#hood)" stroke="#4a3f5c" strokeWidth="2" />
          {/* 帽顶冷光 */}
          <path d="M52 56 Q78 24 118 30" stroke="#8f86c9" strokeWidth="4" fill="none" opacity="0.35" filter="url(#soft)" strokeLinecap="round" />
          {/* 帽上奶白斑纹 */}
          <ellipse cx="73" cy="42" rx="8" ry="5" fill="#f5e9d2" transform="rotate(-16 73 42)" />
          <ellipse cx="125" cy="37" rx="5.5" ry="4" fill="#f5e9d2" transform="rotate(14 125 37)" />

          {/* 脸 */}
          <ellipse cx="100" cy="94" rx="45" ry="37" fill="url(#face)" />
          {/* 下巴软影 */}
          <ellipse cx="100" cy="122" rx="34" ry="10" fill="#c9a97e" opacity="0.35" filter="url(#soft)" />

          {/* 眼睛 */}
          <g className="eyes">
            {/* 眼窝软影 */}
            <ellipse cx="81" cy="91" rx="15" ry="14" fill="#8a6a55" opacity="0.25" filter="url(#soft)" />
            <ellipse cx="119" cy="91" rx="15" ry="14" fill="#8a6a55" opacity="0.25" filter="url(#soft)" />
            {/* 左眼 */}
            <circle cx="81" cy="90" r="13" fill="url(#iris)" stroke="#2c2333" strokeWidth="2.5" />
            <ellipse cx="82" cy="93" rx="5" ry="6" fill="#3a1020" />
            <circle cx="76.5" cy="85" r="4.5" fill="#ffffff" />
            <circle cx="86" cy="95.5" r="2.2" fill="#ffd9e2" />
            {/* 右眼 */}
            <circle cx="119" cy="90" r="13" fill="url(#iris)" stroke="#2c2333" strokeWidth="2.5" />
            <ellipse cx="120" cy="93" rx="5" ry="6" fill="#3a1020" />
            <circle cx="114.5" cy="85" r="4.5" fill="#ffffff" />
            <circle cx="124" cy="95.5" r="2.2" fill="#ffd9e2" />
            {/* 上眼睑 */}
            <path d="M70 84 Q81 76 92 84" stroke="#2c2333" strokeWidth="3.5" fill="none" strokeLinecap="round" />
            <path d="M108 84 Q119 76 130 84" stroke="#2c2333" strokeWidth="3.5" fill="none" strokeLinecap="round" />
          </g>

          {/* 腮红 */}
          <ellipse cx="62" cy="106" rx="11" ry="7" fill="url(#blush)" />
          <ellipse cx="138" cy="106" rx="11" ry="7" fill="url(#blush)" />

          {/* 嘴：默认猫唇 / 嗷呜 */}
          <path className="mouth-smile" d="M93 110 q4 5 7 0 q3 5 7 0" fill="none" stroke="#6b4a55" strokeWidth="2.5" strokeLinecap="round" />
          <g className="mouth-howl">
            <ellipse cx="100" cy="114" rx="9" ry="11" fill="#7a3b46" stroke="#6b4a55" strokeWidth="2" />
            <ellipse cx="100" cy="119" rx="5" ry="5" fill="#e88a96" />
          </g>
        </g>
      </g>
    </svg>
  )
}
