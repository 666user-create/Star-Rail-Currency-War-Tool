/**
 * 稳健版首启向导：每步都等页面状态真的变化了再点下一步。
 * 用法: node scripts/wizard-e2e.cjs <port> <label>
 */
const PORT = process.argv[2] || '9611'
const LABEL = process.argv[3] || 'unknown'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function connect(page) {
  const ws = new WebSocket(page.webSocketDebuggerUrl)
  let id = 0
  const pend = new Map()
  const send = (m, p = {}, t = 30000) =>
    new Promise((res, rej) => {
      const i = ++id
      pend.set(i, { res, rej })
      ws.send(JSON.stringify({ id: i, method: m, params: p }))
      setTimeout(() => {
        if (pend.has(i)) {
          pend.delete(i)
          rej(new Error('timeout ' + m))
        }
      }, t)
    })
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data)
    if (m.id && pend.has(m.id)) {
      const { res, rej } = pend.get(m.id)
      pend.delete(m.id)
      m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result)
    }
  }
  const ready = new Promise((r) => (ws.onopen = r))
  const evaluate = async (expr, awaitPromise = false) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise })
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text || 'eval error')
    return r.result.value
  }
  return { ready, evaluate, close: () => ws.close(), send }
}

async function findPage(pattern, timeoutMs = 90000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const pages = await fetch(`http://127.0.0.1:${PORT}/json`).then((r) => r.json())
      const hit = pages.find((p) => new RegExp(pattern).test(p.url))
      if (hit) return hit
    } catch {}
    await sleep(1500)
  }
  return null
}

const stateExpr = `JSON.stringify({
  buttons: [...document.querySelectorAll('button')].map(b => b.textContent.trim()),
  text: document.body.innerText.slice(0, 300).replace(/\\s+/g, ' ')
})`

async function main() {
  const out = { label: LABEL, ok: false, steps: [], error: null }
  try {
    const wiz = await findPage('wizard', 90000)
    if (!wiz) throw new Error('向导窗口没出现')
    out.steps.push('向导窗口出现')

    const c = connect(wiz)
    await c.ready
    await sleep(2500)

    const s0 = JSON.parse(await c.evaluate(stateExpr))
    out.steps.push('初始按钮: ' + JSON.stringify(s0.buttons))

    // 点击「下一步」直到出现「开始提取模型」
    for (let i = 0; i < 4; i++) {
      const st = JSON.parse(await c.evaluate(stateExpr))
      if (st.buttons.some((b) => /开始提取模型/.test(b))) break
      const next = st.buttons.find((b) => b === '下一步')
      if (!next) throw new Error('找不到「下一步」，当前按钮: ' + JSON.stringify(st.buttons))
      await c.evaluate(
        `(() => { const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='下一步'); b.click(); return true })()`
      )
      // 等按钮集合变化
      const before = JSON.stringify(st.buttons)
      for (let w = 0; w < 20; w++) {
        await sleep(400)
        const cur = JSON.parse(await c.evaluate(stateExpr))
        if (JSON.stringify(cur.buttons) !== before) break
      }
      out.steps.push(`点击下一步 #${i + 1}`)
    }

    const beforeExtract = JSON.parse(await c.evaluate(stateExpr))
    if (!beforeExtract.buttons.some((b) => /开始提取模型/.test(b))) {
      throw new Error('走不到提取步骤，按钮: ' + JSON.stringify(beforeExtract.buttons))
    }
    out.steps.push('已到提取步骤')

    await c.evaluate(
      `(() => { const b=[...document.querySelectorAll('button')].find(x=>/开始提取模型/.test(x.textContent)); b.click(); return true })()`
    )
    out.steps.push('已点击开始提取模型')

    // 等完成（最长 6 分钟）
    let done = false
    let lastTail = ''
    const t0 = Date.now()
    while (Date.now() - t0 < 360000) {
      await sleep(5000)
      const st = JSON.parse(
        await c.evaluate(
          `(() => { const t=document.body.innerText; return JSON.stringify({
            done: /一切就绪/.test(t),
            err: /失败|错误|找不到随宠/.test(t),
            tail: t.slice(-120).replace(/\\s+/g,' ')
          }) })()`
        )
      )
      if (st.tail !== lastTail) {
        lastTail = st.tail
        out.steps.push(`[${Math.round((Date.now() - t0) / 1000)}s] ` + st.tail.slice(-80))
      }
      if (st.done) {
        done = true
        break
      }
      if (st.err) throw new Error('提取报错: ' + st.tail.slice(-160))
    }
    if (!done) throw new Error('提取超时 6 分钟')
    out.steps.push('✅ 提取完成')
    c.close()

    // 点开始使用
    const stillWiz = await findPage('wizard', 15000)
    if (stillWiz) {
      const c2 = connect(stillWiz)
      await c2.ready
      await c2.evaluate(
        `(() => { const b=[...document.querySelectorAll('button')].find(x=>/开始使用/.test(x.textContent)); if(b){b.click();return true} return false })()`
      )
      c2.close()
      out.steps.push('已点击开始使用')
    }

    // 等桌宠
    const pet = await findPage('pet\\.html', 90000)
    if (!pet) throw new Error('桌宠窗口没出现')
    out.steps.push('桌宠窗口出现')

    const pc = connect(pet)
    await pc.ready
    await sleep(3500)
    const model = JSON.parse(
      await pc.evaluate(
        `(async()=>{const o=await window.api.officialModel();return JSON.stringify({hasModel:!!o})})()`,
        true
      )
    )
    if (!model.hasModel) throw new Error('桌宠未加载官方模型')
    out.steps.push('✅ 官方模型加载成功')

    // 桌宠截图
    const shot = await pc.send('Page.captureScreenshot', { format: 'png' })
    const fs = require('fs')
    fs.writeFileSync(`D:\\CW-Publish-Verify\\${LABEL}-pet.png`, Buffer.from(shot.data, 'base64'))
    out.steps.push('桌宠截图已保存')
    pc.close()

    // 面板
    const panel = await findPage('panel\\.html', 30000)
    if (panel) {
      const pn = connect(panel)
      await pn.ready
      await sleep(2000)
      const h = JSON.parse(
        await pn.evaluate(
          `JSON.stringify({ root: !!document.getElementById('root'), snippet: document.body.innerText.slice(0,40).replace(/\\s+/g,' ') })`
        )
      )
      out.steps.push('面板: ' + JSON.stringify(h))
      pn.close()
    } else {
      out.steps.push('面板未自动打开（正常）')
    }

    out.ok = true
  } catch (e) {
    out.error = e.message
  }
  console.log(JSON.stringify(out, null, 1))
}

main()
