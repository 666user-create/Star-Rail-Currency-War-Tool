const fs = require('fs')
const path = require('path')

const files = ['src/Promo.tsx', 'src/scenes.json', 'src/Composition.tsx']
const probe = '\u8d27\u5e01\u6218\u4e89\u684c\u5ba0' // 货币战争桌宠

for (const f of files) {
  const full = path.join(process.cwd(), f)
  if (!fs.existsSync(full)) { console.log(f, '-> 不存在'); continue }
  const buf = fs.readFileSync(full)
  const text = buf.toString('utf8')
  const hasBom = buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF
  const ok = text.includes(probe)
  // 检测典型的 UTF8 被当 GBK 再存回来的乱码特征（出现大量非常用汉字）
  const garbled = /\u00e9\u00ab|\u00e6|\u00e7\u00bb|\u00e5\u00b8/.test(text) || /[\u0000-\u0008]/.test(text)
  console.log(`${f}: 长度=${text.length} BOM=${hasBom} 含"${probe}"=${ok} 疑似乱码=${garbled}`)
  if (!ok) {
    // 打印第一处中文字符附近的片段
    const idx = text.search(/[\u4e00-\u9fa5]/)
    if (idx >= 0) console.log('   首个中文位置:', idx, '->', JSON.stringify(text.slice(idx, idx + 20)))
  }
}
