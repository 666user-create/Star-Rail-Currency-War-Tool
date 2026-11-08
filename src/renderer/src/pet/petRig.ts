import * as THREE from 'three'
import type { PetPose } from './petMotion'

type RigPart = 'body' | 'head' | 'collar' | 'bell' | 'tail' | 'wing' | 'claw'
const PART: Record<RigPart, number> = { body: 0, head: 1, collar: 2, bell: 3, tail: 4, wing: 5, claw: 6 }

export interface PetRigDiagnostics {
  sourceHeight: number
  scale: number
  centerX: number
  sourceGroundY: number
  meshCount: number
  vertexCount: number
  parts: Record<RigPart, number>
  components: Array<{ mesh: string; part: RigPart; vertices: number; min: number[]; max: number[] }>
  groundCorrection: number
}

export interface PetRig {
  /** 当前姿态在模型本地坐标里的包围盒。每次 apply 都更新同一个对象。 */
  readonly bounds: THREE.Box3
  readonly diagnostics: PetRigDiagnostics
  apply(pose: PetPose): void
}

interface RigMesh {
  geometry: THREE.BufferGeometry
  position: THREE.BufferAttribute
  normal: THREE.BufferAttribute
  rest: Float32Array
  restNormal: Float32Array
  part: Uint8Array
  fore: Float32Array
  hind: Float32Array
  wrist: Float32Array
  side: Int8Array
}

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v))
function smooth(a: number, b: number, v: number): number {
  const t = clamp01((v - a) / (b - a))
  return t * t * (3 - 2 * t)
}

/**
 * 仅从本机模型的几何关系生成局部绑定，不保存/内嵌任何模型顶点。
 * 当前适配 extract_pet 输出的四足说怪话 OBJ；并非任意模型的自动绑骨工具。
 */
export function createPetRig(object: THREE.Group): PetRig {
  const meshes: THREE.Mesh[] = []
  object.updateMatrixWorld(true)
  const inverseRoot = object.matrixWorld.clone().invert()
  const sourceBounds = new THREE.Box3()
  const point = new THREE.Vector3()
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh) || !child.geometry.getAttribute('position')) return
    // OBJ 的子网格原本是平级；烘入相对矩阵也兼容带静态层级的导入结果。
    child.geometry = child.geometry.clone()
    child.geometry.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverseRoot, child.matrixWorld))
    meshes.push(child)
    const positions = child.geometry.getAttribute('position')
    for (let i = 0; i < positions.count; i++) sourceBounds.expandByPoint(point.fromBufferAttribute(positions, i))
  })
  if (meshes.length === 0 || sourceBounds.isEmpty()) throw new Error('桌宠模型没有可绑定的网格')
  // 顶点已转换到 object 空间，静态子层级不能再次施加变换。
  object.traverse((child) => {
    if (child === object) return
    child.position.set(0, 0, 0)
    child.quaternion.identity()
    child.scale.set(1, 1, 1)
    child.updateMatrix()
  })

  const sourceHeight = sourceBounds.max.y - sourceBounds.min.y
  if (!(sourceHeight > 0)) throw new Error('桌宠模型高度无效')
  const scale = 1.55 / sourceHeight
  const centerX = (sourceBounds.min.x + sourceBounds.max.x) / 2
  const floor = sourceBounds.min.y
  const normalizedY = (raw: number): number => (raw - floor) * scale
  const diagnostics: PetRigDiagnostics = {
    sourceHeight, scale, centerX, sourceGroundY: floor, meshCount: meshes.length, vertexCount: 0,
    parts: { body: 0, head: 0, collar: 0, bell: 0, tail: 0, wing: 0, claw: 0 },
    components: [], groundCorrection: 0
  }
  const caches: RigMesh[] = []
  const bounds = new THREE.Box3()
  const boxMin = new THREE.Vector3()
  const boxMax = new THREE.Vector3()

  for (const mesh of meshes) {
    const geometry = mesh.geometry
    const source = geometry.getAttribute('position') as THREE.BufferAttribute
    if (!geometry.getAttribute('normal')) geometry.computeVertexNormals()
    const n = geometry.getAttribute('normal') as THREE.BufferAttribute
    const rest = new Float32Array(source.count * 3)
    const restNormal = new Float32Array(source.count * 3)
    const part = new Uint8Array(source.count)
    const fore = new Float32Array(source.count)
    const hind = new Float32Array(source.count)
    const wrist = new Float32Array(source.count)
    const side = new Int8Array(source.count)
    const head = /face|blush/i.test(mesh.name)

    // 三个命名网格内仍包含附件岛。按面邻接和相同坐标识别，不依赖导出顶点编号。
    const parents = new Int32Array(source.count)
    const welded = new Map<string, number>()
    const quantize = 1 / Math.max(sourceHeight * 0.00002, 0.000001)
    const root = (start: number): number => {
      let id = start
      while (parents[id] !== id) { parents[id] = parents[parents[id]]; id = parents[id] }
      return id
    }
    const join = (a: number, b: number): void => {
      a = root(a); b = root(b)
      if (a !== b) parents[b] = a
    }
    for (let i = 0; i < source.count; i++) {
      parents[i] = i
      const x = source.getX(i), y = source.getY(i), z = source.getZ(i)
      const key = `${Math.round(x * quantize)},${Math.round(y * quantize)},${Math.round(z * quantize)}`
      const previous = welded.get(key)
      if (previous === undefined) welded.set(key, i)
      else join(i, previous)
      const j = i * 3
      rest[j] = (x - centerX) * scale
      rest[j + 1] = (y - floor) * scale
      rest[j + 2] = z * scale // 保留脸朝 +Z；不按长尾巴把身体往前挪。
      restNormal[j] = n.getX(i); restNormal[j + 1] = n.getY(i); restNormal[j + 2] = n.getZ(i)
      side[i] = x >= centerX ? 1 : -1
      fore[i] = (1 - smooth(-0.18, -0.085, y)) * smooth(0.035, 0.085, z)
      hind[i] = (1 - smooth(-0.185, -0.085, y)) * (1 - smooth(-0.085, -0.025, z))
      wrist[i] = 1 - smooth(-0.195, -0.15, y)
    }
    const indices = geometry.index
    const faceCount = indices ? indices.count : source.count
    for (let i = 0; i + 2 < faceCount; i += 3) {
      const a = indices ? indices.getX(i) : i
      join(a, indices ? indices.getX(i + 1) : i + 1)
      join(a, indices ? indices.getX(i + 2) : i + 2)
    }
    const islands = new Map<number, { ids: number[]; min: number[]; max: number[] }>()
    for (let i = 0; i < source.count; i++) {
      const id = root(i)
      let island = islands.get(id)
      if (!island) {
        island = { ids: [], min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] }
        islands.set(id, island)
      }
      island.ids.push(i)
      for (let k = 0; k < 3; k++) {
        const value = source.getComponent(i, k)
        island.min[k] = Math.min(island.min[k], value)
        island.max[k] = Math.max(island.max[k], value)
      }
    }
    for (const island of islands.values()) {
      let semantic: RigPart = head ? 'head' : 'body'
      if (!head) {
        const [x0, y0, z0] = island.min
        const [x1, y1, z1] = island.max
        if (z0 < -0.30) semantic = 'tail'
        else if (y1 < -0.20 && x1 - x0 < 0.035) semantic = 'claw'
        else if (z0 > 0.19 && x1 - x0 < 0.13) semantic = 'bell'
        else if (y0 > -0.075 && x1 - x0 > 0.25 && z1 > 0.1) semantic = 'collar'
        else if (y0 > -0.015 && y1 > 0.10 && z1 < 0) semantic = 'wing'
      }
      for (const id of island.ids) part[id] = PART[semantic]
      diagnostics.parts[semantic] += island.ids.length
      diagnostics.components.push({ mesh: mesh.name, part: semantic, vertices: island.ids.length, min: island.min, max: island.max })
    }
    diagnostics.vertexCount += source.count
    const position = new THREE.BufferAttribute(rest.slice(), 3).setUsage(THREE.DynamicDrawUsage)
    const normal = new THREE.BufferAttribute(restNormal.slice(), 3).setUsage(THREE.DynamicDrawUsage)
    geometry.setAttribute('position', position)
    geometry.setAttribute('normal', normal)
    geometry.setAttribute('petRestPosition', new THREE.BufferAttribute(rest, 3))
    geometry.setAttribute('petHeadMask', new THREE.BufferAttribute(new Float32Array(source.count).fill(head ? 1 : 0), 1))
    mesh.frustumCulled = false
    geometry.computeBoundingBox()
    geometry.computeBoundingSphere()
    bounds.union(geometry.boundingBox!)
    caches.push({ geometry, position, normal, rest, restNormal, part, fore, hind, wrist, side })
  }

  // 以下支点来自当前模型的空间比例，不包含顶点索引或模型字节。
  const hipY = normalizedY(-0.11), hipZ = -0.12 * scale
  const neckY = normalizedY(0.012), neckZ = 0.13 * scale
  const shoulderY = normalizedY(-0.09), shoulderZ = 0.13 * scale, shoulderX = 0.08 * scale
  const elbowY = normalizedY(-0.17), elbowZ = 0.12 * scale
  const tailY = normalizedY(-0.05), tailZ = -0.15 * scale

  const apply = (pose: PetPose): void => {
    const stand = clamp01(pose.standUp)
    const clasp = stand * clamp01(pose.forelegTogether)
    const stretch = Math.max(0.5, pose.bodyStretch)
    const standAngle = -1.04 * stand
    const bodyAngle = standAngle + pose.bodyPitch
    const bc = Math.cos(bodyAngle), bs = Math.sin(bodyAngle)
    const hc = Math.cos(pose.headPitch - standAngle * 0.86), hs = Math.sin(pose.headPitch - standAngle * 0.86)
    const attachmentAngle = -standAngle * 0.86
    const ac = Math.cos(attachmentAngle), as = Math.sin(attachmentAngle)
    const foreAngle = -(pose.forelegLift * (0.95 - 0.75 * stand) + pose.forelegFold * 0.2)
    const fc = Math.cos(foreAngle), fs = Math.sin(foreAngle)
    const curlAngle = -0.48 * pose.forelegFold
    const cc = Math.cos(curlAngle), cs = Math.sin(curlAngle)
    const together = pose.forelegTogether * 0.57
    const tc = Math.cos(together), ts = Math.sin(together)
    const hindAngle = pose.hindlegFold * 0.9 + pose.bodyPitch * (1 - stand * 0.8)
    const kc = Math.cos(hindAngle), ks = Math.sin(hindAngle)
    const tailC = Math.cos(pose.bodyPitch), tailS = Math.sin(pose.bodyPitch)
    const rc = Math.cos(pose.bodyRoll), rs = Math.sin(pose.bodyRoll)
    const transformedTailY = hipY + (tailY - hipY) * stretch * bc - (tailZ - hipZ) * bs
    const transformedTailZ = hipZ + (tailY - hipY) * stretch * bs + (tailZ - hipZ) * bc
    let minX = Infinity, minY = Infinity, minZ = Infinity
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity

    for (const cache of caches) {
      const positions = cache.position.array as Float32Array
      const normals = cache.normal.array as Float32Array
      for (let i = 0; i < cache.part.length; i++) {
        const j = i * 3
        let x = cache.rest[j], y = cache.rest[j + 1], z = cache.rest[j + 2]
        let nx = cache.restNormal[j], ny = cache.restNormal[j + 1], nz = cache.restNormal[j + 2]
        const originalX = x, originalY = y, originalZ = z
        const originalNX = nx, originalNY = ny, originalNZ = nz
        const kind = cache.part[i]
        if (kind === PART.head) {
          const dy = y - neckY, dz = z - neckZ
          y = neckY + dy * hc - dz * hs; z = neckZ + dy * hs + dz * hc
          const normalY = ny
          ny = normalY * hc - nz * hs; nz = normalY * hs + nz * hc
        } else if (kind === PART.collar || kind === PART.bell) {
          // 站起时领毛和铃铛保持在胸前：跟随颈根位置，但抵消大部分躯干后转。
          // 不叠加 headPitch，避免吼叫抬头时把整圈领毛和铃铛一起掀起来。
          const dy = y - neckY, dz = z - neckZ
          y = neckY + dy * ac - dz * as; z = neckZ + dy * as + dz * ac
          const normalY = ny
          ny = normalY * ac - nz * as; nz = normalY * as + nz * ac
        } else if (kind === PART.body || kind === PART.claw) {
          const weight = cache.fore[i]
          if (weight > 0) {
            const side = cache.side[i]
            // 先屈腕，再抬上臂；肩根使用平滑权重，避免把胸腹切成两块。
            const wrist = cache.wrist[i]
            const dy = y - elbowY, dz = z - elbowZ
            let py = y + ((elbowY + dy * cc - dz * cs) - y) * wrist
            let pz = z + ((elbowZ + dy * cs + dz * cc) - z) * wrist
            let pny = ny + ((ny * cc - nz * cs) - ny) * wrist
            let pnz = nz + ((ny * cs + nz * cc) - nz) * wrist
            const sy = py - shoulderY, sz = pz - shoulderZ
            py = shoulderY + sy * fc - sz * fs; pz = shoulderZ + sy * fs + sz * fc
            const rotatedNY = pny
            pny = rotatedNY * fc - pnz * fs; pnz = rotatedNY * fs + pnz * fc
            const dx = x - shoulderX * side, dy2 = py - shoulderY
            const signedSin = -side * ts
            const px = shoulderX * side + dx * tc - dy2 * signedSin
            py = shoulderY + dx * signedSin + dy2 * tc
            const pnx = nx * tc - pny * signedSin
            pny = nx * signedSin + pny * tc
            x += (px - x) * weight; y += (py - y) * weight; z += (pz - z) * weight
            nx += (pnx - nx) * weight; ny += (pny - ny) * weight; nz += (pnz - nz) * weight
          }
        }

        if (kind === PART.tail) {
          const dy = y - tailY, dz = z - tailZ
          y = transformedTailY + dy * tailC - dz * tailS
          z = transformedTailZ + dy * tailS + dz * tailC
          const oldNY = ny
          ny = oldNY * tailC - nz * tailS; nz = oldNY * tailS + nz * tailC
        } else {
          const dy = (y - hipY) * stretch, dz = z - hipZ
          y = hipY + dy * bc - dz * bs; z = hipZ + dy * bs + dz * bc
          const scaledNY = ny / stretch
          ny = scaledNY * bc - nz * bs; nz = scaledNY * bs + nz * bc
          if (kind === PART.body || kind === PART.claw) {
            // 后肢绕髋单独屈曲，不跟着胸部站起；脚掌保持后足支撑位置。
            const weight = cache.hind[i]
            if (weight > 0) {
              const hy = originalY - hipY, hz = originalZ - hipZ
              const targetY = hipY + hy * kc - hz * ks
              const targetZ = hipZ + hy * ks + hz * kc
              x += (originalX - x) * weight
              y += (targetY - y) * weight; z += (targetZ - z) * weight
              nx += (originalNX - nx) * weight
              ny += (originalNY * kc - originalNZ * ks - ny) * weight
              nz += (originalNY * ks + originalNZ * kc - nz) * weight
            }
            // 直立时保持双爪高度，合掌作揖另向前下方伸腕，避开铃铛的遮挡。
            y += (pose.forelegBob - stand * 0.12) * cache.fore[i]
            const claspWrist = clasp * cache.fore[i] * cache.wrist[i]
            y -= claspWrist * 0.05
            z += claspWrist * 0.18
          }
        }
        // 四足模型的铃铛在直立后会缩入胸前，沿前方补偿即可；不抬高侵入下巴。
        // 普通站姿、跳跃和吼叫仍沿用原始佩戴位置。
        if (kind === PART.bell) z += stand * 0.19
        // 待机轻微侧倾同样绕地面处理，最后统一脚底校正。
        const rolledX = x * rc - y * rs
        y = x * rs + y * rc; x = rolledX
        const rolledNX = nx * rc - ny * rs
        ny = nx * rs + ny * rc; nx = rolledNX
        const normalLength = Math.hypot(nx, ny, nz) || 1
        positions[j] = x; positions[j + 1] = y; positions[j + 2] = z
        normals[j] = nx / normalLength; normals[j + 1] = ny / normalLength; normals[j + 2] = nz / normalLength
        minX = Math.min(minX, x); minY = Math.min(minY, y); minZ = Math.min(minZ, z)
        maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); maxZ = Math.max(maxZ, z)
      }
    }
    const correction = pose.rootLift - minY
    diagnostics.groundCorrection = correction
    for (const cache of caches) {
      const positions = cache.position.array as Float32Array
      for (let j = 1; j < positions.length; j += 3) positions[j] += correction
      cache.position.needsUpdate = true
      cache.normal.needsUpdate = true
      // 小网格的逐帧精确边界用于相机/裁剪诊断；frustumCulled 已关闭，不使用陈旧包围球。
      cache.geometry.computeBoundingBox()
    }
    boxMin.set(minX, pose.rootLift, minZ)
    boxMax.set(maxX, maxY + correction, maxZ)
    bounds.set(boxMin, boxMax)
  }

  return { bounds, diagnostics, apply }
}
