import React from 'react'

/**
 * 原创小奇美拉桌宠 · 2D 量尺版 v3
 * 比例全部换算自官模（pet03）顶点实测：宽/高=0.89、头占44%~100%、
 * 眼径0.20H@53%高、±0.37H、身宽0.68H、耳尖±0.81H、项圈@0.82H、铃铛@0.66H。
 * 动画钩子与 styles.css 一致：pet-body / head / eyes / mouth-* / arm-* / stopwatch-prop
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
        <radialGradient id="fur" cx="38%" cy="28%" r="85%">
          <stop offset="0%" stopColor="#fffdf6" />
          <stop offset="55%" stopColor="#f5e9d2" />
          <stop offset="100%" stopColor="#dcc5a2" />
        </radialGradient>
        <radialGradient id="hood" cx="34%" cy="18%" r="95%">
          <stop offset="0%" stopColor="#453e5e" />
          <stop offset="45%" stopColor="#282238" />
          <stop offset="100%" stopColor="#16121f" />
        </radialGradient>
        <radialGradient id="face" cx="40%" cy="30%" r="80%">
          <stop offset="0%" stopColor="#fffaef" />
          <stop offset="70%" stopColor="#f7ecd8" />
          <stop offset="100%" stopColor="#e8d5b8" />
        </radialGradient>
        <radialGradient id="iris" cx="35%" cy="28%" r="80%">
          <stop offset="0%" stopColor="#ff9d9d" />
          <stop offset="45%" stopColor="#e04747" />
          <stop offset="100%" stopColor="#6e1a2e" />
        </radialGradient>
        <linearGradient id="bell" x1="0" y1="0" x2="0.3" y2="1">
          <stop offset="0%" stopColor="#ffeeb0" />
          <stop offset="45%" stopColor="#eab94f" />
          <stop offset="100%" stopColor="#a8772c" />
        </linearGradient>
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
        <clipPath id="bodyClip"><ellipse cx="100" cy="150" rx="68" ry="42" /></clipPath>
      </defs>

      {/* 地面软影 */}
      <ellipse cx="100" cy="215" rx="58" ry="9" fill="#0a0714" opacity="0.45" filter="url(#soft)" />

      <g className="pet-body">
        {/* 尾部羽饰（侧视点缀） */}
        <path
          d="M156 150 Q186 146 180 122 Q198 138 190 154 Q180 168 160 164 Z"
          fill="url(#fur)" stroke="#4a3f5c" strokeWidth="2.5" strokeLinejoin="round"
        />

        {/* 身体：官模 0.68H 半宽（x32..168, y108..192） */}
        <ellipse cx="100" cy="150" rx="68" ry="42" fill="url(#fur)" />
        <g clipPath="url(#bodyClip)">
          <ellipse cx="78" cy="134" rx="34" ry="22" fill="#fffdf6" opacity="0.55" filter="url(#soft)" />
          <ellipse cx="100" cy="190" rx="66" ry="18" fill="#a8895f" opacity="0.5" filter="url(#softer)" />
        </g>
        <ellipse cx="100" cy="150" rx="68" ry="42" fill="none" stroke="#4a3f5c" strokeWidth="2.5" />

        {/* 小脚：底 8%、总宽 0.35H */}
        <ellipse cx="78" cy="193" rx="15" ry="8" fill="url(#fur)" stroke="#4a3f5c" strokeWidth="2.5" />
        <ellipse cx="122" cy="193" rx="15" ry="8" fill="url(#fur)" stroke="#4a3f5c" strokeWidth="2.5" />
        <circle cx="73" cy="192" r="1.9" fill="#d94f4f" opacity="0.8" />
        <circle cx="83" cy="192" r="1.9" fill="#d94f4f" opacity="0.8" />
        <circle cx="117" cy="192" r="1.9" fill="#d94f4f" opacity="0.8" />
        <circle cx="127" cy="192" r="1.9" fill="#d94f4f" opacity="0.8" />

        {/* 鳍臂：身侧 ±64，外缘不超头宽 */}
        <ellipse className="arm-left" cx="36" cy="150" rx="15" ry="10" fill="url(#fur)" stroke="#4a3f5c" strokeWidth="2.5"
          style={{ transformOrigin: '50px 150px' }} />
        <ellipse className="arm-right" cx="164" cy="150" rx="15" ry="10" fill="url(#fur)" stroke="#4a3f5c" strokeWidth="2.5"
          style={{ transformOrigin: '150px 150px' }} />

        {/* 秒表道具（记录开关视觉锚点，热区见 prop-hotzone） */}
        <g className="stopwatch-prop" style={{ transformOrigin: '172px 157px' }}>
          <line x1="171" y1="156" x2="178" y2="176" stroke="#4a3f5c" strokeWidth="2.5" />
          <rect x="173" y="173.5" width="11" height="7" rx="2.5" fill="#d94f4f" stroke="#4a3f5c" strokeWidth="2" />
          <circle cx="178.5" cy="191" r="14" fill="url(#watchBody)" stroke="#4a3f5c" strokeWidth="2.5" />
          <circle cx="178.5" cy="191" r="9.5" fill="#fffaf0" stroke="#b8934e" strokeWidth="1.5" />
          <path d="M171 185.5 A9.5 9.5 0 0 1 178.5 181.5" stroke="#ffffff" strokeWidth="2.5" fill="none" opacity="0.9" strokeLinecap="round" />
          <line x1="178.5" y1="191" x2="178.5" y2="185" stroke="#4a3f5c" strokeWidth="2" strokeLinecap="round" />
          <line x1="178.5" y1="191" x2="184" y2="193.5" stroke="#d94f4f" strokeWidth="2" strokeLinecap="round" />
          <circle cx="178.5" cy="191" r="1.6" fill="#4a3f5c" />
        </g>

        {/* 项圈 @0.82H（y118）+ 铃铛 @0.66H（y134） */}
        <path d="M60 114 Q100 127 140 114 L138 126 Q100 139 62 126 Z" fill="#241e30" stroke="#4a3f5c" strokeWidth="2" />
        <circle cx="100" cy="137" r="14" fill="url(#bell)" stroke="#7a5a20" strokeWidth="1.8" />
        <path d="M92 131 A11 11 0 0 1 101 128" stroke="#fff8dc" strokeWidth="2.5" fill="none" opacity="0.95" strokeLinecap="round" />
        <line x1="90" y1="137" x2="110" y2="137" stroke="#7a5a20" strokeWidth="1.8" />
        <circle cx="100" cy="141.5" r="2.6" fill="#7a5a20" />

        {/* —— 头部：头区 y6..118（44%~100%H），头半宽 89 —— */}
        <g className="head">
          {/* 耳朵：立耳略外倾，尖端 ±62 @ y4 */}
          <path d="M66 42 L38 4 L94 24 Z" fill="url(#hood)" stroke="#4a3f5c" strokeWidth="2.5" strokeLinejoin="round" />
          <path d="M134 42 L162 4 L106 24 Z" fill="url(#hood)" stroke="#4a3f5c" strokeWidth="2.5" strokeLinejoin="round" />
          <path d="M68 37 L47 15 L84 27 Z" fill="#f3d9cf" />
          <path d="M132 37 L153 15 L116 27 Z" fill="#f3d9cf" />

          {/* 兜帽主体（眼位处与脸留 9px 侧缘，帽顶 y28） */}
          <ellipse cx="100" cy="70" rx="89" ry="42" fill="url(#hood)" stroke="#4a3f5c" strokeWidth="2.5" />
          {/* 帽侧绒球（颊部最宽处 ±89） */}
          <circle cx="26" cy="86" r="17" fill="url(#hood)" stroke="#4a3f5c" strokeWidth="2" />
          <circle cx="174" cy="86" r="17" fill="url(#hood)" stroke="#4a3f5c" strokeWidth="2" />
          {/* 帽顶冷光 */}
          <path d="M46 54 Q76 26 120 32" stroke="#8f86c9" strokeWidth="4.5" fill="none" opacity="0.35" filter="url(#soft)" strokeLinecap="round" />
          {/* 帽上奶白斑纹 */}
          <ellipse cx="74" cy="44" rx="9" ry="5.5" fill="#f5e9d2" transform="rotate(-16 74 44)" />
          <ellipse cx="127" cy="39" rx="6" ry="4.5" fill="#f5e9d2" transform="rotate(14 127 39)" />

          {/* 脸：y50..118（下巴收在项圈上方），x36..164 */}
          <ellipse cx="100" cy="84" rx="64" ry="34" fill="url(#face)" />
          <ellipse cx="100" cy="110" rx="44" ry="10" fill="#c9a97e" opacity="0.3" filter="url(#soft)" />

          {/* 眼睛：径40 @ (63/137, 94) */}
          <g className="eyes">
            <circle cx="63" cy="94" r="23" fill="#2c2333" />
            <circle cx="137" cy="94" r="23" fill="#2c2333" />
            <circle cx="63" cy="94" r="20" fill="url(#iris)" />
            <circle cx="137" cy="94" r="20" fill="url(#iris)" />
            <ellipse cx="64" cy="97" rx="7" ry="8" fill="#3a1020" />
            <ellipse cx="138" cy="97" rx="7" ry="8" fill="#3a1020" />
            <circle cx="56" cy="86" r="6" fill="#ffffff" />
            <circle cx="130" cy="86" r="6" fill="#ffffff" />
            <circle cx="71" cy="103" r="3" fill="#ffd9e2" />
            <circle cx="145" cy="103" r="3" fill="#ffd9e2" />
          </g>

          {/* 腮红 */}
          <ellipse cx="52" cy="104" rx="12" ry="7.5" fill="url(#blush)" />
          <ellipse cx="148" cy="104" rx="12" ry="7.5" fill="url(#blush)" />

          {/* 鼻 @y101 + ω 猫嘴 @y106..112 / 嗷呜 */}
          <ellipse cx="100" cy="101" rx="4" ry="3" fill="#6b4a55" />
          <path className="mouth-smile" d="M84 106 q8 9 16 0 q8 9 16 0" fill="none" stroke="#6b4a55" strokeWidth="3" strokeLinecap="round" />
          <g className="mouth-howl">
            <ellipse cx="100" cy="112" rx="11" ry="13" fill="#7a3b46" stroke="#6b4a55" strokeWidth="2" />
            <ellipse cx="100" cy="118" rx="6" ry="6" fill="#e88a96" />
          </g>
        </g>
      </g>
    </svg>
  )
}
