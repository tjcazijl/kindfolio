import { photoUrl } from '../api'

interface Props {
  photoId: string
  onRemove?: () => void
  onClick?: () => void
}

export function PhotoThumb({ photoId, onRemove, onClick }: Props) {
  return (
    <div className="thumb">
      <img src={photoUrl(photoId)} alt="" loading="lazy" onClick={onClick} />
      {onRemove && (
        <button
          type="button"
          className="thumb-remove"
          onClick={onRemove}
          aria-label="Foto verwijderen"
        >
          ×
        </button>
      )}
    </div>
  )
}
