import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { RecordingChange } from '@shared/types'
import './styles.css'

function elapsedLabel(startedAt: number | null, now: number): string {
  const elapsed = startedAt === null ? 0 : Math.max(0, Math.floor((now - startedAt) / 1000))
  const seconds = String(elapsed % 60).padStart(2, '0')
  const minutes = String(Math.floor(elapsed / 60) % 60).padStart(2, '0')
  return elapsed >= 3600 ? `${String(Math.floor(elapsed / 3600)).padStart(2, '0')}:${minutes}:${seconds}` : `${minutes}:${seconds}`
}

export default function App() {
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [now, setNow] = useState(Date.now)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const pill = useRef<HTMLDivElement>(null)
  const busy = useRef(false)
  const changes = useRef(0)
  const recording = startedAt !== null

  useEffect(() => {
    let disposed = false
    const initialVersion = changes.current
    const unsubscribe = window.api.onRecordingChange((change: RecordingChange) => {
      changes.current++
      setStartedAt(change.startedAt)
      setLoaded(true)
      setError('')
    })
    void window.api.isRecording().then((value) => {
      if (disposed || changes.current !== initialVersion) return
      setStartedAt(value)
      setLoaded(true)
    }).catch(() => {
      if (disposed) return
      setError('暂时无法读取记录状态，请重试')
      setLoaded(true)
    })
    // 兜底：无论 IPC 是否因竞态被丢弃，都要让布局测量跑起来，
    // 否则主进程的 ready 永远是 false，计时表会一直隐藏（重启后"闹钟丢失"）。
    const fallback = setTimeout(() => { if (!disposed) setLoaded(true) }, 1200)
    return () => { disposed = true; clearTimeout(fallback); unsubscribe() }
  }, [])

  useEffect(() => {
    if (startedAt === null) return
    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [startedAt])

  useLayoutEffect(() => {
    const element = pill.current
    if (!loaded || !element) return
    const measure = (): void => {
      const rect = element.getBoundingClientRect()
      window.api.timerShape({ x: rect.x, y: rect.y, width: rect.width, height: rect.height }, startedAt)
    }
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    if (element.parentElement) observer.observe(element.parentElement)
    window.addEventListener('resize', measure)
    measure()
    return () => { observer.disconnect(); window.removeEventListener('resize', measure) }
  }, [loaded, startedAt])

  const toggleRecording = async (): Promise<void> => {
    if (!loaded || busy.current) return
    busy.current = true
    setPending(true)
    setError('')
    const version = changes.current
    try {
      if (recording) {
        await window.api.recordEnd()
        if (changes.current === version) setStartedAt(null)
      } else {
        const value = await window.api.recordStart()
        if (changes.current === version) setStartedAt(value)
      }
    } catch {
      setError('操作失败，请重试')
    } finally {
      busy.current = false
      setPending(false)
    }
  }

  const label = recording ? '结束记录' : '开始记录'
  return <div ref={pill} className={`timer-pill${recording ? ' is-recording' : ''}`}>
    <button type="button" className="timer-button" onClick={() => void toggleRecording()} disabled={!loaded || pending}
      aria-label={error ? `${label}，${error}` : label} title={error || (pending ? '正在处理…' : label)}>
      {recording ? <><span className="stop-icon" /><span className="recording-dot" /></> :
        <svg className="timer-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path className="timer-knob" d="M9 2h6M12 2v3M18 6l1.5-1.5" />
          <circle cx="12" cy="14" r="8" /><path d="M12 9v5l3 1.5" />
        </svg>}
    </button>
    {recording && <span className="timer-readout" aria-label={`已记录 ${elapsedLabel(startedAt, now)}`}>{elapsedLabel(startedAt, now)}</span>}
    <span className="timer-error" role="alert">{error}</span>
  </div>
}
