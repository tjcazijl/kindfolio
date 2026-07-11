import { useRef, useState } from 'react'
import { photoUrl } from '../api'
import { Lightbox } from './Lightbox'

// Grote foto('s) in een veeg-carousel; tik om groot te bekijken (lightbox).
export function PhotoCarousel({ photoIds }: { photoIds: string[] }) {
  const [index, setIndex] = useState(0)
  const [lightbox, setLightbox] = useState<number | null>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const multiple = photoIds.length > 1

  function onScroll() {
    const el = trackRef.current
    if (!el) return
    const i = Math.round(el.scrollLeft / el.clientWidth)
    if (i !== index) setIndex(i)
  }

  return (
    <div className="carousel">
      <div className="carousel-track" ref={trackRef} onScroll={onScroll}>
        {photoIds.map((pid, i) => (
          <div
            key={pid}
            className="carousel-slide"
            onClick={() => setLightbox(i)}
          >
            <img src={photoUrl(pid)} alt="" loading="lazy" />
          </div>
        ))}
      </div>
      {multiple && (
        <>
          <span className="carousel-count">
            {index + 1}/{photoIds.length}
          </span>
          <div className="carousel-dots">
            {photoIds.map((_, i) => (
              <span key={i} className={`dot ${i === index ? 'on' : ''}`} />
            ))}
          </div>
        </>
      )}
      {lightbox != null && (
        <Lightbox
          photoIds={photoIds}
          index={lightbox}
          onIndexChange={setLightbox}
          onClose={() => setLightbox(null)}
        />
      )}
    </div>
  )
}
