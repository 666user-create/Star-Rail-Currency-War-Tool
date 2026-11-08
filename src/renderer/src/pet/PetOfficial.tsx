import React, { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import { createHsrToon } from './toonMaterial'
import { createPetRig, type PetRig } from './petRig'
import { PET_ANIMATION_MS, PET_REST_POSE, samplePetMotion, type PetAnimation, type PetPose } from './petMotion'
import { createPetRenderScheduler, type PetRenderMode } from './petRenderScheduler'

export interface OfficialPetAssets {
  obj: string
  tex: string
  cool?: string
  warm?: string
}

interface Props {
  anim: PetAnimation
  /** 同一个动作再次触发也从头播放，不靠卸载 WebGL 场景重播。 */
  animationId?: number
  loadAssets?: () => Promise<OfficialPetAssets | null>
  width?: number
  height?: number
  /** 开发预览可定点检查姿态，正式桌宠使用自己的播放时钟。 */
  previewTime?: number
  rotationY?: number
  /** 窗口主动收起时取消渲染调度，动作时钟仍按真实时间前进。 */
  paused?: boolean
  onReady?: (diagnostics: PetRig['diagnostics']) => void
}

const loadLocalAssets = () => window.api.officialModel()

/** 素材由本机生成。加载时建立局部绑定，动作与素材提取相互独立。 */
export default function PetOfficial({
  anim, animationId = 0, loadAssets = loadLocalAssets,
  width = 176, height = 212, previewTime, rotationY = 0, paused = false, onReady
}: Props) {
  const holder = useRef<HTMLDivElement>(null)
  const playback = useRef({ anim, animationId, previewTime, rotationY, paused })
  playback.current = { anim, animationId, previewTime, rotationY, paused }
  const updatePlayback = useRef<(() => void) | undefined>(undefined)
  const readyCallback = useRef(onReady)
  readyCallback.current = onReady
  const [error, setError] = useState('')
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const el = holder.current
    if (!el) return
    let disposed = false
    let rig: PetRig | null = null
    let material: THREE.ShaderMaterial | null = null
    const resources = new Set<{ dispose(): void }>()
    const track = <T extends { dispose(): void }>(resource: T): T => {
      if (disposed) resource.dispose()
      else resources.add(resource)
      return resource
    }
    setReady(false)
    setError('')

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(width, height)
    renderer.setClearColor(0x000000, 0)
    el.appendChild(renderer.domElement)
    const scene = new THREE.Scene()
    // 预留直立和腾空空间，脚底固定在画面下部，动作时不改相机缩放。
    const camera = new THREE.PerspectiveCamera(36, width / height, 0.01, 100)
    camera.position.set(0, 0.90, 4.2)
    camera.lookAt(0, 0.86, 0)
    const model = new THREE.Group()
    scene.add(model)
    const shadow = new THREE.Mesh(
      track(new THREE.CircleGeometry(0.34, 40)),
      track(new THREE.MeshBasicMaterial({
        color: 0x000000, transparent: true, opacity: 0.24, depthWrite: false
      }))
    )
    shadow.rotation.x = -Math.PI / 2
    shadow.position.set(0, 0.008, -0.04)
    scene.add(shadow)

    const startedAt = performance.now()
    let actionStartedAt = startedAt
    let previousKey = playback.current.anim + ':' + playback.current.animationId
    let previousPose: PetPose = { ...PET_REST_POSE }
    let transitionPose: PetPose = { ...PET_REST_POSE }
    let renderedPose: PetPose | undefined
    let renderedRig: PetRig | null | undefined
    let renderedAngle: number | undefined
    let renderCount = 0
    let applyCount = 0
    el.dataset.renderCount = '0'
    el.dataset.rigApplyCount = '0'
    const poseKeys = Object.keys(PET_REST_POSE) as Array<keyof PetPose>
    const syncAction = (now: number) => {
      const current = playback.current
      const key = current.anim + ':' + current.animationId
      if (key !== previousKey) {
        previousKey = key
        actionStartedAt = now
        transitionPose = { ...previousPose }
      }
    }
    const renderMode = (now: number): PetRenderMode => {
      const current = playback.current
      let mode: PetRenderMode
      if (disposed || !rig || current.paused || document.visibilityState === 'hidden') mode = 'paused'
      else if (current.previewTime != null) mode = 'still'
      else {
        const elapsed = now - actionStartedAt
        // 连打/动作回到待机的 120ms 混合也保持完整帧率。
        const active = elapsed < 120 || (current.anim && elapsed < PET_ANIMATION_MS[current.anim])
        mode = active ? 'animation' : current.anim ? 'still' : 'idle'
      }
      el.dataset.renderMode = mode
      return mode
    }
    const scheduler = createPetRenderScheduler({
      platform: {
        now: () => performance.now(),
        requestFrame: (callback) => requestAnimationFrame(callback),
        cancelFrame: (id) => cancelAnimationFrame(id),
        setTimer: (callback, delay) => window.setTimeout(callback, delay),
        clearTimer: (id) => window.clearTimeout(id)
      },
      mode: renderMode,
      render: (now) => {
        syncAction(now)
        const current = playback.current
        const elapsed = (now - actionStartedAt) / 1000
        const pose = samplePetMotion(current.anim, current.previewTime ?? elapsed,
          current.previewTime ?? (now - startedAt) / 1000)
        // 连续点击/打断动作时短暂混合，避免从半空或作揖姿态瞬间跳回初始姿势。
        if (current.previewTime == null && elapsed < 0.12) {
          const k = Math.min(1, elapsed / 0.12)
          const blend = k * k * (3 - 2 * k)
          for (const name of poseKeys) pose[name] = transitionPose[name] + (pose[name] - transitionPose[name]) * blend
        }
        previousPose = pose
        // 暂停预览/动作末帧不反复变形同一批顶点，可见待机保持低帧率呼吸。
        if (rig !== renderedRig || current.rotationY !== renderedAngle ||
            poseKeys.some((name) => pose[name] !== renderedPose?.[name])) {
          model.rotation.y = current.rotationY
          rig?.apply(pose)
          el.dataset.rigApplyCount = String(++applyCount)
          if (material) material.uniforms.mouthOpen.value = pose.mouthOpen
          const scale = Math.max(0.65, 1 - pose.rootLift * 1.4)
          shadow.scale.setScalar(scale)
          shadow.material.opacity = 0.24 - pose.rootLift * 0.35
          renderer.render(scene, camera)
          el.dataset.renderCount = String(++renderCount)
          renderedPose = pose
          renderedRig = rig
          renderedAngle = current.rotationY
        }
      }
    })
    const update = () => {
      // 隐藏期间也记录动作触发时刻，恢复时不会把已经结束的动作重新播放。
      syncAction(performance.now())
      scheduler.invalidate()
    }
    updatePlayback.current = update
    document.addEventListener('visibilitychange', update)
    update()

    void (async () => {
      const data = await loadAssets()
      if (disposed) return
      if (!data) throw new Error('随宠模型未生成，请先从本机游戏生成素材。')
      const loader = new THREE.TextureLoader()
      const loadTexture = async (base64?: string) => base64
        ? track(await loader.loadAsync('data:image/png;base64,' + base64))
        : undefined
      const [tex, cool, warm] = await Promise.all([
        loadTexture(data.tex), loadTexture(data.cool), loadTexture(data.warm)
      ])
      if (disposed || !tex) return
      const object = new OBJLoader().parse(data.obj)
      object.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return
        track(child.geometry)
        for (const original of Array.isArray(child.material) ? child.material : [child.material]) original.dispose()
      })
      rig = createPetRig(object)
      // 绑定层会复制几何，原网格与实际渲染副本都要释放。
      object.traverse((child) => { if (child instanceof THREE.Mesh) track(child.geometry) })
      material = track(createHsrToon(tex, cool, warm))
      object.traverse((child) => { if (child instanceof THREE.Mesh) child.material = material! })
      model.add(object)
      // 加载完成后再起动作时钟，慢机器不会错过整段动作。
      actionStartedAt = performance.now()
      rig.apply({ ...PET_REST_POSE })
      el.dataset.rigApplyCount = String(++applyCount)
      setReady(true)
      update()
      readyCallback.current?.(rig.diagnostics)
      console.log('[official] ready, local rig', rig.diagnostics)
    })().catch((cause: unknown) => {
      if (disposed) return
      const message = cause instanceof Error ? cause.message : String(cause)
      console.error('[official] load failed', message)
      setError(message)
    })

    return () => {
      disposed = true
      scheduler.stop()
      document.removeEventListener('visibilitychange', update)
      if (updatePlayback.current === update) updatePlayback.current = undefined
      resources.forEach((resource) => resource.dispose())
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [width, height, loadAssets])

  useEffect(() => {
    updatePlayback.current?.()
  }, [anim, animationId, previewTime, rotationY, paused])

  return <div ref={holder} className="pet3d-holder" data-ready={ready} style={{ width, height }}>
    {error && <div role="alert" className="ph-text">{error}</div>}
  </div>
}
