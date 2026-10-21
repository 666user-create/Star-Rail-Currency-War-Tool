import React, { useEffect, useRef } from 'react'
import * as THREE from 'three'

/**
 * 原创小奇美拉桌宠 · 程序化 3D 版 v2
 * 比例来自官模（pet03）顶点实测：宽/高=0.89、头占身高 44%~100%、
 * 眼径≈0.20H @ 高度53%、身宽/头宽=0.70、耳尖±0.81H…（scripts/obj_profile.py）
 * 纯原创几何，可安全开源；对外接口与 PetArt 一致。
 */

type Anim = '' | 'bounce' | 'howl' | 'cheer'

function gradientMap(): THREE.DataTexture {
  const data = new Uint8Array([90, 160, 220, 255])
  const tex = new THREE.DataTexture(data, data.length, 1, THREE.RedFormat)
  tex.needsUpdate = true
  tex.minFilter = THREE.NearestFilter
  tex.magFilter = THREE.NearestFilter
  return tex
}

// 官模量尺（H=2 归一，脚底 y=0）
const H = 2
const BODY_HALF_W = 0.34 * H // 0.68 身半宽
const HEAD_HALF_W = 0.447 * H // 0.89 头半宽（含颊）
const FACE_BOTTOM = 0.44 * H // 0.88 脸底=头身分界
const EYE_Y = 0.53 * H // 1.06 眼高
const EYE_X = 0.184 * H // 0.37 眼距半
const EYE_R = 0.1 * H // 0.20 眼半径(径=0.20H)

function buildChimera() {
  const grad = gradientMap()
  const toon = (color: number, opts: Partial<THREE.MeshToonMaterialParameters> = {}) =>
    new THREE.MeshToonMaterial({ color, gradientMap: grad, ...opts })

  const fur = toon(0xf7ecd8)
  const hood = toon(0x2a2438)
  const faceMat = toon(0xfffaf0)
  const gold = toon(0xeab94f)
  const dark = toon(0x3b3247)
  const pink = toon(0xf3d9cf)
  const eyeRed = new THREE.MeshBasicMaterial({ color: 0xd93a3a })
  const eyeDark = new THREE.MeshBasicMaterial({ color: 0x3a1020 })
  const glint = new THREE.MeshBasicMaterial({ color: 0xffffff })
  const blushMat = new THREE.MeshBasicMaterial({ color: 0xf2788a, transparent: true, opacity: 0.6 })
  const mouthMat = new THREE.MeshBasicMaterial({ color: 0x7a3b46 })
  const mouthDark = toon(0x5c4150)

  const root = new THREE.Group()

  // —— 身体：窄于头（0.70 比），可见段 0~0.88 ——
  const body = new THREE.Mesh(new THREE.SphereGeometry(BODY_HALF_W, 32, 24), fur)
  body.scale.set(1, 0.8, 0.92)
  body.position.y = 0.52
  root.add(body)

  // 小脚（底 8%，总宽 0.35H）
  for (const s of [-1, 1]) {
    const foot = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 12), fur)
    foot.scale.set(1, 0.62, 1.3)
    foot.position.set(0.22 * s, 0.06, 0.14)
    root.add(foot)
    for (const t of [-0.05, 0.05]) {
      const toe = new THREE.Mesh(new THREE.SphereGeometry(0.026, 8, 6), toon(0xd94f4f))
      toe.position.set(0.22 * s + t, 0.03, 0.3)
      root.add(toe)
    }
  }

  // 小尾巴（侧面看点缀，正面不可见）
  const tail = new THREE.Mesh(new THREE.SphereGeometry(0.17, 16, 12), fur)
  tail.scale.set(1, 1, 1.35)
  tail.position.set(0, 0.5, -0.58)
  root.add(tail)

  // —— 手臂：官模身侧，臂尖不超头宽 ——
  const arms: THREE.Group[] = []
  for (const s of [-1, 1]) {
    const pivot = new THREE.Group()
    pivot.position.set(0.5 * s, 0.74, 0.1)
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.3, 6, 12), fur)
    arm.position.y = -0.2
    pivot.add(arm)
    const sleeve = new THREE.Mesh(new THREE.SphereGeometry(0.15, 14, 10), fur)
    sleeve.scale.set(1, 0.6, 1)
    sleeve.position.y = -0.03
    pivot.add(sleeve)
    pivot.rotation.z = s * -0.62
    root.add(pivot)
    arms.push(pivot)

    if (s === 1) {
      // 秒表道具（记录开关视觉锚点）
      const prop = new THREE.Group()
      prop.position.set(0, -0.38, 0.02)
      const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.04, 20), toon(0xfff6e3))
      glass.rotation.x = Math.PI / 2
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.02, 8, 24), toon(0xc2a877))
      const btn = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.035, 0.04), toon(0xd94f4f))
      btn.position.y = 0.11
      const hand = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.06, 0.01), dark)
      hand.position.z = 0.026
      prop.add(glass, rim, btn, hand)
      pivot.add(prop)
    }
  }

  // —— 项圈（半径必须大于该高度身体半径 0.58 才露得出）+ 金铃铛挂胸前 ——
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.63, 0.08, 10, 40), dark)
  collar.position.y = 0.82
  collar.rotation.x = Math.PI / 2
  root.add(collar)
  const bell = new THREE.Mesh(new THREE.SphereGeometry(0.17, 16, 12), gold)
  bell.position.set(0, 0.66, 0.52)
  root.add(bell)

  // —— 头部组（歪头/嗷呜作用点）：官模头占 44%~100% ——
  const head = new THREE.Group()
  head.position.y = 1.28
  root.add(head)

  const skull = new THREE.Mesh(new THREE.SphereGeometry(HEAD_HALF_W, 36, 26), hood)
  skull.scale.set(1, 0.553, 0.55) // ry≈0.47 → 0.81..1.75
  head.add(skull)

  // 耳朵：尖端达 2.0 顶、横向 ±0.81
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.52, 16), hood)
    ear.position.set(0.58 * s, 0.5, 0)
    ear.rotation.z = s * -0.42
    head.add(ear)
    const inner = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.32, 16), pink)
    inner.position.set(0.57 * s, 0.49, 0.06)
    inner.rotation.z = s * -0.42
    head.add(inner)
  }

  // 帽上白斑
  for (const [x, y, r] of [[-0.3, 0.34, 0.13], [0.32, 0.26, 0.1]] as const) {
    const spot = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 8), fur)
    spot.scale.set(1, 0.5, 0.55)
    spot.position.set(x, y, 0.36)
    head.add(spot)
  }

  // 脸面罩：中心(0,-0.12,0.32) 半轴(0.62,0.36,0.31) → 底=0.80 顶=1.52（世界），眼全落其中
  const face = new THREE.Mesh(new THREE.SphereGeometry(0.5, 32, 24), faceMat)
  face.scale.set(1.24, 0.72, 0.62)
  face.position.set(0, -0.12, 0.32)
  head.add(face)

  // 眼睛：压扁球体嵌入脸面（曲面上永不悬空），直径0.40 @ 中心±0.37
  const eyes = new THREE.Group()
  head.add(eyes)
  for (const s of [-1, 1]) {
    const backing = new THREE.Mesh(new THREE.SphereGeometry(EYE_R + 0.035, 26, 18), eyeDark)
    backing.scale.set(1, 1, 0.45)
    backing.position.set(EYE_X * s, -0.2, 0.49)
    eyes.add(backing)
    const e = new THREE.Mesh(new THREE.SphereGeometry(EYE_R, 26, 18), eyeRed)
    e.scale.set(1, 1, 0.45)
    e.position.set(EYE_X * s, -0.2, 0.535)
    eyes.add(e)
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(EYE_R * 0.36, 18, 12), eyeDark)
    pupil.scale.set(1, 1, 0.5)
    pupil.position.set(EYE_X * s, -0.21, 0.61)
    eyes.add(pupil)
    const g = new THREE.Mesh(new THREE.SphereGeometry(EYE_R * 0.3, 14, 10), glint)
    g.scale.set(1, 1, 0.5)
    g.position.set(EYE_X * s - 0.07, -0.3 + EYE_R * 0.55, 0.635)
    eyes.add(g)
    const g2 = new THREE.Mesh(new THREE.SphereGeometry(EYE_R * 0.15, 12, 8), glint)
    g2.scale.set(1, 1, 0.5)
    g2.position.set(EYE_X * s + 0.08, -0.3 - EYE_R * 0.5, 0.635)
    eyes.add(g2)
  }

  // 腮红：脸面曲线上 (±0.42,-0.26) → z≈0.514，压出到 0.535
  for (const s of [-1, 1]) {
    const b = new THREE.Mesh(new THREE.CircleGeometry(0.115, 16), blushMat)
    b.position.set(0.42 * s, -0.26, 0.535)
    b.rotation.y = s * -0.6
    head.add(b)
  }

  // ω 猫嘴 z=0.56 / 嗛呜 z=0.565 / 鼻 z=0.60（按脸面公式重算，避免埋进曲面）
  const mouthSmile = new THREE.Group()
  for (const s of [-1, 1]) {
    const arc = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.023, 8, 22, Math.PI), mouthDark)
    arc.position.set(0.09 * s, -0.36, 0.585)
    arc.rotation.z = Math.PI + s * 0.12
    mouthSmile.add(arc)
  }
  head.add(mouthSmile)
  const mouthOpen = new THREE.Mesh(new THREE.CircleGeometry(0.1, 20), mouthMat)
  mouthOpen.scale.set(1, 1.35, 1)
  mouthOpen.position.set(0, -0.37, 0.58)
  mouthOpen.visible = false
  head.add(mouthOpen)
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.033, 10, 8), mouthDark)
  nose.scale.set(1.3, 0.9, 0.8)
  nose.position.set(0, -0.28, 0.61)
  head.add(nose)

  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.7, 32),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.26 })
  )
  shadow.rotation.x = -Math.PI / 2
  shadow.position.y = 0.01

  void H
  return { root, head, eyes, mouthSmile, mouthOpen, arms, shadow }
}

export default function Pet3D({ anim }: { anim: Anim }) {
  const holder = useRef<HTMLDivElement>(null)
  const animRef = useRef<Anim>(anim)
  animRef.current = anim

  useEffect(() => {
    const el = holder.current
    if (!el) return

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(el.clientWidth || 260, el.clientHeight || 300)
    renderer.setClearColor(0x000000, 0)
    el.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(38, (el.clientWidth || 260) / (el.clientHeight || 300), 0.1, 20)
    camera.position.set(0, 1.0, 4.4)
    camera.lookAt(0, 1.0, 0)

    scene.add(new THREE.AmbientLight(0xffffff, 1.35))
    const key = new THREE.DirectionalLight(0xfff2d8, 1.6)
    key.position.set(2.5, 3.5, 2.5)
    scene.add(key)
    const fill = new THREE.DirectionalLight(0x9db4ff, 0.6)
    fill.position.set(-2.5, 1.5, -1)
    scene.add(fill)

    const pet = buildChimera()
    const wrap = new THREE.Group()
    wrap.add(pet.root)
    wrap.add(pet.shadow)
    scene.add(wrap)

    let raf = 0
    let blinkAt = performance.now() + 4500
    const start = performance.now()

    const loop = () => {
      raf = requestAnimationFrame(loop)
      const t = (performance.now() - start) / 1000
      const cur = animRef.current

      const breathe = Math.sin(t * 2.2) * 0.015
      pet.root.scale.y = 1 + breathe
      pet.root.position.y = 0
      pet.head.rotation.x = THREE.MathUtils.lerp(pet.head.rotation.x, 0, 0.15)
      pet.head.rotation.z = THREE.MathUtils.lerp(pet.head.rotation.z, Math.sin(t * 1.4) * 0.03, 0.1)
      const howling = cur === 'howl'
      pet.mouthSmile.visible = !howling
      pet.mouthOpen.visible = howling
      pet.arms[0].rotation.z = THREE.MathUtils.lerp(pet.arms[0].rotation.z, 0.62, 0.15)
      pet.arms[1].rotation.z = THREE.MathUtils.lerp(pet.arms[1].rotation.z, -0.62, 0.15)

      const now = performance.now()
      let eyeScale = 1
      if (now > blinkAt && now < blinkAt + 130) eyeScale = 0.1
      if (now >= blinkAt + 130) blinkAt = now + 2500 + Math.random() * 3000
      pet.eyes.scale.y = eyeScale

      if (cur === 'bounce') {
        pet.root.position.y = Math.abs(Math.sin(t * 7)) * 0.3
        pet.root.scale.y = 1 + breathe - Math.abs(Math.sin(t * 7)) * 0.08
      } else if (cur === 'cheer') {
        pet.root.position.y = Math.abs(Math.sin(t * 9)) * 0.16
        pet.arms[0].rotation.z = THREE.MathUtils.lerp(pet.arms[0].rotation.z, 2.4, 0.25)
        pet.arms[1].rotation.z = THREE.MathUtils.lerp(pet.arms[1].rotation.z, -2.4, 0.25)
      } else if (cur === 'howl') {
        pet.head.rotation.x = THREE.MathUtils.lerp(pet.head.rotation.x, -0.4, 0.2)
        pet.root.position.y = Math.sin(t * 3) * 0.02
      }

      renderer.render(scene, camera)
    }
    loop()

    const onResize = () => {
      const w = el.clientWidth || 260
      const h = el.clientHeight || 300
      renderer.setSize(w, h)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    }
    window.addEventListener('resize', onResize)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
      renderer.dispose()
      el.removeChild(renderer.domElement)
      pet.root.traverse((o) => {
        if (o instanceof THREE.Mesh) { o.geometry.dispose(); (o.material as THREE.Material).dispose() }
      })
    }
  }, [])

  return <div ref={holder} className="pet3d-holder" style={{ width: 260, height: 300 }} />
}
