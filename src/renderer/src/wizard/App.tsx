import React, { useEffect, useState } from 'react'

type ProgressEvent = { line: string; percent: number }

export default function App() {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1)
  const [gamePath, setGamePath] = useState('')
  const [screenshotDir, setScreenshotDir] = useState('')
  const [detected, setDetected] = useState<{ path: string | null; message: string } | null>(null)
  const [detecting, setDetecting] = useState(false)
  const [extracting, setExtracting] = useState(false)
  const [percent, setPercent] = useState(0)
  const [logLines, setLogLines] = useState<string[]>([])
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  // 打开时自动探测游戏路径
  useEffect(() => {
    void detect()
    void window.api.currentScreenshotDir().then(setScreenshotDir).catch(() => {})
  }, [])

  // 订阅解包进度
  useEffect(() => {
    const off = window.api.onWizardProgress((event: ProgressEvent) => {
      setPercent(event.percent)
      setLogLines((prev) => [...prev.slice(-120), event.line])
    })
    return off
  }, [])

  const detect = async () => {
    setDetecting(true)
    setError('')
    try {
      const result = await window.api.detectGamePath()
      setDetected(result)
      if (result.path) setGamePath(result.path)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '自动探测失败，请手动选择')
    } finally { setDetecting(false) }
  }

  const pickGame = async () => {
    const picked = await window.api.pickGamePath()
    if (picked) setGamePath(picked)
  }

  const pickScreenshot = async () => {
    const picked = await window.api.pickScreenshotDir()
    if (picked) setScreenshotDir(picked)
  }

  const startExtract = async () => {
    setStep(3)
    setExtracting(true)
    setError('')
    setLogLines([])
    setPercent(0)
    try {
      await window.api.runExtraction(gamePath)
      setDone(true)
      setStep(4)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '解包失败')
    } finally { setExtracting(false) }
  }

  const finish = async () => {
    await window.api.completeWizard({ gamePath, screenshotDir })
    window.close()
  }

  const canNext1 = gamePath.trim().length > 0

  return (
    <div className="wizard">
      <header className="wizard-head">
        <div className="brand">
          <span className="logo">◆</span>
          <div>
            <h1>货币战争桌宠</h1>
            <p>首次设置 · 大约 1 分钟</p>
          </div>
        </div>
        <div className="steps">
          <span className={step >= 1 ? 'on' : ''}>1 游戏路径</span>
          <span className={step >= 2 ? 'on' : ''}>2 截图位置</span>
          <span className={step >= 3 ? 'on' : ''}>3 提取模型</span>
        </div>
      </header>

      {step === 1 && (
        <section className="pane">
          <h2>游戏装在哪里？</h2>
          <p className="hint">用于「货币战争启动!」按钮，以及从游戏文件里提取随宠模型。只读取，不修改游戏。</p>
          <div className="row">
            <input value={gamePath} onChange={(e) => setGamePath(e.target.value)} placeholder="例如 D:\Star Rail" />
            <button className="ghost" onClick={pickGame} type="button">浏览…</button>
          </div>
          <div className="row">
            <button className="ghost" onClick={detect} disabled={detecting} type="button">
              {detecting ? '正在探测…' : '自动探测'}
            </button>
            {detected && <span className={detected.path ? 'ok' : 'warn'}>{detected.message}</span>}
          </div>
          {error && <div className="err">{error}</div>}
          <footer className="foot">
            <button className="primary" disabled={!canNext1} onClick={() => setStep(2)}>下一步</button>
          </footer>
        </section>
      )}

      {step === 2 && (
        <section className="pane">
          <h2>截图存在哪里？</h2>
          <p className="hint">对局结算截图会保存到这个文件夹。之后可在设置里随时更改，改的时候会自动迁移旧图。</p>
          <div className="row">
            <input value={screenshotDir} onChange={(e) => setScreenshotDir(e.target.value)} placeholder="留空 = 默认位置" />
            <button className="ghost" onClick={pickScreenshot} type="button">浏览…</button>
          </div>
          <div className="note">默认位置：应用目录下的 data\screenshots</div>
          <footer className="foot">
            <button className="ghost" onClick={() => setStep(1)}>上一步</button>
            <button className="primary" onClick={() => void startExtract()}>开始提取模型</button>
          </footer>
        </section>
      )}

      {step === 3 && (
        <section className="pane">
          <h2>{done ? '模型提取完成' : '正在提取随宠模型…'}</h2>
          <p className="hint">从你本机的游戏文件中读取「说怪话」的模型与贴图。全部在本机处理，不会上传任何内容。</p>
          <div className="progress"><div className="bar" style={{ width: `${percent}%` }} /><span className="pct">{percent}%</span></div>
          <pre className="log">{logLines.length ? logLines.join('\n') : '准备中…'}</pre>
          {error && <div className="err">{error}</div>}
          {done && (
            <footer className="foot">
              <button className="primary" onClick={() => void finish()}>完成，开始使用</button>
            </footer>
          )}
        </section>
      )}

      {step === 4 && (
        <section className="pane center">
          <div className="big-ok">✓</div>
          <h2>一切就绪</h2>
          <p className="hint">桌宠会出现在屏幕右下角。右键点它可以看到菜单。</p>
          <footer className="foot">
            <button className="primary" onClick={() => void finish()}>开始使用</button>
          </footer>
        </section>
      )}
    </div>
  )
}
