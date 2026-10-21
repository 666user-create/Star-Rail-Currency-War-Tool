import React, { useEffect, useRef } from 'react'
import * as THREE from 'three'

/**
 * 原创小奇美拉桌宠 · 程序化 3D 版（潮玩手办风）
 * 全部几何体代码拼装，零外部素材；Toon 分步光照 + 透明背景。
 * 对外接口与 PetArt 一致：传入 anim 状态（'' | bounce | howl | cheer）。
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
  const blushMat = new THREE.MeshBasicMaterial({ color: 0xf2788a, transparent: true, opacity: 0.55 })
  const mouthMat = new THREE.MeshBasicMaterial({ color: 0x7a3b46 })

  const root = new THREE.Group()

  // 身体
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.55, 32, 24), fur)
  body.scale.set(1, 0.92, 0.95)
  body.position.y = 0.55
  root.add(body)

  // 小脚
  for (const s of [-1, 1]) {
    const foot = new THREE.Mesh(new THREE.SphereGeometry(0.17, 16, 12), fur)
    foot.scale.set(1, 0.6, 1.2)
    foot.position.set(0.24 * s, 0.1, 0.16)
    root.add(foot)
  }

  // 尾巴
  const tail = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12), fur)
  tail.scale.set(1, 1, 1.5)
  tail.position.set(0, 0.5, -0.52)
  root.add(tail)

  // 手臂（可动组）
  const arms: THREE.Group[] = []
  for (const s of [-1, 1]) {
    const pivot = new THREE.Group()
    pivot.position.set(0.5 * s, 0.78, 0.1)
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.2, 6, 12), fur)
    arm.position.y = -0.16
    arm.rotation.z = 0
    pivot.add(arm)
    pivot.rotation.z = s * -0.5 // 默认向外撇
    root.add(pivot)
    arms.push(pivot)

    // 右手挂秒表道具（记录开关的视觉锚点，热区见 App 的 prop-hotzone）
    if (s === 1) {
      const prop = new THREE.Group()
      prop.position.set(0, -0.34, 0.02)
      const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.04, 20), toon(0xfff6e3))
      glass.rotation.x = Math.PI / 2
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.02, 8, 24), toon(0xc2a877))
      const btn = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.04, 0.04), toon(0xd94f4f))
      btn.position.y = 0.12
      const hand = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.07, 0.01), dark)
      hand.position.z = 0.028
      prop.add(glass, rim, btn, hand)
      pivot.add(prop)
    }
  }

  // 项圈 + 铃铛
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.06, 10, 32), dark)
  collar.position.y = 0.98
  collar.rotation.x = Math.PI / 2
  root.add(collar)
  const bell = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 12), gold)
  bell.position.set(0, 0.9, 0.36)
  root.add(bell)

  // 头（可动组：歪头/嗷呜抬头都作用于它）
  const head = new THREE.Group()
  head.position.y = 1.32
  root.add(head)

  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.68, 32, 24), hood)
  skull.scale.set(1, 0.92, 0.95)
  head.add(skull)

  // 脸（前凸奶白面罩）
  const face = new THREE.Mesh(new THREE.SphereGeometry(0.5, 32, 24), faceMat)
  face.scale.set(0.82, 0.72, 0.62)
  face.position.set(0, -0.1, 0.34)
  head.add(face)

  // 耳朵
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.5, 16), hood)
    ear.position.set(0.4 * s, 0.62, 0)
    ear.rotation.z = s * -0.45
    head.add(ear)
    const inner = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.3, 16), pink)
    inner.position.set(0.4 * s, 0.6, 0.06)
    inner.rotation.z = s * -0.45
    head.add(inner)
  }

  // 帽上白斑
  for (const [x, y, r] of [[-0.28, 0.5, 0.11], [0.3, 0.42, 0.08]] as const) {
    const spot = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 8), fur)
    spot.scale.set(1, 0.55, 0.6)
    spot.position.set(x, y, 0.38)
    head.add(spot)
  }

  // 眼睛（眨眼通过整体 scaleY 实现）
  const eyes = new THREE.Group()
  head.add(eyes)
  for (const s of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.CircleGeometry(0.13, 24), eyeRed)
    e.position.set(0.17 * s, -0.06, 0.66)
    eyes.add(e)
    const pupil = new THREE.Mesh(new THREE.CircleGeometry(0.055, 20), eyeDark)
    pupil.position.set(0.17 * s, -0.065, 0.665)
    eyes.add(pupil)
    const g = new THREE.Mesh(new THREE.CircleGeometry(0.04, 16), glint)
    g.position.set(0.17 * s - 0.045, 0.005, 0.67)
    eyes.add(g)
  }

  // 腮红
  for (const s of [-1, 1]) {
    const b = new THREE.Mesh(new THREE.CircleGeometry(0.07, 16), blushMat)
    b.position.set(0.3 * s, -0.2, 0.6)
    b.rotation.y = s * -0.5
    head.add(b)
  }

  // 嘴（嗷呜时放大）
  const mouth = new THREE.Mesh(new THREE.CircleGeometry(0.05, 16), mouthMat)
  mouth.scale.set(1.3, 0.7, 1)
  mouth.position.set(0, -0.24, 0.67)
  head.add(mouth)

  // 接地影
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.6, 32),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35 })
  )
  shadow.rotation.x = -Math.PI / 2
  shadow.position.y = 0.01

  return { root, head, eyes, mouth, arms, shadow }
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
    camera.position.set(0, 1.35, 4.1)
    camera.lookAt(0, 1.05, 0)

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
    let blinkAt = performance.now() + 2500
    const start = performance.now()

    const loop = () => {
      raf = requestAnimationFrame(loop)
      const t = (performance.now() - start) / 1000
      const cur = animRef.current

      // 呼吸 + 待机
      const breathe = Math.sin(t * 2.2) * 0.015
      pet.root.scale.y = 1 + breathe
      pet.root.position.y = 0
      pet.head.rotation.x = THREE.MathUtils.lerp(pet.head.rotation.x, 0, 0.15)
      pet.head.rotation.z = THREE.MathUtils.lerp(pet.head.rotation.z, Math.sin(t * 1.4) * 0.03, 0.1)
      pet.mouth.scale.set(1.3, 0.7, 1)
      pet.arms[0].rotation.z = THREE.MathUtils.lerp(pet.arms[0].rotation.z, 0.5, 0.15)
      pet.arms[1].rotation.z = THREE.MathUtils.lerp(pet.arms[1].rotation.z, -0.5, 0.15)

      // 眨眼
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
        pet.mouth.scale.set(1.6, 2.4, 1)
        pet.root.position.y = Math.sin(t * 3) * 0.02
      }

      // 动作状态由组件层定时复位（anim=''），此处只负责渲染当前状态

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

  return <div ref={holder} className="pet3d-holder" />
}
