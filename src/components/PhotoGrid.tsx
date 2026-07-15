import { useRef, useState } from 'react'
import { photoUrl } from '../api'

interface Props {
  photoIds: string[]
  onReorder: (ids: string[]) => void
  onOpen: (index: number) => void
}

/**
 * Fotoraster (4 per rij) waarin je foto's kunt herordenen door te slepen.
 * Werkt met muis én touch via pointer events. Een korte tik (zonder slepen)
 * opent de foto groot; verwijderen kan alleen daar, niet vanuit de thumbnail.
 */
export function PhotoGrid({ photoIds, onReorder, onOpen }: Props) {
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const itemRefs = useRef<(HTMLDivElement | null)[]>([])
  const startPos = useRef<{ x: number; y: number } | null>(null)
  const moved = useRef(false)
  // Actuele volgorde los bijhouden: parent-state loopt een render achter.
  const orderRef = useRef<string[]>(photoIds)
  orderRef.current = photoIds

  function indexAtPoint(x: number, y: number): number | null {
    for (let i = 0; i < itemRefs.current.length; i++) {
      const el = itemRefs.current[i]
      if (!el) continue
      const r = el.getBoundingClientRect()
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return i
    }
    return null
  }

  function onPointerDown(e: React.PointerEvent, index: number) {
    if (e.button !== 0 && e.pointerType === 'mouse') return
    setDragIndex(index)
    startPos.current = { x: e.clientX, y: e.clientY }
    moved.current = false
    ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
  }

  function onPointerMove(e: React.PointerEvent) {
    if (dragIndex == null || !startPos.current) return
    const dx = e.clientX - startPos.current.x
    const dy = e.clientY - startPos.current.y
    if (!moved.current && Math.hypot(dx, dy) < 8) return
    moved.current = true
    const over = indexAtPoint(e.clientX, e.clientY)
    if (over != null && over !== dragIndex) {
      const next = [...orderRef.current]
      const [item] = next.splice(dragIndex, 1)
      next.splice(over, 0, item)
      orderRef.current = next
      onReorder(next)
      setDragIndex(over)
    }
  }

  function onPointerUp(index: number) {
    // Geen beweging = tik: foto groot openen.
    if (dragIndex != null && !moved.current) onOpen(index)
    setDragIndex(null)
    startPos.current = null
  }

  if (photoIds.length === 0) return null

  return (
    <div className="photo-grid">
      {photoIds.map((pid, i) => (
        <div
          key={pid}
          ref={(el) => (itemRefs.current[i] = el)}
          className={`thumb ${dragIndex === i && moved.current ? 'dragging' : ''}`}
          onPointerDown={(e) => onPointerDown(e, i)}
          onPointerMove={onPointerMove}
          onPointerUp={() => onPointerUp(i)}
          onPointerCancel={() => {
            setDragIndex(null)
            startPos.current = null
          }}
        >
          <img src={photoUrl(pid)} alt="" loading="lazy" draggable={false} />
        </div>
      ))}
    </div>
  )
}
