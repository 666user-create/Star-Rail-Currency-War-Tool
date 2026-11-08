import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { PetBubbleView } from '@shared/types'
import './styles.css'

function Bubble() {
  const [view, setView] = useState<PetBubbleView>({ content: null, side: 'right', revision: -1 })
  const stack = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const accept = (next: PetBubbleView): void => setView((old) => next.revision >= old.revision ? next : old)
    const unsubscribe = window.api.onBubbleView(accept)
    void window.api.bubbleView().then(accept)
    return unsubscribe
  }, [])

  useLayoutEffect(() => {
    if (!stack.current || !view.content) return
    const element = stack.current
    const measure = (): void => window.api.bubbleMeasure(element.getBoundingClientRect().height, view.revision)
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    measure()
    return () => observer.disconnect()
  }, [view])

  if (!view.content) return null
  const { text } = view.content
  return <div ref={stack} className={`bubble-stack side-${view.side}`}>
    {text && <div className="bubble">{text}</div>}
  </div>
}

const root = createRoot(document.getElementById('root')!)
root.render(<Bubble />)
import.meta.hot?.dispose(() => root.unmount())
