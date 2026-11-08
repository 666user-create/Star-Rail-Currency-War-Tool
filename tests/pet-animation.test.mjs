import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { PET_ANIMATION_MS, PET_REST_POSE, samplePetMotion } from '../src/renderer/src/pet/petMotion.ts'
import { createPetRig } from '../src/renderer/src/pet/petRig.ts'

const EPSILON = 0.000002
const ANIMATIONS = Object.keys(PET_ANIMATION_MS)
const UNIT_FIELDS = ['standUp', 'forelegLift', 'forelegFold', 'forelegTogether', 'hindlegFold', 'mouthOpen']

function approximately(actual, expected, message, tolerance = EPSILON) {
  assert(Math.abs(actual - expected) <= tolerance, `${message}: expected ${expected}, got ${actual}`)
}

function approximatelyArray(actual, expected, message, tolerance = EPSILON) {
  assert.equal(actual.length, expected.length, `${message}: same length`)
  for (let i = 0; i < actual.length; i++) approximately(actual[i], expected[i], `${message}[${i}]`, tolerance)
}

function samples(animation, step = 0.01) {
  const duration = PET_ANIMATION_MS[animation] / 1000
  return Array.from({ length: Math.ceil(duration / step) + 1 }, (_, i) =>
    samplePetMotion(animation, Math.min(duration, i * step)))
}

test('动作首尾和无效时间都恢复中性姿态，不改变共享基准', () => {
  const original = { ...PET_REST_POSE }
  for (const animation of ANIMATIONS) {
    const end = PET_ANIMATION_MS[animation] / 1000
    for (const time of [-1, 0, end, end + 1, NaN, Infinity]) {
      assert.deepEqual(samplePetMotion(animation, time), original, `${animation} at ${time}`)
    }
    for (const time of [0.00001, end - 0.00001]) {
      const pose = samplePetMotion(animation, time)
      for (const key of Object.keys(original)) approximately(pose[key], original[key], `${animation} smoothly returns ${key}`)
    }
  }
  const returned = samplePetMotion('bounce', 0)
  returned.bodyStretch = 5
  assert.deepEqual(PET_REST_POSE, original)
  assert.deepEqual(samplePetMotion('howl', 0), original)
})

test('动作曲线连续、有界，不出现瞬移或非数值姿态', () => {
  for (const animation of ANIMATIONS) {
    const poses = samples(animation, 0.001)
    let previous = poses[0]
    for (const pose of poses) {
      for (const [key, value] of Object.entries(pose)) {
        assert(Number.isFinite(value), `${animation}.${key} is finite`)
        assert(Math.abs(value - previous[key]) < 0.04, `${animation}.${key} has no frame jump`)
      }
      for (const key of UNIT_FIELDS) assert(pose[key] >= 0 && pose[key] <= 1, `${animation}.${key} remains a weight`)
      assert(pose.rootLift >= 0 && pose.rootLift <= 0.35, '跳高保持在桌宠画面可容纳范围')
      assert(pose.bodyStretch >= 0.9 && pose.bodyStretch <= 1.06, '挤压与拉伸保持克制')
      assert(Math.abs(pose.bodyPitch) <= 0.3 && Math.abs(pose.headPitch) <= 0.8, '倾斜角度有界')
      assert(Math.abs(pose.forelegBob) < 0.1, '前爪移动有界')
      previous = pose
    }
  }
})

test('高兴跳恰好有两次腾空，并在结束前恢复落地', () => {
  const poses = samples('bounce', 0.005)
  let flights = 0
  let airborne = false
  for (const pose of poses) {
    const active = pose.rootLift > 0.003
    if (active && !airborne) flights++
    airborne = active
  }
  assert.equal(flights, 2)
  assert(poses.some(pose => pose.rootLift > 0.25 && pose.forelegLift > 0.5 && pose.hindlegFold > 0.3), '腾空伴随前后肢收放')
  assert.deepEqual(samplePetMotion('bounce', PET_ANIMATION_MS.bounce / 1000 - 0.05), PET_REST_POSE)
})

test('高兴跳空中连续上升下落，落地压低后直接接第二跳', () => {
  const poses = samples('bounce', 0.001)
  const flights = []
  let current = []
  for (const pose of poses) {
    if (pose.rootLift > 0) current.push(pose)
    else if (current.length) { flights.push(current); current = [] }
  }
  assert.equal(flights.length, 2)
  for (const flight of flights) {
    const peak = flight.findIndex(pose => pose.rootLift === Math.max(...flight.map(value => value.rootLift)))
    assert(peak > 20 && peak < flight.length - 20, '峰值在腾空中段')
    for (let i = 1; i < flight.length; i++) {
      if (i <= peak) assert(flight[i].rootLift > flight[i - 1].rootLift, '峰值前持续上升，不逐点停车')
      else assert(flight[i].rootLift < flight[i - 1].rootLift, '峰值后持续下落，不逐点停车')
    }
    assert(flight.at(-20).forelegFold < flight[peak].forelegFold * 0.4, '落地前已伸开前爪迎地')
    assert(flight.at(-20).hindlegFold < flight[peak].hindlegFold * 0.4, '落地前已放下后脚')
  }
  const firstEnd = poses.findIndex((pose, i) => i > 0 && poses[i - 1].rootLift > 0 && pose.rootLift === 0)
  const secondStart = poses.findIndex((pose, i) => i > firstEnd && pose.rootLift > 0)
  assert((secondStart - firstEnd) * 0.001 < 0.16, '两跳之间只有短促落地蓄力')
  assert(poses.slice(firstEnd, secondStart).every(pose => pose.bodyStretch !== 1 || pose.forelegFold > 0), '间隙不恢复静止站姿')
  assert(poses.slice(firstEnd, secondStart).some(pose => pose.bodyStretch < 0.98), '第一次落地有压低缓冲')
  assert(poses.every(pose => pose.bodyStretch >= 0.96 && pose.bodyStretch <= 1.04), '大头保持体积感，不明显压扁拉长')
  assert(poses.some(pose => pose.rootLift > 0.25 && pose.standUp > 0.2), '空中展开腹部，保留上举跳起的姿势')
  assert(poses.every(pose => pose.forelegTogether === 0 && pose.standUp <= 0.25), '跳跃不变成完整直立合爪拜年')
  assert(poses.filter(pose => pose.rootLift === 0).every(pose => pose.standUp === 0), '只在空中展开躯干，落地恢复四足支撑')
})

test('嗷呜先低头蓄势再抬头张嘴，始终有脚底支撑', () => {
  const poses = samples('howl')
  const preparation = poses.findIndex(pose => pose.headPitch > 0.1 && pose.bodyPitch > 0.05)
  const call = poses.findIndex((pose, i) => i > preparation && pose.headPitch < -0.2 && pose.mouthOpen > 0.8)
  assert(preparation >= 0, '存在低头蓄势')
  assert(call > preparation, '蓄势后抬头发声')
  assert(poses.every(pose => pose.rootLift === 0), '吼叫不变成跳跃')
  assert(poses.at(-1).mouthOpen === 0, '发声后合嘴')
})

test('拜年直立后双爪收在胸前并反复作揖，随后回到四足站姿', () => {
  const poses = samples('cheer')
  const upright = poses.filter(pose => pose.standUp > 0.99)
  assert(upright.length > 40, '直立保持足够时间')
  assert(upright.every(pose => pose.forelegLift > 0.9 && pose.forelegFold > 0.9 && pose.forelegTogether > 0.9), '直立时双爪收拢')
  assert(Math.max(...upright.map(pose => pose.forelegBob)) - Math.min(...upright.map(pose => pose.forelegBob)) > 0.025, '双爪有可见的上下移动')
  let bows = 0
  let bowing = false
  for (const pose of upright) {
    const active = pose.forelegBob < -0.005
    if (active && !bowing) bows++
    bowing = active
  }
  assert(bows >= 2, '作揖重复发生')
  assert(poses.every(pose => pose.rootLift === 0), '后足支撑不变成整身腾空')
  assert.deepEqual(poses.at(-1), PET_REST_POSE)
})

test('待机不离地，动作采样可重播且不依赖之前采样', () => {
  for (let time = 0; time < 120; time += 0.1) {
    const pose = samplePetMotion('', time)
    assert.equal(pose.rootLift, 0)
    assert(Math.abs(pose.bodyStretch - 1) < 0.005)
  }
  const first = samplePetMotion('bounce', 0.3)
  samplePetMotion('cheer', 1.5)
  samplePetMotion('howl', 2)
  assert.deepEqual(samplePetMotion('bounce', 0.3), first)
})

/**
 * 用基础几何构造四足夹具；不读取、复制或内嵌任何游戏素材。
 * 该局部绑定适配当前提取模型的坐标范围，因此夹具使用同一数量级的米制坐标。
 */
function createFixture(t, withBell = false) {
  const object = new THREE.Group()
  const pieces = []
  const sections = {}
  let offset = 0
  const box = (name, size, center) => {
    const geometry = new THREE.BoxGeometry(...size).translate(...center)
    sections[name] = Array.from({ length: geometry.getAttribute('position').count }, (_, i) => offset + i)
    offset += geometry.getAttribute('position').count
    pieces.push(geometry)
  }
  box('torso', [0.18, 0.17, 0.3], [0, -0.065, -0.005])
  box('frontLeft', [0.055, 0.13, 0.06], [-0.065, -0.175, 0.12])
  box('frontRight', [0.055, 0.13, 0.06], [0.065, -0.175, 0.12])
  box('rearLeft', [0.055, 0.13, 0.06], [-0.065, -0.175, -0.12])
  box('rearRight', [0.055, 0.13, 0.06], [0.065, -0.175, -0.12])
  // 独立附件岛，位于胸前；总高度仍由头部/脚底决定，不包含游戏几何。
  if (withBell) box('bell', [0.08, 0.08, 0.06], [0, -0.025, 0.25])
  const bodyGeometry = mergeGeometries(pieces)
  const rawPosition = bodyGeometry.getAttribute('position')
  const feet = Object.fromEntries(['frontLeft', 'frontRight', 'rearLeft', 'rearRight'].map(name =>
    [name, sections[name].filter(i => rawPosition.getY(i) < -0.239)]))
  for (const geometry of pieces) geometry.dispose()
  const material = new THREE.MeshBasicMaterial()
  const body = new THREE.Mesh(bodyGeometry, material)
  body.name = 'Body'
  const faceGeometry = new THREE.SphereGeometry(0.12, 12, 8).translate(0, 0.13, 0.12)
  const face = new THREE.Mesh(faceGeometry, material)
  face.name = 'Face'
  object.add(body, face)
  const rig = createPetRig(object)
  // Rig 会克隆网格，释放创建夹具时的原始几何。
  bodyGeometry.dispose()
  faceGeometry.dispose()
  t.after(() => {
    object.traverse(child => { if (child instanceof THREE.Mesh) child.geometry.dispose() })
    material.dispose()
  })
  rig.apply({ ...PET_REST_POSE })
  return { object, body, face, rig, feet, bell: sections.bell ?? [] }
}

function positions(mesh) {
  return Array.from(mesh.geometry.getAttribute('position').array)
}

function footHeight(mesh, indices) {
  const position = mesh.geometry.getAttribute('position')
  return Math.min(...indices.map(i => position.getY(i)))
}

function centroid(mesh, indices) {
  const position = mesh.geometry.getAttribute('position')
  const center = new THREE.Vector3()
  for (const i of indices) center.add(new THREE.Vector3().fromBufferAttribute(position, i))
  return center.divideScalar(indices.length)
}

test('几何绑定可独立于官方素材创建，四脚在中性姿态接地', t => {
  const { body, face, rig, feet } = createFixture(t)
  assert.equal(rig.diagnostics.meshCount, 2)
  assert(rig.diagnostics.vertexCount > 100)
  approximately(rig.bounds.min.y, 0, '地面基线')
  approximately(rig.bounds.max.y - rig.bounds.min.y, 1.55, '统一模型高度')
  for (const [name, ids] of Object.entries(feet)) {
    assert(ids.length > 0)
    approximately(footHeight(body, ids), 0, `${name} touches ground`)
  }
  assert(positions(face).every(Number.isFinite))
})

test('多次播放和回到中性姿态不累计顶点或法线漂移', t => {
  const { body, face, rig } = createFixture(t)
  const baseline = [positions(body), positions(face)]
  const normalBaseline = [Array.from(body.geometry.getAttribute('normal').array), Array.from(face.geometry.getAttribute('normal').array)]
  const deformations = [samplePetMotion('bounce', 0.3), samplePetMotion('howl', 1.08), samplePetMotion('cheer', 1.23)]
  for (let repeat = 0; repeat < 30; repeat++) {
    for (const pose of deformations) rig.apply(pose)
    rig.apply({ ...PET_REST_POSE })
    approximatelyArray(positions(body), baseline[0], '恢复身体')
    approximatelyArray(positions(face), baseline[1], '恢复头部')
    approximatelyArray(Array.from(body.geometry.getAttribute('normal').array), normalBaseline[0], '恢复身体法线')
    approximatelyArray(Array.from(face.geometry.getAttribute('normal').array), normalBaseline[1], '恢复头部法线')
  }
  rig.apply(deformations[2])
  const once = [positions(body), positions(face)]
  for (let repeat = 0; repeat < 30; repeat++) rig.apply(deformations[2])
  approximatelyArray(positions(body), once[0], '相同姿态重复应用不继续拉伸')
  approximatelyArray(positions(face), once[1], '相同姿态重复应用不继续转头')
})

test('变形后的顶点与法线保持有效，实际几何的最低点跟随离地高度', t => {
  const { body, face, rig } = createFixture(t)
  for (const animation of ANIMATIONS) {
    for (const pose of samples(animation, 0.08)) {
      rig.apply(pose)
      let lowest = Infinity
      for (const mesh of [body, face]) {
        const position = mesh.geometry.getAttribute('position')
        const normal = mesh.geometry.getAttribute('normal')
        for (let i = 0; i < position.count; i++) {
          assert(Number.isFinite(position.getX(i)) && Number.isFinite(position.getY(i)) && Number.isFinite(position.getZ(i)))
          lowest = Math.min(lowest, position.getY(i))
          approximately(Math.hypot(normal.getX(i), normal.getY(i), normal.getZ(i)), 1, '法线保持单位长度')
        }
      }
      approximately(lowest, pose.rootLift, `${animation} actual floor`)
      approximately(rig.bounds.min.y, lowest, `${animation} reported floor agrees with vertices`)
    }
  }
})

test('纯离地运动使四脚同步腾空，恢复后重新落地', t => {
  const { body, rig, feet } = createFixture(t)
  rig.apply({ ...PET_REST_POSE, rootLift: 0.12 })
  for (const [name, ids] of Object.entries(feet)) approximately(footHeight(body, ids), 0.12, `${name} airborne`)
  rig.apply({ ...PET_REST_POSE })
  for (const [name, ids] of Object.entries(feet)) approximately(footHeight(body, ids), 0, `${name} lands`)
})

test('头部和前爪可以分别驱动，不靠整身移动冒充局部动作', t => {
  const { body, face, rig, feet } = createFixture(t)
  const bodyRest = positions(body)
  const headRest = positions(face)
  const leftRest = centroid(body, feet.frontLeft)
  const rearRest = centroid(body, feet.rearLeft)
  rig.apply({ ...PET_REST_POSE, headPitch: 0.25 })
  approximatelyArray(positions(body), bodyRest, '单独低头不改变身体')
  assert(positions(face).some((value, i) => Math.abs(value - headRest[i]) > 0.02), '头部几何确实改变')

  rig.apply({ ...PET_REST_POSE, forelegLift: 1, forelegFold: 0.8, forelegTogether: 0.7 })
  approximatelyArray(positions(face), headRest, '单独抬前爪不改变头部')
  assert(centroid(body, feet.frontLeft).distanceTo(leftRest) > 0.05, '前爪确实移动')
  assert(centroid(body, feet.rearLeft).distanceTo(rearRest) < EPSILON, '后脚没有跟着前爪移动')
})

test('拜年姿态由后脚支撑，前爪离地', t => {
  const { body, rig, feet } = createFixture(t)
  rig.apply(samplePetMotion('cheer', 1.23))
  approximately(footHeight(body, feet.rearLeft), 0, '左后脚支撑')
  approximately(footHeight(body, feet.rearRight), 0, '右后脚支撑')
  assert(footHeight(body, feet.frontLeft) > 0.1 && footHeight(body, feet.frontRight) > 0.1, '双前爪抬离地面')
})

test('拜年作揖时双掌露在铃铛前下方，往复时后脚仍然接地', t => {
  const { body, rig, feet, bell } = createFixture(t, true)
  assert(rig.diagnostics.parts.bell > 0, '夹具的独立盒子确实识别为铃铛')
  const relativeHeights = []
  for (const time of [0.78, 1.00, 1.23, 1.46, 1.69, 1.92]) {
    rig.apply(samplePetMotion('cheer', time))
    const position = body.geometry.getAttribute('position')
    const bellFront = Math.max(...bell.map(i => position.getZ(i)))
    const bellCenter = centroid(body, bell)
    const palms = [centroid(body, feet.frontLeft), centroid(body, feet.frontRight)]
    for (const palm of palms) {
      assert(palm.z > bellFront, `作揖 ${time}s 掌面不会缩在铃铛后面`)
      assert(palm.y < bellCenter.y, `作揖 ${time}s 双掌仍在胸前铃铛下方`)
    }
    approximately(footHeight(body, feet.rearLeft), 0, `作揖 ${time}s 左后脚接地`)
    approximately(footHeight(body, feet.rearRight), 0, `作揖 ${time}s 右后脚接地`)
    relativeHeights.push((palms[0].y + palms[1].y) / 2 - bellCenter.y)
  }
  for (let i = 0; i < relativeHeights.length; i += 2) {
    assert(relativeHeights[i] > relativeHeights[i + 1] + 0.015, '合掌相对铃铛有可见的上下作揖，而非静止贴住附件')
  }
})

test('未站起时的空中收爪不会被拜年补偿向前推出', t => {
  const { body, rig, feet, bell } = createFixture(t, true)
  const airborne = { ...PET_REST_POSE, rootLift: 0.24, forelegLift: 0.8, forelegFold: 0.7 }
  rig.apply(airborne)
  const before = [centroid(body, feet.frontLeft), centroid(body, feet.frontRight)]
  const bellBefore = centroid(body, bell)
  rig.apply({ ...airborne, forelegTogether: 1 })
  const after = [centroid(body, feet.frontLeft), centroid(body, feet.frontRight)]
  for (let i = 0; i < before.length; i++) {
    approximately(after[i].z, before[i].z, '单独向中线收爪只改变左右轮廓，不触发拜年的前推')
  }
  approximately(centroid(body, bell).z, bellBefore.z, '空中收爪不移动铃铛')
})

test('缺少有效网格时明确失败，不创建带无穷边界的绑定', () => {
  assert.throws(() => createPetRig(new THREE.Group()), /没有可绑定的网格/)
})
