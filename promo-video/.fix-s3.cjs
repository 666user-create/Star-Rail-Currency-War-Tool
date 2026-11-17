// 把所有场景里"AbsoluteFill 居中 + Background 兄弟节点"的布局
// 统一改成：内容包一层绝对定位居中的 div，避免 Background 挤占 flex 空间
const fs = require('fs')
const p = 'src/Promo.tsx'
let c = fs.readFileSync(p, 'utf8')

// Scene3：把 <div style={{ fontSize: 40, ... }}>三步装好</div> 及其容器包进绝对定位层
const s3Old = `  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
      <Background accent />
      <div style={{ fontSize: 40, fontWeight: 800, color: GOLD, marginBottom: 34 }}>三步装好</div>`
const s3New = `  return (
    <AbsoluteFill>
      <Background accent />
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: "50%",
          transform: "translateY(-50%)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
      <div style={{ fontSize: 40, fontWeight: 800, color: GOLD, marginBottom: 34 }}>三步装好</div>`

if (c.includes(s3Old)) {
  c = c.replace(s3Old, s3New)
  console.log('Scene3 已改为绝对定位居中')
} else {
  console.log('Scene3 未匹配，跳过')
}

fs.writeFileSync(p, c, 'utf8')
