import React, { useEffect, useRef, useState } from 'react'
import PetOfficial, { type OfficialPetAssets } from '../pet/PetOfficial'
import { PET_ANIMATION_MS, type PetAnimation } from '../pet/petMotion'

const labels = { bounce: '高兴跳', howl: '嗷呜吼叫', cheer: '拜年' } as const
const notes = {
  bounce: '蓄力后连续两跳：蹬地展开、空中收爪，落地压低后马上再起。',
  howl: '先伏身低头，再抬头张嘴，最后收势。',
  cheer: '后脚支撑站起，前爪收在胸前作揖。'
}
const q = new URLSearchParams(location.search)
const initial = q.get('anim')
const initialAnim = initial === 'bounce' || initial === 'howl' || initial === 'cheer' ? initial : 'cheer'
const rawTime = Number(q.get('time') ?? '1.15')
const initialTime = Number.isFinite(rawTime) ? Math.max(0, rawTime) : 0
const bare = q.get('bare') === '1'
let assets: Promise<OfficialPetAssets> | undefined

async function readTexture(name: string): Promise<string> {
  const response = await fetch('/__pet_preview_assets/' + name)
  if (!response.ok) throw new Error('本机模型或贴图缺失，请先生成随宠素材。')
  const blob = await response.blob()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

function loadPreviewAssets(): Promise<OfficialPetAssets> {
  assets ??= (async () => {
    const response = await fetch('/__pet_preview_assets/pet03.obj')
    if (!response.ok) throw new Error('本机随宠模型缺失，请先生成素材。')
    const [obj, tex, cool, warm] = await Promise.all([
      response.text(), readTexture('pet03_color.png'), readTexture('pet03_cool.png'), readTexture('pet03_warm.png')
    ])
    return { obj, tex, cool, warm }
  })()
  return assets
}

export default function Preview() {
  const [anim, setAnim] = useState<Exclude<PetAnimation, ''>>(initialAnim)
  const [time, setTime] = useState(initialTime)
  const [playing, setPlaying] = useState(false)
  const [angle, setAngle] = useState(0)
  const [ready, setReady] = useState(false)
  const clock = useRef({ time, start: 0 })
  const duration = PET_ANIMATION_MS[anim] / 1000

  useEffect(() => {
    if (!playing || !ready) return
    clock.current = { time, start: performance.now() }
    let raf = 0
    const tick = () => {
      const next = clock.current.time + (performance.now() - clock.current.start) / 1000
      if (next >= duration) { setTime(duration); setPlaying(false); return }
      setTime(next)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
    // time 是播放起点，播放过程中由时钟推进，不重建时钟。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, anim, ready, duration])

  const choose = (next: Exclude<PetAnimation, ''>) => {
    setAnim(next); setTime(0); setPlaying(false)
  }
  const replay = () => { setTime(0); clock.current = { time: 0, start: performance.now() }; setPlaying(true) }
  // 供本地截图管线复用同一渲染器；不另写一套动作示意图。
  if (bare) return <PetOfficial anim={anim} previewTime={time} loadAssets={loadPreviewAssets} width={300} height={340} />
  return <main>
    <header><div><p className="eyebrow">本机动作预览</p><h1>说怪话的三个小动作</h1></div><span className={'status ' + (ready ? 'ready' : '')}>{ready ? '素材已就绪' : '正在读取本机素材…'}</span></header>
    <div className="action-tabs" role="group" aria-label="选择动作">
      {Object.entries(labels).map(([key, label]) => <button key={key} className={anim === key ? 'selected' : ''} onClick={() => choose(key as typeof anim)}>{label}</button>)}
    </div>
    <section className="viewer">
      <div className="stage"><PetOfficial anim={anim} previewTime={time} loadAssets={loadPreviewAssets} width={352} height={424} rotationY={angle} onReady={() => setReady(true)} /><span className="stage-label">放大查看</span></div>
      <div className="side"><h2>{labels[anim]}</h2><p>{notes[anim]}</p><div className="actual"><PetOfficial anim={anim} previewTime={time} loadAssets={loadPreviewAssets} rotationY={angle} /></div><span className="subtle">桌宠实际大小</span></div>
    </section>
    <section className="controls" aria-label="播放控制">
      <div className="row"><button className="primary" disabled={!ready} onClick={replay}>从头播放</button><button disabled={!ready} onClick={() => { if (!playing && time >= duration) setTime(0); setPlaying(!playing) }}>{playing ? '暂停' : '继续'}</button><output aria-live="off">{time.toFixed(2)} / {duration.toFixed(2)} 秒</output></div>
      <label className="timeline">动作进度<input aria-label="动作进度" type="range" min="0" max={duration} step="0.01" value={Math.min(time, duration)} onChange={e => {setPlaying(false); setTime(Number(e.target.value))}} /></label>
      <div className="row"><label>时间（秒）<input aria-label="时间（秒）" type="number" min="0" max={duration} step="0.05" value={Number(time.toFixed(2))} onChange={e=>{setPlaying(false);setTime(Math.max(0,Math.min(duration,Number(e.target.value)||0)))}} /></label><span className="subtle">视角</span>{[[0,'正面'],[Math.PI/4,'斜侧面'],[Math.PI/2,'侧面']].map(([value,label])=><button key={String(label)} className={angle===value?'selected':''} onClick={()=>setAngle(Number(value))}>{label}</button>)}</div>
    </section>
    <footer>© 米哈游版权所有 · 非官方同人作品 · 素材仅从本机读取</footer>
  </main>
}
