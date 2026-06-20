import { useEffect, useRef, useState } from 'react'
import { photoUrl } from '../api'

interface Props {
  photoIds: string[]
  index: number
  busy?: boolean
  onIndexChange: (index: number) => void
  onClose: () => void
  onRotate?: (degrees: 90 | -90) => void
  onDelete?: () => void
}

const MAX_SCALE = 4

function touchDist(touches: React.TouchList): number {
  const a = touches[0]
  const b = touches[1]
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
}

const clamp = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, v))

export function Lightbox({
  photoIds,
  index,
  busy,
  onIndexChange,
  onClose,
  onRotate,
  onDelete,
}: Props) {
  const total = photoIds.length
  const current = photoIds[index]
  const hasMultiple = total > 1

  const [scale, setScale] = useState(1)
  const [tx, setTx] = useState(0)
  const [ty, setTy] = useState(0)
  const zoomed = scale > 1

  const stageRef = useRef<HTMLDivElement>(null)
  const pinch = useRef<{ dist: number; scale: number } | null>(null)
  const pan = useRef<{ x: number; y: number; tx: number; ty: number } | null>(
    null,
  )
  const swipeX = useRef<number | null>(null)
  const lastTap = useRef(0)

  const prev = () => onIndexChange((index - 1 + total) % total)
  const next = () => onIndexChange((index + 1) % total)

  const resetZoom = () => {
    setScale(1)
    setTx(0)
    setTy(0)
  }

  // Zoom resetten bij wisselen van foto of draaien.
  useEffect(resetZoom, [index, current])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowLeft' && hasMultiple && !zoomed) prev()
      else if (e.key === 'ArrowRight' && hasMultiple && !zoomed) next()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, total, zoomed])

  function clampPan(nx: number, ny: number, s: number) {
    const rect = stageRef.current?.getBoundingClientRect()
    const bx = rect ? ((s - 1) * rect.width) / 2 : 0
    const by = rect ? ((s - 1) * rect.height) / 2 : 0
    return { x: clamp(nx, -bx, bx), y: clamp(ny, -by, by) }
  }

  function toggleZoom() {
    if (zoomed) resetZoom()
    else setScale(2.5)
  }

  function onTouchStart(e: React.TouchEvent) {
    if (e.touches.length === 2) {
      pinch.current = { dist: touchDist(e.touches), scale }
      pan.current = null
      swipeX.current = null
    } else if (e.touches.length === 1) {
      const now = Date.now()
      if (now - lastTap.current < 300) {
        toggleZoom()
        lastTap.current = 0
      } else {
        lastTap.current = now
      }
      if (zoomed) {
        pan.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, tx, ty }
      } else {
        swipeX.current = e.touches[0].clientX
      }
    }
  }

  function onTouchMove(e: React.TouchEvent) {
    if (pinch.current && e.touches.length === 2) {
      const ns = clamp(
        (pinch.current.scale * touchDist(e.touches)) / pinch.current.dist,
        1,
        MAX_SCALE,
      )
      setScale(ns)
      if (ns === 1) {
        setTx(0)
        setTy(0)
      }
    } else if (pan.current && e.touches.length === 1 && zoomed) {
      const dx = e.touches[0].clientX - pan.current.x
      const dy = e.touches[0].clientY - pan.current.y
      const { x, y } = clampPan(pan.current.tx + dx, pan.current.ty + dy, scale)
      setTx(x)
      setTy(y)
    }
  }

  function onTouchEnd(e: React.TouchEvent) {
    if (
      !zoomed &&
      hasMultiple &&
      swipeX.current != null &&
      e.changedTouches.length
    ) {
      const dx = e.changedTouches[0].clientX - swipeX.current
      if (dx > 50) prev()
      else if (dx < -50) next()
    }
    pinch.current = null
    pan.current = null
    swipeX.current = null
  }

  if (!current) return null

  return (
    <div className="lightbox" onClick={onClose}>
      <button className="lightbox-close" onClick={onClose} aria-label="Sluiten">
        ×
      </button>

      {hasMultiple && (
        <span className="lightbox-counter" onClick={(e) => e.stopPropagation()}>
          {index + 1} / {total}
        </span>
      )}

      <div
        className="lightbox-stage"
        ref={stageRef}
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={toggleZoom}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {hasMultiple && !zoomed && (
          <button className="lightbox-nav prev" onClick={prev} aria-label="Vorige foto">
            ‹
          </button>
        )}
        <img
          src={photoUrl(current)}
          alt=""
          className="lightbox-img"
          draggable={false}
          style={{ transform: `translate(${tx}px, ${ty}px) scale(${scale})` }}
        />
        {hasMultiple && !zoomed && (
          <button className="lightbox-nav next" onClick={next} aria-label="Volgende foto">
            ›
          </button>
        )}
      </div>

      {(onRotate || onDelete) && (
        <div className="lightbox-bar" onClick={(e) => e.stopPropagation()}>
          {onRotate && (
            <button className="btn ghost lb-btn" disabled={busy} onClick={() => onRotate(-90)}>
              ↺ Links
            </button>
          )}
          {onRotate && (
            <button className="btn ghost lb-btn" disabled={busy} onClick={() => onRotate(90)}>
              ↻ Rechts
            </button>
          )}
          {onDelete && (
            <button className="btn ghost lb-btn danger" disabled={busy} onClick={onDelete}>
              🗑 Verwijderen
            </button>
          )}
        </div>
      )}

      {busy && <div className="lightbox-busy">Bezig…</div>}
    </div>
  )
}
