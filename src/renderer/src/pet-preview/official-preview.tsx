import React, { useEffect, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import * as THREE from 'three'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'

/**
 * 官方解包模型本地预览（纯本地评估，素材不入 git）。
 * URL 参数：?ry=度数（绕 Y 轴旋转）  ?px=1（镜像翻转，X 轴）
 */
const BASE = '/official_pet/'
const q = new URLSearchParams(location.search)
const ry = (parseFloat(q.get('ry') ?? '0') * Math.PI) / 180
const flip = q.get('px') === '1'

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = url
  })
}

/** RGB 颜色图 + 红通道蒙版 → 带真实 alpha 的 CanvasTexture */
async function combine(rgbUrl: string, maskUrl: string): Promise<THREE.CanvasTexture> {
  const [rgb, mask] = await Promise.all([loadImage(rgbUrl), loadImage(maskUrl)])
  const c = document.createElement('canvas')
  c.width = rgb.width
  c.height = rgb.height
  const ctx = c.getContext('2d')!
  ctx.drawImage(rgb, 0, 0)
  const id = ctx.getImageData(0, 0, c.width, c.height)
  const mc = document.createElement('canvas')
  mc.width = mask.width
  mc.height = mask.height
  const mctx = mc.getContext('2d')!
  mctx.drawImage(mask, 0, 0)
  const mid = mctx.getImageData(0, 0, mc.width, mc.height)
  for (let i = 0; i < id.data.length; i += 4) id.data[i + 3] = mid.data[i]
  ctx.putImageData(id, 0, 0)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  return tex
}

function loadObj(file: string): Promise<THREE.Group> {
  return new Promise((resolve, reject) => {
    new OBJLoader().load(BASE + file, resolve, undefined, reject)
  })
}

export default function OfficialPreview() {
  const holder = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = holder.current
    if (!el) return
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(el.clientWidth || 300, el.clientHeight || 340)
    renderer.setClearColor(0x0d1226, 1)
    el.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(35, (el.clientWidth || 300) / (el.clientHeight || 340), 0.01, 100)
    camera.position.set(0, 0.1, 3.8)
    camera.lookAt(0, 0, 0)

    scene.add(new THREE.AmbientLight(0xffffff, 1.7))
    const key = new THREE.DirectionalLight(0xfff2d8, 1.8)
    key.position.set(2.5, 3.5, 2.5)
    scene.add(key)
    const fill = new THREE.DirectionalLight(0x9db4ff, 0.8)
    fill.position.set(-2.5, 1.5, -1.5)
    scene.add(fill)
    const rim = new THREE.DirectionalLight(0xffffff, 0.5)
    rim.position.set(0, 2, -3)
    scene.add(rim)

    const group = new THREE.Group()
    group.rotation.y = ry
    if (flip) group.scale.x = -1
    scene.add(group)

    let raf = 0
    const loop = () => {
      raf = requestAnimationFrame(loop)
      renderer.render(scene, camera)
    }
    loop()

    ;(async () => {
      const colorTex = await combine(BASE + 'pet03_color.png', BASE + 'pet03_color.png')
      // 无独立 alpha 蒙版：蒙版直接用自身 RGB → 全不透明（避免白底采样用 alphaTest 0）
      const mat = new THREE.MeshStandardMaterial({
        map: colorTex,
        roughness: 0.8,
        metalness: 0,
        side: THREE.DoubleSide
      })

      const parts: [string, THREE.Material][] = [['pet03.obj', mat]]
      for (const [file, mat] of parts) {
        const obj = await loadObj(file)
        obj.traverse((c) => {
          if (c instanceof THREE.Mesh) c.material = mat
        })
        group.add(obj)
      }

      // 自动取景：按包围盒缩放到统一高度并居中
      const box = new THREE.Box3().setFromObject(group)
      const size = box.getSize(new THREE.Vector3())
      if (size.y > 0) {
        const s = 1.7 / size.y
        group.scale.multiplyScalar(new THREE.Vector3(s, s, s).x)
        if (flip) group.scale.x *= -1
        const box2 = new THREE.Box3().setFromObject(group)
        const c = box2.getCenter(new THREE.Vector3())
        group.position.sub(c)
      }
      console.log('[official-preview] ready, size=', JSON.stringify(size))
    })().catch((e) => console.error('[official-preview] load failed', e))

    return () => {
      cancelAnimationFrame(raf)
      renderer.dispose()
      el.removeChild(renderer.domElement)
    }
  }, [])

  return <div ref={holder} style={{ width: 300, height: 340 }} />
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <OfficialPreview />
  </React.StrictMode>
)
