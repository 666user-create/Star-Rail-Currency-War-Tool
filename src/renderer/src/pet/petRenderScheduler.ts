/** 可见待机约 20 帧/秒、动作约 60 帧/秒；静态预览与隐藏状态不空转。 */
export type PetRenderMode = 'idle' | 'animation' | 'still' | 'paused'

interface FramePlatform {
  now(): number
  requestFrame(callback: () => void): number
  cancelFrame(id: number): void
  setTimer(callback: () => void, delay: number): number
  clearTimer(id: number): void
}

interface Options {
  platform: FramePlatform
  mode(now: number): PetRenderMode
  render(now: number): void
}

export function createPetRenderScheduler({ platform, mode, render }: Options) {
  // 提前少量时间向浏览器预约下一显示帧，避免 60Hz 屏幕上刚好错过截止帧。
  const frameLead = 4
  let frame: number | undefined
  let timer: number | undefined
  let nextFrameAt: number | undefined
  let scheduledMode: PetRenderMode | undefined
  let stopped = false

  const cancelPending = () => {
    if (frame !== undefined) platform.cancelFrame(frame)
    if (timer !== undefined) platform.clearTimer(timer)
    frame = undefined
    timer = undefined
  }

  const request = () => {
    frame = platform.requestFrame(tick)
  }

  function tick() {
    frame = undefined
    if (stopped) return
    const now = platform.now()
    if (mode(now) === 'paused') return
    render(now)
    // 动作时钟使用真实时间，低帧率不改变动作速度；结束后立即退出高帧率调度。
    const currentMode = mode(platform.now())
    if (currentMode === 'animation' || currentMode === 'idle') {
      const interval = 1000 / (currentMode === 'animation' ? 60 : 20)
      const afterRender = platform.now()
      if (nextFrameAt === undefined || scheduledMode !== currentMode) nextFrameAt = now + interval
      else nextFrameAt += interval
      scheduledMode = currentMode
      // 以截止时间维持节奏，rAF 等待和渲染耗时不会逐帧累加，卡顿后也不补画过期帧。
      if (nextFrameAt <= afterRender) {
        nextFrameAt += (Math.floor((afterRender - nextFrameAt) / interval) + 1) * interval
      }
      timer = platform.setTimer(() => {
        timer = undefined
        if (!stopped && mode(platform.now()) !== 'paused') request()
      }, Math.max(0, nextFrameAt - platform.now() - frameLead))
    } else {
      nextFrameAt = undefined
      scheduledMode = undefined
    }
  }

  return {
    /** 新动作、预览姿态、可见性或素材变化时唤醒；隐藏时只取消调度。 */
    invalidate() {
      if (stopped) return
      nextFrameAt = undefined
      scheduledMode = undefined
      if (mode(platform.now()) === 'paused') {
        cancelPending()
        return
      }
      // 多次 prop 更新合并到已有帧，预览每帧更新时间时也不会不断取消而饿死渲染。
      if (timer !== undefined) platform.clearTimer(timer)
      timer = undefined
      if (frame === undefined) request()
    },
    stop() {
      stopped = true
      cancelPending()
    }
  }
}
