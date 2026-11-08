/** 三个经典动作的姿态曲线。只描述动作意图，不依赖模型、Three.js 或 DOM。 */
export type PetAnimation = '' | 'bounce' | 'howl' | 'cheer'

export const PET_ANIMATION_MS = {
  bounce: 1700,
  howl: 2400,
  cheer: 3000
} as const

export interface PetPose {
  /** 模型归一化到高 1.55 后的离地高度；下蹲由局部变形完成，不把脚压进地面。 */
  rootLift: number
  /** 躯干纵向伸缩，1 是原始姿态；由绑定层围绕脚底处理。 */
  bodyStretch: number
  /** 弧度，+Z 是朝前方向，正值前倾，负值后仰。 */
  bodyPitch: number
  bodyRoll: number
  /** 弧度，正值低头，负值抬头。 */
  headPitch: number
  /** 0..1，四足站姿过渡到后足支撑的拜年站姿，具体关节姿态由绑定层实现。 */
  standUp: number
  /** 0..1，前肢上臂抬起程度。 */
  forelegLift: number
  /** 0..1，前肢向胸前弯曲程度。 */
  forelegFold: number
  /** 0..1，左右前爪向胸口中线收拢程度。 */
  forelegTogether: number
  /** 作揖时前爪的上下偏移，单位同 rootLift。 */
  forelegBob: number
  /** 0..1，腾空时后肢收起程度。 */
  hindlegFold: number
  /** 0..1，只要求简单张合口型，不依赖完整表情系统。 */
  mouthOpen: number
}

export const PET_REST_POSE: Readonly<PetPose> = Object.freeze({
  rootLift: 0,
  bodyStretch: 1,
  bodyPitch: 0,
  bodyRoll: 0,
  headPitch: 0,
  standUp: 0,
  forelegLift: 0,
  forelegFold: 0,
  forelegTogether: 0,
  forelegBob: 0,
  hindlegFold: 0,
  mouthOpen: 0
})

interface PoseFrame {
  time: number
  pose: PetPose
}

const POSE_KEYS = Object.keys(PET_REST_POSE) as Array<keyof PetPose>
const frame = (time: number, pose: Partial<PetPose> = {}): PoseFrame => ({
  time,
  pose: { ...PET_REST_POSE, ...pose }
})

// 两次连跳：蹬地时先伸腿，腾起后收爪，下落再放腿迎地。
// 中间的落地压低直接接第二次蹬地，不回到静止站姿；大头只做轻微伸缩。
const BOUNCE: PoseFrame[] = [
  frame(0),
  frame(0.13, {
    bodyStretch: 0.965, bodyPitch: 0.055, headPitch: 0.12,
    forelegFold: 0.45, hindlegFold: 0.50, bodyRoll: -0.012
  }),
  frame(0.18, {
    bodyStretch: 1.04, bodyPitch: -0.035, headPitch: -0.035,
    forelegLift: 0.12, forelegFold: 0.06, hindlegFold: 0.04
  }),
  frame(0.20, {
    bodyStretch: 1.04, bodyPitch: -0.035, headPitch: -0.035, standUp: 0.04,
    forelegLift: 0.12, forelegFold: 0.06, hindlegFold: 0.04
  }),
  frame(0.39, {
    bodyStretch: 1.012, bodyPitch: -0.035, headPitch: -0.085, standUp: 0.22,
    forelegLift: 0.78, forelegFold: 0.82, hindlegFold: 0.70, bodyRoll: -0.020
  }),
  frame(0.49, {
    bodyStretch: 1.005, bodyPitch: -0.035, headPitch: -0.045, standUp: 0.15,
    forelegLift: 0.76, forelegFold: 0.74, hindlegFold: 0.64, bodyRoll: -0.016
  }),
  frame(0.63, {
    bodyStretch: 1.025, bodyPitch: 0.01, headPitch: 0.025,
    forelegLift: 0.12, forelegFold: 0.10, hindlegFold: 0.08
  }),
  frame(0.72, {
    bodyStretch: 0.96, bodyPitch: 0.06, headPitch: 0.15,
    forelegFold: 0.50, hindlegFold: 0.55, bodyRoll: 0.012
  }),
  frame(0.80, {
    bodyStretch: 1.04, bodyPitch: -0.035, headPitch: -0.04,
    forelegLift: 0.14, forelegFold: 0.06, hindlegFold: 0.04
  }),
  frame(0.82, {
    bodyStretch: 1.04, bodyPitch: -0.035, headPitch: -0.04, standUp: 0.04,
    forelegLift: 0.14, forelegFold: 0.06, hindlegFold: 0.04
  }),
  frame(1.03, {
    bodyStretch: 1.012, bodyPitch: -0.04, headPitch: -0.09, standUp: 0.24,
    forelegLift: 0.82, forelegFold: 0.86, hindlegFold: 0.76, bodyRoll: 0.020
  }),
  frame(1.14, {
    bodyStretch: 1.005, bodyPitch: -0.035, headPitch: -0.045, standUp: 0.16,
    forelegLift: 0.78, forelegFold: 0.75, hindlegFold: 0.65, bodyRoll: 0.016
  }),
  frame(1.29, {
    bodyStretch: 1.025, bodyPitch: 0.01, headPitch: 0.025,
    forelegLift: 0.12, forelegFold: 0.10, hindlegFold: 0.08
  }),
  frame(1.40, {
    bodyStretch: 0.96, bodyPitch: 0.045, headPitch: 0.12,
    forelegFold: 0.42, hindlegFold: 0.48, bodyRoll: -0.008
  }),
  frame(1.54, { bodyStretch: 1.008, headPitch: -0.015 }),
  frame(1.64),
  frame(PET_ANIMATION_MS.bounce / 1000)
]

// 离地高度单独走抛物线，避免关键姿态的 smoothstep 令上升/下落也逐点停顿。
// 少量 standUp 仅用于空中展开腹部，不合爪、不沿用完整拜年站姿。
const BOUNCE_FLIGHTS = [
  { start: 0.18, end: 0.68, height: 0.31 },
  { start: 0.80, end: 1.34, height: 0.34 }
] as const

function bounceHeight(time: number): number {
  if (!Number.isFinite(time)) return 0
  for (const flight of BOUNCE_FLIGHTS) {
    if (time <= flight.start || time >= flight.end) continue
    const phase = (time - flight.start) / (flight.end - flight.start)
    return 4 * flight.height * phase * (1 - phase)
  }
  return 0
}

// 嗷呜：先伏身低头，再挺胸抬头张嘴，随后合嘴收势；四脚始终着地。
const HOWL: PoseFrame[] = [
  frame(0),
  frame(0.28, { bodyStretch: 0.95, bodyPitch: 0.10, headPitch: 0.18, forelegFold: 0.08 }),
  frame(0.50, {
    bodyStretch: 0.94, bodyPitch: 0.15, headPitch: 0.23,
    forelegFold: 0.08, mouthOpen: 0.08
  }),
  frame(0.74, { bodyStretch: 1.015, bodyPitch: -0.035, headPitch: -0.34, mouthOpen: 0.75 }),
  frame(1.08, { bodyStretch: 1.03, bodyPitch: -0.065, headPitch: -0.50, mouthOpen: 1 }),
  frame(1.43, { bodyStretch: 1.025, bodyPitch: -0.05, headPitch: -0.45, mouthOpen: 0.9 }),
  frame(1.66, { bodyStretch: 1.01, bodyPitch: -0.035, headPitch: -0.29, mouthOpen: 0.55 }),
  frame(1.94, { bodyStretch: 1.002, bodyPitch: -0.01, headPitch: -0.045, mouthOpen: 0.12 }),
  frame(2.19),
  frame(PET_ANIMATION_MS.howl / 1000)
]

// 恭喜发财：前爪抬到胸前，后脚支撑站起，作揖三次后回到四足站姿。
// standUp 的脚底约束和爪子运动由绑定层完成，不能以整身拉长代替站立。
const CHEER: PoseFrame[] = [
  frame(0),
  frame(0.20, {
    bodyStretch: 0.96, bodyPitch: 0.06, headPitch: 0.05,
    forelegLift: 0.12, forelegFold: 0.25
  }),
  frame(0.54, {
    bodyStretch: 1.01, headPitch: -0.04, standUp: 0.65,
    forelegLift: 0.7, forelegFold: 0.8, forelegTogether: 0.75
  }),
  frame(0.78, {
    headPitch: -0.04, standUp: 1,
    forelegLift: 1, forelegFold: 1, forelegTogether: 1, forelegBob: 0.018
  }),
  frame(1.00, {
    bodyPitch: 0.045, headPitch: 0.025, standUp: 1,
    forelegLift: 1, forelegFold: 1, forelegTogether: 1, forelegBob: -0.018
  }),
  frame(1.23, {
    bodyPitch: -0.012, headPitch: -0.045, standUp: 1,
    forelegLift: 1, forelegFold: 1, forelegTogether: 1, forelegBob: 0.018
  }),
  frame(1.46, {
    bodyPitch: 0.04, headPitch: 0.02, standUp: 1,
    forelegLift: 1, forelegFold: 1, forelegTogether: 1, forelegBob: -0.018
  }),
  frame(1.69, {
    bodyPitch: -0.01, headPitch: -0.04, standUp: 1,
    forelegLift: 1, forelegFold: 1, forelegTogether: 1, forelegBob: 0.016
  }),
  frame(1.92, {
    bodyPitch: 0.035, headPitch: 0.02, standUp: 1,
    forelegLift: 1, forelegFold: 1, forelegTogether: 1, forelegBob: -0.016
  }),
  frame(2.17, {
    headPitch: -0.025, standUp: 1,
    forelegLift: 1, forelegFold: 1, forelegTogether: 1, forelegBob: 0.012
  }),
  frame(2.50, {
    standUp: 0.55, forelegLift: 0.7, forelegFold: 0.5, forelegTogether: 0.7
  }),
  frame(2.78, {
    bodyStretch: 0.96, forelegLift: 0.1, forelegFold: 0.15, forelegTogether: 0.1
  }),
  frame(PET_ANIMATION_MS.cheer / 1000)
]

const CLIPS = { bounce: BOUNCE, howl: HOWL, cheer: CHEER }

function interpolate(frames: PoseFrame[], time: number): PetPose {
  const last = frames[frames.length - 1]
  if (!Number.isFinite(time) || time <= 0 || time >= last.time) return { ...PET_REST_POSE }

  for (let i = 1; i < frames.length; i++) {
    const right = frames[i]
    if (time > right.time) continue
    const left = frames[i - 1]
    const k = (time - left.time) / (right.time - left.time)
    // 每个关键姿态平滑进入和离开，动作首尾也没有突然翻转或跳帧。
    const eased = k * k * (3 - 2 * k)
    const pose = { ...PET_REST_POSE }
    for (const key of POSE_KEYS) {
      pose[key] = left.pose[key] + (right.pose[key] - left.pose[key]) * eased
    }
    return pose
  }
  return { ...PET_REST_POSE }
}

/** elapsedSec 是本次动作的相位；idleTimeSec 是独立待机时钟，不参与动作重播。 */
export function samplePetMotion(
  anim: PetAnimation,
  elapsedSec: number,
  idleTimeSec = elapsedSec
): PetPose {
  if (anim) {
    const pose = interpolate(CLIPS[anim], elapsedSec)
    if (anim === 'bounce') pose.rootLift = bounceHeight(elapsedSec)
    return pose
  }
  const t = Number.isFinite(idleTimeSec) ? Math.max(0, idleTimeSec) : 0
  return {
    ...PET_REST_POSE,
    bodyStretch: 1 + Math.sin(t * 1.3) * 0.004,
    bodyRoll: Math.sin(t * 0.45) * 0.012,
    headPitch: Math.sin(t * 0.7) * 0.008
  }
}
