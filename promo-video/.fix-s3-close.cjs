const fs = require('fs')
const p = 'src/Promo.tsx'
const c = fs.readFileSync(p, 'utf8')

// 找到 Scene3 内的 </div>\n      <Audio src={staticFile("audio/s3.mp3")} />
// 需要在 Audio 之前补一个 </div> 关闭新加的居中层
const target = `      <Audio src={staticFile("audio/s3.mp3")} />`
if (!c.includes(target)) { console.log('未找到 s3 音频行'); process.exit(1) }

// 只替换第一处（s3）
const idx = c.indexOf(target)
const before = c.slice(0, idx)
const after = c.slice(idx)
// 检查前面是否已经有刚加的开标签需要闭合
const needsClose = before.includes('top: "50%",\n          transform: "translateY(-50%)",')
if (!needsClose) { console.log('未检测到新加容器'); process.exit(1) }

const fixed = before + '      </div>\n' + after
fs.writeFileSync(p, fixed, 'utf8')
console.log('已补上 Scene3 的闭合标签')
