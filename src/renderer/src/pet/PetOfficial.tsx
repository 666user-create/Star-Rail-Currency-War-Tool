import React, { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import { createHsrToon } from './toonMaterial'

type Anim = '' | 'bounce' | 'howl' | 'cheer'

/**
 * 官方解包模型档（说怪话 pet03）：素材经主进程 IPC 读取（本地目录，不入 git）。
 * 静态绑定姿态 + 整身代码动效（呼吸/蹦跳/歪头/欢呼）；骨骼动画留待 ACL 破解后的远期。
 */
export default function PetOfficial({ anim }: { anim: Anim }) {
  const holder = useRef<HTMLDivElement>(null)
  const animRef = useRef<Anim>(anim)
  animRef.current = anim

  useEffect(() => {
    const el = holder.current
    if (!el) return

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(176, 212)
    renderer.setClearColor(0x000000, 0)
    el.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(36, 176 / 212, 0.01, 100)
    camera.position.set(0, 0.05, 3.4)
    camera.lookAt(0, 0, 0)

    // 压低环境光让黑帽显黑（游戏内观感）
    scene.add(new THREE.AmbientLight(0xffffff, 0.9))
    const key = new THREE.DirectionalLight(0xfff4e0, 1.5)
    key.position.set(2, 3, 2.5)
    scene.add(key)
    const fill = new THREE.DirectionalLight(0x9db4ff, 0.5)
    fill.position.set(-2.5, 1, -1)
    scene.add(fill)
    const rim = new THREE.DirectionalLight(0xffffff, 0.4)
    rim.position.set(0, 2, -3)
    scene.add(rim)

    const wrap = new THREE.Group() // 动画作用层
    const inner = new THREE.Group() // 对齐/缩放层
    wrap.add(inner)
    scene.add(wrap)

    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.55, 32),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false })
    )
    shadow.rotation.x = -Math.PI / 2
    shadow.position.y = -0.8
    let shadowBaseY = -0.8 // 世界系贴地基准（模型定标后更新），跳跃时影子不跟着上浮
    wrap.add(shadow)

    let raf = 0
    const start = performance.now()
    let lastAnim: Anim = ''
    let animT0 = 0
    const loop = () => {
      raf = requestAnimationFrame(loop)
      const t = (performance.now() - start) / 1000
      const cur = animRef.current
      if (cur !== lastAnim) { lastAnim = cur; animT0 = t } // 动作内相位：触发即从头播放，避免接上随机相位跳变
      const at = t - animT0
      wrap.position.y = 0
      wrap.rotation.set(0, 0, 0)
      wrap.scale.set(1, 1, 1)
      if (cur === 'bounce') {
        // 参考视频实测（t4.8-5.2 / 6.4-6.6 / 6.9-7.1）：兴奋时一小串连跳 —— 每跳周期
        // 0.75s（腾空~0.26s、顶点~0.18、落地停顿~0.28s 再起下一跳），空中腿收+微后仰
        // （原版双臂上举，刚体模型做不了，用整体拉伸+后仰近似兴奋感）
        const p = at % 0.75
        let y = 0
        let sy = 1
        let sx = 1
        let pitch = 0
        if (p < 0.08) {
          const k = p / 0.08 // 蓄力下蹲
          y = -0.015 * k * k
          sy = 1 - 0.06 * k * k
          sx = 1 + 0.03 * k * k
        } else if (p < 0.12) {
          const k = (p - 0.08) / 0.04 // 蹬地拉伸
          y = -0.015 + 0.065 * k
          sy = 0.94 + 0.18 * k
          sx = 1.03 - 0.11 * k
        } else if (p < 0.38) {
          const k = (p - 0.12) / 0.26 // 空中抛物线
          y = 0.05 * (1 - k) + 0.62 * k * (1 - k)
          const fast = Math.abs(Math.cos(Math.PI * k))
          sy = 1 + 0.07 * fast
          sx = 1 - 0.035 * fast
          pitch = -0.06 * Math.sin(Math.PI * k) // 腾空轻微后仰（近似原版上举发力感）
        } else if (p < 0.47) {
          const v = (p - 0.38) / 0.09 // 落地压扁
          const hit = Math.sin(Math.PI * v)
          y = -0.02 * hit
          sy = 1 - 0.13 * hit
          sx = 1 + 0.065 * hit
        } // [0.47,0.75) 落地停顿，蓄势下一跳
        wrap.position.y = y
        wrap.scale.y = sy
        wrap.scale.x = sx
        wrap.rotation.x = pitch
      } else if (cur === 'cheer') {
        wrap.position.y = Math.abs(Math.sin(at * 9)) * 0.10
        wrap.rotation.z = Math.sin(at * 9) * 0.04
      } else if (cur === 'howl') {
        wrap.rotation.x = -0.16
        wrap.rotation.z = Math.sin(at * 4) * 0.05
      } else {
        // 对齐参考视频的站姿：几乎静止 —— 极微呼吸 + 每~7s 一次的缓慢重心侧倾。
        // 参考里没有连续摇摆（上一版 0.9Hz 摇摆不像的来源），也从不离地
        wrap.position.y = Math.sin(t * 1.3) * 0.006
        wrap.rotation.z = Math.sin(t * 0.45) * 0.035
        wrap.scale.y = 1 + Math.sin(t * 1.3) * 0.008
        wrap.scale.x = 1 - Math.sin(t * 1.3) * 0.004
      }
      // 影子钉在地面：反向抵消 wrap 的位移，并随腾空高度缩小
      shadow.position.y = shadowBaseY - wrap.position.y
      const sk = Math.min(1.1, Math.max(0.55, 1 - wrap.position.y * 1.5))
      shadow.scale.set(sk, sk, 1)
      renderer.render(scene, camera)
    }
    loop()

    ;(async () => {
      const data = await window.api.officialModel()
      if (!data) {
        console.log('[official] assets missing')
        return
      }
      const tex = await new THREE.TextureLoader().loadAsync('data:image/png;base64,' + data.tex)
      const loader = new THREE.TextureLoader()
      const cool = data.cool
        ? await loader.loadAsync('data:image/png;base64,' + data.cool)
        : undefined
      const warm = data.warm
        ? await loader.loadAsync('data:image/png;base64,' + data.warm)
        : undefined
      const obj = new OBJLoader().parse(data.obj)
      const mat = createHsrToon(tex, cool, warm)
      obj.traverse((c) => {
        if (c instanceof THREE.Mesh) c.material = mat
      })
      inner.add(obj)

      const box = new THREE.Box3().setFromObject(inner)
      const size = box.getSize(new THREE.Vector3())
      if (size.y > 0) {
        const s = 1.55 / size.y
        inner.scale.setScalar(s)
        const b2 = new THREE.Box3().setFromObject(inner)
        const c = b2.getCenter(new THREE.Vector3())
        inner.position.sub(c)
        const h = b2.max.y - b2.min.y
        shadowBaseY = -h / 2 + 0.02
        shadow.position.y = shadowBaseY
        camera.position.set(0, 0.02, Math.max(h, 0.5) * 2.7)
        camera.lookAt(0, 0, 0)
      }
      console.log('[official] ready')
    })().catch((e) => console.error('[official] load failed', e))

    return () => {
      cancelAnimationFrame(raf)
      renderer.dispose()
      el.removeChild(renderer.domElement)
    }
  }, [])

  return <div ref={holder} className="pet3d-holder" style={{ width: 176, height: 212 }} />
}
